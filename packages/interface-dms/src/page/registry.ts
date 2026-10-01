import type { ControllerClass } from "@antelopejs/interface-api";
import { GetResponsibleModule } from "@antelopejs/interface-core";
import {
  GetModuleContext,
  type ModuleExecutionContext,
  RunWithModuleContext,
} from "@antelopejs/interface-core/modules";
import {
  type Component,
  ComponentTarget,
  type ComponentTargetInput,
  getPermissionIdRef,
} from "../component";
import type { PageMetadata } from "./metadata";
import type {
  CategoryInfo,
  DynamicMenuProviderInfo,
  ModuleInfo,
  PageExtensionInfo,
  PageInfo,
  PageLayoutHandler,
} from "./types";

export const permissionMap = new Map<Component | ControllerClass, string>();

getPermissionIdRef.get = (component: Component) => permissionMap.get(component);

export const pageLayoutHandlers = new Map<string, PageLayoutHandler>();

export const pageMetadataByFullId = new Map<string, PageMetadata>();

/**
 * A registration crosses the interface boundary when the module implementing
 * the interface receives it, and the runtime hands that module a per-context
 * view of the object rather than the object itself. Reference equality does not
 * survive the round trip, so a registration that comes back from the
 * implementation is recognised by a token stamped on it instead.
 */
const REGISTRATION_TOKEN = Symbol.for(
  "@antelopejs/interface-dms:pageRegistration",
);

let nextRegistrationToken = 0;

type Stamped<T> = T & { [REGISTRATION_TOKEN]?: string };

/**
 * Token-based identity for one family of registrations.
 *
 * Two things need it. Comparing a registration the implementation handed back
 * against one held here cannot use `===`, and `RegisteringProxy` keys its own
 * bookkeeping by object reference — so a caller unregistering with the view it
 * holds would match nothing and silently leave the registration live. The
 * token survives the round trip, so it can stand in for the reference in the
 * first case and lead back to it in the second.
 */
export class RegistrationIdentity<T extends object> {
  private readonly byToken = new Map<string, T>();

  constructor(private readonly kind: string) {}

  private tokenOf(value: T): string | undefined {
    return (value as Stamped<T>)[REGISTRATION_TOKEN];
  }

  /** Give a registration a fresh identity, replacing any it already carried. */
  public stamp(value: T): void {
    Object.defineProperty(value, REGISTRATION_TOKEN, {
      value: `${this.kind}:${(nextRegistrationToken += 1)}`,
      configurable: true,
      enumerable: false,
      writable: false,
    });
  }

  /**
   * Record the reference a registration is filed under, stamping it first if
   * nothing else did. Re-stamping here would orphan the identity an earlier
   * caller already handed out.
   */
  public remember(value: T): void {
    if (this.tokenOf(value) === undefined) this.stamp(value);
    const token = this.tokenOf(value);
    if (token === undefined) return;
    this.byToken.set(token, value);
  }

  /**
   * Drop a registration's reference once it is unregistered.
   *
   * Only the registration still holding the token forgets it: a hot reload
   * files the replacement before the departing one unwinds, and letting the
   * departing one delete would strand the live reference.
   */
  public forget(value: T): void {
    const token = this.tokenOf(value);
    if (token === undefined) return;
    if (this.byToken.get(token) !== value) return;
    this.byToken.delete(token);
  }

  /**
   * Resolve a registration back to the reference it was filed under.
   *
   * Returns the argument unchanged when it carries no token or names no live
   * registration, so an unknown one still reaches the proxy and is refused
   * there rather than here.
   */
  public resolve(value: T): T {
    const token = this.tokenOf(value);
    if (token === undefined) return value;
    return this.byToken.get(token) ?? value;
  }

  /**
   * Two absent registrations are not the same registration: the caller asks
   * whether a known one matches, and "nothing matches nothing" would let a
   * teardown claim something it never registered.
   */
  public isSame(left: T | undefined, right: T | undefined): boolean {
    if (!left || !right) return false;
    if (left === right) return true;
    const token = this.tokenOf(left);
    return token !== undefined && token === this.tokenOf(right);
  }
}

export const pageIdentity = new RegistrationIdentity<PageInfo>("page");

export const categoryIdentity = new RegistrationIdentity<CategoryInfo>(
  "category",
);

export const moduleIdentity = new RegistrationIdentity<ModuleInfo>("module");

export const dynamicMenuProviderIdentity =
  new RegistrationIdentity<DynamicMenuProviderInfo>("dynamic-menu-provider");

export const pageExtensionIdentity =
  new RegistrationIdentity<PageExtensionInfo>("page-extension");

/**
 * The execution context of the module that registered each page extension,
 * keyed by the registered reference.
 *
 * The DMS applies an extension from its own context -- it receives it through
 * its implementation of `RegisterPageExtension`, and re-applies it whenever the
 * target page registers again. What preparing the extension's components
 * registers (their permissions, native upload fields, form sub-pages, realtime
 * topics) would then belong to whichever generation happened to run the sync,
 * and go away with it rather than with the module that extends the page.
 */
