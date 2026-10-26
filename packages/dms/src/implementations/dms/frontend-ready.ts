import { assertValidation } from "@antelopejs/interface-api-util";
import { Logging } from "@antelopejs/interface-core/logging";
import { z } from "zod";
import {
  assertFrontendBootstrap,
  decideLayerAccess,
  resolveBootstrapOutcome,
} from "./frontend-bootstrap";
import { frontendModuleVersions } from "./frontend-modules";

/** A frontend module a frontend server serves, and its package's version. */
export interface ServedFrontendModule {
  name: string;
  version?: string;
}

/**
 * What the frontend server last reported it serves, after `ajs dms dev` or
 * `ajs dms start` became ready: the frontend modules built into it. The module
 * store compares the names with the layers a module registered to tell when
 * the interface of a module it just installed or removed is live.
 */
export interface FrontendAcknowledgement {
  modules: Set<string>;
  /** The dms-frontend release that reported. */
  version: string;
  receivedAt: number;
}

/** A frontend module both sides serve, at two package versions. */
export interface FrontendVersionDrift {
  name: string;
  served?: string;
  running?: string;
}

let acknowledgement: FrontendAcknowledgement | undefined;

/**
 * The modules a frontend serves at another package version than the one this
 * backend registered them from: a frontend and a backend built from two
 * commits. A module either side lacks is not a drift; the store tells those.
 *
 * @param served What the frontend reported
 * @param running Package version of each registered module, by name
 */
export function findVersionDrift(
  served: readonly ServedFrontendModule[],
  running: ReadonlyMap<string, string | undefined>,
): FrontendVersionDrift[] {
  return served
    .filter(({ name }) => running.has(name))
    .filter(({ name, version }) => running.get(name) !== version)
    .map(({ name, version }) => ({
      name,
      served: version,
      running: running.get(name),
    }));
}

function describeDrift({
  name,
  served,
  running,
}: FrontendVersionDrift): string {
  return `${name} ${served ?? "(unknown version)"} (backend: ${running ?? "unknown version"})`;
}

function warnOnVersionDrift(served: readonly ServedFrontendModule[]): void {
  const drift = findVersionDrift(served, frontendModuleVersions());
  if (drift.length === 0) return;
  Logging.Warn(
    `[DMS] The frontend server serves other module versions than this backend runs: ${drift.map(describeDrift).join(", ")}. ` +
      "Deploy the frontend and the backend from the same commit.",
  );
}

export function recordFrontendReady(
  modules: readonly ServedFrontendModule[],
  version: string,
): void {
  acknowledgement = {
    modules: new Set(modules.map((module) => module.name)),
    version,
    receivedAt: Date.now(),
  };
  warnOnVersionDrift(modules);
}

/** The last report, or undefined when no frontend server has reported yet. */
export function getFrontendAcknowledgement():
  | FrontendAcknowledgement
  | undefined {
  return acknowledgement;
}

const MAX_REPORTED_MODULES = 500;
const MAX_VERSION_LENGTH = 64;
const MAX_NAME_LENGTH = 214;

const frontendReadySchema = z.object({
  modules: z
    .array(
      z.object({
        name: z.string().min(1).max(MAX_NAME_LENGTH),
        version: z.string().min(1).max(MAX_VERSION_LENGTH).optional(),
      }),
    )
    .max(MAX_REPORTED_MODULES),
  version: z.string().min(1).max(MAX_VERSION_LENGTH),
});

/**
 * `POST /dms/frontend/ready`: a frontend server reports the modules it
 * serves with their package versions. Gated like the manifest, since it comes
 * from the same tool.
 */
export function acknowledgeFrontendReady(
  body: Parameters<typeof frontendReadySchema.parse>[0],
  bootstrapHeader: string | undefined,
): void {
  const outcome = resolveBootstrapOutcome(bootstrapHeader);
  if (decideLayerAccess(outcome) === "refuse") {
    assertFrontendBootstrap(outcome);
  }
  const { modules, version } = assertValidation(body, (value) =>
    frontendReadySchema.parse(value),
  );
  recordFrontendReady(modules, version);
}
