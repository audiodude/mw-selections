import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { mapPetscan } from "../src/petscan.js";
import { Sitematrix } from "../src/sitematrix.js";

const FIXTURES = fileURLToPath(new URL("../../../fixtures", import.meta.url));
const sm = (() => {
  const r = Sitematrix.fromJson(
    JSON.parse(readFileSync(join(FIXTURES, "sitematrix.json"), "utf8")),
  );
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
})();

function petscanResponse(echoedQuery: string): unknown {
  return {
    n: "result",
    a: { query: echoedQuery },
    "*": [{ n: "combination", a: { type: "subset", "*": [{ id: 22989, title: "Paris", namespace: 0 }] } }],
  };
}

test("dbname from language+project via the sitematrix", () => {
  const result = mapPetscan(
    petscanResponse("https://petscan.wmcloud.org/?language=li&project=wiktionary&format=json"),
    { url: "https://petscan.wmcloud.org/?psid=1", sitematrix: sm },
  );
  expect(result.ok, JSON.stringify(result)).toBe(true);
  if (result.ok) expect(result.value.dbname).toBe("liwiktionary");
});

test("falls back to manual_list_wiki when language/project resolve nothing", () => {
  const result = mapPetscan(
    petscanResponse("https://petscan.wmcloud.org/?manual_list_wiki=enwiki&format=json"),
    { url: "https://petscan.wmcloud.org/?psid=1", sitematrix: sm },
  );
  expect(result.ok, JSON.stringify(result)).toBe(true);
  if (result.ok) expect(result.value.dbname).toBe("enwiki");
});

test("no derivable dbname is an error, never a guess", () => {
  const result = mapPetscan(petscanResponse("https://petscan.wmcloud.org/?format=json"), {
    url: "https://petscan.wmcloud.org/?psid=1",
    sitematrix: sm,
  });
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error.code).toBe("UPSTREAM_SHAPE");
});
