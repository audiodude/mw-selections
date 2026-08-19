# 09 — WP1: frontend integration

**Repo:** [openzim/wp1](https://github.com/openzim/wp1) (Vue frontend)
**Depends on:** [03 — selection-picker](03-selection-picker.md), [06 — selection model](06-wp1-selection-model.md)

## Goal

Replace WP1's four builder creation forms with the widget; own editing with
minimal per-source forms.

## Details

- **Creation:** embed `<selection-picker>` (exact-version npm dependency)
  with `max-bytes` mirroring the 25 MB server gate; no `dbname` allowlist
  (WP1 users pick any project). On the `selection` event, POST
  `{name, dbname, model, params}` to the existing builders endpoint.
- **Editing** (per decision: the widget is create-only):
  - PetScan/Quarry: URL field.
  - SPARQL: query textarea (pre-filled from `source.query`) + dbname.
  - Manual/static: plain textarea of titles, PATCHed into `params.pages`.
  - Dynamic sources edit their source only — the materialized list is
    displayed read-only; saving re-materializes server-side through the
    existing pipeline.
- Surface per-run ingest stats ("ingested 1,204, dropped 37") from the API on
  the builder page, matching the widget's creation-time feedback.
- Remove the old Simple/PetScan/Book/SPARQL form components and their
  client-side validation.

## Acceptance

- Create → edit → re-materialize round-trip works for each source type in
  the dev environment.
- No references to the removed form components remain.
- Book creation is gone from the UI; frozen Book builders still display and
  serve.
