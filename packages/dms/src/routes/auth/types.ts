import type { User } from "@antelopejs/interface-dms/auth/db";

export interface AuthResponse {
  token_type: string;
  access_token: string;
  expires_in: number;
  refresh_token: string;
  user?: Partial<User>;
}

export interface TwoFactorRequiredResponse {
  requires_2fa: true;
  two_factor_token: string;
  methods: string[];
}

export interface TenantAssignmentRequiredResponse {
  requires_tenant_assignment: true;
  tenant_assignment_token: string;
  user: Partial<User>;
}
