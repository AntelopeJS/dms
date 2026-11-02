import type { AxiosInstance } from "axios";
import { expect } from "chai";
import { z } from "zod";
import type { SiteLayoutPayload } from "../../implementations/dms/page";
import { internal } from "../../implementations/dms-notifications";
import { SendableNotification } from "@antelopejs/interface-dms/notifications/sendable";
import type { NotificationSubjectInfo } from "@antelopejs/interface-dms/notifications/types";
import { authorizedClient, registerUser } from "../helpers/auth";
import { createClient } from "../helpers/http";
import { resetDatabase } from "../helpers/db";
import { parseBody } from "../helpers/parse-body";
import { pageRoutePath, type PageLayout } from "@antelopejs/interface-dms/page";

const HTTP_OK = 200;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const PERMISSIONS_TREE = pageRoutePath(
  "/settings/workspace/roles",
  "/editor-tree",
);
const SETTINGS_OVERVIEW = "/settings";
const NOTIFICATIONS = pageRoutePath("/settings/user/notifications");
const PERSONAL_SLUGS = [
  "/settings/user/profile",
  "/settings/user/security",
  "/settings/user/notifications",
  "/settings/user/appearance",
  "/settings/user/region",
  "/settings/user/shortcuts",
];
const WORKSPACE_SLUGS = [
  "/settings/workspace/members",
  "/settings/workspace/roles",
];

const subject: NotificationSubjectInfo = {
  id: "member-access",
  labelKey: "member_access",
  category: { id: "member-access-test", labelKey: "test", icon: "i-ph-bell" },
};
const PREFERENCE_KEY = `${subject.category.id}:${subject.id}`;

type SiteLayoutPage = SiteLayoutPayload["siteLayout"]["pages"][string];

interface SiteLayoutSlice {
  siteLayout: {
    pages: Record<string, Pick<SiteLayoutPage, "hasAccess" | "displayName">>;
  };
}

const SiteLayoutBody = z.object({
  siteLayout: z.object({
    pages: z.record(
      z.object({ hasAccess: z.boolean(), displayName: z.string() }),
    ),
  }),
}) satisfies z.ZodType<SiteLayoutSlice>;

interface PageLayoutResponse {
  components: PageLayout["components"];
}

describe("[integration] a member without a role and their own settings", () => {
  let member: AxiosInstance;
  let memberId: string;

  const layout = (slug: string) =>
    member.get<PageLayoutResponse>(pageRoutePath(slug, "/pagelayout"));

  before(async () => {
    await resetDatabase();
    await registerUser({ owner: true });
    const registered = await registerUser();
    member = authorizedClient(registered.accessToken);
    memberId = registered.userId;
    internal.RegisterNotificationCategory.register(subject.category);
    internal.RegisterNotificationSubject.register(subject);
  });

  after(() => {
    internal.RegisterNotificationSubject.unregister(subject);
    internal.RegisterNotificationCategory.unregister(subject.category);
  });

  it("opens every account settings page", async () => {
    for (const slug of PERSONAL_SLUGS) {
      const response = await layout(slug);
      expect(
        response.status,
        `${slug}: ${JSON.stringify(response.data)}`,
      ).to.equal(HTTP_OK);
    }
  });

  it("is served the inbox and the preferences of the notifications page", async () => {
    const response = await layout("/settings/user/notifications");
    expect(Object.keys(response.data.components)).to.include.members([
      "notificationsComponent",
      "inbox",
    ]);
  });

  it("reads their inbox and saves their preferences", async () => {
    await new SendableNotification({
      icon: "i-ph-bell",
      title: "Welcome aboard",
      description: "Your account is ready.",
      subject,
    }).toUser(memberId);

    const inbox = await member.get(`${NOTIFICATIONS}/inbox`);
    expect(inbox.status, JSON.stringify(inbox.data)).to.equal(HTTP_OK);
    expect(
      inbox.data.results.map((row: { title: string }) => row.title),
    ).to.include("Welcome aboard");

    const saved = await member.patch(`${NOTIFICATIONS}/preferences`, {
      [PREFERENCE_KEY]: false,
    });
    expect(saved.status, JSON.stringify(saved.data)).to.equal(HTTP_OK);
    expect(saved.data[PREFERENCE_KEY]).to.equal(false);
  });

  it("opens the settings overview, its account summary and its activity", async () => {
    for (const path of [
      pageRoutePath(SETTINGS_OVERVIEW, "/pagelayout"),
      pageRoutePath(SETTINGS_OVERVIEW, "/account-summary"),
      pageRoutePath(SETTINGS_OVERVIEW, "/activity"),
    ]) {
      const response = await member.get(path);
      expect(
        response.status,
        `${path}: ${JSON.stringify(response.data)}`,
      ).to.equal(HTTP_OK);
    }
  });

  it("is served the settings overview named, so its breadcrumb is translated", async () => {
    const response = await member.get("/dms/sitelayout");
    const overview = parseBody(SiteLayoutBody, response).siteLayout.pages[
      SETTINGS_OVERVIEW
    ];
    expect(overview?.hasAccess).to.equal(true);
    expect(overview?.displayName).to.equal("$page.settings.title");
  });

  it("sees the account pages in the navigation and not the workspace ones", async () => {
    const response = await member.get("/dms/sitelayout");
    expect(response.status).to.equal(HTTP_OK);
    const { pages } = parseBody(SiteLayoutBody, response).siteLayout;
    for (const slug of PERSONAL_SLUGS) {
      expect(pages[slug]?.hasAccess, slug).to.equal(true);
    }
    for (const slug of WORKSPACE_SLUGS) {
      expect(pages[slug]?.hasAccess, slug).to.equal(false);
    }
  });

  it("is still refused the workspace settings pages", async () => {
    for (const slug of WORKSPACE_SLUGS) {
      const response = await layout(slug);
      expect(response.status, slug).to.equal(HTTP_FORBIDDEN);
    }
  });

  it("is refused the permission tree, which no anonymous caller reads either", async () => {
    expect((await member.get(PERMISSIONS_TREE)).status).to.equal(
      HTTP_FORBIDDEN,
    );
    expect((await createClient().get(PERMISSIONS_TREE)).status).to.equal(
      HTTP_UNAUTHORIZED,
    );
  });
});
