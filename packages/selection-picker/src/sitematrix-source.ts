import { fetchJsonCapped, Sitematrix, type FetchLike } from "@audiodude/selection-core";
import { pickerOk, type PickerResult } from "./result.js";

/**
 * SPEC §4.2's authority for valid dbnames. `origin=*` is REQUIRED: verified
 * 2026-08-29, meta's action API sends no Access-Control-Allow-Origin header
 * without it, and `*` with it.
 */
export const SITEMATRIX_URL =
  "https://meta.wikimedia.org/w/api.php?action=sitematrix&format=json&formatversion=2&origin=*";

/** The live response is ~149 KB across ~1,070 sites; 8 MB is ample tab safety. */
const MAX_SITEMATRIX_BYTES = 8 * 1024 * 1024;

let cache = new Map<string, Promise<PickerResult<Sitematrix>>>();

/**
 * One request per page, shared by every <selection-picker> on it. Failures
 * are evicted so that reopening the dialog retries.
 */
export function loadSitematrix(deps: {
  fetch: FetchLike;
  url?: string;
}): Promise<PickerResult<Sitematrix>> {
  const url = deps.url ?? SITEMATRIX_URL;
  const hit = cache.get(url);
  if (hit !== undefined) return hit;
  const pending = fetchSitematrix(deps.fetch, url).then((result) => {
    if (!result.ok) cache.delete(url);
    return result;
  });
  cache.set(url, pending);
  return pending;
}

/** Test seam: the cache is module-level because the payload is page-wide. */
export function resetSitematrixCache(): void {
  cache = new Map();
}

async function fetchSitematrix(
  fetch: FetchLike,
  url: string,
): Promise<PickerResult<Sitematrix>> {
  const json = await fetchJsonCapped(fetch, url, { maxBytes: MAX_SITEMATRIX_BYTES });
  if (!json.ok) return json;
  const sitematrix = Sitematrix.fromJson(json.value);
  if (!sitematrix.ok) return sitematrix;
  return pickerOk(sitematrix.value);
}
