import { RegisterModule } from "@antelopejs/interface-dms/page";

export const demoModule = RegisterModule({
  id: "demo",
  title: "Demo Module",
  description: "A demo module to showcase the module system",
  icon: "i-ph-cube",
  // Group the module's loose pages under a controllable category heading
  // instead of the default "Pages" label.
  defaultCategory: {
    displayName: "Demo Pages",
    icon: "i-ph-files",
    order: 0,
  },
});

export * from "./form-page";
export * from "./welcome-page";
