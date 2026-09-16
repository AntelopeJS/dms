// Every DataCompareMode receives a `ValueProxy<unknown>` from the interface and
// narrows it to the shape its own data type stores. The two never overlap, so
// each of the thirteen narrowings needs the chain; the alternative is a generic
// on DataCompareMode.filter, which would ripple through every implementation.
/* oxlint-disable anti-slop/no-chained-type-assertions */
import type {
  ControllerClass,
  RequestContext,
} from "@antelopejs/interface-api";
import { GetMetadata } from "@antelopejs/interface-core";
import { DataAPIMeta, Foreign } from "@antelopejs/interface-data-api/metadata";
import type {
  ValueProxy,
  ValueProxyOrValue,
} from "@antelopejs/interface-database";
import {
  GetFileMetadata,
  type UploadConstraints,
} from "@antelopejs/interface-file-storage";
import { z } from "zod";
import { parseValue } from "../../utils/value-parser";
import { isString } from "../../utils/type-check";
import { GetAttachmentValidationMetadata } from "../../attachments";
import { Form, FormComponents } from "../form-schema";
// Import from the defining leaf, not the table-view barrel: the barrel pulls
// in the assembled routes, whose composition runs at module evaluation — and
// this module sits on the import path of the pieces being composed.
// The cycle is what registers the default data types: they declare
// themselves through decorators, and this barrel is the only value
// path that evaluates them. Breaking it left the registry empty and
// every column serialised without a type, silently. Safe because
// neither side dereferences the other while it evaluates.
// oxlint-disable-next-line import/no-cycle
import { TableViewMeta } from "../table-view/meta";
import type { TreeNode } from "../tree";
import { HttpMethod } from "../types";
import { DataType, RegisterDataType } from "./core";
import {
  absolutizeJoinedSchemas,
  DefaultDataCompareTypes,
} from "./compare-types";
export namespace DefaultDataTypes {
  export type NumberTypeOptions = {
    min?: number;
    max?: number;
    step?: number;
    placeholder?: string;
    fallback?: string;
  };

  export type StringTypeOptions = {
    placeholder?: string;
    maxLength?: number;
    minLength?: number;
    textarea?: boolean;
    rows?: number;
    fallback?: string;
  };

  export type DateTypeOptions = {
    range?: boolean;
    multiple?: boolean;
    minDate?: string;
    maxDate?: string;
    fallback?: string;
  };

  export type BooleanTypeOptions = {
    fallback?: string;
  };

  export type SelectTypeOptions = {
    items: FormComponents.SelectOption[];
    placeholder?: string;
    multiple?: boolean;
    deselectable?: boolean;
    fallback?: string;
  };

  export type EmailTypeOptions = {
    placeholder?: string;
    fallback?: string;
  };

  export type ColorTypeOptions = {
    placeholder?: string;
    fallback?: string;
  };

  export type PasswordTypeOptions = {
    placeholder?: string;
    minLength?: number;
    confirmPassword?: boolean;
    confirmPlaceholder?: string;
    fallback?: string;
  };

  export type UrlTypeOptions = {
    placeholder?: string;
    fallback?: string;
  };

  export type PhoneTypeOptions = {
    placeholder?: string;
    requiredPrefix?: boolean;
    fallback?: string;
  };

  export type TreeTypeOptions = {
    items?: TreeNode[];
    fetchUrl?: string;
    placeholder?: string;
    multiple?: boolean;
    fallback?: string;
  };

  export type PermissionsTypeOptions = {
    fetchUrl?: string;
    fallback?: string;
  };

  export type RichTextTypeOptions = {
    placeholder?: string;
    fallback?: string;
  };

  export type StringTimeTypeOptions = {
    placeholder?: string;
    min?: number;
    max?: number;
    fallback?: string;
  };

  @RegisterDataType("number")
  export class NumberType extends DataType {
    constructor(public readonly options: NumberTypeOptions = {}) {
      super(
        [
          DefaultDataCompareTypes.Is,
          DefaultDataCompareTypes.IsNot,
          DefaultDataCompareTypes.GreaterThan,
          DefaultDataCompareTypes.GreaterThanOrEqualTo,
          DefaultDataCompareTypes.LessThan,
          DefaultDataCompareTypes.LessThanOrEqualTo,
          DefaultDataCompareTypes.IsEmpty,
          DefaultDataCompareTypes.IsNotEmpty,
        ],
        DefaultDataCompareTypes.Is,
        options,
      );
    }

    protected defaultInputComponent() {
      return FormComponents.InputNumber({
        min: this.options.min,
        max: this.options.max,
        step: this.options.step,
        placeholder: this.options.placeholder,
      });
    }

