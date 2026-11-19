import { GetModel } from "@antelopejs/interface-database-decorators";
import { z } from "zod";
import { SetupTokenModel, SystemStateModel } from "../../db";
import { resetDatabase } from "./db";
import { createClient } from "./http";
import { parseBody } from "./parse-body";

const InformationsBody = z.object({ has_onboarded: z.boolean() });

/** An empty database whose system state says the platform is not onboarded, and the setup token that opens it when one is given. */
export async function seedUnclaimedInstance(
  setupToken?: string,
): Promise<void> {
  await resetDatabase();
  await GetModel(SystemStateModel).insert({
    has_onboarded: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  if (setupToken) await GetModel(SetupTokenModel).ensure(setupToken);
}

/** What `GET /api/onboarding/informations` tells the frontend. */
export async function hasOnboarded(): Promise<boolean> {
  const response = await createClient().get("/api/onboarding/informations");
  return parseBody(InformationsBody, response).has_onboarded;
}
