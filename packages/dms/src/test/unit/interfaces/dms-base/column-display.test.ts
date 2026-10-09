import { expect } from "chai";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import {
  type CellSublineValue,
  ColumnDisplay,
  type ColumnOptions,
  DefaultDisplays,
  RegisterDisplay,
} from "@antelopejs/interface-dms/base/table-view";
import { serializeColumnDisplay } from "@antelopejs/interface-dms/base/table-view/internal/column-display";

interface DurationOptions {
  unit?: "s" | "ms";
}

@RegisterDisplay("automation:duration")
class DurationDisplay extends ColumnDisplay<DurationOptions> {}

class UnregisteredDisplay extends ColumnDisplay {}

describe("[unit] interfaces/dms-base — column displays", () => {
  it("serializes a built-in display to its frontend id and options", () => {
    expect(
      serializeColumnDisplay(
        new DefaultDisplays.IdentityDisplay({ subtitleField: "email" }),
      ),
    ).to.deep.equal({ type: "identity", options: { subtitleField: "email" } });
    expect(
      serializeColumnDisplay(new DefaultDisplays.IndicatorDisplay()),
    ).to.deep.equal({ type: "indicator" });
  });

  it("registers the four built-in displays under their frontend ids", () => {
    expect(
      [
        new DefaultDisplays.IdentityDisplay(),
        new DefaultDisplays.PillsDisplay(),
        new DefaultDisplays.RelativeDateDisplay(),
        new DefaultDisplays.IndicatorDisplay(),
      ].map((display) => serializeColumnDisplay(display)?.type),
    ).to.deep.equal(["identity", "pills", "relative_date", "indicator"]);
  });

  it("serializes a module's own display under its <module>:<id>", () => {
    expect(
      serializeColumnDisplay(new DurationDisplay({ unit: "ms" })),
    ).to.deep.equal({ type: "automation:duration", options: { unit: "ms" } });
  });

  it("refuses a display whose class was never registered", () => {
    expect(() => serializeColumnDisplay(new UnregisteredDisplay())).to.throw(
      /UnregisteredDisplay is not registered/,
    );
  });

  it("types a column's display as a display instance, typed options included", () => {
    const column: ColumnOptions = {
      name: "Member",
      type: new DefaultDataTypes.StringType(),
      // @ts-expect-error the free-form { type, options } is no display
      display: { type: "identity", options: {} },
    };
    // @ts-expect-error an option the identity display does not take
    new DefaultDisplays.IdentityDisplay({ avatar: "photo" });
    expect(column.name).to.equal("Member");
  });

  it("serializes the metric displays to the cell types drawing them", () => {
    const cases: Array<[ColumnDisplay<object>, object]> = [
      [
        new DefaultDisplays.StatusPillDisplay({
          tones: { failing: "error" },
          subField: "lastError",
        }),
        {
          type: "status_pill",
          options: { tones: { failing: "error" }, subField: "lastError" },
        },
      ],
      [
        new DefaultDisplays.ProgressDisplay({
          doneField: "done",
          totalField: "total",
          errorField: "failed",
        }),
        {
          type: "progress",
          options: {
            doneField: "done",
            totalField: "total",
            errorField: "failed",
          },
        },
      ],
      [
        new DefaultDisplays.SparklineDisplay({ field: "sessions" }),
        { type: "sparkline", options: { field: "sessions" } },
      ],
      [
        new DefaultDisplays.DurationDisplay({ unit: "s" }),
        { type: "duration", options: { unit: "s" } },
      ],
      [new DefaultDisplays.BytesDisplay(), { type: "bytes" }],
      [
        new DefaultDisplays.MonoDisplay({ copy: true }),
        { type: "mono", options: { copy: true } },
      ],
    ];
    for (const [display, serialized] of cases) {
      expect(serializeColumnDisplay(display)).to.deep.equal(serialized);
    }
    // @ts-expect-error a progress needs its total
    new DefaultDisplays.ProgressDisplay({ doneField: "done" });
  });

  it("serializes the composed sub-line options, the two-line display and an empty identity", () => {
    const cases: Array<[ColumnDisplay<object>, object]> = [
      [
        new DefaultDisplays.StatusPillDisplay({
          tones: { open: "info", uncollectible: "error" },
          subField: "statusDetail",
          subTone: "muted",
        }),
        {
          type: "status_pill",
          options: {
            tones: { open: "info", uncollectible: "error" },
            subField: "statusDetail",
            subTone: "muted",
          },
        },
      ],
      [
        new DefaultDisplays.TwoLineDisplay({
          primaryField: "renewalSummary",
          subField: "renewalDate",
          emptyLabel: "$saas.workspaces.no_renewal",
        }),
        {
          type: "two_line",
          options: {
            primaryField: "renewalSummary",
            subField: "renewalDate",
            emptyLabel: "$saas.workspaces.no_renewal",
          },
        },
      ],
      [
        new DefaultDisplays.IdentityDisplay({
          emptyLabel: "$saas.credit_notes.automatic",
          emptyIcon: "i-ph-robot",
          subtitleTone: "muted",
        }),
        {
          type: "identity",
          options: {
            emptyLabel: "$saas.credit_notes.automatic",
            emptyIcon: "i-ph-robot",
            subtitleTone: "muted",
          },
        },
      ],
    ];
    for (const [display, serialized] of cases) {
      expect(serializeColumnDisplay(display)).to.deep.equal(serialized);
    }
  });

  it("types a sub-line as a text, a composed text or a text with its tone", () => {
    const sublines: CellSublineValue[] = [
      "Due Oct 28",
      { key: "$saas.invoice.sub_state.written_off" },
      {
        text: {
          key: "$saas.invoice.sub_state.retry",
          params: {
            date: { type: "date", value: "2026-10-10", format: "day" },
          },
        },
        tone: "error",
      },
    ];
    // @ts-expect-error a sub-line's tone is a cell tone
    const wrongTone: CellSublineValue = { text: "Late", tone: "danger" };
    expect(sublines).to.have.length(3);
    expect(wrongTone).to.not.equal(undefined);
  });

  it("serializes no display to nothing", () => {
    expect(serializeColumnDisplay(undefined)).to.equal(undefined);
  });
});
