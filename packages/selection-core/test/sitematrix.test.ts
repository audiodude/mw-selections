import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { Sitematrix } from "../src/sitematrix.js";

const FIXTURES = fileURLToPath(new URL("../../../fixtures", import.meta.url));

function load(): Sitematrix {
  const result = Sitematrix.fromJson(
    JSON.parse(readFileSync(join(FIXTURES, "sitematrix.json"), "utf8")),
  );
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

test("knows dbnames from language sections and the specials array", () => {
  const sm = load();
  expect(sm.isValidDbname("enwiki")).toBe(true);
  expect(sm.isValidDbname("liwiktionary")).toBe(true);
  expect(sm.isValidDbname("metawiki")).toBe(true); // specials: bare array of sites
  expect(sm.isValidDbname("zzwiki")).toBe(false);
  expect(sm.isValidDbname("count")).toBe(false); // the count key is not a section
});

test("maps dbname to domain and back", () => {
  const sm = load();
  expect(sm.domainFor("enwiki")).toBe("en.wikipedia.org");
  expect(sm.dbnameForDomain("en.wikipedia.org")).toBe("enwiki");
  expect(sm.dbnameForDomain("meta.wikimedia.org")).toBe("metawiki");
  expect(sm.domainFor("zzwiki")).toBeUndefined();
});

test("rejects non-sitematrix input", () => {
  const result = Sitematrix.fromJson({ nope: true });
  expect(result.ok).toBe(false);
});
