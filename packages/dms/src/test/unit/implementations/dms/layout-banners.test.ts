import { ImplementInterface } from "@antelopejs/interface-core";
import { expect } from "chai";
import {
  internal as pageImplInternal,
  buildSiteLayoutPayload,
} from "../../../../implementations/dms/page";
import * as layoutBannersImpl from "../../../../implementations/dms/layout-banners";
import * as permissionsImpl from "../../../../implementations/dms/permissions";
import * as permissionsResolverImpl from "../../../../implementations/dms/permissions-resolver";
import * as tenantAccessImpl from "../../../../implementations/dms/tenant-access";
import * as layoutBannersInterface from "@antelopejs/interface-dms/layout-banners";
import {
  type LayoutBannerContext,
  LayoutBannerScope,
  LayoutBannerVariant,
  RegisterLayoutBanner,
} from "@antelopejs/interface-dms/layout-banners";
import { internal as pageInterfaceInternal } from "@antelopejs/interface-dms/page";
import * as permissionsInterface from "@antelopejs/interface-dms/permissions";
import * as permissionsResolverInterface from "@antelopejs/interface-dms/permissions-resolver";
import * as tenantAccessInterface from "@antelopejs/interface-dms/tenant-access";
import { withPermissionAncestors } from "@antelopejs/interface-dms/internal/permission-ids";
import type { User } from "@antelopejs/interface-dms/auth/db";
import type { LayoutBannerSerialized } from "../../../../implementations/dms/layout-banners";
import { overrideResolverTimeout } from "../../../../implementations/dms/resolver-timeout";
import {
  denyingTenantGate,
  stubPageAccessModels,
} from "../../../helpers/page-access";

const TENANT = "layout-banner-tenant";
const DENIED_TENANT = "layout-banner-denied-tenant";
const MEMBER = { _id: "layout-banner-member" } as User;
const GRANTED_PERMISSION = "pages.layout-banner-page";

const RESOLVER_TIMEOUT_MS = 300;

const gateInfo = denyingTenantGate("layout-banner-gate", DENIED_TENANT);

async function bannersFor(
  tenantId = TENANT,
  user: User | undefined = MEMBER,
): Promise<LayoutBannerSerialized[]> {
  const { memberModel, roleModel } = stubPageAccessModels([GRANTED_PERMISSION]);
  const payload = await buildSiteLayoutPayload(
    user,
    memberModel,
    roleModel,
    tenantId,
  );
  return payload.siteLayout.banners;
}

async function bannerKeys(tenantId = TENANT): Promise<string[]> {
  return (await bannersFor(tenantId)).map((banner) => banner.key);
}

