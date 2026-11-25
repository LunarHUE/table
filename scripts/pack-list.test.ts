import { describe, expect, it } from "vitest";
import { fileDiff, parsePackList, tarPaths } from "./pack-list.js";

describe("parsePackList", () => {
  it("reads path and mode of each file", () => {
    const json = JSON.stringify([
      {
        name: "pkg",
        version: "1.0.0",
        files: [
          { path: "LICENSE", size: 1065, mode: 420 },
          { path: "dist/index.js", size: 10, mode: 493 },
        ],
      },
    ]);
    expect(parsePackList(json)).toEqual([
      { path: "LICENSE", mode: 420 },
      { path: "dist/index.js", mode: 493 },
    ]);
  });

  it.each([
    ["no package", "[]", "exactly one package"],
    ["two packages", '[{"files": []}, {"files": []}]', "exactly one package"],
    ["no files", '[{"name": "pkg"}]', "no files"],
    ["a file without a mode", '[{"files": [{"path": "LICENSE"}]}]', "without a path and mode"],
    ["a file that is a string", '[{"files": ["LICENSE"]}]', "isn't an object"],
  ])("throws on %s", (_, json, message) => expect(() => parsePackList(json)).toThrow(message));
});

describe("tarPaths", () => {
  it("drops the package/ prefix and the trailing newline", () => {
    expect(tarPaths("package/package.json\npackage/dist/index.js\n")).toEqual(["package.json", "dist/index.js"]);
  });
});

describe("fileDiff", () => {
  it("is empty for the same files in another order", () => {
    expect(fileDiff(["a", "b"], ["b", "a"])).toEqual([]);
  });

  it("names the files missing from the tarball and the ones it shouldn't have", () => {
    expect(fileDiff(["a", "b.d.ts"], ["a", "c"])).toEqual(["- b.d.ts", "+ c"]);
  });
});
