# selection-picker Implementation Plan (task 03)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `packages/selection-picker` — an embeddable `<selection-picker>` custom element that lets a user of any web tool build a Selection from pasted titles, a `.swiki` upload, a PetScan URL, a SPARQL query, or a Quarry URL, and hands the host canonical Selection JSON via a promise and a `selection` event.

**Architecture:** Three layers, tested separately. (1) A **policy/ingest layer** of pure and async functions over `selection-core` — mode input → `PickerResult<{selection, report}>` with dbname-allowlist enforcement, byte/item caps, and a final structural gate; no DOM. (2) A **presentation layer** of pure Lit template functions (one per input mode) with no state and no fetching. (3) One **Lit element** that owns dialog lifecycle, mode state, and the promise/event contract. Domain errors are values everywhere; the only rejection is user cancellation.

**Tech Stack:** Lit 3.3.3 (decorator-free), TypeScript 5.9 strict ESM, vitest 3 + happy-dom 20 for component tests, esbuild for the zero-build CDN bundle, npm workspaces. `@audiodude/selection-core` is the only runtime dependency besides Lit.

**Spec:** `docs/SPEC.md` (v1.0.0) — normative, especially §4.2 (dbname), §5.1–§5.2 (serializations), §6 (source/dynamic), §7.1–§7.5 (source mapping), §8 (validation split). `docs/tasks/03-selection-picker.md` is the originating task; `docs/decision-record.md` decisions #1, #3, #7, #9, #12, #14 are binding; `packages/selection-core/README.md` is the API reference for everything this package calls; `fixtures/README.md` documents the fixture cases the per-mode tests reuse. All travel with this plan; executors read them.

## Global Constraints

- **Lit without decorators.** Use `static properties` + `declare` fields + constructor initialization. Verified 2026-08-29: esbuild's standard-decorator transform (what vitest and the bundle both use) breaks Lit's `@customElement`/`@query`/`@property` with `TypeError: Function expected`. Never introduce `experimentalDecorators`.
- **Errors are values.** Every ingest/policy function returns `PickerResult<T>`; nothing throws for a domain error. The single exception: `open()`'s promise rejects with `new DOMException("selection cancelled", "AbortError")` when the user cancels, and `open()` throws a plain `Error` if called while the element is not connected (a host programming error).
- **Runtime dependencies:** `lit` and `@audiodude/selection-core` only. Dev-only additions to the repo root: `esbuild`, `happy-dom`.
- **No proxy by default** (decision record #3). All upstream fetches go directly from the browser. The `proxy` attribute is an opt-in wrapper; nothing defaults to it.
- **Sitematrix fetch MUST carry `origin=*`.** Verified 2026-08-29: `https://meta.wikimedia.org/w/api.php?action=sitematrix&format=json&formatversion=2` returns **no** `Access-Control-Allow-Origin` header without it, and `access-control-allow-origin: *` with it. Live payload ≈ 149 KB, 1,072 sites.
- **`Api-User-Agent` is never set by this package.** `selection-core` already sends it to `query.wikidata.org` only.
- **Caps reject, never truncate.** `max-bytes` measures `selectionJsonBytes(selection)` — the UTF-8 byte length of the canonical Selection JSON (decision record #9). `max-items` measures `selection.pages.length`.
- **dbname semantics** (decision record #7): the `dbname` attribute is a comma-separated **allowlist constraint**; a source-derived dbname (PetScan, Quarry) is **fact** and is never overridden; conflicts are hard errors rendered as **domains**, not dbnames.
- **UI strings live only in `src/strings.ts`.** No user-facing English in components, ingest, or the element. English-only v1 (decision record #14).
- **CSP-safe:** no `eval`, no `new Function`, no inline `style=` attributes, no injected `<style>` when the browser supports constructable stylesheets (verified: Lit uses `adoptedStyleSheets` under happy-dom and evergreen browsers).
- **Never modify** `fixtures/`, `docs/SPEC.md`, `docs/decision-record.md`, or `scripts/lint_fixtures.py`. Documentation edits are limited to the root `README.md`, the two package READMEs, and the task-03 log entry (Task 7).
- **Branch:** all work on `task-03-selection-picker`, created in Task 1. A worktree, if used, goes at `./.worktrees/task-03-selection-picker` (already gitignored).
- **Commits:** plain capitalized summary, no `feat:` prefixes (repo style: `Add selection-core public API and docs; task 02 complete`). Every commit carries the trailer `Co-Authored-By: Claude <noreply@anthropic.com>`.
- **Do not run the fixture linter or the core test suite from picker tasks** except where a step says to; each task runs its own tests. Task 7 runs everything once.

---

## File Structure

```
package.json                                    modify: add esbuild + happy-dom devDeps
.gitignore                                      modify: add dist/
packages/selection-core/
  src/sitematrix.ts                             modify: add sites() enumeration
  test/sitematrix.test.ts                       modify: cover sites()
  README.md                                     modify: document sites() (Task 7)
packages/selection-picker/
  package.json                                  name, deps (lit, core), test/typecheck/build scripts
  tsconfig.json                                 strict ESM + DOM libs, no decorators
  vitest.config.ts                              happy-dom environment, es2022 esbuild target
  README.md                                     public docs: attributes, API, modes (Task 7)
  src/
    result.ts                                   PickerResult / PickerError / PickerErrorCode
    strings.ts                                  every user-facing string + userMessage(error)
    dbname.ts                                   allowlist parsing, dbname resolution, conflict check
    caps.ts                                     max-bytes / max-items policy
    sitematrix-source.ts                        SITEMATRIX_URL, loadSitematrix (cached)
    proxy-fetch.ts                              proxy attribute wrapper over FetchLike
    ingest.ts                                   Mode, IngestInput, ingest(): the whole pipeline
    seed.ts                                     open(seed) → prefilled form state (pure)
    styles.ts                                   the component stylesheet (css``)
    forms.ts                                    pure per-mode form templates + project picker
    selection-picker.ts                         the element: dialog, state, promise + event
    index.ts                                    guarded customElements.define + re-exports
  test/
    tsconfig.json                               extends package tsconfig, adds node types
    helpers.ts                                  fixture loaders, fake FetchLike, DOM helpers
    toolchain.test.ts                           pins decorator-free Lit + happy-dom capabilities
    policy.test.ts                              dbname.ts + caps.ts
    sitematrix-source.test.ts                   URL, caching, error propagation
    proxy-fetch.test.ts                         proxy URL rewriting
    ingest.test.ts                              fixture-backed, one case per input mode
    ingest-policy.test.ts                       allowlist conflict, caps, missing dbname
    forms.test.ts                               each mode's form renders and reports input
    picker.test.ts                              component: open/load/confirm/cancel/errors
    picker-seed.test.ts                         component: open(seed) per source type
    seed.test.ts                                seedState: source type → form state
  examples/
    plain.html                                  the no-bundler acceptance page (Task 7)
  dist/                                         gitignored esbuild output
```

Fixture paths inside picker tests resolve as `new URL("../../../fixtures", import.meta.url)` — `packages/selection-picker/test/` → repo root → `fixtures/`.

Layer rule the file split enforces: `ingest.ts` and everything it imports must stay DOM-free and independently testable; `forms.ts` must stay state-free and fetch-free; only `selection-picker.ts` may touch `dialog`, `File`, or `customElements`.

---

### Task 1: Workspace scaffold, toolchain pin, `Sitematrix.sites()`, result type

**Files:**
- Modify: `package.json` (repo root, devDependencies)
- Modify: `.gitignore`
- Create: `packages/selection-picker/package.json`
- Create: `packages/selection-picker/tsconfig.json`
- Create: `packages/selection-picker/vitest.config.ts`
- Create: `packages/selection-picker/test/tsconfig.json`
- Create: `packages/selection-picker/src/result.ts`
- Modify: `packages/selection-core/src/sitematrix.ts`
- Test: `packages/selection-core/test/sitematrix.test.ts` (modify), `packages/selection-picker/test/toolchain.test.ts` (create)

**Interfaces:**
- Consumes: `selection-core`'s public exports (`ErrorCode`, `Sitematrix`).
- Produces:
  - `Sitematrix.prototype.sites(): { dbname: string; domain: string }[]` — every site, sorted by domain. The project picker needs the full domain list; nothing else in core exposes it.
  - `result.ts`: `type PickerErrorCode = ErrorCode | "DBNAME_NOT_ALLOWED" | "MAX_BYTES_EXCEEDED" | "MAX_ITEMS_EXCEEDED"`, `interface PickerError { code: PickerErrorCode; message: string }`, `type PickerResult<T> = { ok: true; value: T } | { ok: false; error: PickerError }`, `pickerOk<T>(value: T): PickerResult<T>`, `pickerErr(code: PickerErrorCode, message: string): { ok: false; error: PickerError }`.
  - Package scripts: `npm run test -w @audiodude/selection-picker`, `npm run typecheck -w @audiodude/selection-picker`, `npm run build -w @audiodude/selection-picker`.

- [ ] **Step 1: Branch**

```bash
git checkout -b task-03-selection-picker
```

- [ ] **Step 2: Root devDependencies and gitignore**

Replace the `devDependencies` block of the root `package.json` with:

```json
  "devDependencies": {
    "@types/node": "^20.19.0",
    "esbuild": "^0.28.2",
    "happy-dom": "^20.12.0",
    "typescript": "^5.9.2",
    "vitest": "^3.2.0"
  }
```

Append to `.gitignore` (it currently holds `node_modules/` and `.worktrees/`):

```
dist/
```

- [ ] **Step 3: Picker package files**

`packages/selection-picker/package.json`:

```json
{
  "name": "@audiodude/selection-picker",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "dependencies": {
    "@audiodude/selection-core": "*",
    "lit": "^3.3.3"
  },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json && tsc -p test/tsconfig.json",
    "build": "esbuild src/index.ts --bundle --format=esm --target=es2022 --minify --outfile=dist/selection-picker.min.js"
  }
}
```

`packages/selection-picker/tsconfig.json` (verified 2026-08-29: `tsc` resolves `@audiodude/selection-core` through its `exports` entry to `src/index.ts` under `moduleResolution: "bundler"`):

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": [],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "useDefineForClassFields": false,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src"]
}
```

`packages/selection-picker/test/tsconfig.json`:

```json
{
  "extends": "../tsconfig.json",
  "compilerOptions": { "types": ["node"] },
  "include": ["../src", "."]
}
```

`packages/selection-picker/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Private #methods and static class fields must survive transformation.
  esbuild: { target: "es2022" },
  test: { environment: "happy-dom" },
});
```

- [ ] **Step 4: Install**

```bash
npm install
```

Expected: `lit`, `esbuild`, and `happy-dom` appear in `package-lock.json`; `node_modules/@audiodude/selection-core` and `node_modules/@audiodude/selection-picker` are workspace symlinks.

- [ ] **Step 5: Write the failing core test for `sites()`**

Append to `packages/selection-core/test/sitematrix.test.ts` (the file already defines `load()`):

```ts
test("enumerates every site, sorted by domain", () => {
  const sm = load();
  const sites = sm.sites();
  expect(sites.length).toBe(33); // every site in fixtures/sitematrix.json
  expect(sites[0]).toEqual({ dbname: "dewikibooks", domain: "de.wikibooks.org" });
  expect(sites.map((s) => s.domain)).toEqual([...sites.map((s) => s.domain)].sort());
  expect(sites.find((s) => s.dbname === "metawiki")?.domain).toBe("meta.wikimedia.org");
});
```

- [ ] **Step 6: Run it to make sure it fails**

Run: `npm run test -w @audiodude/selection-core -- sitematrix`
Expected: FAIL — `sm.sites is not a function`.

- [ ] **Step 7: Implement `sites()`**

In `packages/selection-core/src/sitematrix.ts`, add this method to the `Sitematrix` class, directly after `dbnameForDomain`:

```ts
  /**
   * Every site, sorted by domain. The picker's project selector needs the
   * full list; the lookup maps alone cannot enumerate it in a stable order.
   */
  sites(): SiteEntry[] {
    return [...this.byDomain.values()].sort((a, b) => a.domain.localeCompare(b.domain));
  }
```

`SiteEntry` is already declared in the file; export it so the picker can name the return type — change its declaration line to:

```ts
export interface SiteEntry {
  dbname: string;
  domain: string;
}
```

Then add the type to `packages/selection-core/src/index.ts`, extending the existing `Sitematrix` export line:

```ts
export { Sitematrix } from "./sitematrix.js";
export type { SiteEntry } from "./sitematrix.js";
```

- [ ] **Step 8: Run the core suite**

Run: `npm run test -w @audiodude/selection-core && npm run typecheck -w @audiodude/selection-core`
Expected: PASS — 77 conformance cases plus unit tests, including the new one.

- [ ] **Step 9: Write `src/result.ts`**

```ts
import type { ErrorCode } from "@audiodude/selection-core";

/**
 * Core's codes (which include the 16 fixture-registry codes and four
 * fetch-layer codes) plus the three policy codes only this package can
 * produce. Because this is a superset, every core `Result` is assignable to
 * `PickerResult` without conversion.
 */
