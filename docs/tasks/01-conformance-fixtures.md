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

## Log

**2026-08-23 — done.** 74 cases across 8 operations (`tsv-parse`,
`tsv-serialize`, `json-parse`, `simple`, `petscan`, `sparql`, `quarry`,
`validate`) in [fixtures/](../../fixtures/), plus a shared trimmed
sitematrix capture. Harness contract, error-code registry, canonical
item/TSV forms, and the clause → case coverage matrix are in
[fixtures/README.md](../../fixtures/README.md).

- Upstream samples are real captures (2026-08-23): PetScan manual-list on
  enwiki, two WDQS responses, Quarry query 104907 run 1141735
  (enwiktionary). Derived variants are marked in each case's
  `provenance`.
- Where the spec leaves latitude, the fixtures pin one behavior — the ten
  pins are listed in the README ("Fixture-pinned interpretations") and are
  candidate spec errata. Notable: strict duplicate rejection on parse
  (only §7.1 dedups), sidecar-over-filename dbname precedence, canonical
  serialization forms for byte-identical output, §7.4's first-row-only
  variable scan pinned as written.
- Verified two ways: `scripts/lint_fixtures.py` (structure, registry,
  matrix ↔ tree cross-check) and a throwaway Python reference
  implementation of §5/§7/§8 that reproduced all 74 expected outputs
  (deleted after the run, per the no-speculative-code rule).
- Not fixture-encodable (runtime/UI behavior), listed in the README:
  §4.3 title-over-id precedence, §6 re-materialization behavior, §7.2's
  prompt-the-user requirement, §8 size policy.

**2026-08-23 — revised with spec v1.0.0.** Two behavior changes, 77 cases
now:

- SPEC §7.4 rule 2 revised (and the spec marked **v1.0.0**): variable
  selection scans result rows in order instead of sampling only the first
  row; non-identifying leading rows are skipped (new
  `sparql/scan-skips-leading-rows`; editorial decision 5 in SPEC §10).
- Duplicates: spec untouched (§4.4 still MUST NOT; §8 gate still
  rejects), but ingestion operations now de-duplicate, first occurrence
  wins — `tsv-parse/duplicate-items` became `tsv-parse/deduplication`,
  and `sparql/duplicate-rows-collapse` + `quarry/deduplication` pin
  mapper dedup. `json-parse`/`validate` (boundary operations) keep
  rejecting with `DUPLICATE_ITEM`. sparql `report.ingested` counts unique
  items; `dropped` counts only domain-non-matching rows.
- Re-verified: linter OK (77 cases), updated throwaway reference
  implementation reproduces 77/77 expected outputs.
