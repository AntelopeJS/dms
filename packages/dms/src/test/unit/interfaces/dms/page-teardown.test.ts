import { ControllerMeta, getRegisteredRoutes } from "@antelopejs/interface-api";
import { GetMetadata, ImplementInterface } from "@antelopejs/interface-core";
import { expect } from "chai";
import { internal as pageImplInternal } from "../../../../implementations/dms/page";
import * as permissionsImpl from "../../../../implementations/dms/permissions";
import * as realtimeImpl from "../../../../implementations/dms/realtime";
import {
  Component,
  type ComponentInfo,
} from "@antelopejs/interface-dms/component";
import { AuthUserWithPermission } from "@antelopejs/interface-dms/guards";
import {
  Category,
  GetPageLayoutBySlug,
  PageController,
  PageMetadata,
  internal as pageInterfaceInternal,
  pagesCategory,
  RegisterPage,
} from "@antelopejs/interface-dms/page";
import * as permissionsInterface from "@antelopejs/interface-dms/permissions";
import { GetPermission } from "@antelopejs/interface-dms/permissions";
import {
  RegisterPageTopic,
  internal as realtimeInterface,
} from "@antelopejs/interface-dms/realtime";
import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import { getPageTopics } from "../../../../realtime/registry";

const PAGE_ID = "teardown-full";
const PAGE_FULL_ID = `pages.${PAGE_ID}`;
const PAGE_SLUG = `/${PAGE_ID}`;
const COMPONENT_KEY = "panel";
const TOPIC = "teardown:topic";
const LAYOUT_REQUEST_PROPERTIES = [
  "user",
  "roleModel",
  "memberModel",
  "tenantId",
];

interface DelayedComponentFixture {
  component: Component;
  resolve: () => void;
}

function delayedComponent(): DelayedComponentFixture {
  let resolveInfo: (info: ComponentInfo) => void = () => undefined;
  const componentInfo = new Promise<ComponentInfo>((resolve) => {
    resolveInfo = resolve;
  });
  return {
    component: new Component(componentInfo, { name: "Delayed" }),
    resolve: () => resolveInfo({ componentName: "Delayed" }),
  };
}

function routeCount(location: string): number {
  return getRegisteredRoutes().filter((route) => route.location === location)
    .length;
}

function buildPage(id: string) {
  class Page extends PageController(id, {
    displayName: "Teardown",
    category: pagesCategory,
  }) {
    static panel = CustomComponent(`TeardownPanel-${id}`).meta({
      name: "Panel",
    });
  }
  return Page;
}

async function registerPage(page: ReturnType<typeof buildPage>) {
  const meta = GetMetadata(page, PageMetadata);
  meta.SetComponent(COMPONENT_KEY, page.panel);
  await meta.Register();
  return meta;
}

describe("[unit] interfaces/dms/page — a page releases everything it registered", () => {
  before(async () => {
    ImplementInterface(permissionsInterface, permissionsImpl);
    ImplementInterface(pageInterfaceInternal, pageImplInternal);
    ImplementInterface(realtimeInterface, realtimeImpl.internal);
  });

  it("leaves no trace in any registry", async () => {
    const meta = await registerPage(buildPage(PAGE_ID));
    if (!meta.pageInfo) throw new Error("pageInfo not initialized");
    RegisterPageTopic(PAGE_FULL_ID, TOPIC);

    // Registered: registry, layout handler, HTTP route, permissions, topics.
    expect(GetPageLayoutBySlug(PAGE_SLUG)).to.not.equal(undefined);
    expect(routeCount(meta.pageInfo.layoutUrl)).to.equal(1);
    expect(await GetPermission(PAGE_FULL_ID)).to.not.equal(undefined);
    expect([...getPageTopics(PAGE_FULL_ID)]).to.deep.equal([TOPIC]);

    pageInterfaceInternal.RegisterPage.unregister(meta.pageInfo);

    expect(GetPageLayoutBySlug(PAGE_SLUG)).to.equal(undefined);
    // The route used to outlive its page for as long as the module stayed up.
    expect(routeCount(meta.pageInfo.layoutUrl)).to.equal(0);
    expect(await GetPermission(PAGE_FULL_ID)).to.equal(undefined);
    expect(await GetPermission(`${PAGE_FULL_ID}.${COMPONENT_KEY}`)).to.equal(
      undefined,
    );
    expect([...getPageTopics(PAGE_FULL_ID)]).to.deep.equal([]);
  });

  it("can be registered again after being torn down", async () => {
    const meta = await registerPage(buildPage("teardown-cycle"));
    if (!meta.pageInfo) throw new Error("pageInfo not initialized");
    pageInterfaceInternal.RegisterPage.unregister(meta.pageInfo);

    const again = await registerPage(buildPage("teardown-cycle"));
    if (!again.pageInfo) throw new Error("pageInfo not initialized");

    try {
      expect(GetPageLayoutBySlug("/teardown-cycle")).to.not.equal(undefined);
      expect(routeCount(again.pageInfo.layoutUrl)).to.equal(1);
      expect(await GetPermission("pages.teardown-cycle")).to.not.equal(
        undefined,
      );
    } finally {
      pageInterfaceInternal.RegisterPage.unregister(again.pageInfo);
    }
  });

  // A hot reload registers the replacement before the old one unregisters.
  it("does not let a replaced registration tear down the live one", async () => {
    const first = await registerPage(buildPage("teardown-reload"));
    const firstInfo = first.pageInfo;
    if (!firstInfo) throw new Error("pageInfo not initialized");

    const second = await registerPage(buildPage("teardown-reload"));
    if (!second.pageInfo) throw new Error("pageInfo not initialized");

    // The departing registration unwinds after its replacement took over.
    pageInterfaceInternal.RegisterPage.unregister(firstInfo);

    try {
      expect(GetPageLayoutBySlug("/teardown-reload")).to.not.equal(undefined);
      expect(routeCount(second.pageInfo.layoutUrl)).to.equal(1);
      expect(await GetPermission("pages.teardown-reload")).to.not.equal(
        undefined,
      );
    } finally {
      pageInterfaceInternal.RegisterPage.unregister(second.pageInfo);
    }
  });

  // Unregistering a category used to delete its whole subtree.
  it("keeps the pages of a category that unregisters", async () => {
    const category = Category("teardown-parent", {
      displayName: "Parent",
      category: pagesCategory,
    });
    const child = await registerPage(
      (() => {
        class Page extends PageController("teardown-child", {
          displayName: "Child",
          category,
        }) {
          static panel = CustomComponent("TeardownChildPanel").meta({
            name: "Panel",
          });
        }
        return Page;
      })(),
    );
    if (!child.pageInfo) throw new Error("pageInfo not initialized");

    try {
      pageInterfaceInternal.RegisterCategory.unregister(category);

      // The child belongs to another registration: it stays reachable.
      expect(GetPageLayoutBySlug(child.pageInfo.fullSlug)).to.not.equal(
        undefined,
      );
      expect(await GetPermission(child.pageInfo.fullId)).to.not.equal(
        undefined,
      );
    } finally {
      pageInterfaceInternal.RegisterPage.unregister(child.pageInfo);
    }
  });
});

