import { RegisterModule } from "@antelopejs/interface-dms/page";

// No `defaultCategory` declared: this module's loose pages fall back to the
// generic "Pages" grouping, exercising the legacy behaviour.
export const plainModule = RegisterModule({
  id: "plain",
  title: "Plain Module",
  description: "A module without a default category to show the Pages fallback",
  icon: "i-ph-cube-transparent",
  version: "0.9.2",
  catalogCategory: "Developer",
  status: () => "beta",
  readout: () => [
    { tone: "success", text: "1 page · Pages fallback" },
    { tone: "warning", text: "no default category set" },
  ],
});

export * from "./info-page";
