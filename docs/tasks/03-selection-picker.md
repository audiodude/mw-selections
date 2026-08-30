# 03 — selection-picker web component

**Repo:** mw-selections
**Depends on:** [02 — selection-core](02-selection-core.md)

## Goal

`<selection-picker>`: an embeddable custom element that lets a user of any
web tool create a Selection from manual entry, `.swiki` upload, a PetScan
URL, a SPARQL query, or a Quarry URL — and hands the host the canonical
Selection JSON. Create-only: editing stored selections is the host's concern.

## Details

- Lit + TypeScript. Autonomous custom element, Shadow DOM, native `<dialog>`.
  CSP-safe (no eval, constructable stylesheets). Guard
  `customElements.get()` before define to survive double-loading.
- Input modes: manual text, `.swiki` upload, PetScan URL, SPARQL query
  (+ required dbname input), Quarry URL. All parsing/fetching via
  `selection-core`, directly from the browser (no proxy).
- Attributes:
  - `dbname` — comma-separated allowlist constraint; conflicts are hard
    errors rendered as domains ("Your URL names de.wikipedia.org, but this
    page is only configured to accept en.wikipedia.org"). Absent → project
    picker shown.
  - `max-bytes` — cap on serialized canonical Selection JSON bytes.
  - `max-items` — optional item-count cap.
  - `proxy` — optional escape hatch for hosts running their own materializer;
    nothing defaults to it.
- API: `open(seed?: Selection): Promise<Selection>` plus a `selection`
  CustomEvent (`composed: true`). Emitted `source` reflects the input mode
  that produced the final list; PetScan/SPARQL/Quarry default
  `dynamic: true`.
- Ingest feedback in the UI ("ingested 1,204, dropped 37 rows not on
  en.wikipedia.org"). `.swiki` without a dbname prompts for one.
- UI strings externalized; English-only v1.

## Acceptance

- Works in a plain HTML page with one `<script type="module">` tag and one
  element — no bundler, no framework.
- Emitted Selections validate against `selection-core`'s structural validator
  and match conformance fixtures for each input mode.
- Manual smoke test in the WP1 dev frontend (creation flow only).

## Log

**2026-08-29 — done.** `packages/selection-picker` (npm workspace): Lit 3,
Shadow DOM, native `<dialog>`, constructable stylesheets, no decorators
(esbuild's standard-decorator transform is incompatible with Lit's).
Attributes `dbname` (comma-separated allowlist), `max-bytes`, `max-items`,
`proxy` (materializer fetches only; the sitematrix is never proxied);
`open(seed?)` resolves with the Selection or rejects `AbortError`, throws on
re-entrant calls and malformed caps, and starts blank without a seed;
`selection` CustomEvent is `bubbles`+`composed` (the `AbortError` rejection
and `bubbles` are this package's additions — task 03 specifies only
`composed`).

- Three layers, tested separately: a DOM-free policy/ingest layer over
  `selection-core` (`src/ingest.ts` and friends), state-free Lit template
  functions (`src/forms.ts`, `src/seed.ts`), and one element
  (`src/selection-picker.ts`).
- Per-mode tests replay the repository's conformance fixtures through the
  ingest pipeline (`simple/pipeline-basic`, `tsv-parse/filename-dbname`,
  `petscan/manual-list`, `sparql/dropped-rows-reported`,
  `quarry/full-columns`), so the widget's output is pinned to the same
  expectations as `selection-core`.
- Every emitted Selection passes `validateSelection` — the structural gate
  SPEC §8 assigns to the storing system — before the host receives it
  (task 03 acceptance); caps reject and never truncate (decision record #9);
  `max-bytes` measures `selectionJsonBytes`.
- Sitematrix is fetched once per page from meta with `origin=*` — verified
  2026-08-29 that the API sends no `Access-Control-Allow-Origin` header
  without that parameter. Failures are not cached, so reopening retries.
- `Sitematrix.sites()` was added to `selection-core` for the project picker;
  the lookup maps alone could not enumerate projects in a stable order.
- Seed rehydration: dynamic sources (`petscan`, `quarry`, `sparql`) reopen
  their query, never the materialized list; `simple`, `swiki`, unrecognized,
  and absent source types rehydrate as editable title lines and emit
  `source: {type: "simple"}` — a `File` cannot be rehydrated, and pretending
  otherwise would misreport provenance. Non-main-namespace pages in a static
  seed are omitted from the prefill and counted in the dialog (title lines
  cannot express a namespace); page ids are dropped. SPEC §5.1's
  sidecar-JSON dbname channel is out of scope for v1 (single file input).
- Verified in a real browser via `examples/plain.html` and the built bundle:
  one `<script type="module">`, one element, no bundler, live sitematrix
  fetch, emitted Selection `{dbname: "enwiki", pages: [...],
  source: {type: "simple"}}`.
