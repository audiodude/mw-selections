# Adversarial Review — 2026-08-29-selection-picker.md

> **Disposition 2026-08-29:** all eight recommended amendments plus L1, L2,
> L4, L5 and the citation/`localeCompare` notes applied to
> `2026-08-29-selection-picker.md`. Decisions taken: B1 → sitematrix never
> proxied; H1 → `seedState` omits ns ≠ 0 pages and returns an `omitted`
> count the element surfaces; H2/L4 → re-entrant `open()` and malformed cap
> attributes throw a plain `Error` (consistent with the existing
> not-connected contract); L3 → seedless `open()` starts blank.

**Verdict: not executable as written.** One test in Task 6 cannot pass (proxy test), two real
behavioral bugs are baked into the element design (seed namespace loss, `open()` re-entrancy),
and the Task 7 acceptance gate is flaky by construction. Everything else verified clean — see
"Verified sound" for what was checked and held.

Method: every core API the plan calls was checked against `packages/selection-core/src/`
(current code, not the README); every fixture path/shape against `fixtures/`; every normative
claim against `docs/SPEC.md`, `docs/decision-record.md`, `docs/tasks/03-selection-picker.md`;
test-count arithmetic and the 46-byte constant recomputed; the `localeCompare` vs code-unit
sort equivalence for `sites()` verified against the real 33 fixture domains.

---

## Blockers (plan fails as written)

### B1. The proxy component test can never pass — the sitematrix route can't match an encoded URL

Task 6 `picker.test.ts`, "the proxy attribute routes upstream requests through the host proxy"
(plan ~line 2222).

The element routes **all** fetches through `proxyFetch` (`#fetch` getter, plan ~line 2420),
including the sitematrix load in `#show()`. `proxyFetch` encodes the upstream URL with
`encodeURIComponent`, so the request becomes:

```
https://host.example/p?url=https%3A%2F%2Fmeta.wikimedia.org%2Fw%2Fapi.php%3Faction%3Dsitematrix%26...
```

The test's sitematrix route is `{ match: "action=sitematrix", ... }`, matched by
`url.includes("action=sitematrix")` (helpers.ts, plan ~line 434). In the proxied URL the
substring is `action%3Dsitematrix` — no match. No other route matches either → 404 →
`loadSitematrix` fails → `_error = sitematrixUnavailable`, `_ready` stays false, Load stays
disabled. The test's `expect(querySelector("p[part=error]")).toBeNull()` then **fails**, and the
`fetch.calls.every(...)` assertion passes vacuously (only the failed sitematrix call exists).

Two fixes; the plan must pick one because it's a design decision, not just a test fix:

1. **Match on something that survives encoding** — `meta.wikimedia.org` passes through
   `encodeURIComponent` unencoded. Keeps "everything goes through the proxy" semantics.
