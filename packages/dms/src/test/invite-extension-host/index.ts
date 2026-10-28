import { z } from "zod";
import {
  GetModuleContext,
  RunWithModuleContext,
} from "@antelopejs/interface-core/modules";
import { Form } from "@antelopejs/interface-dms/base/form";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { Hook, RegisterHook } from "@antelopejs/interface-dms/hooks";
import { RegisterInviteExtension } from "@antelopejs/interface-dms/invite-extensions";

const disposers: Array<() => void> = [];

export function construct(): void {
  const context = GetModuleContext();
  if (!context) throw new Error("Invite extension host has no module context");
  RegisterHook(Hook.MEMBER_BEING_ADDED, ({ tenantId, userId }) => {
    if (tenantId !== "ie-registration-command") return;
    return RunWithModuleContext(context, () => {
      if (userId === "dispose") {
        for (const dispose of disposers.splice(0)) dispose();
        return;
      }
      disposers.push(
        RegisterInviteExtension({
          key: "billing",
          component: Form({
            fields: [
              {
                id: userId,
                label: userId,
                type: new DefaultDataTypes.StringType({}),
              },
            ],
          }),
          schema: z.object({ [userId]: z.string() }),
          onAccept: () => undefined,
        }),
      );
    });
  });
}
