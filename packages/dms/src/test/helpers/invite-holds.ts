import { GetModel } from "@antelopejs/interface-database-decorators";
import { type UserInvite, UserInviteModel } from "@antelopejs/interface-dms/db";
import {
  type CreateUserInviteTokenOptions,
  createUserInviteToken,
} from "@antelopejs/interface-dms/invites";
import {
  Hook,
  RegisterHook,
  UnregisterHook,
} from "@antelopejs/interface-dms/hooks";

/** Holds the first caller at `INVITE_BEING_CREATED`, after it read no invitation, until `release` runs. */
export function holdFirstFreshCaller() {
  let held = false;
  let park = () => {};
  const parked = new Promise<void>((resolve) => {
    park = resolve;
  });
  let release = () => {};
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  const hold = async () => {
    if (held) return;
    held = true;
    park();
    await released;
  };
  RegisterHook(Hook.INVITE_BEING_CREATED, hold);
  return {
    parked,
    release,
    unregister: () => UnregisterHook(Hook.INVITE_BEING_CREATED, hold),
  };
}

function restorer(
  method: "getByEmail" | "isOnlyInviteOfEmail" | "listByEmail",
) {
  const original = Object.getOwnPropertyDescriptor(
    UserInviteModel.prototype,
    method,
  );
  if (!original) throw new Error(`UserInviteModel has no ${method} method`);
  return () => {
    Object.defineProperty(UserInviteModel.prototype, method, original);
  };
}

/** Runs `effect` once, after the first `getByEmail` read and before its caller sees the invite. */
export function afterFirstEmailRead(effect: () => Promise<void>) {
  const restore = restorer("getByEmail");
  UserInviteModel.prototype.getByEmail = async function (
    this: UserInviteModel,
    email: string,
  ) {
    restore();
    const invite = await this.getByEmail(email);
    await effect();
    return invite;
  };
  return { restore };
}

/** Runs `effect` once, before the second `listByEmail` read runs. */
export function beforeSecondEmailList(effect: () => Promise<void>) {
  const restore = restorer("listByEmail");
  UserInviteModel.prototype.listByEmail = async function (
    this: UserInviteModel,
    email: string,
  ) {
    restore();
    const first = await this.listByEmail(email);
    UserInviteModel.prototype.listByEmail = async function (
      this: UserInviteModel,
      secondEmail: string,
    ) {
      restore();
      await effect();
      return this.listByEmail(secondEmail);
    };
    return first;
  };
  return { restore };
}

/** Runs `effect` once, before the second `isOnlyInviteOfEmail` check reads. */
export function beforeSecondOnlyInviteCheck(effect: () => Promise<void>) {
  const restore = restorer("isOnlyInviteOfEmail");
  UserInviteModel.prototype.isOnlyInviteOfEmail = async function (
    this: UserInviteModel,
    invite: UserInvite,
  ) {
    restore();
    const first = await this.isOnlyInviteOfEmail(invite);
    UserInviteModel.prototype.isOnlyInviteOfEmail = async function (
      this: UserInviteModel,
      secondInvite: UserInvite,
    ) {
      restore();
      await effect();
      return this.isOnlyInviteOfEmail(secondInvite);
    };
    return first;
  };
  return { restore };
}

/** Makes the first `getByEmail` read return `invite`, one of the email's stored invites, after `effect` runs. */
export function readFirstEmailAs(
  invite: UserInvite,
  effect: () => Promise<void>,
) {
  const restore = restorer("getByEmail");
  UserInviteModel.prototype.getByEmail = async () => {
    restore();
    await effect();
    return invite;
  };
  return { restore };
}

/** Runs `effect` once, before the first `isOnlyInviteOfEmail` check reads. */
export function beforeFirstOnlyInviteCheck(effect: () => Promise<void>) {
  const restore = restorer("isOnlyInviteOfEmail");
  UserInviteModel.prototype.isOnlyInviteOfEmail = async function (
    this: UserInviteModel,
    invite: UserInvite,
  ) {
    restore();
    await effect();
    return this.isOnlyInviteOfEmail(invite);
  };
  return { restore };
}

/** Holds the first `count` callers at `INVITE_BEING_CREATED`, after each read no invitation, each until its own gate is released. */
function holdFreshCallers(count: number) {
  const gates = Array.from({ length: count }, () => gate());
  let arrived = 0;
  const hold = async () => {
    const held = gates[arrived];
    arrived += 1;
    if (held) await held.pass();
  };
  RegisterHook(Hook.INVITE_BEING_CREATED, hold);
  return {
    gates,
    unregister: () => UnregisterHook(Hook.INVITE_BEING_CREATED, hold),
  };
}

