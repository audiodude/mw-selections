import {
  defaultFetch,
  type FetchLike,
  type Selection,
  type Sitematrix,
} from "@audiodude/selection-core";
import { html, LitElement, nothing, type TemplateResult } from "lit";
import { parseAllowlist, resolveDbname } from "./dbname.js";
import { renderForm, type FormCallbacks, type FormState } from "./forms.js";
import { ingest, type IngestInput, type IngestOutcome, type Mode } from "./ingest.js";
import { proxyFetch } from "./proxy-fetch.js";
import { seedState } from "./seed.js";
import { loadSitematrix } from "./sitematrix-source.js";
import { pickerStyles } from "./styles.js";
import { STRINGS, userMessage } from "./strings.js";

const MODES: Mode[] = ["manual", "swiki", "petscan", "sparql", "quarry"];

const BLANK_STATE: FormState = {
  dbname: "",
  manualText: "",
  filename: "",
  petscanUrl: "",
  sparqlEndpoint: "https://query.wikidata.org/sparql",
  sparqlQuery: "",
  quarryUrl: "",
};

/**
 * Create-only Selection picker (decision record #1). Editing a stored
 * Selection is the host's concern; this element only produces new ones.
 */
export class SelectionPicker extends LitElement {
  static override styles = pickerStyles;

  static override properties = {
    dbname: { type: String },
    maxBytes: { type: Number, attribute: "max-bytes" },
    maxItems: { type: Number, attribute: "max-items" },
    proxy: { type: String },
    _mode: { state: true },
    _form: { state: true },
    _busy: { state: true },
    _ready: { state: true },
    _error: { state: true },
    _outcome: { state: true },
  };

  /** Comma-separated allowlist constraint; absent → the user picks. */
  declare dbname: string | null;
  /** Cap on the canonical Selection JSON's UTF-8 byte length. */
  declare maxBytes: number | null;
  declare maxItems: number | null;
  /** Escape hatch for hosts running their own materializer. */
  declare proxy: string | null;

  /** Test seam and host override: any WHATWG-compatible fetch. */
  fetchImpl?: FetchLike;

  declare private _mode: Mode;
  declare private _form: FormState;
  declare private _busy: boolean;
  declare private _ready: boolean;
  declare private _error: string | undefined;
  declare private _outcome: IngestOutcome | undefined;

  #sitematrix?: Sitematrix;
  #resolve?: (selection: Selection) => void;
  #reject?: (reason: unknown) => void;
  #file?: File;

