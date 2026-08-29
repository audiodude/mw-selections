import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import type { FetchLike } from "../src/http.js";
import { fetchPetscanSelection } from "../src/petscan.js";
import { fetchQuarrySelection } from "../src/quarry.js";
import { fetchSparqlSelection } from "../src/sparql.js";
import { Sitematrix } from "../src/sitematrix.js";

const FIXTURES = fileURLToPath(new URL("../../../fixtures", import.meta.url));
const sitematrix = (() => {
  const r = Sitematrix.fromJson(
    JSON.parse(readFileSync(join(FIXTURES, "sitematrix.json"), "utf8")),
  );
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
})();

interface LoggedRequest {
  url: string;
  headers?: Record<string, string>;
}

/** Route-table fake fetch streaming JSON bodies; logs every request. */
function jsonFetch(routes: Record<string, unknown>, log: LoggedRequest[]): FetchLike {
  return async (url, init) => {
    log.push({ url, ...(init?.headers ? { headers: init.headers } : {}) });
    const doc = routes[url];
    if (doc === undefined) throw new Error(`unrouted URL: ${url}`);
    const bytes = new TextEncoder().encode(JSON.stringify(doc));
    let sent = false;
    return {
      ok: true,
      status: 200,
      body: {
        getReader: () => ({
          read: async () => (sent ? { done: true } : ((sent = true), { done: false, value: bytes })),
          cancel: () => {},
        }),
      },
    };
  };
}

test("petscan: fetches machine-readable output but keeps the user URL in source.url", async () => {
  const userUrl = "https://petscan.wmcloud.org/?psid=12345678";
  const captured = JSON.parse(
    readFileSync(join(FIXTURES, "petscan/manual-list/input.json"), "utf8"),
  );
  const fetchUrl =
    "https://petscan.wmcloud.org/?psid=12345678&format=json&output_compatability=catscan&doit=1";
  const log: LoggedRequest[] = [];
  const result = await fetchPetscanSelection(userUrl, {
    sitematrix,
    fetch: jsonFetch({ [fetchUrl]: captured }, log),
  });
  expect(result.ok, JSON.stringify(result)).toBe(true);
  if (result.ok) {
    expect(result.value.source?.url).toBe(userUrl);
    expect(result.value.dbname).toBe("enwiki");
    expect(result.value.pages.length).toBe(3);
  }
});

test("sparql: sends Api-User-Agent to WDQS only", async () => {
  const captured = JSON.parse(
    readFileSync(join(FIXTURES, "sparql/article-variable/input.json"), "utf8"),
  );
  const query = "SELECT ?article WHERE { ?article schema:isPartOf <https://en.wikipedia.org/> }";
  for (const [endpoint, expectHeader] of [
    ["https://query.wikidata.org/sparql", true],
    ["https://example.org/sparql?key=abc", false], // pre-existing query string survives
  ] as const) {
    const u = new URL(endpoint);
    u.searchParams.set("format", "json");
    u.searchParams.set("query", query);
    const log: LoggedRequest[] = [];
    const result = await fetchSparqlSelection({
      dbname: "enwiki",
      endpoint,
      query,
      sitematrix,
      fetch: jsonFetch({ [u.toString()]: captured }, log),
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    expect(log[0]?.headers?.["Accept"]).toBe("application/sparql-results+json");
    expect(log[0]?.headers?.["Api-User-Agent"] !== undefined).toBe(expectHeader);
  }
});

test("quarry: resolves meta then run output, strips _p, keeps the user URL", async () => {
  const userUrl = "https://quarry.wmcloud.org/query/104907";
  const output = JSON.parse(
    readFileSync(join(FIXTURES, "quarry/full-columns/input.json"), "utf8"),
  );
  const log: LoggedRequest[] = [];
  const result = await fetchQuarrySelection(userUrl, {
    fetch: jsonFetch(
      {
        "https://quarry.wmcloud.org/query/104907/meta": {
          latest_run: { id: 1141735, status: "complete" },
          latest_rev: { query_database: "enwiki_p" },
        },
        "https://quarry.wmcloud.org/run/1141735/output/0/json": output,
      },
      log,
    ),
  });
  expect(result.ok, JSON.stringify(result)).toBe(true);
  if (result.ok) {
    expect(result.value.dbname).toBe("enwiki");
    expect(result.value.source?.url).toBe(userUrl);
  }
  expect(log.map((l) => l.url)).toEqual([
    "https://quarry.wmcloud.org/query/104907/meta",
    "https://quarry.wmcloud.org/run/1141735/output/0/json",
  ]);
});

test("quarry: incomplete latest run is QUARRY_RUN_NOT_READY", async () => {
  const result = await fetchQuarrySelection("https://quarry.wmcloud.org/query/104907", {
    fetch: jsonFetch(
      {
        "https://quarry.wmcloud.org/query/104907/meta": {
          latest_run: { id: 1141736, status: "running" },
          latest_rev: { query_database: "enwiki_p" },
        },
      },
      [],
    ),
  });
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error.code).toBe("QUARRY_RUN_NOT_READY");
});

test("petscan: a non-URL input is UPSTREAM_SHAPE without fetching", async () => {
  const log: LoggedRequest[] = [];
  const result = await fetchPetscanSelection("not a url", {
    sitematrix,
    fetch: jsonFetch({}, log),
  });
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error.code).toBe("UPSTREAM_SHAPE");
  expect(log).toEqual([]);
});

test("sparql: a non-URL endpoint is UPSTREAM_SHAPE without fetching", async () => {
  const log: LoggedRequest[] = [];
  const result = await fetchSparqlSelection({
    dbname: "enwiki",
    endpoint: "not a url",
    query: "SELECT ?url WHERE {}",
    sitematrix,
    fetch: jsonFetch({}, log),
  });
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error.code).toBe("UPSTREAM_SHAPE");
  expect(log).toEqual([]);
});

test("quarry: a non-query URL is UPSTREAM_SHAPE without fetching", async () => {
  const log: LoggedRequest[] = [];
  const result = await fetchQuarrySelection("https://quarry.wmcloud.org/about", {
    fetch: jsonFetch({}, log),
  });
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error.code).toBe("UPSTREAM_SHAPE");
  expect(log).toEqual([]);
});

test("quarry: meta lacking latest_run.id or query_database is UPSTREAM_SHAPE", async () => {
  const result = await fetchQuarrySelection("https://quarry.wmcloud.org/query/104907", {
    fetch: jsonFetch(
      {
        "https://quarry.wmcloud.org/query/104907/meta": { latest_run: { status: "complete" } },
      },
      [],
    ),
  });
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error.code).toBe("UPSTREAM_SHAPE");
});
