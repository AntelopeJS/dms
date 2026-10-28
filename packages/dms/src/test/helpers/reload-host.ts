/** Module id the harness loads `src/test/reload-host` under. */
export const RELOAD_HOST_MODULE = "reload-host";

/** Tenant the suite fires hooks for; the module ignores every other one. */
export const RELOAD_HOST_TENANT = "reload-host-tenant";

/** Controller location the suite mutates; the module ignores every other one. */
export const RELOAD_HOST_LOCATION = "/reload-host/rows";

/** Component key of the chart the module injects into each extended page. */
export const RELOAD_HOST_EXTENSION_KEY = "injectedTrend";

/** Realtime topic of the chart the module injects into each extended page. */
export const RELOAD_HOST_EXTENSION_TOPIC = "reload-host:extension";

const PROBE_KEY = Symbol.for("@antelopejs/dms-test/reload-host");

/** What a generation of the reload-host module was called through. */
export type ReloadHostCallSource = "hook" | "listener" | "database-initialized";

/** One call a generation of the reload-host module received. */
export interface ReloadHostCall {
  generation: string;
  source: ReloadHostCallSource;
}

/** A `TENANT_BEING_PROVISIONED` call the reload-host module received. */
export interface ReloadHostProvisionedTenant {
  generation: string;
  tenantId: string;
  userId?: string;
  /** Whether that generation's `DATABASE_INITIALIZED` handler had run. */
  afterDatabaseInitialized: boolean;
}

interface ReloadHostProbe {
  generations: string[];
  calls: ReloadHostCall[];
  owners: string[];
  extendedPages: string[];
  provisioned: ReloadHostProvisionedTenant[];
}

function probe(): ReloadHostProbe {
  const holder = globalThis as Record<symbol, ReloadHostProbe | undefined>;
  holder[PROBE_KEY] ??= {
    generations: [],
    calls: [],
    owners: [],
    extendedPages: [],
    provisioned: [],
  };
  return holder[PROBE_KEY];
}

/** The generation constructed last: the only one a reload leaves running. */
export function liveReloadHostGeneration(): string | undefined {
  return probe().generations.at(-1);
}

/** Every `TENANT_BEING_PROVISIONED` call received since the harness booted. */
export function reloadHostProvisionedTenants(): ReloadHostProvisionedTenant[] {
  return [...probe().provisioned];
}

/** The execution owner of the generation constructed last. */
export function liveReloadHostOwner(): string | undefined {
  return probe().owners.at(-1);
}

/**
 * The pages the module's next generations extend, each with a chart: an empty
 * list leaves the pages it extended so far without its extension.
 */
export function setReloadHostExtendedPages(pageIds: string[]): void {
  probe().extendedPages = [...pageIds];
}

/**
 * The calls recorded since the previous take, which are then forgotten --
 * only those of `source` when given, so a call that lands in the background
 * does not leak into a suite that takes another source.
 */
export function takeReloadHostCalls(
  source?: ReloadHostCallSource,
): ReloadHostCall[] {
  const { calls } = probe();
  const taken = calls.filter((call) => !source || call.source === source);
  const kept = calls.filter((call) => !taken.includes(call));
  calls.splice(0, calls.length, ...kept);
  return taken;
}