export type PickerErrorCode =
  | ErrorCode
  | "DBNAME_NOT_ALLOWED"
  | "MAX_BYTES_EXCEEDED"
  | "MAX_ITEMS_EXCEEDED";

export interface PickerError {
  code: PickerErrorCode;
  /** Diagnostic text; user-facing copy comes from strings.ts's userMessage. */
  message: string;
}

export type PickerResult<T> = { ok: true; value: T } | { ok: false; error: PickerError };

export function pickerOk<T>(value: T): PickerResult<T> {
  return { ok: true, value };
}

export function pickerErr(
  code: PickerErrorCode,
  message: string,
): { ok: false; error: PickerError } {
  return { ok: false, error: { code, message } };
}
```

- [ ] **Step 10: Write the toolchain-pin test**

`packages/selection-picker/test/toolchain.test.ts` — this test exists to fail loudly if the decorator-free Lit + happy-dom decisions are ever broken:

```ts
import { LitElement, css, html } from "lit";
import { expect, test } from "vitest";
import { Sitematrix } from "@audiodude/selection-core";
import { pickerErr, pickerOk } from "../src/result.js";

class ToolchainProbe extends LitElement {
  static override styles = css`
    :host { display: block; }
  `;
  static override properties = { label: { type: String } };
  declare label: string;
  constructor() {
    super();
    this.label = "";
  }
  override render() {
    return html`<dialog><p>${this.label}</p></dialog>`;
  }
  get dialogEl(): HTMLDialogElement {
    return this.renderRoot.querySelector("dialog")!;
  }
}
if (!customElements.get("toolchain-probe")) {
  customElements.define("toolchain-probe", ToolchainProbe);
}

test("decorator-free Lit renders into shadow DOM with constructable styles", async () => {
  document.body.innerHTML = `<toolchain-probe label="ok"></toolchain-probe>`;
  const el = document.querySelector("toolchain-probe") as ToolchainProbe;
  await el.updateComplete;
  expect(el.renderRoot.querySelector("p")!.textContent).toBe("ok");
  // CSP: constructable stylesheets, not injected <style> tags.
  expect((el.shadowRoot as ShadowRoot).adoptedStyleSheets.length).toBe(1);
  expect(el.shadowRoot!.querySelectorAll("style").length).toBe(0);
});

test("native dialog showModal/close is available in the test environment", () => {
  const el = document.querySelector("toolchain-probe") as ToolchainProbe;
  el.dialogEl.showModal();
  expect(el.dialogEl.open).toBe(true);
  el.dialogEl.close();
  expect(el.dialogEl.open).toBe(false);
});

test("core is importable by package name and results widen to PickerResult", () => {
  expect(Sitematrix.fromJson({ nope: true }).ok).toBe(false);
  expect(pickerOk(1)).toEqual({ ok: true, value: 1 });
  expect(pickerErr("DBNAME_NOT_ALLOWED", "x").error.code).toBe("DBNAME_NOT_ALLOWED");
});
```

- [ ] **Step 11: Run the picker tests and typecheck**

Run: `npm run test -w @audiodude/selection-picker && npm run typecheck -w @audiodude/selection-picker`
Expected: PASS, 3 tests. Lit prints a dev-mode warning to stderr in every picker test run; that is expected and never a failure.

- [ ] **Step 12: Commit**

```bash
git add package.json package-lock.json .gitignore packages/selection-core packages/selection-picker
git commit -m "$(cat <<'EOF'
Scaffold selection-picker workspace; add Sitematrix.sites()

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Policy layer — strings, dbname constraint, caps

**Files:**
- Create: `packages/selection-picker/src/strings.ts`
- Create: `packages/selection-picker/src/dbname.ts`
- Create: `packages/selection-picker/src/caps.ts`
- Create: `packages/selection-picker/test/helpers.ts`
- Test: `packages/selection-picker/test/policy.test.ts`

**Interfaces:**
- Consumes: `result.ts` (`PickerResult`, `pickerOk`, `pickerErr`); core's `Sitematrix`, `Selection`, `selectionJsonBytes`.
- Produces:
  - `strings.ts`: `STRINGS` (object literal of strings and copy functions), `userMessage(error: PickerError): string`.
  - `dbname.ts`: `parseAllowlist(attr: string | null | undefined): string[]`, `renderDomains(dbnames: string[], sitematrix: Sitematrix): string`, `resolveDbname(input: string, allowlist: string[], sitematrix: Sitematrix): string`, `checkDbname(dbname: string, allowlist: string[], sitematrix: Sitematrix): PickerResult<void>`.
  - `caps.ts`: `interface Caps { maxBytes?: number; maxItems?: number }`, `checkCaps(selection: Selection, caps: Caps): PickerResult<void>`.
  - `test/helpers.ts`: `FIXTURES`, `fixtureSitematrix()`, `readFixtureText(op, name, file)`, `readFixtureBytes(op, name, file)`, `readFixtureJson(op, name, file)`, `fakeFetch(routes)`, `setValue(el, value)`.

- [ ] **Step 1: Write the test helpers**

`packages/selection-picker/test/helpers.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Sitematrix, type FetchLike, type ResponseLike } from "@audiodude/selection-core";

export const FIXTURES = fileURLToPath(new URL("../../../fixtures", import.meta.url));

export function fixtureSitematrix(): Sitematrix {
  const result = Sitematrix.fromJson(
    JSON.parse(readFileSync(join(FIXTURES, "sitematrix.json"), "utf8")),
  );
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

export function readFixtureText(op: string, name: string, file: string): string {
  return readFileSync(join(FIXTURES, op, name, file), "utf8");
}

export function readFixtureBytes(op: string, name: string, file: string): Uint8Array {
  return new Uint8Array(readFileSync(join(FIXTURES, op, name, file)));
}

export function readFixtureJson(op: string, name: string, file: string): any {
  return JSON.parse(readFixtureText(op, name, file));
}

export interface Route {
  /** Substring or pattern matched against the requested URL. */
  match: string | RegExp;
  json?: unknown;
  text?: string;
  status?: number;
}

/** A FetchLike over fixed routes; unmatched URLs answer 404. */
export function fakeFetch(routes: Route[]): FetchLike & { calls: string[] } {
  const calls: string[] = [];
  const fetch = ((url: string) => {
    calls.push(url);
    const route = routes.find((r) =>
      typeof r.match === "string" ? url.includes(r.match) : r.match.test(url),
    );
    if (route === undefined) {
      return Promise.resolve({ ok: false, status: 404, body: null } as ResponseLike);
    }
    const status = route.status ?? 200;
    const payload = route.text ?? JSON.stringify(route.json ?? null);
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(payload));
        controller.close();
      },
    });
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      body,
    } as unknown as ResponseLike);
  }) as FetchLike & { calls: string[] };
  fetch.calls = calls;
  return fetch;
}

/** Drive a Lit-rendered field the way a user would. */
export function setValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  el.value = value;
  el.dispatchEvent(new Event("input"));
}
```

- [ ] **Step 2: Write the failing policy test**

`packages/selection-picker/test/policy.test.ts`:

```ts
import { expect, test } from "vitest";
import type { Selection } from "@audiodude/selection-core";
import { checkCaps } from "../src/caps.js";
import { checkDbname, parseAllowlist, renderDomains, resolveDbname } from "../src/dbname.js";
import { userMessage } from "../src/strings.js";
import { fixtureSitematrix } from "./helpers.js";

const sm = fixtureSitematrix();

test("parses the dbname attribute as a comma-separated allowlist", () => {
  expect(parseAllowlist("enwiki, dewiki ,")).toEqual(["enwiki", "dewiki"]);
  expect(parseAllowlist("")).toEqual([]);
  expect(parseAllowlist(null)).toEqual([]);
  expect(parseAllowlist(undefined)).toEqual([]);
});

test("renders allowlists as domains, in English, for user-facing copy", () => {
  expect(renderDomains(["enwiki"], sm)).toBe("en.wikipedia.org");
  expect(renderDomains(["enwiki", "dewiki"], sm)).toBe("en.wikipedia.org or de.wikipedia.org");
  expect(renderDomains(["enwiki", "dewiki", "metawiki"], sm)).toBe(
    "en.wikipedia.org, de.wikipedia.org or meta.wikimedia.org",
  );
  expect(renderDomains(["zzwiki"], sm)).toBe("zzwiki"); // unknown renders as itself
});

test("resolves the user's project input to a dbname", () => {
  // A single-entry allowlist fixes the dbname; no user input is consulted.
  expect(resolveDbname("", ["enwiki"], sm)).toBe("enwiki");
  expect(resolveDbname("de.wikipedia.org", ["enwiki"], sm)).toBe("enwiki");
  // Otherwise: a domain resolves via the sitematrix; a dbname passes through.
  expect(resolveDbname(" en.wikipedia.org ", [], sm)).toBe("enwiki");
  expect(resolveDbname("enwiki", [], sm)).toBe("enwiki");
  expect(resolveDbname("", [], sm)).toBe("");
});

test("a source-derived dbname outside the allowlist is a hard error, phrased as domains", () => {
  const ok = checkDbname("enwiki", ["enwiki", "dewiki"], sm);
  expect(ok.ok).toBe(true);

  const conflict = checkDbname("dewiki", ["enwiki"], sm);
  expect(conflict.ok).toBe(false);
  if (!conflict.ok) {
    expect(conflict.error.code).toBe("DBNAME_NOT_ALLOWED");
    expect(conflict.error.message).toBe(
      "Your URL names de.wikipedia.org, but this page is only configured to accept en.wikipedia.org.",
    );
  }

  const unknown = checkDbname("zzwiki", [], sm);
  expect(unknown.ok).toBe(false);
  if (!unknown.ok) expect(unknown.error.code).toBe("DBNAME_INVALID");
});

test("caps reject and report the actual size; they never truncate", () => {
  const selection: Selection = { dbname: "enwiki", pages: ["Paris", "Berlin"] };

  expect(checkCaps(selection, {}).ok).toBe(true);
  expect(checkCaps(selection, { maxItems: 2 }).ok).toBe(true);

  const items = checkCaps(selection, { maxItems: 1 });
  expect(items.ok).toBe(false);
  if (!items.ok) {
    expect(items.error.code).toBe("MAX_ITEMS_EXCEEDED");
    expect(items.error.message).toBe(
      "This selection has 2 items; this page accepts at most 1.",
    );
  }

  const bytes = checkCaps(selection, { maxBytes: 10 });
  expect(bytes.ok).toBe(false);
  if (!bytes.ok) {
    expect(bytes.error.code).toBe("MAX_BYTES_EXCEEDED");
    // 46 = Buffer.byteLength('{"dbname":"enwiki","pages":["Paris","Berlin"]}')
    expect(bytes.error.message).toBe(
      "This selection is 46 bytes; this page accepts at most 10.",
    );
  }
});

test("userMessage turns core diagnostics into actionable English", () => {
  expect(userMessage({ code: "DBNAME_NOT_ALLOWED", message: "already user copy" })).toBe(
    "already user copy",
  );
  expect(userMessage({ code: "ENCODING_INVALID", message: "input is not valid UTF-8" })).toBe(
    "That file is not valid UTF-8 text.",
  );
  expect(userMessage({ code: "HTTP_ERROR", message: "HTTP 503 from x" })).toBe(
    "Could not reach that service. Check the URL and try again.",
  );
  expect(userMessage({ code: "QUARRY_NO_TITLE_COLUMN", message: "alias one: AS page_title" })).toBe(
    "alias one: AS page_title",
  );
  expect(userMessage({ code: "JSON_SHAPE", message: "no pages list" })).toBe(
    "Could not load that selection (JSON_SHAPE).",
  );
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm run test -w @audiodude/selection-picker -- policy`
Expected: FAIL — cannot resolve `../src/dbname.js`, `../src/caps.js`, `../src/strings.js`.

- [ ] **Step 4: Write `src/strings.ts`**

