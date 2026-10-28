import { ImplementInterface } from "@antelopejs/interface-core";
import { expect } from "chai";
import {
  buildPagePayload,
  internal as pageImplInternal,
} from "../../../../implementations/dms/page";
import * as permissionsImpl from "../../../../implementations/dms/permissions";
import * as permissionsResolverImpl from "../../../../implementations/dms/permissions-resolver";
import * as tenantAccessImpl from "../../../../implementations/dms/tenant-access";
import type { User } from "@antelopejs/interface-dms/auth/db";
import {
  PageController,
  internal as pageInterfaceInternal,
  RegisterModule,
} from "@antelopejs/interface-dms/page";
import * as permissionsInterface from "@antelopejs/interface-dms/permissions";
import * as permissionsResolverInterface from "@antelopejs/interface-dms/permissions-resolver";
import * as tenantAccessInterface from "@antelopejs/interface-dms/tenant-access";
import {
  registerTestPage,
  stubPageAccessModels,
} from "../../../helpers/page-access";

const TENANT = "module-address-tenant";
// SAFETY: Module-page access consumes this id and owner flag; no persisted-user operations are exercised.
const OWNER = { _id: "module-address-owner", owner: true } as User;
const LANDING_MODULE = "module-address-landing";
const ORDERED_MODULE = "module-address-ordered";

function modulePage(module: string, id: string, order: number) {
  return PageController(id, { displayName: id, module, order });
}

async function servedSlug(path: string): Promise<string | undefined> {
  const { memberModel, roleModel } = stubPageAccessModels([]);
  const payload = await buildPagePayload(
    path,
    OWNER,
    memberModel,
    roleModel,
    TENANT,
    false,
  );
  return payload.route?.fullSlug;
}

async function failureStatus(path: string): Promise<number | undefined> {
  try {
    await servedSlug(path);
  } catch (error: PromiseRejectedResult["reason"]) {
    return error.status;
  }
  return undefined;
}

describe("[unit] implementations/dms/page — a module's own address", () => {
  const cleanups: Array<() => void> = [];

  before(async () => {
    ImplementInterface(permissionsInterface, permissionsImpl);
    ImplementInterface(permissionsResolverInterface, permissionsResolverImpl);
    ImplementInterface(tenantAccessInterface, tenantAccessImpl);
    ImplementInterface(pageInterfaceInternal, pageImplInternal);
    RegisterModule({
      id: LANDING_MODULE,
      title: "Landing module",
      description: "Declares the page it opens on",
      icon: "i-ph-cube",
      landingPage: "overview",
    });
    RegisterModule({
      id: ORDERED_MODULE,
      title: "Ordered module",
      description: "Opens on its first page",
      icon: "i-ph-cube",
    });
    cleanups.push(
      await registerTestPage(modulePage(LANDING_MODULE, "logs", 0)),
      await registerTestPage(modulePage(LANDING_MODULE, "overview", 1)),
      await registerTestPage(modulePage(ORDERED_MODULE, "second", 2)),
      await registerTestPage(modulePage(ORDERED_MODULE, "first", 1)),
    );
  });

  after(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it("serves the module's declared landing page", async () => {
    expect(await servedSlug(`/modules/${LANDING_MODULE}`)).to.equal(
      `/modules/${LANDING_MODULE}/overview`,
    );
  });

  it("serves the module's first page when it declares no landing page", async () => {
    expect(await servedSlug(`/modules/${ORDERED_MODULE}/`)).to.equal(
      `/modules/${ORDERED_MODULE}/first`,
    );
  });

  it("still answers 404 for a module that is not registered", async () => {
    expect(await failureStatus("/modules/module-address-unknown")).to.equal(
      404,
    );
  });

  it("still answers 404 for an unknown page inside a module", async () => {
    expect(await failureStatus(`/modules/${LANDING_MODULE}/missing`)).to.equal(
      404,
    );
  });
});
