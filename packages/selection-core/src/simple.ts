import { canonicalItem, Deduper, hasForbiddenChar } from "./items.js";
import { dbStyle, percentDecodeLenient } from "./text.js";
import { err, ok, type Result } from "./types.js";
import type { Item } from "./types.js";

const URL_PREFIX = /^https:\/\/[^/]+\/(?:wiki\/|w\/index\.php\?title=)/;
const TITLE_FORBIDDEN_CHAR = /[#<>\[\]{}|]/;
const encoder = new TextEncoder();

/** SPEC §7.1: normalize manually entered text into title-only items. */
export function normalizeManualText(text: string): Result<{ pages: Item[] }> {
  const dedup = new Deduper();
  const pages: Item[] = [];
  const titleBytes = new Uint8Array(256);
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim(); // also strips \r from CRLF input
    if (line === "" || line.startsWith("#")) continue;
    const decoded = percentDecodeLenient(line);
    if (TITLE_FORBIDDEN_CHAR.test(decoded)) {
      return err("TITLE_FORBIDDEN_CHAR", "Manual titles cannot contain # < > [ ] { } |.");
    }
    if (encoder.encodeInto(decoded, titleBytes).read !== decoded.length) {
      return err("TITLE_TOO_LONG", "Each decoded manual entry must be at most 256 UTF-8 bytes, including any URL prefix.");
    }
    const title = dbStyle(decoded.replace(URL_PREFIX, ""));
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
