import { resolve } from "node:path";
import vue from "@vitejs/plugin-vue";
import ui from "@nuxt/ui/vite";
import { defineConfig } from "vite";
import { config } from "./config";

export default defineConfig({
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
          { [resolve(import.meta.dirname, "runtime.ts")]: ["useDmsAppConfig"] },
        ],
        dts: false,
      },
      components: { dirs: [], dts: false },
    }),
  ],
  resolve: { dedupe: ["vue", "reka-ui", "@nuxt/ui"] },
  define: {
    __THEME_DEFAULT__: Boolean(process.env.THEME_DEFAULT),
    __THEME_CSS_LAST__: Boolean(process.env.THEME_CSS_LAST),
  },
});
