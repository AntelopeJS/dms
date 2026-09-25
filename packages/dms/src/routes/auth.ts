import {
  Controller,
  Get,
  JSONBody,
  Parameter,
  Post,
} from "@antelopejs/interface-api";
import { Model } from "@antelopejs/interface-database-decorators";
import { AuthRawUser } from "@antelopejs/interface-dms/auth";
import {
  SessionModel,
  type User,
  UserModel,
} from "@antelopejs/interface-dms/auth/db";
import * as authRoutes from "./auth/index";
import type { OAuthAuthorizeUrl } from "./auth/oauth";
import type { LoginOutcome } from "./auth/session-response";
import type {
  AuthResponse,
  TenantAssignmentRequiredResponse,
  TwoFactorRequiredResponse,
} from "./auth/types";

export class AuthController extends Controller("/api/auth") {
  @Model(UserModel)
  declare userModel: UserModel;

  @Model(SessionModel)
  declare sessionModel: SessionModel;

  @Parameter("user-agent", "header")
  declare userAgent: string;

  @Parameter("x-forwarded-for", "header")
  declare forwardedFor: string;

  @Parameter("x-dms-oauth-relay", "header")
  declare oauthRelayHeader: string;

  private get clientIp(): string {
    return authRoutes.clientIpFromForwardedFor(this.forwardedFor);
  }

  @Post("/signup")
  signup(@JSONBody() body: unknown): Promise<AuthResponse> {
    return authRoutes.signup(
      this.userModel,
      this.sessionModel,
      body,
      this.userAgent || "",
      this.clientIp,
    );
  }

  @Post("/login")
  login(
    @JSONBody() body: unknown,
  ): Promise<
    AuthResponse | TwoFactorRequiredResponse | TenantAssignmentRequiredResponse
  > {
    return authRoutes.login(
      this.userModel,
      this.sessionModel,
      body,
      this.userAgent || "",
      this.clientIp,
    );
  }

  @Get("/oauth/:provider/authorize-url")
  oauthAuthorizeUrl(
    @Parameter("provider") provider: string,
  ): OAuthAuthorizeUrl {
    authRoutes.assertOAuthRelay(this.oauthRelayHeader);
    return authRoutes.buildOAuthAuthorizeUrl(provider);
  }

  @Post("/oauth/:provider/callback")
  oauthCallback(
    @Parameter("provider") provider: string,
    @JSONBody() body: unknown,
  ): Promise<LoginOutcome> {
    authRoutes.assertOAuthRelay(this.oauthRelayHeader);
    return authRoutes.oauthCallback({
      userModel: this.userModel,
      sessionModel: this.sessionModel,
      providerId: provider,
      body,
      userAgent: this.userAgent || "",
      ip: this.clientIp,
    });
  }

  @Post("/verify-2fa")
  verify2FA(@JSONBody() body: unknown): Promise<AuthResponse> {
    return authRoutes.verify2FA(
      this.userModel,
      this.sessionModel,
      body,
      this.userAgent || "",
      this.clientIp,
    );
  }

  @Post("/request-2fa-email")
  request2FAEmail(@JSONBody() body: unknown) {
    return authRoutes.request2FAEmail(this.userModel, body);
  }

  @Post("/refresh")
  refresh(@JSONBody() body: unknown): Promise<AuthResponse> {
    return authRoutes.refresh(this.userModel, this.sessionModel, body);
  }

  @Post("/switch-tenant")
  switchTenant(@JSONBody() body: unknown): Promise<AuthResponse> {
    return authRoutes.switchTenant(this.userModel, this.sessionModel, body);
  }

  @Get("/me")
  me(@AuthRawUser() user: User): Promise<Partial<User>> {
    return authRoutes.me(user);
  }

  @Post("/logout")
  logout(@AuthRawUser() user: User, @JSONBody() body: unknown) {
    return authRoutes.logout(this.userModel, this.sessionModel, user, body);
  }

  @Post("/verify-email")
  verifyEmail(
    @AuthRawUser() user: User,
    @JSONBody() body: unknown,
  ): Promise<void> {
    return authRoutes.verifyEmail(this.userModel, user, body);
  }

  @Get("/request-email-verification")
  requestEmailVerification(@AuthRawUser() user: User): Promise<void> {
    return authRoutes.requestEmailVerification(this.userModel, user);
  }

  @Post("/forgot-password")
  forgotPassword(@JSONBody() body: unknown): Promise<void> {
    return authRoutes.forgotPassword(this.userModel, body);
  }

  @Post("/validate-forgot-password-token")
  validateForgotPasswordToken(@JSONBody() body: unknown): Promise<void> {
    return authRoutes.validateForgotPasswordToken(this.userModel, body);
  }

  @Post("/reset-password")
  resetPassword(@JSONBody() body: unknown): Promise<void> {
    return authRoutes.resetPassword(this.userModel, body);
  }
}
