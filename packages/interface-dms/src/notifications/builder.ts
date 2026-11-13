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

/**
 * The builder a setter returns: the same instance, now recording `Next` as set.
 * `Set` is a phantom parameter that only `build`'s `this` parameter reads.
 */
function filled<Set extends string, Next extends string>(
  builder: NotificationBuilder<Set>,
): NotificationBuilder<Set | Next> {
  // SAFETY: Holds for every Set and Next: Set appears only in the this parameter of build, so NotificationBuilder<Set | Next> and NotificationBuilder<Set> describe the same instance and the same data object.
  return builder as NotificationBuilder<Set | Next>;
}

export class NotificationBuilder<Set extends string = never> {
  private data: Partial<NotificationData> = {};

  icon(value: string): NotificationBuilder<Set | "icon"> {
    this.data.icon = value;
    return filled<Set, "icon">(this);
  }

  title(value: string): NotificationBuilder<Set | "title"> {
    this.data.title = value;
    return filled<Set, "title">(this);
  }

  description(value: string): NotificationBuilder<Set | "description"> {
    this.data.description = value;
    return filled<Set, "description">(this);
  }

  subject(
    subject: NotificationSubjectInfo,
  ): NotificationBuilder<Set | "subject"> {
    this.data.subject = subject;
    return filled<Set, "subject">(this);
  }

  linkTo(value: string): NotificationBuilder<Set | "linkTo"> {
    this.data.linkTo = value;
    return filled<Set, "linkTo">(this);
  }

  params(
    value: Record<string, string | number>,
  ): NotificationBuilder<Set | "params"> {
    this.data.params = value;
    return filled<Set, "params">(this);
  }

  /** Colours the icon well the notification is listed with. */
  tone(value: NotificationTone): NotificationBuilder<Set | "tone"> {
    this.data.tone = value;
    return filled<Set, "tone">(this);
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