```ts
import type { PickerError } from "./result.js";

const num = new Intl.NumberFormat("en-US");

/** Every user-facing string in the package. English-only v1. */
export const STRINGS = {
  dialogTitle: "Create a selection",
  modeLabels: {
    manual: "Paste titles",
    swiki: "Upload .swiki",
    petscan: "PetScan",
    sparql: "SPARQL",
    quarry: "Quarry",
  },
  manualLabel: "One title or wiki URL per line. Lines beginning with # are ignored.",
  swikiLabel: "A .swiki or TSV file: item_title, optional id, optional namespace_id.",
  petscanLabel: "PetScan query URL",
  sparqlEndpointLabel: "SPARQL endpoint",
  sparqlQueryLabel: "SPARQL query",
  quarryLabel: "Quarry query URL",
  projectLabel: "Wikimedia project",
  projectPlaceholder: "en.wikipedia.org",
  noFile: "No file selected",
  load: "Load",
  loading: "Loading…",
  confirm: "Use selection",
  cancel: "Cancel",
  noFileChosen: "Choose a .swiki or TSV file first.",
  dbnameRequired: "Choose a Wikimedia project first.",
  dbnameUnknown: (value: string) => `${value} is not a known Wikimedia project.`,
  dbnameFromFileMissing:
    "This file does not name a project. Choose the Wikimedia project its titles belong to.",
  dbnameNotAllowed: (found: string, allowed: string) =>
    `Your URL names ${found}, but this page is only configured to accept ${allowed}.`,
  ingestSummary: (ingested: number, dropped: number, domain: string) => {
    const items = `${num.format(ingested)} ${ingested === 1 ? "item" : "items"}`;
    if (dropped === 0) return `Ingested ${items} from ${domain}.`;
    const rows = `${num.format(dropped)} ${dropped === 1 ? "row" : "rows"}`;
    return `Ingested ${items}, dropped ${rows} not on ${domain}.`;
  },
  maxBytesExceeded: (actual: number, max: number) =>
    `This selection is ${num.format(actual)} bytes; this page accepts at most ${num.format(max)}.`,
  maxItemsExceeded: (actual: number, max: number) =>
    `This selection has ${num.format(actual)} items; this page accepts at most ${num.format(max)}.`,
  sitematrixUnavailable:
    "Could not load the list of Wikimedia projects. Check your connection and reopen this dialog.",
} as const;

/**
 * Copy for an error the user must act on. Codes whose message this package
 * already wrote (policy codes) or whose core message is itself an
 * instruction (Quarry aliasing) pass through verbatim; anything unhandled
 * degrades to the code so a bug report can name it.
 */
export function userMessage(error: PickerError): string {
  switch (error.code) {
    case "DBNAME_NOT_ALLOWED":
    case "MAX_BYTES_EXCEEDED":
    case "MAX_ITEMS_EXCEEDED":
    case "DBNAME_MISSING":
    case "DBNAME_INVALID":
    case "QUARRY_NO_TITLE_COLUMN":
      return error.message;
    case "ENCODING_INVALID":
      return "That file is not valid UTF-8 text.";
    case "FIELD_FORBIDDEN_CHAR":
      return "Some titles contain tab or newline characters, which selections cannot represent.";
    case "EMPTY_TITLE":
    case "TSV_INVALID_ID":
    case "TSV_INVALID_NAMESPACE":
    case "TSV_TOO_MANY_COLUMNS":
      return `That file is not a valid .swiki: ${error.message}`;
    case "SIDECAR_DBNAME_MISSING":
      return "The accompanying JSON file has no dbname property.";
    case "SPARQL_NO_VARIABLE":
      return "No result column contains pages on the project you chose.";
    case "SPARQL_NO_MATCHING_ROWS":
      return "No result row was a page URL on the project you chose.";
    case "HTTP_ERROR":
      return "Could not reach that service. Check the URL and try again.";
    case "PAYLOAD_TOO_LARGE":
      return "That result is too large to load in a browser tab.";
    case "UPSTREAM_SHAPE":
      return "That service answered in an unexpected format.";
    case "QUARRY_RUN_NOT_READY":
      return "That Quarry query has no completed run yet.";
    default:
      return `Could not load that selection (${error.code}).`;
  }
}
```

- [ ] **Step 5: Write `src/dbname.ts`**

```ts
import type { Sitematrix } from "@audiodude/selection-core";
import { pickerErr, pickerOk, type PickerResult } from "./result.js";
import { STRINGS } from "./strings.js";

/** `dbname="enwiki, dewiki"` → ["enwiki", "dewiki"]; absent or empty → []. */
export function parseAllowlist(attr: string | null | undefined): string[] {
  if (attr === null || attr === undefined) return [];
  return attr
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
}

/**
 * Conflicts are rendered as domains, never dbnames (decision record #7).
 * Unknown dbnames render as themselves rather than disappearing.
 */
export function renderDomains(dbnames: string[], sitematrix: Sitematrix): string {
  const domains = dbnames.map((dbname) => sitematrix.domainFor(dbname) ?? dbname);
  if (domains.length <= 1) return domains[0] ?? "";
  return `${domains.slice(0, -1).join(", ")} or ${domains[domains.length - 1]!}`;
}

/**
 * The dbname to ingest with, for the modes where it is user input (manual,
 * swiki, sparql). A single-entry allowlist fixes it outright; otherwise the
 * project field's value is resolved as a domain, falling back to treating it
 * as a dbname (so open(seed) can prefill a raw dbname). "" means "not chosen".
 */
export function resolveDbname(input: string, allowlist: string[], sitematrix: Sitematrix): string {
  if (allowlist.length === 1) return allowlist[0]!;
  const trimmed = input.trim();
  if (trimmed === "") return "";
  return sitematrix.dbnameForDomain(trimmed) ?? trimmed;
}

/**
 * A Selection's dbname is fact; the host's attribute is a constraint
 * (decision record #7). Both are enforced here, after ingestion, for every
 * mode — including the ones where the dbname came from upstream.
 */
export function checkDbname(
  dbname: string,
  allowlist: string[],
  sitematrix: Sitematrix,
): PickerResult<void> {
  if (!sitematrix.isValidDbname(dbname)) {
    return pickerErr("DBNAME_INVALID", STRINGS.dbnameUnknown(dbname));
  }
  if (allowlist.length > 0 && !allowlist.includes(dbname)) {
    return pickerErr(
      "DBNAME_NOT_ALLOWED",
      STRINGS.dbnameNotAllowed(
        sitematrix.domainFor(dbname) ?? dbname,
        renderDomains(allowlist, sitematrix),
      ),
    );
  }
  return pickerOk(undefined);
}
```

- [ ] **Step 6: Write `src/caps.ts`**

```ts
import { selectionJsonBytes, type Selection } from "@audiodude/selection-core";
import { pickerErr, pickerOk, type PickerResult } from "./result.js";
import { STRINGS } from "./strings.js";

export interface Caps {
  /** UTF-8 byte length of the canonical Selection JSON (decision record #9). */
  maxBytes?: number;
  maxItems?: number;
}

/** Host policy (SPEC §8): caps reject; they never truncate a Selection. */
export function checkCaps(selection: Selection, caps: Caps): PickerResult<void> {
  if (caps.maxItems !== undefined && selection.pages.length > caps.maxItems) {
    return pickerErr(
      "MAX_ITEMS_EXCEEDED",
      STRINGS.maxItemsExceeded(selection.pages.length, caps.maxItems),
    );
  }
  if (caps.maxBytes !== undefined) {
    const bytes = selectionJsonBytes(selection);
    if (bytes > caps.maxBytes) {
      return pickerErr("MAX_BYTES_EXCEEDED", STRINGS.maxBytesExceeded(bytes, caps.maxBytes));
    }
  }
  return pickerOk(undefined);
}
```

- [ ] **Step 7: Run the tests**

Run: `npm run test -w @audiodude/selection-picker -- policy`
Expected: PASS, 6 tests. If the byte assertion mismatches, print `selectionJsonBytes({dbname:"enwiki",pages:["Paris","Berlin"]})` and correct the expected number in the test — the copy format, not the constant, is what the test pins.

- [ ] **Step 8: Typecheck and commit**

```bash
npm run typecheck -w @audiodude/selection-picker
git add packages/selection-picker
git commit -m "$(cat <<'EOF'
Add picker policy layer: strings, dbname allowlist, caps

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Sitematrix loading and the proxy escape hatch

**Files:**
- Create: `packages/selection-picker/src/sitematrix-source.ts`
- Create: `packages/selection-picker/src/proxy-fetch.ts`
- Test: `packages/selection-picker/test/sitematrix-source.test.ts`, `packages/selection-picker/test/proxy-fetch.test.ts`

**Interfaces:**
- Consumes: core's `fetchJsonCapped`, `Sitematrix`, `FetchLike`; `result.ts`.
- Produces:
  - `sitematrix-source.ts`: `SITEMATRIX_URL: string`, `loadSitematrix(deps: { fetch: FetchLike; url?: string }): Promise<PickerResult<Sitematrix>>`, `resetSitematrixCache(): void`.
  - `proxy-fetch.ts`: `proxyFetch(base: string, inner: FetchLike): FetchLike`.

- [ ] **Step 1: Write the failing tests**

`packages/selection-picker/test/sitematrix-source.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, expect, test } from "vitest";
import {
  loadSitematrix,
  resetSitematrixCache,
  SITEMATRIX_URL,
} from "../src/sitematrix-source.js";
import { fakeFetch, FIXTURES } from "./helpers.js";

const sitematrixJson = JSON.parse(readFileSync(join(FIXTURES, "sitematrix.json"), "utf8"));

beforeEach(() => {
  resetSitematrixCache();
});

test("the request URL carries origin=* — meta sends no CORS header without it", () => {
  const url = new URL(SITEMATRIX_URL);
  expect(url.origin).toBe("https://meta.wikimedia.org");
  expect(url.searchParams.get("action")).toBe("sitematrix");
  expect(url.searchParams.get("formatversion")).toBe("2");
  expect(url.searchParams.get("origin")).toBe("*");
});

test("loads and parses the sitematrix, then serves the same promise from cache", async () => {
  const fetch = fakeFetch([{ match: "action=sitematrix", json: sitematrixJson }]);
  const first = await loadSitematrix({ fetch });
  expect(first.ok).toBe(true);
  if (first.ok) expect(first.value.domainFor("enwiki")).toBe("en.wikipedia.org");

  await loadSitematrix({ fetch });
  expect(fetch.calls.length).toBe(1); // one network request per page, not per open()
});

test("a failed load is not cached, so reopening retries", async () => {
  const failing = fakeFetch([{ match: "action=sitematrix", status: 503 }]);
  const failed = await loadSitematrix({ fetch: failing });
  expect(failed.ok).toBe(false);
  if (!failed.ok) expect(failed.error.code).toBe("HTTP_ERROR");

  const working = fakeFetch([{ match: "action=sitematrix", json: sitematrixJson }]);
  const retried = await loadSitematrix({ fetch: working });
  expect(retried.ok).toBe(true);
  expect(working.calls.length).toBe(1);
});

test("a non-sitematrix payload reports the core shape error", async () => {
  const fetch = fakeFetch([{ match: "action=sitematrix", json: { nope: true } }]);
  const result = await loadSitematrix({ fetch });
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error.code).toBe("UPSTREAM_SHAPE");
});
```

`packages/selection-picker/test/proxy-fetch.test.ts`:

```ts
import { expect, test } from "vitest";
import { proxyFetch } from "../src/proxy-fetch.js";
import { fakeFetch } from "./helpers.js";

test("routes the upstream URL through the host proxy as a url parameter", async () => {
  const inner = fakeFetch([{ match: "proxy.example.org", json: { ok: true } }]);
  const fetch = proxyFetch("https://proxy.example.org/fetch", inner);
  await fetch("https://petscan.wmcloud.org/?psid=123&format=json");
  expect(inner.calls).toEqual([
    "https://proxy.example.org/fetch?url=https%3A%2F%2Fpetscan.wmcloud.org%2F%3Fpsid%3D123%26format%3Djson",
  ]);
});

test("appends to a proxy base that already has a query string", async () => {
  const inner = fakeFetch([{ match: "proxy.example.org", json: {} }]);
  const fetch = proxyFetch("https://proxy.example.org/fetch?key=abc", inner);
  await fetch("https://quarry.wmcloud.org/query/1/meta");
  expect(inner.calls[0]).toBe(
    "https://proxy.example.org/fetch?key=abc&url=https%3A%2F%2Fquarry.wmcloud.org%2Fquery%2F1%2Fmeta",
  );
});

