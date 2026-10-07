import {
  KeyValueList,
  type KeyValueListItem,
} from "@antelopejs/interface-dms/base/key-value-list";

const FILE_ITEMS: KeyValueListItem[] = [
  { label: "src", value: "Folder", detail: "components, utils, index.ts" },
  { label: "package.json", value: "JSON", type: "mono" },
  { label: "tsconfig.json", value: "JSON", type: "mono" },
  { label: "README.md", value: "Markdown", type: "mono" },
];

const COMPONENT_ITEMS: KeyValueListItem[] = [
  { label: "Button", value: "v2.1", type: "mono" },
  { label: "Forms", value: "Input, Select, Checkbox" },
  { label: "Table", value: "new", type: "status", tone: "info" },
];

const DATABASE_ITEMS: KeyValueListItem[] = [
  { label: "Users", value: "id, name, email", type: "mono" },
  { label: "Tasks", value: "id, title, status", type: "mono" },
];

export function filesPanel() {
  return KeyValueList({ title: "File Explorer", items: FILE_ITEMS });
}

export function componentsPanel() {
  return KeyValueList({ title: "Components", items: COMPONENT_ITEMS });
}

export function databasePanel() {
  return KeyValueList({ title: "Database Schema", items: DATABASE_ITEMS });
}
