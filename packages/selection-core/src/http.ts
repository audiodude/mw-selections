import { err, ok, type Result } from "./types.js";

/**
 * Minimal structural slice of WHATWG fetch. Declared locally so the package
 * needs neither DOM nor Node type libraries; the real global fetch satisfies
 * it in both runtimes.
 */
export interface ResponseLike {
  ok: boolean;
  status: number;
  body: {
    getReader(): {
      read(): Promise<{ done: boolean; value?: Uint8Array }>;
      cancel(reason?: unknown): unknown;
    };
  } | null;
}

export type FetchLike = (
  url: string,
  init?: { headers?: Record<string, string> },
) => Promise<ResponseLike>;

/** Every fetch adapter accepts an injectable fetch; omitted → global fetch. */
export interface FetchDeps {
  fetch?: FetchLike;
}

/** Tab-safety cap on raw upstream fetches (decision record #9). */
export const MAX_RAW_FETCH_BYTES = 100 * 1024 * 1024;

export function defaultFetch(): FetchLike {
  const f = (globalThis as { fetch?: FetchLike }).fetch;
  if (f === undefined) {
    throw new Error("no global fetch in this runtime; pass { fetch } explicitly");
  }
  return f.bind(globalThis) as FetchLike; // unbound window.fetch throws in some browsers
}

export interface FetchTextOptions {
  headers?: Record<string, string>;
  maxBytes?: number;
}

/** Fetch a body as UTF-8 text, cancelling the stream once it exceeds maxBytes. */
export async function fetchTextCapped(
  fetch: FetchLike,
  url: string,
  opts: FetchTextOptions = {},
): Promise<Result<string>> {
  const maxBytes = opts.maxBytes ?? MAX_RAW_FETCH_BYTES;
  let response: ResponseLike;
  try {
    response = await fetch(url, opts.headers ? { headers: opts.headers } : undefined);
  } catch (e) {
    return err("HTTP_ERROR", `fetch failed for ${url}: ${String(e)}`);
  }
  if (!response.ok) return err("HTTP_ERROR", `HTTP ${response.status} from ${url}`);
  if (response.body === null) return err("HTTP_ERROR", `no response body from ${url}`);

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value !== undefined) {
      total += value.length;
      if (total > maxBytes) {
        void reader.cancel("size cap exceeded");
        return err("PAYLOAD_TOO_LARGE", `response from ${url} exceeded ${maxBytes} bytes`);
      }
      chunks.push(value);
    }
  }
  const buf = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    buf.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return ok(new TextDecoder("utf-8", { fatal: true }).decode(buf));
  } catch {
    return err("UPSTREAM_SHAPE", `response from ${url} is not valid UTF-8`);
  }
}

/** fetchTextCapped + JSON.parse. */
export async function fetchJsonCapped(
  fetch: FetchLike,
  url: string,
  opts: FetchTextOptions = {},
): Promise<Result<unknown>> {
  const text = await fetchTextCapped(fetch, url, opts);
  if (!text.ok) return text;
  try {
    return ok(JSON.parse(text.value) as unknown);
  } catch {
    return err("UPSTREAM_SHAPE", `response from ${url} is not JSON`);
  }
}
