import { expect, it } from "vitest";
import { coreName } from "./index.js";
import { urlName } from "./url/index.js";

it("names the package and its url entry", () => {
  expect(coreName).toBe("@lunarhue/table-core");
  expect(urlName).toBe("@lunarhue/table-core/url");
});
