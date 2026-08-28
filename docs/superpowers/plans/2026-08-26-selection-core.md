# selection-core Implementation Plan (task 02)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An isomorphic, zero-dependency TypeScript package `packages/selection-core` implementing the Selections spec — parsers, source mappers, serializers, validators — that passes all 77 conformance fixtures.

**Architecture:** Pure functions over a `Result<T>` error model (typed error values, never throws for domain errors). Mappers are pure functions over captured upstream payloads (fixture-testable); network access lives in separate fetch adapters with an injectable `fetch`. The conformance fixture suite in `fixtures/` *is* the primary test suite, driven by one discovery-based vitest harness; a `SUPPORTED_OPS` list grows task by task.

**Tech Stack:** TypeScript 5.9 (strict, ESM), vitest 3, npm workspaces. Zero runtime dependencies. Runs on Node ≥ 18 and evergreen browsers; dev tooling (vitest, `@types/node` ^20) assumes Node ≥ 20.

**Spec:** `docs/SPEC.md` (v1.0.0) is the normative document. `fixtures/README.md` is the harness contract — operation semantics, canonical forms, error-code registry, and the ten fixture pins. `docs/tasks/02-selection-core.md` is the originating task. All three travel with this plan; executors read them.

## Global Constraints

- **All 77 fixture cases pass.** Per-op counts: tsv-parse 21, tsv-serialize 4, json-parse 19, simple 10, petscan 1, sparql 10, quarry 5, validate 7.
- **No DOM (or Node) API references in `src/`**, enforced by `tsconfig.json`: `"lib": ["ES2022"]`, `"types": []`. WHATWG globals present in every supported runtime (`TextDecoder`, `TextEncoder`, `URL`, `URLSearchParams`) are declared minimally in `src/globals.d.ts`.
- **Zero runtime dependencies.** devDependencies only: `typescript`, `vitest`, `@types/node` (tests only).
- **ESM only**: `"type": "module"`, relative imports use `.js` extensions (`./types.js` resolves to `types.ts` under both `tsc` moduleResolution `bundler` and vitest).
- **Error codes**: exactly the fixture registry (16 codes, `fixtures/README.md` "Error code registry") plus four fetch-layer codes documented as non-fixture: `HTTP_ERROR`, `PAYLOAD_TOO_LARGE`, `UPSTREAM_SHAPE`, `QUARRY_RUN_NOT_READY`. Never invent others.
- **Never modify** `fixtures/`, `docs/SPEC.md`, or `scripts/lint_fixtures.py`. Documentation changes are limited to the two READMEs and the task-02 log entry (final task).
- **Branch**: all work on `task-02-selection-core`, created in Task 1. If using a worktree, put it at `./.worktrees/task-02-selection-core` (user convention), not `.claude/worktrees/`.
- **Commits**: repo style is a plain capitalized summary (e.g. `Add conformance fixtures (task 01): …`) — no `feat:` prefixes. Every commit carries the trailer `Co-Authored-By: Claude <noreply@anthropic.com>`.
- **Api-User-Agent** is sent to WDQS (`query.wikidata.org`) only — it is CORS-allowlisted there and unverified elsewhere (decision record #3).
- **100 MB raw-fetch abort** (decision record #9): every upstream fetch streams the body and aborts past `100 * 1024 * 1024` bytes.

### Known spec deviation (document, don't "fix")

SPEC §5.2's TypeScript contract **does not compile** under `strict`: `pages: Item[]` and `source?: Source` are not assignable to the `[key: string]: JsonValue | undefined` index signature (TS2411 — optional tuple elements and optional properties admit `undefined`, which `JsonValue` excludes). Verified with tsc 5.9. The fix (verified compiling): widen the `Selection` index signature to `JsonValue | Item[] | Source | undefined`. The JSON wire shape is identical; this is a candidate spec erratum like the fixture pins, and gets recorded in the task log (Task 10).

---

## File Structure

```
package.json                          root: private, npm workspaces, shared devDeps
.gitignore                            node_modules/
packages/selection-core/
  package.json                        name, ESM, test/typecheck scripts
  tsconfig.json                       the no-DOM enforcement (src only)
  README.md                           public API documentation (Task 10)
  src/
    globals.d.ts                      ambient TextDecoder/TextEncoder/URL/URLSearchParams
    types.ts                          JsonValue, Item, Source, Selection, ErrorCode, Result, ok/err
    items.ts                          canonical item form, uniqueness key, forbidden chars, Deduper
    text.ts                           lenient percent-decode, spaces→underscores
    sitematrix.ts                     Sitematrix: dbname validity, dbname ↔ domain
    simple.ts                         normalizeManualText (§7.1)
    tsv.ts                            parseTsv, serializeTsv (§5.1, §7.2)
    json.ts                           parseSelectionJson, serializeSelectionJson (§5.2), selectionJsonBytes
    validate.ts                       validateSelection (§8)
    petscan.ts                        mapPetscan (§7.3) + fetchPetscanSelection
    sparql.ts                         mapSparql (§7.4) + fetchSparqlSelection
    quarry.ts                         mapQuarry (§7.5) + fetchQuarrySelection
    http.ts                           FetchLike, fetchTextCapped/fetchJsonCapped (100 MB cap)
    index.ts                          public re-exports
  test/
    tsconfig.json                     extends package tsconfig, adds Node types
    items.test.ts                     canonical-form + dedup unit tests
    sitematrix.test.ts                sitematrix unit tests (uses fixtures/sitematrix.json)
    conformance.test.ts               THE fixture harness; SUPPORTED_OPS grows per task
    json-serialize.test.ts            canonical JSON emission unit tests
    petscan-dbname.test.ts            manual_list_wiki fallback unit test
    http.test.ts                      capped-fetch unit tests
    fetchers.test.ts                  fetch-adapter unit tests (fake fetch)
```

Fixture paths inside tests resolve as `new URL("../../../fixtures", import.meta.url)` — `packages/selection-core/test/` → repo root → `fixtures/`.

---

### Task 1: Workspace scaffold, core types, item primitives

**Files:**
- Create: `package.json` (repo root)
- Create: `.gitignore`
- Create: `packages/selection-core/package.json`
- Create: `packages/selection-core/tsconfig.json`
- Create: `packages/selection-core/test/tsconfig.json`
- Create: `packages/selection-core/src/globals.d.ts`
- Create: `packages/selection-core/src/types.ts`
- Create: `packages/selection-core/src/items.ts`
- Test: `packages/selection-core/test/items.test.ts`

**Interfaces:**
- Consumes: nothing (first task).
- Produces (every later task imports these):
  - `types.ts`: `JsonValue`, `Item`, `Source`, `Selection`, `ErrorCode`, `SelectionError`, `Result<T>`, `ok<T>(value: T): Result<T>`, `err(code: ErrorCode, message: string): { ok: false; error: SelectionError }`
  - `items.ts`: `ParsedItem { title: string; id: number | null; ns: number }`, `canonicalItem(it: ParsedItem): Item`, `itemKey(title: string, ns: number): string`, `hasForbiddenChar(field: string): boolean`, `class Deduper { add(it: ParsedItem): boolean }`

- [ ] **Step 1: Branch**

```bash
git checkout -b task-02-selection-core
```

- [ ] **Step 2: Root workspace files**

`package.json` (repo root):

```json
{
  "name": "mw-selections",
  "private": true,
  "type": "module",
  "workspaces": ["packages/*"],
  "scripts": {
    "test": "npm run test --workspaces --if-present",
    "typecheck": "npm run typecheck --workspaces --if-present"
  },
  "devDependencies": {
    "@types/node": "^20.19.0",
    "typescript": "^5.9.2",
    "vitest": "^3.2.0"
  }
}
```

`.gitignore`:

```
node_modules/
.worktrees/
```

- [ ] **Step 3: Package manifest and tsconfigs**

`packages/selection-core/package.json` (`private` until task 04 wires publishing; `exports` points at source so vitest and the future picker workspace resolve it — task 04 repoints it at built output):

```json
{
  "name": "@audiodude/selection-core",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json && tsc -p test/tsconfig.json"
  }
}
```

`packages/selection-core/tsconfig.json` — this file IS the no-DOM acceptance criterion: `lib` has no `DOM`, `types` is empty so `@types/node` never leaks into `src/`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "types": [],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src"]
}
```

`packages/selection-core/test/tsconfig.json` — tests may use Node APIs; `src/globals.d.ts` is excluded so the minimal ambient declarations never mask `@types/node`'s richer ones (harmless today under `skipLibCheck`, a duplicate-identifier trap if that flag is ever dropped):

```json
{
  "extends": "../tsconfig.json",
  "compilerOptions": { "types": ["node"] },
  "include": ["../src", "."],
  "exclude": ["../src/globals.d.ts"]
}
```

- [ ] **Step 4: Ambient globals**

`packages/selection-core/src/globals.d.ts`:

```ts
// Minimal ambient declarations for WHATWG globals that exist in every
// supported runtime (browsers, Node >= 18) but are absent from lib ES2022.
// Keeping lib DOM-free is what enforces this package's zero-DOM guarantee
// at compile time (task 02 acceptance criterion).

declare class TextDecoder {
  constructor(label?: string, options?: { fatal?: boolean });
  decode(input?: Uint8Array | ArrayBuffer): string;
}

declare class TextEncoder {
  encode(input?: string): Uint8Array;
}

declare class URLSearchParams {
  constructor(init?: string);
  get(name: string): string | null;
  set(name: string, value: string): void;
  toString(): string;
}

declare class URL {
  constructor(url: string, base?: string);
  readonly origin: string;
  readonly host: string;
  readonly hostname: string;
  readonly pathname: string;
  search: string;
  readonly searchParams: URLSearchParams;
  toString(): string;
}
```

- [ ] **Step 5: Install**

```bash
npm install
```

Expected: lockfile created, `node_modules/` populated, no errors.

- [ ] **Step 6: Write `src/types.ts`**

The data types follow SPEC §5.2 verbatim **except** the `Selection` index signature — see "Known spec deviation" in Global Constraints (§5.2 as written fails TS2411 under strict; the widened signature below is verified to compile and has the identical JSON wire shape).

```ts
/** Any JSON-serializable value — extras must survive JSON round-tripping. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/**
 * A page entry (SPEC §4.3, §5.2): bare item_title, or a tuple.
 * `id` is null when unknown but namespace_id is present
 * (mirrors the TSV `title\t\tns` case).
 */
export type Item =
  | string
  | [item_title: string, id?: number | null, namespace_id?: number];

/** Provenance descriptor (SPEC §6). The type value space is open. */
export interface Source {
  type: "simple" | "swiki" | "petscan" | "sparql" | "quarry" | (string & {});
  /** For URL-based sources (petscan, quarry). */
  url?: string;
  /** For sparql: the query endpoint, e.g. "https://query.wikidata.org/sparql". */
  endpoint?: string;
  /** For sparql: the query text, verbatim. */
  query?: string;
  /** Re-materialize from the source instead of treating pages as final (SPEC §6.2). */
  dynamic?: boolean;
  [key: string]: JsonValue | undefined;
}

/**
 * SPEC §5.2. The index signature is widened from the spec's
 * `JsonValue | undefined`: the spec's own `pages` and `source` members are
 * not assignable to it under strict TypeScript (TS2411). Same wire shape;
 * candidate spec erratum.
 */
export interface Selection {
  dbname: string;
  pages: Item[];
  source?: Source;
  /** Producers MAY attach additional metadata. */
  [key: string]: JsonValue | Item[] | Source | undefined;
}

/**
 * Machine-readable error codes. The first sixteen are the conformance
 * fixtures' registry (fixtures/README.md) and are load-bearing for the
 * suite; the last four are fetch-layer codes this package adds.
 */
export type ErrorCode =
  | "ENCODING_INVALID"
  | "EMPTY_TITLE"
  | "FIELD_FORBIDDEN_CHAR"
  | "DUPLICATE_ITEM"
  | "TSV_INVALID_ID"
  | "TSV_INVALID_NAMESPACE"
  | "TSV_TOO_MANY_COLUMNS"
  | "SIDECAR_DBNAME_MISSING"
  | "JSON_MALFORMED"
  | "JSON_SHAPE"
  | "ITEM_SHAPE"
  | "DBNAME_MISSING"
  | "DBNAME_INVALID"
  | "SPARQL_NO_VARIABLE"
  | "SPARQL_NO_MATCHING_ROWS"
  | "QUARRY_NO_TITLE_COLUMN"
  // Fetch-layer codes (not part of the fixture registry):
  | "HTTP_ERROR"
  | "PAYLOAD_TOO_LARGE"
  | "UPSTREAM_SHAPE"
  | "QUARRY_RUN_NOT_READY";

export interface SelectionError {
  code: ErrorCode;
  /** Human-readable diagnostics; never asserted by fixtures. */
  message: string;
}

/** Domain errors are values, never exceptions. */
export type Result<T> = { ok: true; value: T } | { ok: false; error: SelectionError };

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function err(code: ErrorCode, message: string): { ok: false; error: SelectionError } {
  return { ok: false, error: { code, message } };
}
```

- [ ] **Step 7: Write the failing items test**

`packages/selection-core/test/items.test.ts` — pins the "Canonical item form" and dedup rules from `fixtures/README.md` at the unit level (the fixtures exercise them only through whole operations):

```ts
import { expect, test } from "vitest";
import { canonicalItem, Deduper, hasForbiddenChar, itemKey } from "../src/items.js";

test("canonical item form: the five spellings", () => {
  // 1. title-only → bare string
  expect(canonicalItem({ title: "Paris", id: null, ns: 0 })).toBe("Paris");
  // 2. title + id, ns 0 → [title, id]
  expect(canonicalItem({ title: "Paris", id: 54321, ns: 0 })).toEqual(["Paris", 54321]);
  // 3. title + id + ns > 0 → [title, id, ns]
  expect(canonicalItem({ title: "T", id: 7, ns: 1 })).toEqual(["T", 7, 1]);
  // 4. title + ns > 0, id unknown → [title, null, ns]
  expect(canonicalItem({ title: "T", id: null, ns: 1 })).toEqual(["T", null, 1]);
});

test("uniqueness key is (title, ns); id is never part of it", () => {
  expect(itemKey("Paris", 0)).toBe(itemKey("Paris", 0));
  expect(itemKey("Paris", 0)).not.toBe(itemKey("Paris", 1));
  const d = new Deduper();
  expect(d.add({ title: "Paris", id: 1, ns: 0 })).toBe(true);
  expect(d.add({ title: "Paris", id: 999, ns: 0 })).toBe(false); // same key, different id → dup
  expect(d.add({ title: "Paris", id: 1, ns: 1 })).toBe(true); // different ns → distinct
});

test("forbidden characters are tab and newline only", () => {
  expect(hasForbiddenChar("a\tb")).toBe(true);
  expect(hasForbiddenChar("a\nb")).toBe(true);
  expect(hasForbiddenChar("a\rb")).toBe(false); // §4.3 names only \t and \n
  expect(hasForbiddenChar("plain")).toBe(false);
});
```

- [ ] **Step 8: Run test to verify it fails**

```bash
npm test -w @audiodude/selection-core
```

Expected: FAIL — cannot resolve `../src/items.js`.

- [ ] **Step 9: Write `src/items.ts`**

```ts
import type { Item } from "./types.js";

/** Internal working form of one item, before canonicalization. */
export interface ParsedItem {
  title: string;
  id: number | null;
  ns: number;
}

/** SPEC §4.3: item fields MUST NOT contain tab or newline. */
export function hasForbiddenChar(field: string): boolean {
  return field.includes("\t") || field.includes("\n");
}

/** SPEC §4.4 uniqueness key: (item_title, namespace_id), absent ns ≡ 0. */
export function itemKey(title: string, ns: number): string {
  return `${ns}:${title}`;
}

/**
 * Canonical item form (fixtures/README.md): title-only → bare string;
 * [title, id]; [title, id, ns > 0]; [title, null, ns > 0]. Never 1-tuples,
 * [title, null], or explicit trailing defaults like [title, id, 0].
 */
export function canonicalItem(it: ParsedItem): Item {
  if (it.ns === 0) return it.id === null ? it.title : [it.title, it.id];
  return [it.title, it.id, it.ns];
}

/** First-occurrence-wins de-duplication (ingestion operations, fixture pin #1). */
export class Deduper {
  private seen = new Set<string>();

  /** Returns true if the item is new (keep it), false if a duplicate (drop it). */
  add(it: ParsedItem): boolean {
    const key = itemKey(it.title, it.ns);
    if (this.seen.has(key)) return false;
    this.seen.add(key);
    return true;
  }
}
```

- [ ] **Step 10: Run tests and typecheck; verify both pass**

```bash
npm test -w @audiodude/selection-core && npm run typecheck -w @audiodude/selection-core
```

Expected: 3 tests PASS; both tsc invocations clean. (`typecheck` failing on missing `src/index.ts` is not possible yet — nothing references it; `include: ["src"]` compiles whatever exists.)

- [ ] **Step 11: Commit**

```bash
git add package.json package-lock.json .gitignore packages/
git commit -m "Scaffold selection-core workspace: spec types, error model, item primitives

Selection's index signature is widened vs SPEC 5.2 - the spec's own
pages/source members fail TS2411 under strict; same wire shape.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: Sitematrix and the conformance harness skeleton

**Files:**
- Create: `packages/selection-core/src/sitematrix.ts`
- Create: `packages/selection-core/test/sitematrix.test.ts`
- Create: `packages/selection-core/test/conformance.test.ts`

**Interfaces:**
- Consumes: `Result`, `ok`, `err` from `./types.js`.
- Produces:
  - `class Sitematrix` with `static fromJson(json: unknown): Result<Sitematrix>`, `isValidDbname(dbname: string): boolean`, `domainFor(dbname: string): string | undefined`, `dbnameForDomain(domain: string): string | undefined`
  - Harness convention: each later task appends its operation name to `SUPPORTED_OPS` in `conformance.test.ts` and adds one entry to the `runners` table. Runners return the `expected.json` envelope shape: `{ status: "ok", ...opShape }` or `{ status: "error", code }`.

- [ ] **Step 1: Write the failing sitematrix test**

`packages/selection-core/test/sitematrix.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -w @audiodude/selection-core
```

Expected: FAIL — cannot resolve `../src/sitematrix.js`.

- [ ] **Step 3: Write `src/sitematrix.ts`**

The sitematrix response shape (SPEC §4.2): `sitematrix` object whose values, skipping `count`, are either a language section (object with a `site` array) or the `specials` value (itself an array of sites). Each site has `dbname` and `url`.

```ts
import { err, ok, type Result } from "./types.js";

interface SiteEntry {
  dbname: string;
  domain: string;
}

/**
 * Wrapper over a meta.wikimedia.org sitematrix response (SPEC §4.2).
 * Used for every dbname-validity check and dbname ↔ domain derivation.
 * Callers load the JSON themselves (the picker fetches it; tests use the
 * shared fixture capture).
 */
export class Sitematrix {
  private byDbname = new Map<string, SiteEntry>();
  private byDomain = new Map<string, SiteEntry>();

  static fromJson(json: unknown): Result<Sitematrix> {
    const root = (json as { sitematrix?: Record<string, unknown> } | null)?.sitematrix;
    if (typeof root !== "object" || root === null) {
      return err("UPSTREAM_SHAPE", "not a sitematrix response");
    }
    const sm = new Sitematrix();
    for (const [key, section] of Object.entries(root)) {
      if (key === "count") continue;
      const sites = Array.isArray(section)
        ? section
        : (section as { site?: unknown[] } | null)?.site;
      if (!Array.isArray(sites)) continue;
      for (const site of sites) {
        const { dbname, url } = site as { dbname?: unknown; url?: unknown };
        if (typeof dbname !== "string" || typeof url !== "string") continue;
        const entry = { dbname, domain: url.replace(/^https?:\/\//, "") };
        sm.byDbname.set(dbname, entry);
        sm.byDomain.set(entry.domain, entry);
      }
    }
    if (sm.byDbname.size === 0) return err("UPSTREAM_SHAPE", "sitematrix has no sites");
    return ok(sm);
  }

  isValidDbname(dbname: string): boolean {
    return this.byDbname.has(dbname);
  }

  /** "enwiki" → "en.wikipedia.org" */
  domainFor(dbname: string): string | undefined {
    return this.byDbname.get(dbname)?.domain;
  }

  /** "en.wikipedia.org" → "enwiki" */
  dbnameForDomain(domain: string): string | undefined {
    return this.byDomain.get(domain)?.dbname;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -w @audiodude/selection-core
```

Expected: PASS (items + sitematrix suites).

- [ ] **Step 5: Write the harness skeleton**

`packages/selection-core/test/conformance.test.ts`. Discovery follows `fixtures/README.md`: a case is any `fixtures/<op>/<case>/` containing `meta.json`; there is no manifest. `SUPPORTED_OPS` is empty now; Tasks 3–8 each add their operation and its `runners` entry. `tsv-serialize` gets its own describe block (byte-exact `expected.swiki` comparison; every other op compares `expected.json` by deep equality).

```ts
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { Sitematrix } from "../src/sitematrix.js";
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
const SUPPORTED_OPS: string[] = [];

const runners: Record<string, (c: Case) => unknown> = {};

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
```

- [ ] **Step 6: Run tests; verify green and case discovery**

```bash
npm test -w @audiodude/selection-core
```

Expected: PASS. The discovery test proves the harness sees all 8 operation directories.

- [ ] **Step 7: Commit**

```bash
git add packages/selection-core
git commit -m "Add Sitematrix and conformance-harness skeleton

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: Manual-text normalization (`simple`, SPEC §7.1)

**Files:**
- Create: `packages/selection-core/src/text.ts`
- Create: `packages/selection-core/src/simple.ts`
- Modify: `packages/selection-core/test/conformance.test.ts` (enable op)

**Interfaces:**
- Consumes: `canonicalItem`, `Deduper`, `hasForbiddenChar` from `./items.js`; `Result`, `ok`, `err`, `Item` from `./types.js`.
- Produces:
  - `text.ts`: `percentDecodeLenient(s: string): string`, `dbStyle(s: string): string` — Task 7 (sparql) reuses both.
  - `simple.ts`: `normalizeManualText(text: string): Result<{ pages: Item[] }>`

- [ ] **Step 1: Enable the op in the harness (the failing test)**

In `test/conformance.test.ts`, change:

```ts
const SUPPORTED_OPS: string[] = ["simple"];
```

and add to `runners` (import `normalizeManualText` from `../src/simple.js` at the top):

```ts
const runners: Record<string, (c: Case) => unknown> = {
  simple: (c) =>
    envelope(normalizeManualText(readFileSync(join(c.dir, "input.txt"), "utf8")), (v) => ({
      selection: v,
    })),
};
```

- [ ] **Step 2: Run to verify 10 failing cases**

```bash
npm test -w @audiodude/selection-core
```

Expected: FAIL — cannot resolve `../src/simple.js`; the `simple` describe block covers 10 cases.

- [ ] **Step 3: Write `src/text.ts`**

Fixture pin #6: percent-decoding never fails — invalid escape sequences pass through verbatim (case `simple/invalid-percent-passthrough`: `100%_Done` stays `100%_Done`).

```ts
const PCT_RUN = /(?:%[0-9A-Fa-f]{2})+/g;

/**
 * Percent-decode, never failing (fixture pin #6): each maximal run of valid
 * %XX escapes is decoded as UTF-8; runs decoding to invalid UTF-8, and bare
 * `%` characters, pass through verbatim.
 */
export function percentDecodeLenient(s: string): string {
  return s.replace(PCT_RUN, (run) => {
    const bytes = new Uint8Array(run.length / 3);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(run.slice(i * 3 + 1, i * 3 + 3), 16);
    }
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      return run;
    }
  });
}

