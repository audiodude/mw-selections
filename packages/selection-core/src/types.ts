/** Any JSON-serializable value — extras must survive JSON round-tripping. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/**
 * A page entry (SPEC §4.3, §5.2): bare item_title, or a tuple.
 * `id` is null when unknown but namespace_id is present
 * (mirrors the TSV `title\t\tns` case).
 */
export type Item =
  | string
  | [item_title: string, id?: number | null, namespace_id?: number];

/** Provenance descriptor (SPEC §6). The type value space is open. */
export interface Source {
  type: "simple" | "swiki" | "petscan" | "sparql" | "quarry" | (string & {});
  /** For URL-based sources (petscan, quarry). */
  url?: string;
  /** For sparql: the query endpoint, e.g. "https://query.wikidata.org/sparql". */
  endpoint?: string;
  /** For sparql: the query text, verbatim. */
  query?: string;
  /** Re-materialize from the source instead of treating pages as final (SPEC §6.2). */
  dynamic?: boolean;
  [key: string]: JsonValue | undefined;
}

/**
 * SPEC §5.2. The index signature is widened from the spec's
 * `JsonValue | undefined`: the spec's own `pages` and `source` members are
 * not assignable to it under strict TypeScript (TS2411). Same wire shape;
 * candidate spec erratum.
 */
export interface Selection {
  dbname: string;
  pages: Item[];
  source?: Source;
  /** Producers MAY attach additional metadata. */
  [key: string]: JsonValue | Item[] | Source | undefined;
}

/**
 * Machine-readable error codes. The first sixteen are the conformance
 * fixtures' registry (fixtures/README.md) and are load-bearing for the
 * suite; the last four are fetch-layer codes this package adds.
 */
export type ErrorCode =
  | "ENCODING_INVALID"
  | "EMPTY_TITLE"
  | "FIELD_FORBIDDEN_CHAR"
  | "DUPLICATE_ITEM"
  | "TSV_INVALID_ID"
  | "TSV_INVALID_NAMESPACE"
  | "TSV_TOO_MANY_COLUMNS"
  | "SIDECAR_DBNAME_MISSING"
  | "JSON_MALFORMED"
  | "JSON_SHAPE"
  | "ITEM_SHAPE"
  | "DBNAME_MISSING"
  | "DBNAME_INVALID"
  | "SPARQL_NO_VARIABLE"
  | "SPARQL_NO_MATCHING_ROWS"
  | "QUARRY_NO_TITLE_COLUMN"
  // Fetch-layer codes (not part of the fixture registry):
  | "HTTP_ERROR"
  | "PAYLOAD_TOO_LARGE"
  | "UPSTREAM_SHAPE"
  | "QUARRY_RUN_NOT_READY";

export interface SelectionError {
  code: ErrorCode;
  /** Human-readable diagnostics; never asserted by fixtures. */
  message: string;
}

/** Domain errors are values, never exceptions. */
export type Result<T> = { ok: true; value: T } | { ok: false; error: SelectionError };

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function err(code: ErrorCode, message: string): { ok: false; error: SelectionError } {
  return { ok: false, error: { code, message } };
}
