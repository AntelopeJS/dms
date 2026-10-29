import type { Component } from "vue";

const components = import.meta.glob<{ default: Component }>(
  "../build/components/**/*.vue",
);

export const buildComponents = Object.fromEntries(
  Object.entries(components).map(([path, loader]): [string, typeof loader] => [
    `./layers/dms-auth/app/${path.slice(3)}`,
    loader,
  ]),
);
