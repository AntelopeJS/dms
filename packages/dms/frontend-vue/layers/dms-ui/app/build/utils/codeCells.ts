/**
 * Puts the caret in the first empty cell of a code entry (after a refused or
 * partial code), or in its first cell when every cell is filled.
 *
 * @param container Element holding the cells
 */
export function focusFirstEmptyCell(container: HTMLElement | null): void {
  const cells = [
    ...(container?.querySelectorAll<HTMLInputElement>("input") ?? []),
  ];
  (cells.find((cell) => !cell.value) ?? cells[0])?.focus();
}
