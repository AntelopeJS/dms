import { RegisteringProxy } from "@antelopejs/interface-core";
import type { User } from "./auth/db";
import type { BlockLinkAction } from "./base/display";
import type { BlockText } from "./base/types/composed-text";
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
 * What a banner's `visible` or `resolve` resolver decides on: the request the
 * site layout is being built for.
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

/**
 * What a text banner shows: its message and, after it, link buttons.
 */
export interface LayoutBannerContent {
  /**
   * The message: a `$`-prefixed value resolves as an i18n key, and a
   * `ComposedText` is composed in the reader's language from the raw values
   * it carries — an amount, a date, a count.
   */
  text: BlockText;
  /**
   * Link buttons after the message; the last one is the main action. Their
   * labels follow the `$` convention.
   */
  actions?: BlockLinkAction[];
}

/**
 * Builds a banner's content per request, or answers `undefined` to hide it:
 * the visibility and the message in one read, for a banner whose message
 * names the state that makes it show (an invoice number, the amount due, the
 * date the workspace is suspended). Runs where and when a
 * {@link LayoutBannerVisibility} does, under the same two-second budget: a
 * resolver that throws or does not answer hides its banner for that request.
 */
export type LayoutBannerResolver = (
  context: LayoutBannerContext,
) => MaybePromise<LayoutBannerContent | undefined>;

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
}

interface LayoutBannerStaticBase extends LayoutBannerBase {
  /** Absent means the banner shows on every request. */
  visible?: LayoutBannerVisibility;
  resolve?: never;
}

/** A banner showing a fixed message, and optionally link buttons. */
export interface LayoutBannerTextInfo
  extends LayoutBannerStaticBase, LayoutBannerContent {
  component?: never;
  props?: never;
}

/** A banner mounting a component of a frontend layer as its content. */
export interface LayoutBannerComponentInfo extends LayoutBannerStaticBase {
  /**
   * Name of a global component, provided by a frontend layer, rendered as the
   * banner's content. The DMS still draws the chrome: color, icon, dismiss
   * button and ARIA role.
   */
  component: string;
  /** Props passed to the component. Must be serializable. */
  props?: Record<string, unknown>;
  text?: never;
  actions?: never;
}

/**
 * A banner whose message and buttons are built per request by `resolve`,
 * which also decides whether it shows.
 *
 * @example
 * ```typescript
 * RegisterLayoutBanner({
 *   key: "saas:past-due",
 *   variant: LayoutBannerVariant.ERROR,
 *   resolve: async ({ tenantId }) => {
 *     const invoice = await openInvoice(tenantId);
 *     if (!invoice) return undefined;
 *     return {
 *       text: {
 *         key: "saas.banner.past_due",
 *         params: {
 *           amount: { type: "money", value: invoice.due, currency: invoice.currency },
 *           date: { type: "date", value: invoice.retryAt, format: "day" },
 *         },
 *       },
 *       actions: [{ label: "$saas.banner.pay", to: "/settings/workspace/billing" }],
 *     };
 *   },
 * });
 * ```
 */
export interface LayoutBannerResolvedInfo extends LayoutBannerBase {
  resolve: LayoutBannerResolver;
  visible?: never;
  text?: never;
  actions?: never;
  component?: never;
  props?: never;
}

/**
 * A global banner rendered under the header of the dashboard layout, on every
 * page — tenant pages and module back-office pages alike.
 */
export type LayoutBannerInfo =
  | LayoutBannerTextInfo
  | LayoutBannerComponentInfo
  | LayoutBannerResolvedInfo;

/** @internal */
export namespace internal {
  export const RegisterLayoutBanner = new RegisteringProxy<
    (info: LayoutBannerInfo) => void
  >();
}

/**
 * Register a global banner under the dashboard header. Banners stack by
 * `order`, and each one's `visible` or `resolve` resolver is evaluated
 * server-side for every site layout request, so the banner is in the
 * server-rendered page. When the state a resolver reads changes, call `NotifyMenuChanged(tenantId)` so the
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