2. **Don't proxy the sitematrix** — meta serves `Access-Control-Allow-Origin: *` with
   `origin=*` (the plan's own verified claim), and decision #3's proxy is justified as an
   escape hatch for the upstream *materializers* (PetScan/WDQS/Quarry). This also protects
   hosts whose proxy allowlists only those three services. Recommended.

Also fix the vacuous final assertion: require `fetch.calls.length` ≥ 2 so the test can't pass
on a single failed call.

## High (real behavioral bugs the plan would ship)

### H1. Seed rehydration silently re-homes non-main-namespace pages into mainspace

`seedState` (plan ~line 1890) maps every page to its bare title:
`page[0]` for tuples. Core's `normalizeManualText` (packages/selection-core/src/simple.ts:9)
hardcodes `ns: 0` — manual text cannot express a namespace. So a seed containing
`["Talk_x", null, 1]` rehydrates to the line `Talk_x` and re-ingests as **mainspace** `Talk_x`:
a different page, silently. Page ids are also dropped (`["Statue_of_Liberty", 28617]` →
`Statue_of_Liberty`), which is lossy but identity-preserving; the namespace loss is not.

The plan's own seed test *enshrines* the corruption as expected behavior
(plan ~line 1855: `["Talk_x", null, 1]` → `"Talk_x"` in `expected.manualText`).

This matters concretely for the WP1 flow: Quarry and PetScan sources emit id/namespace tuples,
WP1 stores them, and `open(seed)` is the documented re-edit path. Core has no namespace-name
table (the sitematrix doesn't carry one), so `Talk:` prefixes can't be reconstructed inside
this package. Options, in increasing effort:

1. Document the loss loudly (README `open(seed)` section + task log) and drop `ns ≠ 0` pages
   from `manualText` with a summary note, rather than corrupting them.
2. Extend the manual line format in SPEC §7.1 to accept `Namespace:Title` prefixes — a spec
   change, out of scope for task 03, but the honest long-term fix.

Doing nothing is the worst option: the emitted Selection then misstates which pages the user
selected, and it passes the structural gate, so nothing downstream catches it.

### H2. `open()` is not re-entrant: second call throws inside `showModal`, first promise never settles

`open()` (plan ~line 2395) overwrites `#resolve`/`#reject`, then `#show()` calls
`this.#dialog.showModal()`. If the dialog is already open, `showModal()` throws
`InvalidStateError` — inside a `void`'ed async method, so it surfaces as an unhandled rejection
in the console while **both** promises misbehave: the first caller's promise never settles
(handlers overwritten; nothing rejects them), and the second caller's promise resolves/rejects
against a dialog whose state the first caller may still be driving.

Hosts will hit this: a "Create selection" button double-clicked, or a host that reuses one
element and calls `open()` from two code paths. Define the contract in the plan:

- Reject the *new* call immediately (`Error("already open")`), or
- Cancel the old call (reject it with `AbortError`) and proceed.

Either is defensible; silence is not. Add a component test for whichever is chosen.

### H3. The Task 7 browser smoke test races the live sitematrix fetch

Task 7 Step 4 (plan ~line 2760): the script clicks `#pick`, types into two fields, then
`press("button[part=load]")`, where `press` waits a fixed 500 ms. The Load button is
`?disabled=${this._busy || !this._ready}`, and `_ready` flips only after the **live** meta
sitematrix fetch (~149 KB, real network latency from whoever runs the acceptance test)
completes. On a slow connection the click lands on a disabled button: silent no-op, `summary`
is `null`, acceptance fails spuriously — the plan's final gate is a coin flip.

Replace the fixed wait with a readiness wait, e.g. `wait(() =>
document.getElementById("picker").renderRoot.querySelector("button[part=load]").disabled === false)`
before pressing Load. (The plan's own timing note forbids timeouts in *production* code;
test-side waits are fine, they just have to wait on a condition, not a clock.)

## Medium

### M1. Misleading error copy for empty/malformed PetScan and Quarry URLs

`#buildInput` trims the URL fields but never validates non-emptiness. Core rejects a bad URL
before any fetch with `UPSTREAM_SHAPE` (`fetchQuarrySelection`: "not a Quarry query URL",
packages/selection-core/src/quarry.ts:82). `userMessage` maps `UPSTREAM_SHAPE` to **"That
service answered in an unexpected format."** — no service was contacted. The user who pasted
nothing, or a PetScan *result* URL, gets told the network lied to them.

Add a `URL_INVALID`-style pre-check in the picker's ingest layer (errors-as-values already
support this) with copy like "That doesn't look like a Quarry query URL." Don't change core's
codes — this is picker-level input validation, which is exactly where the plan puts policy.

### M2. The toolchain pin doesn't pin the capabilities later tasks actually depend on

`toolchain.test.ts` (Task 1 Step 10) exists to "fail loudly if the decorator-free Lit +
happy-dom decisions are ever broken" — but it pins only rendering, `adoptedStyleSheets`, and
`showModal()`/`close()` toggling `dialog.open`. The suite later depends on four more happy-dom
capabilities, none pinned:

- `new DataTransfer()` + `transfer.items.add(file)` (forms.test.ts, picker.test.ts swiki tests),
- assigning `input.files = transfer.files`,
- `File.prototype.arrayBuffer()` (`#buildInput` swiki path),
- **`dialog.close()` dispatching the `close` event** — the entire cancel contract
  (picker.test.ts "closing the dialog by any means … rejects too") rests on the event, not the
  `open` property. If happy-dom toggles the property without firing the event, the pinned test
  still passes and the cancellation tests fail three tasks later.

Extend the pin test to construct a `DataTransfer`, assign `files`, read `arrayBuffer()`, and
assert a `close` listener fires. Same philosophy the plan already applies to `showModal`.

### M3. The double-define test is vacuous

Task 6 picker.test.ts, "defining the element twice does not throw" (plan ~line 2320):
`await import("../src/index.js")` after the file-top `import "../src/index.js"` is an ESM
cache hit — `index.ts` never re-executes, the `customElements.get` guard never runs. The test
passes even if the guard is deleted. The behavior it names is untestable by re-import.

Extract the guard into an exported `defineSelectionPicker()` (called once by `index.ts`) and
call it twice in the test, or drop the test and keep the guard as an untested one-liner.
Keeping a test that pins nothing is worse than no test — it reads as coverage.

## Low

### L1. The SPEC §5.1 sidecar-dbname channel is unreachable through the widget

Core's `parseTsv` accepts `sidecar?: JsonValue` (packages/selection-core/src/tsv.ts:8-14) and
SPEC §5.1 RECOMMENDS the accompanying-JSON channel. The picker's swiki mode has a single file
input (`accept=".swiki,.tsv,…"`) and never passes `sidecar`. A user holding
`list.tsv` + `list.json` must rename the TSV or pick the project by hand. §7.2's MUST (prompt
when no dbname) **is** satisfied, so this is a scope decision, not a violation — but the plan
never says it's making one. State it in the README/task log, or accept `sidecar` via a second
optional file input.