/** db_style: spaces → underscores (SPEC §7.1 step 5, §7.4 rule 5). */
export function dbStyle(s: string): string {
  return s.replaceAll(" ", "_");
}
```

- [ ] **Step 4: Write `src/simple.ts`**

The §7.1 pipeline, in spec order. Manual items are title-only. A line that normalizes to the empty string (e.g. a bare `https://<domain>/wiki/`) is dropped like an empty line — not fixture-covered; documented in the package README (Task 10).

```ts
import { canonicalItem, Deduper, hasForbiddenChar } from "./items.js";
import { dbStyle, percentDecodeLenient } from "./text.js";
import { err, ok, type Result } from "./types.js";
import type { Item } from "./types.js";

const URL_PREFIX = /^https:\/\/[^/]+\/(?:wiki\/|w\/index\.php\?title=)/;

/** SPEC §7.1: normalize manually entered text into title-only items. */
export function normalizeManualText(text: string): Result<{ pages: Item[] }> {
  const dedup = new Deduper();
  const pages: Item[] = [];
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim(); // also strips \r from CRLF input
    if (line === "" || line.startsWith("#")) continue;
    const title = dbStyle(percentDecodeLenient(line.replace(URL_PREFIX, "")));
    if (hasForbiddenChar(title)) {
      return err(
        "FIELD_FORBIDDEN_CHAR",
        `line ${JSON.stringify(line)} normalizes to a title containing tab or newline`,
      );
    }
    if (title === "") continue;
    const item = { title, id: null, ns: 0 };
    if (dedup.add(item)) pages.push(canonicalItem(item));
  }
  return ok({ pages });
}
```