describe("[unit] interfaces/dms/page — a failed registration leaves nothing behind", () => {
  before(async () => {
    ImplementInterface(permissionsInterface, permissionsImpl);
    ImplementInterface(pageInterfaceInternal, pageImplInternal);
  });

  // `onPageCreated` is consumer code: it can throw between the component's
  // permission being registered and the end of the preparation.
  it("unwinds a component that throws while being prepared", async () => {
    class ThrowingPage extends PageController("teardown-throwing", {
      displayName: "Throwing",
      category: pagesCategory,
    }) {
      static panel = CustomComponent("TeardownThrowingPanel").meta({
        name: "Panel",
      });
    }
    const meta = GetMetadata(ThrowingPage, PageMetadata);
    meta.SetComponent(COMPONENT_KEY, ThrowingPage.panel);
    // The hook is exposed through a getter, so it is shadowed on the instance.
    Object.defineProperty(ThrowingPage.panel, "onPageCreated", {
      configurable: true,
      get: () => () => {
        throw new Error("onPageCreated blew up");
      },
    });

    let failed = false;
    try {
      await meta.Register();
    } catch {
      failed = true;
    }

    expect(failed).to.equal(true);
    expect(
      await GetPermission(`pages.teardown-throwing.${COMPONENT_KEY}`),
    ).to.equal(undefined);
    expect(await GetPermission("pages.teardown-throwing")).to.equal(undefined);
  });

  it("unwinds what it had already registered", async () => {
    class BrokenPage extends PageController("teardown-broken", {
      displayName: "Broken",
      category: pagesCategory,
    }) {
      static panel = CustomComponent("TeardownBrokenPanel").meta({
        name: "Panel",
      });
    }
    const meta = GetMetadata(BrokenPage, PageMetadata);
    meta.SetComponent(COMPONENT_KEY, BrokenPage.panel);
    BrokenPage.panel.serialize = () => {
      throw new Error("serialization blew up");
    };

    let failed = false;
    try {
      await meta.Register();
    } catch {
      failed = true;
    }

    expect(failed).to.equal(true);
    // A half-registered page used to stay in the registry, routed, with no
    // layout to serve.
    expect(GetPageLayoutBySlug("/teardown-broken")).to.equal(undefined);
    expect(await GetPermission("pages.teardown-broken")).to.equal(undefined);
  });
});

// Kept out of the suites above: it only exists to prove the decorator path
// still registers, since it is the one every real page takes.
describe("[unit] interfaces/dms/page — the decorator path still registers", () => {
  it("registers through @RegisterPage", async () => {
    @RegisterPage()
    class DecoratedPage extends PageController("teardown-decorated", {
      displayName: "Decorated",
      category: pagesCategory,
    }) {}

    const meta = GetMetadata(DecoratedPage, PageMetadata);
    await new Promise((resolve) => setImmediate(resolve));

    try {
      expect(GetPageLayoutBySlug("/teardown-decorated")).to.not.equal(
        undefined,
      );
    } finally {
      if (meta.pageInfo) {
        pageInterfaceInternal.RegisterPage.unregister(meta.pageInfo);
      }
    }
  });
});

describe("[unit] interfaces/dms/page — layout route request context", () => {
  it("exists before component serialization settles", async () => {
    const delayed = delayedComponent();
    class DelayedPage extends PageController("layout-context-delayed", {
      displayName: "Delayed layout context",
      category: pagesCategory,
    }) {
      static panel = delayed.component;
    }
    AuthUserWithPermission(DelayedPage.panel)(DelayedPage.prototype, "user");
    const meta = GetMetadata(DelayedPage, PageMetadata);
    meta.SetComponent(COMPONENT_KEY, DelayedPage.panel);

    const registration = meta.Register();
    try {
      const controllerMeta = GetMetadata(DelayedPage, ControllerMeta);
      expect(Object.keys(controllerMeta.computed_props)).to.have.members(
        LAYOUT_REQUEST_PROPERTIES,
      );
      expect(routeCount("/layout-context-delayed/pagelayout")).to.equal(1);
    } finally {
      delayed.resolve();
      await registration;
      if (meta.pageInfo)
        pageInterfaceInternal.RegisterPage.unregister(meta.pageInfo);
    }
  });
});
