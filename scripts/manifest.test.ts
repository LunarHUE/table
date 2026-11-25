import { describe, expect, it } from "vitest";
import { withoutCondition } from "./manifest.js";

const strip = (manifest: object): unknown => JSON.parse(withoutCondition(JSON.stringify(manifest), "src"));

describe("withoutCondition", () => {
  it("drops the condition from every subpath and keeps the rest in order", () => {
    const manifest = {
      name: "pkg",
      exports: {
        ".": { src: "./src/index.ts", import: { types: "./a.d.ts", default: "./a.js" }, require: "./a.cjs" },
        "./plugins": { src: "./src/plugins.ts", default: "./plugins.js" },
        "./package.json": "./package.json",
      },
      files: ["dist"],
    };
    const expected = {
      name: "pkg",
      exports: {
        ".": { import: { types: "./a.d.ts", default: "./a.js" }, require: "./a.cjs" },
        "./plugins": { default: "./plugins.js" },
        "./package.json": "./package.json",
      },
      files: ["dist"],
    };
    // Compared as text so key order counts too.
    expect(withoutCondition(JSON.stringify(manifest), "src")).toBe(`${JSON.stringify(expected, undefined, 2)}\n`);
  });

  it("drops it when nested under another condition or inside a fallback array", () => {
    expect(strip({ exports: { node: { src: "./x.ts", default: "./x.js" }, browser: [{ src: "./y.ts" }, "./y.js"] } })).toEqual({
      exports: { node: { default: "./x.js" }, browser: [{}, "./y.js"] },
    });
  });

  it("drops the condition from imports too and keeps key order", () => {
    const manifest = {
      name: "pkg",
      exports: { ".": { src: "./src/index.ts", default: "./dist/index.js" } },
      imports: {
        "#internal": {
          src: { legacy: "./src/legacy.ts", default: "./src/modern.ts" },
          legacy: "./dist/legacy.js",
          default: "./dist/modern.js",
        },
      },
      files: ["dist"],
    };
    const expected = {
      name: "pkg",
      exports: { ".": { default: "./dist/index.js" } },
      imports: {
        "#internal": {
          legacy: "./dist/legacy.js",
          default: "./dist/modern.js",
        },
      },
      files: ["dist"],
    };
    expect(withoutCondition(JSON.stringify(manifest), "src")).toBe(`${JSON.stringify(expected, undefined, 2)}\n`);
  });

  it("leaves fields outside exports and imports alone", () => {
    const manifest = { dependencies: { src: "1.0.0" }, exports: "./index.js" };
    expect(strip(manifest)).toEqual(manifest);
  });

  it("returns a manifest without exports or imports unchanged", () => {
    const text = '{"name": "pkg"}';
    expect(withoutCondition(text, "src")).toBe(text);
  });
});
