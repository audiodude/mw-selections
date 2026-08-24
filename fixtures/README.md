# Selections conformance fixtures

Language-neutral, input → expected-output test cases for the
[Selections specification](../docs/SPEC.md) (v1.0.0). They are the
reference suite for every implementation — TypeScript `selection-core`,
WP1's Python, anything else. Implementations SHOULD vendor this directory
and run every case. Where the spec's prose and these fixtures disagree,
one of them has a bug: please file an issue.

## Layout and discovery

```
fixtures/
  sitematrix.json          shared fixture (see below)
  <operation>/<case>/
    meta.json              description, spec references, operation parameters
    input.*                the input document (exactly one)
    expected.json          expected outcome (or expected.swiki, tsv-serialize only)
    sidecar.json           optional; tsv-parse only
```

A test case is any directory `fixtures/<operation>/<case>/` containing a
`meta.json`. The operation is the name of its parent directory. Harnesses
discover cases by scanning; there is no manifest.

`meta.json` fields:

| Field | Meaning |
|---|---|
| `description` | Human-readable statement of the rule under test |
| `spec` | Spec sections exercised, e.g. `["§4.4"]` |
| `params` | Operation parameters (see each operation); absent if none |
| `provenance` | For captured/derived upstream samples: where the bytes came from |

## The eight operations

Each operation is a pure function. A harness binds each operation name to
the implementation's equivalent entry point and compares results against
`expected.json` (see *Result contract*).

### `tsv-parse`

Parse `.swiki`/TSV bytes (SPEC §5.1, §7.2).

- **Input:** `input.swiki`, raw bytes.
- **Params:** `filename` (optional) — the logical name of the uploaded file.
- **Sidecar:** if `sidecar.json` exists in the case directory, it is the
  accompanying metadata JSON described in SPEC §5.1.
- **dbname resolution:** the sidecar's `dbname` wins if a sidecar is
  present (a sidecar without `dbname` is `SIDECAR_DBNAME_MISSING`);
  otherwise the penultimate dot-segment of `filename`
  (`my-selection.enwiki.tsv` → `enwiki`) if — and only if — that segment
  is a dbname in `sitematrix.json`; otherwise no dbname is resolved
  (SPEC §7.2 then requires the ingesting UI to prompt; that UI behavior is
  not fixture-encodable).
