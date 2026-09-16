import { RegisterModule } from "@antelopejs/interface-dms/page";

// No `defaultCategory` declared: this module's loose pages fall back to the
// generic "Pages" grouping, exercising the legacy behaviour.
export const plainModule = RegisterModule({
  id: "plain",
  title: "Plain Module",
  description: "A module without a default category to show the Pages fallback",
  icon: "i-ph-cube-transparent",
});

export * from "./info-page";
