import { GetModel } from "@antelopejs/interface-database-decorators";
import { type User, UserModel } from "@antelopejs/interface-dms/auth/db";
import { expect } from "chai";
import {
  internal,
  validateTenantAssignmentToken,
  validateTwoFactorToken,
} from "../../implementations/dms-auth";
import { validateSessionHandoffToken } from "../../implementations/dms-auth/services";
import {
  forge,
  HTTP_UNAUTHORIZED,
  insertTokenUser,
  refusalOf,
  sessionLookupsDuring,
  signFor,
  UNKNOWN_USER_ID,
} from "../helpers/forged-tokens";

describe("[unit] auth tokens naming an unknown user", () => {
  let user: User;

  before(async () => {
    user = await insertTokenUser();
  });

  after(async () => {
    if (user) await GetModel(UserModel).delete(user._id);
  });

  it("answers a forged two-factor, tenant-assignment or handoff token the same whether its id names a user or not", async () => {
    const validators: {
      purpose: string;
      validate: (token: string) => Promise<{ user: User }>;
    }[] = [
      { purpose: "2fa", validate: validateTwoFactorToken },
      { purpose: "tenant-assignment", validate: validateTenantAssignmentToken },
      { purpose: "session-handoff", validate: validateSessionHandoffToken },
    ];
    for (const { purpose, validate } of validators) {
      const [known, unknown] = await Promise.all(
        [user._id, UNKNOWN_USER_ID].map((id) =>
          refusalOf(() =>
            validate(forge({ id, purpose, sessionId: "forged-session" })),
          ),
        ),
      );
      expect(known.status, purpose).to.equal(HTTP_UNAUTHORIZED);
      expect(known, purpose).to.deep.equal(unknown);
    }
  });

  it("reads no session before the access token's signature checks out", async () => {
    const lookups = await sessionLookupsDuring(async () => {
      await refusalOf(async () =>
        internal.AuthUserValidator(
          internal.AuthUserAuthenticator(
            forge({ id: user._id, sessionId: "forged", purpose: "access" }),
          ),
        ),
      );
      await refusalOf(async () =>
        internal.AuthUserValidator(
          internal.AuthUserAuthenticator(
            signFor(user, { sessionId: "signed", purpose: "access" }),
          ),
        ),
      );
    });
    expect(lookups).to.deep.equal(["signed"]);
  });
});
