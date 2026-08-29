import { parseSelectionJson } from "./json.js";
import type { Sitematrix } from "./sitematrix.js";
import { err, ok, type Result } from "./types.js";

/**
 * The storing-system structural gate (SPEC §8): accept or reject, never fix.
 * Everything parseSelectionJson checks, plus dbname validity against the
 * sitematrix. Size policy is deliberately not covered — the spec sets no
 * limits; callers enforce their own caps with selectionJsonBytes.
 */
export function validateSelection(
  bytes: Uint8Array | string,
  sitematrix: Sitematrix,
): Result<void> {
  const parsed = parseSelectionJson(bytes);
  if (!parsed.ok) return parsed;
  if (!sitematrix.isValidDbname(parsed.value.dbname)) {
    return err("DBNAME_INVALID", `dbname ${JSON.stringify(parsed.value.dbname)} is not in the sitematrix`);
  }
  return ok(undefined);
}
