import { Controller } from "@antelopejs/interface-api";
import {
  DataController,
  RegisterDataController,
} from "@antelopejs/interface-data-api";
import {
  Access,
  AccessMode,
  Listable,
  Mandatory,
  ModelReference,
  Optional,
} from "@antelopejs/interface-data-api/metadata";
import { Model } from "@antelopejs/interface-database-decorators";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { Searchable } from "@antelopejs/interface-dms/base/searchable";
import {
  Column,
  ColumnGroup,
  Exported,
  TableViewRoutes,
} from "@antelopejs/interface-dms/base/table-view";
import { ReadonlyBehaviorType } from "@antelopejs/interface-dms/base/types";
import { Contact, ContactModel } from "./database";

@RegisterDataController()
@ColumnGroup("identity", {
  label: "Identity",
  description: "First and last name",
})
@ColumnGroup("contact", {
  label: "Contact Information",
  description: "Email and phone number",
})
@ColumnGroup("social", {
  label: "Social Links",
  description: "Online presence and profiles",
})
@ColumnGroup("address", {
  label: "Address",
  description: "Physical location",
  orientation: "vertical",
})
export class contactDataAPI extends DataController(
  Contact,
  TableViewRoutes.All,
  Controller("/api/contact"),
) {
  @ModelReference()
  @Model(ContactModel)
  declare model: ContactModel;

  @Listable()
  @Exported()
  @Access(AccessMode.ReadOnly)
  declare _id: string;

  @Searchable()
  @Listable()
  @Exported()
  @Column({
    name: "First Name",
    type: new DefaultDataTypes.StringType({
      placeholder: "Enter first name",
    }),
    filterable: true,
    group: "identity",
  })
  @Mandatory("new", "edit")
  @Access(AccessMode.ReadWrite)
  declare firstName: string;

  @Searchable()
  @Listable()
  @Exported()
  @Column({
    name: "Last Name",
    type: new DefaultDataTypes.StringType({
      placeholder: "Enter last name",
    }),
    filterable: true,
    group: "identity",
  })
  @Mandatory("new", "edit")
  @Access(AccessMode.ReadWrite)
  declare lastName: string;

  @Searchable()
  @Listable()
  @Exported()
  @Column({
    name: "Email",
    type: new DefaultDataTypes.EmailType({
      placeholder: "email@example.com",
    }),
    filterable: true,
    group: "contact",
  })
  @Mandatory("new", "edit")
  @Access(AccessMode.ReadWrite)
  declare email: string;

  @Listable()
  @Exported()
  @Column({
    name: "Phone",
    type: new DefaultDataTypes.PhoneType({
      placeholder: "+1 234 567 890",
    }),
    group: "contact",
  })
  @Optional()
  @Access(AccessMode.ReadWrite)
  declare phone: string;

  @Column({
    name: "Website",
    type: new DefaultDataTypes.UrlType({
      placeholder: "https://yourwebsite.com",
    }),
    group: "social",
  })
  @Optional()
  @Access(AccessMode.ReadWrite)
  declare website: string;

  @Column({
    name: "Twitter",
    type: new DefaultDataTypes.StringType({
      placeholder: "@username",
    }),
    group: "social",
  })
  @Optional()
  @Access(AccessMode.ReadWrite)
  declare twitter: string;

  @Column({
    name: "LinkedIn",
    type: new DefaultDataTypes.StringType({
      placeholder: "linkedin.com/in/username",
    }),
    group: "social",
  })
  @Optional()
  @Access(AccessMode.ReadWrite)
  declare linkedin: string;

  @Column({
    name: "Street",
    type: new DefaultDataTypes.StringType({
      placeholder: "Street address",
    }),
    group: "address",
  })
  @Optional()
  @Access(AccessMode.ReadWrite)
  declare street: string;

  @Column({
    name: "City",
    type: new DefaultDataTypes.StringType({
      placeholder: "City",
    }),
    group: "address",
  })
  @Optional()
  @Access(AccessMode.ReadWrite)
  declare city: string;

  @Column({
    name: "ZIP Code",
    type: new DefaultDataTypes.StringType({
      placeholder: "ZIP Code",
    }),
    group: "address",
  })
  @Optional()
  @Access(AccessMode.ReadWrite)
  declare zipCode: string;

  @Column({
    name: "Country",
    type: new DefaultDataTypes.SelectType({
      placeholder: "Select country",
      items: [
        { label: "United States", value: "us" },
        { label: "Canada", value: "ca" },
        { label: "United Kingdom", value: "uk" },
        { label: "France", value: "fr" },
        { label: "Germany", value: "de" },
      ],
    }),
    group: "address",
  })
  @Optional()
  @Access(AccessMode.ReadWrite)
  declare country: string;

  @Exported()
  @Column({
    name: "Created At",
    type: new DefaultDataTypes.DateType(),
    readonlyBehavior: ReadonlyBehaviorType.hidden,
  })
  @Access(AccessMode.ReadOnly)
  declare createdAt: Date;

  @Exported()
  @Column({
    name: "Updated At",
    type: new DefaultDataTypes.DateType(),
    readonlyBehavior: ReadonlyBehaviorType.hidden,
  })
  @Access(AccessMode.ReadOnly)
  declare updatedAt: Date;
}
