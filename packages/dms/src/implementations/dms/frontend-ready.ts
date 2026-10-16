import { assertValidation } from "@antelopejs/interface-api-util";
import { z } from "zod";
import {
  assertFrontendBootstrap,
  decideLayerAccess,
  resolveBootstrapOutcome,
} from "./frontend-bootstrap";

/**
 * What the frontend server last reported it serves, after `ajs dms dev` or
 * `ajs dms start` became ready: the names of the frontend modules built into
 * it. The module store compares it with the layers a module registered to
 * tell when the interface of a module it just installed or removed is live.
 */
export interface FrontendAcknowledgement {
  modules: Set<string>;
  /** The dms-frontend release that reported, when it says. */
  version?: string;
  receivedAt: number;
}

let acknowledgement: FrontendAcknowledgement | undefined;

export function recordFrontendReady(
  moduleNames: string[],
  version?: string,
): void {
  acknowledgement = {
    modules: new Set(moduleNames),
    version,
    receivedAt: Date.now(),
  };
}

/** The last report, or undefined when no frontend server has reported yet. */
export function getFrontendAcknowledgement():
  | FrontendAcknowledgement
  | undefined {
  return acknowledgement;
}

const MAX_REPORTED_MODULES = 500;
const MAX_VERSION_LENGTH = 64;

/** A dms-frontend that predates `version` reports the modules only. */
const frontendReadySchema = z.object({
  modules: z.array(z.string().min(1)).max(MAX_REPORTED_MODULES),
  version: z.string().min(1).max(MAX_VERSION_LENGTH).optional(),
});

/**
 * `POST /dms/frontend/ready`: a frontend server reports the modules it
 * serves. Gated like the layer endpoints, since it comes from the same tool.
 */
export function acknowledgeFrontendReady(
  body: unknown,
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