test("passes request headers through unchanged", async () => {
  const seen: Array<Record<string, string> | undefined> = [];
  const fetch = proxyFetch("https://proxy.example.org/fetch", (_url, init) => {
    seen.push(init?.headers);
    return Promise.resolve({ ok: true, status: 200, body: null });
  });
  await fetch("https://query.wikidata.org/sparql", { headers: { Accept: "application/json" } });
  expect(seen).toEqual([{ Accept: "application/json" }]);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm run test -w @audiodude/selection-picker -- sitematrix-source proxy-fetch`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write `src/sitematrix-source.ts`**

```ts
import { fetchJsonCapped, Sitematrix, type FetchLike } from "@audiodude/selection-core";
import { pickerOk, type PickerResult } from "./result.js";

/**
 * SPEC §4.2's authority for valid dbnames. `origin=*` is REQUIRED: verified
 * 2026-08-29, meta's action API sends no Access-Control-Allow-Origin header
 * without it, and `*` with it.
 */
export const SITEMATRIX_URL =
  "https://meta.wikimedia.org/w/api.php?action=sitematrix&format=json&formatversion=2&origin=*";

/** The live response is ~149 KB across ~1,070 sites; 8 MB is ample tab safety. */
const MAX_SITEMATRIX_BYTES = 8 * 1024 * 1024;

let cache = new Map<string, Promise<PickerResult<Sitematrix>>>();

/**
 * One request per page, shared by every <selection-picker> on it. Failures
 * are evicted so that reopening the dialog retries.
 */
export function loadSitematrix(deps: {
  fetch: FetchLike;
  url?: string;
}): Promise<PickerResult<Sitematrix>> {
  const url = deps.url ?? SITEMATRIX_URL;
  const hit = cache.get(url);
  if (hit !== undefined) return hit;
  const pending = fetchSitematrix(deps.fetch, url).then((result) => {
    if (!result.ok) cache.delete(url);
    return result;
  });
  cache.set(url, pending);
  return pending;
}

/** Test seam: the cache is module-level because the payload is page-wide. */
export function resetSitematrixCache(): void {
  cache = new Map();
}

async function fetchSitematrix(
  fetch: FetchLike,
  url: string,
): Promise<PickerResult<Sitematrix>> {
  const json = await fetchJsonCapped(fetch, url, { maxBytes: MAX_SITEMATRIX_BYTES });
  if (!json.ok) return json;
  const sitematrix = Sitematrix.fromJson(json.value);
  if (!sitematrix.ok) return sitematrix;
  return pickerOk(sitematrix.value);
}
```

- [ ] **Step 4: Write `src/proxy-fetch.ts`**

```ts
import type { FetchLike } from "@audiodude/selection-core";

/**
 * The `proxy` attribute (decision record #3): an escape hatch for hosts that
 * run their own materializer. Nothing defaults to it. The proxy receives the
 * upstream URL in a `url` query parameter and MUST return the upstream
 * response body unchanged.
 */
export function proxyFetch(base: string, inner: FetchLike): FetchLike {
  const joiner = base.includes("?") ? "&" : "?";
  return (url, init) => inner(`${base}${joiner}url=${encodeURIComponent(url)}`, init);
}
```

- [ ] **Step 5: Run the tests**

Run: `npm run test -w @audiodude/selection-picker -- sitematrix-source proxy-fetch`
Expected: PASS, 7 tests.

- [ ] **Step 6: Typecheck and commit**

```bash
npm run typecheck -w @audiodude/selection-picker
git add packages/selection-picker
git commit -m "$(cat <<'EOF'
Add sitematrix loader (origin=*) and proxy fetch wrapper

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: The ingest pipeline for all five modes

**Files:**
- Create: `packages/selection-picker/src/ingest.ts`
- Test: `packages/selection-picker/test/ingest.test.ts`, `packages/selection-picker/test/ingest-policy.test.ts`

**Interfaces:**
- Consumes: core's `normalizeManualText`, `parseTsv`, `fetchPetscanSelection`, `fetchSparqlSelection`, `fetchQuarrySelection`, `serializeSelectionJson`, `validateSelection`, `FetchLike`, `Selection`, `Sitematrix`; `caps.ts`; `dbname.ts`; `result.ts`; `strings.ts`.
- Produces:
  - `type Mode = "manual" | "swiki" | "petscan" | "sparql" | "quarry"`
  - `type IngestInput` — the discriminated union below.
  - `interface IngestDeps extends Caps { sitematrix: Sitematrix; fetch: FetchLike; allowlist: string[] }`
  - `interface IngestReport { ingested: number; dropped: number }`
  - `interface IngestOutcome { selection: Selection; report: IngestReport }`
  - `ingest(input: IngestInput, deps: IngestDeps): Promise<PickerResult<IngestOutcome>>`

- [ ] **Step 1: Write the failing fixture-backed test**

`packages/selection-picker/test/ingest.test.ts` — one case per input mode, each asserting the emitted Selection equals the conformance fixture's expected output:

```ts
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
```

- [ ] **Step 2: Write the failing policy-path test**

`packages/selection-picker/test/ingest-policy.test.ts`:

```ts
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
```

- [ ] **Step 3: Run both to verify they fail**

Run: `npm run test -w @audiodude/selection-picker -- ingest`
Expected: FAIL — `../src/ingest.js` not found.

- [ ] **Step 4: Write `src/ingest.ts`**

```ts
import {
  fetchPetscanSelection,
  fetchQuarrySelection,
  fetchSparqlSelection,
  normalizeManualText,
  parseTsv,
  serializeSelectionJson,
  validateSelection,
  type FetchLike,
  type Selection,
  type Sitematrix,
} from "@audiodude/selection-core";
import { checkCaps, type Caps } from "./caps.js";
import { checkDbname } from "./dbname.js";
import { pickerErr, pickerOk, type PickerResult } from "./result.js";
import { STRINGS } from "./strings.js";

export type Mode = "manual" | "swiki" | "petscan" | "sparql" | "quarry";

/** What the widget knows after the user filled in one mode's form. */
export type IngestInput =
  | { mode: "manual"; text: string; dbname: string }
  | { mode: "swiki"; bytes: Uint8Array; filename: string; dbname?: string }
  | { mode: "petscan"; url: string }
  | { mode: "sparql"; dbname: string; endpoint: string; query: string }
  | { mode: "quarry"; url: string };

export interface IngestDeps extends Caps {
  sitematrix: Sitematrix;
  fetch: FetchLike;
  /** Parsed `dbname` attribute; empty means unconstrained. */
  allowlist: string[];
}

/** SPEC §7.4 rule 3 counts, generalized: non-SPARQL modes drop nothing. */
export interface IngestReport {
  ingested: number;
  dropped: number;
}

export interface IngestOutcome {
  selection: Selection;
  report: IngestReport;
}

/**
 * Mode input → a Selection this widget is willing to emit. Ingest order is
 * load, then dbname policy, then caps, then the structural gate — so the
 * user never sees a cap error for a Selection that was never valid, and the
 * host never receives one its own §8 gate would reject.
 */
export async function ingest(
  input: IngestInput,
  deps: IngestDeps,
): Promise<PickerResult<IngestOutcome>> {
  const produced = await produce(input, deps);
  if (!produced.ok) return produced;
  const { selection, report } = produced.value;

  const dbname = checkDbname(selection.dbname, deps.allowlist, deps.sitematrix);
  if (!dbname.ok) return dbname;

  const caps = checkCaps(selection, deps);
  if (!caps.ok) return caps;

  const json = serializeSelectionJson(selection);
  if (!json.ok) return json;
  const structural = validateSelection(json.value, deps.sitematrix);
  if (!structural.ok) return structural;

  return pickerOk({ selection, report });
}

async function produce(
  input: IngestInput,
  deps: IngestDeps,
): Promise<PickerResult<IngestOutcome>> {
  switch (input.mode) {
    case "manual": {
      if (input.dbname === "") return pickerErr("DBNAME_MISSING", STRINGS.dbnameRequired);
      const normalized = normalizeManualText(input.text);
      if (!normalized.ok) return normalized;
      return pickerOk({
        selection: {
          dbname: input.dbname,
          pages: normalized.value.pages,
          source: { type: "simple" }, // inherently static (SPEC §6.2)
        },
        report: { ingested: normalized.value.pages.length, dropped: 0 },
      });
    }
    case "swiki": {
      const parsed = parseTsv(input.bytes, {
        filename: input.filename,
        sitematrix: deps.sitematrix,
      });
      if (!parsed.ok) return parsed;
      // The file's own dbname (filename or sidecar) is fact; the user's
      // choice only fills the gap SPEC §7.2 says must be filled.
      const chosen =
        input.dbname === undefined || input.dbname === "" ? undefined : input.dbname;
      const dbname = parsed.value.dbname ?? chosen;
      if (dbname === undefined) {
        return pickerErr("DBNAME_MISSING", STRINGS.dbnameFromFileMissing);
      }
      return pickerOk({
        selection: { dbname, pages: parsed.value.pages, source: { type: "swiki" } },
        report: { ingested: parsed.value.pages.length, dropped: 0 },
      });
    }
    case "petscan": {
      const fetched = await fetchPetscanSelection(input.url, {
        sitematrix: deps.sitematrix,
        fetch: deps.fetch,
      });
      if (!fetched.ok) return fetched;
      return pickerOk({
        selection: fetched.value,
        report: { ingested: fetched.value.pages.length, dropped: 0 },
      });
    }
    case "sparql": {
      if (input.dbname === "") return pickerErr("DBNAME_MISSING", STRINGS.dbnameRequired);
      const fetched = await fetchSparqlSelection({
        dbname: input.dbname,
        endpoint: input.endpoint,
        query: input.query,
        sitematrix: deps.sitematrix,
        fetch: deps.fetch,
      });
      if (!fetched.ok) return fetched;
      return pickerOk(fetched.value);
    }
    case "quarry": {
      const fetched = await fetchQuarrySelection(input.url, { fetch: deps.fetch });
      if (!fetched.ok) return fetched;
      return pickerOk({
        selection: fetched.value,
        report: { ingested: fetched.value.pages.length, dropped: 0 },
      });
    }
  }
}
```

- [ ] **Step 5: Run the tests**

Run: `npm run test -w @audiodude/selection-picker -- ingest`
Expected: PASS, 11 tests. The `dynamic: true` flags on petscan/sparql/quarry sources come from core and are asserted implicitly by the fixture equality.

- [ ] **Step 6: Typecheck and commit**

```bash
npm run typecheck -w @audiodude/selection-picker
git add packages/selection-picker
git commit -m "$(cat <<'EOF'
Add picker ingest pipeline for all five input modes

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Presentation layer — stylesheet, form templates, seed mapping

**Files:**
- Create: `packages/selection-picker/src/styles.ts`
- Create: `packages/selection-picker/src/forms.ts`
- Create: `packages/selection-picker/src/seed.ts`
- Test: `packages/selection-picker/test/forms.test.ts`, `packages/selection-picker/test/seed.test.ts`

**Interfaces:**
- Consumes: `lit` (`css`, `html`, `nothing`, `TemplateResult`); `ingest.ts` (`Mode`); `strings.ts`; core's `Selection`.
- Produces:
  - `styles.ts`: `pickerStyles: CSSResult`.
  - `forms.ts`: `interface FormState { dbname: string; manualText: string; filename: string; petscanUrl: string; sparqlEndpoint: string; sparqlQuery: string; quarryUrl: string }`, `interface FormCallbacks { update(patch: Partial<FormState>): void; selectFile(file: File | null): void }`, `renderProjectPicker(value: string, domains: string[], cb: FormCallbacks): TemplateResult`, `renderForm(mode: Mode, state: FormState, showProject: boolean, domains: string[], cb: FormCallbacks): TemplateResult`.
  - `seed.ts`: `interface SeedState { mode: Mode; state: Partial<FormState> }`, `seedState(seed: Selection): SeedState`.

Everything in this task is pure: no state, no fetching, no `document`. The element (Task 6) owns all of that.

- [ ] **Step 1: Write the failing forms test**

`packages/selection-picker/test/forms.test.ts`:

```ts
import { html, render } from "lit";
import { beforeEach, expect, test } from "vitest";
import { renderForm, type FormCallbacks, type FormState } from "../src/forms.js";
import { setValue } from "./helpers.js";

const blank: FormState = {
  dbname: "",
  manualText: "",
  filename: "",
  petscanUrl: "",
  sparqlEndpoint: "https://query.wikidata.org/sparql",
  sparqlQuery: "",
  quarryUrl: "",
};

let patches: Array<Partial<FormState>>;
let files: Array<File | null>;
let cb: FormCallbacks;
let host: HTMLElement;

beforeEach(() => {
  patches = [];
  files = [];
  cb = {
    update: (patch) => patches.push(patch),
    selectFile: (file) => files.push(file),
  };
  document.body.innerHTML = `<div id="host"></div>`;
  host = document.getElementById("host")!;
});

function show(
  mode: Parameters<typeof renderForm>[0],
  state: FormState = blank,
  showProject = false,
  domains: string[] = [],
): void {
  render(html`${renderForm(mode, state, showProject, domains, cb)}`, host);
}

test("the project picker lists domains and reports the chosen one", () => {
  show("manual", blank, true, ["en.wikipedia.org", "de.wikipedia.org"]);
  const options = [...host.querySelectorAll("datalist option")].map((o) =>
    o.getAttribute("value"),
  );
  expect(options).toEqual(["en.wikipedia.org", "de.wikipedia.org"]);

  setValue(host.querySelector("input[part=project]") as HTMLInputElement, "de.wikipedia.org");
  expect(patches).toEqual([{ dbname: "de.wikipedia.org" }]);
});

test("the project picker is omitted when the host fixed the project", () => {
  show("manual", blank, false, []);
  expect(host.querySelector("input[part=project]")).toBeNull();
});

test("manual mode reports typed text", () => {
  show("manual");
  setValue(host.querySelector("textarea[part=manual]") as HTMLTextAreaElement, "Paris\nBerlin");
  expect(patches).toEqual([{ manualText: "Paris\nBerlin" }]);
});

test("swiki mode reports the chosen file and shows its name", () => {
  show("swiki", { ...blank, filename: "list.enwiki.swiki" });
  expect(host.querySelector("p[part=filename]")!.textContent).toContain("list.enwiki.swiki");

  const input = host.querySelector("input[part=file]") as HTMLInputElement;
  expect(input.type).toBe("file");
  const file = new File([new TextEncoder().encode("Paris\n")], "picked.swiki");
  const transfer = new DataTransfer();
  transfer.items.add(file);
  input.files = transfer.files;
  input.dispatchEvent(new Event("change"));
  expect(files.map((f) => f?.name)).toEqual(["picked.swiki"]);
});

test("swiki mode with no file yet says so", () => {
  show("swiki");
  expect(host.querySelector("p[part=filename]")!.textContent).toContain("No file selected");
});

test("petscan and quarry modes report their URLs and show no project picker", () => {
  show("petscan");
  expect(host.querySelector("input[part=project]")).toBeNull();
  setValue(host.querySelector("input[part=petscan-url]") as HTMLInputElement, "https://p/?psid=1");
  expect(patches).toEqual([{ petscanUrl: "https://p/?psid=1" }]);

  patches = [];
  show("quarry");
  setValue(host.querySelector("input[part=quarry-url]") as HTMLInputElement, "https://q/query/1");
  expect(patches).toEqual([{ quarryUrl: "https://q/query/1" }]);
});

test("sparql mode exposes endpoint, query, and the required project field", () => {
  show("sparql", blank, true, ["en.wikipedia.org"]);
  const endpoint = host.querySelector("input[part=sparql-endpoint]") as HTMLInputElement;
  expect(endpoint.value).toBe("https://query.wikidata.org/sparql");
  expect(host.querySelector("input[part=project]")).not.toBeNull();

  setValue(endpoint, "https://query.wikidata.org/bigdata/namespace/wdq/sparql");
  setValue(
    host.querySelector("textarea[part=sparql-query]") as HTMLTextAreaElement,
    "SELECT ?url {}",
  );
  expect(patches).toEqual([
    { sparqlEndpoint: "https://query.wikidata.org/bigdata/namespace/wdq/sparql" },
    { sparqlQuery: "SELECT ?url {}" },
  ]);
});
```

- [ ] **Step 2: Write the failing seed test**

`packages/selection-picker/test/seed.test.ts`:

```ts
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
  });
});

