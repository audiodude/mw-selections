# 08 — WP1: one-shot data migration

**Repo:** [openzim/wp1](https://github.com/openzim/wp1)
**Depends on:** [05](05-wp1-structural-gate.md), [06](06-wp1-selection-model.md), [07](07-wp1-dbname.md)

## Goal

Eagerly convert every existing `builders` row to the canonical form in one
migration — no lazy dual-format period.

## Details

- **Simple:** normalize stored raw lines via a throwaway Python port of the
  SPEC §7.1 pipeline, validated against the conformance fixtures; store as
  `{dbname, pages, source: {type: "simple"}}`. The port is deleted after the
  migration runs.
- **PetScan / SPARQL:** build `source` from old params (`url`, or
  `endpoint`+`query`), `dynamic: true`; take `pages` from the latest
  already-materialized version — no mass re-fetch of upstreams on migration
  day (next ZIM refreshes them). Title-only items are fine.
- **Book:** freeze at latest materialized version,
  `source: {type: "book", url: ..., dynamic: false}`.
- Never-materialized rows (any type): mark failed rather than fetch during
  migration.
- Same pass: `b_model` → the single model constant; `b_project` → `b_dbname`
  via sitematrix reverse-map.
- DB snapshot before running. Owners of Book builders with scheduled ZIMs
  get a heads-up that their selections are now frozen (check materialization
  logs for active ones first).

## Acceptance

- Post-migration: every row parses as canonical Selection JSON and passes the
  structural gate; no legacy model strings remain.
- Row counts per old model reconcile with per-`source.type` counts.
- A previously-created builder of each type still serves its selection and
  (if dynamic) refreshes at its next ZIM request.
