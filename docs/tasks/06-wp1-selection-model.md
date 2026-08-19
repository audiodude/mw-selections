# 06 — WP1: single selection model + spec-conformant materializers

**Repo:** [openzim/wp1](https://github.com/openzim/wp1)
**Depends on:** [01 — Conformance fixtures](01-conformance-fixtures.md), [05 — Structural gate](05-wp1-structural-gate.md)

## Goal

Collapse WP1's builder models into one, `wp1.selection.models.selection`,
whose `b_params` is the canonical Selection JSON `{dbname, pages, source}`
verbatim, and bring the server-side source materializers up to spec
semantics.

## Details

- One model. Creation-time materialization serializes `params.pages` as-is
  (no re-fetch — the widget's fetch is seconds old). Output TSV per SPEC
  §5.1, including `id`/`namespace_id` columns when present.
- Dynamic re-materialization (at ZIM request, incl. cron) dispatches on
  `source.type`:
  - `petscan.py` — amended to canonical params and spec §7.3.
  - `sparql.py` — amended to spec §7.4: projection-order variable scan,
    per-row domain enforcement (fixes
    [openzim/wp1#1262](https://github.com/openzim/wp1/issues/1262)).
  - `quarry.py` — new, spec §7.5.
  - Unrecognized or absent `source`/`dynamic` → static, serve stored pages.
- Re-materialization rewrites `pages` in `b_params` and bumps the version.
  Upstream failure or gate violation (>25 MB) → keep serving the last good
  version, surface the error on the builder, never fail the ZIM.
- Record ingest stats per materialization run (ingested/dropped counts) and
  expose them via the API for the frontend.
- Delete `book.py` and Simple's normalization logic (superseded; Book rows
  are frozen by the migration, task 08).
- Vendor and run the fixture suite for §7.3–§7.5 mapper semantics.

## Acceptance

- Python mappers pass the conformance fixtures.
- A dynamic PetScan/SPARQL/Quarry builder refreshes at ZIM request; a static
  one does not.
- Simulated upstream failure at cron time serves the previous version and
  logs; the ZIM still builds.
