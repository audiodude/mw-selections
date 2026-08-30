# @audiodude/selection-core

Isomorphic TypeScript implementation of the
[Selections specification](../../docs/SPEC.md) (v1.0.0): parsers, source
mappers, serializers, and validators for portable lists of Wikimedia pages.
Zero runtime dependencies, zero DOM references (enforced by
`tsconfig.json` — `lib: ["ES2022"]`, no type libraries) — runs in the
browser and in Node ≥ 18.

Domain errors are **values, never exceptions**: every operation returns
`Result<T> = { ok: true, value } | { ok: false, error: { code, message } }`
with stable machine-readable codes shared with the
[conformance fixtures](../../fixtures/README.md), which this package
passes in full (77/77 — `npm test`).

## Types

```ts
import type { Selection, Item, Source, Result } from "@audiodude/selection-core";
```

`Selection { dbname, pages: Item[], source?: Source, ...extras }` per
SPEC §5.2. One deviation: the `Selection` index signature is
`JsonValue | Item[] | Source | undefined` — the spec's own `pages`/`source`
members don't satisfy its published `JsonValue | undefined` signature under
strict TypeScript (TS2411). Wire shape is identical; candidate spec erratum.

## Parsing & serializing

```ts
import {
  parseTsv, serializeTsv, parseSelectionJson, selectionJsonBytes,
  validateSelection, normalizeManualText, Sitematrix,
} from "@audiodude/selection-core";

const sm = Sitematrix.fromJson(sitematrixJson); // Result<Sitematrix>
if (!sm.ok) throw new Error(sm.error.message);
sm.value.sites(); // → [{ dbname, domain }, ...] sorted by domain (project pickers)

// .swiki/TSV upload (SPEC §5.1, §7.2) - dbname from sidecar, else filename
parseTsv(bytes, { filename: "list.enwiki.tsv", sitematrix: sm.value });
// → Result<{ dbname?: string; pages: Item[] }>

serializeTsv(selection); // → Result<Uint8Array>, canonical byte-stable TSV

parseSelectionJson(bytes); // → Result<Selection>, boundary parse: rejects duplicates
serializeSelectionJson(selection); // → Result<string>, canonical JSON text (SPEC §5.2)
selectionJsonBytes(selection); // UTF-8 byte length (max-bytes cap measurement)
validateSelection(bytes, sm.value); // → Result<void>, the storing-system gate (SPEC §8)

normalizeManualText("Statue of Liberty\n# comment"); // SPEC §7.1
// → Result<{ pages: Item[] }>, title-only items
```

Behavior not pinned by fixtures: a manual-entry line that normalizes to the
empty string (e.g. a bare `https://en.wikipedia.org/wiki/`) is dropped like
an empty line; a SPARQL row whose decoded title contains tab/newline is
dropped and counted like a non-matching row.

## Source mappers & fetch adapters (SPEC §7.3-§7.5)

Mappers are pure functions over captured upstream payloads; fetch adapters
add network access with an injectable `fetch` (any WHATWG-compatible
implementation), stream bodies with a 100 MB abort, and default
`dynamic: true` in the emitted `source`.

```ts
import {
  mapPetscan, fetchPetscanSelection,
  mapSparql, fetchSparqlSelection,
  mapQuarry, fetchQuarrySelection,
} from "@audiodude/selection-core";

await fetchPetscanSelection("https://petscan.wmcloud.org/?psid=123", { sitematrix });
// → Result<Selection>; dbname from PetScan's echoed query, never user input

await fetchSparqlSelection({ dbname: "enwiki", endpoint, query, sitematrix });
// → Result<{ selection: Selection; report: { ingested, dropped } }>
// Api-User-Agent is sent to query.wikidata.org only (CORS-verified there).

await fetchQuarrySelection("https://quarry.wmcloud.org/query/104907");
// → Result<Selection>; resolves /query/<id>/meta, then /run/<id>/output/0/json;
// dbname from Quarry's query_database with any trailing _p stripped
```

## Conformance

`npm test` runs the vendored fixture suite from [`fixtures/`](../../fixtures/)
(all eight operations) plus unit tests for the HTTP layer and fetch adapters.
`npm run typecheck` proves `src/` compiles with no DOM or Node type libraries.
