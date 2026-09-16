import { GetModel } from "@antelopejs/interface-database-decorators";
import { expect } from "chai";
import { SystemStateModel } from "../../../db";
import type { SystemState } from "../../../db/tables";

const OTHER_ROW_ID = "system-state-model-other-row";
const FIXTURE_ROW_ID = "system-state-model-fixture";

describe("[unit] system state model — updateConfig addresses one row", () => {
  let model: SystemStateModel;
  let current: SystemState;

  before(async () => {
    model = GetModel(SystemStateModel);
    if (!(await model.getConfig())) {
      await model.insert({
        _id: FIXTURE_ROW_ID,
        has_onboarded: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
    const config = await model.getConfig();
    expect(config, "the fixture row").to.not.equal(undefined);
    current = config as SystemState;
    await model.table
      .insert({
        _id: OTHER_ROW_ID,
        has_onboarded: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .run();
  });

  after(async () => {
    await model.table.get(OTHER_ROW_ID).delete().run();
    await model.updateConfig({
      _id: current._id,
      has_onboarded: false,
      createdAt: current.createdAt,
      updatedAt: current.updatedAt,
    });
  });

  it("writes the row it was read from, and no other", async () => {
    await model.updateConfig({
      _id: current._id,
      has_onboarded: true,
      createdAt: current.createdAt,
      updatedAt: current.updatedAt,
    });

    const updated = await model.table.get(current._id).run();
    const other = await model.table.get(OTHER_ROW_ID).run();
    expect(updated?.has_onboarded).to.equal(true);
    expect(other?.has_onboarded).to.equal(false);
  });
});
