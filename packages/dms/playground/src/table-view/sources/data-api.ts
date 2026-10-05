import { Controller } from "@antelopejs/interface-api";
import {
  DataController,
  RegisterDataController,
} from "@antelopejs/interface-data-api";
import {
  Access,
  AccessMode,
  Listable,
  Mandatory,
  ModelReference,
  Sortable,
} from "@antelopejs/interface-data-api/metadata";
import { Model } from "@antelopejs/interface-database-decorators";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import {
  Column,
  TableViewRoutes,
} from "@antelopejs/interface-dms/base/table-view";
import { RoadmapFeature, RoadmapFeatureModel } from "./database";

/** The roadmap features of the "Sources, order & cards" demo, in hand order. */
@RegisterDataController()
export class roadmapFeatureDataAPI extends DataController(
  RoadmapFeature,
  TableViewRoutes.All,
  Controller("/api/playground/roadmap-features"),
) {
  @ModelReference()
  @Model(RoadmapFeatureModel)
  declare model: RoadmapFeatureModel;

  @Listable()
  @Access(AccessMode.ReadOnly)
  declare _id: string;

  @Listable()
  @Column({ name: "Feature", type: new DefaultDataTypes.StringType() })
  @Mandatory("new", "edit")
  @Access(AccessMode.ReadWrite)
  declare name: string;

  @Listable()
  @Column({ name: "Area", type: new DefaultDataTypes.StringType() })
  @Access(AccessMode.ReadWrite)
  declare area: string;

  @Listable()
  @Column({ name: "Owner", type: new DefaultDataTypes.StringType() })
  @Access(AccessMode.ReadWrite)
  declare owner: string;

  @Listable()
  @Column({ name: "Votes", type: new DefaultDataTypes.NumberType({ min: 0 }) })
  @Access(AccessMode.ReadWrite)
  declare votes: number;

  @Listable()
  @Sortable()
  @Column({
    name: "Position",
    type: new DefaultDataTypes.NumberType(),
    isVisible: false,
  })
  @Access(AccessMode.ReadWrite)
  declare position: number;
}
