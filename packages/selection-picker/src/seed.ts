import type { Selection } from "@audiodude/selection-core";
import type { FormState } from "./forms.js";
import type { Mode } from "./ingest.js";

export interface SeedState {
  mode: Mode;
  state: Partial<FormState>;
  /** Pages a static seed could not express as title lines (ns ≠ 0). */
  omitted: number;
}

/**
 * open(seed) prefill. A dynamic source rehydrates its query, never its
 * materialized list — the only honest reading of `open(seed)` under the
 * create-only contract (decision record #1; task 03). A swiki seed cannot
 * rehydrate a File, so its titles become editable manual text; unrecognized
 * types are static (SPEC §6.1) and do the same. The emitted source then
 * honestly becomes `simple`: the user is editing a title list, not
 * re-uploading a file.
 *
 * Manual text can only express main-namespace titles (core's
 * normalizeManualText hardcodes ns 0), so ns ≠ 0 pages are **omitted** and
 * counted for the element to surface — mapping `["Talk_x", null, 1]` to the
 * bare line `Talk_x` would silently re-home it into mainspace, a different
 * page. Page ids are dropped; that is lossy but identity-preserving.
 *
 * `state.dbname` may be a dbname here: resolveDbname falls back to treating
 * an unrecognized project field as one.
 */
export function seedState(seed: Selection): SeedState {
  const source = seed.source;
  switch (source?.type) {
    case "petscan":
      return {
        mode: "petscan",
        state: { dbname: seed.dbname, petscanUrl: source.url ?? "" },
        omitted: 0,
      };
    case "quarry":
      return {
        mode: "quarry",
        state: { dbname: seed.dbname, quarryUrl: source.url ?? "" },
        omitted: 0,
      };
    case "sparql":
      // An absent endpoint stays empty rather than falling back to WDQS: the
      // endpoint is part of the source's identity, not a picker default.
      return {
        mode: "sparql",
        state: {
          dbname: seed.dbname,
          sparqlEndpoint: source.endpoint ?? "",
          sparqlQuery: source.query ?? "",
        },
        omitted: 0,
      };
    default: {
      const titles: string[] = [];
      let omitted = 0;
      for (const page of seed.pages) {
        if (typeof page === "string") titles.push(page);
        else if ((page[2] ?? 0) === 0) titles.push(page[0]);
        else omitted += 1;
      }
      return {
        mode: "manual",
        state: { dbname: seed.dbname, manualText: titles.join("\n") },
        omitted,
      };
    }
  }
}
