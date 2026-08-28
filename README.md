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
- [fixtures/](fixtures/) — conformance fixtures: 77 language-neutral test
  cases covering every normative rule in SPEC §4–§7, with captured upstream
  samples ([harness contract](fixtures/README.md))
- [docs/decision-record.md](docs/decision-record.md) — design decisions behind
  the spec and the planned implementations
- [docs/tasks/](docs/tasks/) — task breakdown for the implementation roadmap

## Status

**Specification + fixtures + core library.** Planned, in order:

1. ~~Conformance fixtures~~ — done; see [fixtures/](fixtures/)
   (`scripts/lint_fixtures.py` checks the tree's internal consistency)
2. ~~`selection-core`~~ — done; see
   [packages/selection-core/](packages/selection-core/) — isomorphic
   TypeScript: parsers, source mappers, serializers, validators; passes all
   77 conformance fixtures (`npm test`)
3. `selection-picker` — a `<selection-picker>` web component any web tool can
   embed to let users create Selections from manual entry, `.swiki` upload,
   PetScan, SPARQL, or Quarry
4. Integration into [WP1](https://github.com/openzim/wp1)

## Related

- [WP1](https://wp1.openzim.org) ([repo](https://github.com/openzim/wp1)) —
  where Selections originate
- [PetScan](https://petscan.wmcloud.org/),
  [Quarry](https://quarry.wmcloud.org/),
  [Wikidata Query Service](https://query.wikidata.org/)

## License

[MIT](LICENSE)
