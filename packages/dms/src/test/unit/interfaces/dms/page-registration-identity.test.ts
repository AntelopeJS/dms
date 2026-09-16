// The module receives a per-context view of what the interface hands it, not
// the value itself, so a registration coming back from the implementation is
// never the object the metadata holds. These cover the token that recognises it
// anyway, and the teardown that depends on it.
import { GetMetadata, ImplementInterface } from "@antelopejs/interface-core";
import { expect } from "chai";
import {
  Category,
  GetPageLayoutBySlug,
  internal as pageInterfaceInternal,
  PageController,
  PageMetadata,
  pagesCategory,
} from "@antelopejs/interface-dms/page";
import {
  categoryIdentity,
  dynamicMenuProviderIdentity,
  isSamePageRegistration,
  moduleRootCategories,
  pageExtensions,
  pageIdentity,
  stampPageRegistration,
} from "@antelopejs/interface-dms/page/registry";
import { RegisterModule } from "@antelopejs/interface-dms/page/roots";
import type {
  DynamicMenuProviderInfo,
  ModuleInfo,
  PageExtensionInfo,
  PageInfo,
} from "@antelopejs/interface-dms/page/types";
import * as permissionsInterface from "@antelopejs/interface-dms/permissions";
import {
  cancelPendingMenuNotifications,
  internal as pageImplInternal,
} from "../../../../implementations/dms/page";
import * as permissionsImpl from "../../../../implementations/dms/permissions";

/** The global token the interface stamps registrations with. */
const REGISTRATION_TOKEN = Symbol.for(
  "@antelopejs/interface-dms:pageRegistration",
);

function buildPageInfo(fullId: string): PageInfo {
  return {
    id: fullId,
    displayName: "Boundary",
    fullId,
    fullSlug: `/${fullId}`,
    category: undefined,
    layoutUrl: `/api/dms/pagelayout/${fullId}`,
  };
}

/** What the module sees: a view of the registration, not the registration. */
function viewOf<T extends object>(value: T): T {
  return new Proxy(value, {});
}

describe("[unit] interface-dms/page/registry — registration identity", () => {
  it("recognises a registration through a view of it", () => {
    const pageInfo = buildPageInfo("pri-viewed");
    stampPageRegistration(pageInfo);
    expect(isSamePageRegistration(pageInfo, viewOf(pageInfo))).to.equal(true);
  });

  it("tells two registrations of the same page apart", () => {
    const first = buildPageInfo("pri-same-id");
    const second = buildPageInfo("pri-same-id");
    stampPageRegistration(first);
    stampPageRegistration(second);
    expect(isSamePageRegistration(first, second)).to.equal(false);
  });

  it("matches an unstamped registration only by reference", () => {
    const pageInfo = buildPageInfo("pri-unstamped");
    expect(isSamePageRegistration(pageInfo, pageInfo)).to.equal(true);
    expect(isSamePageRegistration(pageInfo, viewOf(pageInfo))).to.equal(false);
  });

  it("refuses to call two absent registrations the same one", () => {
    expect(isSamePageRegistration(undefined, undefined)).to.equal(false);
    expect(
      isSamePageRegistration(buildPageInfo("pri-one"), undefined),
    ).to.equal(false);
  });

  it("keeps the token out of the serialized page", () => {
    const pageInfo = buildPageInfo("pri-serialized");
    const before = Reflect.ownKeys(buildPageInfo("pri-serialized"));
    stampPageRegistration(pageInfo);
    expect(Object.keys(pageInfo)).to.deep.equal(before);
    expect(JSON.stringify(pageInfo)).to.equal(
      JSON.stringify(buildPageInfo("pri-serialized")),
    );
  });
});

