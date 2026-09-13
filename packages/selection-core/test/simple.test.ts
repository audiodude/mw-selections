import { expect, test } from "vitest";
import { normalizeManualText } from "../src/simple.js";

test("rejects literal and percent-decoded forbidden title characters", () => {
  for (const char of "#<>[]{}|") {
    for (const entry of [`A${char}B`, `A${encodeURIComponent(char)}B`]) {
      expect(normalizeManualText(entry)).toMatchObject({
        ok: false, error: { code: "TITLE_FORBIDDEN_CHAR" },
      });
    }
  }
  expect(normalizeManualText("%23not-a-comment")).toMatchObject({
    ok: false, error: { code: "TITLE_FORBIDDEN_CHAR" },
  });
  expect(normalizeManualText(`# ${"x".repeat(300)}\nValid title`)).toEqual({
    ok: true, value: { pages: ["Valid_title"] },
  });
});

test("limits decoded UTF-8 bytes rather than characters or encoded length", () => {
  for (const title of ["a".repeat(256), "é".repeat(128), "😀".repeat(64)]) {
    expect(normalizeManualText(encodeURIComponent(title))).toEqual({
      ok: true, value: { pages: [title] },
    });
    expect(normalizeManualText(`${title}a`)).toMatchObject({
      ok: false, error: { code: "TITLE_TOO_LONG" },
    });
  }
});

test("validates the decoded full URL before removing its prefix", () => {
  for (const prefix of ["https://en.wikipedia.org/wiki/", "https://en.wikipedia.org/w/index.php?title="]) {
    const title = "a".repeat(256 - prefix.length);
    expect(normalizeManualText(prefix + title)).toEqual({
      ok: true, value: { pages: [title] },
    });
    expect(normalizeManualText(prefix + title + "a")).toMatchObject({
      ok: false, error: { code: "TITLE_TOO_LONG" },
    });
    expect(normalizeManualText(prefix + "A%23section")).toMatchObject({
      ok: false, error: { code: "TITLE_FORBIDDEN_CHAR" },
    });
  }
});
