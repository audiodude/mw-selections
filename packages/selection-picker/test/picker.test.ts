import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, expect, test } from "vitest";
import type { Selection } from "@audiodude/selection-core";
import "../src/index.js";
import type { SelectionPicker } from "../src/selection-picker.js";
import { resetSitematrixCache } from "../src/sitematrix-source.js";
import { fakeFetch, FIXTURES, readFixtureJson, setValue, type Route } from "./helpers.js";

const sitematrixRoute: Route = {
  match: "action=sitematrix",
  json: JSON.parse(readFileSync(join(FIXTURES, "sitematrix.json"), "utf8")),
};

function mount(attrs: string, routes: Route[] = []): SelectionPicker {
  document.body.innerHTML = `<selection-picker ${attrs}></selection-picker>`;
  const el = document.querySelector("selection-picker") as SelectionPicker;
  el.fetchImpl = fakeFetch([sitematrixRoute, ...routes]);
  return el;
}

/** Flush pending promises (fetches, ingest) and the following render. */
async function settle(el: SelectionPicker): Promise<void> {
  await el.updateComplete;
  await new Promise((resolve) => setTimeout(resolve, 0));
  await el.updateComplete;
}

function shadow<T extends Element>(el: SelectionPicker, selector: string): T {
  const found = el.renderRoot.querySelector<T>(selector);
  if (found === null) throw new Error(`no ${selector} in the picker's shadow root`);
  return found;
}

async function click(el: SelectionPicker, selector: string): Promise<void> {
  shadow<HTMLButtonElement>(el, selector).click();
  await settle(el);
}

beforeEach(() => {
  resetSitematrixCache();
});

test("manual mode: load, report, confirm — resolves and emits the Selection", async () => {
  const el = mount(`dbname="enwiki"`);
  const events: Selection[] = [];
  document.addEventListener("selection", (e) => events.push((e as CustomEvent<Selection>).detail));

  const pending = el.open();
  await settle(el);
  expect(shadow<HTMLDialogElement>(el, "dialog").open).toBe(true);
  // A single-entry dbname allowlist pins the project: no picker shown.
  expect(el.renderRoot.querySelector("input[part=project]")).toBeNull();

  setValue(shadow<HTMLTextAreaElement>(el, "textarea[part=manual]"), "Statue of Liberty\nParis");
  await click(el, "button[part=load]");
  expect(shadow(el, "p[part=summary]").textContent?.trim()).toBe(
    "Ingested 2 items from en.wikipedia.org.",
  );

  await click(el, "button[part=confirm]");
  const selection = await pending;
  expect(selection).toEqual({
    dbname: "enwiki",
    pages: ["Statue_of_Liberty", "Paris"],
    source: { type: "simple" },
  });
  expect(events).toEqual([selection]);
  expect(shadow<HTMLDialogElement>(el, "dialog").open).toBe(false);
});

test("cancelling rejects with an AbortError and emits nothing", async () => {
  const el = mount(`dbname="enwiki"`);
  const events: unknown[] = [];
  document.addEventListener("selection", (e) => events.push(e));

  const pending = el.open();
  await settle(el);
  await click(el, "button[part=cancel]");

  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  expect(events).toEqual([]);
});

test("closing the dialog by any means (Escape, dialog.close) rejects too", async () => {
  const el = mount(`dbname="enwiki"`);
  const pending = el.open();
  await settle(el);
  shadow<HTMLDialogElement>(el, "dialog").close();
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
});

test("PetScan mode fetches upstream and keeps the source verbatim", async () => {
  const meta = readFixtureJson("petscan", "manual-list", "meta.json");
  const el = mount(`dbname="enwiki"`, [
    { match: "petscan.wmcloud.org", json: readFixtureJson("petscan", "manual-list", "input.json") },
  ]);

  const pending = el.open();
  await settle(el);
  await click(el, "nav button[data-mode=petscan]");
  setValue(shadow<HTMLInputElement>(el, "input[part=petscan-url]"), meta.params.url);
  await click(el, "button[part=load]");
  await click(el, "button[part=confirm]");

  const selection = await pending;
  expect(selection.source).toEqual({ type: "petscan", url: meta.params.url, dynamic: true });
  expect(selection.pages.length).toBe(3);
});

