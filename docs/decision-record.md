# Decision record: Selection picker + WP1 refactor

Produced 2026-08-19 from a design session between Travis Briggs and Claude
(AI-assisted). These decisions underlie [SPEC.md](SPEC.md) and the task
breakdown in [tasks/](tasks/).

| # | Decision |
|---|---|
| 1 | **Widget**: `<selection-picker>`, autonomous custom element, Shadow DOM, native `<dialog>`, Lit + TS. Create-only picker; `open(selection?)` accepts an optional seed. Emits canonical Selection JSON via promise + `selection` event. Never touches WP1's API. |
| 2 | **Repo**: monorepo, two npm packages — `selection-core` (isomorphic TS: parsers, mappers, serializers, validators + conformance fixtures) and `selection-picker` (UI over core). Spec lives here as `docs/SPEC.md`, canonical, versioned with fixtures. Project-neutral naming, personal npm scope. |
| 3 | **No proxy, no Toolforge service.** Direct browser fetch (all three upstreams verified `ACAO: *`; Quarry via 302). `proxy` attribute kept as escape hatch, defaults to nothing. `Api-User-Agent` sent to WDQS only. |
| 4 | **Canonical storage**: every WP1 builder becomes model `wp1.selection.models.selection`; `b_params` = Selection JSON `{dbname, pages, source}` verbatim (25 MB gate). Raw manual text not preserved. TS interface: `JsonValue` index signature, partial labeled `Item` tuple, `Source` with `endpoint`+`query` for SPARQL, `url` for PetScan/Quarry, `dynamic` flag. |
| 5 | **Dynamic semantics**: PetScan/SPARQL/Quarry default `dynamic: true`; manual/.swiki static. Re-materialization runs server-side in WP1's existing Python worker (`petscan.py`/`sparql.py` amended to spec semantics, `quarry.py` new), rewrites `pages` in params, records ingest stats. Upstream failure or >25 MB → serve last good version, never fail the ZIM. |
| 6 | **Source mapping (spec-level)**: SPARQL — dbname is required user input; `?url`/`?article` preferred else projection-order scan; per-row domain enforcement with dropped-row reporting; title-only v1. Quarry — `page_title`/`page_id`/`page_namespace` convention, single-column fallback, alias error otherwise; dbname from run metadata. PetScan — title/id/ns direct. |
| 7 | **dbname**: host attribute is a comma-separated allowlist constraint; source-derived dbname is fact; conflicts are hard errors rendered as domains ("Your URL names de.wikipedia.org…"); .swiki without dbname prompts. |
| 8 | **Validation split**: normalization is widget-only; WP1 keeps one structural gate in rewritten `validate()` — shape, size, no `\t`/`\n`, dedup on (item_title, namespace_id), dbname in cached sitematrix (daily refresh). Conformance fixtures vendored into WP1's Python tests. Infra task: Flask `MAX_CONTENT_LENGTH` + nginx `client_max_body_size` must clear 25 MB. |
| 9 | **Caps**: widget `max-bytes` measures serialized canonical JSON (WP1 sets 25 MB to mirror its gate), optional `max-items`; default widget behavior is tab-safety only (100 MB raw-fetch abort). ZIM keeps 50k at ZIM time. |
| 10 | **Schema**: `b_project` → `b_dbname`; domain derived from cached sitematrix at display/zimfarm time; unknown dbnames rejected at creation. |
| 11 | **Book is dead**: frozen at latest version with `dynamic: false`, `book.py` deleted, no widget input. |
| 12 | **Editing is WP1's**: per-source forms (URL field, query textarea, titles textarea); dynamic sources edit their source only, never the materialized list; no provenance-mutation logic anywhere. |
| 13 | **Migration**: eager one-shot; throwaway Python port of Simple normalization validated against fixtures; PetScan/SPARQL take `pages` from latest materialized version (no mass re-fetch); never-materialized rows marked failed; `b_model`/`b_dbname` backfill in the same pass; DB snapshot first. |
| 14 | **Distribution**: semver; CDN pins major; WP1 pins exact. English-only externalized strings v1. |
| 15 | Filed: [openzim/wp1#1262](https://github.com/openzim/wp1/issues/1262) (SPARQL extraction bugs, superseded by this work). |

## Supporting evidence gathered during the session

- PetScan, WDQS, and Quarry all serve `Access-Control-Allow-Origin: *` on
  their result endpoints (Quarry's success path is a 302 to
  `/run/<id>/output/0/json`, also `ACAO: *`), so the widget can fetch
  directly from any origin without a proxy.
- WDQS allowlists the `Api-User-Agent` header for CORS preflight; PetScan and
  Quarry were not verified for it, so the widget sends it to WDQS only.
- WP1's `b_params` column is a LONGBLOB; a 25 MB canonical params object fits.
  The only article-count cap today is `MAX_ZIMFARM_ARTICLE_COUNT = 50_000`,
  enforced at ZIM-request time, not at builder creation.
- WP1's current SPARQL extraction has three defects (wrong-wiki ingestion,
  hash-order non-determinism, row-0 sampling) — filed as
  [openzim/wp1#1262](https://github.com/openzim/wp1/issues/1262) and fixed by
  the spec's §7.4 semantics.
