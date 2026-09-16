import { defineConfig } from "vitest/config";
import { resolve } from "node:path";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "#dms-core": resolve(__dirname, "layers/dms-core"),
      "#dms-ui": resolve(__dirname, "layers/dms-ui"),
      "#dms-layout": resolve(__dirname, "layers/dms-layout"),
    },
  },
  esbuild: {
    tsconfigRaw: "{}",
  },
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