test("simple, swiki, unknown, and absent sources rehydrate as editable title lines", () => {
  const pages: Selection["pages"] = ["Paris", ["Statue_of_Liberty", 28617], ["Talk_x", null, 1]];
  const expected = { dbname: "enwiki", manualText: "Paris\nStatue_of_Liberty\nTalk_x" };

  for (const source of [
    { type: "simple" },
    { type: "swiki" },
    { type: "pagepile", url: "https://pagepile.toolforge.org/api.php?id=1" },
    undefined,
  ]) {
    const seed: Selection =
      source === undefined ? { dbname: "enwiki", pages } : { dbname: "enwiki", pages, source };
    expect(seedState(seed)).toEqual({ mode: "manual", state: expected });
  }
});
```

- [ ] **Step 3: Run both to verify they fail**

Run: `npm run test -w @audiodude/selection-picker -- forms seed`
Expected: FAIL — `../src/forms.js` and `../src/seed.js` not found.

- [ ] **Step 4: Write `src/styles.ts`**

```ts
import { css } from "lit";

/**
 * Delivered as a constructable stylesheet (no injected <style>, no inline
 * style attributes) so a host with a strict CSP needs no style-src
 * 'unsafe-inline'. Hosts theme via the exposed part names.
 */
export const pickerStyles = css`
  :host {
    --sp-gap: 0.75rem;
    font: inherit;
  }

  dialog {
    width: min(40rem, 92vw);
    border: 1px solid #a2a9b1;
    border-radius: 4px;
    padding: 1rem;
    color: #202122;
    background: #fff;
  }

  dialog::backdrop {
    background: rgb(0 0 0 / 0.4);
  }

  h2 {
    margin: 0 0 var(--sp-gap);
    font-size: 1.15rem;
  }

  nav {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    margin-bottom: var(--sp-gap);
  }

  nav button[aria-current="true"] {
    font-weight: 600;
    border-bottom: 2px solid #3366cc;
  }

  section {
    display: flex;
    flex-direction: column;
    gap: var(--sp-gap);
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  input,
  textarea {
    font: inherit;
    padding: 0.35rem;
    border: 1px solid #a2a9b1;
    border-radius: 2px;
  }

  textarea {
    resize: vertical;
  }

  p[part="error"] {
    margin: var(--sp-gap) 0 0;
    color: #b32424;
  }

  p[part="summary"] {
    margin: var(--sp-gap) 0 0;
    color: #14866d;
  }

  p[part="filename"] {
    margin: 0;
    color: #54595d;
  }

  footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 1rem;
  }

  button {
    font: inherit;
    padding: 0.35rem 0.75rem;
    border: 1px solid #a2a9b1;
    border-radius: 2px;
    background: #f8f9fa;
    cursor: pointer;
  }

  button:disabled {
    color: #72777d;
    cursor: default;
  }
`;
```

- [ ] **Step 5: Write `src/forms.ts`**

```ts
import { html, nothing, type TemplateResult } from "lit";
import type { Mode } from "./ingest.js";
import { STRINGS } from "./strings.js";

/** Everything the user can type. The element owns it; forms only read it. */
export interface FormState {
  /** Project field text: a domain, or a dbname when prefilled by a seed. */
  dbname: string;
  manualText: string;
  /** Display name of the chosen file; the File itself lives in the element. */
  filename: string;
  petscanUrl: string;
  sparqlEndpoint: string;
  sparqlQuery: string;
  quarryUrl: string;
}

export interface FormCallbacks {
  update(patch: Partial<FormState>): void;
  selectFile(file: File | null): void;
}

/** SPEC §4.2 domains, offered as a datalist so typing and picking both work. */
export function renderProjectPicker(
  value: string,
  domains: string[],
  cb: FormCallbacks,
): TemplateResult {
  return html`<label>
    <span>${STRINGS.projectLabel}</span>
    <input
      part="project"
      list="sp-projects"
      placeholder=${STRINGS.projectPlaceholder}
      .value=${value}
      @input=${(e: Event) => cb.update({ dbname: (e.target as HTMLInputElement).value })}
    />
    <datalist id="sp-projects">
      ${domains.map((domain) => html`<option value=${domain}></option>`)}
    </datalist>
  </label>`;
}

/**
 * The form for one input mode. `showProject` is the element's decision:
 * true only for the modes whose dbname is user input (manual, swiki, sparql)
 * and only when the host has not pinned exactly one dbname. PetScan and
 * Quarry never show it — their dbname comes from upstream (SPEC §7.3, §7.5).
 */
export function renderForm(
  mode: Mode,
  state: FormState,
  showProject: boolean,
  domains: string[],
  cb: FormCallbacks,
): TemplateResult {
  const project = showProject ? renderProjectPicker(state.dbname, domains, cb) : nothing;
  switch (mode) {
    case "manual":
      return html`${project}
        <label>
          <span>${STRINGS.manualLabel}</span>
          <textarea
            part="manual"
            rows="10"
            .value=${state.manualText}
            @input=${(e: Event) =>
              cb.update({ manualText: (e.target as HTMLTextAreaElement).value })}
          ></textarea>
        </label>`;
    case "swiki":
      return html`${project}
        <label>
          <span>${STRINGS.swikiLabel}</span>
          <input
            part="file"
            type="file"
            accept=".swiki,.tsv,text/tab-separated-values,text/plain"
            @change=${(e: Event) =>
              cb.selectFile((e.target as HTMLInputElement).files?.[0] ?? null)}
          />
        </label>
        <p part="filename">${state.filename === "" ? STRINGS.noFile : state.filename}</p>`;
    case "petscan":
      return html`<label>
        <span>${STRINGS.petscanLabel}</span>
        <input
          part="petscan-url"
          type="url"
          inputmode="url"
          placeholder="https://petscan.wmcloud.org/?psid=12345678"
          .value=${state.petscanUrl}
          @input=${(e: Event) => cb.update({ petscanUrl: (e.target as HTMLInputElement).value })}
        />
      </label>`;
    case "sparql":
      return html`${project}
        <label>
          <span>${STRINGS.sparqlEndpointLabel}</span>
          <input
            part="sparql-endpoint"
            type="url"
            inputmode="url"
            .value=${state.sparqlEndpoint}
            @input=${(e: Event) =>
              cb.update({ sparqlEndpoint: (e.target as HTMLInputElement).value })}
          />
        </label>
        <label>
          <span>${STRINGS.sparqlQueryLabel}</span>
          <textarea
            part="sparql-query"
            rows="8"
            .value=${state.sparqlQuery}
            @input=${(e: Event) =>
              cb.update({ sparqlQuery: (e.target as HTMLTextAreaElement).value })}
          ></textarea>
        </label>`;
    case "quarry":
      return html`<label>
        <span>${STRINGS.quarryLabel}</span>
        <input
          part="quarry-url"
          type="url"
          inputmode="url"
          placeholder="https://quarry.wmcloud.org/query/104907"
          .value=${state.quarryUrl}
          @input=${(e: Event) => cb.update({ quarryUrl: (e.target as HTMLInputElement).value })}
        />
      </label>`;
  }
}
```

- [ ] **Step 6: Write `src/seed.ts`**

```ts
import type { Selection } from "@audiodude/selection-core";
import type { FormState } from "./forms.js";
import type { Mode } from "./ingest.js";

export interface SeedState {
  mode: Mode;
  state: Partial<FormState>;
}

/**
 * open(seed) prefill. A dynamic source rehydrates its query, never its
 * materialized list (decision record #12) — reloading re-materializes it. A
 * swiki seed cannot rehydrate a File, so its titles become editable manual
 * text; unrecognized types are static (SPEC §6.1) and do the same. The
 * emitted source then honestly becomes `simple`: the user is editing a title
 * list, not re-uploading a file.
 *
 * `state.dbname` may be a dbname here: resolveDbname falls back to treating
 * an unrecognized project field as one.
 */
export function seedState(seed: Selection): SeedState {
  const source = seed.source;
  switch (source?.type) {
    case "petscan":
      return { mode: "petscan", state: { dbname: seed.dbname, petscanUrl: source.url ?? "" } };
    case "quarry":
      return { mode: "quarry", state: { dbname: seed.dbname, quarryUrl: source.url ?? "" } };
    case "sparql":
      // An absent endpoint stays empty rather than falling back to WDQS: the
      // endpoint is part of the source's identity, not a picker default.
      return {
        mode: "sparql",
        state: {
          dbname: seed.dbname,
          sparqlEndpoint: source.endpoint ?? "",
          sparqlQuery: source.query ?? "",
        },
      };
    default:
      return {
        mode: "manual",
        state: {
          dbname: seed.dbname,
          manualText: seed.pages
            .map((page) => (typeof page === "string" ? page : page[0]))
            .join("\n"),
        },
      };
  }
}
```

- [ ] **Step 7: Run the tests**

Run: `npm run test -w @audiodude/selection-picker -- forms seed`
Expected: PASS, 11 tests.

- [ ] **Step 8: Typecheck and commit**

```bash
npm run typecheck -w @audiodude/selection-picker
git add packages/selection-picker
git commit -m "$(cat <<'EOF'
Add picker stylesheet, per-mode form templates, and seed mapping

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: The `<selection-picker>` element

**Files:**
- Create: `packages/selection-picker/src/selection-picker.ts`
- Create: `packages/selection-picker/src/index.ts`
- Test: `packages/selection-picker/test/picker.test.ts`, `packages/selection-picker/test/picker-seed.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–5, plus core's `defaultFetch`, `Selection`, `Sitematrix`, `FetchLike`.
- Produces:
  - `class SelectionPicker extends LitElement` — attributes `dbname`, `max-bytes`, `max-items`, `proxy`; property `fetchImpl?: FetchLike`; method `open(seed?: Selection): Promise<Selection>`; event `selection` (`CustomEvent<Selection>`, `bubbles: true`, `composed: true`).
  - `index.ts`: guarded `customElements.define("selection-picker", SelectionPicker)` plus re-exports (`SelectionPicker`, `SITEMATRIX_URL`, and the `Mode` / `IngestOutcome` / `IngestReport` / `PickerError` / `PickerErrorCode` / `PickerResult` types).

Timing note for the tests below: `open()` starts an async sitematrix load, and
`#load()` is fired from a click handler, so a single `await el.updateComplete`
is not enough to observe either. Every test uses the `settle(el)` helper — one
macrotask turn plus a render — after any action. Never add timeouts to
production code to make a test pass.

- [ ] **Step 1: Write the failing component test**

`packages/selection-picker/test/picker.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, expect, test } from "vitest";
import type { Selection } from "@audiodude/selection-core";
import "../src/index.js";
import type { SelectionPicker } from "../src/selection-picker.js";
import { resetSitematrixCache } from "../src/sitematrix-source.js";
import { fakeFetch, FIXTURES, readFixtureJson, setValue, type Route } from "./helpers.js";

const sitematrixRoute: Route = {
  match: "action=sitematrix",
  json: JSON.parse(readFileSync(join(FIXTURES, "sitematrix.json"), "utf8")),
};

function mount(attrs: string, routes: Route[] = []): SelectionPicker {
  document.body.innerHTML = `<selection-picker ${attrs}></selection-picker>`;
  const el = document.querySelector("selection-picker") as SelectionPicker;
  el.fetchImpl = fakeFetch([sitematrixRoute, ...routes]);
  return el;
}

/** Flush pending promises (fetches, ingest) and the following render. */
async function settle(el: SelectionPicker): Promise<void> {
  await el.updateComplete;
  await new Promise((resolve) => setTimeout(resolve, 0));
  await el.updateComplete;
}

function shadow<T extends Element>(el: SelectionPicker, selector: string): T {
  const found = el.renderRoot.querySelector<T>(selector);
  if (found === null) throw new Error(`no ${selector} in the picker's shadow root`);
  return found;
}

async function click(el: SelectionPicker, selector: string): Promise<void> {
  shadow<HTMLButtonElement>(el, selector).click();
  await settle(el);
}

