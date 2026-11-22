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
type ObjectSchemaJson = FormSchemaJson & {
  properties: NonNullable<FormSchemaJson["properties"]>;
};

function serializedOptions(form: ReturnType<typeof Form>): FormPropsSerialized {
  const { options } = form.serializeSync();
  if (!options) throw new Error("The contributed form serialized no options");
  return options;
}

function objectSchemaOf(
  schema: FormSchemaJson | undefined,
): ObjectSchemaJson | undefined {
  const properties = schema?.properties;
  if (!schema || !properties || schema.type !== "object") return undefined;
  return { ...schema, properties };
}

const contributed = serializedOptions(
  Form({
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
  }),
);
const contributedSchema = objectSchemaOf(contributed.schema);
if (!contributedSchema) {
  throw new Error("The contributed form serialized no object schema");
}
const extra = contributedSchema;

function withContributedProperties(base: ObjectSchemaJson): FormSchemaJson {
  return {
    ...base,
    properties: { ...base.properties, ...extra.properties },
  };
}

const withContributedFields: ComponentSlotResolver = (options) => {
  const base = objectSchemaOf(options.schema);
  if (!base) return options;
  return {
    ...options,
    fields: [...options.fields, ...contributed.fields],
    schema: withContributedProperties(base),
  };
};

RegisterComponentSlot(PROFILE_SOCIAL_SLOT_ID, withContributedFields);
