import { type UserInvite, UserInviteModel } from "@antelopejs/interface-dms/db";
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

function restorer(method: "getByEmail" | "isOnlyInviteOfEmail") {
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
