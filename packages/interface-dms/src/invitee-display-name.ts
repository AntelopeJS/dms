/**
 * Combined display name of an invitee, or `undefined` when the invite carries
 * no name.
 */
export function inviteeDisplayName(
  firstname?: string | null,
  lastname?: string | null,
): string | undefined {
  const name = [firstname, lastname]
    .filter((part) => !!part)
    .join(" ")
    .trim();
  return name || undefined;
}
