import { expect } from "chai";
import { sign } from "jsonwebtoken";
import { getAuthConfig } from "../../index";
import { signUploadToken, verifyUploadToken } from "../../utils/upload-token";

describe("[unit] upload-token", () => {
  describe("sign/verify round-trip", () => {
    it("recovers the storage and path claims", () => {
      const token = signUploadToken({ storage: "s3-main", path: "uploads/" });
      expect(verifyUploadToken(token)).to.deep.equal({
        storage: "s3-main",
        path: "uploads/",
      });
    });

    it("carries an undefined storage/path (the field's default destination)", () => {
      const token = signUploadToken({});
      expect(verifyUploadToken(token)).to.deep.equal({
        storage: undefined,
        path: undefined,
      });
    });
  });

  describe("verifyUploadToken rejects untrusted tokens", () => {
    it("returns null for a garbage token", () => {
      expect(verifyUploadToken("not-a-jwt")).to.equal(null);
    });

    it("returns null for a tampered token", () => {
      const token = signUploadToken({ storage: "s3-main" });
      expect(verifyUploadToken(`${token}tampered`)).to.equal(null);
    });

    it("returns null for a token signed for another purpose", () => {
      const foreign = sign(
        { storage: "s3-evil", purpose: "auth" },
        getAuthConfig().jwtSecret,
      );
      expect(verifyUploadToken(foreign)).to.equal(null);
    });

    it("returns null for a token signed with a different secret", () => {
      const foreign = sign(
        { storage: "s3-evil", purpose: "file-upload" },
        "a-different-secret",
      );
      expect(verifyUploadToken(foreign)).to.equal(null);
    });

    // Verification pins HS256: nothing else could verify against an HMAC
    // secret today, and the pin is what keeps an algorithm-confusion bug in
    // the JWT library from ever mattering here.
    it("returns null for a token signed with another algorithm", () => {
      const foreign = sign(
        { storage: "s3-evil", purpose: "file-upload" },
        getAuthConfig().jwtSecret,
        { algorithm: "HS512" },
      );
      expect(verifyUploadToken(foreign)).to.equal(null);
    });
  });
});
