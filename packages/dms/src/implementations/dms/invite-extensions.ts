import {
  type InviteExtensionInfo,
  internal as inviteExtensionInterfaceInternal,
} from "@antelopejs/interface-dms/invite-extensions";
import { scheduleBroadcast } from "./dev-reload";

// Routing invite extensions through the proxy is what binds them to the
// extending module's lifetime: the core unregisters every entry a module
// registered when that module stops, so its fields leave the invite modal.
export namespace internal {
  export const RegisterInviteExtension = {
    register: (info: InviteExtensionInfo) => {
      inviteExtensionInterfaceInternal.applyInviteExtension(info);
      scheduleBroadcast();
    },
    unregister: (info: InviteExtensionInfo) => {
      inviteExtensionInterfaceInternal.revokeInviteExtension(info);
      scheduleBroadcast();
    },
  };
}