beforeEach(() => {
  resetSitematrixCache();
});

test("manual mode: load, report, confirm — resolves and emits the Selection", async () => {
  const el = mount(`dbname="enwiki"`);
  const events: Selection[] = [];
  document.addEventListener("selection", (e) => events.push((e as CustomEvent<Selection>).detail));

  const pending = el.open();
  await settle(el);
  expect(shadow<HTMLDialogElement>(el, "dialog").open).toBe(true);
  // A single-entry dbname allowlist pins the project: no picker shown.
  expect(el.renderRoot.querySelector("input[part=project]")).toBeNull();

  setValue(shadow<HTMLTextAreaElement>(el, "textarea[part=manual]"), "Statue of Liberty\nParis");
  await click(el, "button[part=load]");
  expect(shadow(el, "p[part=summary]").textContent?.trim()).toBe(
    "Ingested 2 items from en.wikipedia.org.",
  );

  await click(el, "button[part=confirm]");
  const selection = await pending;
  expect(selection).toEqual({
    dbname: "enwiki",
    pages: ["Statue_of_Liberty", "Paris"],
    source: { type: "simple" },
  });
  expect(events).toEqual([selection]);
  expect(shadow<HTMLDialogElement>(el, "dialog").open).toBe(false);
});

test("cancelling rejects with an AbortError and emits nothing", async () => {
  const el = mount(`dbname="enwiki"`);
  const events: unknown[] = [];
  document.addEventListener("selection", (e) => events.push(e));

  const pending = el.open();
  await settle(el);
  await click(el, "button[part=cancel]");

  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  expect(events).toEqual([]);
});

test("closing the dialog by any means (Escape, dialog.close) rejects too", async () => {
  const el = mount(`dbname="enwiki"`);
  const pending = el.open();
  await settle(el);
  shadow<HTMLDialogElement>(el, "dialog").close();
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
});

test("PetScan mode fetches upstream and keeps the source verbatim", async () => {
  const meta = readFixtureJson("petscan", "manual-list", "meta.json");
  const el = mount(`dbname="enwiki"`, [
    { match: "petscan.wmcloud.org", json: readFixtureJson("petscan", "manual-list", "input.json") },
  ]);

  const pending = el.open();
  await settle(el);
  await click(el, "nav button[data-mode=petscan]");
  setValue(shadow<HTMLInputElement>(el, "input[part=petscan-url]"), meta.params.url);
  await click(el, "button[part=load]");
  await click(el, "button[part=confirm]");

  const selection = await pending;
  expect(selection.source).toEqual({ type: "petscan", url: meta.params.url, dynamic: true });
  expect(selection.pages.length).toBe(3);
});

test("SPARQL mode reports dropped rows in the summary", async () => {
  const meta = readFixtureJson("sparql", "dropped-rows-reported", "meta.json");
  const el = mount(`dbname="enwiki"`, [
    {
      match: "query.wikidata.org",
      json: readFixtureJson("sparql", "dropped-rows-reported", "input.json"),
    },
  ]);

  const pending = el.open();
  await settle(el);
  await click(el, "nav button[data-mode=sparql]");
  setValue(shadow<HTMLTextAreaElement>(el, "textarea[part=sparql-query]"), meta.params.query);
  await click(el, "button[part=load]");

  expect(shadow(el, "p[part=summary]").textContent?.trim()).toBe(
    "Ingested 2 items, dropped 2 rows not on en.wikipedia.org.",
  );
  await click(el, "button[part=confirm]");
  const selection = await pending;
  expect(selection.source).toMatchObject({ type: "sparql", dynamic: true });
});

test("a cap violation is shown, blocks confirm, and leaves the promise pending", async () => {
  const el = mount(`dbname="enwiki" max-items="1"`);
  let settled = false;
  const pending = el.open();
  void pending.then(
    () => (settled = true),
    () => (settled = true),
  );
  await settle(el);

  setValue(shadow<HTMLTextAreaElement>(el, "textarea[part=manual]"), "Paris\nBerlin");
  await click(el, "button[part=load]");

  expect(shadow(el, "p[part=error]").textContent?.trim()).toBe(
    "This selection has 2 items; this page accepts at most 1.",
  );
  expect(shadow<HTMLButtonElement>(el, "button[part=confirm]").disabled).toBe(true);
  expect(settled).toBe(false);
});

test("an upstream dbname outside the allowlist is reported as domains", async () => {
  const meta = readFixtureJson("petscan", "manual-list", "meta.json");
  const el = mount(`dbname="dewiki"`, [
    { match: "petscan.wmcloud.org", json: readFixtureJson("petscan", "manual-list", "input.json") },
  ]);

  el.open().catch(() => undefined);
  await settle(el);
  await click(el, "nav button[data-mode=petscan]");
  setValue(shadow<HTMLInputElement>(el, "input[part=petscan-url]"), meta.params.url);
  await click(el, "button[part=load]");

  expect(shadow(el, "p[part=error]").textContent?.trim()).toBe(
    "Your URL names en.wikipedia.org, but this page is only configured to accept de.wikipedia.org.",
  );
});

test("with no dbname attribute the project picker offers every project", async () => {
  const el = mount("");
  el.open().catch(() => undefined);
  await settle(el);

  const options = [...el.renderRoot.querySelectorAll("datalist option")];
  expect(options.length).toBe(33); // every site in fixtures/sitematrix.json
  setValue(shadow<HTMLInputElement>(el, "input[part=project]"), "de.wikipedia.org");
  setValue(shadow<HTMLTextAreaElement>(el, "textarea[part=manual]"), "Berlin");
  await click(el, "button[part=load]");
  expect(shadow(el, "p[part=summary]").textContent?.trim()).toBe(
    "Ingested 1 item from de.wikipedia.org.",
  );
});

test("swiki mode: a file that names no project prompts for one, then succeeds", async () => {
  const el = mount("");
  el.open().catch(() => undefined);
  await settle(el);
  await click(el, "nav button[data-mode=swiki]");

  const input = shadow<HTMLInputElement>(el, "input[part=file]");
  const transfer = new DataTransfer();
  transfer.items.add(new File([new TextEncoder().encode("Paris\t54321\n")], "list.tsv"));
  input.files = transfer.files;
  input.dispatchEvent(new Event("change"));
  await settle(el);
  expect(shadow(el, "p[part=filename]").textContent?.trim()).toBe("list.tsv");

  await click(el, "button[part=load]");
  expect(shadow(el, "p[part=error]").textContent?.trim()).toBe(
    "This file does not name a project. Choose the Wikimedia project its titles belong to.",
  );

  setValue(shadow<HTMLInputElement>(el, "input[part=project]"), "en.wikipedia.org");
  await click(el, "button[part=load]");
  expect(shadow(el, "p[part=summary]").textContent?.trim()).toBe(
    "Ingested 1 item from en.wikipedia.org.",
  );
});

test("swiki mode with no file chosen says so instead of loading", async () => {
  const el = mount(`dbname="enwiki"`);
  el.open().catch(() => undefined);
  await settle(el);
  await click(el, "nav button[data-mode=swiki]");
  await click(el, "button[part=load]");
  expect(shadow(el, "p[part=error]").textContent?.trim()).toBe(
    "Choose a .swiki or TSV file first.",
  );
});

test("editing a field after a successful load clears the stale result", async () => {
  const el = mount(`dbname="enwiki"`);
  el.open().catch(() => undefined);
  await settle(el);
  setValue(shadow<HTMLTextAreaElement>(el, "textarea[part=manual]"), "Paris");
  await click(el, "button[part=load]");
  expect(el.renderRoot.querySelector("p[part=summary]")).not.toBeNull();

  setValue(shadow<HTMLTextAreaElement>(el, "textarea[part=manual]"), "Paris\nBerlin");
  await settle(el);
  expect(el.renderRoot.querySelector("p[part=summary]")).toBeNull();
  expect(shadow<HTMLButtonElement>(el, "button[part=confirm]").disabled).toBe(true);
});

test("the proxy attribute routes upstream requests through the host proxy", async () => {
  const meta = readFixtureJson("petscan", "manual-list", "meta.json");
  const fetch = fakeFetch([
    { match: "action=sitematrix", json: sitematrixRoute.json },
    { match: "url=https%3A%2F%2Fpetscan", json: readFixtureJson("petscan", "manual-list", "input.json") },
  ]);
  document.body.innerHTML = `<selection-picker dbname="enwiki" proxy="https://host.example/p"></selection-picker>`;
  const el = document.querySelector("selection-picker") as SelectionPicker;
  el.fetchImpl = fetch;

  el.open().catch(() => undefined);
  await settle(el);
  await click(el, "nav button[data-mode=petscan]");
  setValue(shadow<HTMLInputElement>(el, "input[part=petscan-url]"), meta.params.url);
  await click(el, "button[part=load]");

  expect(el.renderRoot.querySelector("p[part=error]")).toBeNull();
  expect(fetch.calls.every((url) => url.startsWith("https://host.example/p?url="))).toBe(true);
});

test("defining the element twice does not throw (double-loaded CDN tags)", async () => {
  await import("../src/index.js");
  expect(customElements.get("selection-picker")).toBeDefined();
});
```

- [ ] **Step 2: Write the failing seed component test**

`packages/selection-picker/test/picker-seed.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, expect, test } from "vitest";
import "../src/index.js";
import type { SelectionPicker } from "../src/selection-picker.js";
import { resetSitematrixCache } from "../src/sitematrix-source.js";
import { fakeFetch, FIXTURES, setValue, type Route } from "./helpers.js";

const sitematrixRoute: Route = {
  match: "action=sitematrix",
  json: JSON.parse(readFileSync(join(FIXTURES, "sitematrix.json"), "utf8")),
};

async function settle(el: SelectionPicker): Promise<void> {
  await el.updateComplete;
  await new Promise((resolve) => setTimeout(resolve, 0));
  await el.updateComplete;
}

beforeEach(() => {
  resetSitematrixCache();
});

test("open(seed) prefills a petscan query, and reloading re-materializes it", async () => {
  document.body.innerHTML = `<selection-picker dbname="enwiki"></selection-picker>`;
  const el = document.querySelector("selection-picker") as SelectionPicker;
  const petscanInput = JSON.parse(
    readFileSync(join(FIXTURES, "petscan", "manual-list", "input.json"), "utf8"),
  );
  el.fetchImpl = fakeFetch([
    sitematrixRoute,
    { match: "petscan.wmcloud.org", json: petscanInput },
  ]);

  const url = "https://petscan.wmcloud.org/?language=en&project=wikipedia&manual_list_wiki=enwiki";
  const pending = el.open({
    dbname: "enwiki",
    pages: ["stale"],
    source: { type: "petscan", url, dynamic: true },
  });
  await settle(el);

  const field = el.renderRoot.querySelector("input[part=petscan-url]") as HTMLInputElement;
  expect(field.value).toBe(url);

  (el.renderRoot.querySelector("button[part=load]") as HTMLButtonElement).click();
  await settle(el);
  (el.renderRoot.querySelector("button[part=confirm]") as HTMLButtonElement).click();

  const selection = await pending;
  // Re-materialized from the source; the seed's stale pages are gone.
  expect(selection.pages.length).toBe(3);
  expect(selection.source).toEqual({ type: "petscan", url, dynamic: true });
});

test("open(seed) for a static seed round-trips editable titles back out", async () => {
  document.body.innerHTML = `<selection-picker dbname="enwiki"></selection-picker>`;
  const el = document.querySelector("selection-picker") as SelectionPicker;
  el.fetchImpl = fakeFetch([sitematrixRoute]);

  const pending = el.open({
    dbname: "enwiki",
    pages: ["Paris", ["Statue_of_Liberty", 28617]],
    source: { type: "swiki" },
  });
  await settle(el);

  const textarea = el.renderRoot.querySelector("textarea[part=manual]") as HTMLTextAreaElement;
  expect(textarea.value).toBe("Paris\nStatue_of_Liberty");
  setValue(textarea, "Paris\nStatue_of_Liberty\nBerlin");
  (el.renderRoot.querySelector("button[part=load]") as HTMLButtonElement).click();
  await settle(el);
  (el.renderRoot.querySelector("button[part=confirm]") as HTMLButtonElement).click();

  const selection = await pending;
  expect(selection).toEqual({
    dbname: "enwiki",
    pages: ["Paris", "Statue_of_Liberty", "Berlin"],
    source: { type: "simple" }, // the user is editing titles now, not a file
  });
});

