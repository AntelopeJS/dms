import { expect } from "chai";
import {
  securityAttention,
  securityAttentionBadge,
  securityAttentionTones,
} from "../../../../pages/settings/users/security-attention";
import type { TwoFactorStatus } from "../../../../pages/settings/users/two-factor-operations";
import { LOW_BACKUP_CODES } from "../../../../utils/notification-tones";

const BACKUP_CODES_TOTAL = 10;
const GENERATED_AT = new Date("2026-10-01T10:00:00.000Z");

const SECURE: TwoFactorStatus = {
  methods: ["totp"],
  hasBackupCodes: true,
  backupCodesLeft: BACKUP_CODES_TOTAL,
  backupCodesTotal: BACKUP_CODES_TOTAL,
  backupCodesGeneratedAt: GENERATED_AT,
  backupCodesSavedAt: GENERATED_AT,
};

const status = (changes: Partial<TwoFactorStatus>): TwoFactorStatus => ({
  ...SECURE,
  ...changes,
});

describe("[unit] settings/security — attention and its navigation badge", () => {
  it("shows no badge when nothing needs attention", () => {
    expect(securityAttention(SECURE)).to.deep.equal([]);
    expect(securityAttentionBadge(SECURE)).to.deep.equal({ count: 0 });
  });

  it("warns while two-factor is off", () => {
    const off = status({ methods: [], hasBackupCodes: false });

    expect(securityAttention(off)).to.deep.equal(["two_factor_off"]);
    expect(securityAttentionBadge(off)).to.deep.equal({
      count: 1,
      tone: "warning",
    });
  });

  it("warns while the backup codes are not saved", () => {
    const unsaved = status({ backupCodesSavedAt: null });

    expect(securityAttention(unsaved)).to.deep.equal(["backup_codes_unsaved"]);
    expect(securityAttentionBadge(unsaved)).to.deep.equal({
      count: 1,
      tone: "warning",
    });
  });

  it("turns red when the backup codes run low", () => {
    const low = status({ backupCodesLeft: LOW_BACKUP_CODES });

    expect(securityAttentionBadge(low)).to.deep.equal({
      count: 1,
      tone: "error",
    });
  });

  it("counts every item, most important first, in the strongest tone", () => {
    const lowAndUnsaved = status({
      backupCodesLeft: LOW_BACKUP_CODES,
      backupCodesSavedAt: null,
    });

    expect(securityAttention(lowAndUnsaved)).to.deep.equal([
      "backup_codes_low",
      "backup_codes_unsaved",
    ]);
    expect(securityAttentionBadge(lowAndUnsaved)).to.deep.equal({
      count: 2,
      tone: "error",
    });
  });

  it("gives each attention item its own tone, for the blocks it concerns", () => {
    const lowAndUnsaved = status({
      backupCodesLeft: LOW_BACKUP_CODES,
      backupCodesSavedAt: null,
    });

    expect(securityAttentionTones(lowAndUnsaved)).to.deep.equal({
      backup_codes_low: "error",
      backup_codes_unsaved: "warning",
    });
    expect(securityAttentionTones(SECURE)).to.deep.equal({});
  });
});