- [ ] **Step 5: Run tests to verify all 10 simple cases pass**

```bash
npm test -w @audiodude/selection-core
```

Expected: PASS, including `simple/only-comments` (zero pages is a valid result, pin #9) and both `forbidden-decoded-*` error cases.

- [ ] **Step 6: Commit**

```bash
git add packages/selection-core
git commit -m "Implement manual-text normalization (SPEC 7.1); 10 simple fixtures pass

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: TSV parse and serialize (SPEC §5.1, §7.2)

**Files:**
- Create: `packages/selection-core/src/tsv.ts`
- Modify: `packages/selection-core/test/conformance.test.ts` (enable `tsv-parse`; add the `tsv-serialize` describe block)

**Interfaces:**
- Consumes: `canonicalItem`, `Deduper`, `hasForbiddenChar`, `ParsedItem` from `./items.js`; `Sitematrix` from `./sitematrix.js`; `Result`, `ok`, `err`, `Item`, `JsonValue`, `Selection` from `./types.js`.
- Produces:
  - `parseTsv(bytes: Uint8Array, opts: ParseTsvOptions): Result<{ dbname?: string; pages: Item[] }>` with `ParseTsvOptions { filename?: string; sidecar?: JsonValue; sitematrix: Sitematrix }`
  - `serializeTsv(selection: Pick<Selection, "pages">): Result<Uint8Array>`

- [ ] **Step 1: Enable both ops in the harness (the failing tests)**

In `test/conformance.test.ts`: import `parseTsv, serializeTsv` from `../src/tsv.js`; set

```ts
const SUPPORTED_OPS: string[] = ["simple", "tsv-parse"];
```

add the runner:

```ts
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
```

and append the byte-exact serialize block after the `SUPPORTED_OPS` loop:

```ts
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
```

- [ ] **Step 2: Run to verify 25 failing cases**

```bash
npm test -w @audiodude/selection-core
```

Expected: FAIL — cannot resolve `../src/tsv.js`; 21 tsv-parse + 4 tsv-serialize cases discovered.

- [ ] **Step 3: Write `src/tsv.ts`**

Behavior pinned by fixtures (README pins #2–#5): empty trailing cells mean absent; final newline optional; blank interior line is `EMPTY_TITLE`; >3 columns is `TSV_TOO_MANY_COLUMNS`; header rows are data (`header-row` fails as `TSV_INVALID_ID` on the non-numeric `id` cell); numeric cells must match `^[0-9]+$`; sidecar beats filename; a sidecar without `dbname` is `SIDECAR_DBNAME_MISSING`; the filename's penultimate dot-segment counts only when it is a known dbname. Canonical serialized rows: `title`, `title\tid`, `title\tid\tns`, `title\t\tns`, every row `\n`-terminated, zero items → zero bytes.

```ts
import { canonicalItem, Deduper, hasForbiddenChar, type ParsedItem } from "./items.js";
import type { Sitematrix } from "./sitematrix.js";
import { err, ok, type Result } from "./types.js";
import type { Item, JsonValue, Selection } from "./types.js";

const DECIMAL = /^[0-9]+$/;

export interface ParseTsvOptions {
  /** Logical name of the uploaded file, e.g. "my-selection.enwiki.tsv". */
  filename?: string;
  /** Parsed contents of an accompanying sidecar JSON, when one was provided. */
  sidecar?: JsonValue;
  sitematrix: Sitematrix;
}

/** Parse .swiki/TSV bytes (SPEC §5.1, §7.2). Ingestion: duplicates collapse, first wins. */
export function parseTsv(
  bytes: Uint8Array,
  opts: ParseTsvOptions,
): Result<{ dbname?: string; pages: Item[] }> {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return err("ENCODING_INVALID", "input is not valid UTF-8");
  }

  const lines = text.split("\n");
  if (lines[lines.length - 1] === "") lines.pop(); // final newline optional; empty file → no rows

  const dedup = new Deduper();
  const pages: Item[] = [];
  for (let i = 0; i < lines.length; i++) {
    const cols = lines[i]!.split("\t");
    if (cols.length > 3) {
      return err("TSV_TOO_MANY_COLUMNS", `row ${i + 1} has ${cols.length} columns`);
    }
    const title = cols[0]!;
    if (title === "") return err("EMPTY_TITLE", `row ${i + 1} has an empty item_title`);
    let id: number | null = null;
    if (cols.length >= 2 && cols[1] !== "") {
      if (!DECIMAL.test(cols[1]!)) {
        return err("TSV_INVALID_ID", `row ${i + 1}: ${JSON.stringify(cols[1])} is not a non-negative integer`);
      }
      id = Number(cols[1]);
    }
    let ns = 0;
    if (cols.length === 3 && cols[2] !== "") {
      if (!DECIMAL.test(cols[2]!)) {
        return err("TSV_INVALID_NAMESPACE", `row ${i + 1}: ${JSON.stringify(cols[2])} is not a non-negative integer`);
      }
      ns = Number(cols[2]);
    }
    const item: ParsedItem = { title, id, ns };
    if (dedup.add(item)) pages.push(canonicalItem(item));
  }

  const dbname = resolveDbname(opts);
  if (!dbname.ok) return dbname;
  return ok(dbname.value === undefined ? { pages } : { dbname: dbname.value, pages });
}

/**
 * dbname side channel (SPEC §5.1, fixture pin #5): an explicit sidecar beats
 * the filename; a sidecar without dbname is an error; the filename's
 * penultimate dot-segment counts only when it is a known dbname; otherwise
 * no dbname is resolved (SPEC §7.2 then requires the ingesting UI to prompt).
 */
function resolveDbname(opts: ParseTsvOptions): Result<string | undefined> {
  if (opts.sidecar !== undefined) {
    const dbname = (opts.sidecar as { dbname?: unknown } | null)?.dbname;
    if (typeof dbname !== "string") {
      return err("SIDECAR_DBNAME_MISSING", "sidecar JSON has no dbname");
    }
    return ok(dbname);
  }
  if (opts.filename !== undefined) {
    const segments = opts.filename.split(".");
    const candidate = segments.length >= 2 ? segments[segments.length - 2]! : undefined;
    if (candidate !== undefined && opts.sitematrix.isValidDbname(candidate)) {
      return ok(candidate);
    }
  }
  return ok(undefined);
}

/** Serialize to canonical TSV bytes (SPEC §5.1; fixtures/README.md "Canonical TSV form"). */
export function serializeTsv(selection: Pick<Selection, "pages">): Result<Uint8Array> {
  let out = "";
  for (const item of selection.pages) {
    let title: string;
    let id: number | null;
    let ns: number;
    if (typeof item === "string") {
      title = item;
      id = null;
      ns = 0;
    } else {
      title = item[0];
      id = item[1] ?? null;
      ns = item[2] ?? 0;
    }
    if (hasForbiddenChar(title)) {
      return err("FIELD_FORBIDDEN_CHAR", `title ${JSON.stringify(title)} contains tab or newline`);
    }
    if (ns !== 0) out += id === null ? `${title}\t\t${ns}\n` : `${title}\t${id}\t${ns}\n`;
    else out += id === null ? `${title}\n` : `${title}\t${id}\n`;
  }
  return ok(new TextEncoder().encode(out));
}
```

- [ ] **Step 4: Run tests to verify all 25 TSV cases pass**

```bash
npm test -w @audiodude/selection-core
```

Expected: PASS — 21 tsv-parse (including `sidecar-precedence`, `filename-dbname-unknown`, `invalid-utf8`) + 4 tsv-serialize (byte-exact `canonical`, zero-byte `empty`, two `FIELD_FORBIDDEN_CHAR` errors).

- [ ] **Step 5: Commit**

```bash
git add packages/selection-core
git commit -m "Implement .swiki/TSV parser and canonical serializer (SPEC 5.1, 7.2)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: JSON parse, structural validator, byte measurement (SPEC §5.2, §8)

