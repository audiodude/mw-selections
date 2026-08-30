import { html, render } from "lit";
import { beforeEach, expect, test } from "vitest";
import { renderForm, type FormCallbacks, type FormState } from "../src/forms.js";
import { setValue } from "./helpers.js";

const blank: FormState = {
  dbname: "",
  manualText: "",
  filename: "",
  petscanUrl: "",
  sparqlEndpoint: "https://query.wikidata.org/sparql",
  sparqlQuery: "",
  quarryUrl: "",
};

let patches: Array<Partial<FormState>>;
let files: Array<File | null>;
let cb: FormCallbacks;
let host: HTMLElement;

beforeEach(() => {
  patches = [];
  files = [];
  cb = {
    update: (patch) => patches.push(patch),
    selectFile: (file) => files.push(file),
  };
  document.body.innerHTML = `<div id="host"></div>`;
  host = document.getElementById("host")!;
});

function show(
  mode: Parameters<typeof renderForm>[0],
  state: FormState = blank,
  showProject = false,
  domains: string[] = [],
): void {
  render(html`${renderForm(mode, state, showProject, domains, cb)}`, host);
}

test("the project picker lists domains and reports the chosen one", () => {
  show("manual", blank, true, ["en.wikipedia.org", "de.wikipedia.org"]);
  const options = [...host.querySelectorAll("datalist option")].map((o) =>
    o.getAttribute("value"),
  );
  expect(options).toEqual(["en.wikipedia.org", "de.wikipedia.org"]);

  setValue(host.querySelector("input[part=project]") as HTMLInputElement, "de.wikipedia.org");
  expect(patches).toEqual([{ dbname: "de.wikipedia.org" }]);
});

test("the project picker is omitted when the host fixed the project", () => {
  show("manual", blank, false, []);
  expect(host.querySelector("input[part=project]")).toBeNull();
});

test("manual mode reports typed text", () => {
  show("manual");
  setValue(host.querySelector("textarea[part=manual]") as HTMLTextAreaElement, "Paris\nBerlin");
  expect(patches).toEqual([{ manualText: "Paris\nBerlin" }]);
});

test("swiki mode reports the chosen file and shows its name", () => {
  show("swiki", { ...blank, filename: "list.enwiki.swiki" });
  expect(host.querySelector("p[part=filename]")!.textContent).toContain("list.enwiki.swiki");

  const input = host.querySelector("input[part=file]") as HTMLInputElement;
  expect(input.type).toBe("file");
  const file = new File([new TextEncoder().encode("Paris\n")], "picked.swiki");
  const transfer = new DataTransfer();
  transfer.items.add(file);
  input.files = transfer.files;
  input.dispatchEvent(new Event("change"));
  expect(files.map((f) => f?.name)).toEqual(["picked.swiki"]);
});

test("swiki mode with no file yet says so", () => {
  show("swiki");
  expect(host.querySelector("p[part=filename]")!.textContent).toContain("No file selected");
});

test("petscan and quarry modes report their URLs and show no project picker", () => {
  show("petscan");
  expect(host.querySelector("input[part=project]")).toBeNull();
  setValue(host.querySelector("input[part=petscan-url]") as HTMLInputElement, "https://p/?psid=1");
  expect(patches).toEqual([{ petscanUrl: "https://p/?psid=1" }]);

  patches = [];
  show("quarry");
  setValue(host.querySelector("input[part=quarry-url]") as HTMLInputElement, "https://q/query/1");
  expect(patches).toEqual([{ quarryUrl: "https://q/query/1" }]);
});

test("sparql mode exposes endpoint, query, and the required project field", () => {
  show("sparql", blank, true, ["en.wikipedia.org"]);
  const endpoint = host.querySelector("input[part=sparql-endpoint]") as HTMLInputElement;
  expect(endpoint.value).toBe("https://query.wikidata.org/sparql");
  expect(host.querySelector("input[part=project]")).not.toBeNull();

  setValue(endpoint, "https://query.wikidata.org/bigdata/namespace/wdq/sparql");
  setValue(
    host.querySelector("textarea[part=sparql-query]") as HTMLTextAreaElement,
    "SELECT ?url {}",
  );
  expect(patches).toEqual([
    { sparqlEndpoint: "https://query.wikidata.org/bigdata/namespace/wdq/sparql" },
    { sparqlQuery: "SELECT ?url {}" },
  ]);
});