    getValidation() {
      let schema = z.number();

      if (this.options.min !== undefined) {
        schema = schema.min(this.options.min);
      }
      if (this.options.max !== undefined) {
        schema = schema.max(this.options.max);
      }

      return schema;
    }
  }

  @RegisterDataType("string")
  export class StringType extends DataType {
    constructor(public readonly options: StringTypeOptions = {}) {
      super(
        [
          DefaultDataCompareTypes.Is,
          DefaultDataCompareTypes.IsNot,
          DefaultDataCompareTypes.Contains,
          DefaultDataCompareTypes.NotContains,
          DefaultDataCompareTypes.IsEmpty,
          DefaultDataCompareTypes.IsNotEmpty,
        ],
        DefaultDataCompareTypes.Contains,
        options,
      );
    }

    protected defaultInputComponent() {
      if (this.options.textarea) {
        return FormComponents.InputTextarea({
          placeholder: this.options.placeholder,
          maxLength: this.options.maxLength,
          rows: this.options.rows,
        });
      }

      return FormComponents.InputText({
        placeholder: this.options.placeholder,
        maxLength: this.options.maxLength,
        minLength: this.options.minLength,
      });
    }

    getValidation() {
      let schema = z.string();

      if (this.options.minLength !== undefined) {
        schema = schema.min(this.options.minLength);
      }
      if (this.options.maxLength !== undefined) {
        schema = schema.max(this.options.maxLength);
      }

      return schema;
    }
  }

  @RegisterDataType("date")
  export class DateType extends DataType {
    constructor(public readonly options: DateTypeOptions = {}) {
      super(
        [
          DefaultDataCompareTypes.Is,
          DefaultDataCompareTypes.LessThan,
          DefaultDataCompareTypes.GreaterThan,
          DefaultDataCompareTypes.IsBetween,
          DefaultDataCompareTypes.IsEmpty,
          DefaultDataCompareTypes.IsNotEmpty,
        ],
        DefaultDataCompareTypes.Is,
        options,
      );
    }

    protected defaultInputComponent() {
      return FormComponents.DatePicker({
        range: this.options.range,
        multiple: this.options.multiple,
        minDate: this.options.minDate,
        maxDate: this.options.maxDate,
      });
    }

    // A published contract: the runtime calls this positionally and every
    // implementing module declares the same shape, so an options object
    // cannot be introduced from this side.
    // oxlint-disable-next-line eslint/max-params
    override filter(
      context: RequestContext,
      proxy: ValueProxy<unknown>,
      key: string,
      value: string,
      mode: string,
      row: ValueProxy<Record<string, unknown>>,
    ): ValueProxyOrValue<boolean> {
      if (mode === "is" || mode === "is_not") {
        return this.sameDayFilter(proxy, value, mode === "is_not");
      }
      if (mode === "is_between") {
        return this.dayRangeFilter(proxy, value);
      }
      return super.filter(context, proxy, key, value, mode, row);
    }

    private startOfUtcDay(date: Date): Date {
      const result = new Date(date);
      result.setUTCHours(0, 0, 0, 0);
      return result;
    }

    private nextUtcDay(date: Date): Date {
      const result = this.startOfUtcDay(date);
      result.setUTCDate(result.getUTCDate() + 1);
      return result;
    }

    private sameDayFilter(
      proxy: ValueProxy<unknown>,
      value: string,
      negate: boolean,
    ): ValueProxyOrValue<boolean> {
      const parsed = parseValue(value);
      if (!(parsed instanceof Date)) {
        throw new Error(
          `Date filter expects a date value. Got: ${typeof parsed}`,
        );
      }
      const dayStart = this.startOfUtcDay(parsed);
      const dayEnd = this.nextUtcDay(parsed);

      const dbVal = proxy as unknown as ValueProxy<Date>;
      const matchesDay = dbVal.ge(dayStart).and(dbVal.lt(dayEnd));

      return negate ? matchesDay.not() : matchesDay;
    }

    private dayRangeFilter(
      proxy: ValueProxy<unknown>,
      value: string,
    ): ValueProxyOrValue<boolean> {
      const [rawStart, rawEnd] = value
        .split(",")
        .map((v) => parseValue(v.trim()));

      if (!(rawStart instanceof Date) || !(rawEnd instanceof Date)) {
        throw new Error(
          `Date is_between filter expects two date values. Got: ${value}`,
        );
      }

      const rangeStart = this.startOfUtcDay(rawStart);
      const rangeEnd = this.nextUtcDay(rawEnd);

      const dbVal = proxy as unknown as ValueProxy<Date>;
      return dbVal.ge(rangeStart).and(dbVal.lt(rangeEnd));
    }

