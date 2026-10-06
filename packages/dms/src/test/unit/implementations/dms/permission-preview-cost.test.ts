import { GetMetadata, ImplementInterface } from "@antelopejs/interface-core";
import { expect } from "chai";
import {
  internal as pageImplInternal,
  resolvePermissionPreviewAccess,
} from "../../../../implementations/dms/page";
import * as permissionsImpl from "../../../../implementations/dms/permissions";
import * as permissionsResolverImpl from "../../../../implementations/dms/permissions-resolver";
import * as tenantAccessImpl from "../../../../implementations/dms/tenant-access";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { ComponentBuilder } from "@antelopejs/interface-dms/component";
import {
  PageController,
  PageMetadata,
  internal as pageInterfaceInternal,
  pagesCategory,
  RegisterPage,
} from "@antelopejs/interface-dms/page";
import * as permissionsInterface from "@antelopejs/interface-dms/permissions";
import * as permissionsResolverInterface from "@antelopejs/interface-dms/permissions-resolver";
import * as tenantAccessInterface from "@antelopejs/interface-dms/tenant-access";
import { stubPageAccessModels } from "../../../helpers/page-access";

// A preview resolves the layout the viewer is served on every page of the
// menu: a bounded number at once, and once per viewer whatever set is
// previewed next — the roles editor sends a new set on every edit.

const PAGE_COUNT = 8;
const MAX_CONCURRENT_PAGES = 4;
const FILTER_DELAY_MS = 5;
const TENANT = "pv-cost-tenant";
const OWNER = { _id: "pv-cost-owner", owner: true } as User;
const PAGE_IDS = Array.from(
  { length: PAGE_COUNT },
  (_, index) => `pages.pv-cost-${index}`,
);

let running = 0;
let peak = 0;
let reads = 0;

const settle = () => new Promise((resolve) => setImmediate(resolve));
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function countedBlock() {
  return new ComponentBuilder<{ tag: string }>("pv-cost-block")
    .options({ tag: "block" })
    .onFilter(async (_permissions, options) => {
      reads += 1;
      running += 1;
      peak = Math.max(peak, running);
      await delay(FILTER_DELAY_MS);
      running -= 1;
      return options;
    });
}

async function preview(permissions: string[]): Promise<void> {
  const { memberModel, roleModel } = stubPageAccessModels([]);
  await resolvePermissionPreviewAccess({
    user: OWNER,
    memberModel,
    roleModel,
    tenantId: TENANT,
    previewPermissions: new Set(permissions),
    pageLoses: async () => false,
  });
}

describe("[unit] implementations/dms/page — permission preview cost", () => {
  const cleanups: Array<() => void> = [];

  before(async () => {
    ImplementInterface(permissionsInterface, permissionsImpl);
    ImplementInterface(permissionsResolverInterface, permissionsResolverImpl);
    ImplementInterface(tenantAccessInterface, tenantAccessImpl);
    ImplementInterface(pageInterfaceInternal, pageImplInternal);
    for (let index = 0; index < PAGE_COUNT; index++) {
      class CostPage extends PageController(`pv-cost-${index}`, {
        displayName: `Cost ${index}`,
        category: pagesCategory,
      }) {
        static block = countedBlock();
      }
      RegisterPage()(CostPage);
      cleanups.push(() => {
        const { pageInfo } = GetMetadata(CostPage, PageMetadata);
        if (pageInfo) pageInterfaceInternal.RegisterPage.unregister(pageInfo);
      });
    }
    await settle();
  });

  after(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it("reads the viewer's layouts a few at a time, then not again for another set", async () => {
    await preview(PAGE_IDS);
    const firstReads = reads;
    expect(firstReads).to.be.at.least(PAGE_COUNT);
    expect(peak).to.be.at.most(MAX_CONCURRENT_PAGES);

    await preview([...PAGE_IDS, "pv-cost.another-grant"]);
    expect(reads).to.equal(firstReads);
  });
});
