import { randomUUID } from "node:crypto";
import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import {
  GetControllerInstance,
  getRegisteredRouteHandlers,
  HTTPResult,
} from "@antelopejs/interface-api";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { expect } from "chai";
import { z } from "zod";
import { type User, UserModel } from "@antelopejs/interface-dms/auth/db";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import {
  TenantMemberModel,
  type UserInvite,
  UserInviteModel,
} from "@antelopejs/interface-dms/db";
import { inviteUserToTenant } from "@antelopejs/interface-dms/invites";
import { generateAccessToken } from "@antelopejs/interface-dms/auth";

export const TENANT = DEFAULT_TENANT_ID;

async function requestContext(admin: User) {
  const { token } = await generateAccessToken(TENANT, admin);
  const rawRequest = new IncomingMessage(new Socket());
  rawRequest.headers.authorization = `Bearer ${token}`;
  return {
    rawRequest,
    rawResponse: new ServerResponse(rawRequest),
    url: new URL("http://invite-extension.test"),
    routeParameters: {},
    response: new HTTPResult(),
  };
}

export async function createUser(): Promise<User> {
  const id = randomUUID();
  const users = GetModel(UserModel);
  await users.insert({
    _id: id,
    email: `${id}@acme.dev`,
    name: "Invite extension user",
    authKey: id,
    isValidated: true,
    language: "en",
    password: null,
    owner: true,
  });
  const user = await users.get(id);
  if (!user) throw new Error("Missing invite extension user");
  return user;
}

export async function directAdd(
  extensions: NonNullable<
    Parameters<typeof inviteUserToTenant>[0]["extensions"]
  >,
) {
  const user = await createUser();
  const result = await inviteUserToTenant({
    tenantId: TENANT,
    email: user.email,
    extensions,
  });
  expect(result).to.deep.equal({ kind: "added", userId: user._id });
  const member = await GetModel(TenantMemberModel, TENANT).getByUser(user._id);
  if (!member) throw new Error("Direct add did not create a member");
  return member;
}

export async function pendingInvite(extensions: UserInvite["extensions"]) {
  const id = randomUUID();
  await GetModel(UserInviteModel, TENANT).insert({
    _id: id,
    token: randomUUID(),
    email: `${id}@acme.dev`,
    firstname: null,
    lastname: null,
    language: "en",
    roles_ids: [],
    asTenantOwner: false,
    expiresAt: new Date(Date.now() + 60_000),
    extensions,
  });
  return id;
}

export async function readPendingInvite(id: string, admin: User) {
  const ctx = await requestContext(admin);
  const route = registeredInviteRoute("get", "/api/tables/admin-invites/get");
  const controller = await GetControllerInstance(route.proto.constructor, ctx);
  return route.callback.call(
    controller,
    ctx,
    { id },
    admin,
    ctx,
    undefined,
    undefined,
    admin,
  );
}

function registeredInviteRoute(method: string, location: string) {
  const matches = getRegisteredRouteHandlers().filter(
    ({ handler }) =>
      handler.module === "local" &&
      handler.mode === "handler" &&
      handler.method === method &&
      handler.location === location,
  );
  if (matches.length !== 1)
    throw new Error(
      `Expected one registered ${method} ${location}, got ${matches.length}`,
    );
  return matches[0].handler;
}

export async function editPendingInvite<T extends object>(
  id: string,
  fields: T,
  admin: User,
) {
  const ctx = await requestContext(admin);
  const route = registeredInviteRoute("put", "/api/tables/admin-invites/edit");
  const controller = await GetControllerInstance(route.proto.constructor, ctx);
  return route.callback.call(
    controller,
    ctx,
    { id },
    Buffer.from(JSON.stringify(fields)),
    admin,
    ctx,
    undefined,
    admin,
  );
}

export async function submitInvite<T extends object>(fields: T, admin: User) {
  const ctx = await requestContext(admin);
  const route = registeredInviteRoute(
    "post",
    "/dms/pages/settings/workspace/members/invite",
  );
  const controller = await GetControllerInstance(route.proto.constructor, ctx);
  const response: unknown = await route.callback.call(controller, ctx, admin, {
    emails: [`${randomUUID()}@acme.dev`],
    language: "en",
    asTenantOwner: true,
    ...fields,
  });
  return z
    .object({ results: z.array(z.object({ email: z.string() })) })
    .parse(response);
}
