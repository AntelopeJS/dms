import builtIn from "../../layers/dms-ui/app/config/shortcuts-registry";
import type { ComponentShortcuts } from "../../layers/dms-ui/app/types/shortcuts";

export default [
  ...builtIn,
  {
    component: "Finder",
    shortcuts: [
      {
        key: ["enter"],
        descriptionKey: "$finder.open",
        component: "$finder.component",
      },
    ],
  },
] satisfies ComponentShortcuts[];
