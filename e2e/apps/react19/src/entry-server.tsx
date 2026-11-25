import { App } from "@lunarhue/table-e2e-react-shared/app";
import { type RenderPage, statusFor } from "@lunarhue/table-e2e/contract";
import { renderToString } from "react-dom/server";

export const render: RenderPage = (path, search) => ({
  status: statusFor(path),
  head: "",
  body: renderToString(<App path={path} search={search} />),
});
