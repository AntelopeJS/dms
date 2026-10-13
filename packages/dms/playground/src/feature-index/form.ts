import { FEATURE_AREAS, type PlaygroundFeature } from "./types";

const AREA = FEATURE_AREAS.form;

const SIMPLE = "/form/form-simple";
const REQUIRED = "/form/form-required";
const SECTIONS = "/form/form-sections";
const SECTIONS_JUMP = "/form/form-sections-jump";
const INSTANT = "/form/form-instant";
const FIELD_TYPES = "/form/form-field-types";
const CONFIRM = "/form/form-confirm";
const CUSTOM_INPUT = "/form/form-custom-input";
const RESOURCE = "/form/form-resource";
const SAVING = "/form/form-saving";
const TWO_FORMS = "/form/form-advanced";
const ADDRESS = "/form/form-address";
const LOCALIZED = "/form/form-localized";
const PROFILE = "/form/form-profile-edit";
const GROUPED = "/form/form-grouped";
const WATCHES = "/form/watch-actions";

const formOptions: PlaygroundFeature[] = [
  {
    area: AREA,
    feature: "A form loaded from and saved to module routes",
    api: "Form({ fetchUrl, submitUrl })",
    demo: SIMPLE,
  },
  {
    area: AREA,
    feature: "Sticky save bar naming the unsaved changes",
    api: 'Form({ saveMode: "bar" }) (default)',
    demo: SIMPLE,
  },
  {
    area: AREA,
    feature: "Save and Cancel buttons in the form's footer",
    api: 'Form({ saveMode: "footer" })',
    demo: SAVING,
  },
  {
    area: AREA,
    feature: "Cancel leading back somewhere while the form is clean",
    api: "Form({ backTo })",
    demo: SAVING,
  },
  {
    area: AREA,
    feature: "A form with no save buttons",
    api: 'Form({ saveMode: "none" })',
    demo: SAVING,
  },
  {
    area: AREA,
    feature: "Each change saved on its own, refused saves put back",
    api: 'Form({ saveMode: "instant" })',
    demo: INSTANT,
  },
  {
    area: AREA,
    feature: "An action form: Reset and a submit label, emptied once sent",
    api: 'Form({ kind: "action", submitLabel })',
    demo: SAVING,
  },
  {
    area: AREA,
    feature: "Request methods of the load and the save",
    api: "Form({ fetchUrlMethod, submitUrlMethod })",
    demo: SAVING,
  },
  {
    area: AREA,
    feature: "Success and failure messages of a save",
    api: "Form({ successMessage, errorMessage })",
    demo: SAVING,
  },
  {
    area: AREA,
    feature: "Payload defaults read from the page URL",
    api: 'Form({ submitDefaults: { workspace: "{{query.workspace}}" } })',
    demo: `${SAVING}?workspace=acme`,
  },
  {
    area: AREA,
    feature: "Redirect after a save, with a value of the answer",
    api: 'Form({ redirectOnSuccess: "…?invited={{response.count}}" })',
    demo: SAVING,
  },
  {
    area: AREA,
    feature: "Extra toast and warning answered by the submit route",
    api: "submit answer { notice: { title, params, color }, warning }",
    demo: SAVING,
  },
  {
    area: AREA,
    feature: "Breadcrumb ending with the loaded record's name",
    api: "Form({ labelKey })",
    demo: SAVING,
  },
  {
    area: AREA,
    feature: "Labels above the fields",
    api: 'Form({ fieldsOrientation: "vertical" })',
    demo: TWO_FORMS,
  },
  {
    area: AREA,
    feature: "Several forms on one page, each with its own record",
    api: "static a = Form(…); static b = Form(…)",
    demo: TWO_FORMS,
  },
  {
    area: AREA,
    feature: "Another module adding fields to a declared form",
    api: "Form({ slotId }) + RegisterComponentSlot(slotId, resolver)",
    demo: PROFILE,
  },
];

