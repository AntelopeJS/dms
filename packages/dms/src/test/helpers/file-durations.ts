import { writeFileSync } from "node:fs";
import { relative, sep } from "node:path";

/**
 * Seconds of wall clock per test file. The time between two consecutive test
 * ends goes to the later test's file, which counts its own hooks, and the time
 * from the last test end to the end of the run goes to the last file.
 */
export class FileDurations {
  private readonly milliseconds = new Map<string, number>();
  private mark: number;
  private last: string | undefined;

  constructor(start: number) {
    this.mark = start;
  }

  /** Attributes the time since the previous test end to `file`. */
  testEnded(file: string, now: number): void {
    this.add(file, now - this.mark);
    this.mark = now;
    this.last = file;
  }

  /** Attributes the time since the last test end to the last file. */
  finish(now: number): Record<string, number> {
    if (this.last !== undefined) this.add(this.last, now - this.mark);
    return Object.fromEntries(
      [...this.milliseconds]
        .sort(([left], [right]) => (left < right ? -1 : 1))
        .map(([file, milliseconds]) => [file, milliseconds / 1000]),
    );
  }

  private add(file: string, milliseconds: number): void {
    this.milliseconds.set(
      file,
      (this.milliseconds.get(file) ?? 0) + milliseconds,
    );
  }
}

/** The path of a test file from the working folder, with `/` separators. */
export function testFilePath(file: string): string {
  return relative(process.cwd(), file).split(sep).join("/");
}

const output = process.env.DMS_TEST_DURATIONS;

if (output) {
  let durations = new FileDurations(performance.now());

  before(() => {
    durations = new FileDurations(performance.now());
  });

  afterEach(function (this: Mocha.Context) {
    const file = this.currentTest?.file;
    if (file !== undefined) {
      durations.testEnded(testFilePath(file), performance.now());
    }
  });

  after(() => {
    const seconds = durations.finish(performance.now());
    writeFileSync(output, `${JSON.stringify(seconds, null, 2)}\n`);
  });
}
