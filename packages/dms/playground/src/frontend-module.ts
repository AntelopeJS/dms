import path from "node:path";
import type { AddFrontendModuleOptions } from "@antelopejs/interface-dms/page";
import { WEBHOOK_SIGNATURE_HEADER, WEBHOOKS_API } from "./hooks/webhook-route";

/**
 * The playground's Vue frontend: the backend registers it with
 * `AddFrontendModule`, and `ajs dms dev`, `build` and `start` call this same
 * function, declared as `dmsFrontend` in package.json, since they read the
 * project rather than the backend's registrations. Without the declaration
 * the frontend leaves the playground's components out. Its public endpoint is
 * a provider's webhook, reachable through the frontend server without a
 * session or a same-site Origin (see hooks/webhooks.ts).
 */
export function frontendModule(): AddFrontendModuleOptions {
  return {
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
  };
}
