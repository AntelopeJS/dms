import { expect } from "chai";
import {
  CreateDataType,
  getDataTypeId,
} from "@antelopejs/interface-dms/base/data-types";
import { StatusType } from "@antelopejs/interface-dms/base/data-types/status-type";

const STATUS_TYPE_ID = "status";

const CUSTOM_OPTIONS = {
  onlineLabel: "Connected",
  offlineLabel: "Disconnected",
  onlineColor: "success",
  offlineColor: "error",
};

describe("[unit] interfaces/dms-base/data-types/status-type", () => {
  describe("registration", () => {
    it("registers StatusType under the 'status' id", () => {
      const instance = new StatusType();
      expect(getDataTypeId(instance)).to.equal(STATUS_TYPE_ID);
    });

    it("creates a StatusType via CreateDataType", () => {
      const instance = CreateDataType(STATUS_TYPE_ID);
      expect(instance).to.be.instanceOf(StatusType);
    });
  });

  describe("validation", () => {
    it("accepts a true boolean", () => {
      const type = new StatusType();
      expect(type.getValidation().safeParse(true).success).to.equal(true);
    });

    it("accepts a false boolean", () => {
      const type = new StatusType();
      expect(type.getValidation().safeParse(false).success).to.equal(true);
    });

    it("rejects a string value", () => {
      const type = new StatusType();
      expect(type.getValidation().safeParse("online").success).to.equal(false);
    });

    it("rejects a number value", () => {
      const type = new StatusType();
      expect(type.getValidation().safeParse(1).success).to.equal(false);
    });
  });

  describe("options", () => {
    it("retains default labels and colors when no options are provided", () => {
      const type = new StatusType();
      expect(type.options.onlineLabel).to.equal("$common.status.online");
      expect(type.options.offlineLabel).to.equal("$common.status.offline");
      expect(type.options.onlineColor).to.equal("primary");
      expect(type.options.offlineColor).to.equal("neutral");
    });

    it("retains custom labels and colors when provided", () => {
      const type = new StatusType(CUSTOM_OPTIONS);
      expect(type.options).to.deep.equal(CUSTOM_OPTIONS);
    });
  });
});
