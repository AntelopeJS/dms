import {
  type ControllerClass,
  ControllerMeta,
  RegisterRoute,
  UnregisterRoute,
} from "@antelopejs/interface-api";
import { GetMetadata } from "@antelopejs/interface-core";
import { Logging } from "@antelopejs/interface-core/logging";
import { Model } from "@antelopejs/interface-database-decorators";
import { AuthOwnerOnly, AuthUser } from "../auth";
import type { User } from "../auth/db";
// Import from the defining leaf, not the dms-base barrel: the barrel pulls in
// table-view, which imports the page interface back — entering through the
// barrel would then call DefaultLayout() while the barrel is still
// mid-evaluation.
import { DefaultLayout } from "../base/layouts";
import {
  Action,
  type Component,
  type ComponentInfo,
  type ComponentInfoSerialized,
} from "../component";
import { ResolveComponentSlots } from "../component-slots";
import { RoleModel, TenantMemberModel } from "../db";
import { AuthUserWithPermission, type TenantGuardOptions } from "../guards";
import {
  GetEffectiveUserPermissions,
  MarkModuleScopedPermission,
  type Permission,
  RegisterPermission,
  UnregisterPermission,
} from "../permissions";
import { getRequestTenantId } from "../request-tenant";
import { AssertTenantAccess, gateAllowsSurface } from "../tenant-access";
import {
  type NativeUploadFieldRegistration,
  SignUploadToken,
  internal as uploadInternal,
} from "../uploads";
// Categories resolve controller classes through PageMetadata; neither module
// dereferences the other during evaluation.
// oxlint-disable-next-line import/no-cycle
import { internal, isInsideModule, resolveCategoryInfo } from "./categories";
import { type ComponentTreeNode, collectComponentTree } from "./component-tree";
import {
  assembleLayoutComponents,
  type PageExtensionEntry,
} from "./extension-assembly";
import { type ComponentNodeMap, filterComponents } from "./layout-filter";
import {
  pageExtensions,
  pageLayoutHandlers,
  pageMetadataByFullId,
  stampPageRegistration,
  permissionMap,
  syncTargetExtensions,
} from "./registry";
import {
  type MenuOptions,
  type PageExtensionComponent,
  type PageExtensionInfo,
  type PageInfo,
  type PageLayout,
  type PageLayoutHandler,
} from "./types";
import {
  PageRegistration,
  type RouteCallbackContext,
} from "./page-registration";
import {
  isPageInsideModule,
  logModuleRouteGated,
  RequestTenantIdProperty,
} from "./metadata-helpers";

const NATIVE_UPLOAD_FIELD_TYPES = new Set(["file", "image"]);

interface UploadFieldNode {
  type: string;
  disabled?: boolean;
  component: { options?: Record<string, unknown> };
}

function isNativeUploadField(value: unknown): value is UploadFieldNode {
  if (!value || typeof value !== "object") return false;
  const node = value as Record<string, unknown>;
  return (
    typeof node.type === "string" &&
    NATIVE_UPLOAD_FIELD_TYPES.has(node.type) &&
    !!node.component &&
    typeof node.component === "object"
  );
}

function resolveWritePermission(
  componentName: string,
  component: Component,
  path: readonly string[],
): string | undefined {
  if (componentName !== "dms-table-view")
    return component.getAction("submit")?.permissionId;
  const action = { new: "add", edit: "edit" };
  const mode = Object.keys(action).find((key) => path.includes(key));
  if (mode)
    return (
      component.getAction(action[mode as keyof typeof action])?.permissionId ??
      "__native_upload_disabled__"
    );
  return "__native_upload_disabled__";
}

export class PageMetadata {
  public static key = Symbol();

  public pageInfo?: PageInfo;
  public layout?: ComponentInfo;
  public components: Record<string, Component> = {};
  /**
   * Tenant guard options the page's layout route was registered with. Recorded
   * at registration so the page's `bypassTenantAccessGate` can be asserted
   * without issuing a request.
   */
  public guardOptions?: TenantGuardOptions;

