import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Sitematrix, type FetchLike, type ResponseLike } from "@audiodude/selection-core";

// Not `new URL(rel, import.meta.url)`: happy-dom's global URL rewrites file:
// URLs to http://localhost:3000/@fs/..., which fileURLToPath rejects.
export const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "../../../fixtures");

export function fixtureSitematrix(): Sitematrix {
  const result = Sitematrix.fromJson(
    JSON.parse(readFileSync(join(FIXTURES, "sitematrix.json"), "utf8")),
  );
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

export function readFixtureText(op: string, name: string, file: string): string {
  return readFileSync(join(FIXTURES, op, name, file), "utf8");
}

export function readFixtureBytes(op: string, name: string, file: string): Uint8Array {
  return new Uint8Array(readFileSync(join(FIXTURES, op, name, file)));
}

export function readFixtureJson(op: string, name: string, file: string): any {
  return JSON.parse(readFixtureText(op, name, file));
}

export interface Route {
  /** Substring or pattern matched against the requested URL. */
  match: string | RegExp;
  json?: unknown;
  text?: string;
  status?: number;
}

/** A fetch stub that records every requested URL. */
export type RecordingFetch = FetchLike & { calls: string[] };

/** A FetchLike over fixed routes; unmatched URLs answer 404. */
export function fakeFetch(routes: Route[]): RecordingFetch {
  const calls: string[] = [];
  const fetch = ((url: string) => {
    calls.push(url);
    const route = routes.find((r) =>
      typeof r.match === "string" ? url.includes(r.match) : r.match.test(url),
    );
    if (route === undefined) {
      return Promise.resolve({ ok: false, status: 404, body: null } as ResponseLike);
    }
    const status = route.status ?? 200;
    const payload = route.text ?? JSON.stringify(route.json ?? null);
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(payload));
        controller.close();
      },
    });
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      body,
    } as unknown as ResponseLike);
  }) as RecordingFetch;
  fetch.calls = calls;
  return fetch;
}

/** Drive a Lit-rendered field the way a user would. */
export function setValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  el.value = value;
  el.dispatchEvent(new Event("input"));
}
