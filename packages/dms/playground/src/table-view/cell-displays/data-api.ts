import { Controller, Parameter, Post } from "@antelopejs/interface-api";
import {
  DataController,
  RegisterDataController,
} from "@antelopejs/interface-data-api";
import {
  Access,
  AccessMode,
  Listable,
  ModelReference,
  Sortable,
} from "@antelopejs/interface-data-api/metadata";
import { Model } from "@antelopejs/interface-database-decorators";
import { AuthUser } from "@antelopejs/interface-dms/auth";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { StatusType } from "@antelopejs/interface-dms/base/data-types";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { Searchable } from "@antelopejs/interface-dms/base/searchable";
import type { ComposedText } from "@antelopejs/interface-dms/base/types/composed-text";
import type { Tone } from "@antelopejs/interface-dms/base/types/tone";
import {
  type CellSubline,
  Column,
  ColumnDisplay,
  DefaultDisplays,
  RegisterDisplay,
  TableViewRoutes,
} from "@antelopejs/interface-dms/base/table-view";
import {
  type AccountKind,
  CellAccount,
  CellAccountModel,
  type InvoiceState,
} from "./database";

/** A team of an account, as the "Teams" pills read it (`labelKey`). */
interface TeamRow {
  title: string;
}

/** How big the flag of a `FlagDisplay` cell is drawn. */
export interface FlagDisplayOptions {
  size?: "sm" | "md";
}

/**
 * A module's own cell display: a country code drawn as its flag. The
 * frontend plugin `flag-display.ts` registers the `playground:flag` data
 * type that draws it.
 */
@RegisterDisplay("playground:flag")
export class FlagDisplay extends ColumnDisplay<FlagDisplayOptions> {}

const PLANS = [
  { value: "trial", label: "Trial" },
  { value: "team", label: "Team" },
  { value: "business", label: "Business" },
];
const INVOICE_STATES = [
  { value: "paid", label: "Paid" },
  { value: "open", label: "Open" },
  { value: "uncollectible", label: "Uncollectible" },
];
const KIND_ICONS: Record<AccountKind, string> = {
  company: "i-ph-buildings",
  school: "i-ph-graduation-cap",
  nonprofit: "i-ph-heart",
};
const INVOICE_DETAILS: Record<InvoiceState, string> = {
  paid: "Paid by card",
  open: "Due in 14 days",
  uncollectible: "3 attempts failed",
};
const UNIT_PRICE_CENTS = 1_200;
const SLOW_P95_MS = 500;
const ACTIVE_NOW_MS = 5 * 60_000;
const SOON_MS = 3 * 24 * 60 * 60_000;

/**
 * The accounts of the "Cell displays" demo: one column per cell display and
 * its options, the server picking per row what a display reads (a tone, a
 * secondary line, a badge).
 */
