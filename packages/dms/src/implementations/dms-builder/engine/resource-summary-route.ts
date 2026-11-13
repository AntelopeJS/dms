import type { OpResult } from "@antelopejs/interface-dms-builder";
import { Node } from "ts-morph";
import { ensureNamedImport } from "./emit";
import { getExtendsCall } from "./literals";
import { commit, invalidConfig, notFound } from "./ops";
import { findResourceRecord } from "./resource-index";
import { openResource } from "./resource-ops";
import { TABLE_VIEW_MODULE } from "./resource-emit";
import { Transaction } from "./writable";

const SUMMARY_KEY = "summary";
const LIST_KEY = "list";

/**
 * Makes the resource's controller serve `summary`, the route a footer figure is computed by.
 *
 * A route map written as `TableViewRoutes.All`, or by name from elsewhere, is taken to serve it.
 * A literal map lacking it gains `summary: TableViewRoutes.Summary` when it serves the list, and
 * a map that serves no list is refused: a footer figure sums the rows the list shows.
 */
export function mountSummaryRoute(ref: string): OpResult {
  const record = findResourceRecord(ref);
  const opened = record && openResource(record);
  if (!opened) {
    return notFound(ref);
  }
  const routeMap = getExtendsCall(opened.dataApiClass)?.getArguments()[1];
  if (!routeMap || !Node.isObjectLiteralExpression(routeMap)) {
    return { ok: true, data: undefined, changes: [] };
  }
  const keys = routeMap.getProperties().map((property) => {
    if (Node.isSpreadAssignment(property)) {
      return `...${property.getExpression().getText()}`;
    }
    return Node.isPropertyAssignment(property) ||
      Node.isShorthandPropertyAssignment(property)
      ? property.getName()
      : undefined;
  });
  const spreadsAll = keys.some(
    (key) => key?.startsWith("...") && key.includes("All"),
  );
  if (spreadsAll || keys.includes(SUMMARY_KEY)) {
    return { ok: true, data: undefined, changes: [] };
  }
  if (!keys.includes(LIST_KEY)) {
    return invalidConfig(
      `${ref} serves no list route, so a footer figure has no rows to compute over; give it the list route with ConfigureResource first`,
    );
  }
  const transaction = new Transaction(opened.project);
  transaction.track(opened.dataApiFile);
  routeMap.addPropertyAssignment({
    name: SUMMARY_KEY,
    initializer: "TableViewRoutes.Summary",
  });
  ensureNamedImport(opened.dataApiFile, "TableViewRoutes", TABLE_VIEW_MODULE);
  return commit(transaction, undefined);
}
