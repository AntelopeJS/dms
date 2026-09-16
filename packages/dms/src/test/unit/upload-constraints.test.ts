import { expect } from "chai";
import {
  buildUploadConstraints,
  isUploadValidationError,
} from "../../utils/upload-constraints";

describe("[unit] upload-constraints", () => {
  describe("buildUploadConstraints", () => {
    it("caps size and restricts mimetypes when both are configured", () => {
      const constraints = buildUploadConstraints({
        maxSize: 1024,
        allowedMimetypes: ["image/png"],
      });
      expect(constraints.maxSize).to.equal(1024);
      expect(constraints.allowedMimetypes).to.deep.equal(["image/png"]);
    });

    it("omits maxSize when it is 0 (unlimited opt-out)", () => {
      const constraints = buildUploadConstraints({
        maxSize: 0,
        allowedMimetypes: [],
      });
      expect(constraints.maxSize).to.equal(undefined);
    });

    it("omits allowedMimetypes when the list is empty", () => {
      const constraints = buildUploadConstraints({
        maxSize: 1024,
        allowedMimetypes: [],
      });
      expect(constraints.allowedMimetypes).to.equal(undefined);
    });
  });

  describe("isUploadValidationError", () => {
    it("matches an error by its name across module copies", () => {
      const error = new Error("too big");
      error.name = "UploadValidationError";
      expect(isUploadValidationError(error)).to.equal(true);
    });

    it("rejects unrelated errors and non-errors", () => {
      expect(isUploadValidationError(new Error("nope"))).to.equal(false);
      expect(isUploadValidationError("not an error")).to.equal(false);
      expect(isUploadValidationError(undefined)).to.equal(false);
    });
  });
});
