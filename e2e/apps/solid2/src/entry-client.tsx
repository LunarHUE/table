import { App } from "@lunarhue/table-e2e-solid-shared/app";
import { appElementId } from "@lunarhue/table-e2e/contract";
import { hydrate } from "@solidjs/web";

const container = document.getElementById(appElementId);
if (container === null) throw new Error(`No #${appElementId} element.`);
hydrate(() => <App path={location.pathname} search={location.search} />, container);
