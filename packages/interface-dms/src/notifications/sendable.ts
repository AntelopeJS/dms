import { internal } from "./internal";
import type { DeliveryOptions, NotificationData, SendOptions } from "./types";

function deliveryOf(options: SendOptions): DeliveryOptions {
  return { dedupe: options.dedupe };
}

export class SendableNotification {
  private readonly data: NotificationData;

  constructor(data: NotificationData) {
    this.data = Object.freeze({ ...data }) as NotificationData;
  }

  /**
   * Sends to one recipient, optionally deduplicating a stable event key. A
   * repeat of what the recipient received in the last 10 seconds is dropped
   * unless `dedupe: false` (see {@link DeliveryOptions}).
   */
  async toUser(userId: string, options: SendOptions = {}): Promise<void> {
    await this.requireIdempotencySupport(options);
    await internal.SendToUser(
      userId,
      this.data,
      undefined,
      options.idempotencyKey,
      deliveryOf(options),
    );
  }

  async toUsers(userIds: string[], options: SendOptions = {}): Promise<void> {
    await this.requireIdempotencySupport(options);
    await internal.SendToUsers(
      userIds,
      this.data,
      options.readScope,
      options.idempotencyKey,
      deliveryOf(options),
    );
  }

  /** Explicit capability for durable outbox delivery; older DMS versions do not expose this method. */
  async toUsersIdempotently(
    userIds: string[],
    idempotencyKey: string,
    options: SendOptions = {},
  ): Promise<void> {
    await this.toUsers(userIds, { ...options, idempotencyKey });
  }

  async toRoles(roleIds: string[], options: SendOptions = {}): Promise<void> {
    await this.requireIdempotencySupport(options);
    await internal.SendToRoles(
      roleIds,
      this.data,
      options.readScope,
      options.idempotencyKey,
      deliveryOf(options),
    );
  }

  async broadcast(options: SendOptions = {}): Promise<void> {
    await this.requireIdempotencySupport(options);
    await internal.SendToAll(
      this.data,
      options.readScope,
      options.idempotencyKey,
      deliveryOf(options),
    );
  }

  private async requireIdempotencySupport(options: SendOptions): Promise<void> {
    if (options.idempotencyKey === undefined) return;
    if ((await internal.SupportsIdempotency()) !== true) {
      throw new Error("DMS idempotent notification delivery is unavailable");
    }
  }
}
