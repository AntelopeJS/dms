import { Controller, Parameter } from "@antelopejs/interface-api";
import {
  DataController,
  RegisterDataController,
} from "@antelopejs/interface-data-api";
import {
  Access,
  AccessMode,
  Listable,
  ModelReference,
  ModifierKey,
} from "@antelopejs/interface-data-api/metadata";
import {
  LocalizationModifier,
  Model,
} from "@antelopejs/interface-database-decorators";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import {
  Column,
  TableViewRoutes,
} from "@antelopejs/interface-dms/base/table-view";
import { Task, TaskModel } from "../database";

// Dedicated controller over the shared task table: the gate bypass is a
// controller-level opt-out, so scoping it here keeps /api/task fully gated.
@RegisterDataController()
export class gateDemoInvoiceAPI extends DataController(
  Task,
  TableViewRoutes.All,
  Controller("/api/gate-demo-invoice"),
) {
  @ModelReference()
  @Model(TaskModel)
  declare model: TaskModel;

  @Parameter("x-content-language", "header")
  @ModifierKey(LocalizationModifier)
  declare language: string;

  @Listable()
  @Access(AccessMode.ReadOnly)
  declare _id: string;

  @Listable()
  @Column({
    name: "Reference",
    type: new DefaultDataTypes.StringType(),
    description: "Invoice reference",
  })
  @Access(AccessMode.ReadOnly)
  declare name: string;

  @Listable()
  @Column({
    name: "Amount",
    type: new DefaultDataTypes.PriceType({ min: 0 }),
    description: "Invoice amount",
  })
  @Access(AccessMode.ReadOnly)
  declare price: number;
}
