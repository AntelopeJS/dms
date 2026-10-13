import { DemoRecordController } from "../demo-record-api";
import { PageFormAddress } from "./page";

/** Loads and saves the "Address" demo form. */
export const FormAddressAPIController = DemoRecordController({
  location: "/api/form-address",
  guard: PageFormAddress,
  form: PageFormAddress.addressForm,
  record: {
    billingAddress: {
      streetName: "Rue de la Loi",
      houseNumber: "16",
      postalCode: "1000",
      city: "Brussels",
      countryCode: "BE",
    },
    shippingAddress: null,
    registeredOffice: null,
  },
});
