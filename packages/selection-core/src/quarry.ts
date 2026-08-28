import { canonicalItem, Deduper } from "./items.js";
import { err, ok, type Result } from "./types.js";
import type { Selection } from "./types.js";

export interface MapQuarryOptions {
  /** The user's Quarry URL, copied verbatim into source.url. */
  url: string;
  /**
   * The run's target database as reported by Quarry's run metadata
   * (query_database); a trailing _p replica suffix is stripped (pin #8).
   */
  database: string;
}

/** SPEC §7.5: map a Quarry output-JSON document (headers + rows). */
export function mapQuarry(response: unknown, opts: MapQuarryOptions): Result<Selection> {
  const root = response as { headers?: unknown; rows?: unknown } | null;
  const headers = root?.headers;
  const rows = root?.rows;
  if (
    !Array.isArray(headers) ||
    !headers.every((h): h is string => typeof h === "string") ||
    !Array.isArray(rows)
  ) {
    return err("UPSTREAM_SHAPE", "not a Quarry output document");
  }

  let titleCol = headers.indexOf("page_title");
  let idCol = -1;
  let nsCol = -1;
  if (titleCol !== -1) {
    idCol = headers.indexOf("page_id");
    nsCol = headers.indexOf("page_namespace");
  } else if (headers.length === 1) {
    titleCol = 0; // §7.5 rule 2: a single column of any name is a list of titles
  } else {
    return err(
      "QUARRY_NO_TITLE_COLUMN",
      "no page_title column; alias one in your query: SELECT ... AS page_title",
    );
  }

  const dedup = new Deduper();
  const pages: Selection["pages"] = [];
  for (const rawRow of rows as unknown[]) {
    const row = Array.isArray(rawRow) ? (rawRow as unknown[]) : [];
    const title = row[titleCol];
    if (typeof title !== "string") return err("UPSTREAM_SHAPE", "page_title cell is not a string");
    const rawId = idCol !== -1 ? row[idCol] : null;
    const rawNs = nsCol !== -1 ? row[nsCol] : 0;
    const item = {
      title,
      id: typeof rawId === "number" ? rawId : null,
      ns: typeof rawNs === "number" ? rawNs : 0,
    };
    if (dedup.add(item)) pages.push(canonicalItem(item));
  }

  return ok({
    dbname: opts.database.replace(/_p$/, ""),
    pages,
    source: { type: "quarry", url: opts.url, dynamic: true },
  });
}
