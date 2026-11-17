/**
 * Field names the generated resource already uses for its own members, so a
 * user field of the same name would shadow them. It lives on its own rather
 * than in resource-emit because catalog.ts needs it too, and importing it from
 * there closed a cycle: value -> catalog -> resource-emit -> emit -> value.
 */
export const RESERVED_FIELD_NAMES = new Set([
  "_id",
  "model",
  "get",
  "list",
  "select",
  "count",
  "new",
  "edit",
  "delete",
  "archive",
  "restore",
  "exportStart",
  "exportStatus",
  "exportDownload",
]);
