import { RegisterModule } from "@antelopejs/interface-dms/page";

export const demoModule = RegisterModule({
  id: "demo",
  title: "Demo Module",
  description: "A demo module to showcase the module system",
  icon: "i-ph-cube",
  // `/modules/demo` opens this page instead of the first one by order.
  landingPage: "contact",
  // Modules catalog: version, category, state pill and live readout.
  version: "1.4.0",
  catalogCategory: "Content",
  status: () => "live",
  readout: () => [
    { tone: "success", text: "3 pages · 1 form" },
    { tone: "info", text: `up ${formatUptime(process.uptime())}` },
    { tone: "error", text: "1 sync job failing" },
  ],
  // Group the module's loose pages under a controllable category heading
  // instead of the default "Pages" label.
  defaultCategory: {
    displayName: "Demo Pages",
    icon: "i-ph-files",
    order: 0,
  },
});

export * from "./form-page";
export * from "./tools-page";
export * from "./welcome-page";

const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;

function formatUptime(seconds: number): string {
  const minutes = Math.floor(seconds / SECONDS_PER_MINUTE);
  const hours = Math.floor(minutes / MINUTES_PER_HOUR);
  if (hours === 0) return `${minutes} min`;
  return `${hours} h ${minutes % MINUTES_PER_HOUR} min`;
}
