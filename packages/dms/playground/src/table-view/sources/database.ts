import {
  BasicDataModel,
  Field,
  Fixture,
  Index,
  RegisterTable,
  Table,
} from "@antelopejs/interface-database-decorators";
import { CORE_SCHEMA_NAME } from "@antelopejs/interface-dms/constants";

const tableName = "playground_roadmap_features";

const FEATURES = [
  { name: "Saved views", area: "Tables", owner: "@antelopejs/dms", votes: 42 },
  {
    name: "Grouped display",
    area: "Tables",
    owner: "@antelopejs/dms",
    votes: 31,
  },
  { name: "Bulk actions", area: "Tables", owner: "@antelopejs/dms", votes: 28 },
  { name: "Instant save", area: "Forms", owner: "@antelopejs/dms", votes: 24 },
  {
    name: "Code field",
    area: "Forms",
    owner: "@antelopejs/dms-database",
    votes: 17,
  },
  {
    name: "Secret field",
    area: "Forms",
    owner: "@antelopejs/dms-mailing",
    votes: 9,
  },
];

function seedFeatures() {
  return FEATURES.map((feature, index) => ({
    _id: `feature-${index + 1}`,
    ...feature,
    position: index + 1,
  }));
}

@RegisterTable(tableName, CORE_SCHEMA_NAME)
@Fixture(seedFeatures)
export class RoadmapFeature extends Table {
  @Field("string") declare _id: string;
  @Field("string") declare name: string;
  @Field("string") declare area: string;
  @Field("string") declare owner: string;
  @Field("number") declare votes: number;
  @Index() @Field("number") declare position: number;
}

export class RoadmapFeatureModel extends BasicDataModel(
  RoadmapFeature,
  tableName,
) {}
