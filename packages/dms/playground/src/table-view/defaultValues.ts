import type { Task, User } from "./database";
import { SAMPLE_ADDRESSES } from "./sample-addresses";
import { RANDOM_NAMES } from "./random-names";
import { RANDOM_TASK_NAMES } from "./random-task-names";
import { RANDOM_DESCRIPTIONS } from "./random-descriptions";

type SampleAddress = (typeof SAMPLE_ADDRESSES)[number];

type TaskStatus = "pending" | "in_progress" | "completed" | "cancelled";
type TaskPriority = "low" | "medium" | "high";

type RandomDates = {
  dueDate: Date;
  createdDate: Date;
  updatedDate: Date;
};

type RandomAddress = SampleAddress & {
  addressLine2?: string;
  boxNumber?: string;
};

const TASK_STATUSES: readonly TaskStatus[] = [
  "pending",
  "in_progress",
  "completed",
  "cancelled",
];

const TASK_PRIORITIES: readonly TaskPriority[] = ["low", "medium", "high"];

const generateEmailFromName = (name: string): string => {
  return `${name
    .toLowerCase()
    .replace(/\s+/g, ".")
    .replace(/[^a-z0-9.]/g, "")}@example.com`;
};

const FIXTURE_SEED = 0x5eed;
const UINT32_RANGE = 2 ** 32;
let randomState = FIXTURE_SEED;

function seededRandom(): number {
  randomState = (randomState + 0x6d2b79f5) | 0;
  let mixed = Math.imul(randomState ^ (randomState >>> 15), 1 | randomState);
  mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed);
  return ((mixed ^ (mixed >>> 14)) >>> 0) / UINT32_RANGE;
}

const pickRandom = <T>(arr: readonly T[]): T => {
  return arr[Math.floor(seededRandom() * arr.length)];
};

const buildRandomDates = (): RandomDates => {
  const dueDays = Math.floor(seededRandom() * 30);
  const createdDays = Math.floor(seededRandom() * 90);
  const updatedDays = Math.floor(seededRandom() * (90 - createdDays));
  const createdDate = new Date(Date.now() - createdDays * 86400000);
  return {
    dueDate: new Date(Date.now() + dueDays * 86400000),
    createdDate,
    updatedDate: new Date(createdDate.getTime() + updatedDays * 86400000),
  };
};

const buildRandomAddress = (): RandomAddress | undefined => {
  const hasAddress = seededRandom() < 0.7;
  if (!hasAddress) return undefined;
  const base = pickRandom(SAMPLE_ADDRESSES);
  const includeOptional = seededRandom() < 0.3;
  return {
    ...base,
    ...(includeOptional && {
      addressLine2: `Suite ${Math.floor(seededRandom() * 500) + 1}`,
    }),
  };
};

const ARCHIVED_TASK_INTERVAL = 30;

const buildRandomTask = (i: number): Partial<Task> => {
  const ownerName = pickRandom(RANDOM_NAMES);
  const taskName = pickRandom(RANDOM_TASK_NAMES);
  const dates = buildRandomDates();
  return {
    _id: i.toString(),
    name: taskName,
    owner: ownerName,
    email: generateEmailFromName(ownerName),
    status: pickRandom(TASK_STATUSES),
    priority: pickRandom(TASK_PRIORITIES),
    description: pickRandom(RANDOM_DESCRIPTIONS),
    due_date: dates.dueDate,
    assignees: pickRandomUser()._id,
    price: Math.floor(seededRandom() * 1000) + 1,
    completion_percentage: seededRandom(),
    url: `https://www.google.com/search?q=${taskName}`,
    phone: "+1-555-123-4567",
    done: false,
    address: buildRandomAddress(),
    isArchived: i % ARCHIVED_TASK_INTERVAL === 0,
    createdAt: dates.createdDate,
    updatedAt: dates.updatedDate,
  };
};

const generateRandomTasks = (count: number): Partial<Task>[] => {
  const tasks: Partial<Task>[] = [];
  for (let i = 16; i <= count + 15; i++) {
    tasks.push(buildRandomTask(i));
  }
  return tasks;
};

function pickRandomUser(): User {
  return defaultUsers[Math.floor(seededRandom() * defaultUsers.length)];
}

const USER_NAMES = [
  "Ada Lovelace",
  "Grace Hopper",
  "Alan Turing",
  "Katherine Johnson",
  "Linus Torvalds",
  "Margaret Hamilton",
  "Tim Berners-Lee",
  "Barbara Liskov",
  "Dennis Ritchie",
  "Hedy Lamarr",
  "Ken Thompson",
  "Frances Allen",
  "Guido van Rossum",
  "Radia Perlman",
  "Donald Knuth",
];
const USER_PHONE_PREFIX = "+1-555-123-";
const USER_PHONE_BASE = 4567;
const USER_AVATAR_URL = "https://i.pravatar.cc/150?u=";

function userSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z]+/g, ".");
}

export const defaultUsers: User[] = USER_NAMES.map((name, index) => {
  const slug = userSlug(name);
  return {
    _id: String(index + 1),
    name,
    email: `${slug}@example.com`,
    phone: `${USER_PHONE_PREFIX}${USER_PHONE_BASE + index}`,
    avatar: `${USER_AVATAR_URL}${slug}`,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
});

const COMPLETED_STATUS = "completed";
const FULL_COMPLETION = 1;

/** A completed task is done and fully complete; no other one is done. */
function withConsistentProgress(task: Partial<Task>): Partial<Task> {
  const completed = task.status === COMPLETED_STATUS;
  return {
    ...task,
    done: completed,
    completion_percentage: completed
      ? FULL_COMPLETION
      : task.completion_percentage,
  };
}

const fixtureTasks: Partial<Task>[] = [
  {
    _id: "1",
    name: "Task 1",
    owner: "John Doe",
    email: "john.doe@example.com",
    status: "pending",
    priority: "low",
    description: "Task 1 description",
    due_date: new Date(),
    assignees: pickRandomUser()._id,
    price: 100,
    completion_percentage: 0.15,
    url: "https://www.google.com/search?q=Task+1",
    done: false,
    phone: "+1-555-123-4582",
    address: {
      countryCode: "US",
      streetName: "Main Street",
      houseNumber: "123",
      addressLine2: "Suite 100",
      postalCode: "10001",
      city: "New York",
      countrySubdivision: "New York",
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    _id: "2",
    name: "Task 2",
    owner: "Jane Doe",
    email: "jane.doe@example.com",
    status: "in_progress",
    priority: "medium",
    description: "Task 2 description",
    due_date: new Date(Date.now() + 86400000),
    assignees: pickRandomUser()._id,
    price: 200,
    completion_percentage: 0.65,
    url: "https://www.google.com/search?q=Task+2",
    done: false,
    phone: "+1-555-123-4582",
    address: {
      countryCode: "GB",
      streetName: "Downing Street",
      houseNumber: "10",
      postalCode: "SW1A 2AA",
      city: "London",
      countrySubdivision: "England",
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    _id: "3",
    name: "Task 3",
    owner: "Alice Smith",
    email: "alice.smith@example.com",
    status: "completed",
    priority: "high",
    description: "Task 3 description",
    due_date: new Date(Date.now() + 2 * 86400000),
    assignees: pickRandomUser()._id,
    price: 300,
    completion_percentage: 1.0,
    url: "https://www.google.com/search?q=Task+3",
    done: false,
    phone: "+1-555-123-4582",
    address: {
      countryCode: "FR",
      streetName: "Avenue des Champs-Élysées",
      houseNumber: "1",
      postalCode: "75008",
      city: "Paris",
      countrySubdivision: "Île-de-France",
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    _id: "4",
    name: "Task 4",
    owner: "Bob Brown",
    email: "bob.brown@example.com",
    status: "cancelled",
    priority: "low",
    description: "Task 4 description",
    due_date: new Date(Date.now() + 3 * 86400000),
    assignees: pickRandomUser()._id,
    price: 400,
    completion_percentage: 0.25,
    url: "https://www.google.com/search?q=Task+4",
    done: false,
    phone: "+1-555-123-4582",
    address: {
      countryCode: "DE",
      streetName: "Brandenburger Tor",
      addressLine2: "Pariser Platz",
      postalCode: "10117",
      city: "Berlin",
      countrySubdivision: "Berlin",
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    _id: "5",
    name: "Task 5",
    owner: "Charlie Green",
    email: "charlie.green@example.com",
    status: "pending",
    priority: "medium",
    description: "Task 5 description",
    due_date: new Date(Date.now() + 4 * 86400000),
    assignees: pickRandomUser()._id,
    price: 500,
    completion_percentage: 0.0,
    url: "https://www.google.com/search?q=Task+5",
    done: false,
    phone: "+1-555-123-4582",
    address: {
      countryCode: "CA",
      streetName: "Wellington Street",
      houseNumber: "100",
      postalCode: "K1A 0A9",
      city: "Ottawa",
      countrySubdivision: "Ontario",
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    _id: "6",
    name: "Task 6",
    owner: "Diana Prince",
    email: "diana.prince@example.com",
    status: "in_progress",
    priority: "high",
    description: "Task 6 description",
    due_date: new Date(Date.now() + 5 * 86400000),
    assignees: pickRandomUser()._id,
    price: 600,
    completion_percentage: 0.85,
    url: "https://www.google.com/search?q=Task+6",
    done: false,
    phone: "+1-555-123-4582",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    _id: "7",
    name: "Task 7",
    owner: "Clark Kent",
    email: "clark.kent@example.com",
    status: "completed",
    priority: "medium",
    description: "Task 7 description",
    due_date: new Date(Date.now() + 6 * 86400000),
    assignees: pickRandomUser()._id,
    price: 700,
    completion_percentage: 1.0,
    url: "https://www.google.com/search?q=Task+7",
    done: false,
    phone: "+1-555-123-4582",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    _id: "8",
    name: "Task 8",
    owner: "Bruce Wayne",
    email: "bruce.wayne@example.com",
    status: "pending",
    priority: "low",
    description: "Task 8 description",
    due_date: new Date(Date.now() + 7 * 86400000),
    assignees: pickRandomUser()._id,
    price: 800,
    completion_percentage: 0.0,
    url: "https://www.google.com/search?q=Task+8",
    done: false,
    phone: "+1-555-123-4582",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    _id: "9",
    name: "Task 9",
    owner: "Selina Kyle",
    email: "selina.kyle@example.com",
    status: "cancelled",
    priority: "high",
    description: "Task 9 description",
    due_date: new Date(Date.now() + 8 * 86400000),
    assignees: pickRandomUser()._id,
    price: 900,
    completion_percentage: 0.45,
    url: "https://www.google.com/search?q=Task+9",
    done: false,
    phone: "+1-555-123-4582",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    _id: "10",
    name: "Task 10",
    owner: "Barry Allen",
    email: "barry.allen@example.com",
    status: "in_progress",
    priority: "medium",
    description: "Task 10 description",
    due_date: new Date(Date.now() + 9 * 86400000),
    assignees: pickRandomUser()._id,
    price: 1000,
    completion_percentage: 0.75,
    url: "https://www.google.com/search?q=Task+10",
    done: false,
    phone: "+1-555-123-4582",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    _id: "11",
    name: "Task 11",
    owner: "Iris West",
    email: "iris.west@example.com",
    status: "completed",
    priority: "low",
    description: "Task 11 description",
    due_date: new Date(Date.now() + 10 * 86400000),
    assignees: pickRandomUser()._id,
    price: 1100,
    completion_percentage: 1.0,
    url: "https://www.google.com/search?q=Task+11",
    done: false,
    phone: "+1-555-123-4582",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    _id: "12",
    name: "Task 12",
    owner: "Arthur Curry",
    email: "arthur.curry@example.com",
    status: "pending",
    priority: "high",
    description: "Task 12 description",
    due_date: new Date(Date.now() + 11 * 86400000),
    assignees: pickRandomUser()._id,
    price: 1200,
    completion_percentage: 0.05,
    url: "https://www.google.com/search?q=Task+12",
    done: false,
    phone: "+1-555-123-4582",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    _id: "13",
    name: "Task 13",
    owner: "Mera",
    email: "mera@example.com",
    status: "cancelled",
    priority: "medium",
    description: "Task 13 description",
    due_date: new Date(Date.now() + 12 * 86400000),
    assignees: pickRandomUser()._id,
    price: 1300,
    completion_percentage: 0.3,
    url: "https://www.google.com/search?q=Task+13",
    done: false,
    phone: "+1-555-123-4582",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    _id: "14",
    name: "Task 14",
    owner: "Victor Stone",
    email: "victor.stone@example.com",
    status: "in_progress",
    priority: "low",
    description: "Task 14 description",
    due_date: new Date(Date.now() + 13 * 86400000),
    assignees: pickRandomUser()._id,
    price: 1500,
    completion_percentage: 0.55,
    url: "https://www.google.com/search?q=Task+14",
    done: false,
    phone: "+1-555-123-4582",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    _id: "15",
    name: "Task 15",
    owner: "Silas Stone",
    email: "silas.stone@example.com",
    status: "completed",
    priority: "high",
    description: "Task 15 description",
    due_date: new Date(Date.now() + 14 * 86400000),
    assignees: pickRandomUser()._id,
    price: 1400,
    completion_percentage: 1.0,
    url: "https://www.google.com/search?q=Task+15",
    done: false,
    phone: "+1-555-123-4582",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  ...generateRandomTasks(300),
];

export const defaultTasks: Partial<Task>[] = fixtureTasks.map(
  withConsistentProgress,
);
