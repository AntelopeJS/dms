import { randomUUID } from "node:crypto";
import { registerRealtimeMutationListener } from "@antelopejs/interface-dms/base/table-view";
import { Hook, RegisterHook } from "@antelopejs/interface-dms/hooks";
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

type ProbeSource = "hook" | "listener";

interface ProbeCall {
  generation: string;
  source: ProbeSource;
}

interface Probe {
  generations: string[];
  calls: ProbeCall[];
}

// Evaluated again by each reload, so it tells the generations apart.
const generation = randomUUID();

function probe(): Probe {
  const holder = globalThis as Record<symbol, Probe | undefined>;
  holder[PROBE_KEY] ??= { generations: [], calls: [] };
  return holder[PROBE_KEY];
}

function record(source: ProbeSource): void {
  probe().calls.push({ generation, source });
}

/**
 * Registers the way a consumer module does, from `construct()`, and releases
 * nothing on the way out: taking down what a departing generation registered
 * is the registries' job, not each consumer's.
 */
export function construct(): void {
  probe().generations.push(generation);
  RegisterHook(Hook.MEMBER_BEING_ADDED, (payload) => {
    if (payload.tenantId === PROBE_TENANT) record("hook");
    return undefined;
  });
  registerRealtimeMutationListener((context) => {
    if (context.controllerLocation === PROBE_LOCATION) record("listener");
  });
}
