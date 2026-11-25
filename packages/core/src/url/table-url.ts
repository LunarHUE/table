import type { AnyTableDef, RequestOf, StateOf } from "../define-table.js";
import type { AnyFeature, InitialState } from "../feature.js";
import { stableStringify } from "../store.js";
import type { RawParam, SerializedParam, UrlParamCodec } from "./params.js";
import type { SliceCodec, SliceParam } from "./slices.js";

// A table's URL: which slices of its state live in the query string, and
// how. Defaults come from the table definition, the same way the store
// starts, so a URL holding only defaults parses to the state, request and
// request key a fresh store has. Nothing here reads a column's renderers,
// so a server component can parse the URL of a table defined for the client.

/** Codecs for some keys of an object slice, as for filters. */
export type FieldCodecs<TState> = { readonly [K in keyof TState]?: UrlParamCodec<TState[K]> };

/** What a URL schema takes for slice `TName`: a slice codec, one codec for the whole slice, or codecs by key. */
export type SliceSchema<TName extends string, TState> =
  | SliceCodec<TName>
  | UrlParamCodec<TState>
  | ([TState] extends [object] ? FieldCodecs<TState> : never);

/** A slice schema of any kind. */
export type AnySliceSchema = SliceCodec | UrlParamCodec<unknown> | Readonly<Record<string, UrlParamCodec<unknown>>>;

/**
 * What `defineTableUrl` takes: a schema for each slice that lives in the
 * URL, by feature name. A name no feature has is a slice the app keeps
 * itself; it is parsed and written, and isn't part of the request.
 */
export type UrlSchema<TDef extends AnyTableDef> = {
  readonly [K in keyof StateOf<TDef> & string]?: SliceSchema<K, StateOf<TDef>[K]>;
} & { readonly [name: string]: AnySliceSchema | undefined };

type CodecValue<T> = T extends UrlParamCodec<infer V> ? V : unknown;

/** The state of the slices a URL schema names. Slices of the table's features have the feature's state. */
export type UrlStateOf<TDef extends AnyTableDef, TSchema> = {
  readonly [K in keyof TSchema & string]: K extends keyof StateOf<TDef>
    ? StateOf<TDef>[K]
    : TSchema[K] extends UrlParamCodec<unknown>
      ? CodecValue<TSchema[K]>
      : { readonly [F in keyof TSchema[K]]: CodecValue<TSchema[K][F]> };
};

/** A router's query: a query string, with or without `?`, `URLSearchParams`, or a record as Next.js gives `searchParams`. */
export type SearchParamsInput =
  | string
  | { getAll(name: string): readonly string[] }
  | Readonly<Record<string, RawParam>>;

/** Options for reading or writing a URL. */
export interface UrlPrefixOptions {
  /** Goes before every query key, so several tables can share a page: `"users_"` reads `users_page`. */
  readonly prefix?: string;
}

/** Options for writing a URL. */
export interface UrlSerializeOptions extends UrlPrefixOptions {
  /** Leaves out values equal to their default, so equal states make equal URLs. Defaults to true. */
  readonly clearOnDefault?: boolean;
}

/** One query parameter, with everything a router binding needs to read and write it. */
export interface UrlParamDescriptor {
  /** The query key, with the prefix. */
  readonly key: string;
  /** The slice the parameter belongs to. */
  readonly slice: string;
  /** The key in the slice's state the parameter holds, or none when it holds the whole slice. */
  readonly field?: string;
  /** The value when the parameter is missing or invalid. */
  readonly default: unknown;
  /** Reads the parameter. Missing or invalid input gives `default`. */
  parse(this: void, raw: RawParam): unknown;
  serialize(this: void, value: unknown): SerializedParam;
  equals(this: void, a: unknown, b: unknown): boolean;
}

/** What `dehydrate` returns: JSON-safe, for passing from a server render to the client. */
export interface DehydratedTableUrl<TRequest> {
  readonly request: TRequest;
  readonly requestKey: string;
}