  private layoutRef?: PageLayout;
  private ownComponents: Record<string, ComponentInfoSerialized> = {};
  private componentMap: ComponentNodeMap = new Map();
  private nativeUploadFields = new Map<
    string,
    NativeUploadFieldRegistration[]
  >();

  /** Exact live positions of a component, including mounts on multiple pages. */
  public ComponentPermissionIds(component: Component): string[] {
    return [...this.componentMap.values()]
      .filter((node) => node.component === component && node.access === "own")
      .map((node) => node.permissionId);
  }
  // What each declared component actually claimed, so the teardown gives back
  // exactly that — the tree is read from the component itself, which a hot
  // reload may have rebuilt by then.
  private componentTrees = new Map<string, ComponentTreeNode[]>();
  private notifiedComponents = new Set<Component>();
  private extensionEntries = new Map<PageExtensionInfo, PageExtensionEntry[]>();
  private extensionSyncQueue: Promise<void> = Promise.resolve();
  /**
   * Being in the page registry and being ready to be extended are two facts:
   * the page is published before its first await, while `ownComponents` is
   * only filled after it. An extension grafted in between resolves its anchors
   * against a key set that stops wherever the serialization loop had reached,
   * so anchors on later fields silently fall to the end of the page. This gate
   * carries the second fact — extensions wait on it instead of racing it.
   */
  private ownComponentsReady = false;
  private ownComponentsGate: Promise<void> = Promise.resolve();
  private releaseOwnComponentsGate: () => void = () => undefined;
  private detached = false;
  private registration = new PageRegistration();
  private pagePermissionId = "";
  private registeredPagePermission = false;
  private skipComponentPermissions = false;
  private moduleScoped = false;

  constructor(public readonly target: ControllerClass) {}

  inherit(parent: PageMetadata) {
    const merge = <T extends object>(src?: T, dst?: T): T | undefined => {
      if (src) {
        if (dst) {
          return { ...dst, ...src };
        } else {
          return { ...src };
        }
      } else {
        return dst;
      }
    };
    this.pageInfo = merge(parent.pageInfo, this.pageInfo);
    this.layout = merge(parent.layout, this.layout);
    this.components = merge(parent.components, this.components) ?? {};
  }

  public SetComponent(id: string, component: Component) {
    this.components[id] = component;
  }

  public SetInfo(
    id: string,
    fullSlug: string,
    menuOptions: MenuOptions,
    pageLayout?: ComponentInfo,
  ) {
    const resolvedCategory = resolveCategoryInfo(menuOptions.category);
    const parentFullId = resolvedCategory?.fullId ?? "";
    const fullId = parentFullId ? `${parentFullId}.${id}` : id;

    const location = `${fullSlug}/pagelayout`.replace(/\/+/g, "/");

    const pageInfo: PageInfo = {
      ...menuOptions,
      category: resolvedCategory,
      id,
      fullId,
      fullSlug,
      layoutUrl: location,
      hidden: menuOptions.hidden || resolvedCategory?.hidden,
      publicAccess: menuOptions.publicAccess || resolvedCategory?.publicAccess,
      authOnly: menuOptions.authOnly || resolvedCategory?.authOnly,
      bypassTenantAccessGate:
        menuOptions.bypassTenantAccessGate ||
        resolvedCategory?.bypassTenantAccessGate,
    };

    if (!pageLayout) {
      pageLayout = DefaultLayout();
    }

    this.layout = pageLayout;
    this.pageInfo = pageInfo;
  }

