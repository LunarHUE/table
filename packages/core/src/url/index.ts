// Table state in the query string, free of any router: codecs for query
// parameters and feature slices, `defineTableUrl`, which ties them to a
// table definition and its defaults, and `parseTableUrl`, which turns a
// query into state and the server request. Nothing here is in the main
// entry, so a table that keeps no state in the URL ships none of it.

/** The entry's name, as published. */
export const urlName = "@lunarhue/table-core/url";

export {
  arrayParam,
  booleanParam,
  enumParam,
  numberParam,
  stringParam,
  type ArrayParamOptions,
  type NumberParamOptions,
  type ParamOptions,
  type RawParam,
  type SerializedParam,
  type StringParamOptions,
  type UrlParamCodec,
} from "./params.js";
export {
  pageCodec,
  sortCodec,
  type PageCodecOptions,
  type ResolvedSliceCodec,
  type SliceCodec,
  type SliceCodecContext,
  type SliceParam,
  type SortCodecOptions,
} from "./slices.js";
export {
  defineTableUrl,
  parseTableUrl,
  type AnySliceSchema,
  type DehydratedTableUrl,
  type FieldCodecs,
  type ParsedTableUrl,
  type SearchParamsInput,
  type SliceSchema,
  type TableUrl,
  type UrlParamDescriptor,
  type UrlPrefixOptions,
  type UrlSchema,
  type UrlSearchParams,
  type UrlSerializeOptions,
  type UrlStateOf,
} from "./table-url.js";
