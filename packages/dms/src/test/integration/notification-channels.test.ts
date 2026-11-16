import type { AxiosInstance } from "axios";
import { expect } from "chai";
import { SendableNotification } from "@antelopejs/interface-dms/notifications/sendable";
import type {
  NotificationCategoryInfo,
  NotificationChannelInfo,
  NotificationData,
  NotificationDeliveryContext,
  NotificationSubjectInfo,
} from "@antelopejs/interface-dms/notifications/types";
import { pageRoutePath } from "@antelopejs/interface-dms/page";
import { internal } from "../../implementations/dms-notifications";
import { authorizedClient, registerUser } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";

const NOTIFICATIONS = "/settings/user/notifications";
const PREFERENCES = pageRoutePath(NOTIFICATIONS, "/preferences");
const CATEGORIES = pageRoutePath(NOTIFICATIONS, "/categories");
const LIST = pageRoutePath(NOTIFICATIONS, "/list");
const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_FORBIDDEN = 403;

const category: NotificationCategoryInfo = {
  id: "channel-test",
  labelKey: "channel",
  icon: "i-ph-envelope",
  togglePermission: "default",
};
const optIn: NotificationSubjectInfo = {
  id: "opt-in",
  labelKey: "opt-in",
  category,
  channels: { email: true },
};
const optOut: NotificationSubjectInfo = {
  id: "opt-out",
  labelKey: "opt-out",
  category,
  channels: { email: { defaultOn: true } },
};
const inAppOnly: NotificationSubjectInfo = {
  id: "in-app-only",
  labelKey: "in-app-only",
  category,
};
const locked: NotificationSubjectInfo = {
  id: "locked",
  labelKey: "locked",
  category,
  togglePermission: "forbidden",
  channels: { email: true },
};
const SUBJECTS = [optIn, optOut, inAppOnly, locked];
const emailKey = (subject: NotificationSubjectInfo) =>
  `${category.id}:${subject.id}@email`;
const inAppKey = (subject: NotificationSubjectInfo) =>
  `${category.id}:${subject.id}`;

interface Delivery {
  userId: string;
  data: NotificationData;
  context: NotificationDeliveryContext;
}

interface CatalogSubject {
  id: string;
  channels: Record<string, { defaultOn: boolean }>;
}

let deliveries: Delivery[] = [];
let failing = false;
const channel: NotificationChannelInfo = {
  id: "email",
  deliver: (userId, data, context) => {
    if (failing) throw new Error("mail server down");
    deliveries.push({ userId, data, context });
  },
};

let sequence = 0;
function notificationOn(
  subject: NotificationSubjectInfo,
): SendableNotification {
  sequence += 1;
  return new SendableNotification({
    icon: "i-ph-envelope",
    title: `Channel test ${sequence} on ${subject.id}`,
    description: "Channel test.",
    subject,
  });
}

async function titlesOf(client: AxiosInstance): Promise<string[]> {
  const list = await client.get<{ title: string }[]>(LIST);
  return list.data.map((row) => row.title);
}

/** The signed-in user of a suite. */
interface ChannelTestUser {
  client: () => AxiosInstance;
  userId: () => string;
}

/** Registers the test taxonomy on a fresh database and signs a user in. */
function useChannelTestUser(): ChannelTestUser {
  let client: AxiosInstance | undefined;
  let userId = "";
  before(async () => {
    await resetDatabase();
    const user = await registerUser({ owner: true });
    client = authorizedClient(user.accessToken);
    userId = user.userId;
    internal.RegisterNotificationCategory.register(category);
    for (const subject of SUBJECTS) {
      internal.RegisterNotificationSubject.register(subject);
    }
  });
  after(() => {
    for (const subject of SUBJECTS) {
      internal.RegisterNotificationSubject.unregister(subject);
    }
    internal.RegisterNotificationCategory.unregister(category);
  });
  return {
    client: () => {
      if (!client) throw new Error("The test user is not signed in");
      return client;
    },
    userId: () => userId,
  };
}

interface Catalog {
  channels: string[];
  subjects: CatalogSubject[];
}

describe("[integration] notification channels, none registered", () => {
  const user = useChannelTestUser();

  it("lists no channel and no offer (fails when the screen would draw an e-mail switch no module delivers)", async () => {
    const catalog = await user.client().get<Catalog>(CATEGORIES);
    const subject = catalog.data.subjects.find((s) => s.id === optIn.id);
    expect(catalog.data.channels).to.deep.equal([]);
    expect(subject?.channels).to.deep.equal({});
  });

  it("refuses an e-mail preference (fails when a key for an unregistered channel is stored)", async () => {
    const refused = await user.client().patch(PREFERENCES, {
      [emailKey(optIn)]: true,
    });
    expect(refused.status).to.equal(HTTP_BAD_REQUEST);
  });
});