@RegisterDataController()
export class cellAccountDataAPI extends DataController(
  CellAccount,
  TableViewRoutes.All,
  Controller("/api/playground/cell-accounts"),
) {
  @ModelReference()
  @Model(CellAccountModel)
  declare model: CellAccountModel;

  @Listable()
  @Access(AccessMode.ReadOnly)
  declare _id: string;

  @Searchable()
  @Listable()
  @Sortable()
  @Column({
    name: "Account",
    type: new DefaultDataTypes.StringType(),
    size: 280,
    display: new DefaultDisplays.IdentityDisplay({
      avatarField: "avatar",
      subtitleField: "contactLine",
      selfField: "ownerId",
      selfLabel: "You",
      badges: [
        { field: "isPartner", label: "Partner", tone: "info" },
        { field: "plan", equals: "trial", label: "Trial", tone: "warning" },
      ],
    }),
  })
  @Access(AccessMode.ReadOnly)
  declare name: string;

  @Listable()
  @Access(AccessMode.ReadOnly)
  declare avatar: string;

  @Listable()
  @Access(AccessMode.ReadOnly)
  declare ownerId: string;

  @Listable()
  @Access(AccessMode.ReadOnly)
  declare isPartner: boolean;

  @Listable(["seats", "country"])
  @Access(AccessMode.ReadOnly)
  get contactLine(): ComposedText {
    return {
      key: "$demo.table_view.cells.contact_line",
      params: {
        count: { type: "count", value: this.table.seats },
        country: this.table.country,
      },
    };
  }

  @Listable()
  @Column({
    name: "Issued by",
    type: new DefaultDataTypes.StringType(),
    size: 180,
    display: new DefaultDisplays.IdentityDisplay({
      emptyLabel: "Automatic",
      emptyIcon: "i-ph-robot",
    }),
  })
  @Access(AccessMode.ReadOnly)
  declare issuedBy: string | null;

  @Listable()
  @Column({
    name: "Kind",
    type: new DefaultDataTypes.StringType(),
    size: 150,
    display: new DefaultDisplays.IdentityDisplay({
      iconField: "kindIcon",
      icon: "i-ph-question",
    }),
  })
  @Access(AccessMode.ReadOnly)
  declare kind: AccountKind;

  @Listable(["kind"])
  @Access(AccessMode.ReadOnly)
  get kindIcon(): string {
    return KIND_ICONS[this.table.kind];
  }

  @Searchable("is")
  @Listable()
  @Column({
    name: "Country",
    type: new DefaultDataTypes.StringType(),
    size: 110,
    display: new FlagDisplay({ size: "md" }),
  })
  @Access(AccessMode.ReadOnly)
  declare country: string;

  @Listable()
  @Column({
    name: "Plan",
    type: new DefaultDataTypes.SelectType({ items: PLANS }),
    filterable: true,
    size: 170,
    display: new DefaultDisplays.TwoLineDisplay({
      subField: "planDetail",
      emptyLabel: "No plan",
    }),
  })
  @Access(AccessMode.ReadOnly)
  declare plan: string;

  @Listable(["seats"])
  @Access(AccessMode.ReadOnly)
  get planDetail(): ComposedText {
    return {
      key: "$demo.table_view.cells.plan_detail",
      params: {
        price: { type: "money", value: UNIT_PRICE_CENTS, currency: "EUR" },
        count: { type: "count", value: this.table.seats },
      },
    };
  }

  @Listable()
  @Column({
    name: "Renews",
    type: new DefaultDataTypes.DateType(),
    size: 170,
    display: new DefaultDisplays.TwoLineDisplay({
      primaryField: "renewalSummary",
      subField: "renewalDate",
      emptyLabel: "Never",
    }),
  })
  @Access(AccessMode.ReadOnly)
  declare renewsAt: Date | null;

  @Listable(["renewsAt"])
  @Access(AccessMode.ReadOnly)
  get renewalSummary(): ComposedText | null {
    if (!this.table.renewsAt) return null;
    return {
      key: "$demo.table_view.cells.renews",
      params: {
        date: { type: "relative", value: this.table.renewsAt.toISOString() },
      },
    };
  }

  @Listable(["renewsAt", "suspended"])
  @Access(AccessMode.ReadOnly)
  get renewalDate(): CellSubline | null {
    if (!this.table.renewsAt) return null;
    return {
      text: {
        key: "$demo.table_view.cells.on_date",
        params: {
          date: {
            type: "date",
            value: this.table.renewsAt.toISOString(),
            format: "day",
          },
        },
      },
      tone: this.table.suspended ? "error" : undefined,
    };
  }

  @Listable()
  @Column({
    name: "Invoice",
    type: new DefaultDataTypes.SelectType({ items: INVOICE_STATES }),
    filterable: true,
    size: 170,
    display: new DefaultDisplays.StatusPillDisplay({
      tones: { paid: "success", open: "info", uncollectible: "error" },
      subField: "invoiceDetail",
      subTone: "muted",
    }),
  })
  @Access(AccessMode.ReadOnly)
  declare invoiceState: InvoiceState;

  @Listable(["invoiceState"])
  @Access(AccessMode.ReadOnly)
  get invoiceDetail(): string {
    return INVOICE_DETAILS[this.table.invoiceState];
  }

  @Listable()
  @Column({
    name: "SSO",
    type: new DefaultDataTypes.BooleanType(),
    filterable: true,
    size: 120,
    display: new DefaultDisplays.IndicatorDisplay({
      onLabel: "Enabled",
      offLabel: "Off",
      onIcon: "i-ph-shield-check",
      offIcon: "i-ph-shield",
    }),
  })
  @Access(AccessMode.ReadOnly)
  declare sso: boolean;

  @Listable()
  @Column({
    name: "Online",
    type: new StatusType({ onlineLabel: "Online", offlineLabel: "Away" }),
    filterable: true,
    size: 110,
  })
  @Access(AccessMode.ReadOnly)
  declare online: boolean;

  @Listable()
  @Sortable()
  @Column({
    name: "Last seen",
    type: new DefaultDataTypes.DateType(),
    size: 190,
    display: new DefaultDisplays.RelativeDateDisplay({
      nowWithinMs: ACTIVE_NOW_MS,
      nowLabel: "Active now",
      emptyLabel: "Never",
      emptyTone: "dimmed",
      byField: "lastSeenBy",
      byLabel: "$demo.table_view.cells.by",
    }),
  })
  @Access(AccessMode.ReadOnly)
  declare lastSeenAt: Date | null;

  @Listable()
  @Access(AccessMode.ReadOnly)
  declare lastSeenBy: string;

  @Listable()
  @Column({
    name: "Trial ends",
    type: new DefaultDataTypes.DateType(),
    size: 130,
    display: new DefaultDisplays.RelativeDateDisplay({
      style: "day",
      emptyLabel: "—",
      soonWithinMs: SOON_MS,
      soonTone: "warning",
      pastStyle: "day",
      pastTone: "dimmed",
    }),
  })
  @Access(AccessMode.ReadOnly)
  declare trialEndsAt: Date | null;

  @Listable()
  @Sortable()
  @Column({
    name: "p95",
    type: new DefaultDataTypes.NumberType(),
    size: 110,
    display: new DefaultDisplays.DurationDisplay({
      format: "ms",
      toneField: "latencyTone",
    }),
  })
  @Access(AccessMode.ReadOnly)
  declare p95Ms: number;

  @Listable(["p95Ms"])
  @Access(AccessMode.ReadOnly)
  get latencyTone(): Tone | undefined {
    return this.table.p95Ms >= SLOW_P95_MS ? "warning" : undefined;
  }

  @Listable()
  @Column({
    name: "Uptime",
    type: new DefaultDataTypes.NumberType(),
    size: 120,
    display: new DefaultDisplays.DurationDisplay({ unit: "s" }),
  })
  @Access(AccessMode.ReadOnly)
  declare uptimeS: number;

  @Listable()
  @Column({
    name: "Last error",
    type: new DefaultDataTypes.StringType(),
    size: 240,
    cellWrap: true,
    display: new DefaultDisplays.TextDisplay({ toneField: "errorTone" }),
  })
  @Access(AccessMode.ReadOnly)
  declare lastError: string | null;

  @Listable(["lastError"])
  @Access(AccessMode.ReadOnly)
  get errorTone(): Tone | undefined {
    return this.table.lastError ? "error" : undefined;
  }

  @Listable(["teams"])
  @Column({
    name: "Teams",
    type: new DefaultDataTypes.StringType(),
    size: 200,
    display: new DefaultDisplays.PillsDisplay({
      labelKey: "title",
      exclusive: {
        field: "isOwnerAccount",
        label: "Owner",
        icon: "i-ph-crown",
      },
      emptyLabel: "No team",
    }),
  })
  @Access(AccessMode.ReadOnly)
  get teamRows(): TeamRow[] {
    return this.table.teams.map((title) => ({ title }));
  }

  @Listable()
  @Access(AccessMode.ReadOnly)
  declare isOwnerAccount: boolean;

  @Listable()
  @Column({
    name: "Tags",
    type: new DefaultDataTypes.TagsType(),
    size: 200,
  })
  @Access(AccessMode.ReadOnly)
  declare tags: string[];

  @Listable()
  @Column({
    name: "Brand",
    type: new DefaultDataTypes.ColorType(),
    size: 120,
  })
  @Access(AccessMode.ReadOnly)
  declare brandColor: string;

  @Listable()
  @Column({
    name: "Signups (14 d)",
    type: new DefaultDataTypes.NumberType(),
    size: 140,
    display: new DefaultDisplays.SparklineDisplay({
      field: "signups",
      tone: "success",
    }),
  })
  @Access(AccessMode.ReadOnly)
  declare signups: number[];

  /** Makes the caller the account's owner: its identity cell then says "You". */
  @Post("assign-to-me")
  async assignToMe(
    @Parameter("id", "query") id: string,
    @AuthUser() user: User,
  ): Promise<{ ok: boolean }> {
    await this.model.update(id, { ownerId: user._id });
    return { ok: true };
  }
}
