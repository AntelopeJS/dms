import type { Component } from "vue";

const components = import.meta.glob<{ default: Component }>([
  "../build/components/**/*.vue",
  "!../build/components/table/TableBody.vue",
]);

export const buildComponents = Object.fromEntries(
  Object.entries(components).map(([path, loader]): [string, typeof loader] => [
    path === "../build/components/containers/RowSidePanel.vue"
      ? "./layers/dms-layout/app/build/components/layout/RowSidePanel.vue"
      : `./layers/dms-ui/app/${path.slice(3)}`,
    loader,
  ]),
);
