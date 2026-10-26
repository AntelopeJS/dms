import { Category } from "@antelopejs/interface-dms/page";
import { componentsSection } from "../sections";

/**
 * Right after the Matrix (35), before the Form (40): the other block built
 * around editing in place, by time instead of by cell.
 */
export const agendaCategory = Category("agenda", {
  displayName: "Agenda",
  icon: "i-ph-calendar-dots",
  order: 36,
  category: componentsSection,
});

/** The URL of an Agenda demo page, from the dashboard root. */
export function agendaPagePath(slug: string): string {
  return `/agenda/${slug}`;
}

/** The root of the demos' API routes. */
export const AGENDA_API = "/api/playground/agenda";
