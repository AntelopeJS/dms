import { describe, expect, it } from "vitest";
import { nextTick, ref } from "vue";
import { useRevealedBackupCodes } from "../layers/dms-layout/app/build/composables/settings/security/useRevealedBackupCodes";

const ALICE = "user-alice";
const BOB = "user-bob";
const ALICE_CODES = ["11111111", "22222222"];

async function revealForAlice() {
  const userId = ref<string | undefined>(ALICE);
  const revealed = useRevealedBackupCodes(userId);
  revealed.reveal(ALICE_CODES, true);
  revealed.isOpen.value = true;
  await nextTick();
  return { userId, ...revealed };
}

describe("useRevealedBackupCodes", () => {
  it("shows a freshly issued set to the account it was issued for", async () => {
    const { codes, isRegenerated } = await revealForAlice();
    expect(codes.value).toEqual(ALICE_CODES);
    expect(isRegenerated.value).toBe(true);
  });

  // Switching accounts in the same tab does not reload the page: the next
  // account could open the dialog and read, or "save", the previous codes.
  it("never shows them to another account of the same tab", async () => {
    const { userId, codes, isOpen } = await revealForAlice();
    userId.value = BOB;
    expect(codes.value).toEqual([]);
    await nextTick();
    expect(isOpen.value).toBe(false);
    userId.value = ALICE;
    expect(codes.value).toEqual([]);
  });

  it("forgets them on sign-out", async () => {
    const { userId, codes } = await revealForAlice();
    userId.value = undefined;
    await nextTick();
    userId.value = ALICE;
    expect(codes.value).toEqual([]);
  });

  it("forgets them once their dialog closes", async () => {
    const { codes, isOpen, isRegenerated } = await revealForAlice();
    isOpen.value = false;
    await nextTick();
    expect(codes.value).toEqual([]);
    expect(isRegenerated.value).toBe(false);
  });

  it("keeps nothing without a signed-in account", () => {
    const { codes, reveal } = useRevealedBackupCodes(ref(undefined));
    reveal(ALICE_CODES);
    expect(codes.value).toEqual([]);
  });
});