  public async Register() {
    const pageInfo = this.pageInfo;
    if (!pageInfo) {
      throw new Error("PageMetadata not properly initialized");
    }

    this.registration = new PageRegistration();
    this.layoutRef = { layout: this.layout, components: {} };
    this.ownComponents = {};
    this.componentMap = new Map();
    this.componentTrees = new Map();
    this.notifiedComponents = new Set();
    this.extensionEntries = new Map();
    this.detached = false;
    // Shut before the page is published: from that point an extension can find
    // it and try to graft onto it. Everything that follows runs inside the try,
    // so nothing failing on the way can leave the gate shut — a page whose gate
    // stays shut holds every sync on it, teardowns included.
    this.closeOwnComponentsGate();

    try {
      this.publish(pageInfo);

      // Every permission is registered before the first await, so
      // GetResponsibleModule() still sees the registering module's frame:
      // resolved from an async continuation it returns nothing, and the
      // core's own sweep then has no module to attribute them to.
      const prepared = Object.entries(this.components).map(([key, component]) =>
        this.prepareComponent(component, key),
      );
      for (const prepare of prepared) {
        const { key, serialized } = await prepare();
        this.ownComponents[key] = serialized;
      }
      this.ownComponentsReady = true;
      this.rebuildLayoutComponents();
    } catch (error) {
      // A half-registered page is worse than none: it sits in the registry,
      // routed, with no layout to serve. Detached with it, so a sync held back
      // by the gate does not graft extensions onto the wreck once released.
      this.detached = true;
      this.registration.dispose();
      throw error;
    } finally {
      this.releaseOwnComponentsGate();
    }

    if (pageExtensions.has(pageInfo.fullId)) {
      await syncTargetExtensions(pageInfo.fullId);
    }
  }

  /**
   * Claim everything the page owns that does not depend on its components: the
   * registry entry, the navigation entry, the page permission and the layout
   * route.
   *
   * Published before the first await of `Register()`. The old order left a
   * window where the page was in the registry but not in this map: a module
   * destroyed during it found nothing to clear, and the registration still in
   * flight then wrote the metadata of a page that no longer serves — which
   * later extensions would graft themselves onto.
   */
  private publish(pageInfo: PageInfo): void {
    const previous = pageMetadataByFullId.get(pageInfo.fullId);
    pageMetadataByFullId.set(pageInfo.fullId, this);
    this.registration.track(() => {
      if (pageMetadataByFullId.get(pageInfo.fullId) === this) {
        pageMetadataByFullId.delete(pageInfo.fullId);
      }
    });
    if (previous && previous !== this) {
      previous.Dispose();
    }

    stampPageRegistration(pageInfo);
    internal.RegisterPage.register(pageInfo);
    this.registration.track(() => {
      internal.RegisterPage.unregister(pageInfo);
    });

    this.moduleScoped = isInsideModule(pageInfo);
    this.skipComponentPermissions =
      pageInfo.noComponentPermissions === true || pageInfo.authOnly === true;
    this.pagePermissionId = this.registerPagePermission(pageInfo);
    permissionMap.set(this.target, this.pagePermissionId);
    this.registration.track(() => {
      if (!this.ownsPagePermissions()) return;
      permissionMap.delete(this.target);
      if (this.registeredPagePermission && this.pagePermissionId) {
        UnregisterPermission(this.pagePermissionId);
        this.registeredPagePermission = false;
      }
    });

    this.applyAuthDecorators(pageInfo);
    this.registerLayoutRoute(pageInfo);
  }

  /**
   * Take down everything this registration created. Idempotent, and safe to
   * call on a metadata that has already been replaced: each step only undoes
   * what it still owns.
   *
   * @internal
   */
  public Dispose(): void {
    this.detached = true;
    this.releaseOwnComponentsGate();
    // Extensions belong to other modules: they survive this page and re-apply
    // if it registers again, but nothing of theirs may outlive it in the
    // permission tree. Synchronous, unlike registration, so a hot reload that
    // re-registers immediately cannot have this land on the replacement.
    // Snapshot: dropExtension deletes from the map being iterated.
    // oxlint-disable-next-line unicorn/no-useless-spread
    for (const info of [...this.extensionEntries.keys()]) {
      this.dropExtension(info);
    }
    this.rebuildLayoutComponents();
    this.ownComponents = {};
    this.registration.dispose();
  }

