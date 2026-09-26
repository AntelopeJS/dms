import * as delivery from "./delivery";
import * as edit from "./edit";
import { internal as registry } from "./registry";

// On its own rather than in registry.ts: delivery and edit read the registry,
// so gathering their helpers there would close a cycle. The barrel exports
// this namespace by name, which shadows the one registry.ts declares.

/**
 * @internal
 */
export namespace internal {
  export const RegisterInviteExtension = registry.RegisterInviteExtension;
  export const applyInviteExtension = registry.applyInviteExtension;
  export const revokeInviteExtension = registry.revokeInviteExtension;
  export const clearInviteExtensions = registry.clearInviteExtensions;

  export const CollectInviteExtensionPayloads =
    delivery.CollectInviteExtensionPayloads;
  export const DeliverInviteExtensions = delivery.DeliverInviteExtensions;
  export const CleanupInviteExtensions = delivery.CleanupInviteExtensions;

  export const ReadInviteExtensionFields = edit.ReadInviteExtensionFields;
  export const CollectInviteExtensionEdits = edit.CollectInviteExtensionEdits;
  export const NotifyInviteExtensionUpdates = edit.NotifyInviteExtensionUpdates;
}
