import { KeyValueList } from "@antelopejs/interface-dms/base";

/** One thing a visitor can try on a demo page, and what it shows. */
export interface DemoStep {
  /** What to do, in a few words ("Single-click a row"). */
  label: string;
  /** What happens, and which option does it. */
  text: string;
  /** A link that sets the page up for the step (`?record=req-3`). */
  to?: string;
}

/**
 * The "What to try" list a table demo shows above its tables: one row per
 * feature of the page, so a visitor sees what each block demonstrates.
 */
export function demoGuide(steps: DemoStep[]) {
  return KeyValueList({
    title: "What to try",
    items: steps.map(({ label, text, to }) => ({ label, value: text, to })),
  });
}
