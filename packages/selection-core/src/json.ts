import { canonicalItem, hasForbiddenChar, itemKey, type ParsedItem } from "./items.js";
import { err, ok, type Result } from "./types.js";
import type { Item, Selection } from "./types.js";

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isNonNegativeInteger(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0;
}

/** Parse one pages entry into the internal form. */
function parseItem(entry: unknown, index: number): Result<ParsedItem> {
  const at = `pages[${index}]`;
  if (typeof entry === "string") {
    if (entry === "") return err("EMPTY_TITLE", `${at} is an empty title`);
    if (hasForbiddenChar(entry)) return err("FIELD_FORBIDDEN_CHAR", `${at} contains tab or newline`);
    return ok({ title: entry, id: null, ns: 0 });
  }
  if (!Array.isArray(entry) || entry.length < 1 || entry.length > 3) {
    return err("ITEM_SHAPE", `${at} is not a string or a 1-3 element tuple`);
  }
  const title = entry[0];
  if (typeof title !== "string") return err("ITEM_SHAPE", `${at} title is not a string`);
  if (title === "") return err("EMPTY_TITLE", `${at} is an empty title`);
  if (hasForbiddenChar(title)) return err("FIELD_FORBIDDEN_CHAR", `${at} contains tab or newline`);

  const rawId: unknown = entry.length >= 2 ? entry[1] : null;
  let id: number | null;
  if (rawId === null) id = null;
  else if (isNonNegativeInteger(rawId)) id = rawId;
  else return err("ITEM_SHAPE", `${at} id is not null or a non-negative integer`);

  const rawNs: unknown = entry.length >= 3 ? entry[2] : 0;
  if (!isNonNegativeInteger(rawNs)) {
    return err("ITEM_SHAPE", `${at} namespace_id is not a non-negative integer`);
  }
  return ok({ title, id, ns: rawNs });
}

/** Parse and canonicalize a pages list; boundary semantics: duplicates reject, never repair (pin #1). */
function canonicalizePages(entries: unknown[]): Result<Item[]> {
  const seen = new Set<string>();
  const pages: Item[] = [];
  for (let i = 0; i < entries.length; i++) {
    const parsed = parseItem(entries[i], i);
    if (!parsed.ok) return parsed;
    const key = itemKey(parsed.value.title, parsed.value.ns);
    if (seen.has(key)) {
      return err("DUPLICATE_ITEM", `pages[${i}] duplicates (${parsed.value.title}, ${parsed.value.ns})`);
    }
    seen.add(key);
    pages.push(canonicalItem(parsed.value));
  }
  return ok(pages);
}

/**
 * Boundary parse (SPEC §5.2): pages in canonical item form, duplicates
 * rejected (never repaired, pin #1), all other top-level members and
 * `source` preserved verbatim. dbname must be present and a string; its
 * sitematrix validity is checked only by validateSelection.
 */
export function parseSelectionJson(bytes: Uint8Array | string): Result<Selection> {
  let text: string;
  if (typeof bytes === "string") {
    text = bytes;
  } else {
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      return err("JSON_MALFORMED", "input is not valid UTF-8");
    }
  }
  let doc: unknown;
  try {
    doc = JSON.parse(text) as unknown;
  } catch {
    return err("JSON_MALFORMED", "input is not well-formed JSON");
  }
  if (!isPlainObject(doc)) return err("JSON_SHAPE", "top level is not a single object");
  if (!Array.isArray(doc["pages"])) return err("JSON_SHAPE", "no pages list");
  if (!("dbname" in doc)) return err("DBNAME_MISSING", "no dbname");
  if (typeof doc["dbname"] !== "string") return err("JSON_SHAPE", "dbname is not a string");

  const pages = canonicalizePages(doc["pages"] as unknown[]);
  if (!pages.ok) return pages;
  return ok({ ...(doc as Selection), pages: pages.value });
}

/**
 * The JSON serializer (SPEC §5.2): canonical JSON text. Pages are emitted in
 * canonical item form (never `[title, null]` or explicit trailing defaults
 * like `[title, id, 0]`); malformed items, forbidden characters, and
 * duplicates reject with the same codes as parseSelectionJson (boundary
 * semantics, never repaired). Every other top-level member and `source`
 * serialize verbatim, so parseSelectionJson(serializeSelectionJson(s).value)
 * round-trips.
 */
export function serializeSelectionJson(selection: Selection): Result<string> {
  const pages = canonicalizePages(selection.pages);
  if (!pages.ok) return pages;
  return ok(JSON.stringify({ ...selection, pages: pages.value }));
}

/**
 * UTF-8 byte length of the canonical JSON serialization — the quantity the
 * picker's max-bytes attribute and WP1's 25 MB gate measure (decision
 * record #9). Canonicalize with parseSelectionJson first if the input may
 * hold non-canonical items.
 */
export function selectionJsonBytes(selection: Selection): number {
  return new TextEncoder().encode(JSON.stringify(selection)).length;
}
