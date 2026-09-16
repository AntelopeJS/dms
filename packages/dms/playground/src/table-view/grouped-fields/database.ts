import {
  BasicDataModel,
  Field,
  Fixture,
  Index,
  RegisterTable,
  Table,
} from "@antelopejs/interface-database-decorators";
import { CORE_SCHEMA_NAME } from "@antelopejs/interface-dms/constants";

const tableName = "playground_contacts";

const defaultContacts = [
  {
    _id: "contact-1",
    firstName: "John",
    lastName: "Doe",
    email: "john.doe@example.com",
    phone: "+1 555-0101",
    website: "https://johndoe.com",
    twitter: "@johndoe",
    linkedin: "johndoe",
    street: "123 Main St",
    city: "New York",
    zipCode: "10001",
    country: "us",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    _id: "contact-2",
    firstName: "Jane",
    lastName: "Smith",
    email: "jane.smith@example.com",
    phone: "+1 555-0102",
    website: "https://janesmith.io",
    twitter: "@janesmith",
    linkedin: "janesmith",
    street: "456 Oak Ave",
    city: "Los Angeles",
    zipCode: "90001",
    country: "us",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    _id: "contact-3",
    firstName: "Pierre",
    lastName: "Dupont",
    email: "pierre.dupont@example.fr",
    phone: "+33 1 23 45 67 89",
    website: "https://pierredupont.fr",
    twitter: "@pdupont",
    linkedin: "pierredupont",
    street: "12 Rue de la Paix",
    city: "Paris",
    zipCode: "75001",
    country: "fr",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

@RegisterTable(tableName, CORE_SCHEMA_NAME)
@Fixture(() => defaultContacts)
export class Contact extends Table {
  @Field("string") declare _id: string;

  @Field("string") declare firstName: string;
  @Field("string") declare lastName: string;

  @Field("string") declare email: string;
  @Field("string") declare phone: string;

  @Field("string") declare website: string;
  @Field("string") declare twitter: string;
  @Field("string") declare linkedin: string;

  @Field("string") declare street: string;
  @Field("string") declare city: string;
  @Field("string") declare zipCode: string;
  @Field("string") declare country: string;

  @Index() @Field("date") declare createdAt: Date;
  @Index() @Field("date") declare updatedAt: Date;
}

export class ContactModel extends BasicDataModel(Contact, tableName) {}
