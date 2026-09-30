// What the reload-host test module (`src/test/reload-host`) records, read from
// the suite's side. The module keeps its own copy of these values rather than
// importing them: see the note at the top of its entry point.

/** Module id the harness loads `src/test/reload-host` under. */
export const RELOAD_HOST_MODULE = "reload-host";

/** Tenant the suite fires hooks for; the module ignores every other one. */
export const RELOAD_HOST_TENANT = "reload-host-tenant";

/** Controller location the suite mutates; the module ignores every other one. */
export const RELOAD_HOST_LOCATION = "/reload-host/rows";

const PROBE_KEY = Symbol.for("@antelopejs/dms-test/reload-host");

/** One call a generation of the reload-host module received. */
export interface ReloadHostCall {
  generation: string;
  source: "hook" | "listener";
}

interface ReloadHostProbe {
  generations: string[];
  calls: ReloadHostCall[];
}

function probe(): ReloadHostProbe {
  const holder = globalThis as Record<symbol, ReloadHostProbe | undefined>;
  holder[PROBE_KEY] ??= { generations: [], calls: [] };
  return holder[PROBE_KEY];
}

/** The generation constructed last: the only one a reload leaves running. */
export function liveReloadHostGeneration(): string | undefined {
  return probe().generations.at(-1);
}

/** The calls recorded since the previous take, which are then forgotten. */
export function takeReloadHostCalls(): ReloadHostCall[] {
  return probe().calls.splice(0);
}
