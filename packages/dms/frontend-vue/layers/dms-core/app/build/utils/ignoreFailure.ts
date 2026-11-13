/**
 * The handler of a failure the caller leaves unreported and unrecovered: the
 * work it guarded is optional, and its absence leaves the caller's state as
 * it was.
 *
 * @internal
 */
export function ignoreFailure(): void {
  return undefined;
}
