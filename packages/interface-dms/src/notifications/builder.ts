/* oxlint-disable anti-slop/no-chained-type-assertions -- Setters widen the phantom set-of-fields type on the same builder instance; TypeScript does not narrow this to that generic instantiation. */
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
    return this as unknown as NotificationBuilder<Set | "icon">;
  }

  title(value: string): NotificationBuilder<Set | "title"> {
    this.data.title = value;
    return this as unknown as NotificationBuilder<Set | "title">;
  }

  description(value: string): NotificationBuilder<Set | "description"> {
    this.data.description = value;
    return this as unknown as NotificationBuilder<Set | "description">;
  }

  subject(
    subject: NotificationSubjectInfo,
  ): NotificationBuilder<Set | "subject"> {
    this.data.subject = subject;
    return this as unknown as NotificationBuilder<Set | "subject">;
  }

  linkTo(value: string): NotificationBuilder<Set | "linkTo"> {
    this.data.linkTo = value;
    return this as unknown as NotificationBuilder<Set | "linkTo">;
  }

  params(
    value: Record<string, string | number>,
  ): NotificationBuilder<Set | "params"> {
    this.data.params = value;
    return this as unknown as NotificationBuilder<Set | "params">;
  }

  /** Colours the icon well the notification is listed with. */
  tone(value: NotificationTone): NotificationBuilder<Set | "tone"> {
    this.data.tone = value;
    return this as unknown as NotificationBuilder<Set | "tone">;
  }

  build(
    this: RequiredFields extends Set ? NotificationBuilder<Set> : never,
  ): SendableNotification {
    return new SendableNotification(this.data as NotificationData);
  }
}
