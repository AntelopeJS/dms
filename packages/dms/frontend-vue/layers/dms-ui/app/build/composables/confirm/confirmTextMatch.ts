/**
 * Whether what the user typed confirms a type-to-confirm dialog: the text,
 * trimmed, equal to `confirmText` — ignoring case when asked, in the
 * reader's locale rules (`acme` matches `ACME`).
 */
export function isConfirmTextMatch(
  typed: string,
  confirmText: string,
  isCaseInsensitive = false,
): boolean {
  const text = typed.trim();
  if (!isCaseInsensitive) return text === confirmText;
  return (
    text.localeCompare(confirmText, undefined, { sensitivity: "accent" }) === 0
  );
}
