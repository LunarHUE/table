// Codecs for one query parameter each. A codec reads the raw value a router
// hands over, which is a string, a list of strings for a repeated key, or
// undefined for a missing one, and writes a value back. `parse` never
// throws: input it can't read gives the fallback, then the codec's default,
// then `undefined`. So `roleCodec.parse(event.target.value)` works on its own
// in a form handler, and `defineTableUrl` passes the table's own default as
// the fallback.

/** A query parameter as routers give it: one value, the values of a repeated key, or nothing. */
export type RawParam = string | readonly string[] | undefined;

/** What a codec writes: one value, values for a repeated key, or nothing, which leaves the key out. */
export type SerializedParam = string | readonly string[] | undefined;

/**
 * Reads and writes one query parameter. The members are methods, so a codec
 * of a narrower value fits a filter of a wider one.
 */
export interface UrlParamCodec<T> {
  /** The value in `raw`, or `fallback` when it is missing or invalid, or the codec's `default` when `fallback` is undefined. */
  parse(this: void, raw: RawParam, fallback?: T): T;
  serialize(this: void, value: T): SerializedParam;
  /** Whether two values are equal, to leave defaults out of the URL. Defaults to comparing values deeply. */
  equals?(this: void, a: T, b: T): boolean;
  readonly default?: T;
  /** The query key, when it isn't the filter or slice name. */
  readonly param?: string;
}

/** What every built-in codec takes. */
export interface ParamOptions<T> {
  readonly default?: T;
  /** The query key, when it isn't the filter or slice name. */
  readonly param?: string;
}

/** The first value of a raw parameter. */
export const firstValue = (raw: RawParam): string | undefined => (typeof raw === "string" ? raw : raw?.[0]);

/** Makes a codec from a reader of one string. `read` returns undefined for text it rejects. */
const scalar = <T>(options: ParamOptions<T> | undefined, read: (text: string) => T | undefined): UrlParamCodec<T | undefined> =>
  Object.freeze({
    ...options,
    parse: (raw: RawParam, fallback?: T) => {
      const text = firstValue(raw);
      const value = text === undefined ? undefined : read(text);
      return value !== undefined ? value : fallback !== undefined ? fallback : options?.default;
    },
    serialize: (value: T | undefined) => (value === undefined ? undefined : String(value)),
  });

/** What `stringParam` takes. */
export interface StringParamOptions extends ParamOptions<string> {
  /** Trims whitespace from both ends. */
  readonly trim?: boolean;
}

/** A text parameter. An empty value, as in `?q=`, is the empty string. */
export function stringParam(options: StringParamOptions & { readonly default: string }): UrlParamCodec<string>;
export function stringParam(options?: StringParamOptions): UrlParamCodec<string | undefined>;
export function stringParam(options?: StringParamOptions): UrlParamCodec<string | undefined> {
  return scalar(options, (text) => (options?.trim ? text.trim() : text));
}

/** What `numberParam` takes. */
export interface NumberParamOptions extends ParamOptions<number> {
  readonly min?: number;
  readonly max?: number;
  /** Rejects fractions. */
  readonly integer?: boolean;
}

/** A number parameter. Blank text, NaN, infinities, fractions with `integer`, and numbers out of `min`..`max` are invalid. */
export function numberParam(options: NumberParamOptions & { readonly default: number }): UrlParamCodec<number>;
export function numberParam(options?: NumberParamOptions): UrlParamCodec<number | undefined>;
export function numberParam(options?: NumberParamOptions): UrlParamCodec<number | undefined> {
  return scalar(options, (text) => {
    const n = text.trim() ? Number(text) : Number.NaN;
    const valid =
      Number.isFinite(n) &&
      !(options?.integer && !Number.isInteger(n)) &&
      !(options?.min !== undefined && n < options.min) &&
      !(options?.max !== undefined && n > options.max);
    return valid ? n : undefined;
  });
}

/** A flag parameter: `true` or `1`, and `false` or `0`. Anything else is invalid. */
export function booleanParam(options: ParamOptions<boolean> & { readonly default: boolean }): UrlParamCodec<boolean>;
export function booleanParam(options?: ParamOptions<boolean>): UrlParamCodec<boolean | undefined>;
export function booleanParam(options?: ParamOptions<boolean>): UrlParamCodec<boolean | undefined> {
  return scalar(options, (text) => (text === "true" || text === "1" ? true : text === "false" || text === "0" ? false : undefined));
}

/** One of a fixed list of strings. Any other string is invalid. */
export function enumParam<const TValues extends readonly string[]>(
  values: TValues,
  options: ParamOptions<TValues[number]> & { readonly default: TValues[number] },
): UrlParamCodec<TValues[number]>;
export function enumParam<const TValues extends readonly string[]>(
  values: TValues,
  options?: ParamOptions<TValues[number]>,
): UrlParamCodec<TValues[number] | undefined>;
export function enumParam<const TValues extends readonly string[]>(
  values: TValues,
  options?: ParamOptions<TValues[number]>,
): UrlParamCodec<TValues[number] | undefined> {
  return scalar(options, (text) => values.find((value) => value === text));
}

/** What `arrayParam` takes. */
export interface ArrayParamOptions<TItem> extends ParamOptions<TItem[]> {
  /** Splits one value into items. Defaults to `","`. */
  readonly separator?: string;
}

/**
 * A list parameter. It reads a repeated key, `?tag=a&tag=b`, a delimited
 * value, `?tags=a,b`, or both, and drops items the item codec rejects. An
 * empty value, `?tags=`, is the empty list; a value whose items are all
 * invalid is invalid. It writes one delimited value, or a repeated key when
 * an item holds the separator.
 */
export function arrayParam<TItem>(
  item: UrlParamCodec<TItem>,
  options: ArrayParamOptions<Exclude<TItem, undefined>> & { readonly default: Exclude<TItem, undefined>[] },
): UrlParamCodec<Exclude<TItem, undefined>[]>;
export function arrayParam<TItem>(
  item: UrlParamCodec<TItem>,
  options?: ArrayParamOptions<Exclude<TItem, undefined>>,
): UrlParamCodec<Exclude<TItem, undefined>[] | undefined>;
export function arrayParam<TItem>(
  item: UrlParamCodec<TItem>,
  options?: ArrayParamOptions<Exclude<TItem, undefined>>,
): UrlParamCodec<Exclude<TItem, undefined>[] | undefined> {
  type Item = Exclude<TItem, undefined>;
  const separator = options?.separator ?? ",";
  return Object.freeze({
    ...options,
    parse: (raw: RawParam, fallback?: Item[]) => {
      const texts = raw === undefined ? [] : (typeof raw === "string" ? [raw] : raw).flatMap((text) => (text ? text.split(separator) : []));
      const items: Item[] = [];
      for (const text of texts) {
        const value = item.parse(text);
        // `Item` is `TItem` without undefined, and the check took undefined out.
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        if (value !== undefined) items.push(value as Item);
      }
      if (raw !== undefined && (texts.length === 0 || items.length > 0)) return items;
      return fallback !== undefined ? fallback : options?.default;
    },
    serialize: (values: Item[] | undefined) => {
      if (values === undefined) return undefined;
      const texts = values.flatMap((value) => item.serialize(value) ?? []);
      return texts.some((text) => text.includes(separator)) ? texts : texts.join(separator);
    },
  });
}
