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
  holder: Record<PropertyKey, unknown>,
  key: PropertyKey,
  task: () => Promise<T>,
): Promise<T> {
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
