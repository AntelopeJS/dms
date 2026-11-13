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
 * Stores `value` under `field` in `data`, the builder's own data object, and
 * returns the same builder, now recording `field` as set. `Set` is a phantom
 * parameter that only `build`'s `this` parameter reads.
 */
function filled<Set extends string, Next extends keyof NotificationData>(
  builder: NotificationBuilder<Set>,
  data: Partial<NotificationData>,
  field: Next,
  value: NotificationData[Next],
): NotificationBuilder<Set | Next> {
  data[field] = value;
  // SAFETY: Holds when data is builder's own data object and Next is the one key field holds, as in each setter, which passes this.data and a literal field Next is inferred from: the line above has just stored value under field in data, and Set appears only in the this parameter of build, so the same instance now has Next set.
  return builder as NotificationBuilder<Set | Next>;
}

export class NotificationBuilder<Set extends string = never> {
  private data: Partial<NotificationData> = {};

  icon(value: string): NotificationBuilder<Set | "icon"> {
    return filled(this, this.data, "icon", value);
  }

  title(value: string): NotificationBuilder<Set | "title"> {
    return filled(this, this.data, "title", value);
  }

  description(value: string): NotificationBuilder<Set | "description"> {
    return filled(this, this.data, "description", value);
  }

  subject(
    subject: NotificationSubjectInfo,
  ): NotificationBuilder<Set | "subject"> {
    return filled(this, this.data, "subject", subject);
  }

  linkTo(value: string): NotificationBuilder<Set | "linkTo"> {
    return filled(this, this.data, "linkTo", value);
  }

  params(
    value: Record<string, string | number>,
  ): NotificationBuilder<Set | "params"> {
    return filled(this, this.data, "params", value);
  }

  /** Colours the icon well the notification is listed with. */
  tone(value: NotificationTone): NotificationBuilder<Set | "tone"> {
    return filled(this, this.data, "tone", value);
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
