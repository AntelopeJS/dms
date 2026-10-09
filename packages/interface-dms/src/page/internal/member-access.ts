import type { MemberAccess } from "../types";

/**
 * Whether `memberAccess` opens the entry that declares it to every member.
 *
 * @internal
 */
export function opensToMembers(
  memberAccess: MemberAccess | undefined,
): boolean {
  return memberAccess === true || memberAccess === "self";
}

/**
 * The `memberAccess` an entry takes from its parent: only `true` passes on,
 * since `"self"` opens the parent alone.
 *
 * @internal
 */
export function inheritedMemberAccess(
  parentMemberAccess: MemberAccess | undefined,
): true | undefined {
  return parentMemberAccess === true ? true : undefined;
}