const sectionFeatures: PlaygroundFeature[] = [
  {
    area: AREA,
    feature: "A form split into titled sections, saved together",
    api: "Form({ sections: [{ id, label, icon, description, fields }] })",
    demo: SECTIONS,
  },
  {
    area: AREA,
    feature: "Side list of sections under group headings",
    api: 'Form({ sectionNav: "side" }) + FormSection.navGroup',
    demo: SECTIONS,
    since: "v0.7.6",
  },
  {
    area: AREA,
    feature: "Fields before every section",
    api: "Form({ fields, sections })",
    demo: SECTIONS,
  },
  {
    area: AREA,
    feature: "Section chips above the form, grouped",
    api: 'Form({ sectionNav: "jump" }) + FormSection.navGroup',
    demo: SECTIONS_JUMP,
    since: "v0.7.7",
  },
  {
    area: AREA,
    feature: "No section navigation below three sections",
    api: 'Form({ sections }) (sectionNav defaults to "none")',
    demo: SECTIONS_JUMP,
  },
  {
    area: AREA,
    feature: "Link to a field or a section of a form",
    api: "#<fieldId>, #dms-form-<component>-section-<section>",
    demo: `${SECTIONS}#retentionDays`,
  },
  {
    area: AREA,
    feature: "Fields grouped side by side or stacked",
    api: 'FieldGroup { fields, orientation: "horizontal" | "vertical" }',
    demo: GROUPED,
  },
  {
    area: AREA,
    feature: "Groups reordered",
    api: "FieldGroup.order",
    demo: GROUPED,
  },
  {
    area: AREA,
    feature: "A field group inside a section",
    api: "FormSection.fields: [FieldGroup]",
    demo: SECTIONS,
  },
];

const fieldFeatures: PlaygroundFeature[] = [
  {
    area: AREA,
    feature: "Required fields, the asterisk and its legend",
    api: "FormField.required",
    demo: REQUIRED,
  },
  {
    area: AREA,
    feature: "Server-side validation against the form's own schema",
    api: "formSchema(Page.form).safeParseAsync(body)",
    demo: REQUIRED,
  },
  {
    area: AREA,
    feature: "Server field error with values in its translated message",
    api: '409 { field, message: "$key", params }',
    demo: REQUIRED,
    since: "v0.7.14",
  },
  {
    area: AREA,
    feature: "Server error on part of a field",
    api: '400 [{ path: ["address", "postalCode"], message }]',
    demo: REQUIRED,
  },
  {
    area: AREA,
    feature: "Number kept out of range and flagged instead of clamped",
    api: "FormComponents.InputNumber({ clamp: false })",
    demo: REQUIRED,
    since: "v0.7.14",
  },
  {
    area: AREA,
    feature: "Unit after a number",
    api: "NumberType({ suffix })",
    demo: REQUIRED,
    since: "v0.7.6",
  },
  {
    area: AREA,
    feature: "Character counter on a text or a textarea",
    api: "StringType({ showCount: true })",
    demo: REQUIRED,
    since: "v0.7.6",
  },
  {
    area: AREA,
    feature: "Grey help line under a control",
    api: "FormField.hint",
    demo: FIELD_TYPES,
  },
  {
    area: AREA,
    feature: "Change note and module default with Use default",
    api: "FormField.defaultValue",
    demo: FIELD_TYPES,
  },
  {
    area: AREA,
    feature: "Read-only value with a badge and a link",
    api: "FormField.readonly: { badge, link }",
    demo: FIELD_TYPES,
  },
  {
    area: AREA,
    feature: "Plain read-only and disabled fields",
    api: "FormField.readonly: true, FormField.disabled: true",
    demo: WATCHES,
  },
  {
    area: AREA,
    feature: "One value per language",
    api: "FormField.localized",
    demo: LOCALIZED,
  },
  {
    area: AREA,
    feature: "An acceptance box only ticking fills",
    api: "BooleanType + FormComponents.InputCheckbox()",
    demo: REQUIRED,
  },
  {
    area: AREA,
    feature: "Input overrides: slider, radios, range and inline calendars",
    api: "FormField.inputComponent: FormComponents.*",
    demo: REQUIRED,
  },
];