describe("[integration] notification channels, one registered", () => {
  const user = useChannelTestUser();
  const patch = (changes: Record<string, boolean>) =>
    user.client().patch<Record<string, boolean>>(PREFERENCES, changes);

  before(() => {
    internal.RegisterNotificationChannel.register(channel);
  });

  after(() => {
    internal.RegisterNotificationChannel.unregister(channel);
  });

  beforeEach(() => {
    deliveries = [];
    failing = false;
  });

  it("lists the channel and each subject's offer with its default (fails when the defaults are not read from the subject)", async () => {
    const catalog = await user.client().get<Catalog>(CATEGORIES);
    const offers = Object.fromEntries(
      catalog.data.subjects.map((s) => [s.id, s.channels]),
    );
    expect(catalog.data.channels).to.deep.equal(["email"]);
    expect(offers[optIn.id]).to.deep.equal({ email: { defaultOn: false } });
    expect(offers[optOut.id]).to.deep.equal({ email: { defaultOn: true } });
    expect(offers[inAppOnly.id]).to.deep.equal({});
  });

  it("does not mail a subject offered off until the user turns it on, then mails it with its tenant (fails when the default is on or the tenant is lost)", async () => {
    await notificationOn(optIn).toUser(user.userId());
    expect(deliveries).to.have.length(0);

    const saved = await patch({ [emailKey(optIn)]: true });
    expect(saved.status, JSON.stringify(saved.data)).to.equal(HTTP_OK);
    expect(saved.data[emailKey(optIn)]).to.equal(true);

    await notificationOn(optIn).toUser(user.userId(), { tenantId: "tenant-a" });
    expect(deliveries).to.have.length(1);
    expect(deliveries[0]?.userId).to.equal(user.userId());
    expect(deliveries[0]?.data.tenantId).to.equal("tenant-a");
    expect(deliveries[0]?.context.notificationId).to.be.a("string");
  });

  it("mails a subject offered on until the user turns it off (fails when defaultOn is ignored or the choice is not read)", async () => {
    await notificationOn(optOut).toUser(user.userId());
    expect(deliveries).to.have.length(1);

    await patch({ [emailKey(optOut)]: false });
    await notificationOn(optOut).toUser(user.userId());
    expect(deliveries).to.have.length(1);
  });

  it("never mails a subject that offers no e-mail, and refuses its e-mail key (fails when every subject is mailed)", async () => {
    await notificationOn(inAppOnly).toUser(user.userId());
    const refused = await patch({ [emailKey(inAppOnly)]: true });
    expect(deliveries).to.have.length(0);
    expect(refused.status).to.equal(HTTP_BAD_REQUEST);
  });

  it("does not mail a subject the user turned off in the app (fails when the channel runs without a stored notification)", async () => {
    await patch({ [inAppKey(optIn)]: false, [emailKey(optIn)]: true });
    await notificationOn(optIn).toUser(user.userId());
    await patch({ [inAppKey(optIn)]: true });
    expect(deliveries).to.have.length(0);
  });

  it("mails a locked subject whatever is stored, and refuses turning its e-mail off (fails when the lock covers only the app)", async () => {
    const refused = await patch({ [emailKey(locked)]: false });
    await notificationOn(locked).toUser(user.userId());
    expect(refused.status).to.equal(HTTP_FORBIDDEN);
    expect(deliveries).to.have.length(1);
  });

  it("mails an idempotent send once however often it is retried (fails when a retry mails again)", async () => {
    await patch({ [emailKey(optOut)]: true });
    const keyed = notificationOn(optOut);
    await keyed.toUsersIdempotently([user.userId()], "channel-test-event");
    await keyed.toUsersIdempotently([user.userId()], "channel-test-event");
    expect(deliveries).to.have.length(1);
    expect(deliveries[0]?.context.idempotencyKey).to.equal(
      "channel-test-event",
    );
  });

  it("mails a repeat dropped by the duplicate window once (fails when a deduplicated send still mails)", async () => {
    const sendable = notificationOn(optOut);
    await sendable.toUser(user.userId());
    await sendable.toUser(user.userId());
    expect(deliveries).to.have.length(1);
  });

  it("keeps the in-app notification when the channel throws (fails when a channel error fails the send)", async () => {
    failing = true;
    await notificationOn(optOut).toUser(user.userId());
    expect(await titlesOf(user.client())).to.include(
      `Channel test ${sequence} on ${optOut.id}`,
    );
  });
});
