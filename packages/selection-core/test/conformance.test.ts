import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
  mapPetscan,
  mapQuarry,
  mapSparql,
  normalizeManualText,
  parseSelectionJson,
  parseTsv,
  serializeTsv,
  Sitematrix,
  validateSelection,
} from "../src/index.js";
import type { JsonValue, Result } from "../src/index.js";

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
const SUPPORTED_OPS: string[] = [
  "json-parse",
  "petscan",
  "quarry",
  "simple",
  "sparql",
  "tsv-parse",
  "validate",
];

const runners: Record<string, (c: Case) => unknown> = {
  simple: (c) =>
    envelope(normalizeManualText(readFileSync(join(c.dir, "input.txt"), "utf8")), (v) => ({
      selection: v,
    })),
  "tsv-parse": (c) => {
    const sidecarPath = join(c.dir, "sidecar.json");
    const sidecar = existsSync(sidecarPath)
      ? (JSON.parse(readFileSync(sidecarPath, "utf8")) as unknown)
      : undefined;
    const filename = c.meta.params?.["filename"];
    return envelope(
      parseTsv(readFileSync(join(c.dir, "input.swiki")), {
        ...(filename !== undefined ? { filename } : {}),
        ...(sidecar !== undefined ? { sidecar: sidecar as JsonValue } : {}),
        sitematrix,
      }),
      (v) => ({ selection: v }),
    );
  },
  "json-parse": (c) =>
    envelope(parseSelectionJson(readFileSync(join(c.dir, "input.json"))), (v) => ({
      selection: v,
    })),
  validate: (c) =>
    envelope(validateSelection(readFileSync(join(c.dir, "input.json")), sitematrix), () => ({})),
  petscan: (c) =>
    envelope(
      mapPetscan(JSON.parse(readFileSync(join(c.dir, "input.json"), "utf8")), {
        url: c.meta.params!["url"]!,
        sitematrix,
      }),
      (v) => ({ selection: v }),
    ),
  sparql: (c) =>
    envelope(
      mapSparql(JSON.parse(readFileSync(join(c.dir, "input.json"), "utf8")), {
        dbname: c.meta.params!["dbname"]!,
        endpoint: c.meta.params!["endpoint"]!,
        query: c.meta.params!["query"]!,
        sitematrix,
      }),
      (v) => ({ selection: v.selection, report: v.report }),
    ),
  quarry: (c) =>
    envelope(
      mapQuarry(JSON.parse(readFileSync(join(c.dir, "input.json"), "utf8")), {
        url: c.meta.params!["url"]!,
        database: c.meta.params!["database"]!,
      }),
      (v) => ({ selection: v }),
    ),
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

describe("tsv-serialize", () => {
  for (const c of casesFor("tsv-serialize")) {
    test(c.name, () => {
      const result = serializeTsv(
        JSON.parse(readFileSync(join(c.dir, "input.json"), "utf8")),
      );
      const expectedSwiki = join(c.dir, "expected.swiki");
      if (existsSync(expectedSwiki)) {
        expect(result.ok, JSON.stringify(result)).toBe(true);
        if (result.ok) {
          // byte-exact comparison (fixtures/README.md "Canonical TSV form")
          expect(Buffer.from(result.value)).toEqual(readFileSync(expectedSwiki));
        }
      } else {
        const expected = JSON.parse(readFileSync(join(c.dir, "expected.json"), "utf8"));
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.code).toBe(expected.code);
      }
    });
  }
});

test("every fixture operation on disk is run by this harness", () => {
  const ops = readdirSync(FIXTURES, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  const covered = [...SUPPORTED_OPS, "tsv-serialize"].sort();
  expect(covered).toEqual(ops);
  expect(ops.flatMap((op) => casesFor(op)).length).toBe(78);
});
