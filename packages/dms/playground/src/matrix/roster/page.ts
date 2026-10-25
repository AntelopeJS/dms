import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { Matrix } from "@antelopejs/interface-dms/base/matrix";
import type {
  MatrixColumn,
  MatrixLegendItem,
} from "@antelopejs/interface-dms/base/matrix-types";
import { demoGuide } from "../../table-view/guide";
import { MATRIX_API, matrixCategory } from "../category";
import { MAX_WORKING_DAYS, SHIFT_OPTIONS, WEEK } from "./data";

export const MATRIX_ROSTER_SLUG = "matrix-roster";
export const MATRIX_ROSTER_API = `${MATRIX_API}/roster`;

const DAY_WIDTH = 128;

const DAY_COLUMNS: MatrixColumn[] = WEEK.map((day) => ({
  id: day.id,
  label: day.label,
  description: day.isClosed ? "Magasins fermés" : undefined,
  kind: "select",
  options: SHIFT_OPTIONS,
  required: true,
  align: "center",
  width: DAY_WIDTH,
}));

// The legend reads the shifts' own labels and tones, so it cannot drift
// from the pills drawn in the cells.
const LEGEND: MatrixLegendItem[] = [
  ...SHIFT_OPTIONS.map(({ label, tone }) => ({ label, tone })),
  { label: "Magasins fermés", hatched: true },
];

@RegisterPage()
export class PageMatrixRoster extends PageController(
  MATRIX_ROSTER_SLUG,
  {
    displayName: "Roster (labels and tones)",
    icon: "i-ph-calendar-check",
    category: matrixCategory,
    order: 50,
    description:
      "A team's week: people by days, each cell a shift drawn as a toned pill and picked with a click, saved at once. The route refuses a sixth working day, per cell.",
  },
  DefaultLayout({
    fullWidth: true,
    headerActions: [
      {
        label: "Reset the week",
        icon: "i-ph-arrow-counter-clockwise",
        target: {
          type: "api",
          url: `${MATRIX_ROSTER_API}/reset`,
          method: "POST",
          successMessage: "The week is back as it started",
        },
      },
    ],
  }),
) {
  static guide = demoGuide([
    {
      label: "Click a cell, pick a shift",
      text: 'A select column whose options carry a tone and an icon: each value is drawn as its pill. editTrigger: "click", saveMode: "immediate": the pick is saved at once.',
    },
    {
      label: "Give Charlotte Hubert her Wednesday",
      text: `She already works ${MAX_WORKING_DAYS} days: the route refuses a sixth one and the cell keeps the error message (errors with a columnId). Set another day to Repos first.`,
    },
    {
      label: "Read the rows",
      text: "Each row's description is the role and the hours planned against the contract, recomputed by the route on each save; a row planned past its contract takes the warning tone.",
    },
    {
      label: "Hover, read the legend",
      text: "crossHighlight lights the person and the day; the legend is built from the options' tones; Sunday is closed (disabled cells, hatched). No totals: the values are labels.",
    },
    {
      label: "Fold a store",
      text: "The people are grouped by store (group, groups), each group collapsible; the footer line sums the hours per store, and each save answers it again with the rows (footer, rows).",
    },
  ]);

  static roster = Matrix({
    title: "Planning — semaine du 26 octobre",
    description:
      "Deux magasins, neuf personnes. Une semaine compte au plus 5 jours travaillés.",
    fetchUrl: `${MATRIX_ROSTER_API}/rows`,
    saveUrl: `${MATRIX_ROSTER_API}/save`,
    columns: DAY_COLUMNS,
    rowHeader: { label: "Équipe", width: 250 },
    editTrigger: "click",
    saveMode: "immediate",
    grouping: { collapsible: true },
    crossHighlight: true,
    legend: LEGEND,
  });
}
