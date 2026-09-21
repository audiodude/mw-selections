import { expect, test } from "vitest";
import { ingest } from "../src/ingest.js";
import { fakeFetch, fixtureSitematrix } from "./helpers.js";

const sitematrix = fixtureSitematrix();

function articlePage(page: number, titles: string[], totalPages = 2) {
  return {
    articles: titles.map((article) => ({ article })),
    pagination: { page: String(page), total: 4, total_pages: totalPages },
  };
}

test("loads all pages, deduplicates, and preserves namespace and literal title identity", async () => {
  const fetch = fakeFetch([
    { match: "/Military_history/articles?numRows=500&page=1", json: articlePage(1, ["A title", "Image:A title"]) },
    { match: "/Military_history/articles?numRows=500&page=2", json: articlePage(2, ["A title", "Star Trek: Voyager", "100%25 real"]) },
    { match: "meta=siteinfo", json: { query: {
      namespaces: { "0": { id: 0, name: "" }, "6": { id: 6, name: "File", canonical: "File" } },
      namespacealiases: [{ id: 6, alias: "Image" }],
    } } },
  ]);
  const result = await ingest({ mode: "wikiproject", project: "Military history" }, {
    fetch, sitematrix, allowlist: ["enwiki"],
  });
  expect(result).toEqual({ ok: true, value: {
    selection: {
      dbname: "enwiki",
      pages: ["A_title", ["A_title", null, 6], "Star_Trek:_Voyager", "100%25_real"],
      source: {
        type: "wikiproject", project: "Military history",
        url: "https://api.wp1.openzim.org/v1/projects/Military_history/articles", dynamic: true,
      },
    },
    report: { ingested: 4, dropped: 0 },
  } });
});

test("a later HTTP failure rejects rather than returning the first page", async () => {
  const result = await ingest({ mode: "wikiproject", project: "Test" }, {
    fetch: fakeFetch([
      { match: "page=1", json: articlePage(1, ["First"]) },
      { match: "page=2", status: 503 },
    ]), sitematrix, allowlist: [],
  });
  expect(result).toMatchObject({ ok: false, error: { code: "HTTP_ERROR" } });
});

test("invalid pagination cannot silently truncate a selection", async () => {
  const result = await ingest({ mode: "wikiproject", project: "Test" }, {
    fetch: fakeFetch([{ match: "/articles", json: articlePage(1, ["First"], 0) }]),
    sitematrix, allowlist: [],
  });
  expect(result).toMatchObject({ ok: false, error: { code: "UPSTREAM_SHAPE" } });
});

test("WikiProject selections cannot be relabeled as another wiki", async () => {
  const result = await ingest({ mode: "wikiproject", project: "Test" }, {
    fetch: fakeFetch([]), sitematrix, allowlist: ["dewiki"],
  });
  expect(result).toMatchObject({ ok: false, error: { code: "DBNAME_NOT_ALLOWED" } });
});

test("the item cap applies to the complete project, not individual pages", async () => {
  const result = await ingest({ mode: "wikiproject", project: "Test" }, {
    fetch: fakeFetch([
      { match: "page=1", json: articlePage(1, ["First", "Second"]) },
      { match: "page=2", json: articlePage(2, ["Third", "Fourth"]) },
    ]), sitematrix, allowlist: [], maxItems: 3,
  });
  expect(result).toMatchObject({ ok: false, error: { code: "MAX_ITEMS_EXCEEDED" } });
});
