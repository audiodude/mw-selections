import { defaultFetch, fetchJsonCapped, type FetchDeps } from "./http.js";
import { canonicalItem, Deduper } from "./items.js";
import type { Sitematrix } from "./sitematrix.js";
import { err, ok, type Result } from "./types.js";
import type { Selection } from "./types.js";

export interface MapPetscanOptions {
  /** The user's PetScan URL, copied verbatim into source.url. */
  url: string;
  sitematrix: Sitematrix;
}

interface PetscanPage {
  title?: unknown;
  id?: unknown;
  namespace?: unknown;
}

/**
 * SPEC §7.3: map a PetScan JSON response (catscan output compatibility).
 * item_title, id, and namespace_id come from PetScan's per-page fields,
 * titles verbatim (fixture pin #7). The dbname derives from the target wiki
 * PetScan reports in its echoed query — never from user input.
 */
export function mapPetscan(response: unknown, opts: MapPetscanOptions): Result<Selection> {
  const root = response as {
    "*"?: Array<{ a?: { "*"?: unknown } }>;
    a?: { query?: unknown };
  } | null;
  const pagesIn = root?.["*"]?.[0]?.a?.["*"];
  if (!Array.isArray(pagesIn)) return err("UPSTREAM_SHAPE", "no page list in PetScan response");
  const echoed = root?.a?.query;
  if (typeof echoed !== "string") return err("UPSTREAM_SHAPE", "no echoed query in PetScan response");

  const dbname = dbnameFromEchoedQuery(echoed, opts.sitematrix);
  if (!dbname.ok) return dbname;

  const dedup = new Deduper();
  const pages: Selection["pages"] = [];
  for (const page of pagesIn as PetscanPage[]) {
    const { title, id, namespace } = page;
    if (typeof title !== "string" || typeof id !== "number") {
      return err("UPSTREAM_SHAPE", "PetScan page entry lacks title/id");
    }
    const item = { title, id, ns: typeof namespace === "number" ? namespace : 0 };
    if (dedup.add(item)) pages.push(canonicalItem(item));
  }

  return ok({
    dbname: dbname.value,
    pages,
    source: { type: "petscan", url: opts.url, dynamic: true },
  });
}

/**
 * fixtures/README.md petscan: "the echoed query's language/project — via the
 * sitematrix — or manual_list_wiki". URLSearchParams percent-decodes the
 * param names PetScan echoes as manual%5Flist%5Fwiki etc.
 */
function dbnameFromEchoedQuery(query: string, sitematrix: Sitematrix): Result<string> {
  let params: URLSearchParams;
  try {
    params = new URL(query).searchParams;
  } catch {
    return err("UPSTREAM_SHAPE", "PetScan echoed query is not a URL");
  }
  const language = params.get("language");
  const project = params.get("project");
  if (language !== null && project !== null) {
    const dbname = sitematrix.dbnameForDomain(`${language}.${project}.org`);
    if (dbname !== undefined) return ok(dbname);
  }
  const manualListWiki = params.get("manual_list_wiki");
  if (manualListWiki !== null) return ok(manualListWiki);
  return err("UPSTREAM_SHAPE", "cannot derive dbname from PetScan response");
}

/**
 * Fetch a PetScan query's JSON output and map it (SPEC §7.3). The fetch URL
 * forces format=json, catscan output compatibility (the shape mapPetscan
 * reads), and doit=1; source.url keeps the user's URL verbatim.
 */
export async function fetchPetscanSelection(
  url: string,
  opts: { sitematrix: Sitematrix } & FetchDeps,
): Promise<Result<Selection>> {
  let fetchUrl: URL;
  try {
    fetchUrl = new URL(url);
  } catch {
    return err("UPSTREAM_SHAPE", `not a URL: ${url}`);
  }
  fetchUrl.searchParams.set("format", "json");
  fetchUrl.searchParams.set("output_compatability", "catscan");
  fetchUrl.searchParams.set("doit", "1");
  const json = await fetchJsonCapped(opts.fetch ?? defaultFetch(), fetchUrl.toString());
  if (!json.ok) return json;
  return mapPetscan(json.value, { url, sitematrix: opts.sitematrix });
}