test("a second open() after a cancel starts from the new seed, not the old state", async () => {
  document.body.innerHTML = `<selection-picker dbname="enwiki"></selection-picker>`;
  const el = document.querySelector("selection-picker") as SelectionPicker;
  el.fetchImpl = fakeFetch([sitematrixRoute]);

  const first = el.open({ dbname: "enwiki", pages: ["Paris"], source: { type: "simple" } });
  await settle(el);
  (el.renderRoot.querySelector("button[part=cancel]") as HTMLButtonElement).click();
  await expect(first).rejects.toMatchObject({ name: "AbortError" });

  const second = el.open({ dbname: "enwiki", pages: ["Berlin"], source: { type: "simple" } });
  await settle(el);
  const textarea = el.renderRoot.querySelector("textarea[part=manual]") as HTMLTextAreaElement;
  expect(textarea.value).toBe("Berlin");

  (el.renderRoot.querySelector("button[part=cancel]") as HTMLButtonElement).click();
  await expect(second).rejects.toMatchObject({ name: "AbortError" });
});
```

- [ ] **Step 3: Run both to verify they fail**

Run: `npm run test -w @audiodude/selection-picker -- picker`
Expected: FAIL — `../src/index.js` not found.

- [ ] **Step 4: Write `src/selection-picker.ts`**

```ts
import {
  defaultFetch,
  type FetchLike,
  type Selection,
  type Sitematrix,
} from "@audiodude/selection-core";
import { html, LitElement, nothing, type TemplateResult } from "lit";
import { parseAllowlist, resolveDbname } from "./dbname.js";
import { renderForm, type FormCallbacks, type FormState } from "./forms.js";
import { ingest, type IngestInput, type IngestOutcome, type Mode } from "./ingest.js";
import { proxyFetch } from "./proxy-fetch.js";
import { seedState } from "./seed.js";
import { loadSitematrix } from "./sitematrix-source.js";
import { pickerStyles } from "./styles.js";
import { STRINGS, userMessage } from "./strings.js";

const MODES: Mode[] = ["manual", "swiki", "petscan", "sparql", "quarry"];

const BLANK_STATE: FormState = {
  dbname: "",
  manualText: "",
  filename: "",
  petscanUrl: "",
  sparqlEndpoint: "https://query.wikidata.org/sparql",
  sparqlQuery: "",
  quarryUrl: "",
};

/**
 * Create-only Selection picker (decision record #1). Editing a stored
 * Selection is the host's concern; this element only produces new ones.
 */
export class SelectionPicker extends LitElement {
  static override styles = pickerStyles;

  static override properties = {
    dbname: { type: String },
    maxBytes: { type: Number, attribute: "max-bytes" },
    maxItems: { type: Number, attribute: "max-items" },
    proxy: { type: String },
    _mode: { state: true },
    _form: { state: true },
    _busy: { state: true },
    _ready: { state: true },
    _error: { state: true },
    _outcome: { state: true },
  };

  /** Comma-separated allowlist constraint; absent → the user picks. */
  declare dbname: string | null;
  /** Cap on the canonical Selection JSON's UTF-8 byte length. */
  declare maxBytes: number | null;
  declare maxItems: number | null;
  /** Escape hatch for hosts running their own materializer. */
  declare proxy: string | null;

  /** Test seam and host override: any WHATWG-compatible fetch. */
  fetchImpl?: FetchLike;

  declare private _mode: Mode;
  declare private _form: FormState;
  declare private _busy: boolean;
  declare private _ready: boolean;
  declare private _error: string | undefined;
  declare private _outcome: IngestOutcome | undefined;

  #sitematrix?: Sitematrix;
  #resolve?: (selection: Selection) => void;
  #reject?: (reason: unknown) => void;
  #file?: File;