  /**
   * Stable identity: recreating these per render would make Lit tear down and
   * re-add every field listener on every update.
   */
  readonly #callbacks: FormCallbacks = {
    update: (patch) => {
      this._form = { ...this._form, ...patch };
      this._outcome = undefined; // a stale result must never be confirmable
      this._error = undefined;
    },
    selectFile: (file) => {
      this.#file = file ?? undefined;
      this._form = { ...this._form, filename: file?.name ?? "" };
      this._outcome = undefined;
      this._error = undefined;
    },
  };

  constructor() {
    super();
    this.dbname = null;
    this.maxBytes = null;
    this.maxItems = null;
    this.proxy = null;
    this._mode = "manual";
    this._form = BLANK_STATE;
    this._busy = false;
    this._ready = false;
    this._error = undefined;
    this._outcome = undefined;
  }

  /**
   * Show the dialog and resolve with the Selection the user accepted.
   * Rejects with an AbortError DOMException if the user cancels or closes
   * the dialog. `seed` prefills one mode (see seed.ts); without one the form
   * starts blank — every call is a fresh create session. Host programming
   * errors throw a plain Error synchronously: element not connected, dialog
   * already open, or a malformed cap attribute.
   */
  open(seed?: Selection): Promise<Selection> {
    if (!this.isConnected) {
      throw new Error("<selection-picker>.open() requires the element to be in the document");
    }
    if (this.#reject !== undefined) {
      // A second showModal() would throw InvalidStateError inside the
      // void'ed #show, stranding the first caller's promise unsettled.
      throw new Error("<selection-picker> is already open");
    }
    this.#checkCapAttr("max-bytes", this.maxBytes);
    this.#checkCapAttr("max-items", this.maxItems);
    this._error = undefined;
    this._outcome = undefined;
    this.#file = undefined;
    if (seed === undefined) {
      this._mode = "manual";
      this._form = BLANK_STATE;
    } else {
      const seeded = seedState(seed);
      this._mode = seeded.mode;
      this._form = { ...BLANK_STATE, ...seeded.state };
      if (seeded.omitted > 0) this._error = STRINGS.seedOmitted(seeded.omitted);
    }
    const promise = new Promise<Selection>((resolve, reject) => {
      this.#resolve = resolve;
      this.#reject = reject;
    });
    // Cancellation is an expected outcome, not a bug: hosts driven by the
    // `selection` event may never touch this promise, and its AbortError
    // must not surface as an unhandled rejection when they don't.
    promise.catch(() => undefined);
    void this.#show();
    return promise;
  }

  /**
   * Lit's Number converter turns `max-items="abc"` into NaN, and every
   * comparison against NaN is silently false — the host would believe a cap
   * is enforced when none is. Fail loudly instead.
   */
  #checkCapAttr(name: string, value: number | null): void {
    if (value !== null && (!Number.isFinite(value) || value <= 0)) {
      throw new Error(`<selection-picker> ${name} must be a positive number`);
    }
  }

  async #show(): Promise<void> {
    await this.updateComplete;
    this.#dialog.showModal();
    if (this.#sitematrix !== undefined) return;
    // The sitematrix always loads directly from meta (CORS-open via
    // origin=*): the proxy is decision #3's escape hatch for the
    // materializer services, and a host proxy that allowlists only those
    // must not have to pass meta traffic.
    const sitematrix = await loadSitematrix({ fetch: this.#rawFetch });
    if (!sitematrix.ok) {
      this._error = STRINGS.sitematrixUnavailable;
      return;
    }
    this.#sitematrix = sitematrix.value;
    this._ready = true;
  }

  get #dialog(): HTMLDialogElement {
    const dialog = this.renderRoot.querySelector("dialog");
    if (dialog === null) throw new Error("<selection-picker> has not rendered yet");
    return dialog;
  }

  /** The host-visible fetch before proxy wrapping; the sitematrix uses this. */
  get #rawFetch(): FetchLike {
    return this.fetchImpl ?? defaultFetch();
  }

  /** Materializer fetches: honors the `proxy` escape hatch. */
  get #fetch(): FetchLike {
    const base = this.#rawFetch;
    return this.proxy === null || this.proxy === "" ? base : proxyFetch(this.proxy, base);
  }

  async #load(): Promise<void> {
    if (this._busy) return; // a second Load must not race the first
    const sitematrix = this.#sitematrix;
    if (sitematrix === undefined) return;
    this._busy = true;
    this._error = undefined;
    this._outcome = undefined;
    const allowlist = parseAllowlist(this.dbname);
    const input = await this.#buildInput(allowlist, sitematrix);
    if (input === undefined) {
      this._busy = false;
      this._error = STRINGS.noFileChosen;
      return;
    }
    const result = await ingest(input, {
      sitematrix,
      fetch: this.#fetch,
      allowlist,
      ...(this.maxBytes === null ? {} : { maxBytes: this.maxBytes }),
      ...(this.maxItems === null ? {} : { maxItems: this.maxItems }),
    });
    this._busy = false;
    if (!result.ok) {
      this._error = userMessage(result.error);
      return;
    }
    this._outcome = result.value;
  }

  async #buildInput(
    allowlist: string[],
    sitematrix: Sitematrix,
  ): Promise<IngestInput | undefined> {
    const form = this._form;
    const dbname = resolveDbname(form.dbname, allowlist, sitematrix);
    switch (this._mode) {
      case "manual":
        return { mode: "manual", text: form.manualText, dbname };
      case "swiki": {
        const file = this.#file;
        if (file === undefined) return undefined;
        return {
          mode: "swiki",
          bytes: new Uint8Array(await file.arrayBuffer()),
          filename: file.name,
          ...(dbname === "" ? {} : { dbname }),
        };
      }
      case "petscan":
        return { mode: "petscan", url: form.petscanUrl.trim() };
      case "sparql":
        return {
          mode: "sparql",
          dbname,
          endpoint: form.sparqlEndpoint.trim(),
          query: form.sparqlQuery,
        };
      case "quarry":
        return { mode: "quarry", url: form.quarryUrl.trim() };
    }
  }

  #setMode(mode: Mode): void {
    this._mode = mode;
    this._outcome = undefined;
    this._error = undefined;
  }

  #confirm(): void {
    const outcome = this._outcome;
    if (outcome === undefined) return;
    const resolve = this.#resolve;
    this.#resolve = undefined;
    this.#reject = undefined; // closing must not also reject
    // Close before dispatching: a host that calls open() from its
    // `selection` listener must get a fresh session, not one immediately
    // aborted by this session's close event.
    this.#dialog.close();
    this.dispatchEvent(
      new CustomEvent<Selection>("selection", {
        detail: outcome.selection,
        bubbles: true,
        composed: true,
      }),
    );
    resolve?.(outcome.selection);
  }

  #onClose(): void {
    this.#abort();
  }

  /**
   * Removal from the document is cancellation: the dialog leaves the top
   * layer, so the session can never complete. Rejecting here (and closing
   * the dialog) leaves a reconnected element free to open() again.
   */
  override disconnectedCallback(): void {
    super.disconnectedCallback();
    const dialog = this.renderRoot?.querySelector("dialog");
    if (dialog?.open) dialog.close();
    this.#abort();
  }

  #abort(): void {
    const reject = this.#reject;
    this.#resolve = undefined;
    this.#reject = undefined;
    reject?.(new DOMException("selection cancelled", "AbortError"));
  }

  override render(): TemplateResult {
    const allowlist = parseAllowlist(this.dbname);
    const projectIsUserInput =
      this._mode === "manual" || this._mode === "swiki" || this._mode === "sparql";
    const domains =
      allowlist.length > 0
        ? allowlist.map((dbname) => this.#sitematrix?.domainFor(dbname) ?? dbname)
        : (this.#sitematrix?.sites() ?? []).map((site) => site.domain);
    const outcome = this._outcome;

    return html`<dialog part="dialog" @close=${() => this.#onClose()}>
      <h2 part="title">${STRINGS.dialogTitle}</h2>
      <nav part="tabs">
        ${MODES.map(
          (mode) => html`<button
            part="tab"
            data-mode=${mode}
            aria-current=${this._mode === mode ? "true" : "false"}
            @click=${() => this.#setMode(mode)}
          >
            ${STRINGS.modeLabels[mode]}
          </button>`,
        )}
      </nav>
      <section part="form">
        ${renderForm(
          this._mode,
          this._form,
          projectIsUserInput && allowlist.length !== 1,
          domains,
          this.#callbacks,
        )}
      </section>
      ${this._error === undefined
        ? nothing
        : html`<p part="error" role="alert">${this._error}</p>`}
      ${outcome === undefined
        ? nothing
        : html`<p part="summary">
            ${STRINGS.ingestSummary(
              outcome.report.ingested,
              outcome.report.dropped,
              this.#sitematrix?.domainFor(outcome.selection.dbname) ?? outcome.selection.dbname,
            )}
          </p>`}
      <footer part="actions">
        <button part="cancel" @click=${() => this.#dialog.close()}>${STRINGS.cancel}</button>
        <button
          part="load"
          ?disabled=${this._busy || !this._ready}
          @click=${() => void this.#load()}
        >
          ${this._busy ? STRINGS.loading : STRINGS.load}
        </button>
        <button part="confirm" ?disabled=${outcome === undefined} @click=${() => this.#confirm()}>
          ${STRINGS.confirm}
        </button>
      </footer>
    </dialog>`;
  }
}
