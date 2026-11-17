import { expect } from "chai";
import {
  attachmentId,
  attachmentTable,
  readAttachment,
} from "../../../attachments";
import { httpRejectionOf } from "../../helpers/http-rejection";
import { untouchedRequestContext } from "../../helpers/request-context";

const HTTP_FORBIDDEN = 403;
const KEY = "stored-claims/report.pdf";

/** Stores the attachment row of `KEY` with `claimsJson` as its claims. */
const storeRow = async (claimsJson: string): Promise<void> => {
  await attachmentTable()
    .insert({
      _id: attachmentId(KEY),
      tenantId: "stored-claims-tenant",
      storage: "",
      resourceKey: KEY,
      claimsJson,
    })
    .run();
};

describe("[unit] attachments — a read of a row whose stored claims are not upload claims", () => {
  afterEach(async () => {
    await attachmentTable().get(attachmentId(KEY)).delete().run();
  });

  it("refuses a row whose stored claims are null with 403", async () => {
    await storeRow("null");

    const refusal = await httpRejectionOf(
      readAttachment(untouchedRequestContext(), KEY),
    );

    expect(refusal.getStatus()).to.equal(HTTP_FORBIDDEN);
  });
});
