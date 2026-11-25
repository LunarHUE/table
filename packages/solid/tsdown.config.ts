import { libraryBuild } from "../../tsdown.base.ts";

// The test helpers under src/test are plain .ts too, and never ship.
export default libraryBuild().map((config) => {
  const entry = Array.isArray(config.entry) ? config.entry : [];
  return { ...config, entry: [...entry, "!src/test/**"] };
});
