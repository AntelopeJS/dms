import path from "node:path";
import type {
  FrontendModuleFunction,
  FrontendModuleRegistration,
} from "@antelopejs/interface-dms/page";
import { WEBHOOK_SIGNATURE_HEADER, WEBHOOKS_API } from "./hooks/webhooks";

/**
 * The playground's Vue frontend layer: what `start` registers with
 * `AddFrontendModule`, and what `@antelopejs/dms-frontend` builds, as the
 * package's `dmsFrontend`.
 */
export const frontendModule: FrontendModuleFunction = () =>
  ({
    name: "playground-frontend",
    sourcePath: path.join(__dirname, "../frontend-vue"),
    renderer: { name: "vue", version: "3" },
    priority: 100,
    options: { dmsI18nAppLayer: true },
    publicEndpoints: [
      {
        path: `${WEBHOOKS_API}/*`,
        methods: ["POST"],
        headers: [WEBHOOK_SIGNATURE_HEADER],
      },
    ],
  }) satisfies FrontendModuleRegistration;
