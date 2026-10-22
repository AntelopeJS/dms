import type { JsonSchema } from "@antelopejs/interface-dms-automation";

/**
 * The automation builder runs every node name and description, and every
 * field title and description, through `processI18n`: a `$`-prefixed text is
 * a key of the DMS locales (`dms.automation.*` in the dms-core layer).
 */
const NAMESPACE = "$dms.automation";

/** The `$` key of a node text: `nodeText("actions.sendEmail", "name")`. */
export function nodeText(node: string, text: string): string {
  return `${NAMESPACE}.${node}.${text}`;
}

/** The `$` key of a field's description, specific to one node. */
export function fieldHint(node: string, field: string): string {
  return nodeText(node, `fields.${field}`);
}

/**
 * The properties of a schema, each titled by its shared `$` field label
 * (`dms.automation.fields.<name>`), so the inspector and the catalog name it
 * in the reader's language rather than by its key.
 */
export function titledProperties(
  properties: Record<string, JsonSchema>,
): Record<string, JsonSchema> {
  return Object.fromEntries(
    Object.entries(properties).map(([name, schema]) => [
      name,
      { title: `${NAMESPACE}.fields.${name}`, ...schema },
    ]),
  );
}
