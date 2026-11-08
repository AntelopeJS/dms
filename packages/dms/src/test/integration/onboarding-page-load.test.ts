import { GetModel } from "@antelopejs/interface-database-decorators";
import { UserModel } from "@antelopejs/interface-dms/auth/db";
import {
  Hook,
  RegisterHook,
  UnregisterHook,
} from "@antelopejs/interface-dms/hooks";
import { assert, expect } from "chai";
import { SetupTokenModel, SystemStateModel } from "../../db";
import { resetDatabase } from "../helpers/db";
import { createClient } from "../helpers/http";

const HTTP_OK = 200;
const SETUP_TOKEN = "a-setup-token-of-24-chars";
const PLATFORM_NAME = "Platform Alice";
const LANGUAGE = "fr";

const registration = {
  firstName: "Alice",
  lastName: "Admin",
  email: "alice@bootstrap.test",
  password: "Bootstrap1!",
  setupToken: SETUP_TOKEN,
  platformName: PLATFORM_NAME,
  language: LANGUAGE,
};

async function seedUnclaimedInstance(): Promise<void> {
  await resetDatabase();
  await GetModel(SystemStateModel).insert({
    has_onboarded: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await GetModel(SetupTokenModel).ensure(SETUP_TOKEN);
}

/** Holds every `Hook.MEMBER_BEING_ADDED` call until {@link release}. */
function holdMemberBeingAdded() {
  const entered = Promise.withResolvers<void>();
  const released = Promise.withResolvers<void>();
  const hold = async () => {
    entered.resolve();
    await released.promise;
  };
  RegisterHook(Hook.MEMBER_BEING_ADDED, hold);
  return {
    entered: entered.promise,
    release: () => {
      released.resolve();
      UnregisterHook(Hook.MEMBER_BEING_ADDED, hold);
    },
  };
}

describe("[integration] onboarding register and a page load", () => {
  beforeEach(seedUnclaimedInstance);
  after(async () => {
    await resetDatabase();
    await GetModel(SystemStateModel).insert({
      has_onboarded: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  it("completes the register when a page load lands after the owner insert", async () => {
    const held = holdMemberBeingAdded();
    const client = createClient();
    try {
      const register = client.post("/api/onboarding/register", registration);
      await held.entered;

      const pageLoad = await client.get("/api/onboarding/informations");
      held.release();
      const answer = await register;

      expect(pageLoad.data).to.deep.equal({ has_onboarded: true });
      expect(answer.status, JSON.stringify(answer.data)).to.equal(HTTP_OK);
      const state = await GetModel(SystemStateModel).getConfig();
      assert.isDefined(state, "the system state row");
      expect(state.platform_name).to.equal(PLATFORM_NAME);
      expect(state.default_language).to.equal(LANGUAGE);
      const owners = await GetModel(UserModel).getOwners();
      expect(owners.map((user) => user.email)).to.deep.equal([
        registration.email,
      ]);
    } finally {
      held.release();
    }
  });
});
