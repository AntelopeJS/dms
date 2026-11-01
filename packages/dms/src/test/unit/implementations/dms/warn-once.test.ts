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
import { captureWarnings } from "../../../helpers/logging";
import {
  registerTestPage,
  stubPageAccessModels,
} from "../../../helpers/page-access";
import { userFixture } from "../../../helpers/user-fixture";

const TENANT = "warn-once-tenant";
const CATEGORY_FULL_ID = pagesCategory.fullId;
const UNKNOWN_CATEGORY = "pages.warn-once-nowhere";
const MEMBER = userFixture({ _id: "warn-once-member" });
const PAGE_SLUG = "/warn-once-target";

function rowsTargetingNothing(count: number): DynamicMenuItem[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `row-${index}`,
    displayName: `Row ${index}`,
    fullSlug: `/warn-once-missing-${index}`,
  }));
}

async function buildLayout(): Promise<void> {
  const { memberModel, roleModel } = stubPageAccessModels([CATEGORY_FULL_ID]);
  await buildSiteLayoutPayload(MEMBER, memberModel, roleModel, TENANT);
}

describe("[unit] implementations/dms/page — warning cadence", () => {
  const cleanups: Array<() => void> = [];

  after(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  before(async () => {
    ImplementInterface(permissionsInterface, permissionsImpl);
    ImplementInterface(permissionsResolverInterface, permissionsResolverImpl);
    ImplementInterface(tenantAccessInterface, tenantAccessImpl);
    ImplementInterface(pageInterfaceInternal, pageImplInternal);

    cleanups.push(
      await registerTestPage(
        PageController("warn-once-target", {
          displayName: "Target",
          category: pagesCategory,
          publicAccess: true,
        }),
      ),
    );
  });

  it("reports one warning per reason, whatever the resolver returns", async () => {
    const captured = captureWarnings();
    const dispose = RegisterDynamicMenuProvider(CATEGORY_FULL_ID, async () =>
      rowsTargetingNothing(50),
    );

    try {
      await buildLayout();
      await buildLayout();
    } finally {
      dispose();
      captured.restore();
    }

    const targeting = captured.messages.filter((message) =>
      message.includes("targets unregistered page"),
    );
    expect(targeting).to.have.lengthOf(1);
  });

  it("reports a broken declaration once, however many requests reveal it", async () => {
    const captured = captureWarnings();
    const dispose = RegisterDynamicMenuProvider(
      UNKNOWN_CATEGORY,
      async () => [],
    );

    try {
      await buildLayout();
      await buildLayout();
      await buildLayout();
    } finally {
      dispose();
      captured.restore();
    }

    const unknown = captured.messages.filter((message) =>
      message.includes("targets unknown category"),
    );
    expect(unknown).to.have.lengthOf(1);
  });

  it("keeps two providers of one category apart", async () => {
    const first = RegisterDynamicMenuProvider(CATEGORY_FULL_ID, async () =>
      rowsTargetingNothing(3),
    );
    const second = RegisterDynamicMenuProvider(CATEGORY_FULL_ID, async () =>
      rowsTargetingNothing(3),
    );

    const captured = captureWarnings();
    try {
      await buildLayout();
    } finally {
      captured.restore();
    }

    const targeting = captured.messages.filter((message) =>
      message.includes("targets unregistered page"),
    );
    expect(targeting).to.have.lengthOf(2);

    first();
    const afterDispose = captureWarnings();
    try {
      await buildLayout();
    } finally {
      second();
      afterDispose.restore();
    }
    expect(
      afterDispose.messages.filter((message) =>
        message.includes("targets unregistered page"),
      ),
    ).to.have.lengthOf(0);
  });

  it("reports a collision to each provider whose entry was dropped", async () => {
    const collidingId = "warn-once-collision";
    const entry: DynamicMenuItem = {
      id: collidingId,
      displayName: "Collision",
      fullSlug: PAGE_SLUG,
    };
    const first = RegisterDynamicMenuProvider(CATEGORY_FULL_ID, async () => [
      entry,
    ]);
    const second = RegisterDynamicMenuProvider(CATEGORY_FULL_ID, async () => [
      entry,
    ]);
    const third = RegisterDynamicMenuProvider(CATEGORY_FULL_ID, async () => [
      entry,
    ]);

    const captured = captureWarnings();
    try {
      await buildLayout();
    } finally {
      first();
      second();
      third();
      captured.restore();
    }

    expect(
      captured.messages.filter((message) => message.includes("collides with")),
    ).to.have.lengthOf(2);
  });

  it("reports again when a still-broken provider is registered anew", async () => {
    const first = RegisterDynamicMenuProvider(UNKNOWN_CATEGORY, async () => []);
    await buildLayout();
    first();

    const captured = captureWarnings();
    const second = RegisterDynamicMenuProvider(
      UNKNOWN_CATEGORY,
      async () => [],
    );

    try {
      await buildLayout();
    } finally {
      second();
      captured.restore();
    }

    const unknown = captured.messages.filter((message) =>
      message.includes("targets unknown category"),
    );
    expect(unknown).to.have.lengthOf(1);
  });
});
