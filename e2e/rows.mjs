/**
 * The rows the journeys read from the data API's list answers: only the
 * fields a journey looks at.
 *
 * @typedef {{ _id: string, email: string, name?: string, isTenantOwner?: boolean, roleIds?: { _id: string }[] }} MemberRow
 * @typedef {{ _id: string, email: string, asTenantOwner?: boolean, roles_ids?: { _id: string }[] }} InviteRow
 * @typedef {{ _id: string, name: string, permissions?: string[] }} RoleRow
 * @typedef {{ _id: string, name: string, email: string }} UserRow
 * @typedef {{ _id: string, inviteCount?: number, memberCount?: number }} RoleOverviewRow
 * @typedef {{ id: string, state?: string }} StoreModule
 * @typedef {{ icon?: string, linkTo?: string, isRead?: boolean }} NotificationRow
 */

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>} Whether it is a JSON object, not an array, a primitive or `null`
 */
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @param {unknown} value
 * @returns {value is string}
 */
function isString(value) {
  return typeof value === "string";
}

/**
 * @param {unknown} value
 * @returns {value is number} Whether it is a finite number, the only kind JSON holds
 */
function isNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * @param {unknown} value
 * @returns {value is boolean}
 */
function isBoolean(value) {
  return typeof value === "boolean";
}

/**
 * @param {Record<string, unknown>} record
 * @param {string} key
 * @returns {unknown} The field the record itself holds, never one it inherits
 */
