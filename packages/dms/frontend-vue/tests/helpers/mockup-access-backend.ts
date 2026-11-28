import type { JsonValue } from "../../layers/dms-core/app/types/json";
import { isNumber } from "../../layers/dms-core/app/utils/type-check";
import type { MockupAccess } from "../../layers/dms-ui/app/entries/utils/mockup";
import { FAKE_AUTHOR, type FakeRequest } from "./mockup-notes-backend";

/** The viewer as the fake backend knows it by default: the platform owner, who edits. */
export const OWNER_ACCESS: MockupAccess = { role: "owner", ...FAKE_AUTHOR };

/** The viewer as a reviewer: a member whose role comments on mockups and edits nothing. */
export const REVIEWER_ACCESS: MockupAccess = {
  role: "reviewer",
  ...FAKE_AUTHOR,
};

/** The access route of any mockup. */
const ACCESS_URL = /^\/api\/mockup\/[^/]+\/access$/;

/** What the viewer calls `$authFetch` as: the fake backend's answer to a URL. */
export type FakeFetch = (
  url: string,
  init?: FakeRequest,
) => Promise<JsonValue | MockupAccess>;

/**
 * `authFetch` with the access route answered first, by the fake backend
 * itself: `access` as the viewer's role, or a refusal with that status. A
 * suite that replaces `authFetch` wholesale still draws the workbench, and
 * every other request keeps `authFetch`'s own promise, so the suites'
 * microtask budgets hold.
 */
export function accessFirst(
  authFetch: FakeFetch,
  access: MockupAccess | number,
): FakeFetch {
  return (url, init) => {
    if (!ACCESS_URL.test(url)) return authFetch(url, init);
    if (isNumber(access)) {
      return Promise.reject(
        Object.assign(new Error("refused"), { status: access }),
      );
    }
    return Promise.resolve(access);
  };
}