- **Result:** `{pages}` or `{dbname, pages}`, deduplicated on
  (`item_title`, `namespace_id`), first occurrence wins (ingestion
  normalization — see pin #1).

### `tsv-serialize`

Serialize a Selection to canonical TSV bytes (SPEC §5.1).

- **Input:** `input.json`, a Selection object.
- **Result:** `expected.swiki` compared **byte-exactly**; error cases use
  `expected.json` as usual.

### `json-parse`

Parse Selection JSON bytes into the canonical form (SPEC §5.2).

- **Input:** `input.json`, raw bytes (not necessarily valid JSON).
- **Result:** the canonical Selection: `pages` in canonical item form,
  all other top-level and `source` members preserved verbatim. `dbname`
  must be present (§4.1) and a string, but its *validity* against the
  sitematrix is checked only by `validate`. This is a *boundary*
  operation: duplicates are rejected (`DUPLICATE_ITEM`), never repaired
  (pin #1).

### `simple`

Normalize manually entered text (SPEC §7.1).

- **Input:** `input.txt`, UTF-8 text, one candidate item per line.
- **Result:** `{pages}` — title-only items.

### `petscan`

Map a captured PetScan JSON response (SPEC §7.3).

- **Input:** `input.json`, the PetScan response verbatim.
- **Params:** `url` — the PetScan query URL (copied verbatim into
  `source.url`).
- **dbname:** derived from the target wiki reported by PetScan in the
  response (the echoed query's `language`/`project` — via the sitematrix —
  or `manual_list_wiki`), never from user input.
- **Result:** full Selection with
  `source: {type: "petscan", url, dynamic: true}`, deduplicated
  (pin #1).

### `sparql`

Map a captured SPARQL results-JSON response (SPEC §7.4).

- **Input:** `input.json`, `application/sparql-results+json` verbatim.
  Projection order (§7.4 rule 2) is the order of `head.vars`. Variable
  selection scans result rows in order; rows identifying no variable are
  skipped (SPEC §7.4 rule 2, v1.0.0).
- **Params:** `dbname` (required user input), `endpoint`, `query` — the
  latter two are copied verbatim into `source`. The project domain is
  derived from `dbname` via `sitematrix.json` (host of the site's `url`).
- **Result:** full Selection with
  `source: {type: "sparql", endpoint, query, dynamic: true}`, plus a
  `report` (§7.4 rule 3): `ingested` counts unique items (equals the
  length of `pages`), `dropped` counts only domain-non-matching rows.
  Conforming rows that normalize to an already-ingested key collapse
  silently (pin #1).

### `quarry`

Map a captured Quarry output-JSON response (SPEC §7.5).

- **Input:** `input.json`, the Quarry `.../output/0/json` document
  (`headers` + `rows`; a `meta` member may be present and is ignored).
- **Params:** `url` (copied into `source.url`); `database` — the run's
  target database as reported by Quarry's run metadata
  (`query_database`). A trailing `_p` replica suffix is stripped
  (`enwiki_p` → `enwiki`).
- **Result:** full Selection with
  `source: {type: "quarry", url, dynamic: true}`, deduplicated (pin #1).

### `validate`

The storing-system structural gate (SPEC §8): accept or reject, never fix.

- **Input:** `input.json`, raw bytes.
- **Checks:** everything `json-parse` checks, plus `dbname` present in
  `sitematrix.json`. Size policy is deliberately not covered — the spec
  sets no limits (§8).
- **Result:** bare `{"status": "ok"}` or an error.

## Result contract

`expected.json` is one of:

```json
{"status": "ok", "selection": { ... }, "report": { ... }}
{"status": "error", "code": "ERROR_CODE"}
```

- `selection` — compared by deep JSON value equality (object key order is
  insignificant; page order is significant). Absent for `validate`.
- `report` — present only where the spec mandates counts (`sparql`);
  compared exactly.
- Error cases assert the machine-readable `code` only — never message
  text. Implementations may attach any extra diagnostics. Every fixture
  input violates at most one rule, so no precedence between codes is
  needed.

### Canonical item form

Expected `pages` use exactly one spelling per §4.3 item; parsers and
mappers must emit it:

1. Title-only → a bare JSON string.
2. Title + id, namespace absent or `0` → `[title, id]`.
3. Title + id + namespace > 0 → `[title, id, ns]`.
4. Title + namespace > 0, id unknown → `[title, null, ns]`.
5. Never emitted: 1-tuples, `[title, null]`, explicit trailing defaults
   (`[title, id, 0]`).

An explicit namespace `0` in any input is equivalent to an absent
namespace (§4.3) and canonicalizes away.

### Canonical TSV form

`tsv-serialize` output, per canonical item: `title`, `title\tid`,
`title\tid\tns`, or `title\t\tns`; every row (including the last)
terminated by `\n`; zero items → zero bytes; no header. Optional trailing
tabs and namespace `0` are omitted. (Any §5.1-conformant TSV is *parseable*;
this canonical form is what serializers must *produce* so independent
implementations emit identical bytes.)

### Determinism

Item order in results is encounter order of the input (file order, `pages`
order, response row order). Ingestion operations (`tsv-parse`, `simple`,
`petscan`, `sparql`, `quarry`) deduplicate; the first occurrence wins. The
spec says Selection order carries no meaning (§4.4); fixtures still pin it
so outputs are byte-comparable.

## Error code registry

| Code | Meaning | Operations |
|---|---|---|
| `ENCODING_INVALID` | Input bytes are not valid UTF-8 | tsv-parse |
| `EMPTY_TITLE` | Empty `item_title` (incl. empty first TSV column / blank interior line) | tsv-parse, json-parse |
| `FIELD_FORBIDDEN_CHAR` | `\t` or `\n` in an item field | json-parse, tsv-serialize, simple, validate |
| `DUPLICATE_ITEM` | Duplicate (`item_title`, `namespace_id`), absent ns ≡ 0 | json-parse, validate |
| `TSV_INVALID_ID` | Second column not a non-negative decimal integer | tsv-parse |
| `TSV_INVALID_NAMESPACE` | Third column not a non-negative decimal integer | tsv-parse |
| `TSV_TOO_MANY_COLUMNS` | More than three columns in a row | tsv-parse |
| `SIDECAR_DBNAME_MISSING` | Sidecar JSON present but has no `dbname` | tsv-parse |
| `JSON_MALFORMED` | Not well-formed JSON | json-parse, validate |
| `JSON_SHAPE` | Not a single top-level object with a `pages` list (or wrong member types) | json-parse, validate |
| `ITEM_SHAPE` | A `pages` entry is not a string or a well-typed tuple | json-parse, validate |
| `DBNAME_MISSING` | No `dbname` | json-parse, validate |
| `DBNAME_INVALID` | `dbname` not in the sitematrix | validate |
| `SPARQL_NO_VARIABLE` | No projected variable selectable (§7.4 rule 2) | sparql |
| `SPARQL_NO_MATCHING_ROWS` | Zero conforming rows (§7.4 rule 4) | sparql |
| `QUARRY_NO_TITLE_COLUMN` | Multiple columns, none named `page_title` | quarry |

## Shared fixture: `sitematrix.json`

A captured subset of the meta.wikimedia.org sitematrix response
(SPEC §4.2), trimmed to the language sections `de`, `en`, `es`, `li`, `sm`
plus the `metawiki` special, with `count` recomputed. Harnesses use it for
every dbname-validity check and dbname ↔ domain derivation (`dbname` and
`url` members of each `site` object). Captured 2026-08-23 from
`https://meta.wikimedia.org/w/api.php?action=sitematrix&format=json&formatversion=2`.

## Captured upstream samples

Mapper inputs are real captured responses (2026-08-23), so mappers are
tested without network access. Each case's `provenance` records the
request; **derived** inputs were assembled from captured rows/values to
exercise a specific rule (e.g. reordering so a target-domain row is or
isn't first), with query text marked illustrative where applicable.

| Capture | Used by |
|---|---|
| PetScan manual-list query on enwiki (3 pages incl. a Talk page) | `petscan/*` |
| WDQS `?article` query for Q60/Q90/Q9202 enwiki articles | `sparql/article-variable`, `zero-conforming-rows`, values in derived cases |
| WDQS all-Wikipedia sitelinks for Q9202 (148 rows, mixed domains) | `sparql/no-variable-selected`, rows in derived cases |
| Quarry query 104907 run 1141735 on enwiktionary (rows trimmed to 6) | `quarry/page-title-extra-column`, shape of derived cases |

## Fixture-pinned interpretations

Where the spec leaves latitude, these fixtures pin one behavior so
independent implementations agree. Each pin is a candidate spec
clarification:

1. **Ingestion dedups, boundaries reject:** operations that model an
   ingesting UI (`tsv-parse`, `simple`, and the three mappers)
   de-duplicate on (`item_title`, `namespace_id`), first occurrence wins
   — normalization is the ingesting UI's job (§8). `json-parse` and
   `validate` model the system boundary and reject duplicates
   (`DUPLICATE_ITEM`): §4.4 says a Selection MUST NOT contain them, and
   §8 says a storing system rejects rather than fixes. The spec itself
   never authorizes serializing a duplicate.
2. **TSV cells:** empty trailing cells mean *absent*; a final newline
   after the last row is optional; a blank interior line is an
   `EMPTY_TITLE` row; more than three columns is an error.
3. **Header rows:** there is no header allowance to strip — a header row
   is parsed as data (and fails on its non-numeric id when 3-column).
4. **Numeric fields:** TSV id/namespace columns must match `^[0-9]+$`;
   JSON `id`/`namespace_id` must be non-negative integers (fractions are
   `ITEM_SHAPE`).
5. **dbname side channel:** filename convention = penultimate
   dot-segment, honored only when it is a known dbname; an explicit
   sidecar beats the filename; a sidecar without `dbname` is an error
   (§5.1 "MUST contain").
6. **Percent-decoding never fails:** invalid escape sequences pass
   through verbatim (§7.1, §7.4).
7. **Verbatim mapper titles:** PetScan and Quarry titles are taken as
   reported — only §7.1 and §7.4 mandate decoding and space replacement.
8. **Quarry database:** Quarry's run metadata may report `enwiki_p` or
   `enwiki`; a trailing `_p` is stripped.
9. **Zero items is a valid Selection.**
10. The non-normative 255-byte title note (§4.3) is not enforced.

## Coverage

Every MUST/MUST NOT in SPEC §4–§7, mapped to its cases:

| Spec clause | Cases |
|---|---|
| §4.1 `dbname` REQUIRED | json-parse/dbname-missing, validate/dbname-missing |
| §4.2 valid dbnames from sitematrix | validate/valid, validate/dbname-invalid, json-parse/dbname-not-string, tsv-parse/filename-dbname |
| §4.3 `item_title` REQUIRED | tsv-parse/empty-title, json-parse/item-empty-tuple, json-parse/item-title-not-string, json-parse/empty-title |
| §4.3 title SHOULD be db_style | simple/pipeline-basic, sparql/title-decoding |
| §4.3 non-extant items allowed | tsv-parse/same-id-different-titles, tsv-parse/header-like-title |
| §4.3 fields MUST NOT contain `\t`/`\n` | json-parse/forbidden-tab, json-parse/forbidden-newline, tsv-serialize/forbidden-tab-in-title, tsv-serialize/forbidden-newline-in-title, simple/forbidden-decoded-tab, simple/forbidden-decoded-newline, validate/forbidden-character |
| §4.4 MUST NOT contain duplicates; key (title, ns); absent ns ≡ 0 | tsv-parse/deduplication, json-parse/duplicate-absent-namespace, validate/duplicate-items, simple/deduplication, sparql/duplicate-rows-collapse, quarry/deduplication |
| §4.4 same title, different ns acceptable | tsv-parse/same-title-different-namespace, petscan/manual-list |
| §4.4 id never part of the key | tsv-parse/same-id-different-titles, tsv-parse/deduplication |
| §5.1.1 MUST NOT contain a header row | tsv-parse/header-row, tsv-parse/header-like-title, tsv-serialize/canonical |
| §5.1.2 first column MUST be non-null, MUST contain title | tsv-parse/empty-title, tsv-parse/basic, tsv-parse/blank-interior-line |
| §5.1.3–4 optional id / namespace columns; `title\t\tns` | tsv-parse/basic, tsv-serialize/canonical |
| §5.1 row structure (pins: numeric columns, ≤3 columns) | tsv-parse/invalid-id, tsv-parse/invalid-namespace, tsv-parse/too-many-columns |
| §5.1.5 trailing tabs optional | tsv-parse/trailing-tabs, tsv-parse/no-trailing-newline |
| §5.1 zero items valid (pin #9) | tsv-parse/empty-file, tsv-serialize/empty |
| §5.1.6 MUST be UTF-8 | tsv-parse/utf8-titles, tsv-parse/invalid-utf8 |
| §5.1.7 no `\t`/`\n` in fields | tsv-serialize/forbidden-tab-in-title, tsv-serialize/forbidden-newline-in-title |
| §5.1 sidecar MUST contain `dbname`; filename RECOMMENDED | tsv-parse/sidecar-dbname, tsv-parse/sidecar-missing-dbname, tsv-parse/sidecar-precedence, tsv-parse/filename-dbname, tsv-parse/filename-dbname-unknown |
| §5.2 MUST be single top-level object with `pages` | json-parse/top-level-array, json-parse/missing-pages, json-parse/pages-not-array, json-parse/malformed, validate/malformed-shape |
| §5.2 items are strings or tuples, never objects | json-parse/basic, json-parse/canonical-forms, json-parse/item-object, json-parse/item-id-not-number, json-parse/item-namespace-not-number, json-parse/item-id-not-integer |
| §5.2 `null` id with known ns | tsv-parse/basic, json-parse/basic, tsv-serialize/canonical |
| §5.2 MAY carry extra data | json-parse/extras-preserved |
| §6.1 `source` preserved verbatim; open type space | json-parse/basic, json-parse/extras-preserved, validate/unknown-source-type |
| §6.2 SHOULD default `dynamic: true` (PetScan, SPARQL, Quarry) | petscan/manual-list, sparql/article-variable, quarry/page-title-extra-column |
| §7.1 normalization pipeline (each step) | simple/pipeline-basic, simple/url-wiki-prefix, simple/url-index-php-prefix, simple/percent-decoding, simple/invalid-percent-passthrough, simple/forbidden-decoded-tab, simple/forbidden-decoded-newline, simple/deduplication, simple/only-comments |
| §7.1 title-only; prefixes stay embedded | simple/namespace-prefix-embedded |
| §7.2 parse per §5.1; dbname from filename/sidecar | tsv-parse/* (the §7.2 MUST-prompt is UI behavior; filename-dbname-unknown pins the no-dbname result that triggers it) |
| §7.3 fields MUST come from PetScan output; dbname MUST come from PetScan | petscan/manual-list |
| §7.4.1 dbname REQUIRED input; domain via sitematrix | all sparql cases (`params.dbname`) |
| §7.4.2 variable selection: `?url` > `?article` > row scan in projection order (v1.0.0) | sparql/article-variable, sparql/url-over-article, sparql/projection-order-scan, sparql/scan-skips-leading-rows, sparql/no-variable-selected |
| §7.4.3 rows MUST match either URL form; MUST drop; MUST report counts | sparql/dropped-rows-reported, sparql/projection-order-scan, sparql/index-php-url-form |
| §7.4.4 zero conforming rows is an error | sparql/zero-conforming-rows |
| §7.4.5 percent-decode, spaces → underscores, title-only | sparql/title-decoding |
| §7.5.1 `page_title`/`page_id`/`page_namespace` convention | quarry/full-columns, quarry/page-title-extra-column |
| §7.5.2 single column of any name is titles | quarry/single-column-any-name |
| §7.5.3 multi-column without `page_title` MUST error instructing alias | quarry/no-title-column (code only; wording untested) |
| §7.5.4 dbname MUST come from Quarry run metadata (`enwiki_p` → `enwiki`) | quarry/page-title-extra-column, quarry/full-columns |

Not fixture-encodable (runtime/UI behavior, noted for completeness):
§4.3 title-over-id precedence (consumer semantics), §6.1 treating
unrecognized source types as static at materialization time, §6.2
re-materialization triggers and serve-last-good-on-failure, §7.2's
prompt-the-user requirement, §8 size policy (each system's own).
