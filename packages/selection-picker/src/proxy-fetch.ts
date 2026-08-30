import type { FetchLike } from "@audiodude/selection-core";

/**
 * The `proxy` attribute (decision record #3): an escape hatch for hosts that
 * run their own materializer. Nothing defaults to it. The proxy receives the
 * upstream URL in a `url` query parameter and MUST return the upstream
 * response body unchanged.
 */
export function proxyFetch(base: string, inner: FetchLike): FetchLike {
  const joiner = base.includes("?") ? "&" : "?";
  return (url, init) => inner(`${base}${joiner}url=${encodeURIComponent(url)}`, init);
}
