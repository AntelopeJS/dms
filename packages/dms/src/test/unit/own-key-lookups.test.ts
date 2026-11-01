import { expect } from "chai";
import { SaveComponentFiles } from "../../attachments/save";
import { ensureContainer } from "../../implementations/dms/page/registry";
import type { SiteLayoutTree } from "../../implementations/dms/page/types";
import { GetPermission } from "../../implementations/dms/permissions";
import { toActivityFeedItems } from "../../pages/account";
import { findPermissionNode } from "../../pages/permissions";
import { untouchedRequestContext } from "../helpers/request-context";
import { getDeliverer, getExporter, ownValue } from "../../utils";

const OBJECT_PROTOTYPE_KEYS = ["constructor", "toString", "hasOwnProperty"];

describe("[unit] lookups answer own keys only", () => {
  for (const key of OBJECT_PROTOTYPE_KEYS) {
    it(`ownValue reads ${key} as absent unless the table holds it`, () => {
      expect(ownValue({ a: 1 }, key)).to.equal(undefined);
      expect(ownValue({ [key]: 2 }, key)).to.equal(2);
    });

    it(`GetPermission finds no permission named ${key}`, () => {
      expect(GetPermission(key)).to.equal(undefined);
    });

    it(`getExporter refuses the format ${key}`, () => {
      expect(() => getExporter(key)).to.throw();
    });

    it(`getDeliverer refuses the delivery ${key}`, () => {
      expect(() => getDeliverer(key)).to.throw();
    });

    it(`findPermissionNode finds no node under ${key}`, () => {
      const tree = { sales: { children: {} } };
      expect(findPermissionNode(tree, key)).to.equal(undefined);
      expect(findPermissionNode(tree, `sales.${key}`)).to.equal(undefined);
    });
  }

  it("ensureContainer creates the container of a segment named like an Object.prototype key", () => {
    const level: Record<string, SiteLayoutTree> = {};
    const container = ensureContainer(level, "constructor");
    expect(container.displayName).to.equal("none");
    expect(Object.hasOwn(level, "constructor")).to.equal(true);
    expect(ensureContainer(level, "constructor")).to.equal(container);
  });

  it("the activity feed keeps the event's icon when the device type is an Object.prototype key", () => {
    const [item] = toActivityFeedItems(
      [
        {
          id: "s1",
          type: "session_started",
          date: new Date("2026-09-30T10:00:00.000Z"),
          deviceType: "constructor",
          current: false,
        },
      ],
      {},
    );
    expect(item?.icon).to.be.a("string");
  });

  it("a file field named like an Object.prototype key is not added to a document that lacks it", async () => {
    let holdsToString = true;
    await SaveComponentFiles(
      {
        context: untouchedRequestContext(),
        componentIds: [],
        fields: [{ id: "f", key: "toString", kind: "file" }],
        submitted: {},
        before: {},
      },
      async (document) => {
        holdsToString = Object.hasOwn(document, "toString");
        return { document, result: undefined };
      },
    );
    expect(holdsToString).to.equal(false);
  });
});