describe("[unit] implementations/dms/page — teardown across the boundary", () => {
  before(() => {
    ImplementInterface(permissionsInterface, permissionsImpl);
    ImplementInterface(pageInterfaceInternal, pageImplInternal);
  });

  async function registerPage(id: string): Promise<PageInfo> {
    class Page extends PageController(id, {
      displayName: "Boundary",
      category: pagesCategory,
    }) {}
    const meta = GetMetadata(Page, PageMetadata);
    await meta.Register();
    if (!meta.pageInfo) throw new Error("pageInfo not initialized");
    return meta.pageInfo;
  }

  it("disposes the metadata when the page comes back as a view of itself", async () => {
    const pageInfo = await registerPage("pri-boundary");
    expect(GetPageLayoutBySlug(pageInfo.fullSlug)).to.not.equal(undefined);

    pageInterfaceInternal.clearPageMetadata(pageInfo.fullId, viewOf(pageInfo));

    expect(GetPageLayoutBySlug(pageInfo.fullSlug)).to.equal(undefined);
  });

  it("leaves a page alone when a different registration claims its id", async () => {
    const pageInfo = await registerPage("pri-superseded");
    const stale = buildPageInfo("pri-superseded");
    stampPageRegistration(stale);

    pageInterfaceInternal.clearPageMetadata(pageInfo.fullId, viewOf(stale));

    expect(GetPageLayoutBySlug(pageInfo.fullSlug)).to.not.equal(undefined);
  });

  // `RegisteringProxy` finds its entries by object reference, so a caller
  // holding a view of the page — which is every caller on the other side of the
  // boundary — used to unregister nothing at all, silently: the page stayed in
  // the registry, routed, and kept serving its layout.
  it("unregisters a page handed back as a view of itself", async () => {
    const pageInfo = await registerPage("pri-unregister-view");
    expect(GetPageLayoutBySlug(pageInfo.fullSlug)).to.not.equal(undefined);

    pageInterfaceInternal.RegisterPage.unregister(viewOf(pageInfo));

    expect(GetPageLayoutBySlug(pageInfo.fullSlug)).to.equal(undefined);
  });

  // Not a view this time but an unrelated object wearing the same token, which
  // is all the runtime guarantees survives the round trip.
  it("unregisters a page through any object carrying its token", async () => {
    const pageInfo = await registerPage("pri-unregister-token");
    const bearer = buildPageInfo("pri-unregister-token");
    Object.defineProperty(bearer, REGISTRATION_TOKEN, {
      value: (pageInfo as unknown as Record<symbol, string>)[
        REGISTRATION_TOKEN
      ],
    });

    pageInterfaceInternal.RegisterPage.unregister(bearer);

    expect(GetPageLayoutBySlug(pageInfo.fullSlug)).to.equal(undefined);
  });

  it("forgets a registration once it is unregistered", async () => {
    const pageInfo = await registerPage("pri-forgotten");
    const view = viewOf(pageInfo);

    pageInterfaceInternal.RegisterPage.unregister(view);
    expect(pageIdentity.resolve(view)).to.equal(view);

    expect(() =>
      pageInterfaceInternal.RegisterPage.unregister(view),
    ).to.not.throw();
  });

  it("unregisters a category handed back as a view of itself", () => {
    const category = Category("pri-category-view", {
      displayName: "Boundary section",
      category: pagesCategory,
      type: "label",
    });
    expect(categoryIdentity.resolve(viewOf(category))).to.equal(category);

    pageInterfaceInternal.RegisterCategory.unregister(viewOf(category));

    expect(categoryIdentity.resolve(viewOf(category))).to.not.equal(category);
  });

  it("unregisters a module handed back as a view of itself", () => {
    const info: ModuleInfo = {
      id: "pri-module-view",
      title: "Boundary module",
      description: "Registered to be torn down through a view",
      icon: "i-ph-cube",
    };
    RegisterModule(info);
    expect(moduleRootCategories.has(info.id)).to.equal(true);

    pageInterfaceInternal.RegisterModule.unregister(viewOf(info));

    // The implementation clears the module's category resolution on teardown,
    // which only runs if the unregister reached it at all.
    expect(moduleRootCategories.has(info.id)).to.equal(false);
  });

  it("unregisters a dynamic menu provider handed back as a view of itself", () => {
    const info: DynamicMenuProviderInfo = {
      categoryFullId: pagesCategory.fullId,
      resolver: () => [],
    };
    const view = viewOf(info);
    pageInterfaceInternal.RegisterDynamicMenuProvider.register(info);
    // Filed under the interface's own view of `info`, which no caller holds:
    // the token is the only way back to it.
    expect(dynamicMenuProviderIdentity.resolve(view)).to.not.equal(view);

    pageInterfaceInternal.RegisterDynamicMenuProvider.unregister(view);

    expect(dynamicMenuProviderIdentity.resolve(view)).to.equal(view);
  });

  it("unregisters a page extension handed back as a view of itself", async () => {
    const target = await registerPage("pri-extension-target");
    const info: PageExtensionInfo = {
      extensionName: "pri-extension",
      targetFullId: target.fullId,
      components: [],
    };
    pageInterfaceInternal.RegisterPageExtension.register(info);
    expect(pageExtensions.get(target.fullId)).to.have.lengthOf(1);

    pageInterfaceInternal.RegisterPageExtension.unregister(viewOf(info));

    expect(pageExtensions.get(target.fullId)).to.equal(undefined);
  });

  // `revokePageExtension` is what the implementation calls back into, and it
  // always receives a view: dropping the entry by reference revoked nothing.
  it("revokes a page extension named by a view of it", async () => {
    const target = await registerPage("pri-revoke-target");
    const info: PageExtensionInfo = {
      extensionName: "pri-revoked",
      targetFullId: target.fullId,
      components: [],
    };
    pageInterfaceInternal.RegisterPageExtension.register(info);

    pageInterfaceInternal.revokePageExtension(viewOf(info));

    expect(pageExtensions.get(target.fullId)).to.equal(undefined);
  });

  it("cancels the pending menu notifications idempotently", () => {
    expect(() => {
      cancelPendingMenuNotifications();
      cancelPendingMenuNotifications();
    }).to.not.throw();
  });
});