/** Holds the first `settleFresh` call after it settled, until `release` runs. */
export function holdAfterFirstSettle() {
  const original = Object.getOwnPropertyDescriptor(
    UserInviteModel.prototype,
    "settleFresh",
  );
  if (!original) throw new Error("UserInviteModel has no settleFresh method");
  const restore = () => {
    Object.defineProperty(UserInviteModel.prototype, "settleFresh", original);
  };
  const { parked, release, pass } = gate();
  UserInviteModel.prototype.settleFresh = async function (
    this: UserInviteModel,
    ...args: Parameters<UserInviteModel["settleFresh"]>
  ) {
    restore();
    const outcome = await this.settleFresh(...args);
    await pass();
    return outcome;
  };
  return { parked, release, restore };
}

/** Holds `INVITE_DELETED` for one invite, until `release` runs. */
export function holdDeletionOf(inviteId: string) {
  const { parked, release, pass } = gate();
  const hold = async (payload: { inviteId: string }) => {
    if (payload.inviteId === inviteId) await pass();
  };
  RegisterHook(Hook.INVITE_DELETED, hold);
  return {
    parked,
    release,
    restore: () => UnregisterHook(Hook.INVITE_DELETED, hold),
  };
}

/**
 * Holds two fresh callers after each read no invitation, then runs A's
 * creation and C's replacement, so both read C's invite as their rival once
 * released.
 */
export async function holdTwoFreshCallersBesideKept(
  options: CreateUserInviteTokenOptions,
) {
  const invites = GetModel(UserInviteModel, options.tenantId);
  const fresh = holdFreshCallers(2);
  const [first, second] = fresh.gates;
  if (!first || !second) throw new Error("two fresh callers are held");
  const firstCall = createUserInviteToken(options);
  await first.parked;
  const secondCall = createUserInviteToken(options);
  await second.parked;
  fresh.unregister();
  await createUserInviteToken(options);
  const kept = await createUserInviteToken(options);
  const keptInvite = await invites.get(kept.inviteId);
  if (!keptInvite) throw new Error("the kept invite is not stored");
  return { invites, first, second, firstCall, secondCall, keptInvite };
}

/** Makes the first invite `delete` call fail. */
export function failFirstDelete() {
  const restore = () => {
    Reflect.deleteProperty(UserInviteModel.prototype, "delete");
  };
  UserInviteModel.prototype.delete = () => {
    restore();
    return Promise.reject(new Error("delete failed"));
  };
  return { restore };
}

/** A one-shot gate: `pass` parks its caller until `release` runs. */
export function gate() {
  let park = () => {};
  const parked = new Promise<void>((resolve) => {
    park = resolve;
  });
  let release = () => {};
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  const pass = async () => {
    park();
    await released;
  };
  return { parked, release, pass };
}

/** Holds the first `getOtherByEmail` call after it read its rival, until `release` runs. */
export function holdFirstRivalRead() {
  const original = Object.getOwnPropertyDescriptor(
    UserInviteModel.prototype,
    "getOtherByEmail",
  );
  if (!original)
    throw new Error("UserInviteModel has no getOtherByEmail method");
  const restore = () => {
    Object.defineProperty(
      UserInviteModel.prototype,
      "getOtherByEmail",
      original,
    );
  };
  const { parked, release, pass } = gate();
  UserInviteModel.prototype.getOtherByEmail = async function (
    this: UserInviteModel,
    email: string,
    exceptId: string,
  ) {
    restore();
    const rival = await this.getOtherByEmail(email, exceptId);
    await pass();
    return rival;
  };
  return { parked, release, restore };
}

/** Holds the first call of an invite model method before it runs, until `release` runs. */
export function holdFirstCall(method: "delete" | "get" | "insert") {
  const restore = () => {
    Reflect.deleteProperty(UserInviteModel.prototype, method);
  };
  const { parked, release, pass } = gate();
  const held = {
    async delete(
      this: UserInviteModel,
      ...args: Parameters<UserInviteModel["delete"]>
    ) {
      restore();
      await pass();
      return this.delete(...args);
    },
    async get(
      this: UserInviteModel,
      ...args: Parameters<UserInviteModel["get"]>
    ) {
      restore();
      await pass();
      return this.get(...args);
    },
    async insert(
      this: UserInviteModel,
      ...args: Parameters<UserInviteModel["insert"]>
    ) {
      restore();
      await pass();
      return this.insert(...args);
    },
  };
  Object.defineProperty(UserInviteModel.prototype, method, {
    value: held[method],
    configurable: true,
    writable: true,
  });
  return { parked, release, restore };
}

/** Runs A's creation and C's replacement, then B's fresh insert, holding B after it read C's invite as its rival. */
export async function holdFreshAfterRivalRead(
  options: CreateUserInviteTokenOptions,
) {
  const invites = GetModel(UserInviteModel, options.tenantId);
  const firstRead = holdFirstFreshCaller();
  const fresh = createUserInviteToken(options);
  await firstRead.parked;
  firstRead.unregister();
  await createUserInviteToken(options);
  const kept = await createUserInviteToken(options);
  const rivalRead = holdFirstRivalRead();
  firstRead.release();
  await rivalRead.parked;
  const keptInvite = await invites.get(kept.inviteId);
  if (!keptInvite) throw new Error("the kept invite is not stored");
  return { invites, fresh, rivalRead, keptInvite };
}
