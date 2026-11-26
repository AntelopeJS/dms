import assert from "node:assert/strict";
import test from "node:test";
import { Logging } from "@antelopejs/interface-core/logging";
import {
  applyInviteExtension,
  clearInviteExtensions,
} from "../dist/invite-extensions/internal/registry.js";
import { INVITE_EDIT_FORM_SLOT_ID } from "../dist/invite-extensions/internal/form-slot.js";
import { ResolveComponentSlots } from "../dist/internal/component-slots.js";

await test("an extension anchored on a name Object.prototype holds is reported by that name", async (t) => {
  const warn = t.mock.method(Logging, "Warn", () => undefined);
  clearInviteExtensions();
  applyInviteExtension({
    key: "billing",
    component: {
      serialize: async () => ({
        options: {
          fields: [{ id: "costCenter", label: "Cost center", type: {} }],
        },
      }),
    },
    schema: { parse: (body) => body },
    onAccept() {},
    placement: { side: "after", anchorField: "constructor", order: 0 },
  });
  await ResolveComponentSlots({
    componentName: "dms-form-block",
    options: {
      slotId: INVITE_EDIT_FORM_SLOT_ID,
      fields: [{ id: "email" }],
    },
  });
  clearInviteExtensions();
  const [message] = warn.mock.calls[0].arguments;
  assert.match(message, /anchors on field "constructor"/);
});
