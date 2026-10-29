import {
  type ModuleInfo,
  type ModuleStatus,
  type ModuleCatalogContext,
  type ModuleReadoutLine,
  MODULE_URL_PREFIX,
  type PageInfo,
} from "@antelopejs/interface-dms/page";
import { withResolverTimeout } from "../resolver-timeout";
import { warnOnceFor } from "../../../store/frontend";
import { pagesBySlug } from "../../../utils";
import { Logging } from "@antelopejs/interface-core/logging";
import type { RequestAccessContext, AccessFlag } from "./types";
import { moduleRegistry } from "./state";

export async function buildModuleAccessMap(
  context: RequestAccessContext,
): Promise<Record<string, ModuleInfo & AccessFlag>> {
  const result: Record<string, ModuleInfo & AccessFlag> = {};
  for (const [moduleId, info] of Object.entries(moduleRegistry)) {
    const hasAccess = await computeModuleAccess(moduleId, context);

    const presented = presentModuleInfo(info);
    result[moduleId] = hasAccess
      ? { ...presented, hasAccess }
      : {
          ...presented,
          title: "",
          description: "",
          icon: "",
          version: undefined,
          catalogCategory: undefined,
          hasAccess,
        };
  }
  return result;
}

export const DEFAULT_MODULE_STATUS: ModuleStatus = "live";

export const MODULE_STATUSES = new Set<string>([
  "live",
  "beta",
  "update",
  "attention",
]);

export const MODULE_READOUT_TONES = new Set<string>([
  "success",
  "info",
  "warning",
  "error",
]);

export const MODULE_READOUT_MAX_LINES = 3;

/**
 * The module's info without its catalog hooks: functions have no place in a
 * response payload.
 */
export function presentModuleInfo(
  info: ModuleInfo,
): Omit<ModuleInfo, "status" | "readout"> {
  const { status: _status, readout: _readout, ...presented } = info;
  return presented;
}

export async function runModuleStatusHook(
  info: ModuleInfo,
  context: ModuleCatalogContext,
): Promise<ModuleStatus> {
  if (!info.status) return DEFAULT_MODULE_STATUS;
  try {
    const status = await withResolverTimeout(
      Promise.resolve(info.status(context)),
      `status of module "${info.id}"`,
    );
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Module hooks are supplied by other modules; the existing boundary rejects non-string runtime results despite their declared return type.
    if (typeof status === "string" && MODULE_STATUSES.has(status)) {
      return status;
    }
    warnOnceFor(
      info,
      "status-invalid",
      `[dms] module "${info.id}" status() returned ${JSON.stringify(status)}; expected one of ${[...MODULE_STATUSES].join(", ")}.`,
    );
  } catch (error) {
    warnOnceFor(
      info,
      "status-failed",
      `[dms] module "${info.id}" status() failed: ${String(error)}`,
    );
  }
  return DEFAULT_MODULE_STATUS;
}

export async function runModuleReadoutHook(
  info: ModuleInfo,
  context: ModuleCatalogContext,
): Promise<ModuleReadoutLine[]> {
  if (!info.readout) return [];
  try {
    const lines = await withResolverTimeout(
      Promise.resolve(info.readout(context)),
      `readout of module "${info.id}"`,
    );
    if (!Array.isArray(lines)) return [];
    return lines
      .filter(
        (line): line is ModuleReadoutLine =>
          !!line && typeof line.text === "string" && line.text.length > 0,
      )
      .slice(0, MODULE_READOUT_MAX_LINES)
      .map((line): ModuleReadoutLine => {
        const tone = line.tone;
        return {
          text: line.text,
          tone: tone && MODULE_READOUT_TONES.has(tone) ? tone : "info",
        };
      });
  } catch (error) {
    warnOnceFor(
      info,
      "readout-failed",
      `[dms] module "${info.id}" readout() failed: ${String(error)}`,
    );
    return [];
  }
}

export async function computeModuleAccess(
  _moduleId: string,
  context: RequestAccessContext,
): Promise<boolean> {
  return context.gated.isOwner;
}

export function resolveModuleLandingSlug(info: ModuleInfo): string {
  const modulePages = Object.values(pagesBySlug).filter(
    (page) => page.module === info.id,
  );

  if (modulePages.length === 0) {
    return `${MODULE_URL_PREFIX}/${info.id}`;
  }

  if (info.landingPage) {
    const target = modulePages.find((page) => page.id === info.landingPage);
    if (target) return target.fullSlug;
    Logging.Warn(
      `[dms] module "${info.id}" declares landingPage "${info.landingPage}" but no page with that id exists in the module. Falling back to the first page by order.`,
    );
  }

  const sorted = [...modulePages].sort(comparePagesForLanding);
  return sorted[0].fullSlug;
}

export function comparePagesForLanding(a: PageInfo, b: PageInfo): number {
  const orderDelta = (a.order ?? 0) - (b.order ?? 0);
  if (orderDelta !== 0) return orderDelta;
  return a.id.localeCompare(b.id);
}
