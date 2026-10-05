import {
  BasicDataModel,
  Field,
  Fixture,
  Index,
  RegisterTable,
  Table,
} from "@antelopejs/interface-database-decorators";
import { CORE_SCHEMA_NAME } from "@antelopejs/interface-dms/constants";
import type { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";

const tableName = "playground_orders";

/** A line of an order, shown in the expanded row's detail component. */
export interface OrderLine {
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;
}

export type OrderEventTone = "primary" | "success" | "warning" | "info";

/** A step of an order's timeline, shown next to its lines. */
export interface OrderEvent {
  icon: string;
  tone: OrderEventTone;
  title: string;
  at: Date;
}

export type OrderStatus = "pending" | "paid" | "shipped" | "refunded";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

interface OrderSeed {
  customer: string;
  email: string;
  status: OrderStatus;
  payment: "card" | "transfer" | "invoice";
  carrier: string;
  address: DefaultDataTypes.Address;
  lines: OrderLine[];
}

const SEEDS: OrderSeed[] = [
  {
    customer: "Northwind Traders",
    email: "ops@northwind.io",
    status: "pending",
    payment: "transfer",
    carrier: "DHL Express · next day",
    address: {
      streetName: "Rue de la Loi",
      houseNumber: "16",
      postalCode: "1000",
      city: "Brussels",
      countryCode: "BE",
    },
    lines: [
      { sku: "CHR-OAK-02", name: "Oak chair", quantity: 12, unitPrice: 189 },
      {
        sku: "TBL-OAK-01",
        name: "Oak table 220 cm",
        quantity: 2,
        unitPrice: 1290,
      },
    ],
  },
  {
    customer: "Globex Logistics",
    email: "billing@globex.com",
    status: "paid",
    payment: "card",
    carrier: "bpost · 3–5 days",
    address: {
      streetName: "Meir",
      houseNumber: "50",
      postalCode: "2000",
      city: "Antwerp",
      countryCode: "BE",
    },
    lines: [
      {
        sku: "LMP-BRS-04",
        name: "Brass desk lamp",
        quantity: 20,
        unitPrice: 89,
      },
      {
        sku: "CBL-USB-10",
        name: "USB-C cable 2 m",
        quantity: 40,
        unitPrice: 12.5,
      },
    ],
  },
  {
    customer: "Initech SARL",
    email: "achats@initech.fr",
    status: "shipped",
    payment: "invoice",
    carrier: "Colissimo · 2–3 days",
    address: {
      streetName: "Rue de la République",
      houseNumber: "8",
      postalCode: "69002",
      city: "Lyon",
      countryCode: "FR",
    },
    lines: [
      { sku: "MON-27-4K", name: '27" 4K monitor', quantity: 3, unitPrice: 349 },
    ],
  },
  {
    customer: "Umbrella Health",
    email: "orders@umbrella.co",
    status: "refunded",
    payment: "card",
    carrier: "bpost · 3–5 days",
    address: {
      streetName: "Korenmarkt",
      houseNumber: "3",
      postalCode: "9000",
      city: "Ghent",
      countryCode: "BE",
    },
    lines: [
      {
        sku: "KBD-MX-01",
        name: "Mechanical keyboard",
        quantity: 5,
        unitPrice: 129,
      },
      { sku: "MSE-WL-02", name: "Wireless mouse", quantity: 5, unitPrice: 49 },
    ],
  },
  {
    customer: "Stark Fabrication",
    email: "procurement@stark.io",
    status: "paid",
    payment: "invoice",
    carrier: "DHL Express · next day",
    address: {
      streetName: "Place Saint-Lambert",
      houseNumber: "1",
      postalCode: "4000",
      city: "Liège",
      countryCode: "BE",
    },
    lines: [
      { sku: "DSK-STD-01", name: "Standing desk", quantity: 8, unitPrice: 640 },
    ],
  },
  {
    customer: "Wayne Foods",
    email: "ap@wayne.com",
    status: "shipped",
    payment: "transfer",
    carrier: "bpost · 3–5 days",
    address: {
      streetName: "Rue de Fer",
      houseNumber: "22",
      postalCode: "5000",
      city: "Namur",
      countryCode: "BE",
    },
    lines: [
      {
        sku: "CHR-MSH-03",
        name: "Mesh office chair",
        quantity: 15,
        unitPrice: 245,
      },
      { sku: "FTR-ALU-01", name: "Footrest", quantity: 15, unitPrice: 39 },
    ],
  },
  {
    customer: "Soylent Market",
    email: "buying@soylent.eu",
    status: "pending",
    payment: "card",
    carrier: "PostNL · 2 days",
    address: {
      streetName: "Damrak",
      houseNumber: "70",
      postalCode: "1012",
      city: "Amsterdam",
      countryCode: "NL",
    },
    lines: [
      {
        sku: "SHF-WAL-05",
        name: "Wall shelf 120 cm",
        quantity: 10,
        unitPrice: 75,
      },
      { sku: "BRK-STL-05", name: "Steel bracket", quantity: 20, unitPrice: 6 },
      { sku: "SCR-PK-100", name: "Screw pack ×100", quantity: 4, unitPrice: 9 },
    ],
  },
  {
    customer: "Hooli Labs",
    email: "it@hooli.dev",
    status: "paid",
    payment: "card",
    carrier: "DHL Express · next day",
    address: {
      streetName: "Avenue Louise",
      houseNumber: "231",
      postalCode: "1050",
      city: "Brussels",
      countryCode: "BE",
    },
    lines: [
      {
        sku: "LTP-14-PRO",
        name: "Laptop 14” Pro",
        quantity: 4,
        unitPrice: 1890,
      },
      { sku: "DCK-USB-C", name: "USB-C dock", quantity: 4, unitPrice: 219 },
    ],
  },
];

function eventsOf(seed: OrderSeed, number: string, placedAt: Date) {
  const at = (offsetHours: number) =>
    new Date(placedAt.getTime() + offsetHours * HOUR_MS);
  const events: OrderEvent[] = [
    {
      icon: "i-ph-shopping-cart",
      tone: "primary",
      title: `Order ${number} placed`,
      at: placedAt,
    },
  ];
  if (seed.status === "pending") {
    events.push({
      icon: "i-ph-clock",
      tone: "warning",
      title: "Awaiting payment",
      at: at(0.1),
    });
    return events;
  }
  events.push({
    icon: "i-ph-credit-card",
    tone: "success",
    title: "Payment captured",
    at: at(0.1),
  });
  if (seed.status === "shipped") {
    events.push({
      icon: "i-ph-truck",
      tone: "info",
      title: "Handed to the carrier",
      at: at(7),
    });
  }
  if (seed.status === "refunded") {
    events.push({
      icon: "i-ph-arrow-u-up-left",
      tone: "info",
      title: "Refunded in full",
      at: at(30),
    });
  }
  return events;
}

const FIRST_ORDER_NUMBER = 10482;

function seedOrders() {
  const now = Date.now();
  return SEEDS.map((seed, index) => {
    const number = `#${FIRST_ORDER_NUMBER - index}`;
    const placedAt = new Date(now - (index + 1) * DAY_MS);
    const total = seed.lines.reduce(
      (sum, line) => sum + line.quantity * line.unitPrice,
      0,
    );
    return {
      _id: `order-${index + 1}`,
      number,
      customer: seed.customer,
      email: seed.email,
      status: seed.status,
      payment: seed.payment,
      carrier: seed.carrier,
      shippingAddress: seed.address,
      itemCount: seed.lines.reduce((sum, line) => sum + line.quantity, 0),
      total,
      lines: seed.lines,
      events: eventsOf(seed, number, placedAt),
      placedAt,
      createdAt: placedAt,
      updatedAt: placedAt,
    };
  });
}

@RegisterTable(tableName, CORE_SCHEMA_NAME)
@Fixture(seedOrders)
export class Order extends Table {
  @Field("string") declare _id: string;

  @Field("string") declare number: string;
  @Field("string") declare customer: string;
  @Field("string") declare email: string;
  @Index() @Field("string") declare status: OrderStatus;
  @Field("string") declare payment: string;
  @Field("string") declare carrier: string;
  @Field("any") declare shippingAddress?: DefaultDataTypes.Address;
  @Field("number") declare itemCount: number;
  @Field("number") declare total: number;
  @Field(["any"]) declare lines?: OrderLine[];
  @Field(["any"]) declare events?: OrderEvent[];

  @Index() @Field("date") declare placedAt: Date;
  @Index() @Field("date") declare createdAt: Date;
  @Index() @Field("date") declare updatedAt: Date;
}

export class OrderModel extends BasicDataModel(Order, tableName) {}
