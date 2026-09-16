import { SignUploadToken } from "@antelopejs/interface-dms/uploads";
import { expect } from "chai";
import { verifyUploadToken } from "../../../utils/upload-token";

describe("[integration] SignUploadToken interface wiring", () => {
  it("routes to the DMS implementation and signs a verifiable token", async function () {
    this.timeout(5000);

    const token = await SignUploadToken({ storage: "s3-main", path: "docs/" });

    expect(verifyUploadToken(token)).to.deep.equal({
      storage: "s3-main",
      path: "docs/",
    });
  });
});
