// A resolver runs inside /dms/sitelayout, on the critical path of every page
// load: one that hangs would hold the layout of every user of the tenant. Long
// enough for a database round trip, short enough that a stuck resolver costs a
// slow page rather than an unusable dashboard.
const RESOLVER_TIMEOUT_MS = 2000;

/**
 * Rejects when `work` does not settle within the resolver budget.
 *
 * @param subject Names the resolver in the rejection, e.g. `category "pages"`.
 */
export function withResolverTimeout<T>(
  work: Promise<T>,
  subject: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new Error(
          `resolver did not answer within ${RESOLVER_TIMEOUT_MS}ms (${subject})`,
        ),
      );
    }, RESOLVER_TIMEOUT_MS);
    work.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}
