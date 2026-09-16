import { Logging } from "@antelopejs/interface-core/logging";

export interface CapturedWarnings {
  messages: string[];
  restore: () => void;
}

/**
 * Collect what the code under test warns about, and put `Logging.Warn` back.
 *
 * The namespace function is swapped rather than a log listener registered: the
 * runner's own listener prints everything it sees, and a warning a test expects
 * is noise in the report.
 *
 * Always restore in a `finally`: the logger is module-wide, so a suite that
 * throws before restoring swallows every later suite's warnings.
 */
export function captureWarnings(): CapturedWarnings {
  const messages: string[] = [];
  const original = Logging.Warn;
  (Logging as { Warn: typeof Logging.Warn }).Warn = (...args: unknown[]) => {
    messages.push(String(args[0]));
  };
  return {
    messages,
    restore: () => {
      (Logging as { Warn: typeof Logging.Warn }).Warn = original;
    },
  };
}
