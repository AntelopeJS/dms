import { Logging } from "@antelopejs/interface-core/logging";

export interface CapturedMessages {
  messages: string[];
  restore: () => void;
}

type LogLevel = "Warn" | "Error";

function capture(level: LogLevel): CapturedMessages {
  const messages: string[] = [];
  const logger = Logging as Record<LogLevel, (...args: unknown[]) => void>;
  const original = logger[level];
  logger[level] = (...args: unknown[]) => {
    messages.push(String(args[0]));
  };
  return {
    messages,
    restore: () => {
      logger[level] = original;
    },
  };
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
export function captureWarnings(): CapturedMessages {
  return capture("Warn");
}

/** Collect what the code under test reports as an error. See {@link captureWarnings}. */
export function captureErrors(): CapturedMessages {
  return capture("Error");
}
