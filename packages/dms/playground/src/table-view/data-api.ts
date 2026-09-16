import { Controller, Parameter } from "@antelopejs/interface-api";
import {
  DataController,
  RegisterDataController,
} from "@antelopejs/interface-data-api";
import {
  Access,
  AccessMode,
  Foreign,
  Listable,
  Mandatory,
  ModelReference,
  ModifierKey,
  Optional,
  Sortable,
} from "@antelopejs/interface-data-api/metadata";
import {
  LocalizationModifier,
  Model,
} from "@antelopejs/interface-database-decorators";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { Searchable } from "@antelopejs/interface-dms/base/searchable";
import {
  ArchiveField,
  Column,
  Exported,
  Select,
  TableViewRoutes,
} from "@antelopejs/interface-dms/base/table-view";
import { ReadonlyBehaviorType } from "@antelopejs/interface-dms/base/types";
import { Task, TaskModel, User, UserModel } from "./database";
import { TASK_STATUSES, type TaskStatusValue } from "./status";

@RegisterDataController()
export class userDataAPI extends DataController(
  User,
  TableViewRoutes.All,
  Controller("/api/user"),
) {
  @ModelReference()
  @Model(UserModel)
  declare model: UserModel;

  @Select()
  @Listable()
  @Exported()
  @Access(AccessMode.ReadOnly)
  declare _id: string;

  @Searchable()
  @Select()
  @Listable()
  @Exported()
  @Column({
    name: "Name",
    type: new DefaultDataTypes.StringType({
      placeholder: "Enter user name",
    }),
    filterable: true,
  })
  @Mandatory("new", "edit")
  @Access(AccessMode.ReadWrite)
  declare name: string;

  @Searchable()
  @Listable()
  @Exported()
  @Column({
    name: "Email",
    type: new DefaultDataTypes.EmailType({
      placeholder: "Enter email address",
    }),
    filterable: true,
  })
  @Mandatory("new", "edit")
  @Access(AccessMode.ReadWrite)
  declare email: string;

  @Select()
  @Column({
    name: "Avatar",
    type: new DefaultDataTypes.StringType({
      placeholder: "Avatar URL",
    }),
  })
  @Optional()
  @Access(AccessMode.ReadWrite)
  declare avatar: string;
}

