import { BasicDataModel } from "@antelopejs/interface-database-decorators";
import { getRegisteredSubjects } from "../../implementations/dms-notifications/registry";
import {
  UserNotificationPreferences,
  userNotificationPreferencesTableName,
} from "../tables";

const buildDefaultPreferences =
  (): UserNotificationPreferences["preferences"] => {
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

  /** Removes the preferences of a user whose account is deleted. */
  async purgeUser(userId: string): Promise<void> {
    await this.table.getAll(userId, "userId").delete().run();
  }

  /**
   * Creates a user's preferences, keyed by the user id so concurrent first
   * reads collide on the primary key instead of each inserting a row: the
   * loser reads back the winner's.
   */
  async createDefault(userId: string): Promise<UserNotificationPreferences> {
    let insertError: unknown;
    try {
      await this.table
        .insert({
          _id: userId,
          userId,
          preferences: buildDefaultPreferences(),
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .run();
    } catch (error) {
      insertError = error;
    }

    const created = await this.get(userId);

    if (!created) {
      throw (
        insertError ?? new Error("Failed to create notification preferences")
      );
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

  /**
   * Applies a partial map on top of the stored preferences in one database
   * update, so switches saved concurrently each keep their own change.
   */
  async mergePreferences(
    userId: string,
    changes: Record<string, boolean>,
  ): Promise<Record<string, boolean>> {
    await this.getOrCreatePreferences(userId);
    await this.table
      .getAll(userId, "userId")
      .update((row) => ({
        preferences: row.key("preferences").merge(changes),
        updatedAt: new Date(),
      }))
      .run();

    const stored = await this.getByUserId(userId);
    return stored?.preferences ?? changes;
  }

  async getOrCreatePreferences(
    userId: string,
  ): Promise<UserNotificationPreferences> {
    const existing = await this.getByUserId(userId);

    const hasValidPreferences =
      existing &&
      // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Legacy stored preferences can be missing or malformed; preserve the existing object check and default repair path.
      typeof existing.preferences === "object" &&
      existing.preferences !== null;

    if (hasValidPreferences) {
      return existing;
    }

    if (existing) {
      const defaultPreferences = buildDefaultPreferences();
      await this.updatePreferences(userId, defaultPreferences);

      // oxlint-disable-next-line typescript/no-misused-spread -- Preserve the existing repaired row's own persisted fields and replacement preferences without introducing prototype methods into its return value.
      return { ...existing, preferences: defaultPreferences };
    }

    return await this.createDefault(userId);
  }
}
