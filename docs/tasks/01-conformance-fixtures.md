# 01 — Conformance fixtures

**Repo:** mw-selections
**Depends on:** [SPEC.md](../SPEC.md)

## Goal

Language-neutral, input → expected-output test cases that encode every
normative rule in the spec. They are the reference against which all
implementations (TypeScript `selection-core`, WP1's Python) are tested,
preventing silent semantic drift between them.

## Details

- Directory of JSON/TSV fixture files, e.g.
  `fixtures/<area>/<case>/{input,expected,meta}`.
- Cover: TSV parsing/serialization (header prohibition, trailing tabs, the
  `title\t\tns` case, UTF-8, forbidden characters), JSON round-tripping
  (string vs tuple items, `null` id), uniqueness on
  (`item_title`, `namespace_id`), manual-text normalization (comments, URL
  prefixes, percent-decoding, spaces→underscores), SPARQL result mapping
  (variable selection priority and projection order, per-row domain
  enforcement, dropped-row counts, zero-match error), Quarry column
  recognition (`page_title`/`page_id`/`page_namespace`, single-column
  fallback, alias error), PetScan mapping, dbname validity.
- Error cases assert machine-readable error codes, not message text.
- Upstream-response fixtures (PetScan JSON, SPARQL JSON results, Quarry JSON)
  are captured samples, so mappers are tested without network access.

## Acceptance

- Every MUST/MUST NOT in SPEC.md §4–§7 has at least one fixture.
- A fixtures README documents the harness contract precisely enough that a
  non-JavaScript implementation can run them.
