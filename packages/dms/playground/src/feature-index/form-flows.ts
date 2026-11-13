import type { PlaygroundFeature } from "./types";
import { AREA, CONFIRM, CUSTOM_INPUT, RESOURCE, WATCHES } from "./form-demos";

export const resourceAndWatchFeatures: PlaygroundFeature[] = [
  {
    area: AREA,
    feature: "Form over a table's row: new, edit or view",
    api: 'ResourceForm(controller, { mode: "new" | "edit" | "view" })',
    demo: RESOURCE,
  },
  {
    area: AREA,
    feature: "Row of a table form read from the page URL",
    api: "ResourceForm({ rowId: QUERY_ROW_ID })",
    demo: RESOURCE,
  },
  {
    area: AREA,
    feature: "A field disabled, hidden or required by another's value",
    api: ".watch(FormEvents.FIELD_CHANGE, FormFunctions.SET_FIELD_*)",
    demo: WATCHES,
  },
  {
    area: AREA,
    feature: "A watch behind a permission, a condition as one object",
    api: ".watch(…, { requirePermission, onParam: { key, value } })",
    demo: WATCHES,
  },
  {
    area: AREA,
    feature: "Watches filtered per user",
    api: ".watchFilter((permissions, watches) => …)",
    demo: WATCHES,
  },
  {
    area: AREA,
    feature: "Form events in a page setup function",
    api: 'setupId + ctx.on("form", FormEvents.SUBMIT_SUCCESS, …)',
    demo: WATCHES,
  },
];

export const confirmFeatures: PlaygroundFeature[] = [
  {
    area: AREA,
    feature: "Confirmation with params, impact and labels",
    api: "confirm: { title, params, icon, color, impact, cancelLabel }",
    demo: CONFIRM,
  },
  {
    area: AREA,
    feature: "Secondary action downloading a file, dialog kept open",
    api: 'confirm.secondaryAction: { target: { type: "download" } }',
    demo: CONFIRM,
    since: "v0.7.10",
  },
  {
    area: AREA,
    feature: "Secondary action opening a link",
    api: 'confirm.secondaryAction: { target: { type: "external" } }',
    demo: CONFIRM,
    since: "v0.7.10",
  },
  {
    area: AREA,
    feature: "Typed confirmation in any case",
    api: "confirm: { confirmText, confirmTextCaseInsensitive: true }",
    demo: CONFIRM,
    since: "v0.7.14",
  },
  {
    area: AREA,
    feature: "Fields in the dialog, sent with the request",
    api: "confirm: { fields } + api target body",
    demo: CONFIRM,
  },
  {
    area: AREA,
    feature: "A dialog that only explains",
    api: "confirm: { blocked: true }",
    demo: CONFIRM,
  },
  {
    area: AREA,
    feature: "A dialog the server words",
    api: "confirm: { from } + serializeConfirmDialog",
    demo: CONFIRM,
  },
  {
    area: AREA,
    feature: "A confirmation opened from a component",
    api: "useConfirm().confirm({ secondaryAction: { run }, initialFocus })",
    demo: `${CONFIRM}#use-confirm`,
    since: "v0.7.10",
  },
  {
    area: AREA,
    feature: "Body checked before confirming, refusals and partial outcomes",
    api: "useConfirm: validate, ConfirmTextError, ConfirmActionError, { partial }",
    demo: `${CONFIRM}#use-confirm`,
  },
  {
    area: AREA,
    feature: "A server-worded dialog opened from a component",
    api: "useConfirmFrom().confirmFrom(url, { params, fallback })",
    demo: `${CONFIRM}#use-confirm-from`,
    since: "v0.7.14",
  },
];

export const customInputFeatures: PlaygroundFeature[] = [
  {
    area: AREA,
    feature: "A field drawn by the module's own component",
    api: 'inputComponent: CustomComponent("RetentionInput").serializeSync()',
    demo: CUSTOM_INPUT,
  },
  {
    area: AREA,
    feature: "A custom input refusing what was typed",
    api: "useControlError().report(message)",
    demo: CUSTOM_INPUT,
    since: "v0.7.15",
  },
  {
    area: AREA,
    feature: "A custom input holding the save, submitting, focusing a field",
    api: "useEnclosingForm(): addValidator, submit, focusField",
    demo: CUSTOM_INPUT,
    since: "v0.7.12",
  },
  {
    area: AREA,
    feature: "Why a typed number was adjusted",
    api: "<DmsInputNumber @adjust> (InputNumberAdjustment)",
    demo: CUSTOM_INPUT,
    since: "v0.7.12",
  },
  {
    area: AREA,
    feature: "Required legend under a hand-built form",
    api: "<DmsFieldRow required> + <DmsFormRequiredLegend>",
    demo: CUSTOM_INPUT,
    since: "v0.7.14",
  },
];