    override filterComponents() {
      const datepicker = FormComponents.DatePicker({
        range: this.options.range,
        multiple: this.options.multiple,
        minDate: this.options.minDate,
        maxDate: this.options.maxDate,
      });

      return {
        default: datepicker,
        is_between: FormComponents.DatePickerRange({
          minDate: this.options.minDate,
          maxDate: this.options.maxDate,
        }),
      };
    }

    getValidation() {
      let singleDateSchema: z.ZodType<Date, z.ZodTypeDef, string | Date> = z
        .union([
          z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?)?$/),
          z.date(),
        ])
        .transform((val) => {
          return isString(val) ? new Date(val) : val;
        });

      if (this.options.minDate) {
        const minDate = new Date(this.options.minDate);
        singleDateSchema = singleDateSchema.refine((date) => date >= minDate, {
          message: `Date must be after ${minDate.toISOString()}`,
        });
      }

      if (this.options.maxDate) {
        const maxDate = new Date(this.options.maxDate);
        singleDateSchema = singleDateSchema.refine((date) => date <= maxDate, {
          message: `Date must be before ${maxDate.toISOString()}`,
        });
      }

      if (this.options.range || this.options.multiple) {
        return z.array(singleDateSchema);
      }

      return singleDateSchema;
    }
  }

  @RegisterDataType("boolean")
  export class BooleanType extends DataType {
    constructor(public readonly options: BooleanTypeOptions = {}) {
      super(
        [
          DefaultDataCompareTypes.Is,
          DefaultDataCompareTypes.IsNot,
          DefaultDataCompareTypes.IsEmpty,
          DefaultDataCompareTypes.IsNotEmpty,
        ],
        DefaultDataCompareTypes.Is,
        options,
      );
    }

    protected defaultInputComponent() {
      return FormComponents.InputSwitch();
    }

    override filterComponents() {
      const selectOptions = FormComponents.InputSelect({
        items: [
          { value: "true", label: "$dms.table.filter.boolean.checked" },
          { value: "false", label: "$dms.table.filter.boolean.unchecked" },
        ],
      });

      return {
        default: selectOptions,
        is: selectOptions,
        is_not: selectOptions,
      };
    }

    getValidation() {
      return z.boolean();
    }
  }

  @RegisterDataType("select")
  export class SelectType extends DataType {
    constructor(public readonly options: SelectTypeOptions = { items: [] }) {
      super(
        [
          options.multiple
            ? DefaultDataCompareTypes.Include
            : DefaultDataCompareTypes.Is,
          options.multiple
            ? DefaultDataCompareTypes.Exclude
            : DefaultDataCompareTypes.IsNot,
          DefaultDataCompareTypes.IsEmpty,
          DefaultDataCompareTypes.IsNotEmpty,
        ],
        options.multiple
          ? DefaultDataCompareTypes.Include
          : DefaultDataCompareTypes.Is,
        options,
      );
    }

    protected defaultInputComponent() {
      return FormComponents.InputSelect(this.options);
    }

    getValidation() {
      const validValues = this.options.items.map((item) => String(item.value));

      if (this.options.multiple) {
        return z.array(z.enum(validValues as [string, ...string[]]));
      }

      return z.enum(validValues as [string, ...string[]]);
    }
  }

  @RegisterDataType("price")
  export class PriceType extends NumberType {
    constructor(options: NumberTypeOptions = {}) {
      super({
        min: options.min ?? 0,
        step: options.step ?? 0.01,
        ...options,
      });
    }
  }

  @RegisterDataType("percentage")
  export class PercentageType extends NumberType {
    constructor(options: NumberTypeOptions = {}) {
      super({
        min: options.min ?? 0,
        max: options.max ?? 1,
        step: options.step ?? 0.01,
        ...options,
      });
    }

    protected defaultInputComponent() {
      return FormComponents.InputPercentage({
        min: (this.options.min ?? 0) * 100,
        max: (this.options.max ?? 1) * 100,
        step: this.options.step,
        placeholder: this.options.placeholder,
      });
    }
  }

  @RegisterDataType("email")
  export class EmailType extends DataType {
    constructor(public readonly options: EmailTypeOptions = {}) {
      super(
        [
          DefaultDataCompareTypes.Is,
          DefaultDataCompareTypes.IsNot,
          DefaultDataCompareTypes.Contains,
          DefaultDataCompareTypes.NotContains,
          DefaultDataCompareTypes.IsEmpty,
          DefaultDataCompareTypes.IsNotEmpty,
        ],
        DefaultDataCompareTypes.Contains,
        options,
      );
    }

    protected defaultInputComponent() {
      return FormComponents.InputEmail({
        placeholder: this.options.placeholder,
      });
    }

    getValidation() {
      return z.string().email();
    }
  }

  @RegisterDataType("color")
  export class ColorType extends DataType {
    constructor(public readonly options: ColorTypeOptions = {}) {
      super(
        [
          DefaultDataCompareTypes.Is,
          DefaultDataCompareTypes.IsNot,
          DefaultDataCompareTypes.IsEmpty,
          DefaultDataCompareTypes.IsNotEmpty,
        ],
        DefaultDataCompareTypes.Is,
        options,
      );
    }

    protected defaultInputComponent() {
      return FormComponents.InputColor({
        placeholder: this.options.placeholder,
      });
    }

    getValidation() {
      return z.string().regex(/^#[0-9a-fA-F]{6}$/);
    }
  }

  @RegisterDataType("password")
  export class PasswordType extends DataType {
    constructor(public readonly options: PasswordTypeOptions = {}) {
      super([], undefined, options);
    }

    protected defaultInputComponent() {
      return FormComponents.InputPassword({
        placeholder: this.options.placeholder,
        minLength: this.options.minLength,
        confirmPassword: this.options.confirmPassword,
        confirmPlaceholder: this.options.confirmPlaceholder,
      });
    }

    getValidation() {
      let schema = z.string();

      if (this.options.minLength !== undefined) {
        schema = schema.min(this.options.minLength);
      }

      return schema;
    }
  }

  @RegisterDataType("url")
  export class UrlType extends DataType {
    constructor(public readonly options: UrlTypeOptions = {}) {
      super(
        [
          DefaultDataCompareTypes.Is,
          DefaultDataCompareTypes.IsNot,
          DefaultDataCompareTypes.IsEmpty,
          DefaultDataCompareTypes.IsNotEmpty,
        ],
        DefaultDataCompareTypes.Is,
        options,
      );
    }

    protected defaultInputComponent() {
      return FormComponents.InputText({
        placeholder: this.options.placeholder,
      });
    }

    getValidation() {
      return z.string().url();
    }
  }

  @RegisterDataType("phone")
  export class PhoneType extends DataType {
    constructor(public readonly options: PhoneTypeOptions = {}) {
      super(
        [
          DefaultDataCompareTypes.Is,
          DefaultDataCompareTypes.IsNot,
          DefaultDataCompareTypes.Contains,
          DefaultDataCompareTypes.NotContains,
          DefaultDataCompareTypes.IsEmpty,
          DefaultDataCompareTypes.IsNotEmpty,
        ],
        DefaultDataCompareTypes.Contains,
        options,
      );
    }

    protected defaultInputComponent() {
      return FormComponents.InputPhone({
        placeholder: this.options.placeholder,
        requiredPrefix: this.options.requiredPrefix,
      });
    }

    getValidation() {
      if (this.options.requiredPrefix) {
        return z.string().regex(/^\+[1-9]\d{1,14}$/);
      }

      return z.string();
    }
  }

  @RegisterDataType("tree")
  export class TreeType extends DataType {
    constructor(public readonly options: TreeTypeOptions = {}) {
      super(
        [DefaultDataCompareTypes.Include, DefaultDataCompareTypes.Exclude],
        DefaultDataCompareTypes.Include,
        options,
      );
    }

    protected defaultInputComponent() {
      return FormComponents.InputTree({
        items: this.options.items || [],
        fetchUrl: this.options.fetchUrl,
        multiple: this.options.multiple,
        placeholder: this.options.placeholder,
      });
    }

    getValidation() {
      if (this.options.multiple) {
        return z.array(z.string());
      }

      return z.string();
    }
  }

  @RegisterDataType("relation")
  export class RelationType<T extends ControllerClass> extends DataType {
    constructor(
      public readonly options: {
        placeholder?: string;
        multiple?: boolean;
        deselectable?: boolean;
        dataApiController: T;
        index?: string;
        keyMapping?: {
          label?: keyof InstanceType<T> & string;
          value?: keyof InstanceType<T> & string;
          avatar?: keyof InstanceType<T> & string;
          disabled?: keyof InstanceType<T> & string;
        };
        fallback?: string;
        /**
         * Use the relation purely as a native FILTER, without resolving the
         * related row into the `/list` output.
         *
         * By default a relation column applies a `Foreign(...)` join
         * (see {@link decorateField}) so list rows carry the resolved related
         * object (e.g. `{ name: "..." }`) instead of the raw foreign-key id.
         * That join is right for grid/form display but wrong for a column that
         * is only meant to drive the funnel filter on a read-only list: it
         * rewrites the scalar id away and (because the join also rebuilds the
         * list projection) can drop the row's own id key from the pluck.
         *
         * With `filterOnly: true` the join is skipped entirely. The column keeps
         * its relation `compareModes` and `filterComponents` (the searchable
         * relation picker in the funnel) and, when declared `filterable: true`,
         * the backend `@Filter` still runs equality on the RAW scalar column —
         * so the funnel filters correctly while `/list` rows keep the raw id
         * under its key and keep the row id key (`_id`/`rowIdKey`) untouched.
         *
         * The backend filter operates on the stored scalar, which already holds
         * exactly the value the relation picker emits (`keyMapping.value`, or
         * the `index` value), so equality filtering stays correct without the
         * join.
         */
        filterOnly?: boolean;
      },
    ) {
      super(
        [
          DefaultDataCompareTypes.Is,
          DefaultDataCompareTypes.IsNot,
          DefaultDataCompareTypes.IsEmpty,
          DefaultDataCompareTypes.IsNotEmpty,
        ],
        DefaultDataCompareTypes.Is,
        options,
      );
    }

    protected defaultInputComponent() {
      const tableViewMeta = GetMetadata(
        this.options.dataApiController,
        TableViewMeta,
      );
      const { config } = tableViewMeta;
      const { endpoints } = GetMetadata(
        this.options.dataApiController,
        DataAPIMeta,
      );

      const location = `${config.location}/${endpoints.select.endpoint || "select"}`;
      const addOptions = this.buildAddOptions(tableViewMeta, endpoints);

      return FormComponents.InputRelation({
        placeholder: this.options.placeholder,
        multiple: this.options.multiple,
        deselectable: this.options.deselectable,
        searchUrl: location,
        keyMapping: this.options.keyMapping,
        addForm: addOptions?.addForm,
        addPermissionId: addOptions?.addPermissionId,
      });
    }

    private buildAddOptions(
      tableViewMeta: TableViewMeta,
      endpoints: { new?: unknown },
    ) {
      if (!endpoints.new) return undefined;

      const newFields = tableViewMeta.getFormFields("new");
      if (newFields.length === 0) return undefined;

      const submitUrl = `${tableViewMeta.config.location}/new`;
      const addForm = Form({
        fields: newFields,
        submitUrl,
        submitUrlMethod: HttpMethod.post,
      }).serializeSync();

      return {
        addForm,
        addPermissionId:
          tableViewMeta.componentBuilder?.getAction("add")?.permissionId,
      };
    }

    getValidation(): z.ZodType {
      return this.options.multiple ? z.array(z.string()) : z.string();
    }

    public decorateField(
      target: unknown,
      key: PropertyKey,
      descriptor?: PropertyDescriptor,
    ): void {
      // Filter-only relations never resolve the related row: skip the join so
      // the raw scalar id stays in the `/list` output and the row id key is
      // preserved. The funnel filter still works (relation picker +
      // `@Filter` equality on the raw column). See {@link options.filterOnly}.
      if (this.options.filterOnly) {
        return;
      }
      const meta = GetMetadata(this.options.dataApiController, DataAPIMeta);
      absolutizeJoinedSchemas(meta);
      const { tableName, pluck } = meta;
      Foreign(
        tableName,
        this.options.index,
        this.options.multiple,
        Array.from(pluck.select?.keys() || []),
        meta.schemaName,
        meta,
      )(target, key, descriptor ?? {});
    }
  }

  /**
   * Relation to a self-referencing table rendered as a cascader.
   *
   * The target controller exposes a flat list through its `select` endpoint
   * (the `parent` field of `keyMapping` must be decorated with `@Select()`);
   * the widget rebuilds the tree client-side and displays the full path
   * (e.g. `Electronics / Audio / Headphones`) in table cells.
   */
  @RegisterDataType("cascader_relation")
  export class CascaderRelationType<
    T extends ControllerClass,
  > extends DataType {
    constructor(
      public readonly options: {
        placeholder?: string;
        multiple?: boolean;
        deselectable?: boolean;
        dataApiController: T;
        index?: string;
        keyMapping: {
          label: keyof InstanceType<T> & string;
          value: keyof InstanceType<T> & string;
          parent: keyof InstanceType<T> & string;
          disabled?: keyof InstanceType<T> & string;
        };
        maxDepth?: number;
        leafOnly?: boolean;
        fallback?: string;
        /**
         * Use the cascader relation purely as a native FILTER, without
         * resolving the related row into the `/list` output.
         *
         * @see RelationType `filterOnly` for the full rationale: the relation
         * picker and the backend `@Filter` keep working on the raw scalar id,
         * while the join (which would rewrite the value and can drop the row id
         * key) is skipped.
         */
        filterOnly?: boolean;
      },
    ) {
      super(
        [
          DefaultDataCompareTypes.Is,
          DefaultDataCompareTypes.IsNot,
          DefaultDataCompareTypes.IsEmpty,
          DefaultDataCompareTypes.IsNotEmpty,
        ],
        DefaultDataCompareTypes.Is,
        options,
      );
    }

    protected defaultInputComponent() {
      const { config } = GetMetadata(
        this.options.dataApiController,
        TableViewMeta,
      );
      const { endpoints } = GetMetadata(
        this.options.dataApiController,
        DataAPIMeta,
      );

      return FormComponents.InputCascader({
        placeholder: this.options.placeholder,
        multiple: this.options.multiple,
        deselectable: this.options.deselectable,
        searchUrl: `${config.location}/${endpoints.select.endpoint || "select"}`,
        keyMapping: this.options.keyMapping,
        maxDepth: this.options.maxDepth,
        leafOnly: this.options.leafOnly,
        fallback: this.options.fallback,
      });
    }

    getValidation(): z.ZodType {
      return this.options.multiple ? z.array(z.string()) : z.string();
    }

    public decorateField(
      target: unknown,
      key: PropertyKey,
      descriptor?: PropertyDescriptor,
    ): void {
      // See RelationType.decorateField: a filter-only relation skips the join.
      if (this.options.filterOnly) {
        return;
      }
      const meta = GetMetadata(this.options.dataApiController, DataAPIMeta);
      absolutizeJoinedSchemas(meta);
      const { tableName, pluck } = meta;
      Foreign(
        tableName,
        this.options.index,
        this.options.multiple,
        Array.from(pluck.select?.keys() || []),
        meta.schemaName,
        meta,
      )(target, key, descriptor ?? {});
    }
  }

  /**
   * Structured postal address aligned with ISO 19160-1 address components and
   * directly mappable to the UBL `cac:PostalAddress` used by EN 16931 / Peppol
   * BIS Billing 3.0 (so it is invoice/e-invoicing friendly out of the box).
   *
   * Field → EN 16931 / UBL mapping:
   * - streetName          → BT-35  / cbc:StreetName
   * - houseNumber         → BT-35  / cbc:BuildingNumber
   * - boxNumber           → BT-162 / cac:AddressLine/cbc:Line
   * - addressLine2        → BT-36  / cbc:AdditionalStreetName
   * - postalCode          → BT-38  / cbc:PostalZone
   * - city                → BT-37  / cbc:CityName
   * - countrySubdivision  → BT-39  / cbc:CountrySubentity
   * - countryCode         → BT-40  / cac:Country/cbc:IdentificationCode (ISO 3166-1 alpha-2)
   */
  export type Address = {
    /** Street / thoroughfare name. */
    streetName: string;
    /** House / building number. */
    houseNumber?: string;
    /** Box, unit or apartment number (delivery point sub-identifier). */
    boxNumber?: string;
    /** Supplementary delivery information (c/o, building, floor, ...). */
    addressLine2?: string;
    /** Postal / ZIP code. */
    postalCode: string;
    /** City / locality name. */
    city: string;
    /** Country subdivision (region / state / province). */
    countrySubdivision?: string;
    /** Country code, ISO 3166-1 alpha-2 (e.g. "BE", "FR"). */
    countryCode: string;
  };

  type AddressPlaceholders = Partial<Record<keyof Address, string>>;

  /**
   * Address autocomplete configuration. Defaults to the public Photon
   * (Komoot) geocoder — free, key-less, worldwide, designed for type-ahead.
   * Provide `url` to point at a self-hosted Photon instance or any other
   * GeoJSON/Photon-compatible endpoint.
   */
  export type AddressAutocomplete = {
    /** Enable address suggestions on the street field. Defaults to `false`. */
    enabled?: boolean;
    /** Geocoder endpoint. Defaults to "https://photon.komoot.io/api". */
    url?: string;
    /** Preferred result language (ISO 639-1). Falls back to the UI locale. */
    lang?: string;
    /** Maximum number of suggestions. Defaults to 5. */
    limit?: number;
    /** Search field placeholder (raw text or `$i18n.key`). */
    placeholder?: string;
  };

  @RegisterDataType("address")
  export class AddressType<
    T extends ControllerClass = ControllerClass,
  > extends DataType {
    constructor(
      public readonly options: {
        placeholder?: AddressPlaceholders;
        autocomplete?: AddressAutocomplete;
        dataApiController?: T;
        keyMapping?: {
          label?: keyof InstanceType<T> & string;
          value?: keyof InstanceType<T> & string;
        };
        fallback?: string;
      } = {},
    ) {
      super(
        [DefaultDataCompareTypes.IsEmpty, DefaultDataCompareTypes.IsNotEmpty],
        DefaultDataCompareTypes.IsEmpty,
        options,
      );
    }

    protected defaultInputComponent() {
      const baseConfig = {
        placeholder: this.options.placeholder,
        autocomplete: this.options.autocomplete,
      };

      if (!this.options.dataApiController) {
        return FormComponents.InputAddress(baseConfig);
      }

      const { config } = GetMetadata(
        this.options.dataApiController,
        TableViewMeta,
      );
      const { endpoints } = GetMetadata(
        this.options.dataApiController,
        DataAPIMeta,
      );

      const location = `${config.location}/${endpoints.select.endpoint || "select"}`;

      return FormComponents.InputAddress({
        ...baseConfig,
        searchUrl: location,
        keyMapping: this.options.keyMapping,
      });
    }

    getValidation() {
      return z.object({
        streetName: z.string().min(1),
        houseNumber: z.string().optional(),
        boxNumber: z.string().optional(),
        addressLine2: z.string().optional(),
        postalCode: z.string().min(1),
        city: z.string().min(1),
        countrySubdivision: z.string().optional(),
        countryCode: z.string().length(2),
      });
    }
  }

  @RegisterDataType("permissions")
  export class PermissionsType extends DataType {
    constructor(public readonly options: PermissionsTypeOptions = {}) {
      super(
        [DefaultDataCompareTypes.Include, DefaultDataCompareTypes.Exclude],
        DefaultDataCompareTypes.Include,
        options,
      );
    }

    protected defaultInputComponent() {
      return FormComponents.PermissionsTree({
        fetchUrl: this.options.fetchUrl,
      });
    }

    getValidation() {
      return z.array(z.string());
    }
  }

  @RegisterDataType("rich_text")
  export class RichTextType extends DataType {
    constructor(public readonly options: RichTextTypeOptions = {}) {
      super([], undefined, options);
    }

    protected defaultInputComponent() {
      return FormComponents.RichText({
        placeholder: this.options.placeholder,
      });
    }

    getValidation() {
      return z.string();
    }
  }

  @RegisterDataType("string_time")
  export class StringTimeType extends DataType {
    constructor(public readonly options: StringTimeTypeOptions = {}) {
      super(
        [
          DefaultDataCompareTypes.Is,
          DefaultDataCompareTypes.IsNot,
          DefaultDataCompareTypes.GreaterThan,
          DefaultDataCompareTypes.GreaterThanOrEqualTo,
          DefaultDataCompareTypes.LessThan,
          DefaultDataCompareTypes.LessThanOrEqualTo,
          DefaultDataCompareTypes.IsEmpty,
          DefaultDataCompareTypes.IsNotEmpty,
        ],
        DefaultDataCompareTypes.Is,
        options,
      );
    }

    protected defaultInputComponent() {
      return FormComponents.InputTime({
        placeholder: this.options.placeholder,
        min: this.options.min,
        max: this.options.max,
      });
    }

    getValidation() {
      let schema = z.number();

      if (this.options.min !== undefined) {
        schema = schema.min(this.options.min);
      }

      if (this.options.max !== undefined) {
        schema = schema.max(this.options.max);
      }

      return schema;
    }
  }

  export interface FileTypeOptions extends Record<string, unknown> {
    multiple?: boolean;
    constraints?: UploadConstraints;
    path?: string;
    storage?: string;
    fallback?: string;
    attachmentField?: string;
    visibility?: "private" | "public";
  }

  function matchMimetype(actual: string, pattern: string): boolean {
    if (pattern === actual) return true;
    if (pattern.endsWith("/*")) {
      const prefix = pattern.slice(0, -1);
      return actual.startsWith(prefix);
    }
    return false;
  }

  const MISSING_FILE_ERROR_PATTERN = /not\s?found|nosuchkey/i;

  /**
   * A missing referenced file is a validation failure (the submitted key does
   * not point at a real upload); any other metadata error (storage outage,
   * auth) keeps propagating so it surfaces as a server error, not as a bogus
   * "invalid input" on the field.
   */
  function isMissingFileError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return MISSING_FILE_ERROR_PATTERN.test(message);
  }

  function createFileValidationSchema(
    constraints?: UploadConstraints,
    storage?: string,
    attachmentField?: string,
  ) {
    return z.string().refine(
      async (resourceKey) => {
        if (!constraints && !attachmentField) return true;
        // An empty value is the absence of a file, not a reference to check;
        // whether the field may be empty is the schema's business.
        if (!resourceKey) return true;

        const getMetadata = attachmentField
          ? GetAttachmentValidationMetadata
          : GetFileMetadata;
        const metadata = await getMetadata(resourceKey, storage).catch(
          (error) => {
            if (isMissingFileError(error)) return null;
            throw error;
          },
        );
        // `undefined` comes from the attachment lookup: the key belongs to no
        // prepared attachment, so it is an invalid reference. `null` means the
        // object itself is gone, which an attachment-backed field survives:
        // the attachment row proves provenance and the save replays the
        // promotion of a staged key.
        if (metadata === null) {
          return attachmentField !== undefined;
        }
        if (!metadata) {
          return false;
        }

        if (constraints?.maxSize && metadata.size > constraints.maxSize) {
          return false;
        }

        if (constraints?.allowedMimetypes?.length) {
          const isAllowed = constraints.allowedMimetypes.some((pattern) =>
            matchMimetype(metadata.mimetype, pattern),
          );
          if (!isAllowed) return false;
        }

        return true;
      },
      { message: "File does not meet constraints" },
    );
  }

  @RegisterDataType("file")
  export class FileType extends DataType {
    constructor(public readonly options: FileTypeOptions = {}) {
      super([], undefined, options);
    }

    protected defaultInputComponent() {
      return FormComponents.File({
        multiple: this.options.multiple,
        constraints: this.options.constraints,
        path: this.options.path,
        storage: this.options.storage,
        attachmentField: this.options.attachmentField,
        visibility: this.options.visibility,
      });
    }

    getValidation() {
      const fileSchema = z.lazy(() =>
        createFileValidationSchema(
          this.options.constraints,
          this.options.storage,
          this.options.attachmentField,
        ),
      );

      if (this.options.multiple) {
        return z.array(fileSchema);
      }

      return fileSchema;
    }
  }

  export interface ImageValue {
    key: string;
    alt?: string;
    principal?: boolean;
  }

  export interface ImageTypeOptions extends Record<string, unknown> {
    multiple?: boolean;
    max?: number;
    constraints?: UploadConstraints;
    path?: string;
    storage?: string;
    resize?: FormComponents.ImageResizeOptions;
    attachmentField?: string;
    visibility?: "private" | "public";
  }

  const DEFAULT_IMAGE_MIMETYPES = ["image/*"];

  function resolveImageConstraints(
    constraints?: UploadConstraints,
  ): UploadConstraints {
    return {
      ...constraints,
      allowedMimetypes: constraints?.allowedMimetypes?.length
        ? constraints.allowedMimetypes
        : DEFAULT_IMAGE_MIMETYPES,
    };
  }

  function createImageValueSchema(
    constraints: UploadConstraints,
    storage?: string,
    attachmentField?: string,
  ) {
    return z.object({
      key: createFileValidationSchema(constraints, storage, attachmentField),
      alt: z.string().optional(),
      principal: z.boolean().optional(),
    });
  }

  function hasAtMostOnePrincipal(images: ImageValue[]): boolean {
    return images.filter((image) => image.principal).length <= 1;
  }

  @RegisterDataType("image")
  export class ImageType extends DataType {
    constructor(public readonly options: ImageTypeOptions = {}) {
      super([], undefined, options);
    }

    protected defaultInputComponent() {
      return FormComponents.Image({
        multiple: this.options.multiple,
        max: this.options.max,
        constraints: resolveImageConstraints(this.options.constraints),
        path: this.options.path,
        storage: this.options.storage,
        resize: this.options.resize,
        attachmentField: this.options.attachmentField,
        visibility: this.options.visibility,
      });
    }

    getValidation() {
      const imageSchema = z.lazy(() =>
        createImageValueSchema(
          resolveImageConstraints(this.options.constraints),
          this.options.storage,
          this.options.attachmentField,
        ),
      );

      if (!this.options.multiple) {
        return imageSchema;
      }

      const arraySchema =
        this.options.max !== undefined
          ? z.array(imageSchema).max(this.options.max)
          : z.array(imageSchema);

      return arraySchema.refine(hasAtMostOnePrincipal, {
        message: "Only one image can be marked as principal",
      });
    }
  }
}
