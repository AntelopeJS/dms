import { expect } from "chai";
import {
  backupCodeUsedTone,
  LOW_BACKUP_CODES,
  rolesChangedTone,
} from "../../../utils/notification-tones";

describe("[unit] utils/notification-tones", () => {
  it("turns a backup code alert into an error once codes run low", () => {
    expect(backupCodeUsedTone(LOW_BACKUP_CODES + 1)).to.equal("warning");
    expect(backupCodeUsedTone(LOW_BACKUP_CODES)).to.equal("error");
    expect(backupCodeUsedTone(1)).to.equal("error");
    expect(backupCodeUsedTone(0)).to.equal("error");
  });

  it("warns a member left without any role", () => {
    expect(rolesChangedTone(0)).to.equal("warning");
    expect(rolesChangedTone(1)).to.equal("neutral");
    expect(rolesChangedTone(3)).to.equal("neutral");
  });
});
