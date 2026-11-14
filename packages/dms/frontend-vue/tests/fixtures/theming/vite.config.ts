import { resolve } from "node:path";
import vue from "@vitejs/plugin-vue";
import ui from "@nuxt/ui/vite";
import { defineConfig, runnerImport } from "vite";

const alias = {
  "#dms-core": resolve(import.meta.dirname, "../../../layers/dms-core"),
  "#dms-ui": resolve(import.meta.dirname, "../../../layers/dms-ui"),
};

export default defineConfig(async () => {
  const {
    module: { config },
  } = await runnerImport<typeof import("./config")>(
    resolve(import.meta.dirname, "config.ts"),
    { configFile: false, resolve: { alias } },
  );
  return {
    root: import.meta.dirname,
    publicDir: resolve(
      import.meta.dirname,
      process.env.THEME_DEFAULT
        ? "../../../layers/dms-layout/public"
        : "consumer/public",
    ),
    plugins: [
      vue(),
      ui({
        router: "inertia",
        ui: config.ui,
        dts: false,
        autoImport: {
          imports: [
            "vue",
            {
              [resolve(import.meta.dirname, "runtime.ts")]: ["useDmsAppConfig"],
            },
          ],
          dts: false,
        },
        components: { dirs: [], dts: false },
      }),
    ],
    resolve: { alias, dedupe: ["vue", "@nuxt/ui"] },
    define: {
      __THEME_DEFAULT__: Boolean(process.env.THEME_DEFAULT),
      __THEME_CSS_LAST__: Boolean(process.env.THEME_CSS_LAST),
    },
  };
});
