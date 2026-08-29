import type { Item } from "./types.js";

/** Internal working form of one item, before canonicalization. */
export interface ParsedItem {
  title: string;
  id: number | null;
  ns: number;
}

/** SPEC §4.3: item fields MUST NOT contain tab or newline. */
export function hasForbiddenChar(field: string): boolean {
  return field.includes("\t") || field.includes("\n");
}

/** SPEC §4.4 uniqueness key: (item_title, namespace_id), absent ns ≡ 0. */
export function itemKey(title: string, ns: number): string {
  return `${ns}:${title}`;
}

/**
 * Canonical item form (fixtures/README.md): title-only → bare string;
 * [title, id]; [title, id, ns > 0]; [title, null, ns > 0]. Never 1-tuples,
 * [title, null], or explicit trailing defaults like [title, id, 0].
 */
export function canonicalItem(it: ParsedItem): Item {
  if (it.ns === 0) return it.id === null ? it.title : [it.title, it.id];
  return [it.title, it.id, it.ns];
}

/** First-occurrence-wins de-duplication (ingestion operations, fixture pin #1). */
export class Deduper {
  private seen = new Set<string>();

  /** Returns true if the item is new (keep it), false if a duplicate (drop it). */
  add(it: ParsedItem): boolean {
    const key = itemKey(it.title, it.ns);
    if (this.seen.has(key)) return false;
    this.seen.add(key);
    return true;
  }
}
