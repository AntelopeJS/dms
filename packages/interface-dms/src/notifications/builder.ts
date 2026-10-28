import { SendableNotification } from "./sendable";
import type {
  NotificationData,
  NotificationSubjectInfo,
  NotificationTone,
  RequiredFields,
} from "./types";

export class NotificationBuilder<Set extends string = never> {
  private data: Partial<NotificationData> = {};

  icon(value: string): NotificationBuilder<Set | "icon"> {
    this.data.icon = value;
    // SAFETY: The setter has filled icon on this instance; Set tracks filled fields without changing the runtime instance.
    return this as NotificationBuilder<Set | "icon">;
  }

  title(value: string): NotificationBuilder<Set | "title"> {
    this.data.title = value;
    // SAFETY: The setter has filled title on this instance; Set tracks filled fields without changing the runtime instance.
    return this as NotificationBuilder<Set | "title">;
  }

  description(value: string): NotificationBuilder<Set | "description"> {
    this.data.description = value;
    // SAFETY: The setter has filled description on this instance; Set tracks filled fields without changing the runtime instance.
    return this as NotificationBuilder<Set | "description">;
  }

  subject(
    subject: NotificationSubjectInfo,
  ): NotificationBuilder<Set | "subject"> {
    this.data.subject = subject;
    // SAFETY: The setter has filled subject on this instance; Set tracks filled fields without changing the runtime instance.
    return this as NotificationBuilder<Set | "subject">;
  }

  linkTo(value: string): NotificationBuilder<Set | "linkTo"> {
    this.data.linkTo = value;
    // SAFETY: The setter has filled linkTo on this instance; Set tracks filled fields without changing the runtime instance.
    return this as NotificationBuilder<Set | "linkTo">;
  }

  params(
    value: Record<string, string | number>,
  ): NotificationBuilder<Set | "params"> {
    this.data.params = value;
    // SAFETY: The setter has filled params on this instance; Set tracks filled fields without changing the runtime instance.
    return this as NotificationBuilder<Set | "params">;
  }

  /** Colours the icon well the notification is listed with. */
  tone(value: NotificationTone): NotificationBuilder<Set | "tone"> {
    this.data.tone = value;
    // SAFETY: The setter has filled tone on this instance; Set tracks filled fields without changing the runtime instance.
    return this as NotificationBuilder<Set | "tone">;
  }

  build(
    this: RequiredFields extends Set ? NotificationBuilder<Set> : never,
  ): SendableNotification {
    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Required fields are unchecked; callers can supply the generic without calling setters.
    return new SendableNotification(this.data as NotificationData);
  }
}
