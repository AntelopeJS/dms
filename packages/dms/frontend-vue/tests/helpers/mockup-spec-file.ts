import { vi } from "vitest";
import type { MockupSpecDocument } from "../../layers/dms-ui/app/entries/utils/mockupSpec";

const ENDPOINT = "/api/mockup/demo/spec";

/** The spec `spec.json` holds before any test writes it. */
export function initialSpec(): MockupSpecDocument {
  return {
    version: 1,
    pages: [
      {
        id: "orders",
        title: "Orders",
        tree: [{ type: "KpiCard", options: { title: "Revenue" } }],
      },
    ],
  };
}

/** The backend's `spec.json`: its content, its digest, and the writes it took. */
export class FakeSpecFile {
  spec = initialSpec();
  version = 1;
  refuse: { path: string; message: string } | undefined;
  /** How many of the next writes fail with a server error before one lands. */
  failures = 0;
  /** How many of the next writes land, then answer a server error. */
  lostAnswers = 0;
  /** How many of the next reads fail with a server error. */
  readFailures = 0;
  /** Whether `spec.json` holds a document the spec parser rejects. */
  isInvalid = false;
  /** Holds the answer of the next write that lands until it settles. */
  answerGate: Promise<void> | undefined;
  readonly writes: Array<{ spec: MockupSpecDocument; digest?: string }> = [];

  get digest(): string {
    return `d${this.version}`;
  }

  writeFromOutside(spec: MockupSpecDocument): void {
    this.spec = spec;
    this.version += 1;
  }

  readonly fetch = vi.fn(
    async (
      url: string,
      init?: {
        method?: string;
        body?: { spec: MockupSpecDocument; digest?: string };
      },
    ) => {
      if (url !== ENDPOINT) throw new Error(`unexpected ${url}`);
      if (init?.method !== "PUT" || !init.body) {
        if (this.readFailures > 0) {
          this.readFailures -= 1;
          throw Object.assign(new Error("unavailable"), { status: 503 });
        }
        const spec = this.isInvalid
          ? { version: 1, pages: "broken" }
          : structuredClone(this.spec);
        return { spec, digest: this.digest };
      }
      if (this.failures > 0) {
        this.failures -= 1;
        throw Object.assign(new Error("boom"), { status: 500 });
      }
      this.writes.push(structuredClone(init.body));
      if (init.body.digest !== this.digest) {
        throw Object.assign(new Error("conflict"), { status: 409 });
      }
      if (this.refuse) return { ok: false, errors: [this.refuse] };
      this.spec = structuredClone(init.body.spec);
      this.version += 1;
      const gate = this.answerGate;
      this.answerGate = undefined;
      if (gate) await gate;
      if (this.lostAnswers > 0) {
        this.lostAnswers -= 1;
        throw Object.assign(new Error("bad gateway"), { status: 502 });
      }
      return { ok: true, digest: this.digest };
    },
  );
}
