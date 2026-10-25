import type {
  AgendaCalendar,
  AgendaFieldOption,
  AgendaResource,
  AgendaResourceGroup,
  AgendaSlot,
} from "@antelopejs/interface-dms/base/full-agenda-types";

/** The quarter days a task is planned in. */
export const PLANNING_SLOTS: AgendaSlot[] = [
  { id: "S1", label: "S1", start: "08:00", end: "10:00" },
  { id: "S2", label: "S2", start: "10:00", end: "12:00" },
  { id: "S3", label: "S3", start: "13:00", end: "15:00" },
  { id: "S4", label: "S4", start: "15:00", end: "17:00" },
];

/** What a task's status is: a calendar of the legend. */
export type TaskStatus =
  | "en-planning"
  | "termine"
  | "stand-by"
  | "hors-planning"
  | "annule";

/** The statuses, with the prototype's colours. */
export const PLANNING_CALENDARS: AgendaCalendar[] = [
  { id: "en-planning", label: "En planning", color: "#2D5BE3" },
  { id: "termine", label: "Terminé", color: "#1A7A4A", editable: false },
  { id: "stand-by", label: "Stand by", color: "#C02020" },
  { id: "hors-planning", label: "Hors planning", color: "#C25A0A" },
  { id: "annule", label: "Annulé", color: "#8A8F98", editable: false },
];

/** The statuses frozen out of the automatic planning (pinned). */
export const FROZEN_STATUSES = new Set<string>([
  "termine",
  "stand-by",
  "annule",
]);

export const STATUS_OPTIONS: AgendaFieldOption[] = [
  { value: "en-planning", label: "En planning", tone: "primary" },
  { value: "termine", label: "Terminé", tone: "success" },
  { value: "stand-by", label: "Stand by", tone: "error" },
  { value: "hors-planning", label: "Hors planning", tone: "warning" },
  { value: "annule", label: "Annulé", tone: "neutral" },
];

/** A type of task: who does it. */
export type TaskType =
  | "Dessin"
  | "Redessin"
  | "Devis"
  | "Promesse"
  | "Formulaire"
  | "Transport"
  | "Validation";

export const TASK_TYPE_OPTIONS: AgendaFieldOption[] = [
  "Dessin",
  "Redessin",
  "Devis",
  "Promesse",
  "Formulaire",
  "Transport",
  "Validation",
].map((value) => ({ value, label: value }));

export const PLANNING_GROUPS: AgendaResourceGroup[] = [
  { id: "architectes", label: "Architectes", description: "Formulaires" },
  { id: "dessinateurs", label: "Dessinateurs", description: "Dessins" },
  { id: "deviseurs", label: "Deviseurs", description: "Devis" },
  { id: "coordinateurs", label: "Coordinateurs", description: "Validations" },
  { id: "commerciaux", label: "Commerciaux", description: "Promesses" },
  { id: "transport", label: "Transport", description: "Remises de plans" },
];

/** A person of the referential: code, name, zone. */
type Person = [string, string, string];

const PEOPLE: Record<string, Person[]> = {
  architectes: [
    ["STMU", "Muriel St.", "Tournai"],
    ["BEG", "Gérald Be.", "Namur"],
    ["BRHE", "Hélène Br.", "Charleroi"],
    ["LIP", "Pierre Li.", "Arlon"],
    ["DEMA", "Martin De.", "Hout si Plout"],
    ["FRFR", "Frédéric Fr.", "Bruxelles"],
    ["BLKE", "Kévin Bl.", "Nivelles"],
    ["NAAR", "Arthur Na.", "Ath"],
    ["ARFR", "François Ar.", "Liège"],
    ["HEPA", "Pauline He.", "Bastogne"],
  ],
  dessinateurs: [
    ["QVERS", "QVerschelden", "Our"],
    ["ACAR", "ACarré", "Our"],
    ["JGOB", "JCGobbe", "Our"],
  ],
  deviseurs: [
    ["FROB", "FRoberty", "Our"],
    ["RVIL", "RVillers", "Our"],
    ["RLEC", "RLecocq", "Our"],
  ],
  coordinateurs: [
    ["QVERS-Coord", "Quentin V.", "Our"],
    ["TOLO", "Torrekens L.", "Our"],
  ],
  commerciaux: [
    ["ALBERT", "Bernard Alberty", "Wierde"],
    ["LOYA", "Fabrice Loayerts", "Bierges"],
    ["LEJ", "Thomas Lejeune", "Wierde"],
  ],
  transport: [
    ["CHAUF1", "Chauffeur 1", "Our"],
    ["CHAUF2", "Chauffeur 2", "Our"],
  ],
};

export const PLANNING_RESOURCES: AgendaResource[] = Object.entries(
  PEOPLE,
).flatMap(([group, people]) =>
  people.map(([id, label, zone]) => ({
    id,
    label,
    description: `Zone : ${zone}`,
    group,
  })),
);

/** The resources of one group, by id. */
export function groupMembers(group: string): string[] {
  return (PEOPLE[group] ?? []).map(([id]) => id);
}

/** The group a resource belongs to. */
export function groupOf(resourceId: string): string | undefined {
  return PLANNING_RESOURCES.find((resource) => resource.id === resourceId)
    ?.group;
}

/** The name of a resource. */
export function resourceName(resourceId: string): string {
  const label = PLANNING_RESOURCES.find(
    (resource) => resource.id === resourceId,
  )?.label;
  return typeof label === "string" ? label : resourceId;
}

/**
 * The group a type of task goes to; a task given to someone of another
 * group is delegated. Validations and promesses may go to anyone.
 */
export const TASK_GROUPS: Record<TaskType, string> = {
  Dessin: "dessinateurs",
  Redessin: "dessinateurs",
  Devis: "deviseurs",
  Promesse: "commerciaux",
  Formulaire: "architectes",
  Transport: "transport",
  Validation: "coordinateurs",
};

/** The types of task only their own group may take. */
export const RESTRICTED_TYPES = new Set<string>([
  "Dessin",
  "Redessin",
  "Devis",
  "Transport",
]);
