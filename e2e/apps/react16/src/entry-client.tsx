import { App } from "@lunarhue/table-e2e-react-shared/app";
import { appElementId } from "@lunarhue/table-e2e/contract";
import type { ReactElement } from "react";
import * as ReactDOM from "react-dom";

// React before 18 hydrates with `ReactDOM.hydrate`. The types are React 19's, which lack it.
// oxlint-disable-next-line typescript/no-unsafe-type-assertion
const { hydrate } = ReactDOM as unknown as { hydrate: (element: ReactElement, container: Element) => void };

const container = document.getElementById(appElementId);
if (container === null) throw new Error(`No #${appElementId} element.`);
hydrate(<App path={location.pathname} search={location.search} />, container);
