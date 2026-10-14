import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { Form } from "@antelopejs/interface-dms/base/form";
import { FormPageLayout } from "@antelopejs/interface-dms/base/layouts";
import { pageCategory } from "../category";

@RegisterPage()
export class PageFormGrouped extends PageController(
  "form-grouped",
  {
    displayName: "Field groups",
    icon: "i-ph-squares-four",
    category: pageCategory,
    order: 50,
    description:
      "Fields side by side or stacked under one label, and groups moved with order. The values still save as flat keys.",
  },
  FormPageLayout(),
) {
  static form = Form({
    title: "Field groups",
    description:
      "Contact is horizontal, Address vertical. Address (order 1) comes before Social links (order 2), though declared after it.",
    fetchUrl: "/api/form-grouped/get",
    submitUrl: "/api/form-grouped/save",
    fields: [
      {
        id: "username",
        label: "Username",
        description: "Your unique identifier",
        type: new DefaultDataTypes.StringType({
          placeholder: "Enter username...",
          minLength: 3,
          maxLength: 20,
        }),
        required: true,
      },
      {
        id: "contactGroup",
        label: "Contact Information",
        description: "Your email and phone number (horizontal)",
        orientation: "horizontal",
        fields: [
          {
            id: "email",
            type: new DefaultDataTypes.EmailType({
              placeholder: "email@example.com",
            }),
            required: true,
          },
          {
            id: "phone",
            type: new DefaultDataTypes.PhoneType({
              placeholder: "+1 234 567 890",
            }),
          },
        ],
      },
      {
        id: "bio",
        label: "Biography",
        description: "Tell us about yourself",
        type: new DefaultDataTypes.RichTextType({
          placeholder: "Write a short bio...",
        }),
      },
      {
        id: "socialGroup",
        label: "Social Links",
        description: "Your social media profiles (order 2)",
        order: 2,
        fields: [
          {
            id: "website",
            type: new DefaultDataTypes.StringType({
              placeholder: "https://yourwebsite.com",
            }),
          },
          {
            id: "twitter",
            type: new DefaultDataTypes.StringType({
              placeholder: "@username",
            }),
          },
          {
            id: "linkedin",
            type: new DefaultDataTypes.StringType({
              placeholder: "linkedin.com/in/username",
            }),
          },
        ],
      },
      {
        id: "addressGroup",
        label: "Address",
        description: "Your mailing address (vertical, order 1)",
        orientation: "vertical",
        order: 1,
        fields: [
          {
            id: "street",
            type: new DefaultDataTypes.StringType({
              placeholder: "Street address",
            }),
          },
          {
            id: "city",
            type: new DefaultDataTypes.StringType({
              placeholder: "City",
            }),
          },
          {
            id: "zipCode",
            type: new DefaultDataTypes.StringType({
              placeholder: "ZIP Code",
            }),
          },
          {
            id: "country",
            type: new DefaultDataTypes.SelectType({
              placeholder: "Select country",
              items: [
                { label: "United States", value: "us" },
                { label: "Canada", value: "ca" },
                { label: "United Kingdom", value: "uk" },
                { label: "France", value: "fr" },
                { label: "Germany", value: "de" },
              ],
            }),
          },
        ],
      },
      {
        id: "newsletter",
        label: "Newsletter",
        description: "Subscribe to receive updates",
        type: new DefaultDataTypes.BooleanType(),
      },
    ],
  });
}
