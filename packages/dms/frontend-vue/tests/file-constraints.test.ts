import { describe, expect, it } from "vitest";
import {
  checkFileConstraints,
  type FileFieldConstraints,
  matchMimetype,
} from "../layers/dms-ui/app/utils/fileConstraints";

function fakeFile(type: string, size: number): File {
  return { type, size, name: "sample" } as File;
}

describe("matchMimetype", () => {
  it("matches an exact mimetype", () => {
    expect(matchMimetype("image/png", "image/png")).to.equal(true);
  });

  it("matches a trailing wildcard pattern", () => {
    expect(matchMimetype("image/png", "image/*")).to.equal(true);
  });

  it("rejects a mimetype outside a wildcard pattern", () => {
    expect(matchMimetype("application/pdf", "image/*")).to.equal(false);
  });

  it("rejects a different exact mimetype", () => {
    expect(matchMimetype("image/png", "image/jpeg")).to.equal(false);
  });
});

describe("checkFileConstraints", () => {
  it("accepts any file when no constraints are configured", () => {
    expect(
      checkFileConstraints(fakeFile("application/x-foo", 10_000)),
    ).to.equal(null);
  });

  it("accepts a file within size and mimetype constraints", () => {
    const constraints: FileFieldConstraints = {
      maxSize: 1024,
      allowedMimetypes: ["image/*"],
    };
    expect(
      checkFileConstraints(fakeFile("image/png", 512), constraints),
    ).to.equal(null);
  });

  it("reports a size violation before a mimetype violation", () => {
    const constraints: FileFieldConstraints = {
      maxSize: 1024,
      allowedMimetypes: ["image/*"],
    };
    expect(
      checkFileConstraints(fakeFile("application/pdf", 4096), constraints),
    ).to.equal("size");
  });

  it("reports a mimetype violation", () => {
    const constraints: FileFieldConstraints = {
      allowedMimetypes: ["image/png", "image/jpeg"],
    };
    expect(
      checkFileConstraints(fakeFile("application/pdf", 512), constraints),
    ).to.equal("mimetype");
  });

  it("accepts everything when allowedMimetypes is empty", () => {
    const constraints: FileFieldConstraints = { allowedMimetypes: [] };
    expect(
      checkFileConstraints(fakeFile("application/pdf", 512), constraints),
    ).to.equal(null);
  });
});
