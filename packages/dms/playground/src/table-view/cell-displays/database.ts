import {
  BasicDataModel,
  Field,
  Fixture,
  Index,
  RegisterTable,
  Table,
} from "@antelopejs/interface-database-decorators";
import { CORE_SCHEMA_NAME } from "@antelopejs/interface-dms/constants";

const tableName = "playground_cell_accounts";

export type AccountPlan = "trial" | "team" | "business";
export type AccountKind = "company" | "school" | "nonprofit";
export type InvoiceState = "paid" | "open" | "uncollectible";

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const SIGNUP_DAYS = 14;

interface AccountSeed {
  name: string;
  plan: AccountPlan;
  kind: AccountKind;
  country: string;
  seats: number;
  isPartner?: boolean;
  isOwnerAccount?: boolean;
  issuedBy?: string;
  renewsInDays?: number;
  suspended?: boolean;
  invoiceState: InvoiceState;
  sso: boolean;
  online: boolean;
  lastSeenMinutesAgo?: number;
  lastSeenBy?: string;
  trialEndsInDays?: number;
  p95Ms: number;
  uptimeS: number;
  lastError?: string;
  brandColor: string;
  tags: string[];
  teams: string[];
}

const ACCOUNTS: AccountSeed[] = [
  {
    name: "Acme Corp",
    plan: "business",
    kind: "company",
    country: "US",
    seats: 120,
    isPartner: true,
    isOwnerAccount: true,
    issuedBy: "Camille Martin",
    renewsInDays: 21,
    invoiceState: "paid",
    sso: true,
    online: true,
    lastSeenMinutesAgo: 2,
    lastSeenBy: "Camille",
    p95Ms: 182,
    uptimeS: 2_592_000,
    brandColor: "#e11d48",
    tags: ["enterprise", "priority"],
    teams: ["Core", "Billing"],
  },
  {
    name: "Globex",
    plan: "team",
    kind: "company",
    country: "GB",
    seats: 18,
    renewsInDays: 3,
    suspended: true,
    invoiceState: "uncollectible",
    sso: false,
    online: false,
    lastSeenMinutesAgo: 60 * 26,
    lastSeenBy: "Hank",
    p95Ms: 1_240,
    uptimeS: 86_400,
    lastError: "Card declined (insufficient funds)",
    brandColor: "#2563eb",
    tags: ["dunning"],
    teams: ["Sales"],
  },
  {
    name: "Initech",
    plan: "trial",
    kind: "company",
    country: "FR",
    seats: 4,
    trialEndsInDays: 2,
    invoiceState: "open",
    sso: false,
    online: true,
    lastSeenMinutesAgo: 1,
    lastSeenBy: "Peter",
    p95Ms: 340,
    uptimeS: 7_200,
    brandColor: "#16a34a",
    tags: [],
    teams: [],
  },
  {
    name: "Hooli School",
    plan: "team",
    kind: "school",
    country: "DE",
    seats: 60,
    issuedBy: "Jules Bernard",
    renewsInDays: 140,
    invoiceState: "paid",
    sso: true,
    online: false,
    p95Ms: 95,
    uptimeS: 1_209_600,
    brandColor: "#9333ea",
    tags: ["education"],
    teams: ["Support"],
  },
  {
    name: "Open Paws",
    plan: "trial",
    kind: "nonprofit",
    country: "CA",
    seats: 3,
    isPartner: true,
    trialEndsInDays: -5,
    invoiceState: "open",
    sso: false,
    online: false,
    lastSeenMinutesAgo: 60 * 24 * 9,
    p95Ms: 720,
    uptimeS: 0,
    lastError: "Webhook endpoint unreachable",
    brandColor: "#f59e0b",
    tags: ["nonprofit", "grant"],
    teams: ["Core"],
  },
  {
    name: "Umbrella",
    plan: "business",
    kind: "company",
    country: "JP",
    seats: 410,
    issuedBy: "Aiko Tanaka",
    renewsInDays: 45,
    invoiceState: "paid",
    sso: true,
    online: true,
    lastSeenMinutesAgo: 12,
    lastSeenBy: "Aiko",
    p95Ms: 260,
    uptimeS: 31_536_000,
    brandColor: "#0f172a",
    tags: ["enterprise"],
    teams: ["Core", "Security", "Billing"],
  },
];

function minutesAgo(now: number, minutes: number | undefined) {
  return minutes === undefined ? null : new Date(now - minutes * MINUTE_MS);
}

function inDays(now: number, days: number | undefined) {
  return days === undefined ? null : new Date(now + days * DAY_MS);
}

function signupsOf(seed: number): number[] {
  return Array.from({ length: SIGNUP_DAYS }, (_, day) =>
    Math.round(10 + 8 * Math.sin((seed + day) / 2) + ((seed * day) % 5)),
  );
}

function seedAccounts() {
  const now = Date.now();
  return ACCOUNTS.map((account, index) => ({
    ...account,
    _id: `account-${index + 1}`,
    avatar: `https://i.pravatar.cc/80?img=${index + 10}`,
    issuedBy: account.issuedBy ?? null,
    renewsAt: inDays(now, account.renewsInDays),
    trialEndsAt: inDays(now, account.trialEndsInDays),
    lastSeenAt: minutesAgo(now, account.lastSeenMinutesAgo),
    lastError: account.lastError ?? null,
    signups: signupsOf(index),
    createdAt: new Date(now),
    updatedAt: new Date(now),
  }));
}

@RegisterTable(tableName, CORE_SCHEMA_NAME)
@Fixture(seedAccounts)
export class CellAccount extends Table {
  @Field("string") declare _id: string;

  @Field("string") declare name: string;
  @Field("string") declare avatar: string;
  @Field("string") declare plan: AccountPlan;
  @Field("string") declare kind: AccountKind;
  @Field("string") declare country: string;
  @Field("number") declare seats: number;
  @Field("boolean") declare isPartner?: boolean;
  @Field("boolean") declare isOwnerAccount?: boolean;
  @Index() @Field("string") declare ownerId?: string;
  @Field("string") declare issuedBy: string | null;
  @Field("date") declare renewsAt: Date | null;
  @Field("boolean") declare suspended?: boolean;
  @Field("string") declare invoiceState: InvoiceState;
  @Field("boolean") declare sso: boolean;
  @Field("boolean") declare online: boolean;
  @Field("date") declare lastSeenAt: Date | null;
  @Field("string") declare lastSeenBy?: string;
  @Field("date") declare trialEndsAt: Date | null;
  @Field("number") declare p95Ms: number;
  @Field("number") declare uptimeS: number;
  @Field("string") declare lastError: string | null;
  @Field("string") declare brandColor: string;
  @Field(["string"]) declare tags: string[];
  @Field(["string"]) declare teams: string[];
  @Field(["number"]) declare signups: number[];

  @Index() @Field("date") declare createdAt: Date;
  @Index() @Field("date") declare updatedAt: Date;
}

export class CellAccountModel extends BasicDataModel(CellAccount, tableName) {}
