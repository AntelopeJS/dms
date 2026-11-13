import { GetModel } from "@antelopejs/interface-database-decorators";
import { type User, UserModel } from "@antelopejs/interface-dms/auth/db";
import { expect } from "chai";
import {
  internal,
  validateRefreshToken,
  validateTenantAssignmentToken,
  validateTwoFactorToken,
} from "../../implementations/dms-auth";
import { validateSessionHandoffToken } from "../../implementations/dms-auth/services";
import {
  forge,
  HTTP_UNAUTHORIZED,
  hmacsDuring,
  insertTokenUser,
  refusalOf,
  sessionLookupsDuring,
  signFor,
  signForUnknownUser,
  UNKNOWN_USER_ID,
} from "../helpers/forged-tokens";

const TOKEN_CHECKS: {
  purpose: string;
  check: (token: string) => Promise<void>;
}[] = [
  {
    purpose: "access",
    check: async (token) => {
      await internal.AuthUserValidator(internal.AuthUserAuthenticator(token));
    },
  },
  {
    purpose: "refresh",
    check: async (token) => {
      await validateRefreshToken(token);
    },
  },
  {
    purpose: "2fa",
    check: async (token) => {
      await validateTwoFactorToken(token);
    },
  },
  {
    purpose: "tenant-assignment",
    check: async (token) => {
      await validateTenantAssignmentToken(token);
    },
  },
  {
    purpose: "session-handoff",
    check: async (token) => {
      await validateSessionHandoffToken(token);
    },
  },
];

describe("[unit] auth tokens naming an unknown user", () => {
  let user: User;

  before(async () => {
    user = await insertTokenUser();
  });

  after(async () => {
    if (user) await GetModel(UserModel).delete(user._id);
  });

  function forgedFor(id: string, purpose: string): string {
    return forge({ id, purpose, sessionId: "forged-session" });
  }

  it("answers a forged token of every kind the same whether its id names a user or not", async () => {
    for (const { purpose, check } of TOKEN_CHECKS) {
      const known = await refusalOf(() => check(forgedFor(user._id, purpose)));
      const unknown = await refusalOf(() =>
        check(forgedFor(UNKNOWN_USER_ID, purpose)),
      );
      expect(known.status, purpose).to.equal(HTTP_UNAUTHORIZED);
      expect(known, purpose).to.deep.equal(unknown);
    }
  });

  it("computes as many HMACs refusing a forged token whether its id names a user or not", async () => {
    for (const { purpose, check } of TOKEN_CHECKS) {
      const known = await hmacsDuring(async () => {
        await refusalOf(() => check(forgedFor(user._id, purpose)));
      });
      const unknown = await hmacsDuring(async () => {
        await refusalOf(() => check(forgedFor(UNKNOWN_USER_ID, purpose)));
      });
      expect(known, purpose).to.be.above(0);
      expect(unknown, purpose).to.equal(known);
    }
  });

  it("refuses a token of every kind signed with the key verified for an unknown id", async () => {
    for (const { purpose, check } of TOKEN_CHECKS) {
      const refusal = await refusalOf(() =>
        check(signForUnknownUser({ purpose, sessionId: "forged-session" })),
      );
      expect(refusal.status, purpose).to.equal(HTTP_UNAUTHORIZED);
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
