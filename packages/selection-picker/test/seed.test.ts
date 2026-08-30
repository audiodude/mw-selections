import { expect, test } from "vitest";
import type { Selection } from "@audiodude/selection-core";
import { seedState } from "../src/seed.js";

test("a petscan seed reopens the query URL, not the materialized list", () => {
  const seed: Selection = {
    dbname: "enwiki",
    pages: ["Paris"],
    source: { type: "petscan", url: "https://petscan.wmcloud.org/?psid=99", dynamic: true },
  };
  expect(seedState(seed)).toEqual({
    mode: "petscan",
    state: { dbname: "enwiki", petscanUrl: "https://petscan.wmcloud.org/?psid=99" },
    omitted: 0,
  });
});

test("a quarry seed reopens the query URL", () => {
  const seed: Selection = {
    dbname: "enwiki",
    pages: [],
    source: { type: "quarry", url: "https://quarry.wmcloud.org/query/1", dynamic: true },
  };
  expect(seedState(seed)).toEqual({
    mode: "quarry",
    state: { dbname: "enwiki", quarryUrl: "https://quarry.wmcloud.org/query/1" },
    omitted: 0,
  });
});

test("a sparql seed reopens endpoint, query, and project", () => {
  const seed: Selection = {
    dbname: "dewiki",
    pages: ["Berlin"],
    source: {
      type: "sparql",
      endpoint: "https://query.wikidata.org/sparql",
      query: "SELECT ?url {}",
      dynamic: true,
    },
  };
  expect(seedState(seed)).toEqual({
    mode: "sparql",
    state: {
      dbname: "dewiki",
      sparqlEndpoint: "https://query.wikidata.org/sparql",
      sparqlQuery: "SELECT ?url {}",
    },
    omitted: 0,
  });
});

test("simple, swiki, unknown, and absent sources rehydrate as editable title lines", () => {
  const pages: Selection["pages"] = ["Paris", ["Statue_of_Liberty", 28617], ["Talk_x", null, 1]];
  // The id is dropped (lossy but identity-preserving: the title still names
  // the same page); the ns-1 page cannot be expressed as a title line at all
  // and is counted as omitted — never silently re-homed into mainspace.
  const expected = {
    mode: "manual",
    state: { dbname: "enwiki", manualText: "Paris\nStatue_of_Liberty" },
    omitted: 1,
  };

  for (const source of [
    { type: "simple" },
    { type: "swiki" },
    { type: "pagepile", url: "https://pagepile.toolforge.org/api.php?id=1" },
    undefined,
  ]) {
    const seed: Selection =
      source === undefined ? { dbname: "enwiki", pages } : { dbname: "enwiki", pages, source };
    expect(seedState(seed)).toEqual(expected);
  }
});
