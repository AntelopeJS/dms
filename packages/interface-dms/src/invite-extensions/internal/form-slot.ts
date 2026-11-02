import { Logging } from "@antelopejs/interface-core/logging";
import {
  type FieldGroupSerialized,
  type FormFieldOrGroupSerialized,
  type FormFieldSerialized,
  type FormPropsSerialized,
  isFieldGroupSerialized,
} from "../../base/form";
import type { WatchAction } from "../../base/types/watch";
import { COMPONENT_SLOT_KEY } from "../../internal/component-slots";
import { RegisterComponentSlot, type SlotOptions } from "../../component-slots";
import { inviteExtensionFieldId } from "./field-ids";
import {
  type InviteExtensionEntry,
  listInviteExtensionEntries,
  logInviteExtensionFailure,
} from "./registry";
import type { InviteExtensionInfo, InviteFieldContribution } from "./types";

/**
 * Slot the DMS invite form opens for `RegisterInviteExtension`.
 *
 * @internal
 */
export const INVITE_FORM_SLOT_ID = "dms.invite-form";

/**
 * Slot the edit form of a pending invitation opens, so the contributed fields
 * can be changed until the invitee accepts.
 *
 * @internal
 */
export const INVITE_EDIT_FORM_SLOT_ID = "dms.invite-edit-form";

/** How one of the invite forms hosts the contributed blocks. */
interface InviteFormHost {
  /** Blocks of an extension that is not `editable` render read-only. */
  isEditForm: boolean;
  /**
   * Invite-form field ids an extension may anchor on, as this form names
   * them. The edit form lists the invitation's own columns: the addresses
   * field there is the one address it was sent to, and the roles field goes
   * by its stored name.
   */
  anchorAliases: Record<string, string>;
}

const INVITE_FORM_HOST: InviteFormHost = {
  isEditForm: false,
  anchorAliases: {},
};

const INVITE_EDIT_FORM_HOST: InviteFormHost = {
  isEditForm: true,
  anchorAliases: { emails: "email", roles: "roles_ids" },
};

interface JsonSchemaObject {
  $schema?: NonNullable<FormPropsSerialized["schema"]>["$schema"];
  properties?: InviteFieldContribution["properties"];
  required?: string[];
}

/** Watch params naming a field, remapped with the ids they now refer to. */
const WATCH_FIELD_PARAMS = ["targetField"];
const WATCH_FIELD_CONDITION_KEY = "fieldId";

function flattenSerializedFields(
  fields: FormFieldOrGroupSerialized[],
): FormFieldSerialized[] {
  return fields.flatMap((item) =>
    isFieldGroupSerialized(item) ? item.fields : [item],
  );
}

function prefixWatchAction(key: string, watch: WatchAction): WatchAction {
  const params = { ...watch.params };
  for (const param of WATCH_FIELD_PARAMS) {
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Watch params are heterogeneous; only string field references receive the invitation prefix.
    if (typeof params[param] === "string") {
      params[param] = inviteExtensionFieldId(key, params[param]);
    }
  }
  const conditions = watch.onParam
    ? [watch.onParam].flat().map((condition) =>
        condition.key === WATCH_FIELD_CONDITION_KEY &&
        // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Conditions support nonstring operands; remap only string field references without validating unrelated watch values.
        typeof condition.value === "string"
          ? {
              ...condition,
              value: inviteExtensionFieldId(key, condition.value),
            }
          : condition,
      )
    : undefined;

  const resolvedWatch: WatchAction = { ...watch, params };
  if (conditions) resolvedWatch.onParam = conditions;
  return resolvedWatch;
}

function prefixSchemaEntries(
  key: string,
  schema: FormPropsSerialized["schema"],
): Pick<InviteFieldContribution, "properties" | "requiredProperties"> {
  const source: JsonSchemaObject = schema ?? {};
  const properties: InviteFieldContribution["properties"] = {};
  for (const [fieldId, definition] of Object.entries(source.properties ?? {})) {
    properties[inviteExtensionFieldId(key, fieldId)] = definition;
  }
  return {
    properties,
    requiredProperties: (source.required ?? []).map((fieldId) =>
      inviteExtensionFieldId(key, fieldId),
    ),
  };
}

async function buildContribution(
  info: InviteExtensionInfo,
): Promise<InviteFieldContribution | undefined> {
  const serialized = await info.component.serialize();
  const options = serialized.options;
  const fields = flattenSerializedFields(options?.fields ?? []);

  if (fields.length === 0) {
    Logging.Warn(
      `[dms] invite extension "${info.key}" declares no field — nothing is injected into the invite modal.`,
    );
    return undefined;
  }

  const group: FieldGroupSerialized = {
    id: info.key,
    label: info.label ?? options?.title,
    description: info.description ?? options?.description,
    orientation: options?.fieldsOrientation,
    fields: fields.map((field) => ({
      ...field,
      id: inviteExtensionFieldId(info.key, field.id),
    })),
  };

  const watchActions = (options?.watchActions ?? []).map((watch) =>
    prefixWatchAction(info.key, watch),
  );

  return {
    key: info.key,
    side: info.placement.side,
    anchorField: info.placement.anchorField,
    order: info.placement.order,
    editable: info.editable !== false,
    group,
    watchActions,
    ...prefixSchemaEntries(info.key, options?.schema),
  };
}

function contributionOf(
  entry: InviteExtensionEntry,
): Promise<InviteFieldContribution | undefined> {
  entry.contribution ??= buildContribution(entry.info).catch(
    (error: unknown) => {
      logInviteExtensionFailure(entry.info.key, "serialize its form", error);
      entry.contribution = undefined;
      return undefined;
    },
  );
  return entry.contribution;
}

