import { expect } from "chai";
import {
  metadataQuerySchema,
  presignBodySchema,
} from "../../../validation/file.schema";

const validPayload = {
  filename: "photo.jpg",
  size: 1024,
  mimetype: "image/jpeg",
  uploadToken: "signed.jwt.token",
};

describe("[unit] validation/file", () => {
  it("accepts a minimal valid payload", () => {
    const result = presignBodySchema.safeParse(validPayload);
    expect(result.success).to.equal(true);
  });

  it("rejects an empty filename", () => {
    const result = presignBodySchema.safeParse({
      ...validPayload,
      filename: "",
    });
    expect(result.success).to.equal(false);
  });

  it("rejects a filename longer than 255 characters", () => {
    const result = presignBodySchema.safeParse({
      ...validPayload,
      filename: "a".repeat(256),
    });
    expect(result.success).to.equal(false);
  });

  it("rejects a filename with a path separator", () => {
    const result = presignBodySchema.safeParse({
      ...validPayload,
      filename: "../../evil.png",
    });
    expect(result.success).to.equal(false);
  });

  it("accepts an empty mimetype (unknown browser type)", () => {
    const result = presignBodySchema.safeParse({
      ...validPayload,
      mimetype: "",
    });
    expect(result.success).to.equal(true);
  });

  it("rejects a non-number size", () => {
    const result = presignBodySchema.safeParse({
      ...validPayload,
      size: "big",
    });
    expect(result.success).to.equal(false);
  });

  it("rejects a negative size", () => {
    const result = presignBodySchema.safeParse({
      ...validPayload,
      size: -1,
    });
    expect(result.success).to.equal(false);
  });

  it("rejects a missing mimetype", () => {
    const { mimetype: _mimetype, ...withoutMimetype } = validPayload;
    const result = presignBodySchema.safeParse(withoutMimetype);
    expect(result.success).to.equal(false);
  });

  describe("upload token validation", () => {
    it("rejects a missing upload token", () => {
      const { uploadToken: _uploadToken, ...withoutToken } = validPayload;
      const result = presignBodySchema.safeParse(withoutToken);
      expect(result.success).to.equal(false);
    });

    it("rejects an empty upload token", () => {
      const result = presignBodySchema.safeParse({
        ...validPayload,
        uploadToken: "",
      });
      expect(result.success).to.equal(false);
    });

    it("rejects an upload token longer than the maximum length", () => {
      const result = presignBodySchema.safeParse({
        ...validPayload,
        uploadToken: "a".repeat(4097),
      });
      expect(result.success).to.equal(false);
    });
  });
});

describe("[unit] validation/file metadata query", () => {
  it("accepts a resource key", () => {
    const result = metadataQuerySchema.safeParse({
      resourceKey: "__staging__/2026/abc-123.png",
    });
    expect(result.success).to.equal(true);
  });

  it("accepts a resource key with an optional storage", () => {
    const result = metadataQuerySchema.safeParse({
      resourceKey: "abc-123.png",
      storage: "s3",
    });
    expect(result.success).to.equal(true);
  });

  it("rejects a missing resource key", () => {
    const result = metadataQuerySchema.safeParse({ storage: "s3" });
    expect(result.success).to.equal(false);
  });

  it("rejects an empty resource key", () => {
    const result = metadataQuerySchema.safeParse({ resourceKey: "" });
    expect(result.success).to.equal(false);
  });

  it("rejects a resource key with a traversal sequence", () => {
    const result = metadataQuerySchema.safeParse({
      resourceKey: "../../etc/passwd",
    });
    expect(result.success).to.equal(false);
  });

  it("rejects an absolute resource key", () => {
    const result = metadataQuerySchema.safeParse({
      resourceKey: "/etc/passwd",
    });
    expect(result.success).to.equal(false);
  });

  it("rejects a resource key with a backslash", () => {
    const result = metadataQuerySchema.safeParse({
      resourceKey: "uploads\\evil",
    });
    expect(result.success).to.equal(false);
  });

  it("accepts a well-formed storage name", () => {
    const result = metadataQuerySchema.safeParse({
      resourceKey: "abc-123.png",
      storage: "s3-main_01",
    });
    expect(result.success).to.equal(true);
  });

  it("rejects an invalid storage name", () => {
    const result = metadataQuerySchema.safeParse({
      resourceKey: "abc-123.png",
      storage: "s3/../secret",
    });
    expect(result.success).to.equal(false);
  });
});
