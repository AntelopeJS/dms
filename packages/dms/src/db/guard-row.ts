import {
  type DataControllerInstance,
  GetDataControllerMeta,
} from "@antelopejs/interface-data-api";
import { Query } from "@antelopejs/interface-data-api/components";

export async function fetchRowForGuard(
  controller: DataControllerInstance,
  id: string,
  idField: string,
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- The row model.table.getAll answers for the id field the guard names, interface-data-api's RowFields, of whichever data controller's table it reads.
): Promise<Record<string, unknown> | undefined> {
  const controllerMetadata = GetDataControllerMeta(controller);
  const model = Query.GetModel(controller, controllerMetadata);
  const rows = await model.table.getAll([id], idField);
  return rows[0];
}
