import { assertValidation } from "@antelopejs/interface-api-util";
import type { TenantMember } from "../db";
import {
  inviteExtensionFieldId,
  splitInviteExtensionFieldId,
} from "./field-ids";
import { listInviteExtensions, logInviteExtensionFailure } from "./registry";
import type {
  InviteCleanupContext,
  InviteDeliveryOptions,
  InviteExtensionContext,
  InviteExtensionInfo,
  InviteExtensionPayloads,
} from "./types";

export const HTTP_BAD_REQUEST = 400;

interface IssueLike {
  path: Array<string | number>;
  message: string;
}

interface StoredPayload {
  value: unknown;
}

function issuesOf(error: unknown): IssueLike[] | undefined {
  const issues = (error as { issues?: unknown }).issues;
  return Array.isArray(issues) ? (issues as IssueLike[]) : undefined;
}

/**
 * Report the failure against the ids the browser knows — the prefixed ones it
 * submitted — so the invite form can point at the offending field rather than
 * at a name only the extension uses.
 *
 * An issue raised on the object itself (a schema-wide `refine`) names no field:
 * it keeps an empty path rather than being handed a fabricated one, which the
 * form could not attach to anything either way.
 */
function describeFailure(key: string, error: unknown): unknown {
  const issues = issuesOf(error);
  if (!issues) return String(error);
  return {
    issues: issues.map(({ path, message }) => ({
      path: path.length
        ? [inviteExtensionFieldId(key, String(path[0])), ...path.slice(1)]
        : [],
      message,
    })),
  };
}

function sliceOf(
  key: string,
  body: Record<string, unknown>,
): Record<string, unknown> {
  const slice: Record<string, unknown> = {};
  for (const [id, value] of Object.entries(body)) {
    const split = splitInviteExtensionFieldId(id);
    if (split?.key === key) {
      slice[split.fieldId] = value;
    }
  }
  return slice;
}

/**
 * Pull each registered extension's slice out of an invite submission and
 * validate it against the extension's own schema.
 *
 * Every registered extension is validated, including one the submission holds
 * no field for: its schema is what decides whether an absent value is legal,
 * not the browser. Keys belonging to an extension that is no longer registered
 * are dropped — a module can stop between the modal opening and its submit.
 *
 * What is stored is the slice as submitted, not what the schema returned: a
 * schema that transforms its input produces an output the same schema would
 * reject on the way back in, so storing the output would make the payload fail
 * its own re-validation at delivery — silently, and after the invitation had
 * been consumed. Parsing happens once, in {@link readPayload}.
 *
 * @throws HTTPResult 400 when a slice does not satisfy its schema
 */
export function CollectInviteExtensionPayloads(
  body: unknown,
): InviteExtensionPayloads {
  const source = (body ?? {}) as Record<string, unknown>;
  const payloads: InviteExtensionPayloads = {};

  for (const info of listInviteExtensions()) {
    const slice = sliceOf(info.key, source);
    assertValidation(
      slice,
      (v) => info.schema.parse(v),
      (error) => describeFailure(info.key, error),
      HTTP_BAD_REQUEST,
    );
    payloads[info.key] = slice;
  }

  return payloads;
}

/**
 * Parse the stored submission into the payload `onAccept` is typed for.
 *
 * The schema runs here rather than being trusted from storage: an invitation
 * can outlive the version of the module that wrote its payload, and this is
 * also where a transforming schema produces its output — exactly once, on the
 * input as the admin submitted it.
 */
function readPayload(
  info: InviteExtensionInfo,
  payloads: InviteExtensionPayloads | null | undefined,
  options: InviteDeliveryOptions,
): StoredPayload | undefined {
  const stored = payloads?.[info.key];
  if (stored === undefined) return undefined;

  const parsed = info.schema.safeParse(stored);
  if (!parsed.success) {
    logInviteExtensionFailure(
      info.key,
      "read its stored payload",
      parsed.error,
    );
    if (options.retryOnFailure) throw parsed.error;
    return undefined;
  }
  return { value: parsed.data };
}

/**
 * Hand each extension the payload its invitation carried, now that the invitee
 * is a member of the tenant.
 *
 * Legacy delivery logs failures. Durable delivery requests retryOnFailure:
 * invalid stored payloads and failed handlers then keep the decision pending.
 */
export async function DeliverInviteExtensions(
  payloads: InviteExtensionPayloads | null | undefined,
  member: TenantMember,
  context: InviteExtensionContext,
  options: InviteDeliveryOptions = {},
): Promise<void> {
  const failures: unknown[] = [];
  for (const info of listInviteExtensions()) {
    try {
      const payload = readPayload(info, payloads, options);
      if (!payload) continue;
      await info.onAccept(payload.value, member, context);
    } catch (error) {
      logInviteExtensionFailure(info.key, "deliver its payload", error);
      failures.push(error);
    }
  }
  if (options.retryOnFailure && failures.length)
    throw new AggregateError(failures, "Invite delivery failed");
}

/**
 * Tell every extension that declared a cleanup handler that the invitation —
 * or the membership it produced — is gone, so it can drop what it derived.
 *
 * Called for every registered extension, with the stored payload when the
 * invitation still had one: a member being removed carries none, and the
 * contributor is expected to key its own data off `context.userId`.
 */
export async function CleanupInviteExtensions(
  payloads: InviteExtensionPayloads | null | undefined,
  context: InviteCleanupContext,
  options: InviteDeliveryOptions = {},
): Promise<void> {
  const failures: unknown[] = [];
  for (const info of listInviteExtensions()) {
    if (!info.onCleanup) continue;
    try {
      await info.onCleanup(
        readPayload(info, payloads, options)?.value,
        context,
      );
    } catch (error) {
      logInviteExtensionFailure(info.key, "clean up after itself", error);
      failures.push(error);
    }
  }
  if (options.retryOnFailure && failures.length)
    throw new AggregateError(failures, "Invite cleanup failed");
}
