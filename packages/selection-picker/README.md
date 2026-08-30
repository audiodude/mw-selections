# @audiodude/selection-picker

`<selection-picker>` — an embeddable custom element that lets a user of any
web tool build a [Selection](../../docs/SPEC.md) from pasted titles, a
`.swiki` upload, a PetScan URL, a SPARQL query, or a Quarry URL, and hands
the host canonical Selection JSON. Create-only: editing a stored Selection is
the host's concern.

Lit 3, Shadow DOM, native `<dialog>`, constructable stylesheets, no `eval` —
CSP-safe. All parsing, mapping, and validation come from
[`@audiodude/selection-core`](../selection-core/); all upstream fetches go
directly from the browser (PetScan, WDQS, and Quarry all serve
`Access-Control-Allow-Origin: *`).

## Use it in a plain HTML page

```html
<selection-picker id="picker" dbname="enwiki" max-bytes="26214400"></selection-picker>
<script type="module">
  import "https://cdn.example/selection-picker.min.js"; // see examples/plain.html
  const picker = document.getElementById("picker");
  const selection = await picker.open(); // rejects AbortError if cancelled
  console.log(selection); // { dbname, pages, source }
</script>
```

`examples/plain.html` is the runnable version: `npm run build -w @audiodude/selection-picker`,
serve the package directory, open `/examples/plain.html`.

## Attributes

| Attribute | Meaning |
|---|---|
| `dbname` | Comma-separated **allowlist** of dbnames. One entry pins the project and hides the project field. Several entries restrict the project field. Absent: every Wikimedia project is offered. A source-derived dbname outside the list is a hard error, phrased as domains ("Your URL names de.wikipedia.org, but this page is only configured to accept en.wikipedia.org."). |
| `max-bytes` | Cap on the UTF-8 byte length of the canonical Selection JSON. Exceeding it rejects; the widget never truncates. |
| `max-items` | Cap on `pages.length`. Same semantics. |
| `proxy` | Optional escape hatch for hosts running their own materializer. Materializer requests (PetScan, WDQS, Quarry) become `<proxy>?url=<encoded upstream URL>`; the proxy must return the upstream body unchanged. The sitematrix is never proxied — it always loads directly from meta. Nothing defaults to it. |

## API

- `open(seed?: Selection): Promise<Selection>` — shows the modal; resolves
  with the accepted Selection, rejects with a `DOMException` named
  `AbortError` if the user cancels or closes the dialog. Requires the
  element to be in the document; calling it while the dialog is already
  open throws. Without a seed the form starts blank — every call is a
  fresh create session. `seed` prefills one mode: `petscan`/`quarry`/`sparql`
  seeds reopen the **query** (reloading re-materializes it); `simple`,
  `swiki`, unrecognized, and absent source types rehydrate the pages as
  editable title lines and therefore emit `source: {type: "simple"}`. Title
  lines cannot express a namespace, so a static seed's non-main-namespace
  pages are omitted from the prefill (the dialog reports how many); page
  ids are dropped (the title alone identifies the page).
- `selection` event — `CustomEvent<Selection>`, `bubbles`, `composed`,
  `detail` is the same Selection the promise resolves with.
- `fetchImpl?: FetchLike` — property (not attribute) overriding the fetch
  implementation. Test seam; hosts normally leave it alone.

## Emitted sources (SPEC §6)

| Mode | `source` |
|---|---|
| Paste titles | `{type: "simple"}` |
| `.swiki` upload | `{type: "swiki"}` |
| PetScan | `{type: "petscan", url, dynamic: true}` |
| SPARQL | `{type: "sparql", endpoint, query, dynamic: true}` |
| Quarry | `{type: "quarry", url, dynamic: true}` |

Every emitted Selection passes `selection-core`'s structural gate
(`validateSelection`) before the widget hands it over. SPEC §8 assigns that
gate to the *storing system*; the widget runs the same check first (task 03
acceptance) so a host's own gate cannot be the first thing to reject it.

## dbname sources

`dbname` is never guessed. PetScan and Quarry report it (SPEC §7.3, §7.5);
`.swiki` carries it in the filename (§5.1) and the widget prompts when it
does not (§7.2); pasted titles and SPARQL take it as user input (§7.4).
§5.1's optional sidecar-JSON channel is not exposed in v1 — the picker has
one file input; name the file `<anything>.<dbname>.tsv` or pick the project
when prompted. Valid dbnames come from the live meta sitematrix, fetched
once per page with `origin=*` (verified 2026-08-29: without it the API
sends no CORS header; the spec's §4.2 URL omits the parameter).

## Development

```bash
npm run test -w @audiodude/selection-picker       # vitest + happy-dom
npm run typecheck -w @audiodude/selection-picker
npm run build -w @audiodude/selection-picker      # dist/selection-picker.min.js
```

Per-mode tests replay the repository's [conformance
fixtures](../../fixtures/) through the ingest pipeline, so the widget's
output is pinned to the same expectations as `selection-core`.

Lit is used **without decorators** (`static properties` + `declare`):
esbuild's standard-decorator transform, which both vitest and the bundle use,
is incompatible with Lit's decorators.

UI strings live in `src/strings.ts`; English-only v1.
