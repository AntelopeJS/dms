import { Logging } from "@antelopejs/interface-core/logging";
import {
  type FieldGroupSerialized,
  type FormFieldOrGroupSerialized,
  type FormFieldSerialized,
  type FormPropsSerialized,
  isFieldGroupSerialized,
} from "../base/form";
import type { WatchAction } from "../base/types/watch";
import {
  COMPONENT_SLOT_KEY,
  RegisterComponentSlot,
  type SlotOptions,
} from "../component-slots";
import { inviteExtensionFieldId } from "./field-ids";
import {
  type InviteExtensionEntry,
  listInviteExtensionEntries,
  logInviteExtensionFailure,
} from "./registry";
import type { InviteExtensionInfo, InviteFieldContribution } from "./types";

/** Slot the DMS invite form opens for `RegisterInviteExtension`. */
export const INVITE_FORM_SLOT_ID = "dms.invite-form";

/**
 * Slot the edit form of a pending invitation opens, so the contributed fields
 * can be changed until the invitee accepts.
 */
export const INVITE_EDIT_FORM_SLOT_ID = "dms.invite-edit-form";

/** How one of the invite forms hosts the contributed blocks. */
interface InviteFormHost {
  /** Blocks of an extension that is not `editable` render read-only. */
  isEditForm: boolean;
  /**
   * Invite-form field ids an extension may anchor on, as this form names
   * them. The edit form lists the invitation's own columns, and the roles
   * field there goes by its stored name.
   */
  anchorAliases: Record<string, string>;
}

const INVITE_FORM_HOST: InviteFormHost = {
  isEditForm: false,
  anchorAliases: {},
};

const INVITE_EDIT_FORM_HOST: InviteFormHost = {
  isEditForm: true,
  anchorAliases: { roles: "roles_ids" },
};

interface JsonSchemaObject {
  properties?: Record<string, unknown>;
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
    if (typeof params[param] === "string") {
      params[param] = inviteExtensionFieldId(key, params[param] as string);
    }
  }
  const conditions = watch.onParam
    ? [watch.onParam].flat().map((condition) =>
        condition.key === WATCH_FIELD_CONDITION_KEY &&
        typeof condition.value === "string"
          ? {
              ...condition,
              value: inviteExtensionFieldId(key, condition.value),
            }
          : condition,
      )
    : undefined;

  // `onParam` is set only when the contribution declared conditions.
  const resolvedWatch: WatchAction = { ...watch, params };
  if (conditions) resolvedWatch.onParam = conditions;
  return resolvedWatch;
}

function prefixSchemaEntries(
  key: string,
  schema: unknown,
): Pick<InviteFieldContribution, "properties" | "requiredProperties"> {
  const source = (schema ?? {}) as JsonSchemaObject;
  const properties: Record<string, unknown> = {};
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
  // Serializing here — not at registration — is what runs the form's option
  // transforms, so the upload fields it carries are stamped exactly as they
  // would be on a page that hosts the form directly.
  const serialized = await info.component.serialize();
  const options = serialized.options as FormPropsSerialized | undefined;
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

  const watchActions = (
    (options as { watchActions?: WatchAction[] } | undefined)?.watchActions ??
    []
  ).map((watch) => prefixWatchAction(info.key, watch));

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
      // Cleared so a later request retries: a transient failure (an unreachable
      // signing implementation while the DMS is still starting) must not leave
      // the extension permanently out of the modal.
      entry.contribution = undefined;
      return undefined;
    },
  );
  return entry.contribution;
}

// Every criterion is intrinsic to the declaration — never module start order —
// so the modal assembles identically on every host and across restarts. Keys
// are unique, so they close the total order.
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

// Returns a copy: the contribution is the process-wide cache shared by every
// request and by both invite forms.
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
  // Cloned, not spread: the group hangs off a process-wide cache shared by
  // every request, and a shallow copy would hand each of them the same field
  // objects — one in-place edit downstream and the cache is corrupted for
  // every tenant.
  //
  // A contributed block lays out like the form it lands in unless its author
  // asked otherwise: a block that reads sideways in a column of fields looks
  // like a rendering bug, not like a deliberate choice.
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

// The browser validates against the form's JSON schema, so a contributed field
// left out of it would submit unchecked — its own `required` flag included.
function mergeSchema(
  own: unknown,
  contributions: InviteFieldContribution[],
): unknown {
  if (!own || typeof own !== "object") return own;
  const source = own as JsonSchemaObject;

  return {
    ...source,
    properties: Object.assign(
      {},
      source.properties,
      ...contributions.map((contribution) => contribution.properties),
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
  // The marker has done its job here; leaving it in would ship an internal id
  // to the browser, where an unknown form prop lands as a DOM attribute.
  const { [COMPONENT_SLOT_KEY]: _slot, ...resolved } = options;
  const contributions = (await collectContributions()).map((contribution) =>
    adaptToHost(contribution, host),
  );
  if (contributions.length === 0) return resolved;

  // The source and the target do not overlap, so this cannot be one
  // assertion: the value reaches here through a decorator, a JWT
  // payload or a filter tuple, none of which the type system sees.
  // oxlint-disable-next-line anti-slop/no-chained-type-assertions
  const form = options as unknown as FormPropsSerialized & {
    watchActions?: WatchAction[];
  };
  const watchActions = [
    ...(form.watchActions ?? []),
    ...contributions.flatMap((contribution) => contribution.watchActions),
  ];

  // `watchActions` is set only when there is at least one, so a form with none
  // carries no key for it.
  const merged: Record<string, unknown> = {
    ...resolved,
    fields: assembleFields(
      form.fields ?? [],
      contributions,
      form.fieldsOrientation,
    ),
    schema: mergeSchema(form.schema, contributions),
  };
  if (watchActions.length > 0) merged.watchActions = watchActions;
  return merged as SlotOptions;
}

// Claimed on import: the DMS invite forms declare their slots at page
// registration, which can run before any module extends them.
RegisterComponentSlot(INVITE_FORM_SLOT_ID, (options) =>
  resolveInviteFormSlot(options, INVITE_FORM_HOST),
);
RegisterComponentSlot(INVITE_EDIT_FORM_SLOT_ID, (options) =>
  resolveInviteFormSlot(options, INVITE_EDIT_FORM_HOST),
);
