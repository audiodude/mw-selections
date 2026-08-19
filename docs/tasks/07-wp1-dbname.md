# 07 — WP1: dbname as the stored identifier

**Repo:** [openzim/wp1](https://github.com/openzim/wp1)
**Depends on:** — (independent; migration in task 08 backfills it)

## Goal

WP1 stores a project *domain* (`b_project` = `en.wikipedia.org`); the spec
speaks *dbname* (`enwiki`). Make dbname the stored canonical value and derive
domains where needed.

## Details

- Schema: `b_project` → `b_dbname` (backfill happens in task 08's migration).
- Server-side sitematrix cache (from the meta.wikimedia.org action API, SPEC
  §4.2), refreshed daily; carries `dbname` ↔ `url`/domain both ways.
- Unknown dbnames rejected at builder creation (part of the task 05 gate).
- Domain derived from the cache at display time and for zimfarm/mwoffliner
  config (`mwUrl`).
- Served selection filename carries the dbname (e.g.
  `my-selection.enwiki.tsv`), resolving the long-standing TODO in the
  source document.

## Acceptance

- No code path reads `b_project` after the change.
- ZIM requests build correct `mwUrl` for a non-enwiki builder.
- `latest.tsv` redirect filename contains the dbname.
