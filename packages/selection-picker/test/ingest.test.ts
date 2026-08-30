import { expect, test } from "vitest";
import { ingest, type IngestDeps } from "../src/ingest.js";
import {
  fakeFetch,
  fixtureSitematrix,
  readFixtureBytes,
  readFixtureJson,
  readFixtureText,
} from "./helpers.js";

const sitematrix = fixtureSitematrix();

function deps(fetch: IngestDeps["fetch"], extra: Partial<IngestDeps> = {}): IngestDeps {
  return { sitematrix, fetch, allowlist: [], ...extra };
}

/** JSON round-trip: fixture expectations have no undefined-valued keys. */
function plain(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

test("manual text matches the simple/pipeline-basic fixture and carries source.simple", async () => {
  const text = readFixtureText("simple", "pipeline-basic", "input.txt");
  const expected = readFixtureJson("simple", "pipeline-basic", "expected.json");

  const result = await ingest(
    { mode: "manual", text, dbname: "enwiki" },
    deps(fakeFetch([])),
  );

  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(plain(result.value.selection)).toEqual({
    dbname: "enwiki",
    pages: expected.selection.pages,
    source: { type: "simple" },
  });
  expect(result.value.report).toEqual({ ingested: 3, dropped: 0 });
});

test("a .swiki upload matches the tsv-parse/filename-dbname fixture and carries source.swiki", async () => {
  const bytes = readFixtureBytes("tsv-parse", "filename-dbname", "input.swiki");
  const meta = readFixtureJson("tsv-parse", "filename-dbname", "meta.json");
  const expected = readFixtureJson("tsv-parse", "filename-dbname", "expected.json");

  const result = await ingest(
    { mode: "swiki", bytes, filename: meta.params.filename },
    deps(fakeFetch([])),
  );

  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(plain(result.value.selection)).toEqual({
    dbname: expected.selection.dbname,
    pages: expected.selection.pages,
    source: { type: "swiki" },
  });
});

test("a PetScan URL matches the petscan/manual-list fixture", async () => {
  const meta = readFixtureJson("petscan", "manual-list", "meta.json");
  const expected = readFixtureJson("petscan", "manual-list", "expected.json");
  const fetch = fakeFetch([
    { match: "petscan.wmcloud.org", json: readFixtureJson("petscan", "manual-list", "input.json") },
  ]);

  const result = await ingest({ mode: "petscan", url: meta.params.url }, deps(fetch));

  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(plain(result.value.selection)).toEqual(expected.selection);
  expect(result.value.report).toEqual({ ingested: 3, dropped: 0 });
});

test("a SPARQL query matches the sparql/dropped-rows-reported fixture, report included", async () => {
  const meta = readFixtureJson("sparql", "dropped-rows-reported", "meta.json");
  const expected = readFixtureJson("sparql", "dropped-rows-reported", "expected.json");
  const fetch = fakeFetch([
    {
      match: "query.wikidata.org",
      json: readFixtureJson("sparql", "dropped-rows-reported", "input.json"),
    },
  ]);

  const result = await ingest(
    {
      mode: "sparql",
      dbname: meta.params.dbname,
      endpoint: meta.params.endpoint,
      query: meta.params.query,
    },
    deps(fetch),
  );

  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(plain(result.value.selection)).toEqual(expected.selection);
  expect(result.value.report).toEqual(expected.report);
});

test("a Quarry URL matches the quarry/full-columns fixture", async () => {
  const meta = readFixtureJson("quarry", "full-columns", "meta.json");
  const expected = readFixtureJson("quarry", "full-columns", "expected.json");
  const fetch = fakeFetch([
    {
      match: "/query/90210/meta",
      json: {
        latest_run: { id: 7, status: "complete" },
        latest_rev: { query_database: meta.params.database },
      },
    },
    {
      match: "/run/7/output/0/json",
      json: readFixtureJson("quarry", "full-columns", "input.json"),
    },
  ]);

  const result = await ingest({ mode: "quarry", url: meta.params.url }, deps(fetch));

  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(plain(result.value.selection)).toEqual(expected.selection);
});
