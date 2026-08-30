import type { ErrorCode } from "@audiodude/selection-core";

/**
 * Core's codes (which include the 16 fixture-registry codes and four
 * fetch-layer codes) plus the four policy codes only this package can
 * produce. Because this is a superset, every core `Result` is assignable to
 * `PickerResult` without conversion.
 */
export type PickerErrorCode =
  | ErrorCode
  | "DBNAME_NOT_ALLOWED"
  | "MAX_BYTES_EXCEEDED"
  | "MAX_ITEMS_EXCEEDED"
  | "URL_INVALID";

export interface PickerError {
  code: PickerErrorCode;
  /** Diagnostic text; user-facing copy comes from strings.ts's userMessage. */
  message: string;
}

export type PickerResult<T> = { ok: true; value: T } | { ok: false; error: PickerError };

export function pickerOk<T>(value: T): PickerResult<T> {
  return { ok: true, value };
}

export function pickerErr(
  code: PickerErrorCode,
  message: string,
): { ok: false; error: PickerError } {
  return { ok: false, error: { code, message } };
}
