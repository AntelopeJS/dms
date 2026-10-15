import { GetModel } from "@antelopejs/interface-database-decorators";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import { TenantMemberModel } from "@antelopejs/interface-dms/db";
import type { AxiosInstance } from "axios";
import { expect } from "chai";
import {
  buildMemberMenuTopic,
  buildMenuTopic,
  getRealtimeBroker,
  MENU_CHANGED_EVENT_TYPE,
} from "../../realtime";
import {
  authorizedClient,
  type RegisteredUser,
  registerUser,
} from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { pageRoutePath } from "@antelopejs/interface-dms/page";

// A browser keeps the site layout it was sent for a few minutes (an Inertia
// once prop) and reloads it when the backend announces a menu change. A
// change of what a member may open is one: it reaches the sessions of the
// members it changes, on each one's topic, whichever page made it, and leaves
// the rest of the workspace alone.

const ROLES = pageRoutePath("/settings/workspace/roles");
const ROLES_TABLE = "/api/tables/roles";
const MEMBERS = pageRoutePath("/settings/workspace/members");
const MEMBERS_TABLE = "/api/tables/members";
const HTTP_OK = 200;
const HTTP_NO_CONTENT = 204;
// Longer than the 250 ms window a burst of menu events collapses into.
const MENU_WINDOW_MARGIN_MS = 600;

interface MenuEvents {
  /** On the topic of the member whose access changed. */
  member: number;
  /** On the owner's own topic: the author of the change. */
  owner: number;
  /** On the workspace's topic, which every session of it reads. */
  workspace: number;
}

async function menuEventsDuring(
  memberId: string,
  ownerId: string,
  action: () => Promise<void>,
): Promise<MenuEvents> {
  const events: MenuEvents = { member: 0, owner: 0, workspace: 0 };
  const count = (target: keyof MenuEvents, topic: string) =>
    getRealtimeBroker().subscribe(topic, (event) => {
      if (event.type === MENU_CHANGED_EVENT_TYPE) events[target]++;
    });
  const stops = [
    count("member", buildMemberMenuTopic(DEFAULT_TENANT_ID, memberId)),
    count("owner", buildMemberMenuTopic(DEFAULT_TENANT_ID, ownerId)),
    count("workspace", buildMenuTopic(DEFAULT_TENANT_ID)),
  ];
  try {
    await action();
    const deadline = Date.now() + MENU_WINDOW_MARGIN_MS;
    while (events.member === 0 && Date.now() < deadline)
      await new Promise((resolve) => setTimeout(resolve, 20));
    // The window a stray publish to another topic would land in.
    await new Promise((resolve) => setTimeout(resolve, MENU_WINDOW_MARGIN_MS));
    return events;
  } finally {
    for (const stop of stops) stop();
  }
}

function expectMemberOnly(events: MenuEvents): void {
  expect(events.member).to.be.greaterThan(0);
  expect(events.owner).to.equal(0);
  expect(events.workspace).to.equal(0);
}

async function memberRowId(userId: string): Promise<string> {
  const member = await GetModel(TenantMemberModel, DEFAULT_TENANT_ID).getByUser(
    userId,
  );
  if (!member) throw new Error(`${userId} is no member`);
  return member._id;
}

describe("[integration] menu events on access changes", () => {
  let owner: AxiosInstance;
  let ownerId: string;
  let roleId: string;
  let member: RegisteredUser;

  async function createRole(name: string): Promise<string> {
    const response = await owner.post(`${ROLES}/create`, { name });
    expect(response.status, JSON.stringify(response.data)).to.equal(HTTP_OK);
    return response.data.id as string;
  }

  beforeEach(async () => {
    await resetDatabase();
    const registeredOwner = await registerUser({ owner: true });
    owner = authorizedClient(registeredOwner.accessToken);
    ownerId = registeredOwner.userId;
    roleId = await createRole("Support");
    member = await registerUser({ roles_ids: [roleId] });
  });

  it("announces a change of a role's permissions to its holders", async () => {
    const events = await menuEventsDuring(member.userId, ownerId, async () => {
      const response = await owner.put(`${ROLES}/${roleId}`, {
        name: "Support",
        permissions: ["settings.workspace.roles.table.list"],
      });
      expect(response.status, JSON.stringify(response.data)).to.be.oneOf([
        HTTP_OK,
        HTTP_NO_CONTENT,
      ]);
    });
    expectMemberOnly(events);
  });

  it("announces the deletion of a role its holders move off", async () => {
    const other = await createRole("Readers");
    const events = await menuEventsDuring(member.userId, ownerId, async () => {
      const response = await owner.delete(`${ROLES_TABLE}/delete`, {
        params: { id: roleId },
        data: { reassignTo: other },
      });
      expect(response.status, JSON.stringify(response.data)).to.equal(HTTP_OK);
    });
    expectMemberOnly(events);
  });

  it("announces a member's new roles and a member's removal", async () => {
    const other = await createRole("Readers");
    const edited = await menuEventsDuring(member.userId, ownerId, async () => {
      const response = await owner.put(
        `${MEMBERS_TABLE}/edit`,
        { roleIds: [other] },
        { params: { id: await memberRowId(member.userId) } },
      );
      expect(response.status, JSON.stringify(response.data)).to.equal(HTTP_OK);
    });
    expectMemberOnly(edited);
    const removed = await menuEventsDuring(member.userId, ownerId, async () => {
      const response = await owner.delete(`${MEMBERS_TABLE}/delete`, {
        params: { id: await memberRowId(member.userId) },
      });
      expect(response.status, JSON.stringify(response.data)).to.equal(HTTP_OK);
    });
    expectMemberOnly(removed);
  });

  it("announces a change of ownership", async () => {
    const events = await menuEventsDuring(member.userId, ownerId, async () => {
      const response = await owner.post(
        `${MEMBERS}/${await memberRowId(member.userId)}/owner`,
        { isTenantOwner: true },
      );
      expect(response.status, JSON.stringify(response.data)).to.be.oneOf([
        HTTP_OK,
        HTTP_NO_CONTENT,
      ]);
    });
    expectMemberOnly(events);
  });

  it("serves a page without the site layout with the same access", async () => {
    const client = authorizedClient(member.accessToken);
    const layout = await client.get<{
      siteLayout: { pages: Record<string, { hasAccess?: boolean }> };
    }>("/dms/sitelayout");
    const paths = Object.keys(layout.data.siteLayout.pages)
      .filter((path) => !path.includes(":"))
      .slice(0, 40);
    expect(paths.length).to.be.greaterThan(0);
    for (const path of paths) {
      const [full, alone] = await Promise.all([
        client.get("/dms/page", {
          params: { path },
          validateStatus: () => true,
        }),
        client.get("/dms/page", {
          params: { path, shared: "false" },
          validateStatus: () => true,
        }),
      ]);
      expect(alone.status, path).to.equal(full.status);
      if (full.status !== HTTP_OK) continue;
      expect(alone.data.shared, path).to.equal(undefined);
      expect(full.data.shared, path).to.not.equal(undefined);
      expect(alone.data.route.hasAccess, path).to.equal(
        full.data.route.hasAccess,
      );
      expect(alone.data.layout, path).to.deep.equal(full.data.layout);
    }
  });
});
