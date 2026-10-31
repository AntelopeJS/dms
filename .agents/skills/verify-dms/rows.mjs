/**
 * The rows the journeys read from the data API's list answers: only the
 * fields a journey looks at.
 *
 * @typedef {{ _id: string, email: string, name?: string, isTenantOwner?: boolean, roleIds?: { _id: string }[] }} MemberRow
 * @typedef {{ _id: string, email: string, asTenantOwner?: boolean, roles_ids?: { _id: string }[] }} InviteRow
 * @typedef {{ _id: string, name: string, permissions?: string[] }} RoleRow
 * @typedef {{ _id: string, name: string, email: string }} UserRow
 */

export {};
