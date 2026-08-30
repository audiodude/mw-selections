import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, expect, test } from "vitest";
import "../src/index.js";
import type { SelectionPicker } from "../src/selection-picker.js";
import { resetSitematrixCache } from "../src/sitematrix-source.js";
import { fakeFetch, FIXTURES, setValue, type Route } from "./helpers.js";

const sitematrixRoute: Route = {
  match: "action=sitematrix",
  json: JSON.parse(readFileSync(join(FIXTURES, "sitematrix.json"), "utf8")),
};

async function settle(el: SelectionPicker): Promise<void> {
  await el.updateComplete;
  await new Promise((resolve) => setTimeout(resolve, 0));
  await el.updateComplete;
}

beforeEach(() => {
  resetSitematrixCache();
});

test("open(seed) prefills a petscan query, and reloading re-materializes it", async () => {
  document.body.innerHTML = `<selection-picker dbname="enwiki"></selection-picker>`;
  const el = document.querySelector("selection-picker") as SelectionPicker;
  const petscanInput = JSON.parse(
    readFileSync(join(FIXTURES, "petscan", "manual-list", "input.json"), "utf8"),
  );
  el.fetchImpl = fakeFetch([
    sitematrixRoute,
    { match: "petscan.wmcloud.org", json: petscanInput },
  ]);

  const url = "https://petscan.wmcloud.org/?language=en&project=wikipedia&manual_list_wiki=enwiki";
  const pending = el.open({
    dbname: "enwiki",
    pages: ["stale"],
    source: { type: "petscan", url, dynamic: true },
  });
  await settle(el);

  const field = el.renderRoot.querySelector("input[part=petscan-url]") as HTMLInputElement;
  expect(field.value).toBe(url);

  (el.renderRoot.querySelector("button[part=load]") as HTMLButtonElement).click();
  await settle(el);
  (el.renderRoot.querySelector("button[part=confirm]") as HTMLButtonElement).click();

  const selection = await pending;
  // Re-materialized from the source; the seed's stale pages are gone.
  expect(selection.pages.length).toBe(3);
  expect(selection.source).toEqual({ type: "petscan", url, dynamic: true });
});

test("open(seed) for a static seed round-trips editable titles back out", async () => {
  document.body.innerHTML = `<selection-picker dbname="enwiki"></selection-picker>`;
  const el = document.querySelector("selection-picker") as SelectionPicker;
  el.fetchImpl = fakeFetch([sitematrixRoute]);

  const pending = el.open({
    dbname: "enwiki",
    pages: ["Paris", ["Statue_of_Liberty", 28617]],
    source: { type: "swiki" },
  });
  await settle(el);

  const textarea = el.renderRoot.querySelector("textarea[part=manual]") as HTMLTextAreaElement;
  expect(textarea.value).toBe("Paris\nStatue_of_Liberty");
  setValue(textarea, "Paris\nStatue_of_Liberty\nBerlin");
  (el.renderRoot.querySelector("button[part=load]") as HTMLButtonElement).click();
  await settle(el);
  (el.renderRoot.querySelector("button[part=confirm]") as HTMLButtonElement).click();

  const selection = await pending;
  expect(selection).toEqual({
    dbname: "enwiki",
    pages: ["Paris", "Statue_of_Liberty", "Berlin"],
    source: { type: "simple" }, // the user is editing titles now, not a file
  });
});

test("a second open() after a cancel starts from the new seed, not the old state", async () => {
  document.body.innerHTML = `<selection-picker dbname="enwiki"></selection-picker>`;
  const el = document.querySelector("selection-picker") as SelectionPicker;
  el.fetchImpl = fakeFetch([sitematrixRoute]);

  const first = el.open({ dbname: "enwiki", pages: ["Paris"], source: { type: "simple" } });
  await settle(el);
  (el.renderRoot.querySelector("button[part=cancel]") as HTMLButtonElement).click();
  await expect(first).rejects.toMatchObject({ name: "AbortError" });

  const second = el.open({ dbname: "enwiki", pages: ["Berlin"], source: { type: "simple" } });
  await settle(el);
  const textarea = el.renderRoot.querySelector("textarea[part=manual]") as HTMLTextAreaElement;
  expect(textarea.value).toBe("Berlin");

  (el.renderRoot.querySelector("button[part=cancel]") as HTMLButtonElement).click();
  await expect(second).rejects.toMatchObject({ name: "AbortError" });
});

test("a static seed's non-main-namespace pages are omitted and reported, never re-homed", async () => {
  document.body.innerHTML = `<selection-picker dbname="enwiki"></selection-picker>`;
  const el = document.querySelector("selection-picker") as SelectionPicker;
  el.fetchImpl = fakeFetch([sitematrixRoute]);

  el.open({
    dbname: "enwiki",
    pages: ["Paris", ["Talk_x", null, 1]],
    source: { type: "swiki" },
  }).catch(() => undefined);
  await settle(el);

  const textarea = el.renderRoot.querySelector("textarea[part=manual]") as HTMLTextAreaElement;
  expect(textarea.value).toBe("Paris"); // Talk_x (ns 1) is not silently mainspaced
  expect(el.renderRoot.querySelector("p[part=error]")?.textContent?.trim()).toBe(
    "1 page outside the main namespace was omitted; title lines can only express main-namespace pages.",
  );
});
