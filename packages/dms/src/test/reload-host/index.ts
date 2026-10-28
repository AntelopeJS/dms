import { randomUUID } from "node:crypto";
import { GetModuleContext } from "@antelopejs/interface-core/modules";
import { ChartLine } from "@antelopejs/interface-dms/base/chart";
import { registerRealtimeMutationListener } from "@antelopejs/interface-dms/base/table-view";
import { Hook, RegisterHook } from "@antelopejs/interface-dms/hooks";
import { RegisterPageExtension } from "@antelopejs/interface-dms/page";

import "./package.json";

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

interface ProvisionedTenant {
  generation: string;
  tenantId: string;
  userId?: string;
  afterDatabaseInitialized: boolean;
}

interface Probe {
  generations: string[];
  calls: ProbeCall[];
  owners: string[];
  extendedPages: string[];
  provisioned: ProvisionedTenant[];
}

const generation = randomUUID();
let databaseInitialized = false;

function probe(): Probe {
  const holder: typeof globalThis & { [PROBE_KEY]?: Probe } = globalThis;
  holder[PROBE_KEY] ??= {
    generations: [],
    calls: [],
    owners: [],
    extendedPages: [],
    provisioned: [],
  };
  return holder[PROBE_KEY];
}

function record(source: ProbeSource): void {
  probe().calls.push({ generation, source });
}

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
    databaseInitialized = true;
    record("database-initialized");
    return undefined;
  });
  RegisterHook(Hook.TENANT_BEING_PROVISIONED, ({ tenantId, userId }) => {
    probe().provisioned.push({
      generation,
      tenantId,
      userId,
      afterDatabaseInitialized: databaseInitialized,
    });
    return undefined;
  });
  registerRealtimeMutationListener((context) => {
    if (context.controllerLocation === PROBE_LOCATION) record("listener");
  });
  extendPages();
}
