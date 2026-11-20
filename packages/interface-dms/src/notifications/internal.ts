import {
  InterfaceFunction,
  RegisteringProxy,
} from "@antelopejs/interface-core";
import type {
  DeliveryOptions,
  NotificationCategoryInfo,
  NotificationEmailChannelInfo,
  NotificationData,
  NotificationSubjectInfo,
  ReadScope,
  RoleSendOptions,
} from "./types";
import { RegistrationIdentity } from "../page/internal/registry";

/**
 * @internal
 */
export namespace internal {
  export const RegisterNotificationCategory = new RegisteringProxy<
    (info: NotificationCategoryInfo) => void
  >();
  export const RegisterNotificationSubject = new RegisteringProxy<
    (info: NotificationSubjectInfo) => void
  >();

  export const RegisterNotificationEmailChannel = new RegisteringProxy<
    (info: NotificationEmailChannelInfo) => void
  >();

  /** Tells the registration a module unloads from the one that replaced it. */
  export const emailChannelIdentity =
    new RegistrationIdentity<NotificationEmailChannelInfo>(
      "notification-email-channel",
    );

  export const SendToUser =
    InterfaceFunction<
      (
        userId: string,
        data: NotificationData,
        groupId?: string,
        idempotencyKey?: string,
        delivery?: DeliveryOptions,
      ) => Promise<void>
    >();

  export const SendToUsers =
    InterfaceFunction<
      (
        userIds: string[],
        data: NotificationData,
        readScope?: ReadScope,
        idempotencyKey?: string,
        delivery?: DeliveryOptions,
      ) => Promise<void>
    >();

  export const SendToRoles =
    InterfaceFunction<
      (
        roleIds: string[],
        data: NotificationData,
        options?: RoleSendOptions,
      ) => Promise<void>
    >();

  export const SendToAll =
    InterfaceFunction<
      (
        data: NotificationData,
        readScope?: ReadScope,
        idempotencyKey?: string,
        delivery?: DeliveryOptions,
      ) => Promise<void>
    >();
}
