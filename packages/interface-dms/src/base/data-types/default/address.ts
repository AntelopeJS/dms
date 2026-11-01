/** Stable postal-address data type. @packageDocumentation */
import type { ControllerClass } from "@antelopejs/interface-api";
import { z } from "zod";
import { FormComponents } from "../../form-schema";
import { DataType, RegisterDataType } from "../core";
import { DefaultDataCompareTypes } from "../compare-types";
import { selectUrl } from "../internal/relation-endpoints";

/**
 * Structured postal address aligned with ISO 19160-1 address components and
 * directly mappable to the UBL `cac:PostalAddress` used by EN 16931 / Peppol
 * BIS Billing 3.0 (so it is invoice/e-invoicing friendly out of the box).
 *
 * Field → EN 16931 / UBL mapping:
 * - streetName          → BT-35  / cbc:StreetName
 * - houseNumber         → BT-35  / cbc:BuildingNumber
 * - boxNumber           → BT-162 / cac:AddressLine/cbc:Line
 * - addressLine2        → BT-36  / cbc:AdditionalStreetName
 * - postalCode          → BT-38  / cbc:PostalZone
 * - city                → BT-37  / cbc:CityName
 * - countrySubdivision  → BT-39  / cbc:CountrySubentity
 * - countryCode         → BT-40  / cac:Country/cbc:IdentificationCode (ISO 3166-1 alpha-2)
 */
export type Address = {
  /** Street / thoroughfare name. */
  streetName: string;
  /** House / building number. */
  houseNumber?: string;
  /** Box, unit or apartment number (delivery point sub-identifier). */
  boxNumber?: string;
  /** Supplementary delivery information (c/o, building, floor, ...). */
  addressLine2?: string;
  /** Postal / ZIP code. */
  postalCode: string;
  /** City / locality name. */
  city: string;
  /** Country subdivision (region / state / province). */
  countrySubdivision?: string;
  /** Country code, ISO 3166-1 alpha-2 (e.g. "BE", "FR"). */
  countryCode: string;
};

type AddressPlaceholders = Partial<Record<keyof Address, string>>;

/**
 * Address autocomplete configuration. Defaults to the public Photon
 * (Komoot) geocoder — free, key-less, worldwide, designed for type-ahead.
 * Provide `url` to point at a self-hosted Photon instance or any other
 * GeoJSON/Photon-compatible endpoint.
 */
export type AddressAutocomplete = {
  /** Enable address suggestions on the street field. Defaults to `false`. */
  enabled?: boolean;
  /** Geocoder endpoint. Defaults to "https://photon.komoot.io/api". */
  url?: string;
  /** Preferred result language (ISO 639-1). Falls back to the UI locale. */
  lang?: string;
  /** Maximum number of suggestions. Defaults to 5. */
  limit?: number;
  /** Search field placeholder (raw text or `$i18n.key`). */
  placeholder?: string;
};

/**
 * The `address` data type.
 *
 * @docsApi
 */
@RegisterDataType("address")
export class AddressType<
  T extends ControllerClass = ControllerClass,
> extends DataType {
  constructor(
    public readonly options: {
      placeholder?: AddressPlaceholders;
      autocomplete?: AddressAutocomplete;
      /**
       * ISO 3166-1 alpha-2 code ("BE") the country shows while the address
       * has none, and whose places the street suggestions list first. It
       * is written with the first part typed: an address left empty stays
       * empty.
       */
      defaultCountry?: string;
      dataApiController?: T;
      keyMapping?: {
        label?: keyof InstanceType<T> & string;
        value?: keyof InstanceType<T> & string;
      };
      fallback?: string;
    } = {},
  ) {
    super(
      [DefaultDataCompareTypes.IsEmpty, DefaultDataCompareTypes.IsNotEmpty],
      DefaultDataCompareTypes.IsEmpty,
      options,
    );
  }

  protected defaultInputComponent() {
    const baseConfig = {
      placeholder: this.options.placeholder,
      autocomplete: this.options.autocomplete,
      defaultCountry: this.options.defaultCountry,
    };

    if (!this.options.dataApiController) {
      return FormComponents.InputAddress(baseConfig);
    }

    return FormComponents.InputAddress({
      ...baseConfig,
      searchUrl: selectUrl(this.options.dataApiController),
      keyMapping: this.options.keyMapping,
    });
  }

  getValidation() {
    return z.object({
      streetName: z.string().min(1),
      houseNumber: z.string().optional(),
      boxNumber: z.string().optional(),
      addressLine2: z.string().optional(),
      postalCode: z.string().min(1),
      city: z.string().min(1),
      countrySubdivision: z.string().optional(),
      countryCode: z.string().length(2),
    });
  }
}
