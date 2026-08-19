# 05 — WP1: structural validation gate

**Repo:** [openzim/wp1](https://github.com/openzim/wp1)
**Depends on:** [SPEC.md](../SPEC.md) §8

## Goal

WP1's API is public; the widget is just one client. Rewrite the builder
`validate()` hook as a structural gate that rejects (never fixes) invalid
canonical params, so WP1's served TSVs can't be poisoned by a non-widget
client.

## Details

- Checks, per SPEC §8: well-formed Selection shape; no `\t`/`\n` in item
  fields; uniqueness on (`item_title`, `namespace_id`); dbname present in the
  cached sitematrix; serialized `b_params` ≤ 25 MB.
- No normalization server-side — that is the widget's job at creation time.
- Request-body limits must clear the gate: Flask `MAX_CONTENT_LENGTH` and the
  reverse proxy's `client_max_body_size` (nginx defaults to 1 MB) set above
  25 MB.
- Reuse the conformance fixtures' structural-validation cases in WP1's Python
  tests (vendored — see task 01).

## Acceptance

- `POST /v1/builders/` with tab-injected titles, duplicate
  (title, namespace) pairs, an unknown dbname, or >25 MB params returns 400
  with a useful error.
- A 25 MB valid params object round-trips end-to-end (POST → stored →
  materialized → served).
