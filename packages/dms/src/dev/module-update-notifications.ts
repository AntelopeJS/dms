import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Logging } from "@antelopejs/interface-core/logging";
import { GetModuleInfo, ListModules } from "@antelopejs/interface-core/modules";
import { GetRuntimeInfo } from "@antelopejs/interface-core/runtime";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { UserModel } from "@antelopejs/interface-dms/auth/db";
import {
  Notification,
  NotificationSubject,
  SystemCategory,
} from "@antelopejs/interface-dms/notifications";
import type { NotificationSubjectInfo } from "@antelopejs/interface-dms/notifications/types";
import { satisfies, validRange } from "semver";

const CHECK_INTERVAL_MS = 60 * 60 * 1000;
const NPM_VIEW_TIMEOUT_MS = 30_000;
const UPDATES_SUBJECT_ID = "updates";
const UPDATES_ICON = "i-ph-arrow-circle-up";
const MESSAGE_PREFIX = "$dms.notifications.messages.module_updates";
const MODULE_LIST_SEPARATOR = ", ";
const PACKAGE_SOURCE_TYPE = "package";

interface PackageModuleSource {
  type: string;
  package: string;
  version: string;
}

export interface OutdatedModule {
  package: string;
  current: string;
  latest: string;
}

const execFileAsync = promisify(execFile);

let updatesSubject: NotificationSubjectInfo | undefined;
let checkTimer: NodeJS.Timeout | undefined;
let watcherGeneration = 0;
let abortController: AbortController | undefined;
let pendingCheck: Promise<void> = Promise.resolve();

function ensureUpdatesSubject(): NotificationSubjectInfo {
  updatesSubject ??= NotificationSubject(UPDATES_SUBJECT_ID, {
    category: SystemCategory,
    labelKey: "dms.notifications.subjects.updates",
    descriptionKey: "dms.notifications.subjects.updates_desc",
    togglePermission: "default",
  });
  return updatesSubject;
}

export function isUpToDate(currentSpec: string, latest: string): boolean {
  if (currentSpec === latest) {
    return true;
  }
  const range = validRange(currentSpec);
  if (range === null) {
    return true;
  }
  return satisfies(latest, range);
}

export function formatModuleList(outdated: OutdatedModule[]): string {
  return outdated
    .map((module) => `${module.package} ${module.current} → ${module.latest}`)
    .join(MODULE_LIST_SEPARATOR);
}

async function listPackageModuleSources(): Promise<PackageModuleSource[]> {
  const moduleIds = await ListModules();
  const infos = await Promise.all(
    moduleIds.map((moduleId) => GetModuleInfo(moduleId)),
  );
  return infos
    .filter((info) => info.source.type === PACKAGE_SOURCE_TYPE)
    .map((info) => info.source as PackageModuleSource);
}

async function fetchLatestVersion(
  packageName: string,
  projectPath: string,
  signal: AbortSignal,
): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync(
      "npm",
      ["view", packageName, "version"],
      { cwd: projectPath, timeout: NPM_VIEW_TIMEOUT_MS, signal },
    );
    return stdout.trim().split("\n").pop()?.trim() || undefined;
  } catch {
    return undefined;
  }
}

async function findOutdatedModules(
  projectPath: string,
  signal: AbortSignal,
): Promise<OutdatedModule[]> {
  const sources = await listPackageModuleSources();
  const latestVersions = await Promise.all(
    sources.map((source) =>
      fetchLatestVersion(source.package, projectPath, signal),
    ),
  );
  return sources.reduce<OutdatedModule[]>((outdated, source, index) => {
    const latest = latestVersions[index];
    if (latest && !isUpToDate(source.version, latest)) {
      outdated.push({
        package: source.package,
        current: source.version,
        latest,
      });
    }
    return outdated;
  }, []);
}

function canonicalModules(outdated: OutdatedModule[]): OutdatedModule[] {
  const modules = new Map(
    outdated.map((module) => [
      JSON.stringify([module.package, module.current, module.latest]),
      module,
    ]),
  );
  return [...modules.entries()]
    .sort(([left], [right]) => Number(left > right) - Number(left < right))
    .map(([, module]) => module);
}

/** Delivers one durable notification per user and canonical module-version set. */
export async function notifyOutdatedModules(
  outdated: OutdatedModule[],
): Promise<void> {
  const modules = canonicalModules(outdated);
  const moduleList = formatModuleList(modules);
  const eventId = `dms:module-updates:${JSON.stringify(
    modules.map((module) => [module.package, module.current, module.latest]),
  )}`;
  const userIds = (await GetModel(UserModel).table.run()).map(
    (user) => user._id,
  );
  if (userIds.length === 0) {
    return;
  }
  await Notification()
    .icon(UPDATES_ICON)
    .title(`${MESSAGE_PREFIX}.title`)
    .description(`${MESSAGE_PREFIX}.description`)
    .subject(ensureUpdatesSubject())
    .params({ count: modules.length, modules: moduleList })
    .build()
    .toUsersIdempotently(userIds, eventId);
}

async function runUpdateCheck(
  projectPath: string,
  generation: number,
  signal: AbortSignal,
): Promise<void> {
  const outdated = await findOutdatedModules(projectPath, signal);
  if (outdated.length === 0 || generation !== watcherGeneration) {
    return;
  }
  await notifyOutdatedModules(outdated);
}

/**
 * Watches for available updates of the project's package-sourced Antelope
 * modules and surfaces them as DMS notifications. Development mode only: the
 * registry check relies on npm access and the notification proposes an action
 * (editing antelope.config.ts) that only makes sense on a dev machine.
 */
export async function startModuleUpdateWatcher(): Promise<void> {
  const runtime = await GetRuntimeInfo();
  if (!runtime.dev) {
    return;
  }
  ensureUpdatesSubject();
  const generation = ++watcherGeneration;
  const controller = new AbortController();
  abortController = controller;
  const check = () => {
    pendingCheck = pendingCheck
      .then(() =>
        runUpdateCheck(runtime.projectPath, generation, controller.signal),
      )
      .catch((error) =>
        Logging.Debug(`[DMS] Module update check failed: ${String(error)}`),
      );
  };
  check();
  checkTimer = setInterval(check, CHECK_INTERVAL_MS);
  checkTimer.unref();
}

/**
 * Invalidates and awaits any in-flight check so nothing touches the database
 * or realtime services during module teardown. Aborting the pending npm
 * lookups keeps the wait short.
 */
export async function stopModuleUpdateWatcher(): Promise<void> {
  watcherGeneration += 1;
  abortController?.abort();
  abortController = undefined;
  if (checkTimer) {
    clearInterval(checkTimer);
  }
  checkTimer = undefined;
  await pendingCheck;
}
