import { readFileSync, writeFileSync } from "node:fs";

const NS_LAST_PID = "/proc/sys/kernel/ns_last_pid";

/**
 * Whether the test may choose the next pid, which only a process that owns
 * its PID namespace can, as under `unshare -Ur --pid`.
 *
 * @returns {boolean} True when `ns_last_pid` takes a write
 */
export function canChoosePid() {
  try {
    writeFileSync(NS_LAST_PID, readFileSync(NS_LAST_PID, "utf8"));
    return true;
  } catch {
    return false;
  }
}

/**
 * Makes `pid` the next one the kernel gives a new process, once it is free.
 *
 * @param {number} pid The pid
 */
export function chooseNextPid(pid) {
  writeFileSync(NS_LAST_PID, String(pid - 1));
}
