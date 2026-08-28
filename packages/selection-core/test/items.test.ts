import { expect, test } from "vitest";
import { canonicalItem, Deduper, hasForbiddenChar, itemKey } from "../src/items.js";

test("canonical item form: the five spellings", () => {
  // 1. title-only → bare string
  expect(canonicalItem({ title: "Paris", id: null, ns: 0 })).toBe("Paris");
  // 2. title + id, ns 0 → [title, id]
  expect(canonicalItem({ title: "Paris", id: 54321, ns: 0 })).toEqual(["Paris", 54321]);
  // 3. title + id + ns > 0 → [title, id, ns]
  expect(canonicalItem({ title: "T", id: 7, ns: 1 })).toEqual(["T", 7, 1]);
  // 4. title + ns > 0, id unknown → [title, null, ns]
  expect(canonicalItem({ title: "T", id: null, ns: 1 })).toEqual(["T", null, 1]);
});

test("uniqueness key is (title, ns); id is never part of it", () => {
  expect(itemKey("Paris", 0)).toBe(itemKey("Paris", 0));
  expect(itemKey("Paris", 0)).not.toBe(itemKey("Paris", 1));
  const d = new Deduper();
  expect(d.add({ title: "Paris", id: 1, ns: 0 })).toBe(true);
  expect(d.add({ title: "Paris", id: 999, ns: 0 })).toBe(false); // same key, different id → dup
  expect(d.add({ title: "Paris", id: 1, ns: 1 })).toBe(true); // different ns → distinct
});

test("forbidden characters are tab and newline only", () => {
  expect(hasForbiddenChar("a\tb")).toBe(true);
  expect(hasForbiddenChar("a\nb")).toBe(true);
  expect(hasForbiddenChar("a\rb")).toBe(false); // §4.3 names only \t and \n
  expect(hasForbiddenChar("plain")).toBe(false);
});
