import { GetMetadata, ImplementInterface } from "@antelopejs/interface-core";
import { expect } from "chai";
import type { CustomButtonSerialized } from "@antelopejs/interface-dms/base/types";
import type { ComponentInfoSerialized } from "@antelopejs/interface-dms/component";
import { RegisterInviteAvailability } from "@antelopejs/interface-dms/invite-extensions";
import {
  GetPageLayoutBySlug,
  PageMetadata,
  internal as pageInterfaceInternal,
} from "@antelopejs/interface-dms/page";
import * as permissionsInterface from "@antelopejs/interface-dms/permissions";
import * as permissionsResolverInterface from "@antelopejs/interface-dms/permissions-resolver";
import * as tenantAccessInterface from "@antelopejs/interface-dms/tenant-access";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { internal as pageImplInternal } from "../../../../implementations/dms/page";
import * as permissionsImpl from "../../../../implementations/dms/permissions";
import * as permissionsResolverImpl from "../../../../implementations/dms/permissions-resolver";
import * as tenantAccessImpl from "../../../../implementations/dms/tenant-access";
import { resolveInviteLanguage } from "../../../../pages/settings/users/member-invite-form";
import {
  MEMBER_INVITE_BUTTON_ID,
  MembersSettingsController,
} from "../../../../pages/settings/users/members";
import { stubPageAccessModels } from "../../../helpers/page-access";

const FULL_TENANT = "invite-availability-full-tenant";
const OPEN_TENANT = "invite-availability-open-tenant";
const SEAT_LIMIT_REASON = "$test.seat_limit_reached";
const INVITER = { _id: "invite-availability-inviter" } as User;

interface MembersTableOptions {
  customButtons?: CustomButtonSerialized[];
}

function membersPageSlug(): string {
  const pageInfo = GetMetadata(
    MembersSettingsController,
    PageMetadata,
  ).pageInfo;
  if (!pageInfo) throw new Error("The members page is not registered");
  return pageInfo.fullSlug;
}

async function inviteButtonFor(
  tenantId: string,
): Promise<CustomButtonSerialized | undefined> {
  const handler = GetPageLayoutBySlug(membersPageSlug());
  if (!handler) throw new Error("The members page serves no layout");
  const { memberModel, roleModel } = stubPageAccessModels(["*"]);
  const layout = await handler(INVITER, memberModel, roleModel, tenantId);
  const table = layout.components
    .table as ComponentInfoSerialized<MembersTableOptions>;
  return table.options?.customButtons?.find(
    (button) => button.id === MEMBER_INVITE_BUTTON_ID,
  );
}

describe("[unit] pages/settings/users/members — invite availability", () => {
  const cleanups: Array<() => void> = [];

  before(() => {
    ImplementInterface(permissionsInterface, permissionsImpl);
    ImplementInterface(permissionsResolverInterface, permissionsResolverImpl);
    ImplementInterface(tenantAccessInterface, tenantAccessImpl);
    ImplementInterface(pageInterfaceInternal, pageImplInternal);
  });

  afterEach(() => {
    cleanups.splice(0).forEach((cleanup) => cleanup());
  });

  it("serves the invite button enabled while no module refuses", async () => {
    const button = await inviteButtonFor(OPEN_TENANT);

    expect(button).to.exist;
    expect(button?.disabled).to.equal(undefined);
    expect(button).to.not.have.property("availability");
  });

  it("disables the invite button with the reason a module gives", async () => {
    cleanups.push(
      RegisterInviteAvailability(({ tenantId }) =>
        tenantId === FULL_TENANT ? { reason: SEAT_LIMIT_REASON } : undefined,
      ),
    );

    expect(await inviteButtonFor(FULL_TENANT)).to.deep.include({
      disabled: true,
      disabledReason: SEAT_LIMIT_REASON,
    });
    expect((await inviteButtonFor(OPEN_TENANT))?.disabled).to.equal(undefined);
  });

  it("leaves the invite button enabled when a resolver throws", async () => {
    cleanups.push(
      RegisterInviteAvailability(() => {
        throw new Error("resolver failure");
      }),
    );

    expect((await inviteButtonFor(FULL_TENANT))?.disabled).to.equal(undefined);
  });
});

describe("[unit] pages/settings/users/member-invite-form — invitation language", () => {
  it("defaults to the inviter's own language", () => {
    expect(resolveInviteLanguage("fr")).to.equal("fr");
    expect(resolveInviteLanguage("fr-FR")).to.equal("fr");
  });

  it("falls back to English for a language invitations are not offered in", () => {
    expect(resolveInviteLanguage("de")).to.equal("en");
    expect(resolveInviteLanguage(undefined)).to.equal("en");
  });
});
