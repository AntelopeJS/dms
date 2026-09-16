import {
  type RequestContext,
  SetParameterProvider,
} from "@antelopejs/interface-api";
import {
  type Class,
  MakeParameterAndPropertyDecorator,
} from "@antelopejs/interface-core/decorators";
import {
  type DataModel,
  GetModel,
} from "@antelopejs/interface-database-decorators";
import { getRequestTenantId } from "./request-tenant";

/**
 * Parameter/property decorator that injects `GetModel(cl, currentTenantId)`,
 * where `currentTenantId` is resolved per-request via {@link getRequestTenantId}.
 *
 * Use on a `Model`-typed parameter of a route handler or DataAPI field. Only
 * applicable when the target table is registered in the `dms-tenant` schema
 * (or any schema with one instance per tenant).
 */
export const TenantScopedModel = MakeParameterAndPropertyDecorator(
  (target, key, index, cl: DataModel & Class<InstanceType<DataModel>>) => {
    SetParameterProvider(target, key, index, (ctx: RequestContext) => {
      return GetModel(cl, getRequestTenantId(ctx));
    });
  },
);
