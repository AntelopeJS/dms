import { ImplementInterface } from "@antelopejs/interface-core";
import { expect } from "chai";
import * as permissionsImpl from "../../../../implementations/dms/permissions";
import {
  permissionIdAncestors,
  withPermissionAncestors,
} from "@antelopejs/interface-dms/internal/permission-ids";
import * as permissionsInterface from "@antelopejs/interface-dms/permissions";
import { HasPermission } from "@antelopejs/interface-dms/permissions";

const CATEGORY = "hpa-library";
const PAGE = `${CATEGORY}.archive`;
const TABLE = `${PAGE}.table`;
const DELETE = `${TABLE}.delete`;
const SELECT = `${TABLE}.select`;
const MEMBER_PAGE = "hpa-account.profile";
const MEMBER_CATEGORY = "hpa-account";
const CUSTOM_ID_PAGE = "hpa-mailing.access";
const FULL_CHAIN = [CATEGORY, PAGE, TABLE, DELETE];
const VIEW = `${TABLE}.view`;
const EDIT = `${TABLE}.edit`;
const CYCLE_A = `${TABLE}.cycle-a`;
const CYCLE_B = `${TABLE}.cycle-b`;
const ORPHAN_DEPENDENT = `${TABLE}.orphan-dependent`;
const TABLE_CHAIN = [CATEGORY, PAGE, TABLE];

const REGISTERED = [
  { id: CATEGORY, title: "Library" },
  { id: PAGE, title: "Archive" },
  { id: TABLE, title: "Table" },
  { id: DELETE, title: "Delete" },
  { id: SELECT, title: "Select", defaultGranted: true },
  { id: MEMBER_CATEGORY, title: "Account", defaultGranted: true },
  { id: MEMBER_PAGE, title: "Profile" },
  { id: CUSTOM_ID_PAGE, title: "Mailing" },
  { id: VIEW, title: "View" },
  { id: EDIT, title: "Edit", dependencies: [VIEW] },
  { id: CYCLE_A, title: "Cycle A", dependencies: [CYCLE_B] },
  { id: CYCLE_B, title: "Cycle B", dependencies: [CYCLE_A] },
  { id: ORPHAN_DEPENDENT, title: "Orphan", dependencies: ["hpa-gone.view"] },
];

describe("[unit] interfaces/dms/permissions — HasPermission requires the ancestors", () => {
  before(() => {
    ImplementInterface(permissionsInterface, permissionsImpl);
    for (const permission of REGISTERED) {
      permissionsInterface.RegisterPermission(permission.id, permission);
    }
  });

  after(() => {
    for (const { id } of REGISTERED) {
      permissionsInterface.UnregisterPermission(id);
    }
  });

  it("refuses an action granted without its table and page", async () => {
    expect(await HasPermission(new Set([DELETE]), DELETE)).to.equal(false);
  });

  it("refuses an action when one ancestor is missing", async () => {
    const withoutPage = FULL_CHAIN.filter((id) => id !== PAGE);
    expect(await HasPermission(new Set(withoutPage), DELETE)).to.equal(false);
  });

  it("grants an action held with every ancestor", async () => {
    expect(await HasPermission(new Set(FULL_CHAIN), DELETE)).to.equal(true);
  });

  it("refuses a page granted without its category", async () => {
    expect(await HasPermission(new Set([PAGE]), PAGE)).to.equal(false);
  });

  it("counts a defaultGranted ancestor as held", async () => {
    expect(await HasPermission(new Set([MEMBER_PAGE]), MEMBER_PAGE)).to.equal(
      true,
    );
  });

  it("counts an unregistered ancestor as held", async () => {
    expect(
      await HasPermission(new Set([CUSTOM_ID_PAGE]), CUSTOM_ID_PAGE),
    ).to.equal(true);
  });

  it("keeps granting a defaultGranted permission on its own", async () => {
    expect(await HasPermission(new Set(), SELECT)).to.equal(true);
  });

  it("keeps granting everything to the owner wildcard", async () => {
    expect(await HasPermission(new Set(["*"]), DELETE)).to.equal(true);
  });
});

describe("[unit] interfaces/dms/permissions — HasPermission requires the dependencies", () => {
  before(() => {
    ImplementInterface(permissionsInterface, permissionsImpl);
    for (const permission of REGISTERED) {
      permissionsInterface.RegisterPermission(permission.id, permission);
    }
  });

  after(() => {
    for (const { id } of REGISTERED) {
      permissionsInterface.UnregisterPermission(id);
    }
  });

  it("refuses an edit stored without the view that loads its row", async () => {
    expect(await HasPermission(new Set([...TABLE_CHAIN, EDIT]), EDIT)).to.equal(
      false,
    );
  });

  it("grants an edit held with its view", async () => {
    expect(
      await HasPermission(new Set([...TABLE_CHAIN, EDIT, VIEW]), EDIT),
    ).to.equal(true);
  });

  it("ends on a dependency cycle", async () => {
    expect(
      await HasPermission(new Set([...TABLE_CHAIN, CYCLE_A, CYCLE_B]), CYCLE_A),
    ).to.equal(true);
  });

  it("counts an unregistered dependency as held", async () => {
    expect(
      await HasPermission(
        new Set([...TABLE_CHAIN, ORPHAN_DEPENDENT]),
        ORPHAN_DEPENDENT,
      ),
    ).to.equal(true);
  });
});

describe("[unit] interfaces/dms/internal/permission-ids", () => {
  it("lists the ids a permission sits under, closest first", () => {
    expect(permissionIdAncestors("a.b.c")).to.deep.equal(["a.b", "a"]);
    expect(permissionIdAncestors("a")).to.deep.equal([]);
  });

  it("completes a permission set with its ancestors, once each", () => {
    expect(withPermissionAncestors(["a.b.c", "a.d", "a"])).to.deep.equal([
      "a.b.c",
      "a.b",
      "a",
      "a.d",
    ]);
  });
});
