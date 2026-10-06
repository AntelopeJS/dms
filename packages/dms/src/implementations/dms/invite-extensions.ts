import type { InviteExtensionInfo } from "@antelopejs/interface-dms/invite-extensions/internal/types";
import {
  applyInviteExtension,
  revokeInviteExtension,
} from "@antelopejs/interface-dms/invite-extensions/internal/registry";
import { scheduleBroadcast } from "./dev-reload";

// Routing invite extensions through the proxy is what binds them to the
// extending module's lifetime: the core unregisters every entry a module
// registered when that module stops, so its fields leave the invite modal.
export namespace internal {
  export const RegisterInviteExtension = {
    register: (info: InviteExtensionInfo) => {
      applyInviteExtension(info);
      scheduleBroadcast();
    },
    unregister: (info: InviteExtensionInfo) => {
      revokeInviteExtension(info);
      scheduleBroadcast();
    },
  };
}