  /**
   * Stable identity: recreating these per render would make Lit tear down and
   * re-add every field listener on every update.
   */
  readonly #callbacks: FormCallbacks = {
    update: (patch) => {
      this._form = { ...this._form, ...patch };
      this._outcome = undefined; // a stale result must never be confirmable
      this._error = undefined;
    },
    selectFile: (file) => {
      this.#file = file ?? undefined;
      this._form = { ...this._form, filename: file?.name ?? "" };
      this._outcome = undefined;
      this._error = undefined;
    },
  };

  constructor() {
    super();
    this.dbname = null;
    this.maxBytes = null;
    this.maxItems = null;
    this.proxy = null;
    this._mode = "manual";
    this._form = BLANK_STATE;
    this._busy = false;
    this._ready = false;
    this._error = undefined;
    this._outcome = undefined;
  }

  /**
   * Show the dialog and resolve with the Selection the user accepted.
   * Rejects with an AbortError DOMException if the user cancels or closes
   * the dialog. `seed` prefills one mode (see seed.ts).
   */
  open(seed?: Selection): Promise<Selection> {
    if (!this.isConnected) {
      throw new Error("<selection-picker>.open() requires the element to be in the document");
    }
    if (seed !== undefined) {
      const seeded = seedState(seed);
      this._mode = seeded.mode;
      this._form = { ...BLANK_STATE, ...seeded.state };
      this.#file = undefined;
    }
    this._error = undefined;
    this._outcome = undefined;
    const promise = new Promise<Selection>((resolve, reject) => {
      this.#resolve = resolve;
      this.#reject = reject;
    });
    void this.#show();
    return promise;
  }

  async #show(): Promise<void> {
    await this.updateComplete;
    this.#dialog.showModal();
    if (this.#sitematrix !== undefined) return;
    const sitematrix = await loadSitematrix({ fetch: this.#fetch });
    if (!sitematrix.ok) {
      this._error = STRINGS.sitematrixUnavailable;
      return;
    }
    this.#sitematrix = sitematrix.value;
    this._ready = true;
  }

  get #dialog(): HTMLDialogElement {
    const dialog = this.renderRoot.querySelector("dialog");
    if (dialog === null) throw new Error("<selection-picker> has not rendered yet");
    return dialog;
  }

  get #fetch(): FetchLike {
    const base = this.fetchImpl ?? defaultFetch();
    return this.proxy === null || this.proxy === "" ? base : proxyFetch(this.proxy, base);
  }

  async #load(): Promise<void> {
    const sitematrix = this.#sitematrix;
    if (sitematrix === undefined) return;
    const allowlist = parseAllowlist(this.dbname);
    const input = await this.#buildInput(allowlist, sitematrix);
    if (input === undefined) {
      this._error = STRINGS.noFileChosen;
      return;
    }
    this._busy = true;
    this._error = undefined;
    this._outcome = undefined;
    const result = await ingest(input, {
      sitematrix,
      fetch: this.#fetch,
      allowlist,
      ...(this.maxBytes === null ? {} : { maxBytes: this.maxBytes }),
      ...(this.maxItems === null ? {} : { maxItems: this.maxItems }),
    });
    this._busy = false;
    if (!result.ok) {
      this._error = userMessage(result.error);
      return;
    }
    this._outcome = result.value;
  }

  async #buildInput(
    allowlist: string[],
    sitematrix: Sitematrix,
  ): Promise<IngestInput | undefined> {
    const form = this._form;
    const dbname = resolveDbname(form.dbname, allowlist, sitematrix);
    switch (this._mode) {
      case "manual":
        return { mode: "manual", text: form.manualText, dbname };
      case "swiki": {
        const file = this.#file;
        if (file === undefined) return undefined;
        return {
          mode: "swiki",
          bytes: new Uint8Array(await file.arrayBuffer()),
          filename: file.name,
          ...(dbname === "" ? {} : { dbname }),
        };
      }
      case "petscan":
        return { mode: "petscan", url: form.petscanUrl.trim() };
      case "sparql":
        return {
          mode: "sparql",
          dbname,
          endpoint: form.sparqlEndpoint.trim(),
          query: form.sparqlQuery,
        };
      case "quarry":
        return { mode: "quarry", url: form.quarryUrl.trim() };
    }
  }

  #setMode(mode: Mode): void {
    this._mode = mode;
    this._outcome = undefined;
    this._error = undefined;
  }

  #confirm(): void {
    const outcome = this._outcome;
    if (outcome === undefined) return;
    const resolve = this.#resolve;
    this.#resolve = undefined;
    this.#reject = undefined; // closing must not also reject
    this.dispatchEvent(
      new CustomEvent<Selection>("selection", {
        detail: outcome.selection,
        bubbles: true,
        composed: true,
      }),
    );
    resolve?.(outcome.selection);
    this.#dialog.close();
  }

  #onClose(): void {
    const reject = this.#reject;
    this.#resolve = undefined;
    this.#reject = undefined;
    reject?.(new DOMException("selection cancelled", "AbortError"));
  }

  override render(): TemplateResult {
    const allowlist = parseAllowlist(this.dbname);
    const projectIsUserInput =
      this._mode === "manual" || this._mode === "swiki" || this._mode === "sparql";
    const domains =
      allowlist.length > 0
        ? allowlist.map((dbname) => this.#sitematrix?.domainFor(dbname) ?? dbname)
        : (this.#sitematrix?.sites() ?? []).map((site) => site.domain);
    const outcome = this._outcome;

    return html`<dialog part="dialog" @close=${() => this.#onClose()}>
      <h2 part="title">${STRINGS.dialogTitle}</h2>
      <nav part="tabs">
        ${MODES.map(
          (mode) => html`<button
            part="tab"
            data-mode=${mode}
            aria-current=${this._mode === mode ? "true" : "false"}
            @click=${() => this.#setMode(mode)}
          >
            ${STRINGS.modeLabels[mode]}
          </button>`,
        )}
      </nav>
      <section part="form">
        ${renderForm(
          this._mode,
          this._form,
          projectIsUserInput && allowlist.length !== 1,
          domains,
          this.#callbacks,
        )}
      </section>
      ${this._error === undefined
        ? nothing
        : html`<p part="error" role="alert">${this._error}</p>`}
      ${outcome === undefined
        ? nothing
        : html`<p part="summary">
            ${STRINGS.ingestSummary(
              outcome.report.ingested,
              outcome.report.dropped,
              this.#sitematrix?.domainFor(outcome.selection.dbname) ?? outcome.selection.dbname,
            )}
          </p>`}
      <footer part="actions">
        <button part="cancel" @click=${() => this.#dialog.close()}>${STRINGS.cancel}</button>
        <button
          part="load"
          ?disabled=${this._busy || !this._ready}
          @click=${() => void this.#load()}
        >
          ${this._busy ? STRINGS.loading : STRINGS.load}
        </button>
        <button part="confirm" ?disabled=${outcome === undefined} @click=${() => this.#confirm()}>
          ${STRINGS.confirm}
        </button>
      </footer>
    </dialog>`;
  }
}
```

- [ ] **Step 5: Write `src/index.ts`**

```ts
import { SelectionPicker } from "./selection-picker.js";

export { SelectionPicker } from "./selection-picker.js";
export { SITEMATRIX_URL } from "./sitematrix-source.js";
export type { IngestOutcome, IngestReport, Mode } from "./ingest.js";
export type { PickerError, PickerErrorCode, PickerResult } from "./result.js";

// Two hosts, or two CDN tags, must not throw on the second definition.
if (customElements.get("selection-picker") === undefined) {
  customElements.define("selection-picker", SelectionPicker);
}
```

- [ ] **Step 6: Run the component tests**

Run: `npm run test -w @audiodude/selection-picker -- picker`
Expected: PASS, 16 tests (13 in `picker.test.ts`, 3 in `picker-seed.test.ts`).

- [ ] **Step 7: Run the whole picker suite and typecheck**

Run: `npm run test -w @audiodude/selection-picker && npm run typecheck -w @audiodude/selection-picker`
Expected: PASS, all files.

- [ ] **Step 8: Commit**

```bash
git add packages/selection-picker
git commit -m "$(cat <<'EOF'
Add the <selection-picker> element: dialog, modes, promise and event

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Zero-build bundle, browser smoke test, documentation

**Files:**
- Create: `packages/selection-picker/examples/plain.html`
- Create: `packages/selection-picker/README.md`
- Modify: `README.md` (repo root)
- Modify: `packages/selection-core/README.md`
- Modify: `docs/tasks/03-selection-picker.md` (append a `## Log` section)

**Interfaces:**
- Consumes: everything built in Tasks 1–6.
- Produces: `dist/selection-picker.min.js` (gitignored build artifact) and the documented consumer contract. Publishing, semver, and the CDN URL are task 04's scope, not this task's.

- [ ] **Step 1: Build the bundle**

```bash
npm run build -w @audiodude/selection-picker
```

Expected: `packages/selection-picker/dist/selection-picker.min.js` written; esbuild prints one line with a size in the tens of kilobytes (Lit + core + picker, minified ESM). Verified 2026-08-29 that esbuild resolves the workspace `exports` entry pointing at TypeScript source.

- [ ] **Step 2: Write the acceptance page**

`packages/selection-picker/examples/plain.html` — one `<script type="module">`, one element, no bundler, no framework:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>selection-picker — plain HTML</title>
  </head>
  <body>
    <h1>selection-picker</h1>
    <button id="pick">Create a selection</button>
    <pre id="out">(nothing yet)</pre>

    <selection-picker id="picker" dbname="enwiki,dewiki" max-bytes="26214400"></selection-picker>

    <script type="module">
      import "../dist/selection-picker.min.js";

      const picker = document.getElementById("picker");
      const out = document.getElementById("out");

      picker.addEventListener("selection", (event) => {
        console.log("selection event", event.detail);
      });

      document.getElementById("pick").addEventListener("click", async () => {
        try {
          out.textContent = JSON.stringify(await picker.open(), null, 2);
        } catch (error) {
          out.textContent = error.name === "AbortError" ? "(cancelled)" : String(error);
        }
      });
    </script>
  </body>
</html>
```

- [ ] **Step 3: Serve the page**

```bash
cd packages/selection-picker && python3 -m http.server 8765
```

Run it as a managed background process (`hub` `op: "start"`, name `picker-example`, ready log `Serving HTTP`), not a foreground command.

- [ ] **Step 4: Drive the browser smoke test**

Open `http://localhost:8765/examples/plain.html` with the `browser` tool and run, in one cell:

```js
await tab.click("#pick");
await tab.waitForSelector("selection-picker");
const type = async (sel, value) => {
  await tab.evaluate((args) => {
    const field = document.getElementById("picker").renderRoot.querySelector(args.sel);
    field.value = args.value;
    field.dispatchEvent(new Event("input"));
  }, { sel, value });
};
const press = async (sel) => {
  await tab.evaluate((s) => document.getElementById("picker").renderRoot.querySelector(s).click(), sel);
  await new Promise((r) => setTimeout(r, 500));
};
await type("input[part=project]", "en.wikipedia.org");
await type("textarea[part=manual]", "Statue of Liberty\nParis\n# a comment\n");
await press("button[part=load]");
const summary = await tab.evaluate(() =>
  document.getElementById("picker").renderRoot.querySelector("p[part=summary]")?.textContent?.trim());
await press("button[part=confirm]");
const out = await tab.evaluate(() => document.getElementById("out").textContent);
display({ summary, out });
```

Expected: `summary` is `Ingested 2 items from en.wikipedia.org.` and `out` is the pretty-printed JSON

```json
{
  "dbname": "enwiki",
  "pages": [
    "Statue_of_Liberty",
    "Paris"
  ],
  "source": {
    "type": "simple"
  }
}
```

This exercises the live meta sitematrix fetch (`origin=*`, CORS-verified) through the real bundle, proving the no-bundler acceptance criterion. Stop the server process when done.

- [ ] **Step 5: Write the package README**

`packages/selection-picker/README.md`:

````markdown
# @audiodude/selection-picker

`<selection-picker>` — an embeddable custom element that lets a user of any
web tool build a [Selection](../../docs/SPEC.md) from pasted titles, a
`.swiki` upload, a PetScan URL, a SPARQL query, or a Quarry URL, and hands
the host canonical Selection JSON. Create-only: editing a stored Selection is
the host's concern.

Lit 3, Shadow DOM, native `<dialog>`, constructable stylesheets, no `eval` —
CSP-safe. All parsing, mapping, and validation come from
[`@audiodude/selection-core`](../selection-core/); all upstream fetches go
directly from the browser (PetScan, WDQS, and Quarry all serve
`Access-Control-Allow-Origin: *`).

## Use it in a plain HTML page

```html
<selection-picker id="picker" dbname="enwiki" max-bytes="26214400"></selection-picker>
<script type="module">
  import "https://cdn.example/selection-picker.min.js"; // see examples/plain.html
  const picker = document.getElementById("picker");
  const selection = await picker.open(); // rejects AbortError if cancelled
  console.log(selection); // { dbname, pages, source }
</script>
```

`examples/plain.html` is the runnable version: `npm run build -w @audiodude/selection-picker`,
serve the package directory, open `/examples/plain.html`.

## Attributes

| Attribute | Meaning |
|---|---|
| `dbname` | Comma-separated **allowlist** of dbnames. One entry pins the project and hides the project field. Several entries restrict the project field. Absent: every Wikimedia project is offered. A source-derived dbname outside the list is a hard error, phrased as domains ("Your URL names de.wikipedia.org, but this page is only configured to accept en.wikipedia.org."). |
| `max-bytes` | Cap on the UTF-8 byte length of the canonical Selection JSON. Exceeding it rejects; the widget never truncates. |
| `max-items` | Cap on `pages.length`. Same semantics. |
| `proxy` | Optional escape hatch for hosts running their own materializer. Upstream requests become `<proxy>?url=<encoded upstream URL>`; the proxy must return the upstream body unchanged. Nothing defaults to it. |

## API

- `open(seed?: Selection): Promise<Selection>` — shows the modal; resolves
  with the accepted Selection, rejects with a `DOMException` named
  `AbortError` if the user cancels or closes the dialog. Requires the element
  to be in the document. `seed` prefills one mode: `petscan`/`quarry`/`sparql`
  seeds reopen the **query** (reloading re-materializes it); `simple`,
  `swiki`, unrecognized, and absent source types rehydrate the pages as
  editable title lines and therefore emit `source: {type: "simple"}`.
- `selection` event — `CustomEvent<Selection>`, `bubbles`, `composed`,
  `detail` is the same Selection the promise resolves with.
- `fetchImpl?: FetchLike` — property (not attribute) overriding the fetch
  implementation. Test seam; hosts normally leave it alone.

## Emitted sources (SPEC §6)

| Mode | `source` |
|---|---|
| Paste titles | `{type: "simple"}` |
| `.swiki` upload | `{type: "swiki"}` |
| PetScan | `{type: "petscan", url, dynamic: true}` |
| SPARQL | `{type: "sparql", endpoint, query, dynamic: true}` |
| Quarry | `{type: "quarry", url, dynamic: true}` |

Every emitted Selection passes `selection-core`'s structural gate
(`validateSelection`, SPEC §8) before the widget hands it over, so a storing
system's own gate cannot be the first thing to reject it.

## dbname sources

`dbname` is never guessed. PetScan and Quarry report it (SPEC §7.3, §7.5);
`.swiki` carries it in the filename or sidecar (§5.1) and the widget prompts
when it does not (§7.2); pasted titles and SPARQL take it as user input
(§7.4). Valid dbnames come from the live meta sitematrix, fetched once per
page with `origin=*` (required: without it the API sends no CORS header).

## Development

```bash
npm run test -w @audiodude/selection-picker       # vitest + happy-dom
npm run typecheck -w @audiodude/selection-picker
npm run build -w @audiodude/selection-picker      # dist/selection-picker.min.js
```

Per-mode tests replay the repository's [conformance
fixtures](../../fixtures/) through the ingest pipeline, so the widget's
output is pinned to the same expectations as `selection-core`.

Lit is used **without decorators** (`static properties` + `declare`):
esbuild's standard-decorator transform, which both vitest and the bundle use,
is incompatible with Lit's decorators.

UI strings live in `src/strings.ts`; English-only v1.
````

- [ ] **Step 6: Update the root README**

In `README.md`, add to the `## Contents` list, after the `fixtures/` bullet:

```markdown
- [packages/selection-core/](packages/selection-core/) — isomorphic
  TypeScript implementation of the spec: parsers, source mappers,
  serializers, validators
- [packages/selection-picker/](packages/selection-picker/) — the
  `<selection-picker>` web component any web tool can embed
```

Then replace the `## Status` body (currently `**Specification + fixtures + core library.** Planned, in order:` and items 1–4) with:

```markdown
**Specification + fixtures + core library + picker widget.** Planned, in
order:

1. ~~Conformance fixtures~~ — done; see [fixtures/](fixtures/)
   (`scripts/lint_fixtures.py` checks the tree's internal consistency)
2. ~~`selection-core`~~ — done; see
   [packages/selection-core/](packages/selection-core/) — isomorphic
   TypeScript: parsers, source mappers, serializers, validators; passes all
   77 conformance fixtures (`npm test`)
3. ~~`selection-picker`~~ — done; see
   [packages/selection-picker/](packages/selection-picker/) — a
   `<selection-picker>` web component any web tool can embed to let users
   create Selections from manual entry, `.swiki` upload, PetScan, SPARQL, or
   Quarry
4. Packaging and npm/CDN distribution
5. Integration into [WP1](https://github.com/openzim/wp1)
```

- [ ] **Step 7: Document `sites()` in the core README**

In `packages/selection-core/README.md`, in the parsing/serializing example block, after the `Sitematrix.fromJson` lines, add:

```ts
sm.value.sites(); // → [{ dbname, domain }, ...] sorted by domain (project pickers)
```

- [ ] **Step 8: Append the task log**

Append to `docs/tasks/03-selection-picker.md`:

```markdown
## Log

**2026-08-29 — done.** `packages/selection-picker` (npm workspace): Lit 3,
Shadow DOM, native `<dialog>`, constructable stylesheets, no decorators
(esbuild's standard-decorator transform is incompatible with Lit's).
Attributes `dbname` (comma-separated allowlist), `max-bytes`, `max-items`,
`proxy`; `open(seed?)` resolves with the Selection or rejects `AbortError`;
`selection` CustomEvent is `bubbles`+`composed`.

- Three layers, tested separately: a DOM-free policy/ingest layer over
  `selection-core` (`src/ingest.ts` and friends), state-free Lit template
  functions (`src/forms.ts`, `src/seed.ts`), and one element
  (`src/selection-picker.ts`).
- Per-mode tests replay the repository's conformance fixtures through the
  ingest pipeline (`simple/pipeline-basic`, `tsv-parse/filename-dbname`,
  `petscan/manual-list`, `sparql/dropped-rows-reported`,
  `quarry/full-columns`), so the widget's output is pinned to the same
  expectations as `selection-core`.
- Every emitted Selection passes `validateSelection` (SPEC §8) before the
  host receives it; caps reject and never truncate; `max-bytes` measures
  `selectionJsonBytes`.
- Sitematrix is fetched once per page from meta with `origin=*` — verified
  2026-08-29 that the API sends no `Access-Control-Allow-Origin` header
  without that parameter. Failures are not cached, so reopening retries.
- `Sitematrix.sites()` was added to `selection-core` for the project picker;
  the lookup maps alone could not enumerate projects in a stable order.
- Seed rehydration: dynamic sources (`petscan`, `quarry`, `sparql`) reopen
  their query, never the materialized list; `simple`, `swiki`, unrecognized,
  and absent source types rehydrate as editable title lines and emit
  `source: {type: "simple"}` — a `File` cannot be rehydrated, and pretending
  otherwise would misreport provenance.
- Verified in a real browser via `examples/plain.html` and the built bundle:
  one `<script type="module">`, one element, no bundler, live sitematrix
  fetch, emitted Selection `{dbname: "enwiki", pages: [...],
  source: {type: "simple"}}`.
```

- [ ] **Step 9: Run everything**

```bash
npm test && npm run typecheck && python3 scripts/lint_fixtures.py
```

Expected: PASS — core's 77 conformance cases plus unit tests, the picker suite, both typecheck passes, and an unchanged fixture tree.

- [ ] **Step 10: Commit**

```bash
git add README.md docs/tasks/03-selection-picker.md packages/selection-core/README.md packages/selection-picker
git commit -m "$(cat <<'EOF'
Add zero-build bundle, example page, and selection-picker docs; task 03 complete

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 11: Host-side smoke test (manual, outside this repo)**

The task's third acceptance criterion is a creation-flow smoke test in the
WP1 dev frontend. That is a separate checkout and is not gated by this
repository's tests.

**Manual steps for the repo owner — do these yourself; the plan's automated
gates do not cover them:**

**1. In a WP1 dev checkout, `npm link` (or file-path install) `@audiodude/selection-picker` and mount `<selection-picker dbname="enwiki" max-bytes="26214400">` in the builder-creation view.**

**2. Create a selection in each mode (paste, `.swiki`, PetScan, SPARQL, Quarry) and confirm the emitted JSON is what WP1 stores in `b_params`.**

**3. Report anything WP1's own structural gate rejects — that would be a bug in this widget, since it runs the same gate before emitting.**

---

## Self-Review

**Spec/task coverage.** Task 03's Details and Acceptance map to tasks as
follows: Lit + Shadow DOM + native `<dialog>` + CSP-safe + `customElements.get`
guard → Tasks 1, 5, 6 (`toolchain.test.ts` pins constructable stylesheets;
the double-define test pins the guard); five input modes via `selection-core`
with no proxy → Task 4; `dbname` allowlist with domain-phrased conflicts →
Tasks 2, 4, 6; `max-bytes`/`max-items` → Tasks 2, 4, 6; `proxy` → Tasks 3, 6;
`open(seed?)` + composed `selection` event + per-mode `source` with
`dynamic: true` defaults → Tasks 5, 6; ingest feedback copy and the `.swiki`
dbname prompt → Tasks 2, 4, 6; externalized English strings → Task 2;
plain-HTML acceptance → Task 7; fixture agreement per mode → Task 4; WP1
smoke → Task 7 Step 11. SPEC §7.1–§7.5 mapping semantics belong to
`selection-core` and are re-asserted through fixtures rather than
reimplemented.

**Type consistency.** `PickerResult`/`PickerError`/`PickerErrorCode` (Task 1)
are used unchanged in Tasks 2–4. `Caps` (Task 2) is extended by `IngestDeps`
(Task 4). `FormState`/`FormCallbacks` (Task 5) are consumed by `SeedState`
(Task 5) and the element (Task 6). `Mode`, `IngestInput`, `IngestDeps`,
`IngestReport`, `IngestOutcome` (Task 4) are used verbatim in Task 6.
`Sitematrix.sites()` (Task 1) is called only in Task 6's `render`.
`resolveDbname`'s dbname fallback (Task 2) is what lets `seedState` (Task 5)
put a raw dbname in the project field.

**Test-timing convention.** Component tests never assert immediately after an
action: `settle(el)` flushes a macrotask turn and the following render. This
exists because `open()` starts an async sitematrix load and `#load()` is
fired from a click handler. Production code contains no timeouts.
