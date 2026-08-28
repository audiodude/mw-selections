import { err, ok, type Result } from "./types.js";

interface SiteEntry {
  dbname: string;
  domain: string;
}

/**
 * Wrapper over a meta.wikimedia.org sitematrix response (SPEC §4.2).
 * Used for every dbname-validity check and dbname ↔ domain derivation.
 * Callers load the JSON themselves (the picker fetches it; tests use the
 * shared fixture capture).
 */
export class Sitematrix {
  private byDbname = new Map<string, SiteEntry>();
  private byDomain = new Map<string, SiteEntry>();

  static fromJson(json: unknown): Result<Sitematrix> {
    const root = (json as { sitematrix?: Record<string, unknown> } | null)?.sitematrix;
    if (typeof root !== "object" || root === null) {
      return err("UPSTREAM_SHAPE", "not a sitematrix response");
    }
    const sm = new Sitematrix();
    for (const [key, section] of Object.entries(root)) {
      if (key === "count") continue;
      const sites = Array.isArray(section)
        ? section
        : (section as { site?: unknown[] } | null)?.site;
      if (!Array.isArray(sites)) continue;
      for (const site of sites) {
        const { dbname, url } = site as { dbname?: unknown; url?: unknown };
        if (typeof dbname !== "string" || typeof url !== "string") continue;
        const entry = { dbname, domain: url.replace(/^https?:\/\//, "") };
        sm.byDbname.set(dbname, entry);
        sm.byDomain.set(entry.domain, entry);
      }
    }
    if (sm.byDbname.size === 0) return err("UPSTREAM_SHAPE", "sitematrix has no sites");
    return ok(sm);
  }

  isValidDbname(dbname: string): boolean {
    return this.byDbname.has(dbname);
  }

  /** "enwiki" → "en.wikipedia.org" */
  domainFor(dbname: string): string | undefined {
    return this.byDbname.get(dbname)?.domain;
  }

  /** "en.wikipedia.org" → "enwiki" */
  dbnameForDomain(domain: string): string | undefined {
    return this.byDomain.get(domain)?.dbname;
  }
}
