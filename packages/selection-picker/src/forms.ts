import { html, nothing, type TemplateResult } from "lit";
import type { Mode } from "./ingest.js";
import { STRINGS } from "./strings.js";

/** Everything the user can type. The element owns it; forms only read it. */
export interface FormState {
  /** Project field text: a domain, or a dbname when prefilled by a seed. */
  dbname: string;
  manualText: string;
  /** Display name of the chosen file; the File itself lives in the element. */
  filename: string;
  petscanUrl: string;
  sparqlEndpoint: string;
  sparqlQuery: string;
  quarryUrl: string;
}

export interface FormCallbacks {
  update(patch: Partial<FormState>): void;
  selectFile(file: File | null): void;
}

/** SPEC §4.2 domains, offered as a datalist so typing and picking both work. */
export function renderProjectPicker(
  value: string,
  domains: string[],
  cb: FormCallbacks,
): TemplateResult {
  return html`<label>
    <span>${STRINGS.projectLabel}</span>
    <input
      part="project"
      list="sp-projects"
      placeholder=${STRINGS.projectPlaceholder}
      .value=${value}
      @input=${(e: Event) => cb.update({ dbname: (e.target as HTMLInputElement).value })}
    />
    <datalist id="sp-projects">
      ${domains.map((domain) => html`<option value=${domain}></option>`)}
    </datalist>
  </label>`;
}

/**
 * The form for one input mode. `showProject` is the element's decision:
 * true only for the modes whose dbname is user input (manual, swiki, sparql)
 * and only when the host has not pinned exactly one dbname. PetScan and
 * Quarry never show it — their dbname comes from upstream (SPEC §7.3, §7.5).
 */
export function renderForm(
  mode: Mode,
  state: FormState,
  showProject: boolean,
  domains: string[],
  cb: FormCallbacks,
): TemplateResult {
  const project = showProject ? renderProjectPicker(state.dbname, domains, cb) : nothing;
  switch (mode) {
    case "manual":
      return html`${project}
        <label>
          <span>${STRINGS.manualLabel}</span>
          <textarea
            part="manual"
            .value=${state.manualText}
            @input=${(e: Event) =>
              cb.update({ manualText: (e.target as HTMLTextAreaElement).value })}
          ></textarea>
        </label>`;
    case "swiki":
      return html`${project}
        <label>
          <span>${STRINGS.swikiLabel}</span>
          <input
            part="file"
            type="file"
            accept=".swiki,.tsv,text/tab-separated-values,text/plain"
            @change=${(e: Event) =>
              cb.selectFile((e.target as HTMLInputElement).files?.[0] ?? null)}
          />
        </label>
        <p part="filename">${state.filename === "" ? STRINGS.noFile : state.filename}</p>`;
    case "petscan":
      return html`<label>
        <span>${STRINGS.petscanLabel}</span>
        <input
          part="petscan-url"
          type="url"
          inputmode="url"
          placeholder="https://petscan.wmcloud.org/?psid=12345678"
          .value=${state.petscanUrl}
          @input=${(e: Event) => cb.update({ petscanUrl: (e.target as HTMLInputElement).value })}
        />
      </label>`;
    case "sparql":
      return html`${project}
        <label>
          <span>${STRINGS.sparqlEndpointLabel}</span>
          <input
            part="sparql-endpoint"
            type="url"
            inputmode="url"
            .value=${state.sparqlEndpoint}
            @input=${(e: Event) =>
              cb.update({ sparqlEndpoint: (e.target as HTMLInputElement).value })}
          />
        </label>
        <label>
          <span>${STRINGS.sparqlQueryLabel}</span>
          <textarea
            part="sparql-query"
            .value=${state.sparqlQuery}
            @input=${(e: Event) =>
              cb.update({ sparqlQuery: (e.target as HTMLTextAreaElement).value })}
          ></textarea>
        </label>`;
    case "quarry":
      return html`<label>
        <span>${STRINGS.quarryLabel}</span>
        <input
          part="quarry-url"
          type="url"
          inputmode="url"
          placeholder="https://quarry.wmcloud.org/query/104907"
          .value=${state.quarryUrl}
          @input=${(e: Event) => cb.update({ quarryUrl: (e.target as HTMLInputElement).value })}
        />
      </label>`;
  }
}
