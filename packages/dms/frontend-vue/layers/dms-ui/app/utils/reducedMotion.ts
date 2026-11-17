import { isFunction } from "../../../dms-core/app/utils/type-check";
import {
  REDUCED_MOTION_QUERY,
  reduceMotionFromClasses,
  resolveReducedMotion,
} from "../build/utils/accessibilityPreferences";

/**
 * Whether the page should skip JavaScript-driven motion right now: the
 * `<html>` class when the user pinned a choice, the system otherwise. Always
 * false on the server, which renders no animation.
 */
export function isReducedMotionActive(): boolean {
  const classList = globalThis.document?.documentElement?.classList;
  if (!classList) return false;
  const systemPrefersReduced =
    isFunction(matchMedia) && matchMedia(REDUCED_MOTION_QUERY).matches;
  return resolveReducedMotion(
    reduceMotionFromClasses(classList),
    systemPrefersReduced,
  );
}
