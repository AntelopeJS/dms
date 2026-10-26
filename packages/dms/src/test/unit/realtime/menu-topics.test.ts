import { expect } from "chai";
import {
  buildMemberMenuTopic,
  buildMenuTopic,
  MENU_BROADCAST_TOPIC,
} from "../../../realtime";
import { menuTopicsFor } from "../../../routes";

describe("[unit] realtime menu topics", () => {
  it("subscribes a session to its workspace and to its member's own topic", () => {
    expect(menuTopicsFor("tenant-1", "user-1")).to.deep.equal([
      MENU_BROADCAST_TOPIC,
      buildMenuTopic("tenant-1"),
      buildMemberMenuTopic("tenant-1", "user-1"),
    ]);
  });

  it("keeps a member's topic apart from another member's and another workspace's", () => {
    const topic = buildMemberMenuTopic("tenant-1", "user-1");
    expect(topic).to.not.equal(buildMemberMenuTopic("tenant-1", "user-2"));
    expect(topic).to.not.equal(buildMemberMenuTopic("tenant-2", "user-1"));
    expect(topic.startsWith(buildMenuTopic("tenant-1"))).to.equal(false);
  });

  it("leaves a session without a workspace on the broadcast topic alone", () => {
    expect(menuTopicsFor(undefined, "user-1")).to.deep.equal([
      MENU_BROADCAST_TOPIC,
    ]);
  });
});
