import {
  type DeepPartial,
  GetModel,
} from "@antelopejs/interface-database-decorators";
import { User, UserModel } from "@antelopejs/interface-dms/auth/db";

type ValidateOptions = NonNullable<Parameters<UserModel["insert"]>[1]>;

/**
 * A `UserModel` over the module's real database connection whose `update`
 * writes nothing: it counts the call and records the user it was handed, and
 * refuses any other argument, so a write the test does not record cannot pass
 * unseen. Every other method is the real one: a test overrides the lookups its
 * code under test performs.
 */
export class RecordingUserModel extends UserModel {
  readonly updated: User[] = [];
  updateCalls = 0;

  constructor() {
    super(GetModel(UserModel).database);
  }

  override async update(
    first: string | (DeepPartial<User> & { _id: string }),
    _second?: DeepPartial<User> | ValidateOptions,
    _third?: ValidateOptions,
  ): Promise<number> {
    this.updateCalls += 1;
    if (!(first instanceof User)) {
      throw new Error("update was handed something other than a User row");
    }
    this.updated.push(first);
    return 1;
  }
}

/**
 * A `RecordingUserModel` for code that resolves one account: it finds that
 * account by its e-mail and by id, owns no platform owner, and refuses to
 * create a second account.
 */
export class SingleAccountUserModel extends RecordingUserModel {
  constructor(private readonly account: User) {
    super();
  }

  override async getByEmail(lookup: string): Promise<User | undefined> {
    return lookup === this.account.email ? this.account : undefined;
  }

  override async get(): Promise<User> {
    return this.account;
  }

  override async getOwners(): Promise<User[]> {
    return [];
  }

  override async insert(): Promise<never> {
    throw new Error("the code under test must not create a second account");
  }
}