const pageExtensionContexts = new WeakMap<
  PageExtensionInfo,
  ModuleExecutionContext
>();

/**
 * Remember the context of the module registering `info`. Called from the
 * registration itself, before the extension crosses into the DMS.
 */
export function capturePageExtensionContext(info: PageExtensionInfo): void {
  const context = GetModuleContext();
  if (context) {
    pageExtensionContexts.set(info, context);
    return;
  }
  const module = GetResponsibleModule();
  if (module) pageExtensionContexts.set(info, { module });
}

/**
 * Run `callback` as the module that registered `info`, so everything it
 * registers is owned by, and released with, that module. Runs in the current
 * context when the registering module is unknown.
 */
export function runAsPageExtensionOwner<T>(
  info: PageExtensionInfo,
  callback: () => T,
): T {
  const context = pageExtensionContexts.get(
    pageExtensionIdentity.resolve(info),
  );
  return context ? RunWithModuleContext(context, callback) : callback();
}

export function stampPageRegistration(pageInfo: PageInfo): void {
  pageIdentity.stamp(pageInfo);
}

export function isSamePageRegistration(
  left: PageInfo | undefined,
  right: PageInfo | undefined,
): boolean {
  return pageIdentity.isSame(left, right);
}

/** Resolve every live page position of a reusable component. */
export function GetComponentPermissionIds(component: Component): string[] {
  return [...pageMetadataByFullId.values()].flatMap((page) =>
    page.ComponentPermissionIds(component),
  );
}
export const pageExtensions = new Map<string, PageExtensionInfo[]>();

/**
 * Whether `info` is still registered: an extension whose module went away is
 * revoked before that module's context is invalidated, and must not be
 * prepared in that context afterwards.
 */
export function isPageExtensionRegistered(info: PageExtensionInfo): boolean {
  const registered = pageExtensions.get(info.targetFullId) ?? [];
  return registered.some((entry) => pageExtensionIdentity.isSame(entry, info));
}

export function GetPageLayoutBySlug(
  slug: string,
): PageLayoutHandler | undefined {
  return pageLayoutHandlers.get(slug);
}

/**
 * Drop the layout handler a page registered.
 *
 * Called when the page unregisters: the handler is reachable by slug through
 * `/dms/pagelayout`, so leaving it behind keeps serving the layout of a page
 * that is already gone from the registry, the navigation tree and its own
 * route — an unloaded module's screens would still answer.
 *
 * @param slug Full slug the page registered under
 */
export function ClearPageLayoutBySlug(slug: string): void {
  pageLayoutHandlers.delete(slug);
}

/**
 * Whether the page is registered *and* done serializing its own components.
 * Presence in `pageMetadataByFullId` only answers the first half: a page is
 * published there before it has any component to anchor onto.
 */
export function acceptsPageExtensions(targetFullId: string): boolean {
  return pageMetadataByFullId.get(targetFullId)?.AcceptsExtensions() ?? false;
}

/** One page extension still waiting for the page id it names to register. */
export interface PendingPageExtension {
  extensionName: string;
  targetFullId: string;
}

/**
 * Extensions whose target page no module has registered. An extension names its
 * target by id, so a typo — or a module that is simply not deployed — is
 * indistinguishable from a page that has yet to start; both surface here.
 */
export function GetPendingPageExtensions(): PendingPageExtension[] {
  const pending: PendingPageExtension[] = [];
  for (const [targetFullId, infos] of pageExtensions) {
    if (pageMetadataByFullId.has(targetFullId)) continue;
    for (const info of infos) {
      pending.push({ extensionName: info.extensionName, targetFullId });
    }
  }
  return pending;
}

/**
 * Ids of every registered page, sorted. The id of a page is what
 * `@RegisterPageExtension` takes, and also its permission id.
 */
export function GetRegisteredPageIds(): string[] {
  return [...pageMetadataByFullId.keys()].sort();
}

export function syncTargetExtensions(targetFullId: string): Promise<void> {
  const metadata = pageMetadataByFullId.get(targetFullId);
  if (!metadata) {
    return Promise.resolve();
  }
  return metadata.SyncExtensions();
}

/** Resolve the permission id of a page, component, or exact child position. */
export function GetPermissionId(
  target: ComponentTargetInput | ControllerClass,
): string | undefined {
  if (target instanceof ComponentTarget) {
    const rootPermissionId = permissionMap.get(target.root);
    if (!rootPermissionId) return undefined;
    return [rootPermissionId, ...target.path].join(".");
  }
  return permissionMap.get(target);
}

export const moduleRootCategories = new Map<string, CategoryInfo>();
export const moduleDefaultCategories = new Map<string, CategoryInfo>();
