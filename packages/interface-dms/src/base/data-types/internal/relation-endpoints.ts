import {
  type ControllerClass,
  ControllerMeta,
} from "@antelopejs/interface-api";
import { GetMetadata } from "@antelopejs/interface-core";
import { DataAPIMeta } from "@antelopejs/interface-data-api/metadata";
import { Form } from "../../form-schema";
import { HttpMethod } from "../../types";

/** @internal The select endpoint of a related controller, read from its own route. */
export function selectUrl(controller: ControllerClass) {
  const { location } = GetMetadata(controller, ControllerMeta);
  const { select } = GetMetadata(controller, DataAPIMeta).endpoints;
  return `${location}/${select.endpoint || "select"}`;
}

/** @internal The form that adds a row to a related controller, when it has one. */
export function relationAddOptions(controller: ControllerClass) {
  if (!GetMetadata(controller, DataAPIMeta).endpoints.new) return undefined;
  const tableViews: typeof import("../../table-view/meta") = require("../../table-view/meta");
  const tableViewMeta = GetMetadata(controller, tableViews.TableViewMeta);
  const fields = tableViewMeta.getFormFields("new");
  if (fields.length === 0) return undefined;
  const { location } = GetMetadata(controller, ControllerMeta);
  return {
    addForm: Form({
      fields,
      submitUrl: `${location}/new`,
      submitUrlMethod: HttpMethod.post,
      kind: "create",
    }).serializeSync(),
    addPermissionIds: tableViewMeta.actionPermissionIds("add"),
  };
}