  /**
   * Bring the page's injected components in line with the extensions currently
   * registered against it: components of extensions that went away are torn
   * down, new ones are processed exactly like the page's own components, and
   * the layout order is rebuilt.
   *
   * Runs are serialized, so two modules registering back to back never process
   * the same extension twice.
   *
   * @internal
   */
  public SyncExtensions(): Promise<void> {
    const run = this.extensionSyncQueue
      .then(() => this.awaitOwnComponents())
      .then(() => this.applyRegisteredExtensions());
    // The queue itself must never stay rejected, or a single failed sync would
    // silently freeze every later registration and teardown on this page.
    this.extensionSyncQueue = run.catch(() => undefined);
    return run;
  }

  /**
   * Whether an extension grafting onto this page right now would resolve its
   * anchors against the page's full component set.
   *
   * @internal
   */
  public AcceptsExtensions(): boolean {
    return this.ownComponentsReady && !this.detached;
  }

  /**
   * Wait until the page has serialized its own components — and until the
   * registration that ends up owning them is the current one: a registration
   * starting while this waits installs its own gate, and a run released by the
   * old one would resolve its anchors against components the new one has yet
   * to write.
   */
  private async awaitOwnComponents(): Promise<void> {
    let gate = this.ownComponentsGate;
    await gate;
    while (gate !== this.ownComponentsGate) {
      gate = this.ownComponentsGate;
      await gate;
    }
  }

  private closeOwnComponentsGate(): void {
    this.ownComponentsReady = false;
    // Release the gate being replaced before dropping the only handle on its
    // resolver: whoever waits on it would otherwise wait on a promise nobody
    // can settle any more. `awaitOwnComponents` catches them up with this one.
    this.releaseOwnComponentsGate();
    this.ownComponentsGate = new Promise<void>((resolve) => {
      this.releaseOwnComponentsGate = resolve;
    });
  }

  private async applyRegisteredExtensions(): Promise<void> {
    const infos = this.detached
      ? []
      : (pageExtensions.get(this.pageInfo?.fullId ?? "") ?? []);
    const desired = new Set(infos);
    // Snapshot: dropExtension deletes from the map being iterated.
    // oxlint-disable-next-line unicorn/no-useless-spread
    for (const info of [...this.extensionEntries.keys()]) {
      if (!desired.has(info)) {
        this.dropExtension(info);
      }
    }
    for (const info of infos) {
      if (!this.extensionEntries.has(info)) {
        await this.addExtension(info);
      }
    }
    this.rebuildLayoutComponents();
  }

  private registerPagePermission(pageInfo: PageInfo): string {
    const fromAction =
      pageInfo.permission instanceof Action
        ? pageInfo.permission.toPermission()
        : undefined;

    const pagePermission = fromAction ?? {
      id: pageInfo.fullId,
      title: pageInfo.displayName,
      icon: pageInfo.icon,
      defaultGranted: pageInfo.publicAccess,
      ...(pageInfo.permission as Partial<Permission> | undefined),
    };

    this.registeredPagePermission = false;
    if (this.moduleScoped) {
      MarkModuleScopedPermission(pagePermission.id);
    } else if (!fromAction && pageInfo.authOnly !== true) {
      RegisterPermission(pagePermission.id, pagePermission);
      this.registeredPagePermission = true;
    }

    return pagePermission.id;
  }