**Files:**
- Create: `packages/selection-core/src/json.ts`
- Create: `packages/selection-core/src/validate.ts`
- Create: `packages/selection-core/test/json-serialize.test.ts`
- Modify: `packages/selection-core/test/conformance.test.ts` (enable `json-parse` and `validate`)

**Interfaces:**
- Consumes: `canonicalItem`, `hasForbiddenChar`, `itemKey`, `ParsedItem` from `./items.js`; `Sitematrix` from `./sitematrix.js`; types from `./types.js`.
- Produces:
  - `parseSelectionJson(bytes: Uint8Array | string): Result<Selection>`
  - `serializeSelectionJson(selection: Selection): Result<string>` — canonical JSON emission; the task's "JSON serializer (§5.2)" deliverable
  - `selectionJsonBytes(selection: Selection): number` — the picker's `max-bytes` measurement (task 03 consumes)
  - `validateSelection(bytes: Uint8Array | string, sitematrix: Sitematrix): Result<void>`

- [ ] **Step 1: Enable both ops in the harness (the failing tests)**

In `test/conformance.test.ts`: import `parseSelectionJson` from `../src/json.js` and `validateSelection` from `../src/validate.js`; set

```ts
const SUPPORTED_OPS: string[] = ["json-parse", "simple", "tsv-parse", "validate"];
```

add runners:

```ts
  "json-parse": (c) =>
    envelope(parseSelectionJson(readFileSync(join(c.dir, "input.json"))), (v) => ({
      selection: v,
    })),
  validate: (c) =>
    envelope(validateSelection(readFileSync(join(c.dir, "input.json")), sitematrix), () => ({})),
```

- [ ] **Step 2: Run to verify 26 failing cases**

```bash
npm test -w @audiodude/selection-core
```

Expected: FAIL — unresolved imports; 19 json-parse + 7 validate cases discovered.

- [ ] **Step 3: Write the failing serializer test**

No fixture operation covers JSON emission (json-parse cases only read), so the serializer is pinned at the unit level. `packages/selection-core/test/json-serialize.test.ts`:

```ts
import { expect, test } from "vitest";
import { parseSelectionJson, selectionJsonBytes, serializeSelectionJson } from "../src/json.js";

test("emits canonical item forms, preserving extras and source verbatim", () => {
  const result = serializeSelectionJson({
    dbname: "enwiki",
    pages: ["Bare_title", ["Paris", 54321, 0], ["T", null], ["Talk", null, 1]],
    source: { type: "petscan", url: "https://petscan.wmcloud.org/?psid=1", dynamic: true },
    note: "kept",
  });
  expect(result.ok, JSON.stringify(result)).toBe(true);
  if (result.ok) {
    const doc = JSON.parse(result.value);
    // [title, id, 0] and [title, null] canonicalize away (fixtures "Canonical item form")
    expect(doc.pages).toEqual(["Bare_title", ["Paris", 54321], "T", ["Talk", null, 1]]);
    expect(doc.source).toEqual({
      type: "petscan",
      url: "https://petscan.wmcloud.org/?psid=1",
      dynamic: true,
    });
    expect(doc.note).toBe("kept");
  }
});

test("round-trips through parseSelectionJson", () => {
  const serialized = serializeSelectionJson({ dbname: "enwiki", pages: [["Paris", 54321, 0]] });
  expect(serialized.ok).toBe(true);
  if (serialized.ok) {
    expect(parseSelectionJson(serialized.value)).toEqual({
      ok: true,
      value: { dbname: "enwiki", pages: [["Paris", 54321]] },
    });
  }
});

test("rejects duplicates and forbidden characters instead of repairing", () => {
  const dup = serializeSelectionJson({ dbname: "enwiki", pages: ["A", ["A", 5, 0]] });
  expect(dup.ok).toBe(false);
  if (!dup.ok) expect(dup.error.code).toBe("DUPLICATE_ITEM");
  const bad = serializeSelectionJson({ dbname: "enwiki", pages: ["a\tb"] });
  expect(bad.ok).toBe(false);
  if (!bad.ok) expect(bad.error.code).toBe("FIELD_FORBIDDEN_CHAR");
});

test("selectionJsonBytes measures UTF-8 bytes, not string length", () => {
  const selection = { dbname: "enwiki", pages: ["Café"] };
  const json = JSON.stringify(selection);
  expect(selectionJsonBytes(selection)).toBe(Buffer.byteLength(json, "utf8"));
  expect(Buffer.byteLength(json, "utf8")).toBe(json.length + 1); // é: 2 UTF-8 bytes, 1 code unit
});
```

- [ ] **Step 4: Write `src/json.ts`**

