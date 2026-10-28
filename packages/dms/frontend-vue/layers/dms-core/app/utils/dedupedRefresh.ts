/**
 * Run an async task at most once concurrently against a shared holder object.
 *
 * Concurrent callers receive the exact same in-flight promise; once it settles
 * the slot is cleared so the next call starts a fresh run. Used to coalesce
 * parallel session refreshes (the realtime stream, $authFetch and route
 * middleware can all hit a 401 at the same moment) into a single
 * /api/auth/refresh call, so competing refreshes never rotate the refresh
 * token out from under each other and log the user out.
 */
export function runDeduped<T>(
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Public holder slots may contain unrelated values. A Promise<T>-valued dictionary would reject existing holder objects rather than validate the selected slot.
  holder: Record<PropertyKey, unknown>,
  key: PropertyKey,
  task: () => Promise<T>,
): Promise<T> {
  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- The selected slot is historically trusted without validation, including truthy non-promises. Inference cannot prove Promise<T>; adding validation would change malformed-holder behavior.
  const existing = holder[key] as Promise<T> | null | undefined;
  if (existing) {
    return existing;
  }

  let started: Promise<T>;
  try {
    started = task();
  } catch (error) {
    started = Promise.reject(error);
  }

  const promise = started.finally(() => {
    holder[key] = null;
  });
  holder[key] = promise;
  return promise;
}
