import { expect } from "chai";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import {
  ColumnDisplay,
  type ColumnOptions,
  DefaultDisplays,
  RegisterDisplay,
  serializeColumnDisplay,
} from "@antelopejs/interface-dms/base/table-view";

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

  it("serializes no display to nothing", () => {
    expect(serializeColumnDisplay(undefined)).to.equal(undefined);
  });
});