  private registerLayoutRoute(pageInfo: PageInfo): void {
    const apimeta = GetMetadata(this.target, ControllerMeta);
    const resolvePageLayout = (
      user: User | undefined,
      memberModel: TenantMemberModel,
      roleModel: RoleModel,
      tenantId: string,
    ): Promise<PageLayout> =>
      this.resolvePageLayout(user, memberModel, roleModel, tenantId);

    // The by-slug entry carries no guard of its own, so it asks the resolver
    // to assert the gate; the route below is already guarded.
    const handler: PageLayoutHandler = (
      user,
      memberModel,
      roleModel,
      tenantId,
    ) => this.resolvePageLayout(user, memberModel, roleModel, tenantId, true);
    pageLayoutHandlers.set(pageInfo.fullSlug, handler);

    const routeId = RegisterRoute({
      location: pageInfo.layoutUrl,
      callback: async function (this: RouteCallbackContext) {
        return resolvePageLayout(
          this.user,
          this.memberModel,
          this.roleModel,
          this.tenantId,
        );
      },
      method: "GET",
      mode: "handler",
      parameters: [],
      properties: apimeta.computed_props,
      proto: this.target.prototype,
    });

    this.registration.track(() => {
      if (pageLayoutHandlers.get(pageInfo.fullSlug) === handler) {
        pageLayoutHandlers.delete(pageInfo.fullSlug);
      }
      // …and the page's own HTTP route. The by-slug entry used to be the only
      // half taken down, so an unregistered page kept answering on its direct
      // route for as long as its module stayed loaded — the very thing the
      // by-slug cleanup was added to prevent.
      UnregisterRoute(routeId);
    });
  }

  private async resolvePageLayout(
    user: User | undefined,
    memberModel: TenantMemberModel,
    roleModel: RoleModel,
    tenantId: string,
    enforceTenantAccessGate = false,
  ): Promise<PageLayout> {
    const layout = this.layoutRef;
    if (!layout) {
      throw new Error("PageMetadata not properly initialized");
    }

    // Only for the by-slug entry: the page's own route already asserts the
    // gate through its auth decorators, and asserting again would cost every
    // page load a second sweep of user-supplied gate callbacks. `/dms/pagelayout`
    // has no such guard — it asks for a session and nothing else — so without
    // this the page-level `bypassTenantAccessGate` flag would be advisory: a
    // member of a denied tenant could read the layout, upload tokens included,
    // of every page that did not opt out.
    //
    // Which surfaces survive a denial is `gateAllowsSurface`'s call, shared
    // with the menu and realtime page access so the three cannot drift.
    if (
      enforceTenantAccessGate &&
      user &&
      this.pageInfo &&
      !gateAllowsSurface(this.pageInfo, true)
    ) {
      await AssertTenantAccess(user._id, tenantId);
    }

    // Slots are resolved per request rather than baked into the cached layout:
    // a component that opens one is answering contributors that may register at
    // any time, long after this page did. Resolved *before* the permission
    // filter, so contributed content goes through every filter the page's own
    // content does — a contributed watch guarded by `requirePermission`
    // included.
    const components = await ResolveComponentSlots(layout.components);

    // Upload tokens are already baked into the cached layout: each form
    // stamped its own fields when it serialized, at registration
    // (`SignUploadToken` in interfaces/dms/uploads).
    if (this.pageInfo?.publicAccess === true || this.skipComponentPermissions) {
      return { ...layout, components };
    }

    const roleIds = user
      ? ((await memberModel.getByUser(user._id))?.roleIds ?? [])
      : [];
    const permissions = user
      ? await GetEffectiveUserPermissions(user, tenantId, roleIds, roleModel)
      : new Set<string>();

    return {
      ...layout,
      components: await filterComponents(
        components,
        this.pagePermissionId,
        permissions,
        this.componentMap,
      ),
    };
  }

  // Component and action ids descend from the page permission id, so a module
  // page's mark already covers them — they only need to stay out of the
  // grantable permission tree.
  private registersComponentPermissions(): boolean {
    return !this.skipComponentPermissions && !this.moduleScoped;
  }

  private componentPermissionId(componentKey: string): string {
    return `${this.pagePermissionId}.${componentKey}`;
  }

