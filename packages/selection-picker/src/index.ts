import { SelectionPicker } from "./selection-picker.js";

export { SelectionPicker } from "./selection-picker.js";
export { SITEMATRIX_URL } from "./sitematrix-source.js";
export type { IngestOutcome, IngestReport, Mode } from "./ingest.js";
export type { PickerError, PickerErrorCode, PickerResult } from "./result.js";

/**
 * Two hosts, or two CDN tags, must not throw on the second definition.
 * Exported so the guard is testable — a bare re-import is an ESM cache hit
 * and would never re-run module-level code.
 */
export function defineSelectionPicker(): void {
  if (customElements.get("selection-picker") === undefined) {
    customElements.define("selection-picker", SelectionPicker);
  }
}

defineSelectionPicker();
