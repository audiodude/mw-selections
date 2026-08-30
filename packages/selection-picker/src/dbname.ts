import type { Sitematrix } from "@audiodude/selection-core";
import { pickerErr, pickerOk, type PickerResult } from "./result.js";
import { STRINGS } from "./strings.js";

/** `dbname="enwiki, dewiki"` → ["enwiki", "dewiki"]; absent or empty → []. */
export function parseAllowlist(attr: string | null | undefined): string[] {
  if (attr === null || attr === undefined) return [];
  return attr
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
}

/**
 * Conflicts are rendered as domains, never dbnames (decision record #7).
 * Unknown dbnames render as themselves rather than disappearing.
 */
export function renderDomains(dbnames: string[], sitematrix: Sitematrix): string {
  const domains = dbnames.map((dbname) => sitematrix.domainFor(dbname) ?? dbname);
  if (domains.length <= 1) return domains[0] ?? "";
  return `${domains.slice(0, -1).join(", ")} or ${domains[domains.length - 1]!}`;
}

/**
 * The dbname to ingest with, for the modes where it is user input (manual,
 * swiki, sparql). A single-entry allowlist fixes it outright; otherwise the
 * project field's value is resolved as a domain, falling back to treating it
 * as a dbname (so open(seed) can prefill a raw dbname). "" means "not chosen".
 */
export function resolveDbname(input: string, allowlist: string[], sitematrix: Sitematrix): string {
  if (allowlist.length === 1) return allowlist[0]!;
  const trimmed = input.trim();
  if (trimmed === "") return "";
  return sitematrix.dbnameForDomain(trimmed) ?? trimmed;
}

/**
 * A Selection's dbname is fact; the host's attribute is a constraint
 * (decision record #7). Both are enforced here, after ingestion, for every
 * mode — including the ones where the dbname came from upstream.
 */
export function checkDbname(
  dbname: string,
  allowlist: string[],
  sitematrix: Sitematrix,
): PickerResult<void> {
  if (!sitematrix.isValidDbname(dbname)) {
    return pickerErr("DBNAME_INVALID", STRINGS.dbnameUnknown(dbname));
  }
  if (allowlist.length > 0 && !allowlist.includes(dbname)) {
    return pickerErr(
      "DBNAME_NOT_ALLOWED",
      STRINGS.dbnameNotAllowed(
        sitematrix.domainFor(dbname) ?? dbname,
        renderDomains(allowlist, sitematrix),
      ),
    );
  }
  return pickerOk(undefined);
}
