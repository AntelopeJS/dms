import { RegisterComponentSlot } from "@antelopejs/interface-dms/component-slots";

/** The slot the page extension target's form opens to contributors. */
export const EXTENSION_FORM_SLOT_ID = "playground:extension-form";

RegisterComponentSlot(EXTENSION_FORM_SLOT_ID, (options) => ({
  ...options,
  description:
    "Rewritten while the layout is served by the RegisterComponentSlot resolver that owns playground:extension-form.",
}));
