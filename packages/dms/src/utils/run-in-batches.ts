/**
 * Runs asynchronous work with bounded concurrency.
 *
 * @param items Values to process.
 * @param batchSize Maximum number of concurrent workers.
 * @param worker Work performed for each value.
 */
export async function runInBatches<T>(
  items: T[],
  batchSize: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  if (batchSize < 1) throw new RangeError("Batch size must be positive.");
  let nextIndex = 0;
  const runWorker = async (): Promise<void> => {
    while (nextIndex < items.length) {
      const item = items[nextIndex++];
      await worker(item);
    }
  };
  const workerCount = Math.min(batchSize, items.length);
  await Promise.all(Array.from({ length: workerCount }, runWorker));
}
