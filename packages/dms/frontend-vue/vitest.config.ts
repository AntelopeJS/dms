import { defineConfig } from "vitest/config";
import { resolve } from "node:path";
import vue from "@vitejs/plugin-vue";
import ui from "@nuxt/ui/vite";
import { backendBoundary } from "./build/backend-boundary.ts";

export default defineConfig({
  plugins: [
    backendBoundary(),
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
      "#dms-auth": resolve(__dirname, "layers/dms-auth"),
      "#dms-onboarding": resolve(__dirname, "layers/dms-onboarding"),

      "#dms/frontend-module": resolve(
        __dirname,
        "node_modules/@antelopejs/dms-frontend/templates/vue/frontend-module.ts",
      ),

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
