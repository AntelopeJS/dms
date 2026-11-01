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
    if (!isComplete(this.data)) {
      throw new Error(
        `Notification is missing required fields: ${missingFields(this.data).join(", ")}`,
      );
    }
    return new SendableNotification(this.data);
  }
}