function own(record, key) {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

/**
 * @param {unknown} value
 * @param {(item: unknown) => boolean} isItem
 * @returns {boolean} Whether it is absent or a list whose items all pass
 */
function isAbsentOrListOf(value, isItem) {
  return value === undefined || (Array.isArray(value) && value.every(isItem));
}

/**
 * @param {unknown} value
 * @returns {boolean} Whether it is an object with a string `_id`
 */
function hasId(value) {
  return isRecord(value) && isString(own(value, "_id"));
}

/**
 * @param {unknown} value
 * @param {string} key
 * @param {(field: unknown) => boolean} isField
 * @returns {boolean} Whether the object holds the field absent or passing
 */
function optionally(value, key, isField) {
  return isRecord(value) && (own(value, key) === undefined || isField(own(value, key)));
}

/**
 * @param {unknown} value
 * @returns {value is MemberRow}
 */
export function isMemberRow(value) {
  return (
    hasId(value) &&
    isRecord(value) &&
    isString(own(value, "email")) &&
    optionally(value, "name", isString) &&
    optionally(value, "isTenantOwner", isBoolean) &&
    isAbsentOrListOf(own(value, "roleIds"), hasId)
  );
}

/**
 * @param {unknown} value
 * @returns {value is InviteRow}
 */
export function isInviteRow(value) {
  return (
    hasId(value) &&
    isRecord(value) &&
    isString(own(value, "email")) &&
    optionally(value, "asTenantOwner", isBoolean) &&
    isAbsentOrListOf(own(value, "roles_ids"), hasId)
  );
}

/**
 * @param {unknown} value
 * @returns {value is RoleRow}
 */
export function isRoleRow(value) {
  return hasId(value) && isRecord(value) && isString(own(value, "name")) && isAbsentOrListOf(own(value, "permissions"), isString);
}

/**
 * @param {unknown} value
 * @returns {value is UserRow}
 */
export function isUserRow(value) {
  return hasId(value) && isRecord(value) && isString(own(value, "name")) && isString(own(value, "email"));
}

/**
 * @param {unknown} value
 * @returns {value is RoleOverviewRow}
 */
export function isRoleOverviewRow(value) {
  return hasId(value) && optionally(value, "inviteCount", isNumber) && optionally(value, "memberCount", isNumber);
}

/**
 * @param {unknown} value
 * @returns {value is StoreModule}
 */
export function isStoreModule(value) {
  return isRecord(value) && isString(own(value, "id")) && optionally(value, "state", isString);
}

/**
 * @param {unknown} value
 * @returns {value is NotificationRow}
 */
export function isNotificationRow(value) {
  return isRecord(value) && optionally(value, "icon", isString) && optionally(value, "linkTo", isString) && optionally(value, "isRead", isBoolean);
}

/**
 * The rows a list answer holds under `key`. An answer with no such list
 * (an error answer, an empty body) holds no rows. A list that is present and
 * malformed is refused, so a journey never reads from a body it did not
 * expect.
 *
 * @template T
 * @param {unknown} body The answer's body
 * @param {string} key The field that holds the list
 * @param {(row: unknown) => row is T} isRow Whether an item is a row
 * @returns {T[]} The rows
 */
export function listIn(body, key, isRow) {
  const list = isRecord(body) ? own(body, key) : undefined;
  if (list === undefined || list === null) return [];
  if (!Array.isArray(list)) throw new Error(`${key} is not a list`);
  /** @type {unknown[]} */
  const items = list;
  return items.map((item, index) => {
    if (!isRow(item)) throw new Error(`${key}[${index}] is not the row the journey reads`);
    return item;
  });
}

/**
 * @template T
 * @param {unknown} body The answer's body
 * @param {(row: unknown) => row is T} isRow Whether an item is a row
 * @returns {T[]} The rows of a data API list answer, under `results`
 */
export function listOf(body, isRow) {
  return listIn(body, "results", isRow);
}

/**
 * @param {unknown} body The answer's body
 * @param {string} key
 * @returns {string | undefined} The string field, `undefined` when the body holds none
 */
export function stringIn(body, key) {
  const value = isRecord(body) ? own(body, key) : undefined;
  if (value === undefined || value === null) return undefined;
  if (!isString(value)) throw new Error(`${key} is not a string`);
  return value;
}

/**
 * @param {unknown} body The answer's body
 * @param {string} key
 * @returns {string} The string field; an answer without it is refused
 */
export function requiredStringIn(body, key) {
  const value = stringIn(body, key);
  if (value === undefined) throw new Error(`${key} is missing`);
  return value;
}

/**
 * @param {unknown} body The answer's body
 * @param {string} key
 * @returns {number | undefined} The number field, `undefined` when the body holds none
 */
export function numberIn(body, key) {
  const value = isRecord(body) ? own(body, key) : undefined;
  if (value === undefined || value === null) return undefined;
  if (!isNumber(value)) throw new Error(`${key} is not a number`);
  return value;
}

/**
 * @param {unknown} body The answer's body
 * @param {string} key
 * @returns {string[]} The list of strings under `key`, empty when the body holds none
 */
export function stringsIn(body, key) {
  const value = isRecord(body) ? own(body, key) : undefined;
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error(`${key} is not a list`);
  /** @type {unknown[]} */
  const items = value;
  return items.map((item, index) => {
    if (!isString(item)) throw new Error(`${key}[${index}] is not a string`);
    return item;
  });
}

/**
 * @param {unknown} body The answer's body
 * @returns {(string | undefined)[]} The dotted `path` of each validation issue; an answer that is not a list of issues holds none
 */
export function issuePaths(body) {
  if (!Array.isArray(body)) return [];
  /** @type {unknown[]} */
  const issues = body;
  return issues.map((issue) => {
    const path = isRecord(issue) ? own(issue, "path") : undefined;
    if (path === undefined || path === null) return undefined;
    if (!Array.isArray(path)) throw new Error("an issue path is not a list");
    /** @type {unknown[]} */
    const steps = path;
    return steps
      .map((step) => {
        if (!isString(step) && !isNumber(step)) throw new Error("an issue path step is not a string or a number");
        return String(step);
      })
      .join(".");
  });
}

/**
 * @template T
 * @param {unknown} body The answer's body
 * @param {(row: unknown) => row is T} isRow Whether an item is a row
 * @returns {T[]} The rows of an answer that is itself a list; any other answer holds none
 */
export function rowsOf(body, isRow) {
  if (!Array.isArray(body)) return [];
  /** @type {unknown[]} */
  const items = body;
  return items.map((item, index) => {
    if (!isRow(item)) throw new Error(`[${index}] is not the row the journey reads`);
    return item;
  });
}

/**
 * @param {unknown} body The answer's body
 * @param {string} key
 * @returns {boolean | undefined} The boolean field, `undefined` when the body holds none
 */
export function booleanIn(body, key) {
  const value = isRecord(body) ? own(body, key) : undefined;
  if (value === undefined || value === null) return undefined;
  if (!isBoolean(value)) throw new Error(`${key} is not a boolean`);
  return value;
}