### L2. `userMessage`'s default branch silently absorbs three real core codes

`ErrorCode` has 20 members; the plan's switch and tests name 17. `DUPLICATE_ITEM`,
`JSON_MALFORMED`, `ITEM_SHAPE` (packages/selection-core/src/types.ts:39,43,44) fall to
`Could not load that selection (CODE).` All three are *nearly* unreachable from the widget —
every core producer dedupes and the widget serializes its own JSON before validating — but
"the widget can never produce these" is exactly the kind of invariant that rots. Either add
copy (DUPLICATE_ITEM is the plausible one if a future source stops deduping) or add a comment
in `strings.ts` stating why the default is safe for these three.

### L3. Seedless `open()` preserves the previous session's form state — unspecified

`open()` without a seed resets `_error`/`_outcome` but **not** `_form`/`_mode`. After a cancel
or confirm, reopening shows the previous user's typed text. Could be a feature (accidental
cancel keeps work) or a privacy/confusion leak (one element reused across selections). The
docs are silent and the plan never decides. Pick one, test it (the picker-seed tests only
cover `open(seed)` after cancel).

### L4. `max-bytes`/`max-items` accept NaN and negatives, silently disabling caps

Lit `type: Number` converts `max-items="abc"` to `NaN`; `NaN === null` is false, so `NaN` is
passed as a cap and `bytes > NaN` is always false — the host thinks it set a cap, the widget
enforces none. A host programming error, but a one-line guard (`Number.isFinite && > 0`) in
`#load()` turns a silent security-adjacent no-op into an error.

### L5. Toolchain tests 1 and 2 are order-coupled

`toolchain.test.ts` test 2 queries the `<toolchain-probe>` that test 1 inserted into
`document.body`. Passes today (vitest runs a file's tests in order, happy-dom persists per
file), breaks confusingly under `--testNamePattern` or a future `.skip`. Give test 2 its own
setup or merge the two.

## Citation and doc notes (no behavioral impact, but the plan overclaims)

