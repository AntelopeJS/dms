// Stands in for another module extending the profile's "Social & Settings"
// form after it was declared: the form opens a slot, and the owner of the
// slot rewrites its serialized options as the page layout is served.

import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import {
  Form,
  type FormPropsSerialized,
} from "@antelopejs/interface-dms/base/form";
import {
  RegisterComponentSlot,
  type SlotOptions,
} from "@antelopejs/interface-dms/component-slots";

export const PROFILE_SOCIAL_SLOT_ID = "playground:profile-social";

type FormSchemaJson = NonNullable<FormPropsSerialized["schema"]>;

interface ObjectSchemaJson {
  properties?: Record<string, unknown>;
}

// Serialized once through a form of its own: a resolver hands the client
// serialized options, never builders. Its schema joins the form's, which
// refuses the keys it does not list.
const contributed = Form({
  fields: [
    {
      id: "mastodonUrl",
      label: "Mastodon profile",
      description: "Added through the form's slot by another module",
      type: new DefaultDataTypes.UrlType({
        placeholder: "https://mastodon.social/@username",
      }),
    },
  ],
}).serializeSync().options as FormPropsSerialized;

function withContributedProperties(schema: unknown): FormSchemaJson {
  const base = schema as ObjectSchemaJson;
  const extra = contributed.schema as ObjectSchemaJson;
  return {
    ...base,
    properties: { ...base.properties, ...extra.properties },
  } as FormSchemaJson;
}

function withContributedFields(options: SlotOptions): SlotOptions {
  const fields = (options.fields as FormPropsSerialized["fields"]) ?? [];
  return {
    ...options,
    fields: [...fields, ...contributed.fields],
    schema: withContributedProperties(options.schema),
  };
}

RegisterComponentSlot(PROFILE_SOCIAL_SLOT_ID, withContributedFields);
