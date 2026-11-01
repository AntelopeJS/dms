/**
 * Helio, the solar installer of the `template-dms-demo` template, as the
 * documentation examples show it: fixed rows, dated around this morning so
 * "2 days ago" reads true on any day.
 */

/** A JSON value a row field holds. */
export type FixtureValue =
  | string
  | number
  | boolean
  | null
  | FixtureValue[]
  | { [key: string]: FixtureValue };

/** One row of a dataset: its id, then plain JSON fields. */
export type FixtureRow = { _id: string } & { [key: string]: FixtureValue };

const TECHNICIANS = [
  "Thomas Renard",
  "Camille Dubois",
  "Nicolas Martens",
  "Julien Peeters",
  "Mehdi Benali",
  "Kevin Wouters",
] as const;

const CUSTOMERS = [
  "Boulangerie Lejeune SRL",
  "Ferme du Try-Bara",
  "Garage Delvaux SA",
  "Brasserie de l'Ourthe SRL",
  "Clinique vétérinaire des Fagnes",
  "Transports Gilson & Fils SA",
  "ACP Résidence Les Tilleuls",
  "Menuiserie Lambotte SRL",
  "Famille Dumont",
  "Famille Jacquet",
  "Famille Hendrickx",
] as const;

const CITIES = [
  "Liège",
  "Herstal",
  "Seraing",
  "Ans",
  "Flémalle",
  "Chaudfontaine",
  "Verviers",
  "Huy",
] as const;

const PROJECT_TYPES = [
  "residential_pv",
  "commercial_pv",
  "battery",
  "ev_charger",
] as const;

const PROJECT_STATUSES = [
  "planned",
  "scheduled",
  "in_progress",
  "inspection",
  "done",
  "on_hold",
] as const;

const PROJECT_COUNT = 32;
const DAY_MS = 86_400_000;
const MORNING_HOUR_UTC = 8;

/** 08:00 UTC today: the rows move with the day, and stay the same within it. */
function helioNow(): number {
  const now = new Date();
  return Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    MORNING_HOUR_UTC,
  );
}

const pick = <T>(list: readonly T[], index: number): T =>
  list[index % list.length]!;

const isoDay = (offsetDays: number): string =>
  new Date(helioNow() + offsetDays * DAY_MS).toISOString();

/** Peak power of a site with panels, in kWp; a battery or a charger has none. */
function capacityOf(type: string, index: number): number | null {
  if (type === "residential_pv") return 4 + (index % 6) * 1.2;
  if (type === "commercial_pv") return 24 + (index % 5) * 18;
  return null;
}

/** Installation projects, `CH-0101` onwards: the Projects page of Helio. */
export function helioProjects(): FixtureRow[] {
  return Array.from({ length: PROJECT_COUNT }, (_, index) => {
    const type = pick(PROJECT_TYPES, index * 3 + (index >> 2));
    const capacityKwp = capacityOf(type, index);
    return {
      _id: `project-${String(index + 1).padStart(2, "0")}`,
      code: `CH-${String(101 + index).padStart(4, "0")}`,
      name: `${pick(CUSTOMERS, index)}, ${pick(CITIES, index * 5)}`,
      customer: pick(CUSTOMERS, index),
      city: pick(CITIES, index * 5),
      type,
      status: pick(PROJECT_STATUSES, index * 7 + (index >> 3)),
      leadTechnician: pick(TECHNICIANS, index * 5 + 1),
      plannedStart: isoDay((index % 9) - 6 - (index >> 2) * 3),
      capacityKwp:
        capacityKwp === null ? null : Math.round(capacityKwp * 10) / 10,
      budget: 6_400 + ((index * 3_710) % 58_000),
      position: (index + 1) * 1000,
    };
  });
}

const TASK_TITLES = [
  "Site survey and roof measurements",
  "Grid connection request to ORES",
  "Order panels and inverter",
  "Mount rails and panels",
  "Wire the inverter and battery",
  "AREI inspection",
  "Commissioning and customer handover",
] as const;

/** The tasks of project `CH-0104`, ordered by hand on `position`. */
export function helioProjectTasks(): FixtureRow[] {
  return TASK_TITLES.map((title, index) => ({
    _id: `task-${index + 1}`,
    title,
    status: index < 3 ? "done" : index === 3 ? "doing" : "todo",
    assignee: pick(TECHNICIANS, index + 2),
    dueDate: isoDay(index * 4 - 10),
    estimateHours: [3, 1, 2, 16, 8, 2, 3][index]!,
    position: (index + 1) * 1000,
  }));
}

const EVENT_KINDS = [
  { event: "Production report", level: "info" },
  { event: "Production report", level: "info" },
  { event: "Inverter restarted", level: "info" },
  { event: "Low irradiance", level: "warning" },
  { event: "Production report", level: "info" },
  { event: "String voltage out of range", level: "warning" },
  { event: "Inverter offline", level: "error" },
  { event: "Grid frequency fault", level: "error" },
] as const;

const EVENT_COUNT = 120;

/**
 * Events the inverter monitoring API reported, newest first: what a module
 * lists with a source table, without a data controller.
 */
