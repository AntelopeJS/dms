import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { Form } from "@antelopejs/interface-dms/base/form";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { Matrix } from "@antelopejs/interface-dms/base/matrix";
import type { MatrixLegendItem } from "@antelopejs/interface-dms/base/matrix-types";
import { demoGuide } from "../../table-view/guide";
import { MATRIX_API, matrixCategory } from "../category";
import { ARTICLE, CURRENT_STORE, STORES, WAREHOUSE } from "./data";

export const MATRIX_STOCK_SLUG = "matrix-stock";
export const MATRIX_STOCK_API = `${MATRIX_API}/stock`;

const ORDER_URL = `${MATRIX_STOCK_API}/order?store={{row.id}}&size={{row.column}}`;
const ARTICLE_TITLE = `${ARTICLE.label} ${ARTICLE.code} — ${ARTICLE.colour}`;
const OUT_OF_RANGE = "Hors plage commandée";

const PICKUP_STORES = STORES.filter((store) => store.id !== WAREHOUSE).map(
  (store) => ({ value: store.id, label: `${store.id} — ${store.name}` }),
);

const STOCK_LEGEND: MatrixLegendItem[] = [
  { label: OUT_OF_RANGE, hatched: true },
  { label: "Sous le minimum", tone: "error" },
  { label: "Votre magasin", tone: "primary" },
];

const SALES_LEGEND: MatrixLegendItem[] = [
  { label: OUT_OF_RANGE, hatched: true },
  { label: "4 paires ou plus", tone: "success" },
];

// The drawer a cell opens: the form reads the cell's store and size from
// its URL ({{row.id}}, {{row.column}}), and posts the request to the same.
const orderForm = Form({
  kind: "action",
  fetchUrl: ORDER_URL,
  submitUrl: ORDER_URL,
  submitUrlMethod: "POST",
  submitLabel: "Envoyer la demande",
  successMessage: "Demande envoyée au magasin donneur",
  fields: [
    {
      id: "article",
      label: "Article",
      type: new DefaultDataTypes.StringType(),
      readonly: true,
    },
    {
      id: "size",
      label: "Pointure",
      type: new DefaultDataTypes.StringType(),
      readonly: true,
    },
    {
      id: "donor",
      label: "Magasin donneur",
      type: new DefaultDataTypes.StringType(),
      readonly: true,
    },
    {
      id: "available",
      label: "Paires disponibles chez le donneur",
      type: new DefaultDataTypes.NumberType(),
      readonly: true,
    },
    {
      id: "customer",
      label: "Nom de la cliente",
      type: new DefaultDataTypes.StringType({ placeholder: "Mme Dupont" }),
      required: true,
    },
    {
      id: "phone",
      label: "Téléphone",
      description: "Ou un e-mail : il faut l'un des deux pour la prévenir.",
      type: new DefaultDataTypes.PhoneType(),
    },
    {
      id: "email",
      label: "E-mail",
      type: new DefaultDataTypes.EmailType(),
    },
    {
      id: "pickupStore",
      label: "Retrait en magasin",
      type: new DefaultDataTypes.SelectType({ items: PICKUP_STORES }),
    },
    {
      id: "note",
      label: "Note pour le magasin donneur",
      type: new DefaultDataTypes.StringType({ textarea: true, rows: 3 }),
    },
  ],
});

@RegisterPage()
export class PageMatrixStock extends PageController(
  MATRIX_STOCK_SLUG,
  {
    displayName: "Stock by size and store (read-only)",
    icon: "i-ph-sneaker",
    category: matrixCategory,
    order: 30,
    description:
      "One article's stock as a grid of stores by sizes, with totals both ways, a cross highlight, hatched sizes the store did not order, alert cells and annex columns; a click on a cell opens an order form for a customer. Under it, the sales of the last 30 days on the same axes.",
  },
  DefaultLayout({ fullWidth: true }),
) {
  static guide = demoGuide([
    {
      label: "Hover a cell",
      text: "crossHighlight lights its store and its size; the Total column and the Total row add the sizes (totals), the annex columns are left out (excludeFromTotals on Min.).",
    },
    {
      label: "Fold a region",
      text: 'grouping: { groupByField: "region", collapsible, count, subtotals }: the stores grouped by region (a hidden column, listed sorted by the route), each header counting its stores and carrying its own size sums next to the grand totals.',
    },
    {
      label: "Read the hatched and red cells",
      text: `disabled cells are sizes the store did not order (hatched, "${OUT_OF_RANGE}"); a cell under the store's minimum carries the error tone. The legend explains both.`,
    },
    {
      label: `Find ${CURRENT_STORE}`,
      text: "The current store's row carries a tone (row tone), its description says so.",
    },
    {
      label: "Click a cell with stock",
      text: 'cellAction: a drawer with a Form "Commander pour une cliente", prefilled from {{row.id}} (the store) and {{row.column}} (the size). Send it without a name: the route refuses the field; on an empty cell it answers that no pair is left.',
    },
    {
      label: "Compare with the sales",
      text: "A second Matrix on the same page, same axes, read from the same route (?view=sales): best sellers in success, the warehouse row read-only (it does not sell).",
    },
  ]);

  static stock = Matrix({
    title: `Stock — ${ARTICLE_TITLE}`,
    description: "Paires en stock aujourd'hui, par magasin et par pointure.",
    fetchUrl: `${MATRIX_STOCK_API}/rows?view=stock`,
    rowHeader: { label: "Magasin", width: 220 },
    totals: { rows: true, columns: true, label: "Total" },
    grouping: {
      groupByField: "region",
      collapsible: true,
      count: true,
      subtotals: true,
    },
    crossHighlight: true,
    legend: STOCK_LEGEND,
    cellAction: {
      type: "drawer",
      direction: "right",
      size: "md",
      title: "Commander pour une cliente",
      description:
        "La paire est réservée chez le magasin donneur et envoyée au magasin de retrait.",
      component: orderForm,
    },
  });

  static sales = Matrix({
    title: `Ventes 30 jours — ${ARTICLE_TITLE}`,
    description: "Paires vendues du 25 septembre au 24 octobre.",
    fetchUrl: `${MATRIX_STOCK_API}/rows?view=sales`,
    rowHeader: { label: "Magasin", width: 220 },
    totals: { rows: true, columns: true, label: "Total" },
    crossHighlight: true,
    legend: SALES_LEGEND,
  });
}
