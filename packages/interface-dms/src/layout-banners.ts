import { RegisteringProxy } from "@antelopejs/interface-core";
import type { User } from "./auth/db";
import type { MaybePromise } from "./types";

/**
 * Semantic look of a layout banner. It also picks the banner's ARIA role:
 * `error` is announced as an `alert`, `info` and `warning` politely as a
 * `status`.
 */
export const LayoutBannerVariant = {
  INFO: "info",
  WARNING: "warning",
  ERROR: "error",
} as const;

export type LayoutBannerVariant =
  (typeof LayoutBannerVariant)[keyof typeof LayoutBannerVariant];

/**
 * What a banner's `visible` resolver decides on: the request the site layout
 * is being built for.
 */
export interface LayoutBannerContext {
  /** Undefined for an unauthenticated request. */
  user: User | undefined;
  tenantId: string;
  /**
   * The caller's effective permissions in the tenant, ignoring any tenant
   * access gate: a banner is precisely how a suspended or past-due workspace
   * gets told why, so it must not go dark when the gate does. Read
   * `isTenantAccessDenied` to tell the two situations apart.
   */
  permissions: Set<string>;
  /** Whether the caller holds the wildcard permission, gate ignored. */
  isOwner: boolean;
  /** Whether a tenant access gate currently refuses the caller. */
  isTenantAccessDenied: boolean;
}

/**
 * Decides, per request, whether a banner shows. Runs server-side while the
 * site layout is built, so the answer is part of the server-rendered page and
 * the banner never flashes in or out after hydration.
 *
 * It sits on the critical path of every page load: a resolver that throws, or
 * does not answer within two seconds, hides its banner for that request.
 */
export type LayoutBannerVisibility = (
  context: LayoutBannerContext,
) => MaybePromise<boolean>;

interface LayoutBannerBase {
  /**
   * Unique key of the banner across the deployment: re-registering a key
   * replaces the banner, and the key is what a dismissal remembers — give a
   * banner a new key when it must show again to users who dismissed it.
   */
  key: string;
  variant: LayoutBannerVariant;
  /**
   * Stack order, ascending from the top. Defaults to `0`; ties keep the
   * registration order.
   */
  order?: number;
  /** Leading icon. Defaults to one matching the variant. */
  icon?: string;
  /**
   * Whether the user can close the banner. A dismissal lasts for the browser
   * session and is remembered in a cookie, so the server-rendered page already
   * leaves the banner out. Defaults to `false`.
   */
  dismissible?: boolean;
  /** Absent means the banner shows on every request. */
  visible?: LayoutBannerVisibility;
}

/** A banner showing a line of text. */
export interface LayoutBannerTextInfo extends LayoutBannerBase {
  /** The message. A `$`-prefixed value resolves as an i18n key. */
  text: string;
  component?: never;
  props?: never;
}

/** A banner mounting a component of a frontend layer as its content. */
export interface LayoutBannerComponentInfo extends LayoutBannerBase {
  /**
   * Name of a global component, provided by a frontend layer, rendered as the
   * banner's content. The DMS still draws the chrome: color, icon, dismiss
   * button and ARIA role.
   */
  component: string;
  /** Props passed to the component. Must be serializable. */
  props?: Record<string, unknown>;
  text?: never;
}

/**
 * A global banner rendered under the header of the dashboard layout, on every
 * page — tenant pages and module back-office pages alike.
 */
export type LayoutBannerInfo = LayoutBannerTextInfo | LayoutBannerComponentInfo;

export namespace internal {
  export const RegisterLayoutBanner = new RegisteringProxy<
    (info: LayoutBannerInfo) => void
  >();
}

/**
 * Register a global banner under the dashboard header. Banners stack by
 * `order`, and each one's `visible` resolver is evaluated server-side for every
 * site layout request, so the banner is in the server-rendered page. When the
 * state a resolver reads changes, call `NotifyMenuChanged(tenantId)` so the
 * connected clients re-fetch their site layout.
 *
 * The registration is dropped automatically when the registering module stops.
 *
 * @returns Removes this banner, for a module that drops it while staying
 * loaded.
 */
export function RegisterLayoutBanner(info: LayoutBannerInfo): () => void {
  internal.RegisterLayoutBanner.register(info);
  return () => internal.RegisterLayoutBanner.unregister(info);
}
