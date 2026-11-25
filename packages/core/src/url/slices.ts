import type { AnyTableDef } from "../define-table.js";
import type { AnyFeature } from "../feature.js";
import type { SortEntry, SortingState } from "../features/sorting.js";
import { firstValue, type RawParam, type UrlParamCodec } from "./params.js";

// Codecs for a whole feature slice. They need the table: the sort codec
// checks ids against the sortable columns and the page codec reads the
// allowed sizes from the pagination feature, so `defineTableUrl` resolves
// them against the table definition once.

/** One query parameter of a slice. */
export interface SliceParam {
  /** The query key, before any prefix. */
  readonly name: string;
  /** The key in the slice's state this parameter holds, or none when it holds the whole slice. */
  readonly field?: string;
  readonly codec: UrlParamCodec<unknown>;
}

/** What a slice codec gets from `defineTableUrl`. */
export interface SliceCodecContext {
  readonly tableDef: AnyTableDef;
  /** The feature that owns the slice, when the table has one. */
  readonly feature: AnyFeature | undefined;
}

/** A slice codec, resolved against a table. */
export interface ResolvedSliceCodec {
  readonly params: readonly SliceParam[];
  /** The page sizes the URL accepts, for a pagination codec. */
  readonly sizes?: readonly number[];
}

/** A codec for the whole slice of feature `TName`, as `sortCodec` and `pageCodec` make. */
export interface SliceCodec<TName extends string = string> {
  readonly slice: TName;
  resolve(this: void, ctx: SliceCodecContext): ResolvedSliceCodec;
}

/** An option of a feature, when its options are an object that has it. */
const optionOf = (feature: AnyFeature | undefined, key: string): unknown => {
  const options = feature?.options;
  if (typeof options !== "object" || options === null) return undefined;
  const value: unknown = Reflect.get(options, key);
  return value;
};

/** What `sortCodec` takes. */
export interface SortCodecOptions {
  /** The query key. Defaults to `"sort"`. */
  readonly param?: string;
  /** Whether the URL may hold more than one column. Defaults to the sorting feature's `multi`, which defaults to true. */
  readonly multi?: boolean;
}

/**
 * The sort list as `?sort=-createdAt,name`: a `-` before a column sorts it
 * descending. Reading also takes `createdAt:desc` and a repeated key. Ids of
 * columns that aren't sortable, and repeats, are dropped; with `multi: false`
 * only the first column is kept. `?sort=` is no sort, and a value with no
 * valid column is invalid.
 */
export function sortCodec(options?: SortCodecOptions): SliceCodec<"sorting"> {
  return Object.freeze({
    slice: "sorting" as const,
    resolve: ({ tableDef, feature }: SliceCodecContext): ResolvedSliceCodec => {
      const sortable = new Set(tableDef.columns.filter((column) => column.sortable === true).map((column) => column.id));
      const multi = options?.multi ?? optionOf(feature, "multi") !== false;
      const codec: UrlParamCodec<SortingState | undefined> = {
        parse: (raw: RawParam, fallback?: SortingState) => {
          const texts = raw === undefined ? [] : (typeof raw === "string" ? [raw] : raw).flatMap((text) => text.split(","));
          const sort: SortEntry[] = [];
          let tokens = 0;
          for (const text of texts) {
            const token = text.trim();
            if (!token) continue;
            tokens++;
            const [name = "", dir] = token.split(":");
            const desc = dir === undefined ? name.startsWith("-") : dir === "desc";
            const id = dir === undefined && desc ? name.slice(1) : name;
            if ((dir === undefined || dir === "asc" || dir === "desc") && sortable.has(id) && !sort.some((entry) => entry.id === id)) {
              sort.push({ id, desc });
            }
          }
          if (raw === undefined || (tokens > 0 && sort.length === 0)) return fallback;
          return multi ? sort : sort.slice(0, 1);
        },
        serialize: (sort) => sort?.map((entry) => (entry.desc ? "-" : "") + entry.id).join(","),
      };
      return { params: [{ name: options?.param ?? "sort", codec }] };
    },
  });
}

/** What `pageCodec` takes. */
export interface PageCodecOptions {
  /** The number of the first page in the URL. Defaults to 1, so `?page=2` is page index 1. */
  readonly base?: 0 | 1;
  /** The query key of the page. Defaults to `"page"`. */
  readonly pageParam?: string;
  /** The query key of the page size. Defaults to `"pageSize"`. */
  readonly sizeParam?: string;
  /** The page sizes the URL accepts. Defaults to the pagination feature's `sizes`, then `[10, 25, 50, 100]`. */
  readonly sizes?: readonly number[];
}

const defaultSizes: readonly number[] = [10, 25, 50, 100];

const isNumbers = (value: unknown): value is readonly number[] =>
  Array.isArray(value) && value.every((item) => typeof item === "number");

/** Reads a whole number from the first value. NaN for anything else. */
const integerOf = (raw: RawParam): number => {
  const text = firstValue(raw)?.trim();
  const n = text ? Number(text) : Number.NaN;
  return Number.isInteger(n) ? n : Number.NaN;
};

/**
 * The page as `?page=2&pageSize=25`. A page under the base, or one that
 * isn't a whole number, is invalid, and so is a size that isn't one of the
 * allowed sizes. Invalid values give the table's default page and size.
 */
export function pageCodec(options?: PageCodecOptions): SliceCodec<"pagination"> {
  return Object.freeze({
    slice: "pagination" as const,
    resolve: ({ feature }: SliceCodecContext): ResolvedSliceCodec => {
      const base = options?.base ?? 1;
      const inherited = optionOf(feature, "sizes");
      const sizes = Object.freeze([...(options?.sizes ?? (isNumbers(inherited) ? inherited : defaultSizes))]);
      const page: UrlParamCodec<number | undefined> = {
        parse: (raw, fallback) => {
          const index = integerOf(raw) - base;
          return index >= 0 ? index : fallback;
        },
        serialize: (index) => (index === undefined ? undefined : String(index + base)),
      };
      const size: UrlParamCodec<number | undefined> = {
        parse: (raw, fallback) => {
          const n = integerOf(raw);
          return sizes.includes(n) ? n : fallback;
        },
        serialize: (n) => (n === undefined ? undefined : String(n)),
      };
      return {
        params: [
          { name: options?.pageParam ?? "page", field: "pageIndex", codec: page },
          { name: options?.sizeParam ?? "pageSize", field: "pageSize", codec: size },
        ],
        sizes,
      };
    },
  });
}
