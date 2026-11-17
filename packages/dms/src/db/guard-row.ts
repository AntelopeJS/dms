import {
  type DataControllerInstance,
  GetDataControllerMeta,
} from "@antelopejs/interface-data-api";
import { Query } from "@antelopejs/interface-data-api/components";
import type { StoredRow } from "@antelopejs/interface-data-api/metadata";

export async function fetchRowForGuard(
  controller: DataControllerInstance,
  id: string,
  idField: string,
): Promise<StoredRow | undefined> {
  const controllerMetadata = GetDataControllerMeta(controller);
  const model = Query.GetModel(controller, controllerMetadata);
  const rows = await model.table.getAll([id], idField).run();
  return rows[0];
}
