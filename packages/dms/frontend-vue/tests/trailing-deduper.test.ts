import { describe, expect, it, vi } from "vitest";
import { createTrailingDeduper } from "../layers/dms-core/app/utils/trailingDeduper";

function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = () => res();
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("createTrailingDeduper", () => {
  it("runs a trailing pass for a call made while one is in flight", async () => {
    const first = deferred();
    const runs = [first.promise, Promise.resolve()];
    const task = vi.fn(() => runs.shift()!);
    const deduper = createTrailingDeduper();

    const inFlight = deduper.run(task);
    // The invalidation lands while the first run is still pending.
    const queued = deduper.run(task);
    expect(task).toHaveBeenCalledTimes(1);

    first.resolve();
    await inFlight;
    await queued;

    expect(task).toHaveBeenCalledTimes(2);
  });

  it("collapses a burst into a single trailing pass", async () => {
    const first = deferred();
    const runs = [first.promise, Promise.resolve()];
    const task = vi.fn(() => runs.shift()!);
    const deduper = createTrailingDeduper();

    const inFlight = deduper.run(task);
    const queued = [deduper.run(task), deduper.run(task), deduper.run(task)];

    first.resolve();
    await inFlight;
    await Promise.all(queued);

    expect(task).toHaveBeenCalledTimes(2);
  });

  it("still runs the trailing pass when the in-flight one fails", async () => {
    const first = deferred();
    const runs = [first.promise, Promise.resolve()];
    const task = vi.fn(() => runs.shift()!);
    const deduper = createTrailingDeduper();

    const inFlight = deduper.run(task).catch(() => undefined);
    const queued = deduper.run(task);

    first.reject(new Error("network down"));
    await inFlight;
    await queued;

    expect(task).toHaveBeenCalledTimes(2);
  });

  it("starts a fresh run once nothing is in flight", async () => {
    const task = vi.fn(async () => undefined);
    const deduper = createTrailingDeduper();

    await deduper.run(task);
    await deduper.run(task);

    expect(task).toHaveBeenCalledTimes(2);
  });
});
