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