function compareContributions(
  a: InviteFieldContribution,
  b: InviteFieldContribution,
): number {
  if (a.order !== b.order) return a.order - b.order;
  return a.key < b.key ? -1 : 1;
}

function disableGroup(group: FieldGroupSerialized): FieldGroupSerialized {
  return {
    ...group,
    fields: group.fields.map((field) => ({ ...field, disabled: true })),
  };
}

function adaptToHost(
  contribution: InviteFieldContribution,
  host: InviteFormHost,
): InviteFieldContribution {
  const anchor = contribution.anchorField;
  const isReadOnly = host.isEditForm && !contribution.editable;
  return {
    ...contribution,
    anchorField: anchor ? (host.anchorAliases[anchor] ?? anchor) : undefined,
    group: isReadOnly ? disableGroup(contribution.group) : contribution.group,
  };
}

async function collectContributions(): Promise<InviteFieldContribution[]> {
  const built = await Promise.all(
    listInviteExtensionEntries().map(contributionOf),
  );
  return built
    .filter((entry): entry is InviteFieldContribution => !!entry)
    .sort(compareContributions);
}

interface PlacementBuckets {
  start: InviteFieldContribution[];
  before: Map<string, InviteFieldContribution[]>;
  after: Map<string, InviteFieldContribution[]>;
  end: InviteFieldContribution[];
}

function pushGrouped(
  groups: Map<string, InviteFieldContribution[]>,
  key: string,
  contribution: InviteFieldContribution,
): void {
  const existing = groups.get(key) ?? [];
  existing.push(contribution);
  groups.set(key, existing);
}

function bucketContributions(
  contributions: InviteFieldContribution[],
  ownIds: Set<string>,
): PlacementBuckets {
  const buckets: PlacementBuckets = {
    start: [],
    before: new Map(),
    after: new Map(),
    end: [],
  };

  for (const contribution of contributions) {
    const anchor = contribution.anchorField;
    if (contribution.side === "end") {
      buckets.end.push(contribution);
      continue;
    }
    if (!anchor) {
      (contribution.side === "before" ? buckets.start : buckets.end).push(
        contribution,
      );
      continue;
    }
    if (!ownIds.has(anchor)) {
      Logging.Warn(
        `[dms] invite extension "${contribution.key}" anchors on field "${anchor}", which the invite form does not declare. Appending its block at the end.`,
      );
      buckets.end.push(contribution);
      continue;
    }
    pushGrouped(
      contribution.side === "before" ? buckets.before : buckets.after,
      anchor,
      contribution,
    );
  }

  return buckets;
}

function assembleFields(
  own: FormFieldOrGroupSerialized[],
  contributions: InviteFieldContribution[],
  hostOrientation: FieldGroupSerialized["orientation"],
): FormFieldOrGroupSerialized[] {
  const buckets = bucketContributions(
    contributions,
    new Set(own.map((field) => field.id)),
  );
  const blockOf = (
    contribution: InviteFieldContribution,
  ): FieldGroupSerialized => ({
    ...structuredClone(contribution.group),
    orientation: contribution.group.orientation ?? hostOrientation,
  });
  const assembled: FormFieldOrGroupSerialized[] = buckets.start.map(blockOf);

  for (const field of own) {
    for (const contribution of buckets.before.get(field.id) ?? []) {
      assembled.push(blockOf(contribution));
    }
    assembled.push(field);
    for (const contribution of buckets.after.get(field.id) ?? []) {
      assembled.push(blockOf(contribution));
    }
  }
  for (const contribution of buckets.end) {
    assembled.push(blockOf(contribution));
  }

  return assembled;
}

function mergeSchema(
  own: FormPropsSerialized["schema"],
  contributions: InviteFieldContribution[],
) {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- This slot leaves nonobject schema representations untouched and only augments object schemas, preserving the opaque form schema contract.
  if (!own || typeof own !== "object") return own;
  const source: JsonSchemaObject = own;

  return {
    ...source,
    properties: contributions.reduce(
      (merged, contribution) => ({ ...merged, ...contribution.properties }),
      { ...source.properties },
    ),
    required: [
      ...(source.required ?? []),
      ...contributions.flatMap(
        (contribution) => contribution.requiredProperties,
      ),
    ],
  };
}

async function resolveInviteFormSlot(
  options: SlotOptions,
  host: InviteFormHost,
): Promise<SlotOptions> {
  const { [COMPONENT_SLOT_KEY]: _slot, ...resolved } = options;
  const contributions = (await collectContributions()).map((contribution) =>
    adaptToHost(contribution, host),
  );
  if (contributions.length === 0) return resolved;

  const form: Partial<FormPropsSerialized> & {
    watchActions?: WatchAction[];
  } = options;
  const watchActions = [
    ...(form.watchActions ?? []),
    ...contributions.flatMap((contribution) => contribution.watchActions),
  ];

  const merged: SlotOptions = {
    ...resolved,
    fields: assembleFields(
      form.fields ?? [],
      contributions,
      form.fieldsOrientation,
    ),
    schema: mergeSchema(form.schema, contributions),
  };
  if (watchActions.length > 0) merged.watchActions = watchActions;
  return merged;
}

RegisterComponentSlot(INVITE_FORM_SLOT_ID, (options) =>
  resolveInviteFormSlot(options, INVITE_FORM_HOST),
);
RegisterComponentSlot(INVITE_EDIT_FORM_SLOT_ID, (options) =>
  resolveInviteFormSlot(options, INVITE_EDIT_FORM_HOST),
);
