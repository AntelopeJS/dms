import {
  Controller,
  HTTPResult,
  Parameter,
  Post,
} from "@antelopejs/interface-api";
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

const HTTP_NOT_FOUND = 404;
const JSON_TYPE = "application/json";

/** The roadmap features of the "Rows ordered by hand" demo, in hand order. */
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

  /** The cards' "Upvote" button, a custom row action placed by the card. */
  @Post("upvote")
  async upvote(@Parameter("id", "query") id: string) {
    const feature = await this.model.get(id);
    if (!feature) {
      throw new HTTPResult(
        HTTP_NOT_FOUND,
        JSON.stringify({ message: "Feature not found" }),
        JSON_TYPE,
      );
    }
    await this.model.update(id, { votes: feature.votes + 1 });
    return { votes: feature.votes + 1 };
  }
}
