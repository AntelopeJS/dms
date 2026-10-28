import {
  type ModuleStatus,
  RegisterModule,
} from "@antelopejs/interface-dms/page";

const STATUS_CYCLE: ModuleStatus[] = ["beta", "update", "attention"];
let catalogLoads = 0;

function nextStatus(): ModuleStatus {
  const status = STATUS_CYCLE[catalogLoads % STATUS_CYCLE.length] ?? "beta";
  catalogLoads += 1;
  return status;
}

export const plainModule = RegisterModule({
  id: "plain",
  title: "Plain Module",
  description: "A module without a default category to show the Pages fallback",
  icon: "i-ph-cube-transparent",
  version: "0.9.2",
  catalogCategory: "Developer",
  status: nextStatus,
  readout: () => [
    { tone: "success", text: "1 page · Pages fallback" },
    { tone: "warning", text: "state changes at every catalog load" },
  ],
});

export * from "./info-page";
