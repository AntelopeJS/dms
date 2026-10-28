import type { InviteExtensionInfo } from "@antelopejs/interface-dms/invite-extensions/internal/types";
import {
  applyInviteExtension,
  revokeInviteExtension,
} from "@antelopejs/interface-dms/invite-extensions/internal/registry";
import { scheduleBroadcast } from "../../store/frontend";

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
