import {
  type DataControllerInstance,
  GetDataControllerMeta,
} from "@antelopejs/interface-data-api";
import { Query } from "@antelopejs/interface-data-api/components";
import { evaluateRowActionRule } from "../utils";

export type RuleRow = globalThis.Parameters<typeof evaluateRowActionRule>[1];

export async function fetchRowForGuard(
  controller: DataControllerInstance,
  id: string,
  idField: string,
): Promise<RuleRow | undefined> {
  const controllerMetadata = GetDataControllerMeta(controller);
  const model = Query.GetModel(controller, controllerMetadata);
  const rows = await model.table.getAll([id], idField);
  const row: RuleRow | undefined = rows[0];
  return row;
}
