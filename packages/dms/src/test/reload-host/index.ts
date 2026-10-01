import { randomUUID } from "node:crypto";
import { GetModuleContext } from "@antelopejs/interface-core/modules";
import { ChartLine } from "@antelopejs/interface-dms/base/chart";
import { registerRealtimeMutationListener } from "@antelopejs/interface-dms/base/table-view";
import { Hook, RegisterHook } from "@antelopejs/interface-dms/hooks";
import { RegisterPageExtension } from "@antelopejs/interface-dms/page";
// A reload only evaluates again the files inside the module's folder, so the
// harness loads this module from where it compiles to. Importing the manifest
// is what makes the build copy it there.
import "./package.json";

// The suite reads these through `src/test/helpers/reload-host.ts`. Nothing is
// imported from there: the runtime binds a module's import of another module's
// file to the generation that made it first, which the reload under test ends.
const PROBE_KEY = Symbol.for("@antelopejs/dms-test/reload-host");
const PROBE_TENANT = "reload-host-tenant";
const PROBE_LOCATION = "/reload-host/rows";
const EXTENSION_KEY = "injectedTrend";
const EXTENSION_TOPIC = "reload-host:extension";

type ProbeSource = "hook" | "listener" | "database-initialized";

interface ProbeCall {
  generation: string;
  source: ProbeSource;
}

interface Probe {
  generations: string[];
  calls: ProbeCall[];
  owners: string[];
  extendedPages: string[];
}

// Evaluated again by each reload, so it tells the generations apart.
const generation = randomUUID();

function probe(): Probe {
  const holder = globalThis as Record<symbol, Probe | undefined>;
  holder[PROBE_KEY] ??= {
    generations: [],
    calls: [],
    owners: [],
    extendedPages: [],
  };
  return holder[PROBE_KEY];
}

function record(source: ProbeSource): void {
  probe().calls.push({ generation, source });
}

// One extension per page the suite asks for, each injecting a chart: preparing
// it registers a permission and a realtime topic, which belong to this module.
function extendPages(): void {
  for (const targetPageId of probe().extendedPages) {
    class ReloadHostExtension {
      static [EXTENSION_KEY] = ChartLine({
        realtimeTopic: EXTENSION_TOPIC,
      }).meta({ name: "Injected trend" });
    }
    RegisterPageExtension(targetPageId)(ReloadHostExtension);
  }
}

/**
 * Registers the way a consumer module does, from `construct()`, and releases
 * nothing on the way out: taking down what a departing generation registered
 * is the registries' job, not each consumer's.
 */
export function construct(): void {
  probe().generations.push(generation);
  probe().owners.push(GetModuleContext()?.owner ?? generation);
  RegisterHook(Hook.MEMBER_BEING_ADDED, (payload) => {
    if (payload.tenantId === PROBE_TENANT) record("hook");
    return undefined;
  });
  RegisterHook(Hook.DATABASE_INITIALIZED, () => {
    record("database-initialized");
    return undefined;
  });
  registerRealtimeMutationListener((context) => {
    if (context.controllerLocation === PROBE_LOCATION) record("listener");
  });
  extendPages();
}