- **SPEC §8 is cited for the widget-side structural gate** (plan README draft ~line 2863, task
  log ~line 2958). §8 assigns the structural gate to the *storing system* ("A storing system
  MUST NOT trust its clients…") and explicitly sets no size limits. The widget-side gate's
  actual authority is task 03 acceptance criterion 2; caps' authority is decision #9. Same
  behavior, wrong citation — fix the README/log wording so future readers don't think the spec
  requires the widget to gate.
- **Decision #12 is applied outside its scope.** #12 is "Editing is WP1's"; the plan extends
  "reopen the query, never the materialized list" to picker seeds. The extension is sound
  (it's the only honest reading of `open(seed)`), but cite #1 + task 03, not #12.
- **`origin=*` on the sitematrix URL is the plan's own empirical claim**, not doc-backed:
  SPEC §4.2's normative URL omits it and decision #3's CORS verification covered
  PetScan/WDQS/Quarry, not meta. The plan labels it "Verified 2026-08-29", which is the right
  standard — keep it, but the README draft should not imply the spec requires it.
- **`bubbles: true` and the `AbortError` rejection are inventions** (task 03 specifies only
  `composed: true`; rejection semantics are unspecified). Both are good defaults — composed
  alone crosses the shadow boundary, bubbles makes document-level listeners natural — but the
  plan presents them as spec'd. They're additions; the package README documents them, which is
  where the contract then lives.
- The plan's Task 1 test comment "every site in fixtures/sitematrix.json" (33) is only true
  because `fromJson` parses the bare-array `specials` section; a naive reader counting
  `section.site` arrays gets 32. Worth a half-sentence in the `sites()` doc comment.

## Verified sound (checked, held)

- **Core API surface**: all 15 imports exist with the assumed signatures, including the
  non-obvious ones — `fetchSparqlSelection` really does return `{selection, report}` with
  `SparqlReport = {ingested, dropped}`; `fetchQuarrySelection` takes no sitematrix;
  `validateSelection` accepts a string. All type-only imports in the plan's code samples are
  `import type`-compliant with `verbatimModuleSyntax`.
- **Quarry meta shape**: the plan's fake `{latest_run: {id, status}, latest_rev:
  {query_database}}` is byte-for-byte what `fetchQuarrySelection` reads
  (packages/selection-core/src/quarry.ts:88-95), and the derived URLs match the fake routes.
- **`Sitematrix.fromJson({nope: true})` → `UPSTREAM_SHAPE`** (sitematrix.ts:20) — both the
  toolchain test and the sitematrix-source test pin the right code.
- **Fixtures**: all six referenced cases exist with the shapes the tests assume;
  sparql/dropped-rows-reported's `expected.report` really is `{ingested: 2, dropped: 2}`;
  petscan/manual-list's `expected.selection.source.url` is byte-identical to
  `meta.params.url`; 77 total conformance cases ✓.
- **The 46-byte constant** in the caps test recomputed exactly.
- **`sites()` ordering**: `localeCompare` and code-unit `.sort()` produce identical order for
  all 33 fixture domains; `de.wikibooks.org` is first under both — the plan's test assertion
  (implementation uses `localeCompare`, test compares against default sort) is safe *for this
  fixture*. It is not safe in general (hyphenated domains diverge); if the fixture ever gains
  one, the test breaks for spurious reasons. Comparing against a `localeCompare` sort in the
  test would pin intent instead of coincidence.
- **Test-count arithmetic**: 3 / 6 / 7 / 11 / 11 / 16 all match the actual test bodies.
- **SPEC §7.1–§7.5 mappings, # comment lines, dynamic defaults, dbname-as-fact,
  caps-reject-never-truncate, attribute names, event name, `open()` signature**: all
  doc-backed and correctly implemented in the plan's code.
- **`ResponseLike` fakes**: the plan's `fakeFetch` returns a real `ReadableStream`, which
  satisfies core's `getReader()/read()/cancel()` body shape.
- **Root README edit**: the quoted "current" Status body matches the actual README, and the
  renumbering (WP1 4→5, packaging inserted at 4) is consistent with `docs/tasks/04`.

## Recommended amendments before execution

1. Task 6: fix the proxy test per B1 (prefer: don't proxy the sitematrix; update `#fetch`
   usage in `#show()` accordingly) and strengthen its final assertion.
2. Task 5: change `seedState`'s default branch per H1 — at minimum drop or mark `ns ≠ 0`
   pages instead of relocating them; document the id loss.
3. Task 6: define and test `open()` re-entrancy (H2) and seedless state reset (L3).
4. Task 7 Step 4: wait on the Load button's `disabled === false`, not 500 ms (H3).
5. Task 4: add a picker-level URL-shape check for petscan/quarry inputs (M1).
6. Task 1 Step 10: extend the toolchain pin with DataTransfer, `input.files`,
   `File.arrayBuffer()`, and `dialog` `close`-event dispatch (M2).
7. Task 6: make the double-define guard callable and actually call it twice (M3).
8. Fix the §8 / #12 citations in the Task 7 README draft and task log.
