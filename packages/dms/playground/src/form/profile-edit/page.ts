import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { Form } from "@antelopejs/interface-dms/base/form";
import { FormPageLayout } from "@antelopejs/interface-dms/base/layouts";
import { pageCategory } from "../category";

@RegisterPage()
export class PageFormProfileEdit extends PageController(
  "form-profile-edit",
  {
    displayName: "Profile Edit Form",
    icon: "i-ph-user-circle",
    category: pageCategory,
    order: 40,
    description: "Comprehensive profile form testing all input types",
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
        description: "Your avatar",
        type: new DefaultDataTypes.FileType({
          multiple: false,
          path: "avatars",
          constraints: {
            allowedMimetypes: ["image/png", "image/jpeg"],
            maxSize: 1024 * 1024 * 5,
          },
        }),
      },
      {
        id: "coverImage",
        label: "Cover Image",
        description: "Single image with alt text",
        type: new DefaultDataTypes.ImageType({
          multiple: false,
          path: "covers",
          constraints: {
            maxSize: 1024 * 1024 * 10,
          },
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
          constraints: {
            allowedMimetypes: ["image/png", "image/jpeg", "image/webp"],
            maxSize: 1024 * 1024 * 10,
          },
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
        description: "Select your department from the organizational tree",
        type: new DefaultDataTypes.TreeType({
          items: [
            {
              label: "Engineering",
              value: "eng",
              children: [
                { label: "Frontend", value: "eng-frontend" },
                { label: "Backend", value: "eng-backend" },
                { label: "DevOps", value: "eng-devops" },
                { label: "Mobile", value: "eng-mobile" },
              ],
            },
            {
              label: "Product",
              value: "product",
              children: [
                { label: "Product Management", value: "product-pm" },
                { label: "Product Design", value: "product-design" },
              ],
            },
            {
              label: "Marketing",
              value: "marketing",
              children: [
                { label: "Content", value: "marketing-content" },
                { label: "Growth", value: "marketing-growth" },
                { label: "Brand", value: "marketing-brand" },
              ],
            },
            {
              label: "Sales",
              value: "sales",
              children: [
                { label: "Enterprise", value: "sales-enterprise" },
                { label: "SMB", value: "sales-smb" },
              ],
            },
          ],
          placeholder: "Select department...",
        }),
      },
    ],
  });

  static socialAndSettings = Form({
    title: "Social & Settings",
    description: "Social links and account settings",
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