  private actionPermissions(component: Component): Permission[] {
    return Object.values(component.actions)
      .map((action) => action.toPermission())
      .filter((permission): permission is Permission => !!permission);
  }

  /**
   * Claim a component's permissions now, and hand back the serialization to
   * await later.
   *
   * The split is what keeps the registration attributable: `RegisterPermission`
   * reads the responsible module off the call stack, and every component after
   * the first used to register from a continuation of the previous one's
   * `serialize()` — where that stack is gone, so the core had no module to
   * sweep them from.
   *
   * A component's children are prepared with it, each under the permission id
   * of its position: they take part in per-request filtering under that id, so
   * a child that never claimed it would have its `onFilter` skipped.
   */
  private prepareComponent(
    component: Component,
    componentKey: string,
  ): () => Promise<{ key: string; serialized: ComponentInfoSerialized }> {
    const nodes = collectComponentTree(
      component,
      this.componentPermissionId(componentKey),
    );
    this.componentTrees.set(componentKey, nodes);

    // Tracked before anything is claimed: `onPageCreated` is consumer code and
    // can throw between the permission being registered and the end of this
    // method, and the rollback can only undo what it was told about.
    this.registration.track(() => {
      this.unregisterComponent(component, componentKey);
    });

    for (const node of nodes) {
      this.registerComponentNode(node);
    }

    return async () => {
      const serialized = await component.serialize();
      if (this.detached || this.componentTrees.get(componentKey) !== nodes)
        return { key: componentKey, serialized };
      await this.bindNativeUploadFields(
        serialized,
        this.componentPermissionId(componentKey),
      );
      return { key: componentKey, serialized };
    };
  }

  private async bindNativeUploadFields(
    serialized: ComponentInfoSerialized,
    componentId: string,
  ): Promise<void> {
    if (this.detached || this.componentMap.get(componentId)?.access !== "own")
      return;
    if (serialized.options)
      serialized.options = JSON.parse(JSON.stringify(serialized.options));
    await this.bindUploadOptions(
      serialized.options,
      serialized.componentName,
      componentId,
      [],
    );
    for (const child of serialized.children ?? []) {
      await this.bindNativeUploadFields(
        child.component,
        `${componentId}.${child.id}`,
      );
    }
  }

  private async bindUploadOptions(
    value: unknown,
    componentName: string,
    componentId: string,
    path: string[],
  ): Promise<void> {
    if (!value || typeof value !== "object") return;
    if (isNativeUploadField(value)) {
      await this.registerNativeUploadField(
        value,
        componentName,
        componentId,
        path,
      );
    }
    for (const [key, child] of Object.entries(value)) {
      await this.bindUploadOptions(child, componentName, componentId, [
        ...path,
        key,
      ]);
    }
  }

  private async registerNativeUploadField(
    node: UploadFieldNode,
    componentName: string,
    componentId: string,
    path: string[],
  ): Promise<void> {
    const mount = this.componentMap.get(componentId);
    if (this.detached || mount?.access !== "own") return;
    const options = node.component.options ?? {};
    node.component.options = options;
    const registration: NativeUploadFieldRegistration = {
      pageId: this.pageInfo?.fullId ?? "",
      componentId,
      storage:
        typeof options.storage === "string" ? options.storage : undefined,
      path: typeof options.path === "string" ? options.path : undefined,
      field:
        typeof options.attachmentField === "string"
          ? options.attachmentField
          : path.join("/"),
      visibility: options.visibility === "public" ? "public" : "private",
      writePermission: node.disabled
        ? "__native_upload_disabled__"
        : resolveWritePermission(componentName, mount.component, path),
      readPermissions:
        this.registersComponentPermissions() && !this.pageInfo?.publicAccess
          ? componentId
              .slice(this.pagePermissionId.length + 1)
              .split(".")
              .map(
                (_, index, parts) =>
                  `${this.pagePermissionId}.${parts.slice(0, index + 1).join(".")}`,
              )
          : [],
    };
    options.uploadToken = await SignUploadToken(registration);
    if (this.detached || this.componentMap.get(componentId) !== mount) return;
    uploadInternal.RegisterNativeUploadField.register(registration);
    const fields = this.nativeUploadFields.get(componentId) ?? [];
    fields.push(registration);
    this.nativeUploadFields.set(componentId, fields);
  }

