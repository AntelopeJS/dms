const DEFAULT_RESOLVER_TIMEOUT_MS = 2000;

let resolverTimeoutMs = DEFAULT_RESOLVER_TIMEOUT_MS;

/**
 * Overrides the resolver budget until the returned function is called.
 *
 * The tests that hang a resolver on purpose use it so they wait a fraction of
 * the production budget rather than all of it.
 */
export function overrideResolverTimeout(timeoutMs: number): () => void {
  const previous = resolverTimeoutMs;
  resolverTimeoutMs = timeoutMs;
  return () => {
    resolverTimeoutMs = previous;
  };
}

/**
 * Rejects when `work` does not settle within the resolver budget.
 *
 * @param subject Names the resolver in the rejection, e.g. `category "pages"`.
 */
export function withResolverTimeout<T>(
  work: Promise<T>,
  subject: string,
): Promise<T> {
  const timeoutMs = resolverTimeoutMs;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new Error(`resolver did not answer within ${timeoutMs}ms (${subject})`),
      );
    }, timeoutMs);
    work.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}
