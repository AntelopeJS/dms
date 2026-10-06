import { GetModel } from "@antelopejs/interface-database-decorators";
import { expect } from "chai";
import { SignInAttemptsModel } from "../../db/models/signInAttempts.model";
import { UserKnownDevicesModel } from "../../db/models/userKnownDevices.model";
import { resetDatabase } from "../helpers/db";

// The two CORE tables behind sign-in monitoring, on the real database: the
// row id of a known device and of an alert claim derives from what it records,
// so instances racing on the same one meet on the primary key, and the
// adapter's conflict reaches the model as a lost race, never as an error.

const USER_ID = "sign-in-records-user";
const FINGERPRINT = "browser-on-system";
const RACERS = 4;
const HOUR_MS = 3_600_000;

describe("[integration] sign-in records", () => {
  beforeEach(resetDatabase);

  it("stores a device remembered by several instances at once once", async () => {
    const devices = GetModel(UserKnownDevicesModel);
    const now = new Date();
    await Promise.all(
      Array.from({ length: RACERS }, () =>
        devices.remember(USER_ID, FINGERPRINT, now),
      ),
    );
    await devices.remember(USER_ID, FINGERPRINT, new Date());
    expect(await devices.listFingerprints(USER_ID)).to.deep.equal([
      FINGERPRINT,
    ]);
  });

  it("lets one instance alone claim the alert of a burst", async () => {
    const attempts = GetModel(SignInAttemptsModel);
    const now = new Date();
    const claims = await Promise.all(
      Array.from({ length: RACERS }, () =>
        attempts.claimAlert(USER_ID, "burst-1", now),
      ),
    );
    expect(claims.filter(Boolean)).to.have.length(1);
    expect(await attempts.claimAlert(USER_ID, "burst-2", now)).to.equal(true);
  });

  it("reads back the failures recorded in the window", async () => {
    const attempts = GetModel(SignInAttemptsModel);
    const now = new Date();
    await attempts.recordFailure(USER_ID, now);
    await attempts.recordFailure(USER_ID, now);
    const since = new Date(now.getTime() - HOUR_MS);
    expect(await attempts.listBurst(USER_ID, since, RACERS)).to.have.length(2);
    await attempts.clearFailures(USER_ID);
    expect(await attempts.listBurst(USER_ID, since, RACERS)).to.deep.equal([]);
  });
});