@RegisterDataController()
export class taskDataAPI extends DataController(
  Task,
  TableViewRoutes.All,
  Controller("/api/task"),
) {
  @ModelReference()
  @Model(TaskModel)
  declare model: TaskModel;

  @Parameter("x-content-language", "header")
  @ModifierKey(LocalizationModifier)
  declare language: string;

  @Listable()
  @Exported()
  @Access(AccessMode.ReadOnly)
  declare _id: string;

  @Searchable()
  @Listable()
  @Exported()
  @Column({
    name: "Name",
    type: new DefaultDataTypes.StringType({
      placeholder: "Enter task name",
    }),
    filterable: true,
    description: "The name of the task",
  })
  @Mandatory("new", "edit")
  @Access(AccessMode.ReadWrite)
  declare name: string;

  @Column({
    name: "Owner",
    type: new DefaultDataTypes.StringType(),
    description: "The owner of the task",
    readonlyBehavior: ReadonlyBehaviorType.hidden,
  })
  @Access(AccessMode.ReadOnly)
  declare owner: string;

  @Searchable()
  @Listable()
  @Exported()
  @Column({
    name: "Email",
    type: new DefaultDataTypes.EmailType({
      placeholder: "Enter email address",
    }),
    filterable: true,
    description: "Contact email for the task owner",
  })
  @Mandatory("new", "edit")
  @Access(AccessMode.ReadWrite)
  declare email: string;

  @Listable()
  @Exported()
  @Column({
    name: "Status",
    type: new DefaultDataTypes.SelectType({
      items: [...TASK_STATUSES],
    }),
    filterable: true,
    defaultValue: "pending",
    description: "Current status of the task",
  })
  @Mandatory("new", "edit")
  @Access(AccessMode.ReadWrite)
  declare status: TaskStatusValue;

  @Listable()
  @Column({
    name: "Priority",
    type: new DefaultDataTypes.SelectType({
      items: [
        { value: "low", label: "Low" },
        { value: "medium", label: "Medium" },
        { value: "high", label: "High" },
      ],
    }),
    filterable: true,
    defaultValue: "medium",
    description: "Task priority level",
  })
  @Mandatory("new", "edit")
  @Access(AccessMode.ReadWrite)
  declare priority: "low" | "medium" | "high";

  @ArchiveField()
  @Access(AccessMode.ReadOnly)
  declare isArchived: boolean;

  @Column({
    name: "Description",
    type: new DefaultDataTypes.RichTextType({
      placeholder: "Enter task description",
    }),
    description: "Detailed description of the task",
  })
  @Optional()
  @Access(AccessMode.ReadWrite)
  declare description: string;

  @Listable()
  @Sortable()
  @Exported()
  @Column({
    name: "Due Date",
    type: new DefaultDataTypes.DateType(),
    filterable: true,
    description: "When the task should be completed",
  })
  @Mandatory("new", "edit")
  @Access(AccessMode.ReadWrite)
  declare due_date: Date;

  @Listable()
  @Column({
    name: "Is Done",
    type: new DefaultDataTypes.BooleanType(),
    filterable: true,
    defaultValue: false,
    description: "Whether the task is completed",
  })
  @Access(AccessMode.ReadWrite)
  declare done: boolean;

  @Listable()
  @Column({
    name: "Assignees",
    type: new DefaultDataTypes.RelationType({
      placeholder: "Enter assignees",
      dataApiController: userDataAPI,
      keyMapping: {
        label: "name",
        value: "_id",
        avatar: "avatar",
      },
    }),
    description: "People assigned to this task",
  })
  @Optional()
  @Access(AccessMode.ReadWrite)
  @Foreign("users")
  declare assignees: string;

  @Listable()
  @Exported()
  @Column({
    name: "Price",
    type: new DefaultDataTypes.PriceType({ min: 0 }),
    filterable: true,
  })
  @Access(AccessMode.ReadWrite)
  declare price: number;

  @Listable()
  @Exported()
  @Column({
    name: "Completion %",
    type: new DefaultDataTypes.PercentageType({
      min: 0,
      max: 1,
      step: 0.01,
    }),
    filterable: true,
    description: "Task completion percentage",
  })
  @Sortable({ noIndex: true })
  @Access(AccessMode.ReadWrite)
  declare completion_percentage: number;

  @Listable()
  @Exported()
  @Column({
    name: "URL",
    type: new DefaultDataTypes.UrlType({
      placeholder: "Enter task URL",
    }),
    description: "URL of the task",
  })
  @Access(AccessMode.ReadWrite)
  declare url: string;

  @Listable()
  @Exported()
  @Column({
    name: "Phone",
    type: new DefaultDataTypes.PhoneType({
      placeholder: "Enter task phone",
    }),
  })
  @Access(AccessMode.ReadWrite)
  declare phone: string;

  @Listable()
  @Exported()
  @Column({
    name: "Address",
    type: new DefaultDataTypes.AddressType({
      autocomplete: { enabled: true },
    }),
    description: "Physical address",
  })
  @Optional()
  @Access(AccessMode.ReadWrite)
  declare address: DefaultDataTypes.Address;

  @Listable()
  @Column({
    name: "Thumbnail",
    type: new DefaultDataTypes.ImageType({
      multiple: false,
      path: "tasks/thumbnails",
      constraints: {
        maxSize: 1024 * 1024 * 10,
      },
    }),
    description: "Single task image with alt text",
  })
  @Optional()
  @Access(AccessMode.ReadWrite)
  declare thumbnail: DefaultDataTypes.ImageValue;

  @Listable()
  @Column({
    name: "Photos",
    type: new DefaultDataTypes.ImageType({
      multiple: true,
      max: 8,
      path: "tasks/photos",
      constraints: {
        allowedMimetypes: ["image/png", "image/jpeg", "image/webp"],
        maxSize: 1024 * 1024 * 10,
      },
    }),
    description: "Task photo gallery with a principal image",
  })
  @Optional()
  @Access(AccessMode.ReadWrite)
  declare photos: DefaultDataTypes.ImageValue[];

  @Exported()
  @Column({
    name: "Created At",
    type: new DefaultDataTypes.DateType(),
    description: "When the task was created",
    readonlyBehavior: ReadonlyBehaviorType.disabled,
  })
  @Access(AccessMode.ReadOnly)
  declare createdAt: Date;

  @Exported()
  @Column({
    name: "Updated At",
    type: new DefaultDataTypes.DateType(),
    description: "Last modification time",
    readonlyBehavior: {
      edit: ReadonlyBehaviorType.disabled,
      view: ReadonlyBehaviorType.disabled,
      new: ReadonlyBehaviorType.hidden,
    },
  })
  @Access(AccessMode.ReadOnly)
  declare updatedAt: Date;
}
