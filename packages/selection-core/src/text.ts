const PCT_RUN = /(?:%[0-9A-Fa-f]{2})+/g;

/**
 * Percent-decode, never failing (fixture pin #6): each maximal run of valid
 * %XX escapes is decoded as UTF-8; runs decoding to invalid UTF-8, and bare
 * `%` characters, pass through verbatim.
 */
export function percentDecodeLenient(s: string): string {
  return s.replace(PCT_RUN, (run) => {
    const bytes = new Uint8Array(run.length / 3);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(run.slice(i * 3 + 1, i * 3 + 3), 16);
    }
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      return run;
    }
  });
}

/** db_style: spaces → underscores (SPEC §7.1 step 5, §7.4 rule 5). */
export function dbStyle(s: string): string {
  return s.replaceAll(" ", "_");
}
