import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { Form } from "@antelopejs/interface-dms/base/form";
import { FormPageLayout } from "@antelopejs/interface-dms/base/layouts";
import { pageCategory } from "../category";

@RegisterPage()
export class PageFormAdvanced extends PageController(
  "form-advanced",
  {
    displayName: "Advanced Form",
    icon: "i-ph-note-pencil-duotone",
    category: pageCategory,
    order: 10,
    description: "Advanced form with select, radio, and slider options",
  },
  FormPageLayout(),
) {
  static productForm = Form({
    title: "Product Configuration",
    description: "Configure your product preferences",
    fields: [
      {
        id: "productName",
        label: "Product Name",
        description: "Enter the product name",
        type: new DefaultDataTypes.StringType({
          placeholder: "e.g., Premium Laptop",
          maxLength: 50,
        }),
      },
      {
        id: "category",
        label: "Product Category",
        description: "Select the product category",
        type: new DefaultDataTypes.SelectType({
          items: [
            { label: "Electronics", value: "electronics" },
            { label: "Clothing", value: "clothing" },
            { label: "Home & Garden", value: "home-garden" },
            { label: "Sports & Outdoors", value: "sports" },
            { label: "Books & Media", value: "books" },
            { label: "Toys & Games", value: "toys" },
          ],
          placeholder: "Choose a category...",
        }),
      },
      {
        id: "price",
        label: "Price ($)",
        description: "Set the price",
        type: new DefaultDataTypes.PriceType({
          min: 10,
          max: 1000,
          step: 10,
        }),
      },
      {
        id: "discount",
        label: "Discount Percentage",
        description: "Set discount percentage",
        type: new DefaultDataTypes.PercentageType({
          min: 0,
          max: 0.75,
          step: 0.05,
        }),
      },
      {
        id: "tags",
        label: "Product Tags",
        description: "Select multiple tags for this product",
        type: new DefaultDataTypes.SelectType({
          items: [
            { label: "New Arrival", value: "new" },
            { label: "Best Seller", value: "bestseller" },
            { label: "On Sale", value: "sale" },
            { label: "Limited Edition", value: "limited" },
            { label: "Eco-Friendly", value: "eco" },
            { label: "Premium", value: "premium" },
          ],
          placeholder: "Select tags...",
          multiple: true,
        }),
      },
      {
        id: "stock",
        label: "Stock Quantity",
        description: "Enter the available stock",
        type: new DefaultDataTypes.NumberType({
          min: 0,
          max: 10000,
          step: 1,
          placeholder: "Enter quantity",
        }),
      },
      {
        id: "featured",
        label: "Featured Product",
        description: "Display this product on the homepage",
        type: new DefaultDataTypes.BooleanType(),
      },
    ],
  });

  static userPreferences = Form({
    title: "User Preferences",
    description: "Configure your application preferences",
    fields: [
      {
        id: "language",
        label: "Language",
        description: "Select your preferred language",
        type: new DefaultDataTypes.SelectType({
          items: [
            { label: "English", value: "en" },
            { label: "Spanish", value: "es" },
            { label: "French", value: "fr" },
            { label: "German", value: "de" },
            { label: "Italian", value: "it" },
            { label: "Portuguese", value: "pt" },
            { label: "Japanese", value: "ja" },
            { label: "Chinese", value: "zh" },
          ],
          placeholder: "Select language...",
        }),
      },
      {
        id: "fontSize",
        label: "Font Size",
        description: "Adjust the font size",
        type: new DefaultDataTypes.NumberType({
          min: 12,
          max: 24,
          step: 2,
        }),
      },
      {
        id: "notifications",
        label: "Notification Types",
        description: "Select which notifications you want to receive",
        type: new DefaultDataTypes.SelectType({
          items: [
            { label: "Email", value: "email" },
            { label: "SMS", value: "sms" },
            { label: "Push", value: "push" },
            { label: "In-App", value: "inapp" },
          ],
          placeholder: "Select notification types...",
          multiple: true,
        }),
      },
    ],
  });
}
