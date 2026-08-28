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

## Log

**2026-08-28 — done.** `packages/selection-core` (npm workspace): isomorphic
TypeScript, ESM, zero runtime dependencies. All 77 conformance fixtures pass
via a discovery-based vitest harness (`test/conformance.test.ts`) plus unit
tests for the HTTP layer and fetch adapters.

- Zero-DOM enforced by tsconfig: `lib: ["ES2022"]`, `types: []`; the four
  WHATWG globals used (TextDecoder/TextEncoder/URL/URLSearchParams) are
  declared ambiently in `src/globals.d.ts`.
- Errors are values: `Result<T>` with the fixture registry's 16 codes plus
  four fetch-layer codes (`HTTP_ERROR`, `PAYLOAD_TOO_LARGE`,
  `UPSTREAM_SHAPE`, `QUARRY_RUN_NOT_READY`).
- Mappers are pure functions over captured payloads; fetch adapters take an
  injectable fetch, stream with a 100 MB abort, and send Api-User-Agent to
  WDQS only. Quarry resolution verified against the live API
  (`/query/<id>/meta` → `latest_rev.query_database`, `latest_run.id`;
  `/run/<id>/output/0/json`).
- **Spec erratum candidate:** SPEC §5.2's TypeScript contract fails strict
  compilation (TS2411 — `pages`/`source` vs the `JsonValue | undefined`
  index signature). The package widens the `Selection` index signature to
  `JsonValue | Item[] | Source | undefined`; identical wire shape.
- Behavior chosen where fixtures are silent (documented in the package
  README): manual-entry lines normalizing to empty are dropped; SPARQL rows
  whose decoded title contains tab/newline are dropped and counted.