test("SPARQL mode reports dropped rows in the summary", async () => {
  const meta = readFixtureJson("sparql", "dropped-rows-reported", "meta.json");
  const el = mount(`dbname="enwiki"`, [
    {
      match: "query.wikidata.org",
      json: readFixtureJson("sparql", "dropped-rows-reported", "input.json"),
    },
  ]);

  const pending = el.open();
  await settle(el);
  await click(el, "nav button[data-mode=sparql]");
  setValue(shadow<HTMLTextAreaElement>(el, "textarea[part=sparql-query]"), meta.params.query);
  await click(el, "button[part=load]");

  expect(shadow(el, "p[part=summary]").textContent?.trim()).toBe(
    "Ingested 2 items, dropped 2 rows not on en.wikipedia.org.",
  );
  await click(el, "button[part=confirm]");
  const selection = await pending;
  expect(selection.source).toMatchObject({ type: "sparql", dynamic: true });
});

test("a cap violation is shown, blocks confirm, and leaves the promise pending", async () => {
  const el = mount(`dbname="enwiki" max-items="1"`);
  let settled = false;
  const pending = el.open();
  void pending.then(
    () => (settled = true),
    () => (settled = true),
  );
  await settle(el);

  setValue(shadow<HTMLTextAreaElement>(el, "textarea[part=manual]"), "Paris\nBerlin");
  await click(el, "button[part=load]");

  expect(shadow(el, "p[part=error]").textContent?.trim()).toBe(
    "This selection has 2 items; this page accepts at most 1.",
  );
  expect(shadow<HTMLButtonElement>(el, "button[part=confirm]").disabled).toBe(true);
  expect(settled).toBe(false);
});

test("an upstream dbname outside the allowlist is reported as domains", async () => {
  const meta = readFixtureJson("petscan", "manual-list", "meta.json");
  const el = mount(`dbname="dewiki"`, [
    { match: "petscan.wmcloud.org", json: readFixtureJson("petscan", "manual-list", "input.json") },
  ]);

  el.open().catch(() => undefined);
  await settle(el);
  await click(el, "nav button[data-mode=petscan]");
  setValue(shadow<HTMLInputElement>(el, "input[part=petscan-url]"), meta.params.url);
  await click(el, "button[part=load]");

  expect(shadow(el, "p[part=error]").textContent?.trim()).toBe(
    "Your URL names en.wikipedia.org, but this page is only configured to accept de.wikipedia.org.",
  );
});

test("with no dbname attribute the project picker offers every project", async () => {
  const el = mount("");
  el.open().catch(() => undefined);
  await settle(el);

  const options = [...el.renderRoot.querySelectorAll("datalist option")];
  expect(options.length).toBe(33); // every site in fixtures/sitematrix.json
  setValue(shadow<HTMLInputElement>(el, "input[part=project]"), "de.wikipedia.org");
  setValue(shadow<HTMLTextAreaElement>(el, "textarea[part=manual]"), "Berlin");
  await click(el, "button[part=load]");
  expect(shadow(el, "p[part=summary]").textContent?.trim()).toBe(
    "Ingested 1 item from de.wikipedia.org.",
  );
});

test("swiki mode: a file that names no project prompts for one, then succeeds", async () => {
  const el = mount("");
  el.open().catch(() => undefined);
  await settle(el);
  await click(el, "nav button[data-mode=swiki]");

  const input = shadow<HTMLInputElement>(el, "input[part=file]");
  const transfer = new DataTransfer();
  transfer.items.add(new File([new TextEncoder().encode("Paris\t54321\n")], "list.tsv"));
  input.files = transfer.files;
  input.dispatchEvent(new Event("change"));
  await settle(el);
  expect(shadow(el, "p[part=filename]").textContent?.trim()).toBe("list.tsv");

  await click(el, "button[part=load]");
  expect(shadow(el, "p[part=error]").textContent?.trim()).toBe(
    "This file does not name a project. Choose the Wikimedia project its titles belong to.",
  );

  setValue(shadow<HTMLInputElement>(el, "input[part=project]"), "en.wikipedia.org");
  await click(el, "button[part=load]");
  expect(shadow(el, "p[part=summary]").textContent?.trim()).toBe(
    "Ingested 1 item from en.wikipedia.org.",
  );
});

