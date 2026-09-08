import { createRoot } from "react-dom/client";
import "./index.css";

const el = document.getElementById("root");
if (!el) throw new Error("missing #root element");

createRoot(el).render(<div>Reel</div>);
