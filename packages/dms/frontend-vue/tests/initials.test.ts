/**
 * An avatar without a picture draws two characters for its name: the first of
 * its first two words, or the first two letters of a one-word name, so the
 * avatars of a list are even. Characters are whole graphemes.
 */
import { describe, expect, it } from "vitest";
import { labelInitials } from "../layers/dms-ui/app/entries/utils/initials";

describe("labelInitials", () => {
  it("draws two letters for a one-word name, not one", () => {
    expect(labelInitials("EduLoop")).toBe("ED");
    expect(labelInitials("Alice")).toBe("AL");
  });

  it("keeps the first character of the first two words of a longer name", () => {
    expect(labelInitials("Camille Martin")).toBe("CM");
    expect(labelInitials("Jean Claude Van Damme")).toBe("JC");
    expect(labelInitials("3M Group")).toBe("3G");
  });

  it("splits an address into words", () => {
    expect(labelInitials("ada.lovelace@example.com")).toBe("AL");
    expect(labelInitials("ada")).toBe("AD");
  });

  it("skips the punctuation and symbols of a one-word name", () => {
    expect(labelInitials("(Acme)")).toBe("AC");
    expect(labelInitials("O'Neil")).toBe("ON");
    expect(labelInitials("🎉Party")).toBe("PA");
  });

  it("skips leading punctuation in each word of a longer name", () => {
    expect(labelInitials("(Acme) Corp")).toBe("AC");
    expect(labelInitials("Acme (Corp)")).toBe("AC");
    expect(labelInitials("'Ada' \"Lovelace\"")).toBe("AL");
  });

  it("keeps an accented letter whole, even when its accent is a combining mark", () => {
    expect(labelInitials("Ñandú")).toBe("ÑA");
    expect(labelInitials("Ñandu")).toBe("ÑA");
    expect(labelInitials("Émile Zola")).toBe("ÉZ");
  });

  it("draws one letter for a one-letter name", () => {
    expect(labelInitials("x")).toBe("X");
  });

  it("draws a name without a letter as its first grapheme, not half an emoji", () => {
    expect(labelInitials("👩‍💻")).toBe("👩‍💻");
    expect(labelInitials("🎉 Party")).toBe("🎉P");
  });

  it("draws nothing for an empty name", () => {
    expect(labelInitials("")).toBe("");
    expect(labelInitials("  ")).toBe("");
  });
});