test("swiki mode with no file chosen says so instead of loading", async () => {
  const el = mount(`dbname="enwiki"`);
  el.open().catch(() => undefined);
  await settle(el);
  await click(el, "nav button[data-mode=swiki]");
  await click(el, "button[part=load]");
  expect(shadow(el, "p[part=error]").textContent?.trim()).toBe(
    "Choose a .swiki or TSV file first.",
  );
});

test("editing a field after a successful load clears the stale result", async () => {
  const el = mount(`dbname="enwiki"`);
  el.open().catch(() => undefined);
  await settle(el);
  setValue(shadow<HTMLTextAreaElement>(el, "textarea[part=manual]"), "Paris");
  await click(el, "button[part=load]");
  expect(el.renderRoot.querySelector("p[part=summary]")).not.toBeNull();

  setValue(shadow<HTMLTextAreaElement>(el, "textarea[part=manual]"), "Paris\nBerlin");
  await settle(el);
  expect(el.renderRoot.querySelector("p[part=summary]")).toBeNull();
  expect(shadow<HTMLButtonElement>(el, "button[part=confirm]").disabled).toBe(true);
});

test("the proxy attribute routes materializer requests — never the sitematrix — through the host proxy", async () => {
  const meta = readFixtureJson("petscan", "manual-list", "meta.json");
  const fetch = fakeFetch([
    sitematrixRoute, // reached directly: the sitematrix is never proxied
    { match: "url=https%3A%2F%2Fpetscan", json: readFixtureJson("petscan", "manual-list", "input.json") },
  ]);
  document.body.innerHTML = `<selection-picker dbname="enwiki" proxy="https://host.example/p"></selection-picker>`;
  const el = document.querySelector("selection-picker") as SelectionPicker;
  el.fetchImpl = fetch;

  el.open().catch(() => undefined);
  await settle(el);
  await click(el, "nav button[data-mode=petscan]");
  setValue(shadow<HTMLInputElement>(el, "input[part=petscan-url]"), meta.params.url);
  await click(el, "button[part=load]");

  expect(el.renderRoot.querySelector("p[part=error]")).toBeNull();
  // Not vacuous: both requests must really have happened.
  expect(fetch.calls.length).toBe(2);
  expect(fetch.calls[0]).toContain("action=sitematrix");
  expect(fetch.calls[0]!.startsWith("https://host.example/p?url=")).toBe(false);
  expect(fetch.calls[1]!.startsWith("https://host.example/p?url=https%3A%2F%2Fpetscan")).toBe(true);
});

test("defining the element twice does not throw (double-loaded CDN tags)", async () => {
  // A bare re-import is an ESM cache hit and re-runs nothing; call the
  // exported guard directly so the test actually exercises it.
  const { defineSelectionPicker } = await import("../src/index.js");
  defineSelectionPicker(); // second definition: the file-top import already ran it
  expect(customElements.get("selection-picker")).toBeDefined();
});

test("open() while already open is a host error: it throws and the first session survives", async () => {
  const el = mount(`dbname="enwiki"`);
  const pending = el.open();
  await settle(el);
  expect(() => el.open()).toThrow(/already open/);

  setValue(shadow<HTMLTextAreaElement>(el, "textarea[part=manual]"), "Paris");
  await click(el, "button[part=load]");
  await click(el, "button[part=confirm]");
  await expect(pending).resolves.toMatchObject({ pages: ["Paris"] });
});

test("a seedless open() after a cancel starts blank, not with the last session's text", async () => {
  const el = mount(`dbname="enwiki"`);
  const first = el.open();
  await settle(el);
  setValue(shadow<HTMLTextAreaElement>(el, "textarea[part=manual]"), "Paris");
  await click(el, "button[part=cancel]");
  await expect(first).rejects.toMatchObject({ name: "AbortError" });

  el.open().catch(() => undefined);
  await settle(el);
  expect(shadow<HTMLTextAreaElement>(el, "textarea[part=manual]").value).toBe("");
});

test("a malformed cap attribute is a loud host error, not a silently disabled cap", async () => {
  const el = mount(`dbname="enwiki" max-items="abc"`);
  await el.updateComplete;
  expect(() => el.open()).toThrow(/max-items/);
});
