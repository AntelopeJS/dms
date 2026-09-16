export interface TrailingDeduper {
  run(task: () => Promise<void>): Promise<void>;
}

/**
 * Share an in-flight async task between concurrent callers, and queue exactly
 * one trailing run for the calls made while it was running.
 *
 * Plain deduplication is wrong for invalidations: a caller reacting to fresh
 * data (a permission change, a menu resync) must not settle on the response of
 * a run that started before it, so it gets its own pass. Bursts still collapse
 * into a single trailing run.
 *
 * A deduper coordinates the callers that share it, and the tasks it runs close
 * over their caller's state: never share one across DMS app instances, or a
 * server-rendered request would run a task bound to another request. Inside a
 * composable, reach for {@link useTrailingDeduper}.
 */
export function createTrailingDeduper(): TrailingDeduper {
  let inFlight: Promise<void> | null = null;
  let trailing: Promise<void> | null = null;

  const run = (task: () => Promise<void>): Promise<void> => {
    if (!inFlight) {
      inFlight = task().finally(() => {
        inFlight = null;
      });
      return inFlight;
    }
    if (!trailing) {
      trailing = inFlight
        .catch(() => undefined)
        .then(() => {
          trailing = null;
          return run(task);
        });
    }
    return trailing;
  };

  return { run };
}
