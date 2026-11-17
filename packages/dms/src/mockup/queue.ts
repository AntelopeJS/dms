const queues = new Map<string, Promise<void>>();

/**
 * Runs `task` after every task already queued under `key`, whether those
 * succeeded or failed: one failure never holds the queue.
 */
export async function queued<Result>(
  key: string,
  task: () => Promise<Result>,
): Promise<Result> {
  const run = (queues.get(key) ?? Promise.resolve()).then(task);
  const tail = run.then(
    () => undefined,
    () => undefined,
  );
  queues.set(key, tail);
  try {
    return await run;
  } finally {
    if (queues.get(key) === tail) queues.delete(key);
  }
}
