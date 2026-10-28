import { Logging } from "@antelopejs/interface-core/logging";

const warnedReasons = new WeakMap<WeakKey, Set<string>>();

export function warnOnceFor(
  source: WeakKey,
  reason: string,
  message: string,
): void {
  let reasons = warnedReasons.get(source);
  if (!reasons) {
    reasons = new Set();
    warnedReasons.set(source, reasons);
  }
  if (reasons.has(reason)) return;
  reasons.add(reason);
  Logging.Warn(message);
}