export function helioMonitoringEvents(): FixtureRow[] {
  return Array.from({ length: EVENT_COUNT }, (_, index) => {
    const kind = pick(EVENT_KINDS, index * 3 + (index >> 4));
    return {
      _id: `event-${String(index + 1).padStart(3, "0")}`,
      at: new Date(helioNow() - index * 17 * 60_000).toISOString(),
      site: `CH-${String(101 + ((index * 7) % PROJECT_COUNT)).padStart(4, "0")}`,
      inverter: `SE${String(70_100 + ((index * 13) % 40))}`,
      event: kind.event,
      level: kind.level,
      outputKw:
        kind.level === "error"
          ? 0
          : Math.round((2 + ((index * 37) % 90) / 10) * 10) / 10,
      latencyMs: 40 + ((index * 53) % 900),
    };
  });
}

/** Where each customer account is based, and the address Helio writes to. */
const ACCOUNTS = [
  { city: "Liège", country: "BE", email: "contact@boulangerie-lejeune.be" },
  { city: "Theux", country: "BE", email: "info@try-bara.be" },
  { city: "Seraing", country: "BE", email: "atelier@garage-delvaux.be" },
  {
    city: "Esch-sur-Alzette",
    country: "LU",
    email: "bonjour@brasserie-ourthe.lu",
  },
  { city: "Maastricht", country: "NL", email: "praktijk@fagnes-dierenarts.nl" },
  { city: "Herstal", country: "BE", email: "planning@gilson-transports.be" },
  { city: "Lille", country: "FR", email: "syndic@residence-tilleuls.fr" },
  { city: "Aachen", country: "DE", email: "werkstatt@lambotte.de" },
] as const;
const SEGMENTS = [
  ["Residential"],
  ["Commercial", "Battery"],
  ["Commercial"],
  ["Residential", "EV charger"],
  ["Agricultural"],
  ["Commercial", "EV charger"],
  ["Co-ownership"],
  ["Residential", "Battery"],
] as const;
const BRAND_COLORS = [
  "#f59e0b",
  "#10b981",
  "#3b82f6",
  "#ef4444",
  "#8b5cf6",
  "#14b8a6",
  "#f97316",
  "#64748b",
] as const;
const ACCOUNT_STATUSES = [
  "active",
  "active",
  "onboarding",
  "active",
  "paused",
] as const;

/** Helio's customer accounts, with what their monitored sites produced. */
export function helioCustomers(): FixtureRow[] {
  return CUSTOMERS.slice(0, ACCOUNTS.length).map((name, index) => {
    const account = ACCOUNTS[index]!;
    return {
      _id: `customer-${index + 1}`,
      name,
      email: account.email,
      city: account.city,
      country: account.country,
      status: pick(ACCOUNT_STATUSES, index),
      signedAt: isoDay(-40 - index * 23),
      lifetimeRevenue: 7_900 + index * 6_350,
      sites: 1 + (index % 4),
      segments: [...SEGMENTS[index]!],
      brandColor: BRAND_COLORS[index]!,
      monthlyKwh: Array.from({ length: 12 }, (_, month) =>
        Math.round(
          (120 + index * 40) *
            (0.35 + Math.sin(((month + 1) / 12) * Math.PI) * 0.9),
        ),
      ),
    };
  });
}

/** The account form's record: a business customer of Helio. */
export function helioCustomerRecord(): FixtureRow {
  return {
    _id: "customer-1",
    name: "Boulangerie Lejeune SRL",
    email: "contact@boulangerie-lejeune.be",
    phone: "+32 4 223 18 40",
    vatNumber: "BE0712345678",
    segment: "commercial",
    newsletter: true,
  };
}

/** Helio's monitoring settings: the record of the sectioned form examples. */
export function helioMonitoringSettings(): FixtureRow {
  return {
    _id: "helio",
    alertEmail: "monitoring@helio.be",
    lowOutputPercent: 20,
    offlineAfterMinutes: 30,
    retentionDays: 90,
    weeklyReport: true,
    reportDay: "monday",
    billingEmail: "facturation@helio.be",
  };
}

/** The addresses already in Helio's workspace, which an invitation skips. */
export const HELIO_MEMBER_EMAILS: readonly string[] = [
  "sophie.lambert@helio.be",
  "thomas.renard@helio.be",
  "camille.dubois@helio.be",
];

const PRODUCTION_KWH = [1840, 2210, 1975, 2460, 2380, 1620, 2590] as const;

/**
 * Fixed answers of the read-only routes the chart cards, guards and lists
 * of the examples call, keyed by their path under `/docs-fixtures/`.
 */
export const HELIO_DOCUMENTS = new Map<string, FixtureValue>([
  [
    "production",
    {
      value: PRODUCTION_KWH.reduce((total, kwh) => total + kwh, 0),
      delta: 8.6,
      series: [
        {
          name: "Production (kWh)",
          data: PRODUCTION_KWH.map((kwh, index) => ({
            x: isoDay(index - 7),
            y: kwh,
          })),
        },
      ],
    },
  ],
  [
    "projects-by-type",
    {
      value: 32,
      series: [
        {
          name: "Projects",
          data: [
            { x: "residential_pv", label: "Residential solar", y: 14 },
            { x: "commercial_pv", label: "Commercial solar", y: 8 },
            { x: "battery", label: "Home battery", y: 6 },
            { x: "ev_charger", label: "EV charger", y: 4 },
          ],
        },
      ],
    },
  ],
  ["customer", { id: "customer-3", name: "Garage Delvaux SA" }],
  [
    "customer/facts",
    {
      items: [
        { label: "Customer", value: "Garage Delvaux SA" },
        { label: "VAT number", value: "BE0476123987", type: "mono" },
        { label: "Status", value: "Active", type: "status", tone: "success" },
      ],
    },
  ],
  ["alerts", []],
]);
