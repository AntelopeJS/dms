import {
  isBoolean,
  isNumber,
  isString,
  nullable,
  objectOf,
  oneOf,
} from "./json.mjs";

/**
 * What the `dms-control browser` client and the browser server post to each
 * other, checked on both sides.
 */

const isRoleName = { role: isString };
const isRoleOptions = { name: isString, exact: isBoolean };

/** @type {import("./json.mjs").Guard<import("./browser.mjs").BrowserRequest>} One browser action, as the client posts it */
export const isBrowserRequest = objectOf(
  { do: isString, account: isString, tab: isString, folder: isString },
  {
    target: objectOf(isRoleName, {
      ...isRoleOptions,
      nth: isNumber,
      within: objectOf(isRoleName, isRoleOptions),
    }),
    value: isString,
    key: isString,
    path: isString,
    state: oneOf(["attached", "detached", "visible", "hidden"]),
    timeoutMs: isNumber,
  },
);

/** @type {import("./json.mjs").Guard<import("./browser.mjs").Outcome>} What the server answers for one action */
export const isOutcome = objectOf({
  ok: isBoolean,
  url: isString,
  error: nullable(isString),
  aria: isString,
});
