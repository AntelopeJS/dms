import {
  BasicDataModel,
  Field,
  Fixture,
  Index,
  RegisterTable,
  Table,
} from "@antelopejs/interface-database-decorators";
import { CORE_SCHEMA_NAME } from "@antelopejs/interface-dms/constants";

const tableName = "playground_inline_products";

export type InlineProductCategory =
  | "furniture"
  | "lighting"
  | "office"
  | "storage"
  | "textile";

interface InlineProductSeed {
  name: string;
  sku: string;
  price: number;
  stock: number;
  active: boolean;
  category: InlineProductCategory;
  /** Launch day, as `YYYY-MM-DD`. */
  launchDate: string;
  notes?: string;
}

// A small furniture catalogue: a few products out of stock, a few inactive,
// a few with notes, which stay in the edit form.
const PRODUCTS: InlineProductSeed[] = [
  {
    name: "Oak standing desk",
    sku: "DSK-1001",
    price: 649,
    stock: 12,
    active: true,
    category: "furniture",
    launchDate: "2025-03-04",
    notes: "<p>Electric lift, two memory presets.</p>",
  },
  {
    name: "Walnut side table",
    sku: "TBL-1002",
    price: 189,
    stock: 30,
    active: true,
    category: "furniture",
    launchDate: "2024-11-18",
  },
  {
    name: "Ergonomic task chair",
    sku: "CHR-1003",
    price: 429,
    stock: 0,
    active: true,
    category: "office",
    launchDate: "2025-01-20",
    notes: "<p>Back in stock in <strong>March</strong>.</p>",
  },
  {
    name: "Linen floor cushion",
    sku: "TXT-1004",
    price: 59.9,
    stock: 64,
    active: true,
    category: "textile",
    launchDate: "2025-05-02",
  },
  {
    name: "Brass desk lamp",
    sku: "LMP-1005",
    price: 129,
    stock: 18,
    active: true,
    category: "lighting",
    launchDate: "2024-09-09",
  },
  {
    name: "Paper pendant light",
    sku: "LMP-1006",
    price: 89,
    stock: 7,
    active: false,
    category: "lighting",
    launchDate: "2023-06-15",
    notes: "<p>Discontinued by the supplier.</p>",
  },
  {
    name: "Modular shelf unit",
    sku: "STR-1007",
    price: 349,
    stock: 9,
    active: true,
    category: "storage",
    launchDate: "2025-02-11",
  },
  {
    name: "Rattan storage basket",
    sku: "STR-1008",
    price: 34.5,
    stock: 120,
    active: true,
    category: "storage",
    launchDate: "2024-04-22",
  },
  {
    name: "Wool throw blanket",
    sku: "TXT-1009",
    price: 99,
    stock: 41,
    active: true,
    category: "textile",
    launchDate: "2024-10-01",
  },
  {
    name: "Monitor arm, dual",
    sku: "OFF-1010",
    price: 159,
    stock: 3,
    active: true,
    category: "office",
    launchDate: "2025-06-30",
  },
  {
    name: "Cable management tray",
    sku: "OFF-1011",
    price: 24.9,
    stock: 210,
    active: true,
    category: "office",
    launchDate: "2023-12-05",
  },
  {
    name: "Ash dining chair",
    sku: "CHR-1012",
    price: 219,
    stock: 0,
    active: false,
    category: "furniture",
    launchDate: "2022-08-19",
  },
  {
    name: "Smoked glass vase",
    sku: "DEC-1013",
    price: 45,
    stock: 26,
    active: true,
    category: "furniture",
    launchDate: "2025-04-14",
  },
  {
    name: "LED strip, 5 m",
    sku: "LMP-1014",
    price: 39.99,
    stock: 85,
    active: true,
    category: "lighting",
    launchDate: "2024-02-27",
  },
  {
    name: "Under-desk drawer",
    sku: "STR-1015",
    price: 79,
    stock: 15,
    active: true,
    category: "storage",
    launchDate: "2025-07-08",
  },
  {
    name: "Acoustic wall panel",
    sku: "OFF-1016",
    price: 69,
    stock: 48,
    active: true,
    category: "office",
    launchDate: "2025-09-01",
    notes: "<p>Sold by packs of four.</p>",
  },
  {
    name: "Bouclé armchair",
    sku: "CHR-1017",
    price: 899,
    stock: 2,
    active: true,
    category: "furniture",
    launchDate: "2025-10-06",
  },
  {
    name: "Cotton curtain pair",
    sku: "TXT-1018",
    price: 119,
    stock: 22,
    active: false,
    category: "textile",
    launchDate: "2023-03-13",
  },
  {
    name: "Architect floor lamp",
    sku: "LMP-1019",
    price: 249,
    stock: 6,
    active: true,
    category: "lighting",
    launchDate: "2024-07-24",
  },
  {
    name: "Stackable crate",
    sku: "STR-1020",
    price: 19.5,
    stock: 300,
    active: true,
    category: "storage",
    launchDate: "2024-01-15",
  },
];

function seedProducts() {
  return PRODUCTS.map((product, index) => ({
    ...product,
    _id: `inline-product-${index + 1}`,
    launchDate: new Date(`${product.launchDate}T00:00:00.000Z`),
    notes: product.notes ?? null,
  }));
}

@RegisterTable(tableName, CORE_SCHEMA_NAME)
@Fixture(seedProducts)
export class InlineProduct extends Table {
  @Field("string") declare _id: string;

  // Indexed: the columns the table sorts on.
  @Index() @Field("string") declare name: string;
  @Field("string") declare sku: string;
  @Index() @Field("number") declare price: number;
  @Index() @Field("number") declare stock: number;
  @Field("boolean") declare active: boolean;
  @Index() @Field("string") declare category: InlineProductCategory;
  @Index() @Field("date") declare launchDate: Date | null;
  @Field("string") declare notes: string | null;
}

export class InlineProductModel extends BasicDataModel(
  InlineProduct,
  tableName,
) {}
