import { BasicDataModel } from "@antelopejs/interface-database-decorators";
import { getRegisteredSubjects } from "../../implementations/dms-notifications/registry";
import {
  UserNotificationPreferences,
  userNotificationPreferencesTableName,
} from "../tables";

const buildDefaultPreferences = (): Record<string, boolean> => {
  const subjects = getRegisteredSubjects();
  const preferences: Record<string, boolean> = {};

  for (const subject of subjects) {
    const key = `${subject.category.id}:${subject.id}`;
    preferences[key] = true;
  }

  return preferences;
};

export class UserNotificationPreferencesModel extends BasicDataModel(
  UserNotificationPreferences,
  userNotificationPreferencesTableName,
) {
  async getByUserId(
    userId: string,
  ): Promise<UserNotificationPreferences | undefined> {
    const result = await this.table
      .getAll(userId, "userId")
      .nth(0)
      .default(undefined)
      .run();

    if (!result) {
      return undefined;
    }

    return UserNotificationPreferencesModel.fromDatabase(result);
  }

  async createDefault(userId: string): Promise<UserNotificationPreferences> {
    const defaultPreferences = buildDefaultPreferences();

    await this.table
      .insert({
        userId,
        preferences: defaultPreferences,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .run();

    const created = await this.getByUserId(userId);

    if (!created) {
      throw new Error("Failed to create notification preferences");
    }

    return created;
  }

  async updatePreferences(
    userId: string,
    preferences: Record<string, boolean>,
  ): Promise<Record<string, boolean>> {
    await this.table
      .getAll(userId, "userId")
      .update({
        preferences,
        updatedAt: new Date(),
      })
      .run();

    return preferences;
  }

  async getOrCreatePreferences(
    userId: string,
  ): Promise<UserNotificationPreferences> {
    const existing = await this.getByUserId(userId);

    const hasValidPreferences =
      existing &&
      typeof existing.preferences === "object" &&
      existing.preferences !== null;

    if (hasValidPreferences) {
      return existing;
    }

    if (existing) {
      const defaultPreferences = buildDefaultPreferences();
      await this.updatePreferences(userId, defaultPreferences);
      // The spread row is an AntelopeJS table class: `Table` declares one
      // field and a static, no instance methods, and the value is
      // serialised to JSON on the way out. No prototype to lose.
      // oxlint-disable-next-line typescript/no-misused-spread
      return { ...existing, preferences: defaultPreferences };
    }

    return await this.createDefault(userId);
  }
}
