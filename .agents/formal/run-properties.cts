import fc from "fast-check";

/** The exit codes of a property check: it matches its record, a rule changed, or it could not run. */
export const EXIT = { ok: 0, changed: 1, tool: 2 } as const;

/** How many cases a run draws, and where it starts. */
export interface RunOptions {
  readonly seed: number;
  readonly numRuns: number;
}

/** One property of a formal target, run by {@link runProperties}. */
export interface PropertyCheck {
  readonly name: string;
  /** Runs the property and returns whether it broke, with its shrunk counterexample as one line when it did. */
  readonly run: (options: RunOptions) => { broke: false } | { broke: true; counterexample: string };
}

/** A string with every character outside printable ASCII written as a `\uXXXX` escape, so a control character or a Unicode space shows. */
function escapeText(text: string): string {
  return text.replace(/[^\x20-\x7e]/g, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

/**
 * A named fast-check property.
 *
 * @param name The rule name, one word, as `check.mjs` and SKILL.md print it.
 * @param property The property to check.
 */
export function rule<Ts extends unknown[]>(name: string, property: fc.IProperty<Ts>): PropertyCheck {
  return {
    name,
    run: (options) => {
      const details = fc.check(property, options);
      if (!details.failed) return { broke: false };
      const { errorInstance } = details;
      const thrown = errorInstance instanceof Error && !errorInstance.message.startsWith("Property failed by returning false");
      const error = thrown ? ` (throws ${errorInstance.message})` : "";
      return {
        broke: true,
        counterexample: `  counterexample ${escapeText(JSON.stringify(details.counterexample))}${error}, seed ${details.seed}, after ${details.numRuns} runs`,
      };
    },
  };
}

/** Where a run starts: one seed, so a run reproduces. */
const DEFAULT_SEED = 20261116;

/** How many cases each rule draws in a run: the CI configuration and `--full`. */
export interface RunSizes {
  readonly ci: number;
  readonly full: number;
}

/** The sizes of a target whose cases cost a few microseconds each. */
export const CHEAP_RUNS: RunSizes = { ci: 5000, full: 100000 };

/**
 * Checks every rule and prints one line each: `holds <rule>` for a rule that
 * holds, `finding <rule>` for a recorded finding that still breaks,
 * `BROKEN <rule>` for a rule that now breaks and `HOLDS <rule>` for a recorded
 * finding that no longer breaks, each broken one followed by its
 * shrunk counterexample. Sets the exit code to the `EXIT` codes.
 *
 * @param rules The rules in run order.
 * @param findings The rules that break on the code today, by name.
 * @param argv The arguments after the script: `--full` runs more cases, `--seed <n>` starts elsewhere, `--verbose` also prints the counterexample of each finding.
 * @param sizes How many cases each rule draws in a run.
 */
export function runProperties(rules: readonly PropertyCheck[], findings: ReadonlySet<string>, argv: readonly string[], sizes: RunSizes = CHEAP_RUNS): void {
  const full = argv.includes("--full");
  const seedAt = argv.indexOf("--seed");
  const seed = seedAt === -1 ? DEFAULT_SEED : Number(argv[seedAt + 1]);
  const known = new Set(["--full", "--verbose", "--seed", String(seed)]);
  if (Number.isNaN(seed) || argv.some((arg) => !known.has(arg))) {
    console.error("usage: node check.mjs [--full] [--verbose] [--seed <number>]");
    process.exitCode = EXIT.tool;
    return;
  }
  let changed = false;
  for (const { name, run } of rules) {
    const result = run({ seed, numRuns: full ? sizes.full : sizes.ci });
    const breaks = result.broke;
    const recorded = findings.has(name);
    if (breaks && recorded) console.log(`finding ${name}`);
    else if (!breaks && !recorded) console.log(`holds ${name}`);
    else {
      changed = true;
      console.log(`${breaks ? "BROKEN" : "HOLDS"} ${name}`);
    }
    if (result.broke && (!recorded || argv.includes("--verbose"))) console.log(result.counterexample);
  }
  process.exitCode = changed ? EXIT.changed : EXIT.ok;
}
