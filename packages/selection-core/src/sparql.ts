import { defaultFetch, fetchJsonCapped, type FetchDeps } from "./http.js";
import { canonicalItem, Deduper, hasForbiddenChar } from "./items.js";
import type { Sitematrix } from "./sitematrix.js";
import { dbStyle, percentDecodeLenient } from "./text.js";
import { err, ok, type Result } from "./types.js";
import type { Selection } from "./types.js";

export interface MapSparqlOptions {
  /** REQUIRED user input alongside the query (SPEC §7.4 rule 1). */
  dbname: string;
  /** Copied verbatim into source.endpoint. */
  endpoint: string;
  /** Copied verbatim into source.query. */
  query: string;
  sitematrix: Sitematrix;
}

/** §7.4 rule 3 counts: ingested = unique items; dropped = domain-non-matching rows only. */
export interface SparqlReport {
  ingested: number;
  dropped: number;
}

interface SparqlBinding {
  value?: unknown;
}
type SparqlRow = Record<string, SparqlBinding | undefined>;

/** SPEC §7.4: map an application/sparql-results+json document. Title-only items. */
export function mapSparql(
  response: unknown,
  opts: MapSparqlOptions,
): Result<{ selection: Selection; report: SparqlReport }> {
  const domain = opts.sitematrix.domainFor(opts.dbname);
  if (domain === undefined) {
    return err("DBNAME_INVALID", `dbname ${JSON.stringify(opts.dbname)} is not in the sitematrix`);
  }

  const root = response as {
    head?: { vars?: unknown };
    results?: { bindings?: unknown };
  } | null;
  const vars = root?.head?.vars;
  const bindings = root?.results?.bindings;
  if (
    !Array.isArray(vars) ||
    !vars.every((v): v is string => typeof v === "string") ||
    !Array.isArray(bindings)
  ) {
    return err("UPSTREAM_SHAPE", "not a sparql-results+json document");
  }
  const rows = bindings as SparqlRow[];

  const variable = selectVariable(vars, rows, domain);
  if (variable === undefined) {
    return err("SPARQL_NO_VARIABLE", "no projected variable identifies the target project");
  }

  const prefixes = [`https://${domain}/wiki/`, `https://${domain}/w/index.php?title=`];
  const dedup = new Deduper();
  const pages: Selection["pages"] = [];
  let dropped = 0;
  for (const row of rows) {
    const value = row[variable]?.value;
    const prefix =
      typeof value === "string" ? prefixes.find((p) => value.startsWith(p)) : undefined;
    const remainder = prefix === undefined ? "" : (value as string).slice(prefix.length);
    if (remainder === "") {
      dropped++; // §7.4 rule 3: non-matching rows MUST be dropped and counted
      continue;
    }
    const title = dbStyle(percentDecodeLenient(remainder));
    if (hasForbiddenChar(title)) {
      dropped++; // unusable as an item field (§4.3); treated as non-conforming
      continue;
    }
    const item = { title, id: null, ns: 0 };
    if (dedup.add(item)) pages.push(canonicalItem(item)); // dup keys collapse silently (pin #1)
  }
  if (pages.length === 0) return err("SPARQL_NO_MATCHING_ROWS", "zero conforming rows");

  return ok({
    selection: {
      dbname: opts.dbname,
      pages,
      source: { type: "sparql", endpoint: opts.endpoint, query: opts.query, dynamic: true },
    },
    report: { ingested: pages.length, dropped },
  });
}

/**
 * SPEC §7.4 rule 2 (v1.0.0): ?url, then ?article, else scan result rows in
 * order; within a row, examine variables in SELECT projection order
 * (head.vars order); a variable is identified if the row's binding contains
 * the project domain as a substring. Rows identifying no variable are
 * skipped during selection.
 */
function selectVariable(vars: string[], rows: SparqlRow[], domain: string): string | undefined {
  if (vars.includes("url")) return "url";
  if (vars.includes("article")) return "article";
  for (const row of rows) {
    for (const v of vars) {
      const value = row[v]?.value;
      if (typeof value === "string" && value.includes(domain)) return v;
    }
  }
  return undefined;
}

const WDQS_HOSTS = new Set(["query.wikidata.org"]);

export const API_USER_AGENT =
  "selection-core/0.1 (https://github.com/audiodude/mw-selections)";

/**
 * Run a SPARQL query (GET, format=json) and map the results (SPEC §7.4).
 * Api-User-Agent is sent to WDQS only — it is CORS-allowlisted there and
 * unverified elsewhere (decision record #3).
 */
export async function fetchSparqlSelection(
  opts: { dbname: string; endpoint: string; query: string; sitematrix: Sitematrix } & FetchDeps,
): Promise<Result<{ selection: Selection; report: SparqlReport }>> {
  let url: URL;
  try {
    url = new URL(opts.endpoint);
  } catch {
    return err("UPSTREAM_SHAPE", `not a URL: ${opts.endpoint}`);
  }
  const headers: Record<string, string> = { Accept: "application/sparql-results+json" };
  if (WDQS_HOSTS.has(url.host)) headers["Api-User-Agent"] = API_USER_AGENT;
  // searchParams, not string concatenation: an endpoint already carrying a
  // query string (e.g. ...?key=abc) must stay valid.
  url.searchParams.set("format", "json");
  url.searchParams.set("query", opts.query);
  const json = await fetchJsonCapped(opts.fetch ?? defaultFetch(), url.toString(), { headers });
  if (!json.ok) return json;
  return mapSparql(json.value, opts);
}
