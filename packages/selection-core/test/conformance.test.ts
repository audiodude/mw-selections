import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { Sitematrix } from "../src/sitematrix.js";
import { normalizeManualText } from "../src/simple.js";
import type { JsonValue, Result } from "../src/types.js";

const FIXTURES = fileURLToPath(new URL("../../../fixtures", import.meta.url));

const sitematrixResult = Sitematrix.fromJson(
  JSON.parse(readFileSync(join(FIXTURES, "sitematrix.json"), "utf8")),
);
if (!sitematrixResult.ok) throw new Error(sitematrixResult.error.message);
const sitematrix = sitematrixResult.value;

interface Meta {
  params?: Record<string, string>;
}

interface Case {
  name: string;
  dir: string;
  meta: Meta;
}

function casesFor(op: string): Case[] {
  const opDir = join(FIXTURES, op);
  return readdirSync(opDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(opDir, d.name, "meta.json")))
    .map((d) => ({
      name: `${op}/${d.name}`,
      dir: join(opDir, d.name),
      meta: JSON.parse(readFileSync(join(opDir, d.name, "meta.json"), "utf8")) as Meta,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Wrap a Result in the expected.json envelope (fixtures/README.md "Result contract"). */
function envelope<T>(result: Result<T>, shape: (value: T) => Record<string, unknown>): unknown {
  return result.ok
    ? { status: "ok", ...shape(result.value) }
    : { status: "error", code: result.error.code };
}

// Grows as operations are implemented (Tasks 3-8). tsv-serialize is handled
// separately below because its ok-cases compare bytes, not JSON.
const SUPPORTED_OPS: string[] = ["simple"];

const runners: Record<string, (c: Case) => unknown> = {
  simple: (c) =>
    envelope(normalizeManualText(readFileSync(join(c.dir, "input.txt"), "utf8")), (v) => ({
      selection: v,
    })),
};

for (const op of SUPPORTED_OPS) {
  describe(op, () => {
    for (const c of casesFor(op)) {
      test(c.name, () => {
        const actual = runners[op]!(c);
        const expected = JSON.parse(readFileSync(join(c.dir, "expected.json"), "utf8"));
        // Round-trip strips undefined-valued keys; object key order is
        // insignificant, page order is significant - toEqual gives both.
        expect(JSON.parse(JSON.stringify(actual))).toEqual(expected);
      });
    }
  });
}

test("fixture discovery finds every operation directory", () => {
  const ops = readdirSync(FIXTURES, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  expect(ops).toEqual([
    "json-parse",
    "petscan",
    "quarry",
    "simple",
    "sparql",
    "tsv-parse",
    "tsv-serialize",
    "validate",
  ]);
});
