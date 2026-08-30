import { expect, test } from "vitest";
import { ingest, type IngestDeps } from "../src/ingest.js";
import { fakeFetch, fixtureSitematrix, readFixtureBytes, readFixtureJson } from "./helpers.js";

const sitematrix = fixtureSitematrix();
const noNetwork = fakeFetch([]);

function deps(extra: Partial<IngestDeps> = {}): IngestDeps {
  return { sitematrix, fetch: noNetwork, allowlist: [], ...extra };
}

test("manual mode without a project is DBNAME_MISSING, phrased as an instruction", async () => {
  const result = await ingest({ mode: "manual", text: "Paris", dbname: "" }, deps());
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error.code).toBe("DBNAME_MISSING");
    expect(result.error.message).toBe("Choose a Wikimedia project first.");
  }
});

test("a .swiki whose filename names no project prompts for one (SPEC §7.2)", async () => {
  const bytes = readFixtureBytes("tsv-parse", "basic", "input.swiki");

  const missing = await ingest({ mode: "swiki", bytes, filename: "list.tsv" }, deps());
  expect(missing.ok).toBe(false);
  if (!missing.ok) {
    expect(missing.error.code).toBe("DBNAME_MISSING");
    expect(missing.error.message).toMatch(/does not name a project/);
  }

  const supplied = await ingest(
    { mode: "swiki", bytes, filename: "list.tsv", dbname: "enwiki" },
    deps(),
  );
  expect(supplied.ok).toBe(true);
  if (supplied.ok) expect(supplied.value.selection.dbname).toBe("enwiki");
});

test("the filename's dbname wins over the user's choice; it is the file's own fact", async () => {
  const bytes = readFixtureBytes("tsv-parse", "filename-dbname", "input.swiki");
  const result = await ingest(
    { mode: "swiki", bytes, filename: "my-selection.enwiki.tsv", dbname: "dewiki" },
    deps(),
  );
  expect(result.ok).toBe(true);
  if (result.ok) expect(result.value.selection.dbname).toBe("enwiki");
});

test("an upstream dbname outside the allowlist is a hard error", async () => {
  const meta = readFixtureJson("petscan", "manual-list", "meta.json");
  const fetch = fakeFetch([
    { match: "petscan.wmcloud.org", json: readFixtureJson("petscan", "manual-list", "input.json") },
  ]);

  const result = await ingest(
    { mode: "petscan", url: meta.params.url },
    deps({ fetch, allowlist: ["dewiki"] }),
  );

  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error.code).toBe("DBNAME_NOT_ALLOWED");
    expect(result.error.message).toBe(
      "Your URL names en.wikipedia.org, but this page is only configured to accept de.wikipedia.org.",
    );
  }
});

test("caps are enforced on the canonical Selection", async () => {
  const input = { mode: "manual", text: "Paris\nBerlin\nRome", dbname: "enwiki" } as const;

  const items = await ingest(input, deps({ maxItems: 2 }));
  expect(items.ok).toBe(false);
  if (!items.ok) expect(items.error.code).toBe("MAX_ITEMS_EXCEEDED");

  const bytes = await ingest(input, deps({ maxBytes: 16 }));
  expect(bytes.ok).toBe(false);
  if (!bytes.ok) expect(bytes.error.code).toBe("MAX_BYTES_EXCEEDED");

  const within = await ingest(input, deps({ maxItems: 3, maxBytes: 1024 }));
  expect(within.ok).toBe(true);
});

test("upstream failures surface their core code", async () => {
  const result = await ingest(
    { mode: "petscan", url: "https://petscan.wmcloud.org/?psid=1" },
    deps({ fetch: fakeFetch([{ match: "petscan", status: 502 }]) }),
  );
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error.code).toBe("HTTP_ERROR");
});

test("an empty or malformed URL is rejected before any fetch, with input-blaming copy", async () => {
  const fetch = fakeFetch([]);
  const petscan = await ingest({ mode: "petscan", url: "" }, deps({ fetch }));
  expect(petscan.ok).toBe(false);
  if (!petscan.ok) expect(petscan.error.code).toBe("URL_INVALID");

  const quarry = await ingest(
    { mode: "quarry", url: "https://quarry.wmcloud.org/run/7" },
    deps({ fetch }),
  );
  expect(quarry.ok).toBe(false);
  if (!quarry.ok) {
    expect(quarry.error.code).toBe("URL_INVALID");
    expect(quarry.error.message).toMatch(/Quarry query URL/);
  }
  expect(fetch.calls).toEqual([]); // no service was contacted
});