  private registerComponentNode(node: ComponentTreeNode): void {
    const { component, permissionId } = node;
    this.componentMap.set(permissionId, node);

    // A withheld position claims nothing: its id belongs to an action, and it
    // is in the map only so the filter can refuse it. Its hook stays unrun —
    // a component that is never served must not register side effects.
    if (node.access === "withheld") return;

    // First position wins, and the walk is parent-first: a component mounted
    // both by the page and inside another keeps the id it is declared under.
    // Overwriting would make `GetPermissionId` — and every guard built on it —
    // depend on walk order.
    if (node.access === "own" && !permissionMap.has(component)) {
      permissionMap.set(component, permissionId);
    }

    if (this.registersComponentPermissions() && node.access === "own") {
      RegisterPermission(permissionId, {
        id: permissionId,
        title: component.metadata.name,
        icon: component.metadata.icon,
        description: component.metadata.description,
      });
    }

    this.notifyPageCreated(node);

    if (this.registersComponentPermissions()) {
      for (const actionPermission of this.actionPermissions(component)) {
        RegisterPermission(actionPermission.id, actionPermission);
      }
    }
  }

  /**
   * Run a component's `onCreated` hook, once per registration whatever the
   * number of positions the same instance occupies — the hook registers side
   * effects (a table view's form sub-pages, a chart's realtime topic), and
   * running it twice registers them twice.
   *
   * A nested component's hook is isolated the way `addExtension` isolates an
   * extension's: it never ran before this walk existed, so letting it abort a
   * page that used to register would turn a quietly inert component into a
   * screen that no longer serves. The page's own components keep aborting it —
   * a half-registered page is worse than none.
   */
  private notifyPageCreated(node: ComponentTreeNode): void {
    if (!node.component.onPageCreated) return;
    if (this.notifiedComponents.has(node.component)) return;
    this.notifiedComponents.add(node.component);

    if (node.depth === 0) {
      node.component.onPageCreated(this);
      return;
    }
    try {
      node.component.onPageCreated(this);
    } catch (error) {
      Logging.Error(
        `[dms] component "${node.permissionId}" failed its onCreated hook on page "${this.pageInfo?.fullId}": ${String(error)}`,
      );
    }
  }

  /**
   * A page's permission ids are derived from its `fullId`, so a metadata
   * instance that has already been replaced (dev hot reload re-registers the
   * page under a new class) shares them with the live one. Only the current
   * owner — or nobody, when the page is gone for good — may take them down.
   */
  private ownsPagePermissions(): boolean {
    const owner = pageMetadataByFullId.get(this.pageInfo?.fullId ?? "");
    return owner === undefined || owner === this;
  }

  // Nothing was prepared under this key — a teardown replayed after the
  // extension that owned it was already dropped, or a walk that threw before
  // claiming anything. Giving back what was never taken would unregister a
  // permission another position still holds.
  private unregisterComponent(_component: Component, componentKey: string) {
    const nodes = this.componentTrees.get(componentKey);
    if (!nodes) return;
    this.componentTrees.delete(componentKey);

    for (const node of nodes) {
      for (const field of this.nativeUploadFields.get(node.permissionId) ??
        []) {
        uploadInternal.RegisterNativeUploadField.unregister(field);
      }
      this.nativeUploadFields.delete(node.permissionId);
      this.componentMap.delete(node.permissionId);
      this.notifiedComponents.delete(node.component);
    }

    if (!this.ownsPagePermissions()) return;

    for (const node of nodes) {
      this.unregisterComponentNode(node);
    }
  }