const typeFeatures: PlaygroundFeature[] = [
  {
    area: AREA,
    feature: "Text, email, number, date, colour and select inputs",
    api: "DefaultDataTypes.StringType, EmailType, NumberType, DateType…",
    demo: SIMPLE,
  },
  {
    area: AREA,
    feature: "Every built-in type, required",
    api: "DefaultDataTypes.*",
    demo: REQUIRED,
  },
  {
    area: AREA,
    feature: "Select as cards, segments or radios, cards per row",
    api: 'SelectType({ display: "cards" | "segmented" | "radio", columns })',
    demo: FIELD_TYPES,
  },
  {
    area: AREA,
    feature: "A select that can be emptied again",
    api: "SelectType({ deselectable: true })",
    demo: FIELD_TYPES,
  },
  {
    area: AREA,
    feature: "Options with an icon and colours",
    api: "SelectOption { icon, iconColor, textColor }",
    demo: FIELD_TYPES,
  },
  {
    area: AREA,
    feature: "Boolean as a switch, a checkbox or a card",
    api: 'BooleanType({ display: "switch" | "checkbox" | "card" })',
    demo: FIELD_TYPES,
  },
  {
    area: AREA,
    feature: "Online / offline status",
    api: "StatusType()",
    demo: FIELD_TYPES,
  },
  {
    area: AREA,
    feature: "Sortable repeater of rows",
    api: "ArrayType({ of, sortable, min, max, addLabel })",
    demo: FIELD_TYPES,
  },
  {
    area: AREA,
    feature: "Repeater of one bare type",
    api: "ArrayType({ of: { url: new UrlType() } })",
    demo: FIELD_TYPES,
  },
  {
    area: AREA,
    feature: "Key-value pairs, toggleable or typed",
    api: "KeyValueType({ toggleable, valueType, keyLabel, valueLabel })",
    demo: FIELD_TYPES,
  },
  {
    area: AREA,
    feature: "Tags of email addresses with suggestions",
    api: 'TagsType({ itemType: "email", max, suggestions })',
    demo: FIELD_TYPES,
  },
  {
    area: AREA,
    feature: "A secret revealed, copied and rotated",
    api: "SecretType({ rotateUrl })",
    demo: FIELD_TYPES,
  },
  {
    area: AREA,
    feature: "A write-only secret",
    api: "SecretType({ revealable: false, copyable: false })",
    demo: FIELD_TYPES,
  },
  {
    area: AREA,
    feature: "A value to copy",
    api: "StringType({ copyable: true })",
    demo: FIELD_TYPES,
  },
  {
    area: AREA,
    feature: "Code editor: JSON, SQL completions, HTML, JavaScript",
    api: "CodeType({ language, completions, completionsUrl, lineNumbers })",
    demo: FIELD_TYPES,
  },
  {
    area: AREA,
    feature: "Password typed twice",
    api: "PasswordType({ confirmPassword, confirmPlaceholder })",
    demo: FIELD_TYPES,
  },
  {
    area: AREA,
    feature: "Several related rows, each removable",
    api: "RelationType({ multiple: true, deselectable: true })",
    demo: FIELD_TYPES,
  },
  {
    area: AREA,
    feature: "Cascader limited in depth",
    api: "CascaderRelationType({ maxDepth })",
    demo: FIELD_TYPES,
  },
  {
    area: AREA,
    feature: "Duration within bounds",
    api: "StringTimeType({ min, max })",
    demo: FIELD_TYPES,
  },
  {
    area: AREA,
    feature: "Address with street suggestions and part placeholders",
    api: "AddressType({ placeholder, autocomplete: { enabled, lang, limit } })",
    demo: ADDRESS,
  },
  {
    area: AREA,
    feature: "Address suggestions from a given geocoder",
    api: "AddressType({ autocomplete: { url } })",
    demo: ADDRESS,
  },
];

const uploadFeatures: PlaygroundFeature[] = [
  {
    area: AREA,
    feature: "Files and images promoted, validated and cleaned on save",
    api: "AttachmentField + SaveComponentFiles",
    demo: PROFILE,
  },
  {
    area: AREA,
    feature: "Several images with a principal one and alt texts",
    api: "ImageType({ multiple, max })",
    demo: PROFILE,
  },
  {
    area: AREA,
    feature: "Image resized in the browser before upload",
    api: "ImageType({ resize: { maxWidth, maxHeight, fit } })",
    demo: PROFILE,
  },
  {
    area: AREA,
    feature: "Several files in one field",
    api: "FileType({ multiple: true })",
    demo: PROFILE,
  },
  {
    area: AREA,
    feature: "A file stored public",
    api: 'FileType({ visibility: "public" }) + AttachmentField.visibility',
    demo: PROFILE,
  },
  {
    area: AREA,
    feature: "Upload checked without being stored",
    api: "FileType({ path }) without attachmentField",
    demo: REQUIRED,
  },
  {
    area: AREA,
    feature: "Native files saved through a table form",
    api: "ResourceForm over a controller with file columns",
    demo: RESOURCE,
  },
];

const resourceAndWatchFeatures: PlaygroundFeature[] = [
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

const confirmFeatures: PlaygroundFeature[] = [
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

const customInputFeatures: PlaygroundFeature[] = [
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

export const FORM_FEATURES: PlaygroundFeature[] = [
  ...formOptions,
  ...sectionFeatures,
  ...fieldFeatures,
  ...typeFeatures,
  ...uploadFeatures,
  ...resourceAndWatchFeatures,
  ...confirmFeatures,
  ...customInputFeatures,
];
