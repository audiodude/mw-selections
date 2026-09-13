# mw-selections

A specification — and reference implementations — for **Selections**:
portable lists of items (articles, pages) from a single Wikimedia project.

Lists of articles are the most commonly produced and shared data artifact in
the Wikimedia technical ecosystem (PetScan, Quarry, PagePile, WDQS, on-wiki
bots, WP1), but there has never been a standard for storing or transmitting
them. This project specifies one.

```
Statue_of_Liberty	28617	0
Paris	54321
Bare_title
```

```json
{ "dbname": "enwiki", "pages": ["Statue_of_Liberty", ["Paris", 54321, 0]] }
```

## Contents

- [docs/SPEC.md](docs/SPEC.md) — the Selections specification, v1.0.0
  (canonical copy)
- [fixtures/](fixtures/) — conformance fixtures: 78 language-neutral test
  cases covering every normative rule in SPEC §4–§7, with captured upstream
  samples ([harness contract](fixtures/README.md))
- [packages/selection-core/](packages/selection-core/) — isomorphic
  TypeScript implementation of the spec: parsers, source mappers,
  serializers, validators
- [packages/selection-picker/](packages/selection-picker/) — the
  `<selection-picker>` web component any web tool can embed
- [docs/decision-record.md](docs/decision-record.md) — design decisions behind
  the spec and the planned implementations
- [docs/tasks/](docs/tasks/) — task breakdown for the implementation roadmap

Live demo of the picker: https://selection-picker.audiodude.xyz
(deployed with `scripts/deploy-demo.sh`)

Manual entry applies WP1 Simple title checks: after percent-decoding, entries
must not contain `# < > [ ] { } |` or exceed 256 UTF-8 bytes (including URL
prefixes). Invalid entries block confirmation with an explanatory message.
This does not add a total input-size cap or a nonempty-selection requirement.

## npm packages

Available on npm:

- `@audiodude/selection-core` — dependency-free ESM for Node ≥18 and browsers,
  with TypeScript declarations.
- `@audiodude/selection-picker` — browser-only ESM and TypeScript declarations,
  plus a self-contained `dist/selection-picker.min.js` browser module.

Install the picker for an embedded UI, or core for headless
use. Import the picker in the browser entry point, not during server rendering:

```sh
npm install @audiodude/selection-picker
```

```js
import "@audiodude/selection-picker";
```

See the [picker usage](packages/selection-picker/README.md) and
[core API](packages/selection-core/README.md). CommonJS `require()` is not supported.

### Build and validate

From the repository root, using Node 24 for development:

```sh
npm ci
npm run build
npm run typecheck
npm test
npm run check:packages
```

`build` cleans and builds core before picker. Each package contains compiled ESM,
declarations, README, and a copy of the MIT license; source and tests are excluded.
`check:packages` rebuilds, packs, and installs both tarballs into a temporary
consumer outside the workspace. It checks core behavior, Node/browser TypeScript
consumers, tree-shaken picker bundling, and standalone bundle imports, then removes
the temporary files. To retain the bundled consumer for a browser smoke check:

```sh
npm run check:packages -- --browser-output /tmp/selection-consumer.js
```

Load that file with `<script type="module">` in an HTTP-served page containing a
`<selection-picker>` and exercise `open()`. The script checks registration; it
does not create a UI harness. CI runs artifact checks on Node 18 and 24, and the
full typecheck/test suite on Node 24 (happy-dom requires Node ≥20). CI does not
publish or deploy.

### Manual release

Keep both package versions aligned, and update picker's compatible core
dependency and the lockfile when advancing versions. Run the checks above first.
From the repository root, produce the release artifacts:

```sh
npm pack --workspace=@audiodude/selection-core
npm pack --workspace=@audiodude/selection-picker
```

The `prepack` hooks rebuild automatically; picker also builds core first.
Inspect the resulting tarballs before publishing. When a release is explicitly
authorized and npm authentication/scope permissions are configured, publish
**core first**, then picker:

```sh
npm publish ./audiodude-selection-core-0.1.0.tgz --access public
npm publish ./audiodude-selection-picker-0.1.0.tgz --access public
```

Use the new version in these filenames for subsequent releases. Publish from
these verified tarballs, not from the private workspace root.

## Status

**Specification + fixtures + core library + picker widget.** Planned, in
order:

1. ~~Conformance fixtures~~ — done; see [fixtures/](fixtures/)
   (`scripts/lint_fixtures.py` checks the tree's internal consistency)
2. ~~`selection-core`~~ — done; see
   [packages/selection-core/](packages/selection-core/) — isomorphic
   TypeScript: parsers, source mappers, serializers, validators; passes all
   78 conformance fixtures (`npm test`)
3. ~~`selection-picker`~~ — done; see
   [packages/selection-picker/](packages/selection-picker/) — a
   `<selection-picker>` web component any web tool can embed to let users
   create Selections from manual entry, `.swiki` upload, PetScan, SPARQL, or
   Quarry
4. ~~Packaging and npm/CDN distribution~~ — version 0.1.0 published for both
   packages, with packed-consumer CI validation
5. Integration into [WP1](https://github.com/openzim/wp1)

## Related

- [WP1](https://wp1.openzim.org) ([repo](https://github.com/openzim/wp1)) —
  where Selections originate
- [PetScan](https://petscan.wmcloud.org/),
  [Quarry](https://quarry.wmcloud.org/),
  [Wikidata Query Service](https://query.wikidata.org/)

## License

[MIT](LICENSE)
