import { GetModel } from "@antelopejs/interface-database-decorators";
import type { AxiosInstance } from "axios";
import { expect } from "chai";
import { SendableNotification } from "@antelopejs/interface-dms/notifications/sendable";
import type {
  NotificationCategoryInfo,
  NotificationSubjectInfo,
} from "@antelopejs/interface-dms/notifications/types";
import { UserNotificationPreferencesModel } from "../../db/models";
import { internal } from "../../implementations/dms-notifications";
import { authorizedClient, registerUser } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { pageRoutePath } from "@antelopejs/interface-dms/page";

const PREFERENCES = pageRoutePath(
  "/settings/user/notifications",
  "/preferences",
);
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

  it("refuses a PATCH turning a locked subject off, and saves one turning an optional subject off (fails when a locked subject can be turned off)", async () => {
    const refused = await client.patch(PREFERENCES, { [LOCKED_KEY]: false });
    const saved = await client.patch(PREFERENCES, { [OPTIONAL_KEY]: false });
    expect(refused.status).to.equal(HTTP_FORBIDDEN);
    expect(saved.status, JSON.stringify(saved.data)).to.equal(HTTP_OK);
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
    const list = await client.get<StoredNotification[]>(
      pageRoutePath("/settings/user/notifications", "/list"),
    );
    const titles = list.data.map((row) => row.title);
    expect(titles).to.include("Sent on mandatory");
    expect(titles).to.not.include("Sent on optional");
  });
});
