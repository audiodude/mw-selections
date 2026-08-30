import {
  fetchPetscanSelection,
  fetchQuarrySelection,
  fetchSparqlSelection,
  normalizeManualText,
  parseTsv,
  serializeSelectionJson,
  validateSelection,
  type FetchLike,
  type Selection,
  type Sitematrix,
} from "@audiodude/selection-core";
import { checkCaps, type Caps } from "./caps.js";
import { checkDbname } from "./dbname.js";
import { pickerErr, pickerOk, type PickerResult } from "./result.js";
import { STRINGS } from "./strings.js";

export type Mode = "manual" | "swiki" | "petscan" | "sparql" | "quarry";

/** What the widget knows after the user filled in one mode's form. */
export type IngestInput =
  | { mode: "manual"; text: string; dbname: string }
  | { mode: "swiki"; bytes: Uint8Array; filename: string; dbname?: string }
  | { mode: "petscan"; url: string }
  | { mode: "sparql"; dbname: string; endpoint: string; query: string }
  | { mode: "quarry"; url: string };

export interface IngestDeps extends Caps {
  sitematrix: Sitematrix;
  fetch: FetchLike;
  /** Parsed `dbname` attribute; empty means unconstrained. */
  allowlist: string[];
}

/** SPEC §7.4 rule 3 counts, generalized: non-SPARQL modes drop nothing. */
export interface IngestReport {
  ingested: number;
  dropped: number;
}

export interface IngestOutcome {
  selection: Selection;
  report: IngestReport;
}

/**
 * Mode input → a Selection this widget is willing to emit. Ingest order is
 * load, then dbname policy, then caps, then the structural gate — so the
 * user never sees a cap error for a Selection that was never valid, and the
 * host never receives one its own §8 gate would reject.
 */
export async function ingest(
  input: IngestInput,
  deps: IngestDeps,
): Promise<PickerResult<IngestOutcome>> {
  const produced = await produce(input, deps);
  if (!produced.ok) return produced;
  const { selection, report } = produced.value;

  const dbname = checkDbname(selection.dbname, deps.allowlist, deps.sitematrix);
  if (!dbname.ok) return dbname;

  const caps = checkCaps(selection, deps);
  if (!caps.ok) return caps;

  const json = serializeSelectionJson(selection);
  if (!json.ok) return json;
  const structural = validateSelection(json.value, deps.sitematrix);
  if (!structural.ok) return structural;

  return pickerOk({ selection, report });
}

/**
 * Picker-level URL validation. Core reports a malformed URL as
 * UPSTREAM_SHAPE, whose user copy blames the service ("answered in an
 * unexpected format") — but no service was contacted. Catch the obvious
 * cases before any fetch, with copy that blames the input.
 */
function isHttpUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

async function produce(
  input: IngestInput,
  deps: IngestDeps,
): Promise<PickerResult<IngestOutcome>> {
  switch (input.mode) {
    case "manual": {
      if (input.dbname === "") return pickerErr("DBNAME_MISSING", STRINGS.dbnameRequired);
      const normalized = normalizeManualText(input.text);
      if (!normalized.ok) return normalized;
      return pickerOk({
        selection: {
          dbname: input.dbname,
          pages: normalized.value.pages,
          source: { type: "simple" }, // inherently static (SPEC §6.2)
        },
        report: { ingested: normalized.value.pages.length, dropped: 0 },
      });
    }
    case "swiki": {
      const parsed = parseTsv(input.bytes, {
        filename: input.filename,
        sitematrix: deps.sitematrix,
      });
      if (!parsed.ok) return parsed;
      // The file's own dbname (filename or sidecar) is fact; the user's
      // choice only fills the gap SPEC §7.2 says must be filled.
      const chosen =
        input.dbname === undefined || input.dbname === "" ? undefined : input.dbname;
      const dbname = parsed.value.dbname ?? chosen;
      if (dbname === undefined) {
        return pickerErr("DBNAME_MISSING", STRINGS.dbnameFromFileMissing);
      }
      return pickerOk({
        selection: { dbname, pages: parsed.value.pages, source: { type: "swiki" } },
        report: { ingested: parsed.value.pages.length, dropped: 0 },
      });
    }
    case "petscan": {
      if (!isHttpUrl(input.url)) {
        return pickerErr("URL_INVALID", STRINGS.petscanUrlInvalid);
      }
      const fetched = await fetchPetscanSelection(input.url, {
        sitematrix: deps.sitematrix,
        fetch: deps.fetch,
      });
      if (!fetched.ok) return fetched;
      return pickerOk({
        selection: fetched.value,
        report: { ingested: fetched.value.pages.length, dropped: 0 },
      });
    }
    case "sparql": {
      if (input.dbname === "") return pickerErr("DBNAME_MISSING", STRINGS.dbnameRequired);
      const fetched = await fetchSparqlSelection({
        dbname: input.dbname,
        endpoint: input.endpoint,
        query: input.query,
        sitematrix: deps.sitematrix,
        fetch: deps.fetch,
      });
      if (!fetched.ok) return fetched;
      return pickerOk(fetched.value);
    }
    case "quarry": {
      if (!isHttpUrl(input.url) || !/\/query\/\d+/.test(input.url)) {
        return pickerErr("URL_INVALID", STRINGS.quarryUrlInvalid);
      }
      const fetched = await fetchQuarrySelection(input.url, { fetch: deps.fetch });
      if (!fetched.ok) return fetched;
      return pickerOk({
        selection: fetched.value,
        report: { ingested: fetched.value.pages.length, dropped: 0 },
      });
    }
  }
}
