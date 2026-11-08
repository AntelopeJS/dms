/**
 * Where a sign-in that found no workspace for the account goes: the page a
 * module serves on `/auth/no-workspace`, holding the tenant assignment, or
 * the core screen when no module serves it, so the person never lands on
 * "Page not found".
 */
import { defineComponent } from "vue";
import { beforeEach, describe, expect, it } from "vitest";
import { setupFrontendModules } from "#dms/frontend-module";
import { noWorkspaceRoute } from "../layers/dms-auth/app/build/utils/noWorkspaceRoute";

const ASSIGNMENT = { token: "assignment-token", provider: "google" };

async function serveModulePages(paths: string[]): Promise<void> {
  await setupFrontendModules([
    {
      name: "workspace-signup",
      options: {},
      module: {
        setup(sdk) {
          for (const path of paths)
            sdk.registerPage(path, defineComponent({ render: () => null }));
        },
      },
    },
  ]);
}

beforeEach(async () => {
  await setupFrontendModules([]);
});

describe("the route after a sign-in that found no workspace", () => {
  it("is the core screen, without the token, when no module serves /auth/no-workspace", async () => {
    await serveModulePages(["auth/pricing"]);

    expect(noWorkspaceRoute(ASSIGNMENT)).toEqual({
      path: "/auth/not-a-member",
    });
  });

  it("is the module page, holding the assignment, when a module serves /auth/no-workspace", async () => {
    await serveModulePages(["auth/no-workspace"]);

    expect(noWorkspaceRoute(ASSIGNMENT)).toEqual({
      path: "/auth/no-workspace",
      query: ASSIGNMENT,
    });
  });
});
