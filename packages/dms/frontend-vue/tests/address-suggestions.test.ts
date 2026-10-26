/**
 * The street suggestions of an address hold each place once, those of the
 * address's country (its own, or its `defaultCountry`) first: "Place
 * Saint-Lambert" typed for a Belgian address lists Liège, once, before the
 * places of the same name elsewhere.
 */
import { describe, expect, it } from "vitest";
import {
  rankAddressSuggestions,
  suggestionPoolSize,
} from "../layers/dms-ui/app/entries/utils/addressSuggestions";

const place = (label: string, countryCode?: string) => ({ label, countryCode });

describe("address suggestions", () => {
  it("lists each place once", () => {
    const ranked = rankAddressSuggestions(
      [
        place("Place Saint-Lambert, 4000 Liège, Belgique", "BE"),
        place("Place Saint-Lambert, 4000 Liège, Belgique", "BE"),
        place("place saint-lambert, 4000 liège, belgique ", "BE"),
      ],
      undefined,
      5,
    );
    expect(ranked).toHaveLength(1);
  });

  it("lists the places of the address's country first, then the others", () => {
    const ranked = rankAddressSuggestions(
      [
        place("Saint-Lambert, Syrie", "SY"),
        place("Saint-Lambert, Jersey", "JE"),
        place("Place Saint-Lambert, Liège", "BE"),
        place("Saint-Lambert, Canada", "CA"),
      ],
      "be",
      3,
    );
    expect(ranked.map((suggestion) => suggestion.countryCode)).toEqual([
      "BE",
      "SY",
      "JE",
    ]);
  });

  it("asks for a wider pool to rank from, within bounds", () => {
    expect(suggestionPoolSize(5)).toBe(20);
    expect(suggestionPoolSize(2)).toBe(8);
    expect(suggestionPoolSize(10)).toBe(20);
  });
});
