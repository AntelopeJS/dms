import { expect } from "chai";
import { TenantMemberModel } from "@antelopejs/interface-dms/db";
import { notifyRolePermissionsChanged } from "../../../utils/workspace-notifications";

const DATABASE_DOWN = "connection reset by peer";

describe("[unit] utils/workspace-notifications", () => {
  describe("notifyRolePermissionsChanged", () => {
    const listOwners = Object.getOwnPropertyDescriptor(
      TenantMemberModel.prototype,
      "listOwners",
    );

    afterEach(() => {
      if (!listOwners) return;
      Object.defineProperty(
        TenantMemberModel.prototype,
        "listOwners",
        listOwners,
      );
    });

    // The roles editor fires it after answering: a rejection would be
    // unhandled, and the runtime exits the process on one.
    it("settles without rejecting when the database fails", async () => {
      let ownersRequested = false;
      TenantMemberModel.prototype.listOwners = () => {
        ownersRequested = true;
        return Promise.reject(new Error(DATABASE_DOWN));
      };

      const outcome = await notifyRolePermissionsChanged({
        tenantId: "role-notification-workspace",
        roleId: "role",
        roleName: "Support",
        actor: { id: "actor", name: "Actor" },
      }).then(
        () => "resolved",
        (error: unknown) => `rejected: ${String(error)}`,
      );

      expect(ownersRequested).to.equal(true);
      expect(outcome).to.equal("resolved");
    });
  });
});
