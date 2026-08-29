import { expect, test } from "vitest";
import { parseSelectionJson, selectionJsonBytes, serializeSelectionJson } from "../src/json.js";

test("emits canonical item forms, preserving extras and source verbatim", () => {
  const result = serializeSelectionJson({
    dbname: "enwiki",
    pages: ["Bare_title", ["Paris", 54321, 0], ["T", null], ["Talk", null, 1]],
    source: { type: "petscan", url: "https://petscan.wmcloud.org/?psid=1", dynamic: true },
    note: "kept",
  });
  expect(result.ok, JSON.stringify(result)).toBe(true);
  if (result.ok) {
    const doc = JSON.parse(result.value);
    // [title, id, 0] and [title, null] canonicalize away (fixtures "Canonical item form")
    expect(doc.pages).toEqual(["Bare_title", ["Paris", 54321], "T", ["Talk", null, 1]]);
    expect(doc.source).toEqual({
      type: "petscan",
      url: "https://petscan.wmcloud.org/?psid=1",
      dynamic: true,
    });
    expect(doc.note).toBe("kept");
  }
});

test("round-trips through parseSelectionJson", () => {
  const serialized = serializeSelectionJson({ dbname: "enwiki", pages: [["Paris", 54321, 0]] });
  expect(serialized.ok).toBe(true);
  if (serialized.ok) {
    expect(parseSelectionJson(serialized.value)).toEqual({
      ok: true,
      value: { dbname: "enwiki", pages: [["Paris", 54321]] },
    });
  }
});

test("rejects duplicates and forbidden characters instead of repairing", () => {
  const dup = serializeSelectionJson({ dbname: "enwiki", pages: ["A", ["A", 5, 0]] });
  expect(dup.ok).toBe(false);
  if (!dup.ok) expect(dup.error.code).toBe("DUPLICATE_ITEM");
  const bad = serializeSelectionJson({ dbname: "enwiki", pages: ["a\tb"] });
  expect(bad.ok).toBe(false);
  if (!bad.ok) expect(bad.error.code).toBe("FIELD_FORBIDDEN_CHAR");
});

test("selectionJsonBytes measures UTF-8 bytes, not string length", () => {
  const selection = { dbname: "enwiki", pages: ["Café"] };
  const json = JSON.stringify(selection);
  expect(selectionJsonBytes(selection)).toBe(Buffer.byteLength(json, "utf8"));
  expect(Buffer.byteLength(json, "utf8")).toBe(json.length + 1); // é: 2 UTF-8 bytes, 1 code unit
});