/** A parsed URL: its state, and the request the table sends for it. */
export interface ParsedTableUrl<TDef extends AnyTableDef, TSchema = UrlSchema<TDef>> {
  /** The state of each slice in the schema, with defaults where the URL had nothing valid. */
  readonly state: UrlStateOf<TDef, TSchema>;
  /** What `store.getRequest()` returns for this state. Slices outside the URL keep their defaults. */
  readonly request: RequestOf<TDef>;
  /** What `store.getRequestKey()` returns for this state. */
  readonly requestKey: string;
  /** The canonical query for the state, with the prefix it was parsed with. */
  serialize(this: void, options?: Pick<UrlSerializeOptions, "clearOnDefault">): UrlSearchParams;
  dehydrate(this: void): DehydratedTableUrl<RequestOf<TDef>>;
}

/** A table's URL, as `defineTableUrl` returns it. */
export interface TableUrl<TDef extends AnyTableDef, TSchema = UrlSchema<TDef>> {
  readonly tableDef: TDef;
  readonly schema: TSchema;
  /** The default state of each slice in the schema, from the table definition. */
  readonly defaults: UrlStateOf<TDef, TSchema>;
  /** Every query key the schema reads, without a prefix. */
  readonly paramNames: readonly string[];
  /** The page sizes the URL accepts, when the schema has a page codec. */
  readonly sizes: readonly number[] | undefined;
  parse(this: void, input: SearchParamsInput, options?: UrlPrefixOptions): ParsedTableUrl<TDef, TSchema>;
  /** Writes slices of state. A slice left out is written as its default. */
  serialize(this: void, state: Partial<UrlStateOf<TDef, TSchema>>, options?: UrlSerializeOptions): UrlSearchParams;
  /** `serialize` as a query string, without the `?`. Empty when every value is a default. */
  toQueryString(this: void, state: Partial<UrlStateOf<TDef, TSchema>>, options?: UrlSerializeOptions): string;
  getParamDescriptors(this: void, options?: UrlPrefixOptions): readonly UrlParamDescriptor[];
}

/**
 * The members of `URLSearchParams` that callers use. Core's types load no
 * DOM or Node library, so they name these; the value is a real
 * `URLSearchParams`, and one fits wherever this type is taken.
 */
export interface UrlSearchParams {
  append(name: string, value: string): void;
  delete(name: string): void;
  get(name: string): string | null;
  getAll(name: string): string[];
  has(name: string): boolean;
  set(name: string, value: string): void;
  forEach(callback: (value: string, key: string) => void): void;
  toString(): string;
}

declare const URLSearchParams: new (init?: string) => UrlSearchParams;

type Values = Record<string, unknown>;

interface Param extends SliceParam {
  readonly slice: string;
  readonly default: unknown;
  readonly equals: (a: unknown, b: unknown) => boolean;
}

interface Slice {
  readonly name: string;
  readonly feature: AnyFeature | undefined;
  readonly default: unknown;
  readonly params: readonly Param[];
  /** True when each parameter holds one key of an object slice. */
  readonly fields: boolean;
}

const isObject = (value: unknown): value is Values => typeof value === "object" && value !== null;

