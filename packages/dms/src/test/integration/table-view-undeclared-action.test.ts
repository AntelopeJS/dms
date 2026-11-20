import type { AxiosInstance } from "axios";
import { expect } from "chai";
import { authorizedClient, registerUser } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";

const ROLES_TABLE = "/api/tables/roles";
const HTTP_FORBIDDEN = 403;

describe("[integration] a table route whose action no table view declares", () => {
  let member: AxiosInstance;

  before(async () => {
    await resetDatabase();
    member = authorizedClient((await registerUser()).accessToken);
  });

  for (const route of ["archive", "restore"]) {
    it(`refuses the roles table's undeclared ${route} route to a member`, async () => {
      const refused = await member.put(`${ROLES_TABLE}/${route}?ids=any`);

      expect(refused.status, JSON.stringify(refused.data)).to.equal(
        HTTP_FORBIDDEN,
      );
      expect(refused.data).to.equal(
        `Forbidden: action "${route}" declares no permission`,
      );
    });
  }
});