Code assignments pinned by fixtures: not-an-object / no `pages` / `pages` not an array / `dbname` present but not a string → `JSON_SHAPE`; `dbname` absent → `DBNAME_MISSING`; malformed JSON (and non-UTF-8 bytes — json-parse has no encoding code) → `JSON_MALFORMED`; bad tuple shapes and non-integer ids → `ITEM_SHAPE`; empty-string titles → `EMPTY_TITLE`; boundary operations reject duplicates (`DUPLICATE_ITEM`, pin #1). Explicit ns `0` and `[title, null]` canonicalize away. All top-level extras and `source` are preserved verbatim.

```ts
import { canonicalItem, hasForbiddenChar, itemKey, type ParsedItem } from "./items.js";
import { err, ok, type Result } from "./types.js";
import type { Item, Selection } from "./types.js";

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isNonNegativeInteger(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0;
}

/** Parse one pages entry into the internal form. */
function parseItem(entry: unknown, index: number): Result<ParsedItem> {
  const at = `pages[${index}]`;
  if (typeof entry === "string") {
    if (entry === "") return err("EMPTY_TITLE", `${at} is an empty title`);
    if (hasForbiddenChar(entry)) return err("FIELD_FORBIDDEN_CHAR", `${at} contains tab or newline`);
    return ok({ title: entry, id: null, ns: 0 });
  }
  if (!Array.isArray(entry) || entry.length < 1 || entry.length > 3) {
    return err("ITEM_SHAPE", `${at} is not a string or a 1-3 element tuple`);
  }
  const title = entry[0];
  if (typeof title !== "string") return err("ITEM_SHAPE", `${at} title is not a string`);
  if (title === "") return err("EMPTY_TITLE", `${at} is an empty title`);
  if (hasForbiddenChar(title)) return err("FIELD_FORBIDDEN_CHAR", `${at} contains tab or newline`);

  const rawId: unknown = entry.length >= 2 ? entry[1] : null;
  let id: number | null;
  if (rawId === null) id = null;
  else if (isNonNegativeInteger(rawId)) id = rawId;
  else return err("ITEM_SHAPE", `${at} id is not null or a non-negative integer`);

  const rawNs: unknown = entry.length >= 3 ? entry[2] : 0;
  if (!isNonNegativeInteger(rawNs)) {
    return err("ITEM_SHAPE", `${at} namespace_id is not a non-negative integer`);
  }
  return ok({ title, id, ns: rawNs });
}

/** Parse and canonicalize a pages list; boundary semantics: duplicates reject, never repair (pin #1). */
function canonicalizePages(entries: unknown[]): Result<Item[]> {
  const seen = new Set<string>();
  const pages: Item[] = [];
  for (let i = 0; i < entries.length; i++) {
    const parsed = parseItem(entries[i], i);
    if (!parsed.ok) return parsed;
    const key = itemKey(parsed.value.title, parsed.value.ns);
    if (seen.has(key)) {
      return err("DUPLICATE_ITEM", `pages[${i}] duplicates (${parsed.value.title}, ${parsed.value.ns})`);
    }
    seen.add(key);
    pages.push(canonicalItem(parsed.value));
  }
  return ok(pages);
}

/**
 * Boundary parse (SPEC §5.2): pages in canonical item form, duplicates
 * rejected (never repaired, pin #1), all other top-level members and
 * `source` preserved verbatim. dbname must be present and a string; its
 * sitematrix validity is checked only by validateSelection.
 */
export function parseSelectionJson(bytes: Uint8Array | string): Result<Selection> {
  let text: string;
  if (typeof bytes === "string") {
    text = bytes;
  } else {
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      return err("JSON_MALFORMED", "input is not valid UTF-8");
    }
  }
  let doc: unknown;
  try {
    doc = JSON.parse(text) as unknown;
  } catch {
    return err("JSON_MALFORMED", "input is not well-formed JSON");
  }
  if (!isPlainObject(doc)) return err("JSON_SHAPE", "top level is not a single object");
  if (!Array.isArray(doc["pages"])) return err("JSON_SHAPE", "no pages list");
  if (!("dbname" in doc)) return err("DBNAME_MISSING", "no dbname");
  if (typeof doc["dbname"] !== "string") return err("JSON_SHAPE", "dbname is not a string");

  const pages = canonicalizePages(doc["pages"] as unknown[]);
  if (!pages.ok) return pages;
  return ok({ ...(doc as Selection), pages: pages.value });
}

/**
 * The JSON serializer (SPEC §5.2): canonical JSON text. Pages are emitted in
 * canonical item form (never `[title, null]` or explicit trailing defaults
 * like `[title, id, 0]`); malformed items, forbidden characters, and
 * duplicates reject with the same codes as parseSelectionJson (boundary
 * semantics, never repaired). Every other top-level member and `source`
 * serialize verbatim, so parseSelectionJson(serializeSelectionJson(s).value)
 * round-trips.
 */
export function serializeSelectionJson(selection: Selection): Result<string> {
  const pages = canonicalizePages(selection.pages);
  if (!pages.ok) return pages;
  return ok(JSON.stringify({ ...selection, pages: pages.value }));
}

/**
 * UTF-8 byte length of the canonical JSON serialization — the quantity the
 * picker's max-bytes attribute and WP1's 25 MB gate measure (decision
 * record #9). Canonicalize with parseSelectionJson first if the input may
 * hold non-canonical items.
 */
export function selectionJsonBytes(selection: Selection): number {
  return new TextEncoder().encode(JSON.stringify(selection)).length;
}
```

- [ ] **Step 5: Write `src/validate.ts`**

```ts
import { parseSelectionJson } from "./json.js";
import type { Sitematrix } from "./sitematrix.js";
import { err, ok, type Result } from "./types.js";

/**
 * The storing-system structural gate (SPEC §8): accept or reject, never fix.
 * Everything parseSelectionJson checks, plus dbname validity against the
 * sitematrix. Size policy is deliberately not covered — the spec sets no
 * limits; callers enforce their own caps with selectionJsonBytes.
 */
export function validateSelection(
  bytes: Uint8Array | string,
  sitematrix: Sitematrix,
): Result<void> {
  const parsed = parseSelectionJson(bytes);
  if (!parsed.ok) return parsed;
  if (!sitematrix.isValidDbname(parsed.value.dbname)) {
    return err("DBNAME_INVALID", `dbname ${JSON.stringify(parsed.value.dbname)} is not in the sitematrix`);
  }
  return ok(undefined);
}
```

- [ ] **Step 6: Run tests to verify all 26 conformance cases and the json.ts unit tests pass**

```bash
npm test -w @audiodude/selection-core
```

Expected: PASS — 19 json-parse (including `canonical-forms`, `extras-preserved`, `dbname-not-string`→JSON_SHAPE, `item-empty-tuple`→ITEM_SHAPE) + 7 validate (including `unknown-source-type` ok, `dbname-invalid`) + json-serialize.test.ts.

- [ ] **Step 7: Commit**

```bash
git add packages/selection-core
git commit -m "Implement Selection JSON parse, structural gate, byte measurement (SPEC 5.2, 8)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: PetScan mapper (SPEC §7.3)

**Files:**
- Create: `packages/selection-core/src/petscan.ts` (mapper only; the fetch adapter is Task 9)
- Create: `packages/selection-core/test/petscan-dbname.test.ts`
- Modify: `packages/selection-core/test/conformance.test.ts` (enable op)

**Interfaces:**
- Consumes: `canonicalItem`, `Deduper` from `./items.js`; `Sitematrix` from `./sitematrix.js`; types from `./types.js`.
- Produces: `mapPetscan(response: unknown, opts: MapPetscanOptions): Result<Selection>` with `MapPetscanOptions { url: string; sitematrix: Sitematrix }`. Task 9 adds `fetchPetscanSelection` to this same file.

**Input shape** (captured, catscan output compatibility): pages at `response["*"][0].a["*"]`, each `{ title, id, namespace, ... }` (titles already underscore-form; taken verbatim, pin #7); the echoed query URL at `response.a.query` (its param names arrive percent-encoded, e.g. `manual%5Flist%5Fwiki` — `URLSearchParams` decodes them). dbname derives from the echoed query — `language` + `project` via the sitematrix, else `manual_list_wiki` — never from user input.

- [ ] **Step 1: Enable the op in the harness (the failing test)**

In `test/conformance.test.ts`: import `mapPetscan` from `../src/petscan.js`; add `"petscan"` to `SUPPORTED_OPS`; add runner:

```ts
  petscan: (c) =>
    envelope(
      mapPetscan(JSON.parse(readFileSync(join(c.dir, "input.json"), "utf8")), {
        url: c.meta.params!["url"]!,
        sitematrix,
      }),
      (v) => ({ selection: v }),
    ),
```

- [ ] **Step 2: Write the failing dbname-fallback unit test**

The single petscan fixture carries both `language`/`project` and `manual_list_wiki`; the fallback order is a documented contract (`fixtures/README.md` petscan section) that needs its own test. `packages/selection-core/test/petscan-dbname.test.ts`:

```ts
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
```

- [ ] **Step 3: Run to verify failures**

```bash
npm test -w @audiodude/selection-core
```

Expected: FAIL — cannot resolve `../src/petscan.js`; 1 conformance case + 3 unit tests.

- [ ] **Step 4: Write `src/petscan.ts`**

```ts
import { canonicalItem, Deduper } from "./items.js";
import type { Sitematrix } from "./sitematrix.js";
import { err, ok, type Result } from "./types.js";
import type { Selection } from "./types.js";

export interface MapPetscanOptions {
  /** The user's PetScan URL, copied verbatim into source.url. */
  url: string;
  sitematrix: Sitematrix;
}

interface PetscanPage {
  title?: unknown;
  id?: unknown;
  namespace?: unknown;
}

/**
 * SPEC §7.3: map a PetScan JSON response (catscan output compatibility).
 * item_title, id, and namespace_id come from PetScan's per-page fields,
 * titles verbatim (fixture pin #7). The dbname derives from the target wiki
 * PetScan reports in its echoed query — never from user input.
 */
export function mapPetscan(response: unknown, opts: MapPetscanOptions): Result<Selection> {
  const root = response as {
    "*"?: Array<{ a?: { "*"?: unknown } }>;
    a?: { query?: unknown };
  } | null;
  const pagesIn = root?.["*"]?.[0]?.a?.["*"];
  if (!Array.isArray(pagesIn)) return err("UPSTREAM_SHAPE", "no page list in PetScan response");
  const echoed = root?.a?.query;
  if (typeof echoed !== "string") return err("UPSTREAM_SHAPE", "no echoed query in PetScan response");

  const dbname = dbnameFromEchoedQuery(echoed, opts.sitematrix);
  if (!dbname.ok) return dbname;

  const dedup = new Deduper();
  const pages: Selection["pages"] = [];
  for (const page of pagesIn as PetscanPage[]) {
    const { title, id, namespace } = page;
    if (typeof title !== "string" || typeof id !== "number") {
      return err("UPSTREAM_SHAPE", "PetScan page entry lacks title/id");
    }
    const item = { title, id, ns: typeof namespace === "number" ? namespace : 0 };
    if (dedup.add(item)) pages.push(canonicalItem(item));
  }

  return ok({
    dbname: dbname.value,
    pages,
    source: { type: "petscan", url: opts.url, dynamic: true },
  });
}

/**
 * fixtures/README.md petscan: "the echoed query's language/project — via the
 * sitematrix — or manual_list_wiki". URLSearchParams percent-decodes the
 * param names PetScan echoes as manual%5Flist%5Fwiki etc.
 */
function dbnameFromEchoedQuery(query: string, sitematrix: Sitematrix): Result<string> {
  let params: URLSearchParams;
  try {
    params = new URL(query).searchParams;
  } catch {
    return err("UPSTREAM_SHAPE", "PetScan echoed query is not a URL");
  }
  const language = params.get("language");
  const project = params.get("project");
  if (language !== null && project !== null) {
    const dbname = sitematrix.dbnameForDomain(`${language}.${project}.org`);
    if (dbname !== undefined) return ok(dbname);
  }
  const manualListWiki = params.get("manual_list_wiki");
  if (manualListWiki !== null) return ok(manualListWiki);
  return err("UPSTREAM_SHAPE", "cannot derive dbname from PetScan response");
}
```

- [ ] **Step 5: Run tests to verify all pass**

```bash
npm test -w @audiodude/selection-core
```

Expected: PASS — `petscan/manual-list` (order: Paris, Statue_of_Liberty, Talk page; `source.url` is `meta.params.url` verbatim, `dynamic: true`) + the 3 unit tests.

- [ ] **Step 6: Commit**

```bash
git add packages/selection-core
git commit -m "Implement PetScan mapper (SPEC 7.3)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 7: SPARQL mapper (SPEC §7.4)

**Files:**
- Create: `packages/selection-core/src/sparql.ts` (mapper only; fetch adapter is Task 9)
- Modify: `packages/selection-core/test/conformance.test.ts` (enable op)

**Interfaces:**
- Consumes: `canonicalItem`, `Deduper`, `hasForbiddenChar` from `./items.js`; `dbStyle`, `percentDecodeLenient` from `./text.js`; `Sitematrix` from `./sitematrix.js`; types from `./types.js`.
- Produces: `mapSparql(response: unknown, opts: MapSparqlOptions): Result<{ selection: Selection; report: SparqlReport }>` with `MapSparqlOptions { dbname: string; endpoint: string; query: string; sitematrix: Sitematrix }` and `SparqlReport { ingested: number; dropped: number }`. Task 9 adds `fetchSparqlSelection`.

**Semantics** (SPEC §7.4 v1.0.0 + fixtures): projection order is `head.vars` order; `?url` beats `?article` beats a row scan that skips non-identifying rows; per-row values must match `https://<domain>/wiki/<title>` or `https://<domain>/w/index.php?title=<title>`; non-matching rows are dropped and counted; `ingested` counts unique items (= `pages.length`); duplicate keys collapse silently without incrementing `dropped` (pin #1); zero conforming rows → `SPARQL_NO_MATCHING_ROWS`; titles are percent-decoded (leniently, pin #6) with spaces → underscores, title-only.

- [ ] **Step 1: Enable the op in the harness (the failing tests)**

In `test/conformance.test.ts`: import `mapSparql` from `../src/sparql.js`; add `"sparql"` to `SUPPORTED_OPS`; add runner:

```ts
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
```

- [ ] **Step 2: Run to verify 10 failing cases**

```bash
npm test -w @audiodude/selection-core
```

Expected: FAIL — cannot resolve `../src/sparql.js`; 10 sparql cases discovered.

- [ ] **Step 3: Write `src/sparql.ts`**

```ts
import { canonicalItem, Deduper, hasForbiddenChar } from "./items.js";
import type { Sitematrix } from "./sitematrix.js";
import { dbStyle, percentDecodeLenient } from "./text.js";
import { err, ok, type Result } from "./types.js";
import type { Selection } from "./types.js";

export interface MapSparqlOptions {
  /** REQUIRED user input alongside the query (SPEC §7.4 rule 1). */
  dbname: string;
  /** Copied verbatim into source.endpoint. */
  endpoint: string;
  /** Copied verbatim into source.query. */
  query: string;
  sitematrix: Sitematrix;
}

/** §7.4 rule 3 counts: ingested = unique items; dropped = domain-non-matching rows only. */
export interface SparqlReport {
  ingested: number;
  dropped: number;
}

interface SparqlBinding {
  value?: unknown;
}
type SparqlRow = Record<string, SparqlBinding | undefined>;

/** SPEC §7.4: map an application/sparql-results+json document. Title-only items. */
export function mapSparql(
  response: unknown,
  opts: MapSparqlOptions,
): Result<{ selection: Selection; report: SparqlReport }> {
  const domain = opts.sitematrix.domainFor(opts.dbname);
  if (domain === undefined) {
    return err("DBNAME_INVALID", `dbname ${JSON.stringify(opts.dbname)} is not in the sitematrix`);
  }

  const root = response as {
    head?: { vars?: unknown };
    results?: { bindings?: unknown };
  } | null;
  const vars = root?.head?.vars;
  const bindings = root?.results?.bindings;
  if (
    !Array.isArray(vars) ||
    !vars.every((v): v is string => typeof v === "string") ||
    !Array.isArray(bindings)
  ) {
    return err("UPSTREAM_SHAPE", "not a sparql-results+json document");
  }
  const rows = bindings as SparqlRow[];

  const variable = selectVariable(vars, rows, domain);
  if (variable === undefined) {
    return err("SPARQL_NO_VARIABLE", "no projected variable identifies the target project");
  }

  const prefixes = [`https://${domain}/wiki/`, `https://${domain}/w/index.php?title=`];
  const dedup = new Deduper();
  const pages: Selection["pages"] = [];
  let dropped = 0;
  for (const row of rows) {
    const value = row[variable]?.value;
    const prefix =
      typeof value === "string" ? prefixes.find((p) => value.startsWith(p)) : undefined;
    const remainder = prefix === undefined ? "" : (value as string).slice(prefix.length);
    if (remainder === "") {
      dropped++; // §7.4 rule 3: non-matching rows MUST be dropped and counted
      continue;
    }
    const title = dbStyle(percentDecodeLenient(remainder));
    if (hasForbiddenChar(title)) {
      dropped++; // unusable as an item field (§4.3); treated as non-conforming
      continue;
    }
    const item = { title, id: null, ns: 0 };
    if (dedup.add(item)) pages.push(canonicalItem(item)); // dup keys collapse silently (pin #1)
  }
  if (pages.length === 0) return err("SPARQL_NO_MATCHING_ROWS", "zero conforming rows");

  return ok({
    selection: {
      dbname: opts.dbname,
      pages,
      source: { type: "sparql", endpoint: opts.endpoint, query: opts.query, dynamic: true },
    },
    report: { ingested: pages.length, dropped },
  });
}

/**
 * SPEC §7.4 rule 2 (v1.0.0): ?url, then ?article, else scan result rows in
 * order; within a row, examine variables in SELECT projection order
 * (head.vars order); a variable is identified if the row's binding contains
 * the project domain as a substring. Rows identifying no variable are
 * skipped during selection.
 */
function selectVariable(vars: string[], rows: SparqlRow[], domain: string): string | undefined {
  if (vars.includes("url")) return "url";
  if (vars.includes("article")) return "article";
  for (const row of rows) {
    for (const v of vars) {
      const value = row[v]?.value;
      if (typeof value === "string" && value.includes(domain)) return v;
    }
  }
  return undefined;
}
```

- [ ] **Step 4: Run tests to verify all 10 sparql cases pass**

```bash
npm test -w @audiodude/selection-core
```

Expected: PASS — including `url-over-article`, `projection-order-scan` (ingested 3, dropped 2), `scan-skips-leading-rows`, `index-php-url-form`, `title-decoding` ("Café"), `duplicate-rows-collapse`, `no-variable-selected`, `zero-conforming-rows`.

- [ ] **Step 5: Commit**

```bash
git add packages/selection-core
git commit -m "Implement SPARQL results mapper (SPEC 7.4, v1.0.0 row-scan semantics)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 8: Quarry mapper (SPEC §7.5) and full-coverage guard

**Files:**
- Create: `packages/selection-core/src/quarry.ts` (mapper only; fetch adapter is Task 9)
- Modify: `packages/selection-core/test/conformance.test.ts` (enable op; upgrade discovery test)

**Interfaces:**
- Consumes: `canonicalItem`, `Deduper` from `./items.js`; types from `./types.js`.
- Produces: `mapQuarry(response: unknown, opts: MapQuarryOptions): Result<Selection>` with `MapQuarryOptions { url: string; database: string }`. Task 9 adds `fetchQuarrySelection`.

**Semantics** (SPEC §7.5 + pins #7, #8): input is the Quarry output-JSON document `{ headers, rows }` (a `meta` member may be present and is ignored); `page_title`/`page_id`/`page_namespace` columns map to title/id/ns; a single column of any name is a list of titles; multiple columns without `page_title` → `QUARRY_NO_TITLE_COLUMN` with a message instructing `SELECT ... AS page_title`; titles verbatim; `database` comes from Quarry's run metadata with a trailing `_p` stripped.

- [ ] **Step 1: Enable the op and the coverage guard (the failing tests)**

In `test/conformance.test.ts`: import `mapQuarry` from `../src/quarry.js`; add `"quarry"` to `SUPPORTED_OPS` (now all seven JSON-envelope ops); add runner:

```ts
  quarry: (c) =>
    envelope(
      mapQuarry(JSON.parse(readFileSync(join(c.dir, "input.json"), "utf8")), {
        url: c.meta.params!["url"]!,
        database: c.meta.params!["database"]!,
      }),
      (v) => ({ selection: v }),
    ),
```

Upgrade the discovery test so a future fixture operation can never be silently skipped — replace its body with:

```ts
test("every fixture operation on disk is run by this harness", () => {
  const ops = readdirSync(FIXTURES, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  const covered = [...SUPPORTED_OPS, "tsv-serialize"].sort();
  expect(covered).toEqual(ops);
  expect(ops.flatMap((op) => casesFor(op)).length).toBe(77);
});
```

- [ ] **Step 2: Run to verify 5 failing quarry cases**

```bash
npm test -w @audiodude/selection-core
```

Expected: FAIL — cannot resolve `../src/quarry.js`.

- [ ] **Step 3: Write `src/quarry.ts`**

```ts
import { canonicalItem, Deduper } from "./items.js";
import { err, ok, type Result } from "./types.js";
import type { Selection } from "./types.js";

export interface MapQuarryOptions {
  /** The user's Quarry URL, copied verbatim into source.url. */
  url: string;
  /**
   * The run's target database as reported by Quarry's run metadata
   * (query_database); a trailing _p replica suffix is stripped (pin #8).
   */
  database: string;
}

/** SPEC §7.5: map a Quarry output-JSON document (headers + rows). */
export function mapQuarry(response: unknown, opts: MapQuarryOptions): Result<Selection> {
  const root = response as { headers?: unknown; rows?: unknown } | null;
  const headers = root?.headers;
  const rows = root?.rows;
  if (
    !Array.isArray(headers) ||
    !headers.every((h): h is string => typeof h === "string") ||
    !Array.isArray(rows)
  ) {
    return err("UPSTREAM_SHAPE", "not a Quarry output document");
  }

  let titleCol = headers.indexOf("page_title");
  let idCol = -1;
  let nsCol = -1;
  if (titleCol !== -1) {
    idCol = headers.indexOf("page_id");
    nsCol = headers.indexOf("page_namespace");
  } else if (headers.length === 1) {
    titleCol = 0; // §7.5 rule 2: a single column of any name is a list of titles
  } else {
    return err(
      "QUARRY_NO_TITLE_COLUMN",
      "no page_title column; alias one in your query: SELECT ... AS page_title",
    );
  }

  const dedup = new Deduper();
  const pages: Selection["pages"] = [];
  for (const rawRow of rows as unknown[]) {
    const row = Array.isArray(rawRow) ? (rawRow as unknown[]) : [];
    const title = row[titleCol];
    if (typeof title !== "string") return err("UPSTREAM_SHAPE", "page_title cell is not a string");
    const rawId = idCol !== -1 ? row[idCol] : null;
    const rawNs = nsCol !== -1 ? row[nsCol] : 0;
    const item = {
      title,
      id: typeof rawId === "number" ? rawId : null,
      ns: typeof rawNs === "number" ? rawNs : 0,
    };
    if (dedup.add(item)) pages.push(canonicalItem(item));
  }

  return ok({
    dbname: opts.database.replace(/_p$/, ""),
    pages,
    source: { type: "quarry", url: opts.url, dynamic: true },
  });
}
```

- [ ] **Step 4: Run the full suite — all 77 conformance cases must pass**

```bash
npm test -w @audiodude/selection-core
```

Expected: PASS — 5 quarry cases (including `single-column-any-name`, `no-title-column`, `_p` stripping in `full-columns`) and the coverage guard asserting 77 cases across all 8 operations. **This is the task-02 acceptance criterion.**

- [ ] **Step 5: Commit**

```bash
git add packages/selection-core
git commit -m "Implement Quarry mapper (SPEC 7.5); all 77 conformance fixtures pass

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 9: HTTP layer and fetch adapters

**Files:**
- Create: `packages/selection-core/src/http.ts`
- Modify: `packages/selection-core/src/petscan.ts` (append `fetchPetscanSelection`)
- Modify: `packages/selection-core/src/sparql.ts` (append `fetchSparqlSelection`, `API_USER_AGENT`)
- Modify: `packages/selection-core/src/quarry.ts` (append `fetchQuarrySelection`)
- Test: `packages/selection-core/test/http.test.ts`, `packages/selection-core/test/fetchers.test.ts`

**Interfaces:**
- Consumes: the three mappers from Tasks 6–8; `Result`, `ok`, `err` from `./types.js`; `Sitematrix`.
- Produces (task 03's picker calls these):
  - `http.ts`: `ResponseLike`, `FetchLike`, `FetchDeps { fetch?: FetchLike }`, `MAX_RAW_FETCH_BYTES = 100 * 1024 * 1024`, `fetchTextCapped(fetch: FetchLike, url: string, opts?: { headers?: Record<string, string>; maxBytes?: number }): Promise<Result<string>>`, `fetchJsonCapped(...same...): Promise<Result<unknown>>`, `defaultFetch(): FetchLike` (the adapters' internal fallback; exported for callers composing their own fetch pipelines)
  - `fetchPetscanSelection(url: string, opts: { sitematrix: Sitematrix } & FetchDeps): Promise<Result<Selection>>`
  - `fetchSparqlSelection(opts: { dbname: string; endpoint: string; query: string; sitematrix: Sitematrix } & FetchDeps): Promise<Result<{ selection: Selection; report: SparqlReport }>>`
  - `fetchQuarrySelection(url: string, opts?: FetchDeps): Promise<Result<Selection>>`

**Quarry API facts** (verified live 2026-08-26): `GET https://quarry.wmcloud.org/query/<id>/meta` returns `{ query, latest_rev: { query_database, ... }, latest_run: { id, status, ... } }` (`query_database` observed both bare `enwiktionary` and suffixed `enwiki_p`); output JSON is at `GET https://quarry.wmcloud.org/run/<run_id>/output/0/json`, served with `Access-Control-Allow-Origin: *`.

- [ ] **Step 1: Write the failing http tests**

`packages/selection-core/test/http.test.ts`:

```ts
import { expect, test } from "vitest";
import { fetchJsonCapped, fetchTextCapped, type FetchLike, type ResponseLike } from "../src/http.js";

const enc = new TextEncoder();

function response(chunks: Uint8Array[], opts: { ok?: boolean; status?: number } = {}): ResponseLike {
  let i = 0;
  let cancelled = false;
  return {
    ok: opts.ok ?? true,
    status: opts.status ?? 200,
    body: {
      getReader: () => ({
        read: async () =>
          cancelled || i >= chunks.length ? { done: true } : { done: false, value: chunks[i++] },
        cancel: () => {
          cancelled = true;
        },
      }),
    },
  };
}

test("reads a streamed body to completion", async () => {
  const fetch: FetchLike = async () => response([enc.encode("hel"), enc.encode("lo")]);
  const result = await fetchTextCapped(fetch, "https://example.org/");
  expect(result).toEqual({ ok: true, value: "hello" });
});

test("aborts with PAYLOAD_TOO_LARGE past the byte cap instead of buffering forever", async () => {
  const chunk = new Uint8Array(1024);
  let reads = 0;
  const fetch: FetchLike = async () => ({
    ok: true,
    status: 200,
    body: {
      getReader: () => ({
        read: async () => {
          reads++;
          return { done: false, value: chunk }; // endless stream
        },
        cancel: () => {},
      }),
    },
  });
  const result = await fetchTextCapped(fetch, "https://example.org/", { maxBytes: 4096 });
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error.code).toBe("PAYLOAD_TOO_LARGE");
  expect(reads).toBeLessThanOrEqual(6); // stopped just past the cap, not at stream end
});

test("non-2xx status becomes HTTP_ERROR", async () => {
  const fetch: FetchLike = async () => response([], { ok: false, status: 503 });
  const result = await fetchTextCapped(fetch, "https://example.org/");
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error.code).toBe("HTTP_ERROR");
});

test("a rejecting fetch becomes HTTP_ERROR, not an exception", async () => {
  const fetch: FetchLike = async () => {
    throw new Error("network down");
  };
  const result = await fetchTextCapped(fetch, "https://example.org/");
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error.code).toBe("HTTP_ERROR");
});

test("invalid UTF-8 body is UPSTREAM_SHAPE", async () => {
  const fetch: FetchLike = async () => response([new Uint8Array([0xff, 0xfe])]);
  const result = await fetchTextCapped(fetch, "https://example.org/");
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error.code).toBe("UPSTREAM_SHAPE");
});

test("non-JSON body is UPSTREAM_SHAPE from fetchJsonCapped", async () => {
  const fetch: FetchLike = async () => response([enc.encode("not json")]);
  const result = await fetchJsonCapped(fetch, "https://example.org/");
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error.code).toBe("UPSTREAM_SHAPE");
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npm test -w @audiodude/selection-core
```

Expected: FAIL — cannot resolve `../src/http.js`.

- [ ] **Step 3: Write `src/http.ts`**

```ts
import { err, ok, type Result } from "./types.js";

/**
 * Minimal structural slice of WHATWG fetch. Declared locally so the package
 * needs neither DOM nor Node type libraries; the real global fetch satisfies
 * it in both runtimes.
 */
export interface ResponseLike {
  ok: boolean;
  status: number;
  body: {
    getReader(): {
      read(): Promise<{ done: boolean; value?: Uint8Array }>;
      cancel(reason?: unknown): unknown;
    };
  } | null;
}

export type FetchLike = (
  url: string,
  init?: { headers?: Record<string, string> },
) => Promise<ResponseLike>;

/** Every fetch adapter accepts an injectable fetch; omitted → global fetch. */
export interface FetchDeps {
  fetch?: FetchLike;
}

/** Tab-safety cap on raw upstream fetches (decision record #9). */
export const MAX_RAW_FETCH_BYTES = 100 * 1024 * 1024;

export function defaultFetch(): FetchLike {
  const f = (globalThis as { fetch?: FetchLike }).fetch;
  if (f === undefined) {
    throw new Error("no global fetch in this runtime; pass { fetch } explicitly");
  }
  return f.bind(globalThis) as FetchLike; // unbound window.fetch throws in some browsers
}

export interface FetchTextOptions {
  headers?: Record<string, string>;
  maxBytes?: number;
}

/** Fetch a body as UTF-8 text, cancelling the stream once it exceeds maxBytes. */
export async function fetchTextCapped(
  fetch: FetchLike,
  url: string,
  opts: FetchTextOptions = {},
): Promise<Result<string>> {
  const maxBytes = opts.maxBytes ?? MAX_RAW_FETCH_BYTES;
  let response: ResponseLike;
  try {
    response = await fetch(url, opts.headers ? { headers: opts.headers } : undefined);
  } catch (e) {
    return err("HTTP_ERROR", `fetch failed for ${url}: ${String(e)}`);
  }
  if (!response.ok) return err("HTTP_ERROR", `HTTP ${response.status} from ${url}`);
  if (response.body === null) return err("HTTP_ERROR", `no response body from ${url}`);

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value !== undefined) {
      total += value.length;
      if (total > maxBytes) {
        void reader.cancel("size cap exceeded");
        return err("PAYLOAD_TOO_LARGE", `response from ${url} exceeded ${maxBytes} bytes`);
      }
      chunks.push(value);
    }
  }
  const buf = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    buf.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return ok(new TextDecoder("utf-8", { fatal: true }).decode(buf));
  } catch {
    return err("UPSTREAM_SHAPE", `response from ${url} is not valid UTF-8`);
  }
}

/** fetchTextCapped + JSON.parse. */
export async function fetchJsonCapped(
  fetch: FetchLike,
  url: string,
  opts: FetchTextOptions = {},
): Promise<Result<unknown>> {
  const text = await fetchTextCapped(fetch, url, opts);
  if (!text.ok) return text;
  try {
    return ok(JSON.parse(text.value) as unknown);
  } catch {
    return err("UPSTREAM_SHAPE", `response from ${url} is not JSON`);
  }
}
```

- [ ] **Step 4: Run http tests to verify they pass**

```bash
npm test -w @audiodude/selection-core
```

Expected: PASS.

- [ ] **Step 5: Write the failing fetcher tests**

`packages/selection-core/test/fetchers.test.ts`:

```ts
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
```

- [ ] **Step 6: Run to verify the fetcher tests fail**

```bash
npm test -w @audiodude/selection-core
```

Expected: FAIL — `fetchPetscanSelection`, `fetchSparqlSelection`, `fetchQuarrySelection` not exported.

- [ ] **Step 7: Append the fetch adapters**

Append to `src/petscan.ts`:

```ts
import { defaultFetch, fetchJsonCapped, type FetchDeps } from "./http.js";

/**
 * Fetch a PetScan query's JSON output and map it (SPEC §7.3). The fetch URL
 * forces format=json, catscan output compatibility (the shape mapPetscan
 * reads), and doit=1; source.url keeps the user's URL verbatim.
 */
export async function fetchPetscanSelection(
  url: string,
  opts: { sitematrix: Sitematrix } & FetchDeps,
): Promise<Result<Selection>> {
  let fetchUrl: URL;
  try {
    fetchUrl = new URL(url);
  } catch {
    return err("UPSTREAM_SHAPE", `not a URL: ${url}`);
  }
  fetchUrl.searchParams.set("format", "json");
  fetchUrl.searchParams.set("output_compatability", "catscan");
  fetchUrl.searchParams.set("doit", "1");
  const json = await fetchJsonCapped(opts.fetch ?? defaultFetch(), fetchUrl.toString());
  if (!json.ok) return json;
  return mapPetscan(json.value, { url, sitematrix: opts.sitematrix });
}
```

Append to `src/sparql.ts`:

```ts
import { defaultFetch, fetchJsonCapped, type FetchDeps } from "./http.js";

const WDQS_HOSTS = new Set(["query.wikidata.org"]);

export const API_USER_AGENT =
  "selection-core/0.1 (https://github.com/audiodude/mw-selections)";

/**
 * Run a SPARQL query (GET, format=json) and map the results (SPEC §7.4).
 * Api-User-Agent is sent to WDQS only — it is CORS-allowlisted there and
 * unverified elsewhere (decision record #3).
 */
export async function fetchSparqlSelection(
  opts: { dbname: string; endpoint: string; query: string; sitematrix: Sitematrix } & FetchDeps,
): Promise<Result<{ selection: Selection; report: SparqlReport }>> {
  let url: URL;
  try {
    url = new URL(opts.endpoint);
  } catch {
    return err("UPSTREAM_SHAPE", `not a URL: ${opts.endpoint}`);
  }
  const headers: Record<string, string> = { Accept: "application/sparql-results+json" };
  if (WDQS_HOSTS.has(url.host)) headers["Api-User-Agent"] = API_USER_AGENT;
  // searchParams, not string concatenation: an endpoint already carrying a
  // query string (e.g. ...?key=abc) must stay valid.
  url.searchParams.set("format", "json");
  url.searchParams.set("query", opts.query);
  const json = await fetchJsonCapped(opts.fetch ?? defaultFetch(), url.toString(), { headers });
  if (!json.ok) return json;
  return mapSparql(json.value, opts);
}
```

Append to `src/quarry.ts`:

```ts
import { defaultFetch, fetchJsonCapped, type FetchDeps } from "./http.js";

const QUARRY_QUERY_URL = /^https:\/\/([^/]+)\/query\/(\d+)/;

/**
 * Resolve a Quarry query URL to its latest run's output and map it
 * (SPEC §7.5). Verified against the live API 2026-08-26:
 * GET /query/<id>/meta → { latest_rev: { query_database }, latest_run: { id, status } };
 * GET /run/<run_id>/output/0/json → { headers, rows } (ACAO: *).
 */
export async function fetchQuarrySelection(
  url: string,
  opts: FetchDeps = {},
): Promise<Result<Selection>> {
  const match = QUARRY_QUERY_URL.exec(url);
  if (match === null) return err("UPSTREAM_SHAPE", `not a Quarry query URL: ${url}`);
  const host = match[1]!;
  const queryId = match[2]!;
  const fetch = opts.fetch ?? defaultFetch();

  const meta = await fetchJsonCapped(fetch, `https://${host}/query/${queryId}/meta`);
  if (!meta.ok) return meta;
  const m = meta.value as {
    latest_run?: { id?: unknown; status?: unknown };
    latest_rev?: { query_database?: unknown };
  } | null;
  const runId = m?.latest_run?.id;
  const status = m?.latest_run?.status;
  const database = m?.latest_rev?.query_database;
  if (typeof runId !== "number" || typeof database !== "string") {
    return err("UPSTREAM_SHAPE", "Quarry meta lacks latest_run.id or query_database");
  }
  if (status !== "complete") {
    return err("QUARRY_RUN_NOT_READY", `latest Quarry run status is ${String(status)}`);
  }

  const output = await fetchJsonCapped(fetch, `https://${host}/run/${runId}/output/0/json`);
  if (!output.ok) return output;
  return mapQuarry(output.value, { url, database });
}
```

(Move each file's new `import` lines up top with the existing imports — imports must precede other statements.)

- [ ] **Step 8: Run tests and typecheck; verify everything passes**

```bash
npm test -w @audiodude/selection-core && npm run typecheck -w @audiodude/selection-core
```

Expected: PASS — 77 conformance + all unit tests; both tsconfigs clean (proving the fetch layer added no DOM/Node type dependency to `src/`).

- [ ] **Step 9: Commit**

```bash
git add packages/selection-core
git commit -m "Add capped HTTP layer and PetScan/SPARQL/Quarry fetch adapters

100 MB raw-fetch abort; Api-User-Agent sent to WDQS only.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 10: Public API, documentation, final verification

**Files:**
- Create: `packages/selection-core/src/index.ts`
- Create: `packages/selection-core/README.md`
- Modify: `README.md` (repo root — status section)
- Modify: `docs/tasks/02-selection-core.md` (append Log)

**Interfaces:**
- Consumes: everything from Tasks 1–9.
- Produces: the package's public surface — task 03 (`selection-picker`) imports **only** from `@audiodude/selection-core` (i.e. `src/index.ts`), never from deep paths.

- [ ] **Step 1: Write `src/index.ts`**

```ts
export type {
  ErrorCode,
  Item,
  JsonValue,
  Result,
  Selection,
  SelectionError,
  Source,
} from "./types.js";
export { err, ok } from "./types.js";
export { Sitematrix } from "./sitematrix.js";
export { normalizeManualText } from "./simple.js";
export { parseTsv, serializeTsv } from "./tsv.js";
export type { ParseTsvOptions } from "./tsv.js";
export { parseSelectionJson, selectionJsonBytes, serializeSelectionJson } from "./json.js";
export { validateSelection } from "./validate.js";
export { fetchPetscanSelection, mapPetscan } from "./petscan.js";
export type { MapPetscanOptions } from "./petscan.js";
export { API_USER_AGENT, fetchSparqlSelection, mapSparql } from "./sparql.js";
export type { MapSparqlOptions, SparqlReport } from "./sparql.js";
export { fetchQuarrySelection, mapQuarry } from "./quarry.js";
export type { MapQuarryOptions } from "./quarry.js";
export { defaultFetch, fetchJsonCapped, fetchTextCapped, MAX_RAW_FETCH_BYTES } from "./http.js";
export type { FetchDeps, FetchLike, ResponseLike } from "./http.js";
```

- [ ] **Step 2: Point the conformance harness at the public surface**

In `test/conformance.test.ts`, replace the per-module imports with one import from `../src/index.js` (same names). This makes the fixture suite prove the *exported* API is sufficient. Run:

```bash
npm test -w @audiodude/selection-core
```

Expected: PASS unchanged. (`test/sitematrix.test.ts`, `test/items.test.ts` etc. may keep deep imports — they test internals.)

- [ ] **Step 3: Write `packages/selection-core/README.md`**

```markdown
# @audiodude/selection-core

Isomorphic TypeScript implementation of the
[Selections specification](../../docs/SPEC.md) (v1.0.0): parsers, source
mappers, serializers, and validators for portable lists of Wikimedia pages.
Zero runtime dependencies, zero DOM references (enforced by
`tsconfig.json` — `lib: ["ES2022"]`, no type libraries) — runs in the
browser and in Node ≥ 18.

Domain errors are **values, never exceptions**: every operation returns
`Result<T> = { ok: true, value } | { ok: false, error: { code, message } }`
with stable machine-readable codes shared with the
[conformance fixtures](../../fixtures/README.md), which this package
passes in full (77/77 — `npm test`).

## Types

```ts
import type { Selection, Item, Source, Result } from "@audiodude/selection-core";
```

`Selection { dbname, pages: Item[], source?: Source, ...extras }` per
SPEC §5.2. One deviation: the `Selection` index signature is
`JsonValue | Item[] | Source | undefined` — the spec's own `pages`/`source`
members don't satisfy its published `JsonValue | undefined` signature under
strict TypeScript (TS2411). Wire shape is identical; candidate spec erratum.

## Parsing & serializing

```ts
import {
  parseTsv, serializeTsv, parseSelectionJson, selectionJsonBytes,
  validateSelection, normalizeManualText, Sitematrix,
} from "@audiodude/selection-core";

const sm = Sitematrix.fromJson(sitematrixJson); // Result<Sitematrix>
if (!sm.ok) throw new Error(sm.error.message);

// .swiki/TSV upload (SPEC §5.1, §7.2) - dbname from sidecar, else filename
parseTsv(bytes, { filename: "list.enwiki.tsv", sitematrix: sm.value });
// → Result<{ dbname?: string; pages: Item[] }>

serializeTsv(selection); // → Result<Uint8Array>, canonical byte-stable TSV

parseSelectionJson(bytes); // → Result<Selection>, boundary parse: rejects duplicates
serializeSelectionJson(selection); // → Result<string>, canonical JSON text (SPEC §5.2)
selectionJsonBytes(selection); // UTF-8 byte length (max-bytes cap measurement)
validateSelection(bytes, sm.value); // → Result<void>, the storing-system gate (SPEC §8)

normalizeManualText("Statue of Liberty\n# comment"); // SPEC §7.1
// → Result<{ pages: Item[] }>, title-only items
```

Behavior not pinned by fixtures: a manual-entry line that normalizes to the
empty string (e.g. a bare `https://en.wikipedia.org/wiki/`) is dropped like
an empty line; a SPARQL row whose decoded title contains tab/newline is
dropped and counted like a non-matching row.

## Source mappers & fetch adapters (SPEC §7.3-§7.5)

Mappers are pure functions over captured upstream payloads; fetch adapters
add network access with an injectable `fetch` (any WHATWG-compatible
implementation), stream bodies with a 100 MB abort, and default
`dynamic: true` in the emitted `source`.

```ts
import {
  mapPetscan, fetchPetscanSelection,
  mapSparql, fetchSparqlSelection,
  mapQuarry, fetchQuarrySelection,
} from "@audiodude/selection-core";

await fetchPetscanSelection("https://petscan.wmcloud.org/?psid=123", { sitematrix });
// → Result<Selection>; dbname from PetScan's echoed query, never user input

await fetchSparqlSelection({ dbname: "enwiki", endpoint, query, sitematrix });
// → Result<{ selection: Selection; report: { ingested, dropped } }>
// Api-User-Agent is sent to query.wikidata.org only (CORS-verified there).

await fetchQuarrySelection("https://quarry.wmcloud.org/query/104907");
// → Result<Selection>; resolves /query/<id>/meta, then /run/<id>/output/0/json;
// dbname from Quarry's query_database with any trailing _p stripped
```

## Conformance

`npm test` runs the vendored fixture suite from [`fixtures/`](../../fixtures/)
(all eight operations) plus unit tests for the HTTP layer and fetch adapters.
`npm run typecheck` proves `src/` compiles with no DOM or Node type libraries.
```

- [ ] **Step 4: Update the root `README.md` status section**

In the `## Status` list, mark item 2 done in the style of item 1:

```markdown
**Specification + fixtures + core library.** Planned, in order:

1. ~~Conformance fixtures~~ — done; see [fixtures/](fixtures/)
   (`scripts/lint_fixtures.py` checks the tree's internal consistency)
2. ~~`selection-core`~~ — done; see
   [packages/selection-core/](packages/selection-core/) — isomorphic
   TypeScript: parsers, source mappers, serializers, validators; passes all
   77 conformance fixtures (`npm test`)
3. `selection-picker` — a `<selection-picker>` web component any web tool can
   embed to let users create Selections from manual entry, `.swiki` upload,
   PetScan, SPARQL, or Quarry
4. Integration into [WP1](https://github.com/openzim/wp1)
```

Also update line 3's parenthetical ("and, soon, reference implementations") to "and reference implementations".

- [ ] **Step 5: Append the log entry to `docs/tasks/02-selection-core.md`**

Follow task 01's log format. Content to include (adjust date to the actual completion date):

```markdown
## Log

**2026-08-26 — done.** `packages/selection-core` (npm workspace): isomorphic
TypeScript, ESM, zero runtime dependencies. All 77 conformance fixtures pass
via a discovery-based vitest harness (`test/conformance.test.ts`) plus unit
tests for the HTTP layer and fetch adapters.

- Zero-DOM enforced by tsconfig: `lib: ["ES2022"]`, `types: []`; the four
  WHATWG globals used (TextDecoder/TextEncoder/URL/URLSearchParams) are
  declared ambiently in `src/globals.d.ts`.
- Errors are values: `Result<T>` with the fixture registry's 16 codes plus
  four fetch-layer codes (`HTTP_ERROR`, `PAYLOAD_TOO_LARGE`,
  `UPSTREAM_SHAPE`, `QUARRY_RUN_NOT_READY`).
- Mappers are pure functions over captured payloads; fetch adapters take an
  injectable fetch, stream with a 100 MB abort, and send Api-User-Agent to
  WDQS only. Quarry resolution verified against the live API
  (`/query/<id>/meta` → `latest_rev.query_database`, `latest_run.id`;
  `/run/<id>/output/0/json`).
- **Spec erratum candidate:** SPEC §5.2's TypeScript contract fails strict
  compilation (TS2411 — `pages`/`source` vs the `JsonValue | undefined`
  index signature). The package widens the `Selection` index signature to
  `JsonValue | Item[] | Source | undefined`; identical wire shape.
- Behavior chosen where fixtures are silent (documented in the package
  README): manual-entry lines normalizing to empty are dropped; SPARQL rows
  whose decoded title contains tab/newline are dropped and counted.
```

- [ ] **Step 6: Full verification**

```bash
npm test && npm run typecheck && python3 scripts/lint_fixtures.py
```

Expected: all tests pass from the repo root (workspaces), both tsconfigs clean, fixture linter still OK (proves fixtures were not touched).

- [ ] **Step 7: Commit**

```bash
git add packages/selection-core README.md docs/tasks/02-selection-core.md
git commit -m "Add selection-core public API and docs; task 02 complete

Co-Authored-By: Claude <noreply@anthropic.com>"
```

- [ ] **Step 8: Hand off**

Do **not** merge to `main` or push without the user's go-ahead (repo convention: work lands via merge commits like `Merge task-01-conformance-fixtures: ...`). Use superpowers:finishing-a-development-branch to present the options.

---

## Self-Review (performed while writing)

**Spec coverage.** Task-02 acceptance criteria: full fixture suite → Task 8 Step 4 (all 77) with a coverage guard preventing silently skipped ops; no-DOM enforced by tsconfig → Task 1 Step 3 (`lib`/`types`) + typecheck runs in Tasks 1, 9, 10; public API documented in package README → Task 10 Step 3. Task details: §7.1 pipeline → Task 3; §5.1 TSV parse/serialize + §5.2 JSON → Tasks 4–5; mappers with injectable fetch → Tasks 6–9; structural validator + canonical-JSON byte measurement → Task 5; typed error values with stable codes → Task 1; Api-User-Agent to WDQS only + 100 MB abort → Task 9. Not in scope (verified against spec/fixtures): JSON Lines and Wikitext serializations are TBD-reserved (§5.3/§5.4); re-materialization scheduling is the storing system's (§6.2); size policy is caller policy (§8) — `selectionJsonBytes` provides the measurement, the picker (task 03) enforces `max-bytes`.

**Fixture-pin coverage.** Pin #1 (ingestion dedups, boundaries reject) → Deduper in Tasks 3,4,6,7,8; `DUPLICATE_ITEM` in Task 5. Pins #2–#5 (TSV cells, headers-as-data, numeric fields, dbname side channel) → Task 4. Pin #6 (lenient percent-decode) → Task 3 `percentDecodeLenient`, reused Task 7. Pin #7 (verbatim mapper titles) → Tasks 6, 8. Pin #8 (`_p` strip) → Task 8. Pin #9 (zero items valid) → empty-file/empty/only-comments cases. Pin #10 (255-byte note unenforced) → nothing enforces it.

**Type consistency.** `Result`/`ok`/`err`, `ParsedItem`, `canonicalItem`, `itemKey`, `hasForbiddenChar`, `Deduper.add`, `Sitematrix.{fromJson,isValidDbname,domainFor,dbnameForDomain}`, `parseTsv`/`ParseTsvOptions`, `serializeTsv`, `parseSelectionJson`, `serializeSelectionJson`, `selectionJsonBytes`, `validateSelection`, `mapPetscan`/`MapPetscanOptions`, `mapSparql`/`MapSparqlOptions`/`SparqlReport`, `mapQuarry`/`MapQuarryOptions`, `FetchLike`/`FetchDeps`/`fetchTextCapped`/`fetchJsonCapped`/`defaultFetch`, and the three `fetch*Selection` signatures are used with identical names and shapes in every task that references them, and re-exported verbatim in Task 10's `index.ts`.

## Review Decisions

