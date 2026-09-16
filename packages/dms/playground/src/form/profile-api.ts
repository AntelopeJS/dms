import { Controller, Get, JSONBody, Put } from "@antelopejs/interface-api";
import { Model } from "@antelopejs/interface-database-decorators";
import {
  type DateRange,
  Gender,
  MaritalStatus,
  type Profile,
  ProfileModel,
  Theme,
} from "./profile-database";

export class ProfileAPIController extends Controller("/api/profile") {
  @Model(ProfileModel)
  declare model: ProfileModel;

  @Get("first")
  async getFirstProfile() {
    let profiles = await this.model.getAll();

    if (profiles.length === 0) {
      const defaultProfile = {
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

      await this.model.insert(defaultProfile);
      profiles = await this.model.getAll();
    }

    const profile = profiles[0];
    return this.formatProfileResponse(profile);
  }

  @Put("first/update")
  async updateFirstProfile(@JSONBody() profileUpdates: Partial<Profile>) {
    const profiles = await this.model.getAll();

    if (profiles.length === 0) {
      throw new Error("No profile found in database");
    }

    const firstProfile = profiles[0];
    const mergedUpdates = {
      ...profileUpdates,
      birthDate: profileUpdates.birthDate
        ? new Date(profileUpdates.birthDate)
        : firstProfile.birthDate,
      vacationDates: profileUpdates.vacationDates || firstProfile.vacationDates,
      updatedAt: new Date(),
    };

    await this.model.update(firstProfile._id, mergedUpdates);
    return { message: "Profile updated successfully" };
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
