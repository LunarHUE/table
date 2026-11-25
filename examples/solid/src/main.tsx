import { render } from "@solidjs/web";
import { App } from "./app.tsx";

const container = document.getElementById("root");
if (container === null) throw new Error("No #root element.");
render(() => <App />, container);
