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
  reuseKeyOf,
  sessionLookupsDuring,
  signFor,
  UNKNOWN_USER_ID,
  userReadsDuring,
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
      const knownToken = forgedFor(user._id, purpose);
      const unknownToken = forgedFor(UNKNOWN_USER_ID, purpose);
      const known = await hmacsDuring(async () => {
        await refusalOf(() => check(knownToken));
      });
      const unknown = await hmacsDuring(async () => {
        await refusalOf(() => check(unknownToken));
      });
      expect(known, purpose).to.be.above(0);
      expect(unknown, purpose).to.equal(known);
    }
  });

  it("reads no user before refusing a forged token of every kind", async () => {
    for (const { purpose, check } of TOKEN_CHECKS) {
      const reads = await userReadsDuring(async () => {
        await refusalOf(() => check(forgedFor(user._id, purpose)));
        await refusalOf(() => check(forgedFor(UNKNOWN_USER_ID, purpose)));
      });
      expect(reads, purpose).to.deep.equal([]);
    }
  });

  it("reads the user a token of every kind names once its signature checks out", async () => {
    for (const { purpose, check } of TOKEN_CHECKS) {
      const token = signFor(user, { purpose, sessionId: "signed" });
      const reads = await userReadsDuring(async () => {
        await check(token).catch(() => undefined);
      });
      expect(reads, purpose).to.include(user._id);
    }
  });

  it("refuses a token signed with the instance key that reuses another token's key claim", async () => {
    const captured = signFor(user, {
      purpose: "access",
      sessionId: "captured",
    });
    const replayed = reuseKeyOf(captured, { id: user._id, purpose: "access" });
    const refusal = await refusalOf(() =>
      internal.AuthRawUserValidator(internal.AuthUserAuthenticator(replayed)),
    );
    expect(refusal.status).to.equal(HTTP_UNAUTHORIZED);
  });

  it("refuses a refresh token signed for a user deleted since", async () => {
    const gone = await insertTokenUser();
    const token = signFor(gone, { sessionId: "signed", purpose: "refresh" });
    await GetModel(UserModel).delete(gone._id);
    const refusal = await refusalOf(() => validateRefreshToken(token));
    expect(refusal.status).to.equal(HTTP_UNAUTHORIZED);
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
