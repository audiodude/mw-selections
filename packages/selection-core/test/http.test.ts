import { expect, test } from "vitest";
import { fetchJsonCapped, fetchTextCapped, type FetchLike, type ResponseLike } from "../src/http.js";

const enc = new TextEncoder();

function response(chunks: Uint8Array[], opts: { ok?: boolean; status?: number } = {}): ResponseLike {
  let i = 0;
  let cancelled = false;
  return {
    ok: opts.ok ?? true,
    status: opts.status ?? 200,
    body: {
      getReader: () => ({
        read: async () =>
          cancelled || i >= chunks.length ? { done: true } : { done: false, value: chunks[i++] },
        cancel: () => {
          cancelled = true;
        },
      }),
    },
  };
}

test("reads a streamed body to completion", async () => {
  const fetch: FetchLike = async () => response([enc.encode("hel"), enc.encode("lo")]);
  const result = await fetchTextCapped(fetch, "https://example.org/");
  expect(result).toEqual({ ok: true, value: "hello" });
});

test("aborts with PAYLOAD_TOO_LARGE past the byte cap instead of buffering forever", async () => {
  const chunk = new Uint8Array(1024);
  let reads = 0;
  const fetch: FetchLike = async () => ({
    ok: true,
    status: 200,
    body: {
      getReader: () => ({
        read: async () => {
          reads++;
          return { done: false, value: chunk }; // endless stream
        },
        cancel: () => {},
      }),
    },
  });
  const result = await fetchTextCapped(fetch, "https://example.org/", { maxBytes: 4096 });
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error.code).toBe("PAYLOAD_TOO_LARGE");
  expect(reads).toBeLessThanOrEqual(6); // stopped just past the cap, not at stream end
});

test("non-2xx status becomes HTTP_ERROR", async () => {
  const fetch: FetchLike = async () => response([], { ok: false, status: 503 });
  const result = await fetchTextCapped(fetch, "https://example.org/");
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error.code).toBe("HTTP_ERROR");
});

test("a rejecting fetch becomes HTTP_ERROR, not an exception", async () => {
  const fetch: FetchLike = async () => {
    throw new Error("network down");
  };
  const result = await fetchTextCapped(fetch, "https://example.org/");
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error.code).toBe("HTTP_ERROR");
});

test("invalid UTF-8 body is UPSTREAM_SHAPE", async () => {
  const fetch: FetchLike = async () => response([new Uint8Array([0xff, 0xfe])]);
  const result = await fetchTextCapped(fetch, "https://example.org/");
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error.code).toBe("UPSTREAM_SHAPE");
});

test("non-JSON body is UPSTREAM_SHAPE from fetchJsonCapped", async () => {
  const fetch: FetchLike = async () => response([enc.encode("not json")]);
  const result = await fetchJsonCapped(fetch, "https://example.org/");
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error.code).toBe("UPSTREAM_SHAPE");
});
