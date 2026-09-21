import { html, LitElement, nothing, type PropertyValues } from "lit";
import { STRINGS } from "./strings.js";

/** Internal light-DOM control: styles and exposed parts belong to the picker. */
export class WikiProjectInput extends LitElement {
  static properties = {
    value: { type: String },
    projects: { attribute: false },
    _open: { state: true },
    _active: { state: true },
  };

  declare value: string;
  declare projects: readonly string[];
  private _open = false;
  private _active = -1;
  #matches: readonly string[] = [];

  constructor() {
    super();
    this.value = "";
    this.projects = [];
  }

  protected createRenderRoot() { return this; }

  protected willUpdate(changed: PropertyValues<this>): void {
    if (changed.has("value") || changed.has("projects")) {
      const query = this.value.trim().toLowerCase();
      this.#matches = query === "" ? this.projects
        : this.projects.filter((name) => name.toLowerCase().includes(query));
    }
  }

  #change(value: string): void {
    this.value = value;
    this.dispatchEvent(new CustomEvent<string>("project-change", { detail: value }));
  }

  #choose(value: string): void {
    this._open = false;
    this._active = -1;
    this.#change(value);
  }

  #key(event: KeyboardEvent, matches: readonly string[]): void {
    if (event.key === "Escape" && this._open) {
      event.preventDefault();
      event.stopPropagation(); // Dismiss suggestions, not the containing dialog.
      this._open = false;
      this._active = -1;
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      this._open = true;
      this._active = event.key === "ArrowDown"
        ? Math.min(this._active + 1, matches.length - 1)
        : Math.max(this._active - 1, -1);
      void this.updateComplete.then(() => {
        this.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
      });
    } else if (event.key === "Enter" && this._open) {
      event.preventDefault();
      const choice = matches[this._active] ?? (matches.length === 1 ? matches[0] : undefined);
      if (choice !== undefined) this.#choose(choice);
    }
  }

  protected render() {
    const query = this.value.trim().toLowerCase();
    const matches = this.#matches;
    const active = this._open && matches[this._active] !== undefined ? this._active : -1;
    return html`<label>
      <span>${STRINGS.wikiprojectLabel}</span>
      <input
        part="wikiproject"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded=${String(this._open)}
        aria-controls="sp-wikiproject-results"
        aria-activedescendant=${active < 0 ? nothing : `sp-wikiproject-option-${active}`}
        autocomplete="off"
        placeholder=${STRINGS.wikiprojectPlaceholder}
        .value=${this.value}
        @input=${(event: Event) => {
          const value = (event.target as HTMLInputElement).value;
          this._open = value.trim() !== "";
          this._active = -1;
          this.#change(value);
        }}
        @focus=${() => { this._open = query !== ""; }}
        @blur=${() => { this._open = false; this._active = -1; }}
        @keydown=${(event: KeyboardEvent) => this.#key(event, matches)}
      />
    </label>
    ${this._open ? html`<div part="wikiproject-popup">
      <ul id="sp-wikiproject-results" role="listbox" aria-label=${STRINGS.wikiprojectLabel}>
        ${matches.map((name, index) => html`<li
          id=${`sp-wikiproject-option-${index}`}
          role="option"
          aria-selected=${String(index === active)}
          @mousedown=${(event: MouseEvent) => event.preventDefault()}
          @click=${() => this.#choose(name)}
        >${name}</li>`)}
      </ul>
      ${matches.length === 0 ? html`<p role="status">${STRINGS.wikiprojectNoMatches}</p>` : nothing}
    </div>` : nothing}`;
  }
}
