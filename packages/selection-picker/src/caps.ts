import { selectionJsonBytes, type Selection } from "@audiodude/selection-core";
import { pickerErr, pickerOk, type PickerResult } from "./result.js";
import { STRINGS } from "./strings.js";

export interface Caps {
  /** UTF-8 byte length of the canonical Selection JSON (decision record #9). */
  maxBytes?: number;
  maxItems?: number;
}

/**
 * Host policy: caps reject; they never truncate a Selection. Authority is
 * decision record #9 and task 03 — SPEC §8 itself sets no size limits.
 */
export function checkCaps(selection: Selection, caps: Caps): PickerResult<void> {
  if (caps.maxItems !== undefined && selection.pages.length > caps.maxItems) {
    return pickerErr(
      "MAX_ITEMS_EXCEEDED",
      STRINGS.maxItemsExceeded(selection.pages.length, caps.maxItems),
    );
  }
  if (caps.maxBytes !== undefined) {
    const bytes = selectionJsonBytes(selection);
    if (bytes > caps.maxBytes) {
      return pickerErr("MAX_BYTES_EXCEEDED", STRINGS.maxBytesExceeded(bytes, caps.maxBytes));
    }
  }
  return pickerOk(undefined);
}
