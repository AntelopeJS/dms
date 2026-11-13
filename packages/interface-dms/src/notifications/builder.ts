import { SendableNotification } from "./sendable";
import type {
  NotificationData,
  NotificationSubjectInfo,
  NotificationTone,
  RequiredFields,
} from "./types";

const REQUIRED_FIELDS: Record<RequiredFields, true> = {
  icon: true,
  title: true,
  description: true,
  subject: true,
};

function missingFields(data: Partial<NotificationData>): string[] {
  const supplied = new Set(
    Object.entries(data)
      .filter(([, value]) => value !== undefined)
      .map(([field]) => field),
  );
  return Object.keys(REQUIRED_FIELDS).filter((field) => !supplied.has(field));
}

function isComplete(data: Partial<NotificationData>): data is NotificationData {
  return missingFields(data).length === 0;
}

export class NotificationBuilder<Set extends string = never> {
  private data: Partial<NotificationData> = {};

  icon(value: string): NotificationBuilder<Set | "icon"> {
    this.data.icon = value;
    const next = new NotificationBuilder<Set | "icon">();
    next.data = this.data;
    return next;
  }

  title(value: string): NotificationBuilder<Set | "title"> {
    this.data.title = value;
    const next = new NotificationBuilder<Set | "title">();
    next.data = this.data;
    return next;
  }

  description(value: string): NotificationBuilder<Set | "description"> {
    this.data.description = value;
    const next = new NotificationBuilder<Set | "description">();
    next.data = this.data;
    return next;
  }

  subject(
    subject: NotificationSubjectInfo,
  ): NotificationBuilder<Set | "subject"> {
    this.data.subject = subject;
    const next = new NotificationBuilder<Set | "subject">();
    next.data = this.data;
    return next;
  }

  linkTo(value: string): NotificationBuilder<Set | "linkTo"> {
    this.data.linkTo = value;
    const next = new NotificationBuilder<Set | "linkTo">();
    next.data = this.data;
    return next;
  }

  params(
    value: Record<string, string | number>,
  ): NotificationBuilder<Set | "params"> {
    this.data.params = value;
    const next = new NotificationBuilder<Set | "params">();
    next.data = this.data;
    return next;
  }

  /** Colours the icon well the notification is listed with. */
  tone(value: NotificationTone): NotificationBuilder<Set | "tone"> {
    this.data.tone = value;
    const next = new NotificationBuilder<Set | "tone">();
    next.data = this.data;
    return next;
  }

  build(
    this: RequiredFields extends Set ? NotificationBuilder<Set> : never,
  ): SendableNotification {
    if (!isComplete(this.data)) {
      throw new Error(
        `Notification is missing required fields: ${missingFields(this.data).join(", ")}`,
      );
    }
    return new SendableNotification(this.data);
  }
}
