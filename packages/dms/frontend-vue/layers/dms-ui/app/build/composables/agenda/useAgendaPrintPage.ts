import { useStyleTag } from "@vueuse/core";

/** The sheet the agenda prints on: A4 landscape. */
export const AGENDA_PRINT_PAGE = "@page { size: A4 landscape; margin: 10mm; }";

/**
 * Sets the printed page to A4 landscape while an agenda is on screen. An `@page` rule cannot be tied to an
 * element, so the rule is a style the agenda adds when it mounts and removes when it unmounts: any other page
 * printed afterwards keeps its own sheet.
 */
export function useAgendaPrintPage(): void {
  useStyleTag(AGENDA_PRINT_PAGE, { id: "dms-agenda-print-page" });
}
