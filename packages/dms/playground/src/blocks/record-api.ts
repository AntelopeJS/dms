import { Controller, Get, Post } from "@antelopejs/interface-api";

/** The state of the demo workspace, kept in memory for the playground. */
interface DemoWorkspace {
  name: string;
  status: "active" | "suspended";
  billed: boolean;
  stripeCustomerId: string | null;
  joinedAt: string | null;
  creditCents: number;
}

const INITIAL: DemoWorkspace = {
  name: "Acme Logistics",
  status: "active",
  billed: false,
  stripeCustomerId: null,
  joinedAt: null,
  creditCents: 0,
};

const STATUS_TONES = { active: "success", suspended: "error" } as const;
const CENTS = 100;
const DEMO_CUSTOMER = "cus_Q8f2LmXv01";

let workspace: DemoWorkspace = { ...INITIAL };

// What a module's detail page routes answer: the header of the record, the
// facts of a block, and the operations its actions call. Each operation
// changes the record; the page reads it again on its own.
export class BlocksRecordApiController extends Controller(
  "/api/blocks/record",
) {
  @Get("header")
  getHeader() {
    return {
      title: workspace.name,
      avatar: { initials: "AL" },
      status: {
        label: workspace.status === "active" ? "Active" : "Suspended",
        tone: STATUS_TONES[workspace.status],
      },
      badges: [
        { label: workspace.billed ? "Business" : "Free" },
        ...(workspace.joinedAt
          ? [{ label: "Joined", tone: "success" as const, icon: "i-ph-check" }]
          : []),
      ],
      meta: [
        { value: "ws_8f2c41", mono: true },
        { label: "Owner", value: "Jane Doe" },
        { label: "Created", value: "Mar 12, 2026" },
      ],
      record: workspace,
    };
  }

  @Get("facts")
  getFacts() {
    return {
      items: [
        { label: "Status", value: workspace.status, type: "status" },
        { label: "Billing", value: workspace.billed ? "Stripe" : "None" },
        {
          label: "Stripe customer",
          value: workspace.stripeCustomerId ?? "—",
          type: "mono",
        },
        {
          label: "Credit",
          value: workspace.creditCents / CENTS,
          type: "money",
        },
      ],
    };
  }

  @Get("suspend/impact")
  getSuspendImpact() {
    return {
      title: `Suspend ${workspace.name}?`,
      description: "Its members lose access until it is reactivated.",
      color: "error",
      icon: "i-ph-prohibit",
      confirmLabel: "Suspend",
      confirmText: workspace.name,
      impact: [{ icon: "i-ph-users", label: "Members signed out", count: 12 }],
    };
  }

  @Post("suspend")
  suspend() {
    workspace = { ...workspace, status: "suspended" };
    return { success: true };
  }

  @Post("reactivate")
  reactivate() {
    workspace = { ...workspace, status: "active" };
    return { success: true };
  }

  @Post("subscribe")
  subscribe() {
    workspace = { ...workspace, billed: true, stripeCustomerId: DEMO_CUSTOMER };
    return { success: true };
  }

  @Post("join")
  join() {
    workspace = { ...workspace, joinedAt: new Date().toISOString() };
    return { success: true };
  }

  @Post("credit")
  credit() {
    workspace = { ...workspace, creditCents: workspace.creditCents + 1000 };
    return { success: true };
  }

  @Post("reset")
  reset() {
    workspace = { ...INITIAL };
    return { success: true };
  }
}