describe("[unit] implementations/dms/layout-banners — site layout resolution", () => {
  const disposers: Array<() => void> = [];

  before(() => {
    ImplementInterface(permissionsInterface, permissionsImpl);
    ImplementInterface(permissionsResolverInterface, permissionsResolverImpl);
    ImplementInterface(tenantAccessInterface, tenantAccessImpl);
    ImplementInterface(pageInterfaceInternal, pageImplInternal);
    ImplementInterface(layoutBannersInterface, layoutBannersImpl);
    tenantAccessInterface.RegisterTenantAccessGate(gateInfo);
  });

  after(() => {
    tenantAccessInterface.internal.RegisterTenantAccessGate.unregister(
      gateInfo,
    );
  });

  afterEach(() => {
    for (const dispose of disposers.splice(0)) dispose();
  });

  it("serves a banner without a resolver on every request, resolver left out", async () => {
    disposers.push(
      RegisterLayoutBanner({
        key: "always",
        variant: LayoutBannerVariant.INFO,
        text: "$banner.always",
      }),
    );

    expect(await bannersFor()).to.deep.equal([
      {
        key: "always",
        variant: LayoutBannerVariant.INFO,
        order: 0,
        scope: LayoutBannerScope.APP,
        dismissible: false,
        icon: undefined,
        text: "$banner.always",
        actions: undefined,
        component: undefined,
        props: undefined,
      },
    ]);
    expect(await bannersFor(TENANT, undefined)).to.have.length(1);
  });

  it("serves a component banner with its props", async () => {
    disposers.push(
      RegisterLayoutBanner({
        key: "component",
        variant: LayoutBannerVariant.WARNING,
        component: "MyBanner",
        props: { days: 3 },
        dismissible: true,
        icon: "i-ph-clock",
      }),
    );

    const [banner] = await bannersFor();
    expect(banner).to.include({
      component: "MyBanner",
      dismissible: true,
      icon: "i-ph-clock",
    });
    expect(banner?.props).to.deep.equal({ days: 3 });
  });

  it("ships each banner's scope, the application's pages by default", async () => {
    disposers.push(
      RegisterLayoutBanner({ key: "default", variant: "info", text: "a" }),
      RegisterLayoutBanner({
        key: "workspace",
        variant: "error",
        text: "b",
        scope: LayoutBannerScope.EVERYWHERE,
      }),
      RegisterLayoutBanner({
        key: "module-area",
        variant: "info",
        text: "c",
        scope: LayoutBannerScope.MODULES,
      }),
    );

    const scopes = (await bannersFor()).map(({ key, scope }) => [key, scope]);
    expect(scopes).to.deep.equal([
      ["default", LayoutBannerScope.APP],
      ["workspace", LayoutBannerScope.EVERYWHERE],
      ["module-area", LayoutBannerScope.MODULES],
    ]);
  });

  it("ships an unknown scope of an untyped registration as the default", async () => {
    disposers.push(
      RegisterLayoutBanner({
        key: "untyped",
        variant: "info",
        text: "a",
        scope: "somewhere" as LayoutBannerScope,
      }),
    );

    const [banner] = await bannersFor();
    expect(banner?.scope).to.equal(LayoutBannerScope.APP);
  });

  it("takes the scope the same way on a text, a resolved and a component banner", async () => {
    disposers.push(
      RegisterLayoutBanner({ key: "text-default", variant: "info", text: "a" }),
      RegisterLayoutBanner({
        key: "resolved-default",
        variant: "error",
        resolve: () => ({ text: "b" }),
      }),
      RegisterLayoutBanner({
        key: "component-default",
        variant: "warning",
        component: "MyBanner",
      }),
      RegisterLayoutBanner({
        key: "text-everywhere",
        variant: "info",
        text: "c",
        scope: LayoutBannerScope.EVERYWHERE,
      }),
      RegisterLayoutBanner({
        key: "resolved-everywhere",
        variant: "error",
        scope: LayoutBannerScope.EVERYWHERE,
        resolve: () => ({ text: "d" }),
      }),
      RegisterLayoutBanner({
        key: "component-everywhere",
        variant: "warning",
        scope: LayoutBannerScope.EVERYWHERE,
        component: "MyBanner",
      }),
    );

    const scopes = Object.fromEntries(
      (await bannersFor()).map(({ key, scope }) => [key, scope]),
    );
    expect(scopes).to.deep.equal({
      "text-default": LayoutBannerScope.APP,
      "resolved-default": LayoutBannerScope.APP,
      "component-default": LayoutBannerScope.APP,
      "text-everywhere": LayoutBannerScope.EVERYWHERE,
      "resolved-everywhere": LayoutBannerScope.EVERYWHERE,
      "component-everywhere": LayoutBannerScope.EVERYWHERE,
    });
  });

  it("stacks banners by order, ties in registration order", async () => {
    disposers.push(
      RegisterLayoutBanner({
        key: "late",
        variant: "info",
        text: "c",
        order: 20,
      }),
      RegisterLayoutBanner({ key: "tie-a", variant: "info", text: "a" }),
      RegisterLayoutBanner({
        key: "early",
        variant: "error",
        text: "e",
        order: -5,
      }),
      RegisterLayoutBanner({ key: "tie-b", variant: "info", text: "b" }),
    );

    expect(await bannerKeys()).to.deep.equal([
      "early",
      "tie-a",
      "tie-b",
      "late",
    ]);
  });

  it("resolves visibility per request from the tenant, the user and their permissions", async () => {
    const seen: LayoutBannerContext[] = [];
    disposers.push(
      RegisterLayoutBanner({
        key: "tenant-only",
        variant: "warning",
        text: "past due",
        visible: async (context) => {
          seen.push(context);
          return (
            context.tenantId === TENANT &&
            context.permissions.has(GRANTED_PERMISSION)
          );
        },
      }),
    );

    expect(await bannerKeys()).to.deep.equal(["tenant-only"]);
    expect(await bannerKeys("another-tenant")).to.deep.equal([]);
    expect(seen[0]).to.include({
      user: MEMBER,
      tenantId: TENANT,
      isOwner: false,
      isTenantAccessDenied: false,
    });
  });

  it("keeps the real permissions and flags the gate for a denied tenant", async () => {
    let seen: LayoutBannerContext | undefined;
    disposers.push(
      RegisterLayoutBanner({
        key: "suspended",
        variant: "error",
        text: "suspended",
        visible: (context) => {
          seen = context;
          return context.isTenantAccessDenied;
        },
      }),
    );

    expect(await bannerKeys(DENIED_TENANT)).to.deep.equal(["suspended"]);
    expect(seen?.isTenantAccessDenied).to.equal(true);

    expect([...(seen?.permissions ?? [])].sort()).to.deep.equal(
      withPermissionAncestors([GRANTED_PERMISSION]).sort(),
    );
    expect(await bannerKeys()).to.deep.equal([]);
  });

  it("hides the banner of a resolver that throws, and only that one", async () => {
    disposers.push(
      RegisterLayoutBanner({
        key: "broken",
        variant: "info",
        text: "broken",
        visible: () => {
          throw new Error("boom");
        },
      }),
      RegisterLayoutBanner({ key: "healthy", variant: "info", text: "ok" }),
    );

    expect(await bannerKeys()).to.deep.equal(["healthy"]);
  });

  it("hides the banner of a resolver that does not answer in time", async () => {
    disposers.push(
      RegisterLayoutBanner({
        key: "hanging",
        variant: "info",
        text: "hanging",
        visible: () => new Promise<boolean>(() => undefined),
      }),
    );

    const restoreTimeout = overrideResolverTimeout(RESOLVER_TIMEOUT_MS);
    try {
      const started = Date.now();
      expect(await bannerKeys()).to.deep.equal([]);
      expect(Date.now() - started).to.be.lessThan(RESOLVER_TIMEOUT_MS * 3);
    } finally {
      restoreTimeout();
    }
  });

  it("skips an untyped banner that has no content", async () => {
    const contentless = {
      key: "empty",
      variant: "info",
    } as unknown as layoutBannersInterface.LayoutBannerInfo;
    disposers.push(RegisterLayoutBanner(contentless));

    expect(await bannerKeys()).to.deep.equal([]);
  });

  it("serves a composed text and its buttons as registered", async () => {
    const text = {
      key: "banner.maintenance",
      params: { date: { type: "date" as const, value: "2026-10-10" } },
    };
    const actions = [{ label: "$banner.details", to: "/status" }];
    disposers.push(
      RegisterLayoutBanner({
        key: "composed",
        variant: "info",
        text,
        actions,
      }),
    );

    const [banner] = await bannersFor();
    expect(banner?.text).to.deep.equal(text);
    expect(banner?.actions).to.deep.equal(actions);
  });

  it("builds the content of a resolved banner per request", async () => {
    const seen: string[] = [];
    disposers.push(
      RegisterLayoutBanner({
        key: "past-due",
        variant: "error",
        resolve: async ({ tenantId }) => {
          seen.push(tenantId);
          if (tenantId !== TENANT) return undefined;
          return {
            text: {
              key: "saas.banner.past_due",
              params: {
                amount: { type: "money", value: 2900, currency: "EUR" },
              },
            },
            actions: [{ label: "$saas.banner.pay", to: "/billing?pay=1" }],
          };
        },
      }),
    );

    expect(await bannersFor()).to.deep.equal([
      {
        key: "past-due",
        variant: "error",
        order: 0,
        scope: LayoutBannerScope.APP,
        dismissible: false,
        icon: undefined,
        text: {
          key: "saas.banner.past_due",
          params: { amount: { type: "money", value: 2900, currency: "EUR" } },
        },
        actions: [{ label: "$saas.banner.pay", to: "/billing?pay=1" }],
      },
    ]);
    expect(await bannerKeys("another-tenant")).to.deep.equal([]);
    expect(seen).to.deep.equal([TENANT, "another-tenant"]);
  });

  it("hides a resolved banner whose resolver throws, hangs or answers no text", async () => {
    disposers.push(
      RegisterLayoutBanner({
        key: "throws",
        variant: "info",
        resolve: () => {
          throw new Error("boom");
        },
      }),
      RegisterLayoutBanner({
        key: "empty",
        variant: "info",
        resolve: () => ({ text: "" }),
      }),
      RegisterLayoutBanner({
        key: "hangs",
        variant: "info",
        resolve: () => new Promise(() => undefined),
      }),
      RegisterLayoutBanner({
        key: "healthy",
        variant: "info",
        resolve: () => ({ text: "$banner.ok" }),
      }),
    );

    const restoreTimeout = overrideResolverTimeout(RESOLVER_TIMEOUT_MS);
    try {
      expect(await bannerKeys()).to.deep.equal(["healthy"]);
    } finally {
      restoreTimeout();
    }
  });

  it("replaces a banner re-registered under the same key, and drops it on dispose", async () => {
    RegisterLayoutBanner({ key: "same", variant: "info", text: "first" });
    const dispose = RegisterLayoutBanner({
      key: "same",
      variant: "warning",
      text: "second",
    });

    const banners = await bannersFor();
    expect(banners.map((banner) => banner.text)).to.deep.equal(["second"]);

    dispose();
    expect(await bannerKeys()).to.deep.equal([]);
  });
});
