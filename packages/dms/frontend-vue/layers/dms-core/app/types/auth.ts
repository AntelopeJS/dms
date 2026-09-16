import type { User } from "./user";

export interface TwoFactorRequiredResponse {
  requires_2fa: true;
  two_factor_token: string;
  methods: string[];
}

export interface TenantAssignmentRequiredResponse {
  requires_tenant_assignment: true;
  tenant_assignment_token: string;
  user: User;
}

export interface StoredAccount {
  accountId: string;
  userId: string;
  email: string;
  name: string;
  lastUsed: Date;
  isExpired?: boolean;
}

export interface ValidateAccountResponse {
  valid: boolean | null;
}

export interface SwitchAccountResponse {
  success: boolean;
  user: User;
}
