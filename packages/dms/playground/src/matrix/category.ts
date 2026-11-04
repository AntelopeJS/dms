import { Category } from "@antelopejs/interface-dms/page";
import { componentsSection } from "../sections";

/**
 * Right after the Table View (30), before the Form (40): the grid edited in
 * place is read next to the table it complements.
 */
export const matrixCategory = Category("matrix", {
  displayName: "Matrix",
  icon: "i-ph-grid-nine",
  order: 35,
  category: componentsSection,
});

/** The URL of a Matrix demo page, from the dashboard root. */
export function matrixPagePath(slug: string): string {
  return `/matrix/${slug}`;
}

/** The root of the demos' API routes. */
export const MATRIX_API = "/api/playground/matrix";
