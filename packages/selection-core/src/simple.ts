import { canonicalItem, Deduper, hasForbiddenChar } from "./items.js";
import { dbStyle, percentDecodeLenient } from "./text.js";
import { err, ok, type Result } from "./types.js";
import type { Item } from "./types.js";

const URL_PREFIX = /^https:\/\/[^/]+\/(?:wiki\/|w\/index\.php\?title=)/;

/** SPEC §7.1: normalize manually entered text into title-only items. */
export function normalizeManualText(text: string): Result<{ pages: Item[] }> {
  const dedup = new Deduper();
  const pages: Item[] = [];
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim(); // also strips \r from CRLF input
    if (line === "" || line.startsWith("#")) continue;
    const title = dbStyle(percentDecodeLenient(line.replace(URL_PREFIX, "")));
    if (hasForbiddenChar(title)) {
      return err(
        "FIELD_FORBIDDEN_CHAR",
        `line ${JSON.stringify(line)} normalizes to a title containing tab or newline`,
      );
    }
    if (title === "") continue;
    const item = { title, id: null, ns: 0 };
    if (dedup.add(item)) pages.push(canonicalItem(item));
  }
  return ok({ pages });
}