  // Action ids are resolved through `permissionMap`, so the node's own entry
  // only goes once its actions have been given back — and only when the entry
  // is this position's, since another one may have claimed the instance first.
  private unregisterComponentNode(node: ComponentTreeNode): void {
    if (node.access === "withheld") return;
    if (this.registersComponentPermissions()) {
      for (const actionPermission of this.actionPermissions(node.component)) {
        UnregisterPermission(actionPermission.id);
      }
    }
    if (node.access !== "own") return;
    if (this.registersComponentPermissions()) {
      UnregisterPermission(node.permissionId);
    }
    if (permissionMap.get(node.component) === node.permissionId) {
      permissionMap.delete(node.component);
    }
  }

  // A component is tracked before it is processed, so a detach landing mid-way
  // still finds it. One that fails to register is taken back down and left out
  // of the layout, while the rest of its extension stands: the extension is
  // recorded either way, so a later sync never replays an `onPageCreated` side
  // effect that already ran.
  private async addExtension(info: PageExtensionInfo): Promise<void> {
    const entries: PageExtensionEntry[] = [];
    this.extensionEntries.set(info, entries);

    for (const [declarationIndex, contribution] of info.components.entries()) {
      entries.push({
        ...contribution,
        extensionName: info.extensionName,
        declarationIndex,
      });
      try {
        const componentPath = this.extensionComponentPath(contribution);
        const prepare = this.prepareComponent(
          contribution.component,
          componentPath,
        );
        entries[entries.length - 1].serialized = (await prepare()).serialized;
      } catch (error) {
        entries.pop();
        this.unregisterComponent(
          contribution.component,
          this.extensionComponentPath(contribution),
        );
        Logging.Error(
          `[dms] page extension "${info.extensionName}" could not register component "${contribution.key}" on page "${info.targetFullId}": ${String(error)}`,
        );
      }
    }

    if (this.detached) {
      this.dropExtension(info);
    }
  }

  private dropExtension(info: PageExtensionInfo): void {
    for (const entry of this.extensionEntries.get(info) ?? []) {
      this.unregisterComponent(
        entry.component,
        this.extensionComponentPath(entry),
      );
    }
    this.extensionEntries.delete(info);
  }

  private extensionComponentPath(component: PageExtensionComponent): string {
    const anchorPath = component.anchorPath ?? [];
    if (anchorPath.length <= 1) return component.key;
    return [...anchorPath.slice(0, -1), component.key].join(".");
  }

  private rebuildLayoutComponents(): void {
    if (!this.layoutRef) return;
    this.layoutRef.components = assembleLayoutComponents(
      this.ownComponents,
      [...this.extensionEntries.values()].flat(),
    );
  }

  private applyAuthDecorators(pageInfo: PageInfo): void {
    if (pageInfo.publicAccess === true) return;

    const authOnly = pageInfo.authOnly === true;
    const isModulePage = isPageInsideModule(pageInfo);
    this.guardOptions = {
      bypassTenantAccessGate: pageInfo.bypassTenantAccessGate,
    };
    const authDecorator = authOnly
      ? AuthUser()
      : isModulePage
        ? AuthOwnerOnly()
        : AuthUserWithPermission(this.target, this.guardOptions);

    authDecorator(this.target.prototype, "user");

    if (isModulePage && !authOnly) {
      logModuleRouteGated(pageInfo.fullSlug);
    }

    if (authOnly) return;

    Model(RoleModel, (ctx) => getRequestTenantId(ctx))(
      this.target.prototype,
      "roleModel",
    );

    Model(TenantMemberModel, (ctx) => getRequestTenantId(ctx))(
      this.target.prototype,
      "memberModel",
    );

    RequestTenantIdProperty()(this.target.prototype, "tenantId");
  }
}
