/** @internal */
import type { MenuOptions, PageLiveOptions } from "../types";

/** @internal */
export function assertHasCategoryOrModule(
  id: string,
  options: MenuOptions,
  kind: "Page" | "Category",
): void {
  if (!options.category && !options.module) {
    throw new Error(
      `${kind} "${id}" must declare either "category" or "module" in its options.`,
    );
  }
}

const LIVE_PERIOD_PATTERN = /^[1-9]\d*[mhd]$/;

function assertPositiveRate(
  id: string,
  name: string,
  rate: PageLiveOptions["maxRate"],
): void {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Page option validation deliberately rejects invalid JavaScript callers as well as nonpositive rates without changing declaration types.
  if (typeof rate === "number" && Number.isFinite(rate) && rate > 0) return;
  throw new Error(
    `Page "${id}" declares ${name} ${String(rate)}: it must be a positive number of seconds.`,
  );
}

function assertValidSlowRate(id: string, live: PageLiveOptions): void {
  const slow = live.slowRateAfter;
  if (slow === undefined) return;
  assertPositiveRate(id, "live.slowRateAfter.maxRate", slow.maxRate);
  if (!LIVE_PERIOD_PATTERN.test(String(slow.period))) {
    throw new Error(
      `Page "${id}" declares live.slowRateAfter.period "${String(slow.period)}": it must read like "30m", "24h" or "7d".`,
    );
  }
}

/** @internal */
export function assertValidLiveOptions(id: string, options: MenuOptions): void {
  const live = options.live;
  if (!live) return;
  if (live.maxRate !== undefined) {
    assertPositiveRate(id, "live.maxRate", live.maxRate);
  }
  assertValidSlowRate(id, live);
  if (live.rememberKey !== undefined && live.rememberKey.trim() === "") {
    throw new Error(`Page "${id}" declares an empty live.rememberKey.`);
  }
}
