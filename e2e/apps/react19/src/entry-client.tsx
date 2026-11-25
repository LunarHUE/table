import { App } from "@lunarhue/table-e2e-react-shared/app";
import { appElementId } from "@lunarhue/table-e2e/contract";
import { hydrateRoot } from "react-dom/client";

const container = document.getElementById(appElementId);
if (container === null) throw new Error(`No #${appElementId} element.`);
hydrateRoot(container, <App path={location.pathname} search={location.search} />);
