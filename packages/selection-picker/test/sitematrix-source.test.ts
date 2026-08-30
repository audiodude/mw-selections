import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, expect, test } from "vitest";
import {
  loadSitematrix,
  resetSitematrixCache,
  SITEMATRIX_URL,
} from "../src/sitematrix-source.js";
import { fakeFetch, FIXTURES } from "./helpers.js";

const sitematrixJson = JSON.parse(readFileSync(join(FIXTURES, "sitematrix.json"), "utf8"));

beforeEach(() => {
  resetSitematrixCache();
});

test("the request URL carries origin=* — meta sends no CORS header without it", () => {
  const url = new URL(SITEMATRIX_URL);
  expect(url.origin).toBe("https://meta.wikimedia.org");
  expect(url.searchParams.get("action")).toBe("sitematrix");
  expect(url.searchParams.get("formatversion")).toBe("2");
  expect(url.searchParams.get("origin")).toBe("*");
});

test("loads and parses the sitematrix, then serves the same promise from cache", async () => {
  const fetch = fakeFetch([{ match: "action=sitematrix", json: sitematrixJson }]);
  const first = await loadSitematrix({ fetch });
  expect(first.ok).toBe(true);
  if (first.ok) expect(first.value.domainFor("enwiki")).toBe("en.wikipedia.org");

  await loadSitematrix({ fetch });
  expect(fetch.calls.length).toBe(1); // one network request per page, not per open()
});

test("a failed load is not cached, so reopening retries", async () => {
  const failing = fakeFetch([{ match: "action=sitematrix", status: 503 }]);
  const failed = await loadSitematrix({ fetch: failing });
  expect(failed.ok).toBe(false);
  if (!failed.ok) expect(failed.error.code).toBe("HTTP_ERROR");

  const working = fakeFetch([{ match: "action=sitematrix", json: sitematrixJson }]);
  const retried = await loadSitematrix({ fetch: working });
  expect(retried.ok).toBe(true);
  expect(working.calls.length).toBe(1);
});

test("a non-sitematrix payload reports the core shape error", async () => {
  const fetch = fakeFetch([{ match: "action=sitematrix", json: { nope: true } }]);
  const result = await loadSitematrix({ fetch });
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error.code).toBe("UPSTREAM_SHAPE");
});
