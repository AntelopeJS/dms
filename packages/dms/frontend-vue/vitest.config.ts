import { defineConfig } from "vitest/config";
import { resolve } from "node:path";
import vue from "@vitejs/plugin-vue";
import ui from "@nuxt/ui/vite";

export default defineConfig({
  plugins: [
    vue(),
    ui({
      router: "inertia",
      dts: false,
      autoImport: false,
      components: false,
    }),
  ],
  resolve: {
    alias: {
      "#dms-core": resolve(__dirname, "layers/dms-core"),
      "#dms-ui": resolve(__dirname, "layers/dms-ui"),
      "#dms-layout": resolve(__dirname, "layers/dms-layout"),
      // Mocked by the tests that reach it: the engine runs in the generated
      // application, not under Vitest.
      "#dms/frontend-module": resolve(
        __dirname,
        "node_modules/@antelopejs/dms-frontend/templates/vue/frontend-module.ts",
      ),
      // The server routes run under Vitest through the renderer's own router
      // (`module-testing.mjs`), so their import resolves to its definitions.
      "#dms/server": resolve(
        __dirname,
        "node_modules/@antelopejs/dms-frontend/templates/vue/server-module.ts",
      ),
      "#shortcuts-aggregated": resolve(
        __dirname,
        "tests/fixtures/aggregatedShortcuts.ts",
      ),
    },
  },
  esbuild: {
    tsconfigRaw: "{}",
  },
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
