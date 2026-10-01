import {
  Context,
  Controller,
  Get,
  JSONBody,
  Put,
  type RequestContext,
} from "@antelopejs/interface-api";
import { Model } from "@antelopejs/interface-database-decorators";
import { SaveComponentFiles } from "@antelopejs/interface-dms/attachments";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { AuthUserWithPermission } from "@antelopejs/interface-dms/guards";
import { GetComponentPermissionIds } from "@antelopejs/interface-dms/page";
import {
  pickAttachmentValues,
  PROFILE_ATTACHMENT_FIELDS,
} from "./profile-attachments";
import {
  type DateRange,
  Gender,
  MaritalStatus,
  type Profile,
  ProfileModel,
  Theme,
} from "./profile-database";
import { PageFormProfileEdit } from "./profile-edit/page";

/**
 * The fixed id makes creating the default profile idempotent: concurrent first
 * fetches (the profile page mounts four forms at once) race on the primary key
 * instead of each inserting a profile of its own.
 */
const DEFAULT_PROFILE_ID = "playground-default-profile";

function createDefaultProfile(): Partial<Profile> {
  return {
    _id: DEFAULT_PROFILE_ID,
    userId: "test-user",
    avatar: "",
    firstName: "John",
    lastName: "Doe",
    email: "john.doe@example.com",
    phone: "+1-555-123-4567",
    birthDate: new Date("1990-05-15"),
    vacationDates: { start: "2025-07-01", end: "2025-07-15" } as DateRange,
    gender: Gender.male,
    maritalStatus: MaritalStatus.single,
    country: "us",
    theme: Theme.dark,
    language: "en",
    timezone: "America/New_York",
    currency: "usd",
    city: "New York",
    jobTitle: "Software Engineer",
    company: "Tech Corp",
    website: "https://johndoe.dev",
    linkedinUrl: "https://linkedin.com/in/johndoe",
    githubUrl: "https://github.com/johndoe",
    twitterUrl: "https://twitter.com/johndoe",
    address: "123 Main Street, Apt 4B",
    bio: "Passionate software engineer with 5 years of experience in web development.",
    experience: 5,
    salary: 85000,
    profileCompleteness: 85,
    postalCode: "10001",
    skills: ["javascript", "typescript", "react"],
    notifications: ["email", "push"],
    department: "eng-frontend",
    newsletter: true,
    twoFactorAuth: false,
    profilePublic: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export class ProfileAPIController extends Controller("/api/profile") {
  @Model(ProfileModel)
  declare model: ProfileModel;

  @AuthUserWithPermission(PageFormProfileEdit)
  declare user: User;

  @Get("first")
  async getFirstProfile() {
    return this.formatProfileResponse(await this.getOrCreateDefaultProfile());
  }

  @Put("first/update")
  async updateFirstProfile(
    @Context() context: RequestContext,
    @JSONBody() profileUpdates: Partial<Profile>,
  ) {
    const stored = await this.getOrCreateDefaultProfile();
    const before = pickAttachmentValues(stored);
    await SaveComponentFiles(
      {
        context,
        componentIds: GetComponentPermissionIds(PageFormProfileEdit.basicInfo),
        fields: PROFILE_ATTACHMENT_FIELDS,
        // The other forms of the page submit no file field: keep the stored
        // ones, or cleanup would read their absence as a removal.
        submitted: { ...before, ...profileUpdates },
        before,
      },
      async (promoted) => {
        await this.model.update(
          DEFAULT_PROFILE_ID,
          this.mergeUpdates(stored, promoted),
        );
        const saved = await this.model.get(DEFAULT_PROFILE_ID);
        if (!saved) throw new Error("Updated profile was not found");
        return { document: pickAttachmentValues(saved), result: saved };
      },
    );
    return { message: "Profile updated successfully" };
  }

  private async getOrCreateDefaultProfile(): Promise<Profile> {
    const existing = await this.model.get(DEFAULT_PROFILE_ID);
    if (existing) return existing;
    try {
      await this.model.insert(createDefaultProfile());
    } catch (error) {
      const concurrentlyCreated = await this.model.get(DEFAULT_PROFILE_ID);
      if (concurrentlyCreated) return concurrentlyCreated;
      throw error;
    }
    const created = await this.model.get(DEFAULT_PROFILE_ID);
    if (!created) throw new Error("Default profile was not created");
    return created;
  }

  private mergeUpdates(
    stored: Profile,
    updates: Partial<Profile>,
  ): Partial<Profile> {
    return {
      ...updates,
      _id: DEFAULT_PROFILE_ID,
      birthDate: updates.birthDate
        ? new Date(updates.birthDate)
        : stored.birthDate,
      vacationDates: updates.vacationDates || stored.vacationDates,
      updatedAt: new Date(),
    };
  }

  private formatProfileResponse(profile: Profile) {
    return {
      // The spread row is an AntelopeJS table class: `Table` declares one
      // field and a static, no instance methods, and the value is
      // serialised to JSON on the way out. No prototype to lose.
      // oxlint-disable-next-line typescript/no-misused-spread
      ...profile,
    };
  }
}
