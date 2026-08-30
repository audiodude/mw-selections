import { expect, test } from "vitest";
import { proxyFetch } from "../src/proxy-fetch.js";
import { fakeFetch } from "./helpers.js";

test("routes the upstream URL through the host proxy as a url parameter", async () => {
  const inner = fakeFetch([{ match: "proxy.example.org", json: { ok: true } }]);
  const fetch = proxyFetch("https://proxy.example.org/fetch", inner);
  await fetch("https://petscan.wmcloud.org/?psid=123&format=json");
  expect(inner.calls).toEqual([
    "https://proxy.example.org/fetch?url=https%3A%2F%2Fpetscan.wmcloud.org%2F%3Fpsid%3D123%26format%3Djson",
  ]);
});

test("appends to a proxy base that already has a query string", async () => {
  const inner = fakeFetch([{ match: "proxy.example.org", json: {} }]);
  const fetch = proxyFetch("https://proxy.example.org/fetch?key=abc", inner);
  await fetch("https://quarry.wmcloud.org/query/1/meta");
  expect(inner.calls[0]).toBe(
    "https://proxy.example.org/fetch?key=abc&url=https%3A%2F%2Fquarry.wmcloud.org%2Fquery%2F1%2Fmeta",
  );
});

test("passes request headers through unchanged", async () => {
  const seen: Array<Record<string, string> | undefined> = [];
  const fetch = proxyFetch("https://proxy.example.org/fetch", (_url, init) => {
    seen.push(init?.headers);
    return Promise.resolve({ ok: true, status: 200, body: null });
  });
  await fetch("https://query.wikidata.org/sparql", { headers: { Accept: "application/json" } });
  expect(seen).toEqual([{ Accept: "application/json" }]);
});
