import { App } from "@lunarhue/table-e2e-solid-shared/app";
import { type RenderPage, statusFor } from "@lunarhue/table-e2e/contract";
import { generateHydrationScript, renderToString } from "@solidjs/web";

export const render: RenderPage = (path, search) => ({
  status: statusFor(path),
  head: generateHydrationScript(),
  body: renderToString(() => <App path={path} search={search} />),
});