const sameValue = (a: unknown, b: unknown): boolean => {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((item, i) => sameValue(item, b[i]));
  if (!isObject(a) || !isObject(b) || Array.isArray(a) || Array.isArray(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => key in b && sameValue(a[key], b[key]));
};

type Query = Exclude<SearchParamsInput, string>;

const hasGetAll = (query: Query): query is Extract<Query, { getAll(name: string): readonly string[] }> =>
  typeof query.getAll === "function";

/** Reads one key of any query input. */
const reader = (input: SearchParamsInput): ((key: string) => RawParam) => {
  const query = typeof input === "string" ? new URLSearchParams(input) : input;
  if (hasGetAll(query)) {
    return (key) => {
      const values = query.getAll(key);
      return values.length > 1 ? values : values[0];
    };
  }
  // Without `getAll`, a record, as Next.js gives `searchParams`.
  return (key) => (Object.prototype.hasOwnProperty.call(query, key) ? query[key] : undefined);
};

const isSliceCodec = (entry: AnySliceSchema): entry is SliceCodec =>
  "resolve" in entry && typeof entry.resolve === "function";
const isParamCodec = (entry: AnySliceSchema): entry is UrlParamCodec<unknown> =>
  "parse" in entry && typeof entry.parse === "function";

/** The state a feature starts with, as the store makes it. */
const startState = (def: AnyTableDef, feature: AnyFeature): unknown => {
  const seam = feature.def.state;
  if (!seam) return undefined;
  // `initialState` holds slices by feature name.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  let start = (def.initialState as Values)[feature.name];
  if (start === undefined) {
    // A state that is itself a function must come from the function form, so a function is always the maker.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    start = typeof seam.initial === "function" ? (seam.initial as InitialState<unknown, unknown>)(feature.options) : seam.initial;
  }
  return seam.normalize ? seam.normalize(start, def.columns) : start;
};

/**
 * Defines which slices of a table's state live in the URL. Defaults come
 * from the table: its `initialState`, then each feature's own starting
 * state, so the schema never repeats them. A codec's own `default` applies
 * only where the table has none.
 *
 * ```ts
 * const usersUrl = defineTableUrl(usersTable, {
 *   sorting: sortCodec(),
 *   pagination: pageCodec(),
 *   filtering: { search: stringParam({ trim: true }), role: enumParam(["admin", "member"]) },
 * });
 * ```
 *
 * Throws when two parameters share a query key.
 */
export function defineTableUrl<TDef extends AnyTableDef, const TSchema extends UrlSchema<TDef>>(
  tableDef: TDef,
  schema: TSchema,
): TableUrl<TDef, TSchema> {
  const features = tableDef.resolvedFeatures.ordered;
  const starts = new Map<AnyFeature, unknown>();
  for (const feature of features) starts.set(feature, startState(tableDef, feature));

  const slices: Slice[] = [];
  const paramNames: string[] = [];
  const defaults: Values = {};
  let sizes: readonly number[] | undefined;
  for (const name of Object.keys(schema)) {
    const entry = schema[name];
    if (!entry) continue;
    const owner = tableDef.resolvedFeatures.byName.get(name);
    const feature = owner?.def.state ? owner : undefined;
    let start = feature && starts.get(feature);
    let raw: readonly SliceParam[];
    if (isSliceCodec(entry)) {
      const resolved = entry.resolve({ tableDef, feature });
      raw = resolved.params;
      sizes = resolved.sizes ?? sizes;
    } else if (isParamCodec(entry)) {
      raw = [{ name: entry.param ?? name, codec: entry }];
    } else {
      const fields = entry;
      raw = Object.keys(fields).flatMap((field) => {
        const codec = fields[field];
        return codec ? [{ name: codec.param ?? field, field, codec }] : [];
      });
    }
    const fields = raw.some((param) => param.field !== undefined);
    const params = raw.map((param): Param => {
      const own = param.field === undefined ? start : isObject(start) ? start[param.field] : undefined;
      if (paramNames.includes(param.name)) throw new Error(`@lunarhue/table-core/url: two parameters use the key "${param.name}".`);
      paramNames.push(param.name);
      return {
        ...param,
        slice: name,
        default: own === undefined ? param.codec.default : own,
        equals: param.codec.equals ?? sameValue,
      };
    });
    if (fields) {
      // Keys the table's default lacks take the codecs' defaults.
      const merged: Values = isObject(start) ? { ...start } : {};
      for (const param of params) {
        if (param.field !== undefined && param.default !== undefined) merged[param.field] = param.default;
      }
      start = merged;
    } else if (start === undefined) start = params[0]?.default;
    defaults[name] = start;
    slices.push({ name, feature, default: start, params, fields });
  }

  const parse = (input: SearchParamsInput, options?: UrlPrefixOptions) => {
    const prefix = options?.prefix ?? "";
    const get = reader(input);
    const state: Values = {};
    for (const slice of slices) {
      let value: unknown;
      if (slice.fields) {
        const next: Values = isObject(slice.default) ? { ...slice.default } : {};
        for (const param of slice.params) {
          if (param.field === undefined) continue;
          const item = param.codec.parse(get(prefix + param.name), param.default);
          if (item === undefined) delete next[param.field];
          else next[param.field] = item;
        }
        value = next;
      } else {
        const param = slice.params[0];
        value = param ? param.codec.parse(get(prefix + param.name), param.default) : slice.default;
      }
      const normalize = slice.feature?.def.state?.normalize;
      state[slice.name] = normalize ? normalize(value, tableDef.columns) : value;
    }
    const request: Values = {};
    for (const feature of features) {
      const make = feature.def.request;
      if (make) request[feature.name] = make(feature.name in state ? state[feature.name] : starts.get(feature), feature.options);
    }
    const frozenState = Object.freeze(state);
    const frozenRequest = Object.freeze(request);
    const requestKey = stableStringify(frozenRequest);
    return Object.freeze({
      state: frozenState,
      request: frozenRequest,
      requestKey,
      serialize: (write?: Pick<UrlSerializeOptions, "clearOnDefault">) => serialize(frozenState, { ...write, prefix }),
      dehydrate: () => Object.freeze({ request: frozenRequest, requestKey }),
    });
  };

  const serialize = (state: Readonly<Values>, options?: UrlSerializeOptions) => {
    const prefix = options?.prefix ?? "";
    const clear = options?.clearOnDefault !== false;
    const query = new URLSearchParams();
    for (const slice of slices) {
      const value = slice.name in state ? state[slice.name] : slice.default;
      for (const param of slice.params) {
        const item = param.field === undefined ? value : isObject(value) ? value[param.field] : undefined;
        if (item === undefined || (clear && param.equals(item, param.default))) continue;
        const text = param.codec.serialize(item);
        if (text === undefined) continue;
        for (const one of typeof text === "string" ? [text] : text) query.append(prefix + param.name, one);
      }
    }
    return query;
  };

  const all = slices.flatMap((slice) => slice.params);
  const url = {
    tableDef,
    schema,
    defaults: Object.freeze(defaults),
    paramNames: Object.freeze(paramNames),
    sizes,
    parse,
    serialize,
    toQueryString: (state: Readonly<Values>, options?: UrlSerializeOptions) => serialize(state, options).toString(),
    getParamDescriptors: (options?: UrlPrefixOptions): readonly UrlParamDescriptor[] =>
      Object.freeze(
        all.map((param) =>
          Object.freeze({
            key: (options?.prefix ?? "") + param.name,
            slice: param.slice,
            ...(param.field === undefined ? {} : { field: param.field }),
            default: param.default,
            parse: (raw: RawParam) => param.codec.parse(raw, param.default),
            serialize: param.codec.serialize,
            equals: param.equals,
          }),
        ),
      ),
  };
  // The runtime works on slices by name with values left unknown. The public types tie each slice to its state.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return Object.freeze(url) as unknown as TableUrl<TDef, TSchema>;
}

/**
 * Parses a table's URL: `parseTableUrl(usersUrl, await searchParams)` in a
 * server component, or with `URLSearchParams` or a query string anywhere.
 */
export function parseTableUrl<TDef extends AnyTableDef, TSchema>(
  tableUrl: TableUrl<TDef, TSchema>,
  searchParams: SearchParamsInput,
  options?: UrlPrefixOptions,
): ParsedTableUrl<TDef, TSchema> {
  return tableUrl.parse(searchParams, options);
}
