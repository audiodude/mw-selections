# @audiodude/selection-picker

`<selection-picker>` — an embeddable custom element that lets a user of any
web tool build a [Selection](https://github.com/audiodude/mw-selections/blob/main/docs/SPEC.md) from pasted titles, a
`.swiki` upload, a PetScan URL, a SPARQL query, a Quarry URL, or a WikiProject,
and hands the host canonical Selection JSON. Create-only: editing a stored Selection is
the host's concern.

Lit 3, Shadow DOM, native `<dialog>`, constructable stylesheets, no `eval` —
CSP-safe. Selection parsing and validation come from
[`@audiodude/selection-core`](https://github.com/audiodude/mw-selections/tree/main/packages/selection-core).
PetScan, WDQS, and Quarry requests go directly from the browser unless `proxy`
is configured. WikiProject requests always go directly; all four services
support cross-origin requests.

## Install in an application

Install with npm:

```sh
npm install @audiodude/selection-picker
```

```js
import "@audiodude/selection-picker";

const picker = document.createElement("selection-picker");
document.body.append(picker);
picker.dbname = "enwiki"; // Set the current project's constraint before open().
// In your button's click handler:
const selection = await picker.open(); // Handle AbortError on cancellation.
```

Importing registers the custom element automatically. Compiled ESM and TypeScript
declarations are included; Lit and core are installed as dependencies. Load this
package client-side only in SSR applications. CommonJS `require()` is unsupported.

## Use it in a plain HTML page

A version-pinned CDN URL serves the standalone bundle.
It includes Lit and core and needs neither a bundler nor an import map:

```html
<selection-picker id="picker" dbname="enwiki" max-bytes="26214400"></selection-picker>
<script type="module">
  import "https://cdn.jsdelivr.net/npm/@audiodude/selection-picker@0.1.0/dist/selection-picker.min.js";
  const picker = document.getElementById("picker");
  const selection = await picker.open(); // rejects AbortError if cancelled
  console.log(selection); // { dbname, pages, source }
</script>
```

`examples/plain.html` is the runnable version: `npm run build -w @audiodude/selection-picker`,
serve the package directory, open `/examples/plain.html`. It is also live at
https://selection-picker.audiodude.xyz — see *Deploying the demo* below.

For self-hosting, copy `dist/selection-picker.min.js` from the installed package
to your public assets directory and import it by URL. Its npm export is
`@audiodude/selection-picker/selection-picker.min.js`. Use either the standalone
bundle or the normal npm entry, not both.

## Attributes

| Attribute | Meaning |
|---|---|
| `dbname` | Comma-separated **allowlist** of dbnames. One entry pins the project and hides the project field. Several entries restrict the project field. Absent: every Wikimedia project is offered. A source-derived dbname outside the list is a hard error, phrased as domains ("Your URL names de.wikipedia.org, but this page is only configured to accept en.wikipedia.org."). |
| `max-bytes` | Cap on the UTF-8 byte length of the canonical Selection JSON. Exceeding it rejects; the widget never truncates. |
| `max-items` | Cap on `pages.length`. Same semantics. |
| `proxy` | Optional escape hatch for hosts running their own materializer. PetScan, WDQS, and Quarry requests become `<proxy>?url=<encoded upstream URL>`; the proxy must return the upstream body unchanged. WikiProject requests (including English Wikipedia namespace metadata) and the sitematrix are never proxied. Nothing defaults to it. |

## API

- `open(seed?: Selection): Promise<Selection>` — shows the modal; resolves
  with the accepted Selection, rejects with a `DOMException` named
  `AbortError` if the user cancels or closes the dialog. Requires the
  element to be in the document; calling it while the dialog is already
  open throws. Without a seed the form starts blank — every call is a
  fresh create session. `seed` prefills one mode: `petscan`/`quarry`/`sparql`/`wikiproject`
  seeds reopen the **query** (reloading re-materializes it); `simple`,
  `swiki`, unrecognized, and absent source types rehydrate the pages as
  editable title lines and therefore emit `source: {type: "simple"}`. Title
  lines cannot express a namespace, so a static seed's non-main-namespace
  pages are omitted from the prefill (the dialog reports how many); page
  ids are dropped (the title alone identifies the page).
- `selection` event — `CustomEvent<Selection>`, `bubbles`, `composed`,
  `detail` is the same Selection the promise resolves with.
- `modes: readonly PickerMode[]` — the widget's input modes in tab order,
  each `{name, label, description}` (`name` is a `Mode`:
  `manual | swiki | petscan | sparql | quarry | wikiproject`). Readable before the dialog
  has ever opened, so a host can render its own "Create from…" affordance
  or help text. Static: the `dbname` allowlist restricts projects, not
  modes. The same array is exported as `PICKER_MODES` for hosts rendering
  outside the element.
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
| WikiProject | `{type: "wikiproject", project, url, dynamic: true}` |

Every emitted Selection passes `selection-core`'s structural gate
(`validateSelection`) before the widget hands it over. SPEC §8 assigns that
gate to the *storing system*; the widget runs the same check first (task 03
acceptance) so a host's own gate cannot be the first thing to reject it.

### WikiProject

The tab fetches the available WikiProjects from WP1's `/v1/projects/`
endpoint when opened. Type to filter project names; matching suggestions appear
in a bounded, scrollable panel beneath the field. Click a suggestion or use
Up/Down and Enter to choose it. Escape dismisses suggestions without closing
the picker. Then click **Load**. It fetches every page of
`/v1/projects/{projectId}/articles`, not just the first page, and emits an
`enwiki` selection. Duplicate pages are removed;
namespace prefixes are resolved using English Wikipedia's siteinfo, so
categories and other non-mainspace pages retain their namespace IDs. Existing
`dbname`, `max-items`, and `max-bytes` policies apply; failures never emit a
partial list. Cancelling, switching tabs, or changing the project discards
in-flight article results.

`wikiproject` is a picker-defined source extension (SPEC §6.1). `project` is
the WP1 project name and `url` is its articles endpoint. Reopening a selection
prefills that project; Load fetches its current articles. Consumers that do
not recognize this source type must treat the materialized pages as static.

**CORS:** WP1 permits cross-origin requests to its project list and article
endpoints. WikiProject requests always go directly to WP1, and namespace
metadata goes directly to English Wikipedia, even when `proxy` is configured.

## dbname sources

`dbname` is never guessed. PetScan and Quarry report it (SPEC §7.3, §7.5);
WikiProject uses `enwiki`, the wiki tracked by WP1;
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
npm run build                                  # from repository root: core, then picker
```

The build emits `dist/index.js`, declarations, and `dist/selection-picker.min.js`.
For packed-consumer validation and release instructions, see the
[repository README](https://github.com/audiodude/mw-selections#build-and-validate).

Per-mode tests replay the repository's [conformance
fixtures](https://github.com/audiodude/mw-selections/tree/main/fixtures) through the ingest pipeline, so the widget's
output is pinned to the same expectations as `selection-core`.

Lit is used **without decorators** (`static properties` + `declare`):
esbuild's standard-decorator transform, which both vitest and the bundle use,
is incompatible with Lit's decorators.

### Deploying the demo

```bash
. ~/.secrets && ../../scripts/deploy-demo.sh
```

Builds the bundle, stages **only** `index.html` (from `examples/plain.html`)
and `selection-picker.min.js` into a temp dir, and pushes it with
`wrangler pages deploy` to the Cloudflare Pages project `selection-picker`
(`selection-picker.pages.dev`, custom domain `selection-picker.audiodude.xyz`).
Needs `CLOUDFLARE_API_TOKEN` or `CF_API_TOKEN` in the environment. Never
deploy the package or repo root directly — Pages uploads every file on disk.

UI strings live in `src/strings.ts`; English-only v1.
