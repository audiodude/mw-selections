import { canonicalItem, Deduper, hasForbiddenChar, type ParsedItem } from "./items.js";
import type { Sitematrix } from "./sitematrix.js";
import { err, ok, type Result } from "./types.js";
import type { Item, JsonValue, Selection } from "./types.js";

const DECIMAL = /^[0-9]+$/;

export interface ParseTsvOptions {
  /** Logical name of the uploaded file, e.g. "my-selection.enwiki.tsv". */
  filename?: string;
  /** Parsed contents of an accompanying sidecar JSON, when one was provided. */
  sidecar?: JsonValue;
  sitematrix: Sitematrix;
}

/** Parse .swiki/TSV bytes (SPEC §5.1, §7.2). Ingestion: duplicates collapse, first wins. */
export function parseTsv(
  bytes: Uint8Array,
  opts: ParseTsvOptions,
): Result<{ dbname?: string; pages: Item[] }> {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return err("ENCODING_INVALID", "input is not valid UTF-8");
  }

  const lines = text.split("\n");
  if (lines[lines.length - 1] === "") lines.pop(); // final newline optional; empty file → no rows

  const dedup = new Deduper();
  const pages: Item[] = [];
  for (let i = 0; i < lines.length; i++) {
    const cols = lines[i]!.split("\t");
    if (cols.length > 3) {
      return err("TSV_TOO_MANY_COLUMNS", `row ${i + 1} has ${cols.length} columns`);
    }
    const title = cols[0]!;
    if (title === "") return err("EMPTY_TITLE", `row ${i + 1} has an empty item_title`);
    let id: number | null = null;
    if (cols.length >= 2 && cols[1] !== "") {
      if (!DECIMAL.test(cols[1]!)) {
        return err("TSV_INVALID_ID", `row ${i + 1}: ${JSON.stringify(cols[1])} is not a non-negative integer`);
      }
      id = Number(cols[1]);
    }
    let ns = 0;
    if (cols.length === 3 && cols[2] !== "") {
      if (!DECIMAL.test(cols[2]!)) {
        return err("TSV_INVALID_NAMESPACE", `row ${i + 1}: ${JSON.stringify(cols[2])} is not a non-negative integer`);
      }
      ns = Number(cols[2]);
    }
    const item: ParsedItem = { title, id, ns };
    if (dedup.add(item)) pages.push(canonicalItem(item));
  }

  const dbname = resolveDbname(opts);
  if (!dbname.ok) return dbname;
  return ok(dbname.value === undefined ? { pages } : { dbname: dbname.value, pages });
}

/**
 * dbname side channel (SPEC §5.1, fixture pin #5): an explicit sidecar beats
 * the filename; a sidecar without dbname is an error; the filename's
 * penultimate dot-segment counts only when it is a known dbname; otherwise
 * no dbname is resolved (SPEC §7.2 then requires the ingesting UI to prompt).
 */
function resolveDbname(opts: ParseTsvOptions): Result<string | undefined> {
  if (opts.sidecar !== undefined) {
    const dbname = (opts.sidecar as { dbname?: unknown } | null)?.dbname;
    if (typeof dbname !== "string") {
      return err("SIDECAR_DBNAME_MISSING", "sidecar JSON has no dbname");
    }
    return ok(dbname);
  }
  if (opts.filename !== undefined) {
    const segments = opts.filename.split(".");
    const candidate = segments.length >= 2 ? segments[segments.length - 2]! : undefined;
    if (candidate !== undefined && opts.sitematrix.isValidDbname(candidate)) {
      return ok(candidate);
    }
  }
  return ok(undefined);
}

/** Serialize to canonical TSV bytes (SPEC §5.1; fixtures/README.md "Canonical TSV form"). */
export function serializeTsv(selection: Pick<Selection, "pages">): Result<Uint8Array> {
  let out = "";
  for (const item of selection.pages) {
    let title: string;
    let id: number | null;
    let ns: number;
    if (typeof item === "string") {
      title = item;
      id = null;
      ns = 0;
    } else {
      title = item[0];
      id = item[1] ?? null;
      ns = item[2] ?? 0;
    }
    if (hasForbiddenChar(title)) {
      return err("FIELD_FORBIDDEN_CHAR", `title ${JSON.stringify(title)} contains tab or newline`);
    }
    if (ns !== 0) out += id === null ? `${title}\t\t${ns}\n` : `${title}\t${id}\t${ns}\n`;
    else out += id === null ? `${title}\n` : `${title}\t${id}\n`;
  }
  return ok(new TextEncoder().encode(out));
}
