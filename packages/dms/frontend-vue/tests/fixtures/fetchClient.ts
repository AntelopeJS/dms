import { fetchClientMock } from "./unusedApi";

/** A fetch client whose callable answers each call with `respond`'s result; `raw`, `native` and `create` stay unanswered mocks. */
export function fetchClient<Args extends unknown[]>(
  respond: (url: string, ...rest: Args) => unknown,
) {
  return fetchClientMock().mockImplementation(respond);
}
