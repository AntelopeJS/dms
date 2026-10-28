import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const frontend = fileURLToPath(
  new URL("../packages/dms/frontend-vue/", import.meta.url),
);
const require = createRequire(`${frontend}package.json`);
const { createServer } = await import(pathToFileURL(require.resolve("vite")));
const server = await createServer({
  root: frontend,
  configFile: false,
  resolve: {
    alias: {
      "#dms-core": `${frontend}layers/dms-core`,
      "#dms-ui": `${frontend}layers/dms-ui`,
    },
  },
  esbuild: { tsconfigRaw: "{}" },
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true },
  appType: "custom",
});

try {
  const { resolveNotificationTone: resolveOnServer } =
    await server.ssrLoadModule(
      fileURLToPath(
        new URL(
          "../packages/dms/src/utils/notification-tones.ts",
          import.meta.url,
        ),
      ),
    );
  const { resolveNotificationTone: resolveInInbox, unreadToneWith } =
    await server.ssrLoadModule(
      `${frontend}layers/dms-layout/app/entries/components/pages/settings/notification/notificationDisplay.ts`,
    );
  const row = (tone, isRead) => ({
    _id: "n1",
    userId: "u1",
    icon: "i-ph-bell",
    title: "",
    description: "",
    params: null,
    linkTo: null,
    isRead,
    categoryId: "system",
    tone,
    createdAt: "2026-10-09T10:00:00.000Z",
    updatedAt: "2026-10-09T10:00:00.000Z",
  });

  for (const tone of [
    null,
    "neutral",
    "primary",
    "success",
    "warning",
    "error",
  ]) {
    for (const isRead of [false, true]) {
      assert.equal(
        resolveInInbox(row(tone, isRead)),
        resolveOnServer(tone, isRead),
        `${tone}/${isRead}`,
      );
    }
  }
  assert.equal(resolveInInbox(row(null, false)), "primary");
  assert.equal(unreadToneWith("warning", row("error", false)), "error");
  assert.equal(unreadToneWith("error", row("success", false)), "error");
  assert.equal(unreadToneWith("success", row(null, false)), "primary");
  assert.equal(unreadToneWith(undefined, row("warning", false)), "warning");
  assert.equal(unreadToneWith("success", row("error", true)), "success");
  console.log(
    "PASS notification tones: 12 live parity cases and 6 inbox guards",
  );
} finally {
  await server.close();
}
