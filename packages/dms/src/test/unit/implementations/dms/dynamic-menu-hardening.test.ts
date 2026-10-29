import { ImplementInterface } from "@antelopejs/interface-core";
import { expect } from "chai";
import {
  internal as pageImplInternal,
  buildSiteLayoutPayload,
} from "../../../../implementations/dms/page";
import { overrideResolverTimeout } from "../../../../implementations/dms/services";
import * as permissionsImpl from "../../../../implementations/dms/permissions";
import * as permissionsResolverImpl from "../../../../implementations/dms/permissions-resolver";
import * as tenantAccessImpl from "../../../../implementations/dms/tenant-access";
import {
  type DynamicMenuItem,
  PageController,
  internal as pageInterfaceInternal,
  pagesCategory,
  RegisterDynamicMenuProvider,
} from "@antelopejs/interface-dms/page";
import * as permissionsInterface from "@antelopejs/interface-dms/permissions";
import * as permissionsResolverInterface from "@antelopejs/interface-dms/permissions-resolver";
import * as tenantAccessInterface from "@antelopejs/interface-dms/tenant-access";
import type { User } from "@antelopejs/interface-dms/auth/db";
import {
  registerTestPage,
  stubPageAccessModels,
} from "../../../helpers/page-access";

const TENANT = "menu-hardening-tenant";
const CATEGORY_FULL_ID = pagesCategory.fullId;
// SAFETY: Dynamic-menu access consumes this id and the absent owner flag, not persisted-user methods.
const MEMBER = { _id: "menu-hardening-member" } as User;
const TARGET_SLUG = "/menu-hardening-target";

const RESOLVER_TIMEOUT_MS = 300;

function entry(id: string, displayName: string): DynamicMenuItem {
  return { id, displayName, fullSlug: TARGET_SLUG };
}

async function menuChildren(): Promise<string[]> {
  const { memberModel, roleModel } = stubPageAccessModels([CATEGORY_FULL_ID]);
  const payload = await buildSiteLayoutPayload(
    MEMBER,
    memberModel,
    roleModel,
    TENANT,
  );
  return payload.siteLayoutTree.children.pages?.childrenOrders ?? [];
}

describe("[unit] implementations/dms/page — dynamic menu hardening", () => {
  const cleanups: Array<() => void> = [];

  before(async () => {
    ImplementInterface(permissionsInterface, permissionsImpl);
    ImplementInterface(permissionsResolverInterface, permissionsResolverImpl);
    ImplementInterface(tenantAccessInterface, tenantAccessImpl);
    ImplementInterface(pageInterfaceInternal, pageImplInternal);

    cleanups.push(
      await registerTestPage(
        PageController("menu-hardening-target", {
          displayName: "Target",
          category: pagesCategory,
          publicAccess: true,
          hidden: true,
        }),
      ),
    );
  });

  after(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  it("orders entries of equal rank by what the reader sees", async () => {
    const dispose = RegisterDynamicMenuProvider(CATEGORY_FULL_ID, async () => [
      entry("zebra", "Zebra"),
      entry("alpha", "Alpha"),
      entry("mango", "Mango"),
    ]);

    try {
      const children = await menuChildren();
      const dynamic = children.filter((id) =>
        ["alpha", "mango", "zebra"].includes(id),
      );
      expect(dynamic).to.deep.equal(["alpha", "mango", "zebra"]);
    } finally {
      dispose();
    }
  });

  it("drops the entries of a resolver that does not answer in time", async () => {
    const dispose = RegisterDynamicMenuProvider(
      CATEGORY_FULL_ID,
      () => new Promise<DynamicMenuItem[]>(() => undefined),
    );
    const restoreTimeout = overrideResolverTimeout(RESOLVER_TIMEOUT_MS);

    try {
      const started = Date.now();
      const children = await menuChildren();
      const elapsed = Date.now() - started;

      expect(children).to.not.include("alpha");
      expect(elapsed).to.be.greaterThanOrEqual(RESOLVER_TIMEOUT_MS - 100);
      expect(elapsed).to.be.lessThan(RESOLVER_TIMEOUT_MS * 3);
    } finally {
      restoreTimeout();
      dispose();
    }
  });

  it("runs the providers together rather than one after the other", async () => {
    const RESOLVER_DELAY_MS = 300;
    const PROVIDER_COUNT = 4;
    const slow = (id: string) => async () => {
      await new Promise((resolve) => setTimeout(resolve, RESOLVER_DELAY_MS));
      return [entry(id, id)];
    };
    const disposers = Array.from({ length: PROVIDER_COUNT }, (_, index) =>
      RegisterDynamicMenuProvider(CATEGORY_FULL_ID, slow(`slow-${index}`)),
    );

    try {
      const started = Date.now();
      await menuChildren();
      const elapsed = Date.now() - started;

      expect(elapsed).to.be.lessThan(RESOLVER_DELAY_MS * PROVIDER_COUNT);
    } finally {
      for (const dispose of disposers) dispose();
    }
  });

  it("survives a provider unregistering while the resolvers run", async () => {
    let disposeSecond: (() => void) | undefined;
    const first = RegisterDynamicMenuProvider(CATEGORY_FULL_ID, async () => {
      disposeSecond?.();
      return [entry("still-here", "Still here")];
    });
    disposeSecond = RegisterDynamicMenuProvider(CATEGORY_FULL_ID, async () => [
      entry("also-here", "Also here"),
    ]);

    try {
      const children = await menuChildren();

      expect(children).to.include("still-here");
      expect(children).to.include("also-here");
    } finally {
      first();
      disposeSecond();
    }
  });

  it("merges in registration order however the resolvers finish", async () => {
    const first = RegisterDynamicMenuProvider(CATEGORY_FULL_ID, async () => {
      await new Promise((resolve) => setTimeout(resolve, 120));
      return [entry("shared", "From the first provider")];
    });
    const second = RegisterDynamicMenuProvider(CATEGORY_FULL_ID, async () => [
      entry("shared", "From the second provider"),
    ]);

    try {
      const { memberModel, roleModel } = stubPageAccessModels([
        CATEGORY_FULL_ID,
      ]);
      const payload = await buildSiteLayoutPayload(
        MEMBER,
        memberModel,
        roleModel,
        TENANT,
      );
      const node = payload.siteLayoutTree.children.pages?.children.shared;

      expect(node?.displayName).to.equal("From the first provider");
    } finally {
      first();
      second();
    }
  });
});
