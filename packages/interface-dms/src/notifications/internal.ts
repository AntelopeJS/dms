import {
  InterfaceFunction,
  RegisteringProxy,
} from "@antelopejs/interface-core";
import type {
  NotificationCategoryInfo,
  NotificationData,
  NotificationSubjectInfo,
  ReadScope,
} from "./types";

// On its own rather than in index.ts: sendable.ts sends through these proxies
// and index.ts imports the builder that imports sendable, so reading them from
// the barrel closed a cycle.

/**
 * @internal
 */
export namespace internal {
  export const SupportsIdempotency =
    InterfaceFunction<() => Promise<boolean>>();

  export const RegisterNotificationCategory = new RegisteringProxy<
    (info: NotificationCategoryInfo) => void
  >();
  export const RegisterNotificationSubject = new RegisteringProxy<
    (info: NotificationSubjectInfo) => void
  >();

  export const SendToUser =
    InterfaceFunction<
      (
        userId: string,
        data: NotificationData,
        groupId?: string,
        idempotencyKey?: string,
      ) => Promise<void>
    >();

  export const SendToUsers =
    InterfaceFunction<
      (
        userIds: string[],
        data: NotificationData,
        readScope?: ReadScope,
        idempotencyKey?: string,
      ) => Promise<void>
    >();

  export const SendToRoles =
    InterfaceFunction<
      (
        roleIds: string[],
        data: NotificationData,
        readScope?: ReadScope,
        idempotencyKey?: string,
      ) => Promise<void>
    >();

  export const SendToAll =
    InterfaceFunction<
      (
        data: NotificationData,
        readScope?: ReadScope,
        idempotencyKey?: string,
      ) => Promise<void>
    >();
}
