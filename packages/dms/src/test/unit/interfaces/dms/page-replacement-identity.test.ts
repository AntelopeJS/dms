import type { ControllerClass } from "@antelopejs/interface-api";
import { GetMetadata, ImplementInterface } from "@antelopejs/interface-core";
import { expect } from "chai";
import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import {
  Component,
  type ComponentBuilder,
  type ComponentInfo,
} from "@antelopejs/interface-dms/component";
import {
  GetComponentPermissionIds,
  GetPermissionId,
  internal as pageInterfaceInternal,
  PageController,
  PageMetadata,
  pagesCategory,
  RegisterPageExtension,
} from "@antelopejs/interface-dms/page";
import type { PageInfo } from "@antelopejs/interface-dms/page/types";
import * as permissionsInterface from "@antelopejs/interface-dms/permissions";
import { GetPermission } from "@antelopejs/interface-dms/permissions";
import { internal as pageImplInternal } from "../../../../implementations/dms/page";
import * as permissionsImpl from "../../../../implementations/dms/permissions";
import { settle } from "./page-extension.helpers";

const COMPONENT_KEY = "panel";

function definePage(id: string): ControllerClass {
  return class extends PageController(id, {
    displayName: "Replacement",
    category: pagesCategory,
  }) {};
}

function panel(name: string): ComponentBuilder {
  return CustomComponent(`ReplacementPanel-${name}`).meta({ name: "Panel" });
}

interface HeldComponent {
  component: Component;
  release: () => void;
}

function heldComponent(): HeldComponent {
  let release: () => void = () => undefined;
  const info = new Promise<ComponentInfo>((resolve) => {
    release = () => resolve({ componentName: "ReplacementHeld" });
  });
  return { component: new Component(info, { name: "Held" }), release };
}

async function registerPage(
  page: ControllerClass,
  component: ComponentBuilder,
): Promise<PageInfo> {
  const meta = GetMetadata(page, PageMetadata);
  meta.SetComponent(COMPONENT_KEY, component);
  await meta.Register();
  if (!meta.pageInfo) throw new Error("pageInfo not initialized");
  return meta.pageInfo;
}

describe("[unit] interfaces/dms/page — a replaced page gives back its permission identities", () => {
  before(() => {
    ImplementInterface(permissionsInterface, permissionsImpl);
    ImplementInterface(pageInterfaceInternal, pageImplInternal);
  });

  /**
   * Fails on a teardown that skips everything once the page id belongs to the
   * replacement: the old component and controller keep their entries in the
   * permission map through every later disposal.
   */
  it("releases the old component and controller once another class takes the page id", async () => {
    const first = definePage("replacement-released");
    const firstPanel = panel("first");
    const firstInfo = await registerPage(first, firstPanel);
    const second = definePage("replacement-released");
    const secondPanel = panel("second");
    const secondInfo = await registerPage(second, secondPanel);
    const pageId = secondInfo.fullId;
    const componentId = `${pageId}.${COMPONENT_KEY}`;

    try {
      expect(GetPermissionId(firstPanel)).to.equal(undefined);
      expect(GetPermissionId(first)).to.equal(undefined);
      expect(GetPermissionId(secondPanel)).to.equal(componentId);
      expect(GetPermissionId(second)).to.equal(pageId);

      pageInterfaceInternal.RegisterPage.unregister(firstInfo);

      expect(GetPermissionId(secondPanel)).to.equal(componentId);
      expect(GetPermissionId(second)).to.equal(pageId);
      expect((await GetPermission(componentId))?.id).to.equal(componentId);
      expect((await GetPermission(pageId))?.id).to.equal(pageId);
    } finally {
      pageInterfaceInternal.RegisterPage.unregister(secondInfo);
    }

    expect(GetPermissionId(firstPanel)).to.equal(undefined);
    expect(GetPermissionId(first)).to.equal(undefined);
    expect(GetPermissionId(secondPanel)).to.equal(undefined);
  });

  /**
   * Fails on a release left to the old page's own teardown, which arrives after
   * the replacement mounted the same instance under the same id: the entry
   * the departing position matches is by then the replacement's.
   */
  it("keeps the identity of a component the replacement mounts again", async () => {
    const shared = panel("shared");
    const firstInfo = await registerPage(
      definePage("replacement-shared"),
      shared,
    );
    const secondInfo = await registerPage(
      definePage("replacement-shared"),
      shared,
    );
    const componentId = `${secondInfo.fullId}.${COMPONENT_KEY}`;

    try {
      pageInterfaceInternal.RegisterPage.unregister(firstInfo);

      expect(GetPermissionId(shared)).to.equal(componentId);
      expect((await GetPermission(componentId))?.id).to.equal(componentId);
    } finally {
      pageInterfaceInternal.RegisterPage.unregister(secondInfo);
    }

    expect(GetPermissionId(shared)).to.equal(undefined);
  });

  /**
   * Fails on a release that drops the entry without asking whether a live
   * page holds it: the replaced page's extension sync, still in flight when
   * it was disposed, takes up the next extension and drops its component
   * after the replacement has mounted it at the same position.
   */
  it("keeps the identity a live page holds when the replaced one drops it late", async () => {
    const first = heldComponent();
    const second = heldComponent();
    const firstInfo = await registerPage(
      definePage("replacement-late"),
      panel("late-first"),
    );
    class FirstExtension {
      static first = first.component;
    }
    class SecondExtension {
      static second = second.component;
    }
    RegisterPageExtension(firstInfo.fullId)(FirstExtension);
    RegisterPageExtension(firstInfo.fullId)(SecondExtension);
    await settle();
    const registering = registerPage(
      definePage("replacement-late"),
      panel("late-second"),
    );
    first.release();
    await settle();
    second.release();
    const secondInfo = await registering;
    await settle();

    try {
      const positions = GetComponentPermissionIds(second.component);
      expect(positions).to.have.length(1);
      expect(GetPermissionId(second.component)).to.equal(positions[0]);
    } finally {
      pageInterfaceInternal.RegisterPage.unregister(secondInfo);
    }
  });

  /**
   * Fails on a release that also runs, or runs differently, for a page that
   * was never replaced.
   */
  it("releases the identities of a page disposed without replacement", async () => {
    const page = definePage("replacement-none");
    const component = panel("none");
    const info = await registerPage(page, component);
    const componentId = `${info.fullId}.${COMPONENT_KEY}`;
    expect(GetPermissionId(component)).to.equal(componentId);
    expect(GetPermissionId(page)).to.equal(info.fullId);

    pageInterfaceInternal.RegisterPage.unregister(info);

    expect(GetPermissionId(component)).to.equal(undefined);
    expect(GetPermissionId(page)).to.equal(undefined);
    expect(await GetPermission(componentId)).to.equal(undefined);
    expect(await GetPermission(info.fullId)).to.equal(undefined);
  });
});
