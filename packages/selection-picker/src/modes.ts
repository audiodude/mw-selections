import type { Mode } from "./ingest.js";
import { STRINGS } from "./strings.js";

/** One way the picker can build a Selection, as a host may present it. */
export interface PickerMode {
  name: Mode;
  /** Short tab label, e.g. "PetScan". */
  label: string;
  /** One sentence a host can show beside the label. */
  description: string;
}

const ORDER: readonly Mode[] = ["manual", "swiki", "petscan", "sparql", "quarry"];

/**
 * The widget's static catalogue of input modes, in tab order. It does not
 * reflect host configuration: the `dbname` allowlist restricts projects, not
 * modes. Frozen so a host cannot mutate what the tab bar renders.
 */
export const PICKER_MODES: readonly PickerMode[] = Object.freeze(
  ORDER.map((name) =>
    Object.freeze({
      name,
      label: STRINGS.modeLabels[name],
      description: STRINGS.modeDescriptions[name],
    }),
  ),
);
