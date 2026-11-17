import type { PlaygroundFeature } from "./types";
import {
  AREA,
  SIMPLE,
  REQUIRED,
  FIELD_TYPES,
  RESOURCE,
  ADDRESS,
  PROFILE,
} from "./form-demos";

export const typeFeatures: PlaygroundFeature[] = [
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

export const uploadFeatures: PlaygroundFeature[] = [
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
