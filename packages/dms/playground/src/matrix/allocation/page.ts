import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import {
  Matrix,
  type MatrixColumn,
  type MatrixLegendItem,
} from "@antelopejs/interface-dms/base/matrix";
import { demoGuide } from "../../table-view/guide";
import { MATRIX_API, matrixCategory } from "../category";
import { ARTICLE, SIZES } from "../stock/data";
import { DELIVERY_NUMBER, RECEIVED, RECEIVED_TOTAL } from "./data";

export const MATRIX_ALLOCATION_SLUG = "matrix-allocation";
export const MATRIX_ALLOCATION_API = `${MATRIX_API}/allocation`;

const MAX_PAIRS = 999;
const SIZE_WIDTH = 76;

const LEGEND: MatrixLegendItem[] = [
  { label: "Hors plage commandée", hatched: true },
  { label: "Votre magasin", tone: "primary" },
];

function sizeColumns(describe: (size: string) => string): MatrixColumn[] {
  return SIZES.map((size) => ({
    id: size,
    label: size,
    description: describe(size),
    kind: "number",
    integer: true,
    min: 0,
    max: MAX_PAIRS,
    align: "center",
    width: SIZE_WIDTH,
  }));
}

@RegisterPage()
export class PageMatrixAllocation extends PageController(
  MATRIX_ALLOCATION_SLUG,
  {
    displayName: "Reception allocation (targets and fills)",
    icon: "i-ph-arrows-split",
    category: matrixCategory,
    order: 40,
    description:
      "A delivery of 24 pairs split between the warehouse and the stores: integer cells typed like a spreadsheet, the stock in each cell's corner, totals that must match the pairs received before saving, and fills the route computes. Under it, a stock correction showing the old quantity struck through.",
  },
  DefaultLayout({
    fullWidth: true,
    headerActions: [
      {
        label: "Reset the demo",
        icon: "i-ph-arrow-counter-clockwise",
        target: {
          type: "api",
          url: `${MATRIX_ALLOCATION_API}/reset`,
          method: "POST",
          successMessage: "Both grids are back as they started",
        },
      },
    ],
  }),
) {
  static guide = demoGuide([
    {
      label: "Click a cell and type a number",
      text: 'editTrigger: "click" and typeToEdit: typing on a selected cell starts editing with that digit; integers from 0 (integer, min). The small figure is the stock already there (hint).',
    },
    {
      label: "Watch the totals",
      text: `targets: each size has the pairs received (38: ${RECEIVED["38"]}), ${RECEIVED_TOTAL} in all. A Total cell that differs turns red, the message says why, and the save waits until every one matches (blockSave).`,
    },
    {
      label: "Use a fill",
      text: 'fillActions post the rows shown and apply the { changes } the route answers, staged like typed edits: "Tout à l\'entrepôt", "Selon les stocks minimum" (tops each store up to its minimum, current store first), "Effacer".',
    },
    {
      label: "Save the split",
      text: 'saveMode: "staged" without review: one save writes it all. The route checks the totals again and refuses a size that does not add up.',
    },
    {
      label: "Correct a counted stock",
      text: 'The second grid saves each cell as it is left (saveMode: "immediate"). A cell whose count differs from the system shows the system quantity struck through (cells[size].previous).',
    },
    {
      label: "Start over",
      text: "The header's Reset the demo puts both grids back.",
    },
  ]);

  static allocation = Matrix({
    title: `Réception de ${RECEIVED_TOTAL} paires — ${ARTICLE.label}`,
    description: `Livraison ${DELIVERY_NUMBER} : répartissez les paires reçues entre l'entrepôt et les magasins. Le petit chiffre de chaque case est le stock actuel.`,
    fetchUrl: `${MATRIX_ALLOCATION_API}/rows`,
    saveUrl: `${MATRIX_ALLOCATION_API}/save`,
    columns: sizeColumns((size) => `${RECEIVED[size] ?? 0} reçue(s)`),
    rowHeader: { label: "Magasin", width: 220 },
    editTrigger: "click",
    typeToEdit: true,
    saveMode: "staged",
    totals: { rows: true, columns: true, label: "Total réparti" },
    targets: {
      columns: RECEIVED,
      total: RECEIVED_TOTAL,
      blockSave: true,
      message:
        "Chaque pointure doit être répartie en entier : le total réparti doit égaler les paires reçues.",
    },
    fillActions: [
      {
        id: "warehouse",
        label: "Tout à l'entrepôt",
        icon: "i-ph-warehouse",
        url: `${MATRIX_ALLOCATION_API}/fill/warehouse`,
      },
      {
        id: "minimum",
        label: "Selon les stocks minimum",
        icon: "i-ph-scales",
        url: `${MATRIX_ALLOCATION_API}/fill/minimum`,
      },
      {
        id: "clear",
        label: "Effacer",
        icon: "i-ph-eraser",
        url: `${MATRIX_ALLOCATION_API}/fill/clear`,
      },
    ],
    crossHighlight: true,
    legend: LEGEND,
  });

  static correction = Matrix({
    title: "Correction de stock (avant / après)",
    description:
      "Inventaire du 24 octobre : le chiffre barré est le stock du système, l'autre celui compté. Chaque case est enregistrée dès qu'on la quitte.",
    fetchUrl: `${MATRIX_ALLOCATION_API}/correction/rows`,
    saveUrl: `${MATRIX_ALLOCATION_API}/correction/save`,
    columns: sizeColumns(() => "compté"),
    rowHeader: { label: "Magasin", width: 220 },
    editTrigger: "click",
    typeToEdit: true,
    saveMode: "immediate",
    totals: { rows: true, columns: true, label: "Total" },
    legend: [
      { label: "Hors plage commandée", hatched: true },
      { label: "Écart d'inventaire", tone: "warning" },
    ],
  });
}
