import { h } from "vue";

// The frontend half of the "Cell displays" demo's module display: the
// backend's `@RegisterDisplay("playground:flag")` names this data type, which
// draws a country code as its flag and the code. A universal plugin: the
// server render draws the cells with it.

const FLAG_DISPLAY_ID = "playground:flag";
const REGIONAL_INDICATOR_OFFSET = 0x1f1e6 - "A".charCodeAt(0);
const FLAG_SIZES: Record<string, string> = { sm: "text-sm", md: "text-lg" };

interface FlagDisplayOptions {
  size?: string;
}

function flagOf(code: string): string {
  return String.fromCodePoint(
    ...code
      .toUpperCase()
      .split("")
      .map((letter) => letter.charCodeAt(0) + REGIONAL_INDICATOR_OFFSET),
  );
}

export default defineDmsPlugin(() => {
  const { registerDataType } = useDataTypes();
  registerDataType({
    id: FLAG_DISPLAY_ID,
    formatter: {
      default: (value, _locale, options) => {
        const code = String(value ?? "");
        if (!code) return "—";
        const size = (options as FlagDisplayOptions | undefined)?.size ?? "sm";
        return h("span", { class: "inline-flex items-center gap-1.5" }, [
          h(
            "span",
            { class: FLAG_SIZES[size], "aria-hidden": "true" },
            flagOf(code),
          ),
          h("span", { class: "font-mono text-xs text-muted" }, code),
        ]);
      },
    },
  });
});
