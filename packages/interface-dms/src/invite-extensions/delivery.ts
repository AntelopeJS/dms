import type { TenantMember } from "../db";
import { assertSliceValid, readPayload, sliceOf } from "./payload-slices";
import { listInviteExtensions, logInviteExtensionFailure } from "./registry";
import type {
  InviteCleanupContext,
  InviteDeliveryOptions,
  InviteExtensionContext,
  InviteExtensionPayloads,
} from "./types";

export { HTTP_BAD_REQUEST } from "./payload-slices";

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
    assertSliceValid(info, slice);
    payloads[info.key] = slice;
  }

  return payloads;
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
