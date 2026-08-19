# 04 — Packaging & distribution

**Repo:** mw-selections
**Depends on:** [02](02-selection-core.md), [03](03-selection-picker.md)

## Goal

Monorepo layout and npm publishing so consumers get the two documented
install paths: CDN script tag for zero-build pages, npm dependency for
bundled apps.

## Details

- Monorepo with two packages: `selection-core` and `selection-picker`
  (project-neutral naming, personal npm scope).
- Semver. CDN consumers pin major (`.../selection-picker@1/...`); WP1 pins
  exact versions via npm. Minor releases MUST NOT change the emitted
  Selection shape.
- The spec versions independently and conservatively; fixtures version with
  the spec in this repo.
- README install/usage examples for both paths (jsDelivr script tag; npm
  import).

## Acceptance

- `npm install` + import works in a scratch Vite app; the jsDelivr URL works
  in a scratch static HTML page.
- CI publishes on tag.
