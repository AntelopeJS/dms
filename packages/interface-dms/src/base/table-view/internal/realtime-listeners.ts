import { OwnedRegistry } from "../../../utils/internal/owned-registry";
import type { RealtimeMutationListener } from "../realtime";

/** @internal */
export const realtimeMutationListeners =
  new OwnedRegistry<RealtimeMutationListener>();
