import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { Form } from "@antelopejs/interface-dms/base/form";
import { FormPageLayout } from "@antelopejs/interface-dms/base/layouts";
import { pageCategory } from "../category";

const PHOTON_URL = "https://photon.komoot.io/api";
const SUGGESTION_LIMIT = 8;

/**
 * The address field: its parts, their placeholders, and street suggestions
 * from a geocoder (Photon by default, or the `url` given). Saving stores the
 * `DefaultDataTypes.Address` object, which the form loads back.
 */
@RegisterPage()
export class PageFormAddress extends PageController(
  "form-address",
  {
    displayName: "Address",
    icon: "i-ph-map-pin",
    category: pageCategory,
    order: 20,
    description:
      "Address fields with street suggestions as you type. Save, then reload: the stored address object comes back part by part.",
  },
  FormPageLayout(),
) {
  static addressForm = Form({
    title: "Addresses",
    description: "Start typing a street name to get suggestions.",
    fetchUrl: "/api/form-address/get",
    submitUrl: "/api/form-address/save",
    fields: [
      {
        id: "billingAddress",
        label: "Billing address",
        description:
          "Suggestions in French, 8 at most, with a placeholder per part",
        type: new DefaultDataTypes.AddressType({
          placeholder: {
            streetName: "Rue de la Loi",
            houseNumber: "16",
            postalCode: "1000",
            city: "Brussels",
          },
          autocomplete: {
            enabled: true,
            lang: "fr",
            limit: SUGGESTION_LIMIT,
            placeholder: "Search an address…",
          },
        }),
      },
      {
        id: "shippingAddress",
        label: "Shipping address",
        description: "Suggestions from an explicit geocoder URL",
        type: new DefaultDataTypes.AddressType({
          autocomplete: { enabled: true, url: PHOTON_URL },
        }),
      },
      {
        id: "registeredOffice",
        label: "Registered office",
        description: "No suggestions: the parts typed by hand",
        type: new DefaultDataTypes.AddressType(),
      },
    ],
  });
}
