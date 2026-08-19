# 02 — selection-core package

**Repo:** mw-selections
**Depends on:** [01 — Conformance fixtures](01-conformance-fixtures.md)

## Goal

Isomorphic TypeScript library implementing the spec: parsers, source mappers,
serializers, and validators. Zero DOM dependency — runs in the browser (under
`selection-picker`) and in Node (any future server-side consumer).

## Details

- Manual-text normalization pipeline (SPEC §7.1).
- `.swiki`/TSV parser and serializer (SPEC §5.1), JSON serializer (§5.2).
- Source mappers with fetch adapters: PetScan (§7.3), SPARQL (§7.4), Quarry
  (§7.5). Fetching is injectable so mappers are testable against fixture
  payloads.
- Structural validator (SPEC §8 checks) and canonical-JSON byte measurement
  (for `max-bytes` enforcement).
- Typed error values with stable machine-readable codes (shared with the
  fixtures).
- `Api-User-Agent` header sent to WDQS only (verified CORS-allowlisted);
  raw-fetch abort at 100 MB.

## Acceptance

- Passes the full conformance fixture suite.
- No DOM API references anywhere in the package (enforced by lint or tsconfig
  lib settings).
- Public API documented in the package README.
