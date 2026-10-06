import { GetModel } from "@antelopejs/interface-database-decorators";
import type { AxiosInstance } from "axios";
import { expect } from "chai";
import { SendableNotification } from "@antelopejs/interface-dms/notifications/sendable";
import type {
  NotificationCategoryInfo,
  NotificationSubjectInfo,
} from "@antelopejs/interface-dms/notifications/types";
import { UserNotificationPreferencesModel } from "../../db/models/userNotificationPreferences.model";
import { internal } from "../../implementations/dms-notifications";
import { authorizedClient, registerUser } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";

// A locked (mandatory) subject cannot be muted: not through the legacy PUT that
// replaces the whole map, and not by a `false` stored before the lock — the
// send ignores it.

const PREFERENCES = "/settings/user/notifications/preferences";
const HTTP_OK = 200;
const HTTP_FORBIDDEN = 403;

const category: NotificationCategoryInfo = {
  id: "locked-test",
  labelKey: "locked",
  icon: "i-ph-lock",
  togglePermission: "default",
};
const locked: NotificationSubjectInfo = {
  id: "mandatory",
  labelKey: "mandatory",
  category,
  togglePermission: "forbidden",
};
const optional: NotificationSubjectInfo = {
  id: "optional",
  labelKey: "optional",
  category,
};
const LOCKED_KEY = `${category.id}:${locked.id}`;
const OPTIONAL_KEY = `${category.id}:${optional.id}`;
const UNREGISTERED_KEY = "gone-module:subject";

interface StoredNotification {
  title: string;
}

describe("[integration] locked notification subjects", () => {
  let client: AxiosInstance;
  let userId: string;

  before(async () => {
    await resetDatabase();
    const user = await registerUser({ owner: true });
    client = authorizedClient(user.accessToken);
    userId = user.userId;
    internal.RegisterNotificationCategory.register(category);
    internal.RegisterNotificationSubject.register(locked);
    internal.RegisterNotificationSubject.register(optional);
  });

  after(() => {
    internal.RegisterNotificationSubject.unregister(optional);
    internal.RegisterNotificationSubject.unregister(locked);
    internal.RegisterNotificationCategory.unregister(category);
  });

  it("refuses the legacy PUT turning a locked subject off", async () => {
    const response = await client.put(PREFERENCES, { [LOCKED_KEY]: false });
    expect(response.status).to.equal(HTTP_FORBIDDEN);
  });

  it("keeps the legacy PUT for the other subjects, stale keys included", async () => {
    const response = await client.put(PREFERENCES, {
      [LOCKED_KEY]: true,
      [OPTIONAL_KEY]: false,
      [UNREGISTERED_KEY]: false,
    });
    expect(response.status, JSON.stringify(response.data)).to.equal(HTTP_OK);
  });

  it("delivers a locked subject whatever the stored preference says", async () => {
    await GetModel(UserNotificationPreferencesModel).updatePreferences(userId, {
      [LOCKED_KEY]: false,
      [OPTIONAL_KEY]: false,
    });
    for (const subject of [locked, optional]) {
      await new SendableNotification({
        icon: "i-ph-lock",
        title: `Sent on ${subject.id}`,
        description: "Locked subject test.",
        subject,
      }).toUser(userId);
    }
    const list = await client.get("/settings/user/notifications/list");
    const titles = (list.data as StoredNotification[]).map((row) => row.title);
    expect(titles).to.include("Sent on mandatory");
    expect(titles).to.not.include("Sent on optional");
  });
});
