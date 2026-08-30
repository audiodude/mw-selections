import { expect, test } from "vitest";
import type { Selection } from "@audiodude/selection-core";
import { checkCaps } from "../src/caps.js";
import { checkDbname, parseAllowlist, renderDomains, resolveDbname } from "../src/dbname.js";
import { userMessage } from "../src/strings.js";
import { fixtureSitematrix } from "./helpers.js";

const sm = fixtureSitematrix();

test("parses the dbname attribute as a comma-separated allowlist", () => {
  expect(parseAllowlist("enwiki, dewiki ,")).toEqual(["enwiki", "dewiki"]);
  expect(parseAllowlist("")).toEqual([]);
  expect(parseAllowlist(null)).toEqual([]);
  expect(parseAllowlist(undefined)).toEqual([]);
});

test("renders allowlists as domains, in English, for user-facing copy", () => {
  expect(renderDomains(["enwiki"], sm)).toBe("en.wikipedia.org");
  expect(renderDomains(["enwiki", "dewiki"], sm)).toBe("en.wikipedia.org or de.wikipedia.org");
  expect(renderDomains(["enwiki", "dewiki", "metawiki"], sm)).toBe(
    "en.wikipedia.org, de.wikipedia.org or meta.wikimedia.org",
  );
  expect(renderDomains(["zzwiki"], sm)).toBe("zzwiki"); // unknown renders as itself
});

test("resolves the user's project input to a dbname", () => {
  // A single-entry allowlist fixes the dbname; no user input is consulted.
  expect(resolveDbname("", ["enwiki"], sm)).toBe("enwiki");
  expect(resolveDbname("de.wikipedia.org", ["enwiki"], sm)).toBe("enwiki");
  // Otherwise: a domain resolves via the sitematrix; a dbname passes through.
  expect(resolveDbname(" en.wikipedia.org ", [], sm)).toBe("enwiki");
  expect(resolveDbname("enwiki", [], sm)).toBe("enwiki");
  expect(resolveDbname("", [], sm)).toBe("");
});

test("a source-derived dbname outside the allowlist is a hard error, phrased as domains", () => {
  const ok = checkDbname("enwiki", ["enwiki", "dewiki"], sm);
  expect(ok.ok).toBe(true);

  const conflict = checkDbname("dewiki", ["enwiki"], sm);
  expect(conflict.ok).toBe(false);
  if (!conflict.ok) {
    expect(conflict.error.code).toBe("DBNAME_NOT_ALLOWED");
    expect(conflict.error.message).toBe(
      "Your URL names de.wikipedia.org, but this page is only configured to accept en.wikipedia.org.",
    );
  }

  const unknown = checkDbname("zzwiki", [], sm);
  expect(unknown.ok).toBe(false);
  if (!unknown.ok) expect(unknown.error.code).toBe("DBNAME_INVALID");
});

test("caps reject and report the actual size; they never truncate", () => {
  const selection: Selection = { dbname: "enwiki", pages: ["Paris", "Berlin"] };

  expect(checkCaps(selection, {}).ok).toBe(true);
  expect(checkCaps(selection, { maxItems: 2 }).ok).toBe(true);

  const items = checkCaps(selection, { maxItems: 1 });
  expect(items.ok).toBe(false);
  if (!items.ok) {
    expect(items.error.code).toBe("MAX_ITEMS_EXCEEDED");
    expect(items.error.message).toBe(
      "This selection has 2 items; this page accepts at most 1.",
    );
  }

  const bytes = checkCaps(selection, { maxBytes: 10 });
  expect(bytes.ok).toBe(false);
  if (!bytes.ok) {
    expect(bytes.error.code).toBe("MAX_BYTES_EXCEEDED");
    // 46 = Buffer.byteLength('{"dbname":"enwiki","pages":["Paris","Berlin"]}')
    expect(bytes.error.message).toBe(
      "This selection is 46 bytes; this page accepts at most 10.",
    );
  }
});

test("userMessage turns core diagnostics into actionable English", () => {
  expect(userMessage({ code: "DBNAME_NOT_ALLOWED", message: "already user copy" })).toBe(
    "already user copy",
  );
  expect(userMessage({ code: "ENCODING_INVALID", message: "input is not valid UTF-8" })).toBe(
    "That file is not valid UTF-8 text.",
  );
  expect(userMessage({ code: "HTTP_ERROR", message: "HTTP 503 from x" })).toBe(
    "Could not reach that service. Check the URL and try again.",
  );
  expect(userMessage({ code: "QUARRY_NO_TITLE_COLUMN", message: "alias one: AS page_title" })).toBe(
    "alias one: AS page_title",
  );
  expect(
    userMessage({ code: "URL_INVALID", message: "That doesn't look like a Quarry query URL (https://quarry.wmcloud.org/query/<id>)." }),
  ).toBe("That doesn't look like a Quarry query URL (https://quarry.wmcloud.org/query/<id>).");
  expect(userMessage({ code: "JSON_SHAPE", message: "no pages list" })).toBe(
    "Could not load that selection (JSON_SHAPE).",
  );
});
