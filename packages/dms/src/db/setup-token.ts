import { Logging } from "@antelopejs/interface-core/logging";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { UserModel } from "@antelopejs/interface-dms/auth/db";
import { getConfig } from "../config";
import { resolveConfiguredSetupToken } from "../config/startup-config";
import { SetupTokenModel } from "./models";

const ONBOARDING_PATH = "/onboarding";

/** Whether the instance has any user yet: the owner registers first. */
export async function instanceHasUsers(): Promise<boolean> {
  const users = await GetModel(UserModel).table.slice(0, 1).run();
  return users.length > 0;
}

/**
 * Makes the instance ready for its first owner, at every start. Without a
 * user it keeps the setup token in the database, from `DMS_SETUP_TOKEN` or
 * generated once for all replicas, and logs the wizard address again, with
 * the token in development only. With a user it drops any token, so none is
 * logged or accepted.
 *
 * @param dev Whether the project runs in development mode
 * @throws When `DMS_SETUP_TOKEN` is too short to protect the instance
 */
export async function announceSetupToken(dev: boolean): Promise<void> {
  const tokens = GetModel(SetupTokenModel);
  if (await instanceHasUsers()) {
    await tokens.clear();
    return;
  }

  const configured = resolveConfiguredSetupToken();
  const token = await tokens.ensure(configured);
  const address = `${getConfig().clientBaseUrl ?? ""}${ONBOARDING_PATH}`;
  const shown = dev && !configured ? token : "<DMS_SETUP_TOKEN>";
  Logging.Warn(
    `[DMS] No owner exists yet. To create it, open ${address}?token=${shown}`,
  );
}
