import { UserInviteModel } from "@antelopejs/interface-dms/db";
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
