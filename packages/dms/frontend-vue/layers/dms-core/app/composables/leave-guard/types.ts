import type { MaybePromise } from "../../types/utils";

export const PAGE_GUARD_PREFIX = "page-leave-guard";

export type LeaveGuardCallback = () => MaybePromise<boolean>;

export interface LeaveGuardEntry {
  id: string;
  callback: LeaveGuardCallback;
}

export type LeaveGuardRegistry = Map<string, LeaveGuardEntry[]>;

export interface UseLeaveGuardReturn {
  addGuard: (containerId: string, callback: LeaveGuardCallback) => () => void;
  removeGuard: (containerId: string, guardId: string) => void;
  executeGuards: (containerId: string) => Promise<boolean>;
  clearGuards: (containerId: string) => void;
}
