import { ImplementInterface } from "@antelopejs/interface-core";
import { expect } from "chai";
import {
  internal as pageImplInternal,
  buildSiteLayoutPayload,
} from "../../../../implementations/dms/page";
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
const MEMBER = { _id: "menu-hardening-member" } as User;
const TARGET_SLUG = "/menu-hardening-target";
const RESOLVER_TIMEOUT_MS = 2000;

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

  // Entries sharing an `order` used to fall back to insertion order, which is
  // the order the modules happened to start in.
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

  // A hanging resolver used to hold the menu of every user of the tenant.
  it("drops the entries of a resolver that does not answer in time", async () => {
    const dispose = RegisterDynamicMenuProvider(
      CATEGORY_FULL_ID,
      () => new Promise<DynamicMenuItem[]>(() => undefined),
    );

    try {
      const started = Date.now();
      const children = await menuChildren();
      const elapsed = Date.now() - started;

      expect(children).to.not.include("alpha");
      expect(elapsed).to.be.greaterThanOrEqual(RESOLVER_TIMEOUT_MS - 100);
      expect(elapsed).to.be.lessThan(RESOLVER_TIMEOUT_MS * 2);
    } finally {
      dispose();
    }
  }).timeout(RESOLVER_TIMEOUT_MS * 3);

  // Sequential resolvers made the request wait for their sum.
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

      // The slowest, not the sum of all four.
      expect(elapsed).to.be.lessThan(RESOLVER_DELAY_MS * PROVIDER_COUNT);
    } finally {
      for (const dispose of disposers) dispose();
    }
  }).timeout(RESOLVER_TIMEOUT_MS * 3);

  // The resolvers are launched from the live registry and the results merged
  // by index: a module unregistering meanwhile would shift the array under the
  // merge, and entries would land under another provider's category.
  it("survives a provider unregistering while the resolvers run", async () => {
    let disposeSecond: (() => void) | undefined;
    const first = RegisterDynamicMenuProvider(CATEGORY_FULL_ID, async () => {
      // Mutates the registry from inside the resolution itself.
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

  // Which provider wins a colliding id must not depend on which answered first.
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
  }).timeout(RESOLVER_TIMEOUT_MS * 3);
});
