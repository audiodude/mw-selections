import type { PickerError } from "./result.js";

const num = new Intl.NumberFormat("en-US");

/** Every user-facing string in the package. English-only v1. */
export const STRINGS = {
  dialogTitle: "Create a selection",
  modeLabels: {
    manual: "Paste titles",
    swiki: "Upload .swiki",
    petscan: "PetScan",
    sparql: "SPARQL",
    quarry: "Quarry",
  },
  manualLabel: "One title or wiki URL per line. Lines beginning with # are ignored.",
  swikiLabel: "A .swiki or TSV file: item_title, optional id, optional namespace_id.",
  petscanLabel: "PetScan query URL",
  sparqlEndpointLabel: "SPARQL endpoint",
  sparqlQueryLabel: "SPARQL query",
  quarryLabel: "Quarry query URL",
  projectLabel: "Wikimedia project",
  projectPlaceholder: "en.wikipedia.org",
  noFile: "No file selected",
  load: "Load",
  loading: "Loading…",
  confirm: "Use selection",
  cancel: "Cancel",
  noFileChosen: "Choose a .swiki or TSV file first.",
  dbnameRequired: "Choose a Wikimedia project first.",
  dbnameUnknown: (value: string) => `${value} is not a known Wikimedia project.`,
  dbnameFromFileMissing:
    "This file does not name a project. Choose the Wikimedia project its titles belong to.",
  dbnameNotAllowed: (found: string, allowed: string) =>
    `Your URL names ${found}, but this page is only configured to accept ${allowed}.`,
  ingestSummary: (ingested: number, dropped: number, domain: string) => {
    const items = `${num.format(ingested)} ${ingested === 1 ? "item" : "items"}`;
    if (dropped === 0) return `Ingested ${items} from ${domain}.`;
    const rows = `${num.format(dropped)} ${dropped === 1 ? "row" : "rows"}`;
    return `Ingested ${items}, dropped ${rows} not on ${domain}.`;
  },
  maxBytesExceeded: (actual: number, max: number) =>
    `This selection is ${num.format(actual)} bytes; this page accepts at most ${num.format(max)}.`,
  maxItemsExceeded: (actual: number, max: number) =>
    `This selection has ${num.format(actual)} items; this page accepts at most ${num.format(max)}.`,
  sitematrixUnavailable:
    "Could not load the list of Wikimedia projects. Check your connection and reopen this dialog.",
  petscanUrlInvalid:
    "That doesn't look like a PetScan query URL. Paste the URL of a PetScan query page.",
  quarryUrlInvalid:
    "That doesn't look like a Quarry query URL (https://quarry.wmcloud.org/query/<id>).",
  seedOmitted: (omitted: number) =>
    omitted === 1
      ? "1 page outside the main namespace was omitted; title lines can only express main-namespace pages."
      : `${num.format(omitted)} pages outside the main namespace were omitted; title lines can only express main-namespace pages.`,
} as const;

/**
 * Copy for an error the user must act on. Codes whose message this package
 * already wrote (policy codes) or whose core message is itself an
 * instruction (Quarry aliasing) pass through verbatim; anything unhandled
 * degrades to the code so a bug report can name it.
 */
export function userMessage(error: PickerError): string {
  switch (error.code) {
    case "DBNAME_NOT_ALLOWED":
    case "MAX_BYTES_EXCEEDED":
    case "MAX_ITEMS_EXCEEDED":
    case "DBNAME_MISSING":
    case "DBNAME_INVALID":
    case "QUARRY_NO_TITLE_COLUMN":
    case "URL_INVALID":
      return error.message;
    case "ENCODING_INVALID":
      return "That file is not valid UTF-8 text.";
    case "FIELD_FORBIDDEN_CHAR":
      return "Some titles contain tab or newline characters, which selections cannot represent.";
    case "EMPTY_TITLE":
    case "TSV_INVALID_ID":
    case "TSV_INVALID_NAMESPACE":
    case "TSV_TOO_MANY_COLUMNS":
      return `That file is not a valid .swiki: ${error.message}`;
    case "SIDECAR_DBNAME_MISSING":
      return "The accompanying JSON file has no dbname property.";
    case "SPARQL_NO_VARIABLE":
      return "No result column contains pages on the project you chose.";
    case "SPARQL_NO_MATCHING_ROWS":
      return "No result row was a page URL on the project you chose.";
    case "HTTP_ERROR":
      return "Could not reach that service. Check the URL and try again.";
    case "PAYLOAD_TOO_LARGE":
      return "That result is too large to load in a browser tab.";
    case "UPSTREAM_SHAPE":
      return "That service answered in an unexpected format.";
    case "QUARRY_RUN_NOT_READY":
      return "That Quarry query has no completed run yet.";
    default:
      // DUPLICATE_ITEM, JSON_MALFORMED, and ITEM_SHAPE land here. They are
      // unreachable from widget input today — every core producer dedupes,
      // and the widget serializes its own JSON before validating — so they
      // keep the generic copy. If a future source stops deduping, give
      // DUPLICATE_ITEM real copy.
      return `Could not load that selection (${error.code}).`;
  }
}
