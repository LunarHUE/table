import { libraryBuild } from "../../tsdown.base.ts";

// Runtime tests and their helpers live under src too, as .test.tsx files and src/test.
// `#lunarhue/react` stays as written, so the app's bundler picks the module
// through the package's `imports` and the conditions it sets.
export default libraryBuild().map((config) => ({
  ...config,
  entry: [...(Array.isArray(config.entry) ? config.entry : []), "!src/**/*.test.tsx", "!src/test/**"],
  plugins: [
    ...(Array.isArray(config.plugins) ? config.plugins : []),
    {
      name: "lunarhue:react-import",
      resolveId: (source: string) => (source === "#lunarhue/react" ? { id: source, external: true } : null),
    },
  ],
}));
