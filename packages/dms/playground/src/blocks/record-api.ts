import { Controller, Get, Parameter } from "@antelopejs/interface-api";
import type { ActivityFeedItem } from "@antelopejs/interface-dms/base/activity-feed";
import type { BannerContent } from "@antelopejs/interface-dms/base/banner";
import type { KeyValueListItem } from "@antelopejs/interface-dms/base/key-value-list";
import type { StatGroupItem } from "@antelopejs/interface-dms/base/stat-group";
import { notFound } from "./demo-errors";

const DEMO_LATENCY_MS = 500;

/** A customer of the route tokens demo, read through `{{params.id}}`. */
export interface DemoCustomer {
  id: string;
  name: string;
  plan: string;
  orders: number;
  invoices: number;
  overdue: number;
}

export const DEMO_CUSTOMERS: DemoCustomer[] = [
  {
    id: "c1",
    name: "Acme Logistics SA",
    plan: "Business",
    orders: 128,
    invoices: 24,
    overdue: 0,
  },
  {
    id: "c2",
    name: "Globex Industries",
    plan: "Starter",
    orders: 37,
    invoices: 9,
    overdue: 3,
  },
];

interface DemoOrder {
  number: string;
  customer: string;
  status: string;
  total: string;
}

const ORDERS: DemoOrder[] = [
  {
    number: "#10481",
    customer: "Acme Logistics SA",
    status: "paid",
    total: "€860.50",
  },
  {
    number: "#10482",
    customer: "Globex Industries",
    status: "open",
    total: "€129.00",
  },
  {
    number: "#10483",
    customer: "Acme Logistics SA",
    status: "open",
    total: "€2,410.00",
  },
  {
    number: "#10484",
    customer: "Globex Industries",
    status: "refunded",
    total: "€49.90",
  },
  {
    number: "#10485",
    customer: "Acme Logistics SA",
    status: "paid",
    total: "€318.20",
  },
];

const ORDER_TONES: Record<string, ActivityFeedItem["tone"]> = {
  paid: "success",
  open: "warning",
  refunded: "neutral",
};

function later<T>(value: T): Promise<T> {
  return new Promise((resolve) =>
    setTimeout(() => resolve(value), DEMO_LATENCY_MS),
  );
}

async function customerOrNotFound(id: string): Promise<DemoCustomer> {
  const customer = DEMO_CUSTOMERS.find((entry) => entry.id === id);
  if (customer) return customer;
  await later(null);
  throw notFound(`No customer has the id ${id}.`, {
    title: "Unknown customer",
    icon: "i-ph-user-circle-minus",
    actions: [{ label: "All customers", to: "/blocks/blocks-record" }],
  });
}

function customerFacts(customer: DemoCustomer): KeyValueListItem[] {
  return [
    { label: "Id", value: customer.id, type: "mono", copy: true },
    { label: "Name", value: customer.name },
    { label: "Plan", value: customer.plan },
  ];
}

function customerStats(customer: DemoCustomer): StatGroupItem[] {
  return [
    { icon: "i-ph-shopping-bag", eyebrow: "Orders", value: customer.orders },
    { icon: "i-ph-receipt", eyebrow: "Invoices", value: customer.invoices },
    {
      icon: "i-ph-warning-octagon",
      tone: customer.overdue ? "error" : "success",
      eyebrow: "Overdue",
      value: customer.overdue,
    },
  ];
}

function customerStatus(customer: DemoCustomer): BannerContent {
  if (!customer.overdue) return {};
  return {
    tone: "warning",
    title: `${customer.overdue} invoices overdue`,
    description: `${customer.name} has not paid since Aug 14.`,
    actions: [{ label: "Send a reminder", to: "#remind" }],
  };
}

function orderEntry(order: DemoOrder): ActivityFeedItem {
  return {
    id: order.number,
    icon: "i-ph-shopping-bag",
    tone: ORDER_TONES[order.status],
    title: `Order ${order.number} · ${order.total}`,
    meta: [order.customer, order.status],
  };
}

/** A customer read from the `:id` of the page URL. */
export class BlocksCustomersApiController extends Controller(
  "/api/blocks/customers",
) {
  @Get(":id")
  async getCustomer(@Parameter("id", "param") id: string) {
    return later({ items: customerFacts(await customerOrNotFound(id)) });
  }

  @Get(":id/stats")
  async getStats(@Parameter("id", "param") id: string) {
    return later({ items: customerStats(await customerOrNotFound(id)) });
  }

  @Get(":id/status")
  async getStatus(@Parameter("id", "param") id: string) {
    return later(customerStatus(await customerOrNotFound(id)));
  }

  @Get(":id/counts")
  async getCounts(@Parameter("id", "param") id: string) {
    const customer = await customerOrNotFound(id);
    return { orders: customer.orders, invoices: customer.invoices };
  }
}

/** Orders filtered by the `?status=` of the page URL. */
export class BlocksOrdersApiController extends Controller(
  "/api/blocks/orders",
) {
  @Get("")
  getOrders(@Parameter("status", "query") status?: string) {
    const orders = ORDERS.filter((order) => order.status === status);
    return later({ items: orders.map(orderEntry) });
  }
}
