# Selections

**Status:** Draft 0.1
**Editor:** Travis Briggs ([User:Audiodude](https://en.wikipedia.org/wiki/User:Audiodude) \<audiodude@gmail.com\>), in association with [Kiwix](https://kiwix.org)
**Canonical home:** https://github.com/audiodude/mw-selections

This document is derived from *"WP1 — The Source for Selections"* (Travis
Briggs, 2026-08-12, updated 2026-08-17), whose text was 100% manually written.
This adaptation into a standalone specification was produced with AI
assistance (Claude) under the author's direction. Deviations from the source
document are listed in [§10 Editorial decisions](#10-editorial-decisions).

## 1. Introduction

A **Selection** is a static list of unique items from a single Wikimedia
project ([en.wikipedia.org](https://en.wikipedia.org),
[es.wiktionary.org](https://es.wiktionary.org), etc.), together with metadata
about the list itself.

A list of articles is the most commonly generated and shared data artifact in
the entire Wikimedia technical ecosystem. Numerous on-wiki bots (*AAlertBot*,
*SDZeroBot*) produce or modify lists such as *orphaned articles*. Toolforge
hosts tools such as [PetScan](https://petscan.wmcloud.org/) and
[PagePile](https://pagepile.toolforge.org/), and
[Quarry](https://quarry.wmcloud.org/) is frequently used to generate lists of
articles meeting some criterion. There is no standard for how or where to
share these lists; each tool provides its own ad-hoc TSV, JSON, Wikitext, and
HTML exports.

This document defines the **Selection** as a portable, documented,
well-specified format for storing and transmitting these lists. Adoption is
not required and will not happen overnight; the definition is offered on its
technical merits as a reference for those writing new Wikimedia tools and
bots.

Selections originated in [WP1](https://wp1.openzim.org)
([repo](https://github.com/openzim/wp1)), where they are curated and used to
generate offline [ZIM](https://en.wikipedia.org/wiki/ZIM_(file_format))
archives on Kiwix infrastructure.

## 2. Conformance

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD",
"SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" in this
document are to be interpreted as described in BCP 14
[[RFC 2119](https://www.rfc-editor.org/rfc/rfc2119)]
[[RFC 8174](https://www.rfc-editor.org/rfc/rfc8174)] when, and only when, they
appear in all capitals.

## 3. Terminology

- **Selection** — a static list of unique items from a single Wikimedia
  project, plus metadata about the list itself.
- **Item** — one entry in a Selection: an `item_title` with optional `id` and
  `namespace_id` (§4.3).
- **dbname** — the identifier of the Wikimedia project database the items
  resolve against, e.g. `enwiki` (§4.2).
- **Producer** — a system that creates Selections (a tool UI, a bot, a
  materializer).
- **Consumer** — a system that ingests Selections.
- **Storing system** — a system that persists Selections and serves them at
  stable URLs (e.g. WP1).
- **Source** — a provenance descriptor recording how a Selection's items were
  obtained (§6).
- **Materialization** — producing a concrete Selection from a source (e.g.
  running a PetScan query and mapping its results).
- **Dynamic** — a Selection whose storing system may re-materialize it from
  its source (§6.2).

## 4. Data model

### 4.1 Selection

A Selection consists of:

1. A REQUIRED list-wide metadatum, **`dbname`**, describing the database that
   the items resolve against.
2. A list of **items** (§4.3).

Any other metadata is OPTIONAL and defined by the producer or storing system.

### 4.2 dbname

Valid dbnames are taken from the
[meta.wikimedia.org](https://meta.wikimedia.org) action API:

https://meta.wikimedia.org/w/api.php?action=sitematrix&format=json&formatversion=2

A valid dbname is the value of the `dbname` key of a `site` object in this
response. The following command demonstrates these names:

```sh
curl -s 'https://meta.wikimedia.org/w/api.php?action=sitematrix&format=json&formatversion=2' \
  | jq -r '.sitematrix | del(.count) | .[] | if type == "array" then .[] else .site[] end | .dbname'
```

E.g. `enwiki`, `smwiki`, `labswiki`, `liwiktionary`, `metawiki`,
`eswikibooks`.

### 4.3 Items

An item is a tuple of:

1. An **`item_title`** (REQUIRED). This SHOULD be *db_style*, i.e. underscores
   (`_`) instead of spaces: `Statue_of_Liberty`.
2. An OPTIONAL **`id`**: the database id, like `page_id` in enwiki: `28617`.
3. An OPTIONAL numeric **`namespace_id`** (0: "main"/no namespace, 1: Talk,
   4: Wikipedia, etc.). An absent `namespace_id` is equivalent to `0`.

The `id` is provided for the convenience of consumers, e.g. for database
JOINs. If `item_title` and `id` disagree, the `item_title` takes precedence.

A Selection MAY contain `item_title` and `id` entries that do not correspond
to extant items, as long as they are formatted correctly.

Item fields MUST NOT contain newline (`\n`) or tab (`\t`) characters. **No
valid way** of escaping these characters is recognized.

*Non-normative note:* MediaWiki limits page titles to 255 bytes of UTF-8;
consumers MAY reject longer titles.

### 4.4 Uniqueness

The ordering of a Selection is arbitrary and carries no meaning.

A Selection MUST NOT contain duplicate items. The uniqueness key is the pair
**(`item_title`, `namespace_id`)**, with an absent `namespace_id` treated as
`0`. Two items with the same `item_title` but different `namespace_id` are
completely acceptable. While two items in a Selection might (presumably
erroneously) have the same `id`, the `id` is never part of the uniqueness
key.

## 5. Serializations

### 5.1 TSV (`.swiki`)

Selections are serialized as plain TSV files with the following properties:

1. The file MUST NOT contain a header row (i.e.
   `item_title\tid\tnamespace_id`).
2. The first column MUST be non-null for all rows and MUST contain the
   `item_title` of the item.
3. The second column MAY contain the `id`.
4. The third column MAY contain the `namespace_id`. If it does not, the
   namespace id 0 (default/main) is assumed. Per TSV convention, a row with a
   NULL or unknown database id MAY contain an `item_title`, followed by two
   tab characters (`\t`), followed by the `namespace_id`.
5. All trailing tabs (`\t`) are optional. If an item has only an
   `item_title`, the row MAY contain only that datum.
6. The file MUST be encoded as UTF-8.
7. Item fields MUST NOT contain newline (`\n`) or tab (`\t`) characters
   (§4.3).

Example (tab-separated):

```
Statue_of_Liberty	28617	0
Paris	54321
Talk_page_example		1
Bare_title
```

The REQUIRED `dbname` is ALWAYS transmitted by an out-of-band ("side")
channel. It is RECOMMENDED that it be sent either directly in the file name
(e.g. `my-selection.enwiki.tsv`) or in an accompanying JSON file that may
contain metadata beyond the scope of this definition. If a JSON file is used,
it MUST contain a single top-level object with a property
`"dbname": "<the name, e.g. enwiki>"`. Other fields are optional.

The non-canonical file extension **`.swiki`** is proposed for serialized
Selections.

### 5.2 JSON

For transmission between systems — and, for small Selections, storage — the
entire Selection can be represented as JSON.

The JSON MUST contain a single top-level object with a `pages` key listing the
items. Each entry in the list is either a single string (an `item_title`) or a
tuple-style list of (`item_title`, `id`, `namespace_id`). Trailing tuple
elements are optional, and an unknown `id` alongside a known `namespace_id` is
represented as `null` (mirroring the TSV `title\t\tns` case). Items in the
`pages` list are never objects; this saves space by avoiding thousands of
lines of key redundancy.

The JSON MAY freely encode additional data about the Selection as the
producer sees fit, including the `source` object defined in §6.

In TypeScript notation, the contract is:

```ts
/** Any JSON-serializable value — extras must survive JSON round-tripping. */
type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/**
 * A page entry: bare item_title, or a tuple.
 * `id` is null when unknown but namespace_id is present
 * (mirrors the TSV `title\t\tns` case).
 */
type Item =
  | string
  | [item_title: string, id?: number | null, namespace_id?: number];

interface Source {
  type: "simple" | "swiki" | "petscan" | "sparql" | "quarry" | (string & {});
  /** For URL-based sources (petscan, quarry). */
  url?: string;
  /** For sparql: the query endpoint, e.g. "https://query.wikidata.org/sparql". */
  endpoint?: string;
  /** For sparql: the query text, verbatim. */
  query?: string;
  /** Re-materialize from the source instead of treating pages as final (§6.2). */
  dynamic?: boolean;
  [key: string]: JsonValue | undefined;
}

interface Selection {
  dbname: string;
  pages: Item[];
  source?: Source;
  /** Producers MAY attach additional metadata. */
  [key: string]: JsonValue | undefined;
}
```

Example:

```json
{
  "dbname": "enwiki",
  "pages": [
    "Bare_title",
    ["Statue_of_Liberty", 28617, 0],
    ["Talk_page_example", null, 1]
  ],
  "source": {
    "type": "petscan",
    "url": "https://petscan.wmcloud.org/?psid=12345678",
    "dynamic": true
  }
}
```

### 5.3 JSON Lines

TBD (reserved).

### 5.4 Wikitext

TBD (reserved).

## 6. Source (provenance)

### 6.1 The `source` object

A Selection serialized as JSON MAY carry a `source` object recording how its
items were obtained. Storing systems SHOULD preserve `source` verbatim: it is
what makes a stored Selection editable (re-open the query that produced it)
and refreshable (§6.2). Discarding it is unrecoverable.

Defined `type` values and their fields:

| `type` | Fields | Meaning |
|---|---|---|
| `simple` | — | Manually entered list; the pages ARE the state |
| `swiki` | — | Uploaded `.swiki`/TSV file; inherently static |
| `petscan` | `url` | A PetScan query URL |
| `sparql` | `endpoint`, `query` | A SPARQL query (query text verbatim) |
| `quarry` | `url` | A Quarry query URL |

The `type` value space is open: producers MAY define additional types.
Unrecognized types MUST be treated as static (§6.2).

### 6.2 `dynamic`

When `source.dynamic` is `true`, the storing system MAY re-materialize the
Selection from its source at triggers of its own choosing (e.g. when a
scheduled export runs). Re-materialization replaces the Selection's `pages`;
the `source` is the durable identity, the `pages` are its latest evaluation.

If re-materialization fails (upstream error, or the result violates the
storing system's policies), the storing system SHOULD continue serving the
last valid materialization rather than failing or serving a partial result.

Defaults for producers: `petscan`, `sparql`, and `quarry` sources SHOULD
default to `dynamic: true`; `simple` and `swiki` are inherently static and
SHOULD omit `dynamic`.

## 7. Source mapping rules

These rules are normative for producers that ingest the named source kinds.
They exist so that independent implementations produce byte-identical
Selections from the same input; the conformance fixtures (§9) encode them as
executable test cases.

### 7.1 Manual text (`simple`)

Given user-entered text, one candidate item per line:

1. Split on newlines; trim surrounding whitespace from each line.
2. Drop empty lines and comment lines beginning with `#`.
3. Strip the URL prefixes `https://<domain>/wiki/` and
   `https://<domain>/w/index.php?title=` when present.
4. Percent-decode.
5. Replace spaces with underscores.
6. Reject any resulting title containing `\t` or `\n` (report to the user).
7. De-duplicate per §4.4.

Manual items are title-only (no `id`, no `namespace_id`); namespace prefixes,
if any, remain embedded in the title.

### 7.2 `.swiki` / TSV upload (`swiki`)

Parse per §5.1. The `dbname` comes from the filename or sidecar JSON (§5.1);
if absent from both, the ingesting UI MUST obtain it from the user rather
than guess.

### 7.3 PetScan (`petscan`)

Given a PetScan URL, fetch its JSON output. `item_title`, `id`, and
`namespace_id` MUST be taken from PetScan's per-page output fields. The
`dbname` MUST be derived from the query's target wiki as reported by PetScan,
never from user input.

### 7.4 SPARQL (`sparql`)

1. The `dbname` is a REQUIRED user input alongside the query; the project
   domain (e.g. `en.wikipedia.org`) is derived from it via the sitematrix.
2. Result variable selection: if a variable named `?url` or `?article` is
   projected, use it (in that priority order). Otherwise scan the projected
   variables in SELECT projection order and choose the first whose binding in
   the first result row contains the project domain as a substring.
3. Per-row enforcement: every row's value for the chosen variable MUST match
   `https://<domain>/wiki/<title>` or
   `https://<domain>/w/index.php?title=<title>`. Non-matching rows MUST be
   dropped, and the ingested/dropped counts MUST be reported (to the user at
   creation time; in materialization records otherwise).
4. Zero conforming rows is an error.
5. The title is the URL remainder, percent-decoded, spaces replaced with
   underscores. SPARQL items are title-only; namespace prefixes remain
   embedded in the title.

### 7.5 Quarry (`quarry`)

1. Column recognition, using MediaWiki's own column names: a column named
   `page_title` provides `item_title`; `page_id` provides `id`;
   `page_namespace` provides `namespace_id` (with `page_title` unprefixed,
   per MediaWiki convention).
2. A result set with a single column of any name is treated as a list of
   titles.
3. Multiple columns with no `page_title` is an error; the error MUST instruct
   the user to alias a column (`SELECT ... AS page_title`).
4. The `dbname` MUST come from the query run's target database as reported by
   Quarry (`enwiki_p` → `enwiki`), never from user input.

## 8. Validation responsibilities

Normalization (§7.1) and user feedback are the ingesting UI's job, performed
once at creation time.

A storing system MUST NOT trust its clients. It MUST enforce structural
validity at its own API boundary, rejecting (not fixing) invalid input:

- well-formed shape per §4 and §5.2;
- item field constraints (no `\t` or `\n`) — these are the storing system's
  own output guarantees when it serves TSV;
- uniqueness per §4.4;
- a valid `dbname` per §4.2;
- its own size policy.

This specification sets no size limits. Operational caps (bytes, item counts)
are policy belonging to each system, enforced at its boundary; a Selection
with millions of items is valid.

## 9. Conformance fixtures

Language-neutral input → expected-output test cases live in this repository
alongside this document and are versioned with it. They are the reference
suite for implementations of §5 and §7; implementations SHOULD vendor and run
them. Where prose and fixtures disagree, that is a bug in one of them —
please file an issue.

## 10. Editorial decisions

Deviations from the source document, *"WP1 — The Source for Selections"*:

1. **RFC 2119 adopted.** The source document listed proper RFC 2119 semantics
   as a non-goal; that non-goal is read as scoped to the working document
   itself. A standalone specification for third-party implementers needs
   unambiguous normative language, and the source document already used the
   keywords informally throughout.
2. **Uniqueness key made explicit.** The source document stated both that
   items "can NEVER have the same `item_title`" and that two items with the
   same `item_title` but different `namespace_id` are "completely
   acceptable." These are contradictory. This specification resolves them as
   the composite key (`item_title`, `namespace_id`), absent namespace ≡ 0
   (§4.4) — matching MediaWiki's own page uniqueness rule
   (`page_namespace`, `page_title`).
3. **TypeScript contract corrected.** The source document's index signature
   (`[key: string]: string | number`) conflicted with `pages: Item[]` and
   would forbid the nested `source` object; it is loosened to `JsonValue`.
   The `Item` tuple is made partial with labeled elements so that
   `title\t\tns` is expressible. The `Source` interface is new (§6).
4. **`source`/`dynamic` provenance model added** (§6), along with the source
   mapping rules (§7) and the validation-responsibility split (§8), per the
   project decision record
   ([docs/decision-record.md](decision-record.md)).
