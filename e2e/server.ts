// The one server every app runs on: `node server.ts <app dir> <port>`.
// It imports the app's built server entry, renders each request with it,
// wraps the markup in the same document for every framework, and serves the
// client build. Node runs this file as it is, so it imports no local module
// at runtime.
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import type { RenderedPage, RenderPage } from "./contract/index.js";

const [appArg, portArg] = process.argv.slice(2);
if (appArg === undefined || portArg === undefined) throw new Error("Usage: node server.ts <app dir> <port>");

const app = resolve(appArg);
const clientDir = join(app, "dist", "client");
const entry = pathToFileURL(join(app, "dist", "server", "entry-server.js")).href;
const isEntry = (value: unknown): value is { render: RenderPage } =>
  typeof value === "object" && value !== null && "render" in value && typeof value.render === "function";

const built: unknown = await import(entry);
if (!isEntry(built)) throw new Error(`${entry} doesn't export a render function.`);
const { render } = built;
const styles = await readFile(new URL("contract/styles.css", import.meta.url), "utf8");

// Mirrors `appElementId` and `clientEntry` in contract/page.ts, which this file can't import at runtime.
const appElementId = "app";
const clientEntry = "assets/client.js";

const types: Readonly<Record<string, string>> = {
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".map": "application/json",
};

function document(page: RenderedPage): string {
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    "<title>Table end-to-end</title>",
    // No favicon request, so a 404 never shows up as a console error.
    '<link rel="icon" href="data:,">',
    `<style>${styles}</style>`,
    page.head,
    "</head>",
    "<body>",
    `<div id="${appElementId}">${page.body}</div>`,
    `<script type="module" src="/${clientEntry}"></script>`,
    "</body>",
    "</html>",
  ].join("\n");
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://localhost");
  if (url.pathname.startsWith("/assets/")) {
    const file = join(clientDir, url.pathname);
    if (!file.startsWith(clientDir + sep)) {
      response.writeHead(404).end();
      return;
    }
    readFile(file).then(
      (body) => response.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" }).end(body),
      () => response.writeHead(404).end(),
    );
    return;
  }
  try {
    // The query string goes to the app too, so a page bound to the URL renders its state on the server.
    const page = render(url.pathname, url.search);
    response.writeHead(page.status, { "content-type": "text/html; charset=utf-8" }).end(document(page));
  } catch (error) {
    console.error(error);
    response.writeHead(500, { "content-type": "text/plain; charset=utf-8" }).end(String(error));
  }
});

server.listen(Number(portArg), "127.0.0.1", () => {
  console.log(`Serving ${appArg} at http://127.0.0.1:${portArg}`);
});
