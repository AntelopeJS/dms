import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import {
  Form,
  type FormPropsSerialized,
} from "@antelopejs/interface-dms/base/form";
import {
  type ComponentSlotResolver,
  RegisterComponentSlot,
} from "@antelopejs/interface-dms/component-slots";

export const PROFILE_SOCIAL_SLOT_ID = "playground:profile-social";

type FormSchemaJson = NonNullable<FormPropsSerialized["schema"]>;
type ObjectSchemaJson = Extract<FormSchemaJson, { properties: object }>;

// SAFETY: Form sets its serialized options with fields and a schema before returning the builder.
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

function withContributedProperties(base: ObjectSchemaJson): FormSchemaJson {
  // SAFETY: The contributed Form builds an object schema from its mastodonUrl field.
  const extra = contributed.schema as ObjectSchemaJson;
  return {
    ...base,
    properties: { ...base.properties, ...extra.properties },
  };
}

const withContributedFields: ComponentSlotResolver = (options) => {
  // SAFETY: The profile-social slot is declared only on a Form, whose fields produce an object schema.
  const base = options.schema as ObjectSchemaJson;
  return {
    ...options,
    fields: [...options.fields, ...contributed.fields],
    schema: withContributedProperties(base),
  };
};

RegisterComponentSlot(PROFILE_SOCIAL_SLOT_ID, withContributedFields);
