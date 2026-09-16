import { internal } from "./internal";
import type { NotificationData, SendOptions } from "./types";

export class SendableNotification {
  private readonly data: NotificationData;

  constructor(data: NotificationData) {
    this.data = Object.freeze({ ...data }) as NotificationData;
  }

  /** Sends to one recipient, optionally deduplicating a stable event key. */
  async toUser(userId: string, options: SendOptions = {}): Promise<void> {
    await this.requireIdempotencySupport(options);
    await internal.SendToUser(
      userId,
      this.data,
      undefined,
      options.idempotencyKey,
    );
  }

  async toUsers(userIds: string[], options: SendOptions = {}): Promise<void> {
    await this.requireIdempotencySupport(options);
    await internal.SendToUsers(
      userIds,
      this.data,
      options.readScope,
      options.idempotencyKey,
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
    );
  }

  async broadcast(options: SendOptions = {}): Promise<void> {
    await this.requireIdempotencySupport(options);
    await internal.SendToAll(
      this.data,
      options.readScope,
      options.idempotencyKey,
    );
  }

  private async requireIdempotencySupport(options: SendOptions): Promise<void> {
    if (options.idempotencyKey === undefined) return;
    if ((await internal.SupportsIdempotency()) !== true) {
      throw new Error("DMS idempotent notification delivery is unavailable");
    }
  }
}
