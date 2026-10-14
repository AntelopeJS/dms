import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { Form } from "@antelopejs/interface-dms/base/form";
import { FormPageLayout } from "@antelopejs/interface-dms/base/layouts";
import { pageCategory } from "../category";
import {
  AVATAR_ATTACHMENT_FIELD,
  AVATAR_CONSTRAINTS,
  AVATAR_VISIBILITY,
  COVER_IMAGE_ATTACHMENT_FIELD,
  COVER_IMAGE_CONSTRAINTS,
  DOCUMENTS_ATTACHMENT_FIELD,
  DOCUMENTS_CONSTRAINTS,
  GALLERY_ATTACHMENT_FIELD,
  GALLERY_CONSTRAINTS,
} from "../profile-attachments";
import { PROFILE_SOCIAL_SLOT_ID } from "./slot";

const COVER_RESIZE = { maxWidth: 1600, maxHeight: 900, fit: "cover" } as const;
const GALLERY_RESIZE = {
  maxWidth: 1200,
  maxHeight: 1200,
  fit: "contain",
} as const;

@RegisterPage()
export class PageFormProfileEdit extends PageController(
  "form-profile-edit",
  {
    displayName: "Profile & uploads",
    icon: "i-ph-user-circle",
    category: pageCategory,
    order: 40,
    description:
      "Four forms saving one database record, with files and images stored through attachment fields. Upload, save and reload: the files stay, a removed one is deleted.",
  },
  FormPageLayout(),
) {
  static basicInfo = Form({
    title: "Basic Information",
    description: "Update your personal information",
    fetchUrl: "/api/profile/first",
    submitUrl: "/api/profile/first/update",
    fields: [
      {
        id: "avatar",
        label: "Avatar",
        description: "A PNG or JPEG file, stored public (visibility)",
        type: new DefaultDataTypes.FileType({
          multiple: false,
          path: "avatars",
          attachmentField: AVATAR_ATTACHMENT_FIELD,
          constraints: AVATAR_CONSTRAINTS,
          visibility: AVATAR_VISIBILITY,
        }),
      },
      {
        id: "coverImage",
        label: "Cover Image",
        description:
          "Single image with alt text, resized to 1600×900 before upload",
        type: new DefaultDataTypes.ImageType({
          multiple: false,
          path: "covers",
          attachmentField: COVER_IMAGE_ATTACHMENT_FIELD,
          constraints: COVER_IMAGE_CONSTRAINTS,
          resize: COVER_RESIZE,
        }),
      },
      {
        id: "gallery",
        label: "Photo Gallery",
        description: "Multiple images with a principal one",
        type: new DefaultDataTypes.ImageType({
          multiple: true,
          max: 12,
          path: "gallery",
          attachmentField: GALLERY_ATTACHMENT_FIELD,
          constraints: GALLERY_CONSTRAINTS,
          resize: GALLERY_RESIZE,
        }),
      },
      {
        id: "documents",
        label: "Documents",
        description: "Several PDF files (FileType multiple)",
        type: new DefaultDataTypes.FileType({
          multiple: true,
          path: "documents",
          attachmentField: DOCUMENTS_ATTACHMENT_FIELD,
          constraints: DOCUMENTS_CONSTRAINTS,
        }),
      },
      {
        id: "firstName",
        label: "First Name",
        description: "Your first name",
        type: new DefaultDataTypes.StringType({
          placeholder: "Enter your first name...",
          maxLength: 50,
        }),
      },
      {
        id: "lastName",
        label: "Last Name",
        description: "Your last name",
        type: new DefaultDataTypes.StringType({
          placeholder: "Enter your last name...",
          maxLength: 50,
        }),
      },
      {
        id: "email",
        label: "Email Address",
        description: "Your email address",
        type: new DefaultDataTypes.EmailType({
          placeholder: "Enter your email...",
        }),
      },
      {
        id: "phone",
        label: "Phone Number",
        description: "Your phone number",
        type: new DefaultDataTypes.PhoneType({
          placeholder: "+1-555-123-4567",
        }),
      },
      {
        id: "birthDate",
        label: "Birth Date",
        description: "Select your birth date",
        type: new DefaultDataTypes.DateType(),
      },
      {
        id: "gender",
        label: "Gender",
        description: "Select your gender",
        type: new DefaultDataTypes.SelectType({
          items: [
            { label: "Male", value: "male" },
            { label: "Female", value: "female" },
            { label: "Other", value: "other" },
            { label: "Prefer not to say", value: "prefer-not-to-say" },
          ],
          placeholder: "Select gender...",
        }),
      },
    ],
  });

  static locationInfo = Form({
    title: "Location & Preferences",
    description: "Your location and app preferences",
    fetchUrl: "/api/profile/first",
    submitUrl: "/api/profile/first/update",
    fields: [
      {
        id: "country",
        label: "Country",
        description: "Select your country",
        type: new DefaultDataTypes.SelectType({
          items: [
            { label: "United States", value: "us" },
            { label: "Canada", value: "ca" },
            { label: "United Kingdom", value: "uk" },
            { label: "Germany", value: "de" },
            { label: "France", value: "fr" },
            { label: "Japan", value: "jp" },
            { label: "Australia", value: "au" },
          ],
          placeholder: "Select country...",
        }),
      },
      {
        id: "city",
        label: "City",
        description: "Your city",
        type: new DefaultDataTypes.StringType({
          placeholder: "Enter your city...",
        }),
      },
      {
        id: "postalCode",
        label: "Postal Code",
        description: "Your postal/zip code",
        type: new DefaultDataTypes.StringType({
          placeholder: "12345 or A1B 2C3",
        }),
      },
      {
        id: "timezone",
        label: "Timezone",
        description: "Select your timezone",
        type: new DefaultDataTypes.SelectType({
          items: [
            { label: "Eastern Time", value: "America/New_York" },
            { label: "Central Time", value: "America/Chicago" },
            { label: "Mountain Time", value: "America/Denver" },
            { label: "Pacific Time", value: "America/Los_Angeles" },
            { label: "UTC", value: "UTC" },
            { label: "London", value: "Europe/London" },
            { label: "Paris", value: "Europe/Paris" },
            { label: "Tokyo", value: "Asia/Tokyo" },
          ],
          placeholder: "Select timezone...",
        }),
      },
      {
        id: "language",
        label: "Language",
        description: "Preferred language",
        type: new DefaultDataTypes.SelectType({
          items: [
            { label: "English", value: "en" },
            { label: "Spanish", value: "es" },
            { label: "French", value: "fr" },
            { label: "German", value: "de" },
            { label: "Japanese", value: "ja" },
            { label: "Chinese", value: "zh" },
          ],
          placeholder: "Select language...",
        }),
      },
      {
        id: "vacationDates",
        label: "Vacation Dates (Range)",
        description: "Select your vacation date range",
        type: new DefaultDataTypes.DateType({
          range: true,
        }),
      },
    ],
  });

  static professionalInfo = Form({
    title: "Professional Information",
    description: "Your work and professional details",
    fetchUrl: "/api/profile/first",
    submitUrl: "/api/profile/first/update",
    fields: [
      {
        id: "jobTitle",
        label: "Job Title",
        description: "Your current job title",
        type: new DefaultDataTypes.StringType({
          placeholder: "e.g., Software Engineer",
        }),
      },
      {
        id: "company",
        label: "Company",
        description: "Your company name",
        type: new DefaultDataTypes.StringType({
          placeholder: "e.g., Tech Corp",
        }),
      },
      {
        id: "experience",
        label: "Years of Experience",
        description: "Years of professional experience",
        type: new DefaultDataTypes.NumberType({
          min: 0,
          max: 50,
          step: 1,
          placeholder: "Enter years",
        }),
      },
      {
        id: "salary",
        label: "Annual Salary (USD)",
        description: "Your annual salary in USD",
        type: new DefaultDataTypes.PriceType({
          min: 0,
          max: 1000000,
          step: 1000,
          placeholder: "Enter salary",
        }),
      },
      {
        id: "skills",
        label: "Skills",
        description: "Select your professional skills",
        type: new DefaultDataTypes.SelectType({
          items: [
            { label: "JavaScript", value: "javascript" },
            { label: "TypeScript", value: "typescript" },
            { label: "React", value: "react" },
            { label: "Vue.js", value: "vue" },
            { label: "Node.js", value: "nodejs" },
            { label: "Python", value: "python" },
            { label: "Java", value: "java" },
            { label: "C#", value: "csharp" },
            { label: "Go", value: "go" },
            { label: "Rust", value: "rust" },
          ],
          placeholder: "Select skills...",
          multiple: true,
        }),
      },
      {
        id: "department",
        label: "Department",
        description: "Select your department",
        type: new DefaultDataTypes.SelectType({
          items: [
            { label: "Engineering / Frontend", value: "eng-frontend" },
            { label: "Engineering / Backend", value: "eng-backend" },
            { label: "Engineering / DevOps", value: "eng-devops" },
            { label: "Engineering / Mobile", value: "eng-mobile" },
            { label: "Product / Product Management", value: "product-pm" },
            { label: "Product / Product Design", value: "product-design" },
            { label: "Marketing / Content", value: "marketing-content" },
            { label: "Marketing / Growth", value: "marketing-growth" },
            { label: "Marketing / Brand", value: "marketing-brand" },
            { label: "Sales / Enterprise", value: "sales-enterprise" },
            { label: "Sales / SMB", value: "sales-smb" },
          ],
          placeholder: "Select department...",
        }),
      },
    ],
  });

  static socialAndSettings = Form({
    title: "Social & Settings",
    description:
      "Social links and account settings. Its last field is added by another module through the form's slot (slotId).",
    slotId: PROFILE_SOCIAL_SLOT_ID,
    fetchUrl: "/api/profile/first",
    submitUrl: "/api/profile/first/update",
    fields: [
      {
        id: "website",
        label: "Website",
        description: "Your personal website",
        type: new DefaultDataTypes.UrlType({
          placeholder: "https://yourwebsite.com",
        }),
      },
      {
        id: "linkedinUrl",
        label: "LinkedIn Profile",
        description: "Your LinkedIn profile URL",
        type: new DefaultDataTypes.UrlType({
          placeholder: "https://linkedin.com/in/username",
        }),
      },
      {
        id: "githubUrl",
        label: "GitHub Profile",
        description: "Your GitHub profile URL",
        type: new DefaultDataTypes.UrlType({
          placeholder: "https://github.com/username",
        }),
      },
      {
        id: "twitterUrl",
        label: "Twitter Profile",
        description: "Your Twitter profile URL",
        type: new DefaultDataTypes.UrlType({
          placeholder: "https://twitter.com/username",
        }),
      },
      {
        id: "notifications",
        label: "Notification Preferences",
        description: "Select how you want to receive notifications",
        type: new DefaultDataTypes.SelectType({
          items: [
            { label: "Email", value: "email" },
            { label: "SMS", value: "sms" },
            { label: "Push Notifications", value: "push" },
            { label: "In-App", value: "inapp" },
          ],
          placeholder: "Select notification types...",
          multiple: true,
        }),
      },
      {
        id: "newsletter",
        label: "Subscribe to Newsletter",
        description: "Receive our weekly newsletter",
        type: new DefaultDataTypes.BooleanType(),
      },
      {
        id: "twoFactorAuth",
        label: "Two-Factor Authentication",
        description: "Enable 2FA for added security",
        type: new DefaultDataTypes.BooleanType(),
      },
      {
        id: "profilePublic",
        label: "Public Profile",
        description: "Make your profile visible to others",
        type: new DefaultDataTypes.BooleanType(),
      },
    ],
  });
}
