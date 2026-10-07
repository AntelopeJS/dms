import { expect } from "chai";
import type {
  NotificationCategoryInfo,
  TogglePermission,
} from "@antelopejs/interface-dms/notifications/types";
import { isSubjectLocked } from "../../../implementations/dms-notifications/registry";

function subject(
  own: TogglePermission | undefined,
  parent: TogglePermission | undefined,
) {
  const category: NotificationCategoryInfo = {
    id: "lock-test",
    labelKey: "lock-test",
    icon: "i-ph-bell",
    togglePermission: parent,
  };
  return {
    id: "lock-test-subject",
    category,
    labelKey: "lock-test-subject",
    togglePermission: own,
  };
}

describe("[unit] notifications — subject lock rule", () => {
  it("locks a forbidden subject under a default or forbidden category", () => {
    expect(isSubjectLocked(subject("forbidden", "default"))).to.equal(true);
    expect(isSubjectLocked(subject("forbidden", "forbidden"))).to.equal(true);
  });

  it("leaves every other combination toggleable", () => {
    expect(isSubjectLocked(subject("forbidden", "allowed"))).to.equal(false);
    expect(isSubjectLocked(subject("forbidden", undefined))).to.equal(false);
    expect(isSubjectLocked(subject("default", "forbidden"))).to.equal(false);
    expect(isSubjectLocked(subject(undefined, "default"))).to.equal(false);
  });
});
