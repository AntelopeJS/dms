import path from "node:path";
import type {
  FrontendModuleFunction,
  FrontendModuleRegistration,
} from "@antelopejs/interface-dms/page";
import { MILLISECONDS_PER_SECOND } from "@antelopejs/interface-dms/utils/internal/time";
import {
  type Config,
  DEFAULT_ACCESS_TOKEN_LIFETIME,
  DEFAULT_API_BASE_URL,
  DEFAULT_CLIENT_BASE_URL,
} from "./config";
import { describeEnabledOAuthProviders } from "./routes/auth/oauth/config";

/**
 * Where the frontend server opens the session a credential change handed back
 * (`/auth/establish`). Declared as an establish endpoint of the DMS frontend.
 */
export const SESSION_HANDOFF_ENDPOINT = "/api/auth/session-handoff";

const DEFAULT_HOMEPAGE = "/";

/**
 * The DMS's own frontend module, from the DMS configuration alone: the
 * backend registers it with `AddFrontendModule`, and `@antelopejs/dms-frontend`
 * calls this same function (declared as `dmsFrontend` in package.json) on the
 * configuration it evaluates from `antelope.config.ts`.
 *
 * It checks nothing: the backend refuses a production configuration in
 * `construct()`, and a frontend build runs without the deployment's variables.
 *
 * @param config The `dms` module configuration
 */
export const frontendModule: FrontendModuleFunction<Config> = (
  config: Config,
): FrontendModuleRegistration => ({
  name: "@antelopejs/dms-frontend-vue",
  sourcePath: path.join(__dirname, "../frontend-vue"),
  renderer: { name: "vue", version: "3" },
  configKey: "dms",
  priority: 0,
  authEstablishEndpoints: [SESSION_HANDOFF_ENDPOINT],
  options: {
    baseURL: config.apiBaseUrl ?? DEFAULT_API_BASE_URL,
    clientBaseUrl: config.clientBaseUrl ?? DEFAULT_CLIENT_BASE_URL,
    mustValidateEmail: false,
    token: {
      maxAgeInSeconds:
        (config.auth?.accessTokenLifetime ?? DEFAULT_ACCESS_TOKEN_LIFETIME) /
        MILLISECONDS_PER_SECOND,
    },
    homepage: config.homepage ?? DEFAULT_HOMEPAGE,
    oauthProviders: describeEnabledOAuthProviders(config.auth?.oauth).map(
      ({ id, label, icon }) => ({ id, label, icon }),
    ),
  },
});
