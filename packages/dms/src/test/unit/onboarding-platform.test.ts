import { GetModel } from "@antelopejs/interface-database-decorators";
import { assert, expect } from "chai";
import { getConfig } from "../../config";
import { SystemStateModel } from "../../db";
import type { SystemState } from "../../db/tables";
import {
  PublicOnboardingController,
  PublicSystemStateController,
} from "../../routes";

const FIXTURE_ROW_ID = "onboarding-platform-fixture";
const PLATFORM_NAME = "Acme back office";
const DEFAULT_LANGUAGE = "fr";

interface SystemStateMeta {
  title: string;
}

interface SystemStateView {
  meta: SystemStateMeta;
}

type StateOverrides = Partial<
  Pick<SystemState, "has_onboarded" | "platform_name" | "default_language">
>;

function withModel<T extends object>(prototype: T, model: SystemStateModel): T {
  const controller: T = Object.create(prototype);
  Object.defineProperty(controller, "model", { value: model });
  return controller;
}

const NO_PLATFORM_NAME = "";

function stateWith(base: SystemState, overrides: StateOverrides): SystemState {
  return {
    _id: base._id,
    has_onboarded: overrides.has_onboarded ?? base.has_onboarded,
    platform_name:
      overrides.platform_name ?? base.platform_name ?? NO_PLATFORM_NAME,
    default_language: overrides.default_language ?? base.default_language,
    createdAt: base.createdAt,
    updatedAt: base.updatedAt,
  };
}

async function readState(model: SystemStateModel): Promise<SystemState> {
  const state = await model.getConfig();
  assert.isDefined(state, "the system state row");
  return state;
}

describe("[unit] onboarding — platform details", () => {
  let model: SystemStateModel;
  let original: SystemState;

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
    original = await readState(model);
  });

  afterEach(async () => {
    await model.updateConfig(stateWith(original, {}));
  });

  it("records the platform name and language when onboarding completes", async () => {
    await model.updateConfig(stateWith(original, { has_onboarded: false }));
    const controller = withModel(PublicOnboardingController.prototype, model);

    await controller["completeOnboarding"]({
      platformName: PLATFORM_NAME,
      language: DEFAULT_LANGUAGE,
    });

    const state = await readState(model);
    expect(state.has_onboarded).to.equal(true);
    expect(state.platform_name).to.equal(PLATFORM_NAME);
    expect(state.default_language).to.equal(DEFAULT_LANGUAGE);
  });

  it("titles the platform with its onboarding name over the configured one", async () => {
    await model.updateConfig(
      stateWith(original, { platform_name: PLATFORM_NAME }),
    );
    const controller = withModel(PublicSystemStateController.prototype, model);

    const view: SystemStateView = await controller.getSystemState();

    expect(view.meta.title).to.equal(PLATFORM_NAME);
  });

  it("falls back to the configured meta title without an onboarding name", async () => {
    await model.updateConfig(
      stateWith(original, { platform_name: NO_PLATFORM_NAME }),
    );
    const controller = withModel(PublicSystemStateController.prototype, model);

    const view: SystemStateView = await controller.getSystemState();

    expect(view.meta.title).to.equal(getConfig().meta?.title || "");
  });
});
