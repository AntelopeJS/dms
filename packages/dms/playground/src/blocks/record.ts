import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import {
  ActivityFeed,
  Banner,
  KeyValueList,
  NavCardGrid,
  StatGroup,
  Tab,
} from "@antelopejs/interface-dms/base";
import { blocksCategory } from "./category";
import { DEMO_CUSTOMERS } from "./record-api";

const CUSTOMERS_API = "/api/blocks/customers";
const CUSTOMER_PAGE = "/blocks/customers";
const UNKNOWN_CUSTOMER = "c404";

@RegisterPage()
export class PageBlocksRecord extends PageController("blocks-record", {
  displayName: "Route tokens",
  icon: "i-ph-brackets-curly",
  category: blocksCategory,
  order: 85,
  description:
    "Blocks whose fetchUrl names the page URL: {{params.id}} on a customer page, {{query.status}} below. Open a customer, or pick a status: nothing is requested while ?status= is unset.",
}) {
  static customers = NavCardGrid({
    title: "Customers",
    description:
      "Each card opens /blocks/customers/:id, whose blocks read {{params.id}}.",
    columns: 3,
    items: [
      ...DEMO_CUSTOMERS.map((customer) => ({
        id: customer.id,
        icon: "i-ph-buildings",
        title: customer.name,
        description: `${customer.plan} plan`,
        to: `${CUSTOMER_PAGE}/${customer.id}`,
        state: customer.overdue ? `${customer.overdue} overdue` : "Up to date",
        stateTone: customer.overdue
          ? ("warning" as const)
          : ("success" as const),
      })),
      {
        id: UNKNOWN_CUSTOMER,
        icon: "i-ph-question",
        title: "Unknown customer",
        description: "Its routes answer 404: the blocks say not found.",
        to: `${CUSTOMER_PAGE}/${UNKNOWN_CUSTOMER}`,
      },
    ],
  });

  static statusPicker = Banner({
    tone: "info",
    size: "sm",
    title: "Orders by ?status=",
    description:
      "The feed below reads /api/blocks/orders?status= with the value of the URL.",
    actions: [
      { label: "Paid", to: "/blocks/blocks-record?status=paid" },
      { label: "Open", to: "/blocks/blocks-record?status=open" },
      { label: "Refunded", to: "/blocks/blocks-record?status=refunded" },
      { label: "Clear", to: "/blocks/blocks-record", variant: "link" },
    ],
  });

  static orders = ActivityFeed({
    title: "Orders",
    fetchUrl: "/api/blocks/orders?status={{query.status}}",
    groupByDay: false,
    empty: {
      title: "Choose a status",
      description: "Nothing is requested until ?status= has a value.",
    },
  });
}

@RegisterPage()
export class PageBlocksCustomer extends PageController("blocks-customer", {
  displayName: "Customer",
  icon: "i-ph-buildings",
  category: blocksCategory,
  urlSlug: "customers/:id",
  hidden: true,
  description:
    "A detail page whose blocks read {{params.id}}: facts, figures, a status banner and tab counts of one customer.",
}) {
  static status = Banner({ fetchUrl: `${CUSTOMERS_API}/{{params.id}}/status` });

  static stats = StatGroup({
    layout: "cards",
    columns: 3,
    fetchUrl: `${CUSTOMERS_API}/{{params.id}}/stats`,
    skeletonCount: 3,
  });

  static tabs = Tab({
    items: [
      { label: "Facts", icon: "i-ph-info", slot: "facts" },
      {
        label: "Orders",
        icon: "i-ph-shopping-bag",
        slot: "orders",
        badge: "…",
      },
      { label: "Invoices", icon: "i-ph-receipt", slot: "invoices", badge: "…" },
    ],
    badgesUrl: `${CUSTOMERS_API}/{{params.id}}/counts`,
  })
    .child(
      "facts",
      KeyValueList({
        title: "Customer",
        fetchUrl: `${CUSTOMERS_API}/{{params.id}}`,
        skeletonCount: 3,
      }),
      { slot: "facts" },
    )
    .child("orders", Banner({ title: "The Orders badge comes from /counts" }), {
      slot: "orders",
    })
    .child(
      "invoices",
      Banner({ title: "The Invoices badge comes from /counts" }),
      { slot: "invoices" },
    );
}
