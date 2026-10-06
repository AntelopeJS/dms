import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HTTPResult } from "@antelopejs/interface-api";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { SessionModel, UserModel } from "@antelopejs/interface-dms/auth/db";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import { ExportJobModel } from "@antelopejs/interface-dms/db";
import { FileExists } from "@antelopejs/interface-file-storage";
import { expect } from "chai";
import { SignInAttemptsModel } from "../../db/models/signInAttempts.model";
import { UserKnownDevicesModel } from "../../db/models/userKnownDevices.model";
import { deleteAccount } from "../../pages/settings/users/account-data-store";
import { uploadExportToStorage } from "../../utils/export-jobs";
import { authorizedClient, loginUser, registerUser } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";

// An account deletion takes the exports the user started with it, their files
// included, and checks what stands in its way itself, whatever its caller did.

const HTTP_OK = 200;
const HTTP_CONFLICT = 409;
const EXPORT_EXTENSION = "csv";
const EXPORT_CONTENT_TYPE = "text/csv";

async function storedExport(userId: string, jobId: string): Promise<string> {
  const localPath = join(tmpdir(), `${jobId}.${EXPORT_EXTENSION}`);
  await writeFile(localPath, "a,b\n1,2\n");
  const resourceKey = await uploadExportToStorage(
    localPath,
    DEFAULT_TENANT_ID,
    jobId,
    EXPORT_EXTENSION,
    EXPORT_CONTENT_TYPE,
  );
  const exports = GetModel(ExportJobModel, DEFAULT_TENANT_ID);
  await exports.createNewJob({
    jobId,
    userId,
    scope: "account-deletion-test",
    context: null,
    filename: "rows",
    extension: EXPORT_EXTENSION,
    contentType: EXPORT_CONTENT_TYPE,
    delivery: "download",
    retainUntilExpiry: true,
  });
  await exports.markAsCompleted(jobId, resourceKey);
  return resourceKey;
}

describe("[integration] account deletion", () => {
  beforeEach(resetDatabase);

  it("deletes the exports the user started, and their files", async () => {
    await registerUser({ owner: true });
    const member = await registerUser();
    const jobId = `deleted-${Date.now()}`;
    const resourceKey = await storedExport(member.userId, jobId);
    expect(await FileExists(resourceKey)).to.equal(true);

    const response = await authorizedClient(member.accessToken).post(
      "/settings/user/profile/account-deletion",
      { password: member.password, confirmation: member.email },
    );
    expect(response.status, JSON.stringify(response.data)).to.equal(HTTP_OK);

    const exports = GetModel(ExportJobModel, DEFAULT_TENANT_ID);
    expect(await exports.get(jobId)).to.equal(undefined);
    expect(await FileExists(resourceKey)).to.equal(false);
  });

  it("removes the devices, sign-in attempts and sessions of the user", async () => {
    await registerUser({ owner: true });
    const member = await registerUser();
    const { accessToken } = await loginUser(member.email, member.password);
    const devices = GetModel(UserKnownDevicesModel);
    const attempts = GetModel(SignInAttemptsModel);
    await attempts.recordFailure(member.userId, new Date());
    await attempts.claimAlert(member.userId, "burst", new Date());
    const epoch = new Date(0);
    expect(await devices.listFingerprints(member.userId)).to.not.be.empty;
    expect(await attempts.listBurst(member.userId, epoch, 10)).to.have.length(
      2,
    );
    expect(await GetModel(SessionModel).getByUserId(member.userId)).to.not.be
      .empty;

    const response = await authorizedClient(accessToken).post(
      "/settings/user/profile/account-deletion",
      { password: member.password, confirmation: member.email },
    );
    expect(response.status, JSON.stringify(response.data)).to.equal(HTTP_OK);

    expect(await devices.listFingerprints(member.userId)).to.deep.equal([]);
    expect(await attempts.listBurst(member.userId, epoch, 10)).to.deep.equal(
      [],
    );
    expect(
      await GetModel(SessionModel).getByUserId(member.userId),
    ).to.deep.equal([]);
  });

  it("refuses the last owner however it is reached", async () => {
    const owner = await registerUser({ owner: true });
    const user = await GetModel(UserModel).get(owner.userId);
    const refusal = await deleteAccount(user!).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(refusal).to.be.instanceOf(HTTPResult);
    expect((refusal as HTTPResult).getStatus()).to.equal(HTTP_CONFLICT);
    expect(await GetModel(UserModel).get(owner.userId)).to.not.equal(undefined);
  });
});
