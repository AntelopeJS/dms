import {
  BasicDataModel,
  Field,
  Fixture,
  Index,
  RegisterTable,
  Relation,
  Table,
} from "@antelopejs/interface-database-decorators";
import { CORE_SCHEMA_NAME } from "@antelopejs/interface-dms/constants";

const categoriesTableName = "playground_cascader_categories";
const productsTableName = "playground_cascader_products";

interface CategorySeed {
  _id: string;
  name: string;
  parent?: string;
  isInactive?: boolean;
}

const defaultCategories: CategorySeed[] = [
  { _id: "electronics", name: "Electronics" },
  { _id: "audio", name: "Audio", parent: "electronics" },
  { _id: "headphones", name: "Headphones", parent: "audio" },
  { _id: "speakers", name: "Speakers", parent: "audio" },
  { _id: "computers", name: "Computers", parent: "electronics" },
  { _id: "laptops", name: "Laptops", parent: "computers" },
  { _id: "desktops", name: "Desktops", parent: "computers" },
  {
    _id: "video",
    name: "Video (discontinued)",
    parent: "electronics",
    isInactive: true,
  },
  { _id: "tv", name: "TV", parent: "video" },
  { _id: "projectors", name: "Projectors", parent: "video" },
  { _id: "home", name: "Home & Garden" },
  { _id: "furniture", name: "Furniture", parent: "home" },
  { _id: "lighting", name: "Lighting", parent: "home" },
  { _id: "tools", name: "Tools", parent: "home" },
];

interface ProductSeed {
  _id: string;
  name: string;
  category?: string;
  categories?: string[];
}

const defaultProducts: ProductSeed[] = [
  {
    _id: "product-1",
    name: "Studio Headphones",
    category: "headphones",
    categories: ["headphones", "speakers"],
  },
  {
    _id: "product-2",
    name: "Gaming Laptop",
    category: "laptops",
    categories: ["laptops"],
  },
  {
    _id: "product-3",
    name: "Desk Lamp",
    category: "lighting",
    categories: ["lighting"],
  },
];

@RegisterTable(categoriesTableName, CORE_SCHEMA_NAME)
@Fixture(() =>
  defaultCategories.map((category) => ({
    ...category,
    createdAt: new Date(),
    updatedAt: new Date(),
  })),
)
export class CascaderCategory extends Table {
  @Field("string") declare _id: string;

  @Field("string") declare name: string;
  @Field("string")
  @Relation({ to: () => CascaderCategory })
  declare parent?: string;
  @Field("boolean") declare isInactive?: boolean;

  @Index() @Field("date") declare createdAt: Date;
  @Index() @Field("date") declare updatedAt: Date;
}

export class CascaderCategoryModel extends BasicDataModel(
  CascaderCategory,
  categoriesTableName,
) {}

@RegisterTable(productsTableName, CORE_SCHEMA_NAME)
@Fixture(() =>
  defaultProducts.map((product) => ({
    ...product,
    createdAt: new Date(),
    updatedAt: new Date(),
  })),
)
export class CascaderProduct extends Table {
  @Field("string") declare _id: string;

  @Field("string") declare name: string;
  @Field("string")
  @Relation({ to: () => CascaderCategory })
  declare category?: string;
  @Field(["string"])
  @Relation({ to: () => CascaderCategory, many: true })
  declare categories?: string[];

  @Index() @Field("date") declare createdAt: Date;
  @Index() @Field("date") declare updatedAt: Date;
}

export class CascaderProductModel extends BasicDataModel(
  CascaderProduct,
  productsTableName,
) {}
