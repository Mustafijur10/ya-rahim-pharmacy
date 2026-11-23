// Fails if any stylesheet other than styles/app.css exists in the frontend source.
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const allowed = "styles/app.css";
const skip = new Set(["node_modules", ".next", "public", ".git"]);
const bad = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (skip.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.(css|scss|sass|less)$/.test(name)) {
      const rel = relative(root, full).replaceAll("\\", "/");
      if (rel !== allowed) bad.push(rel);
    }
  }
}

walk(root);

if (bad.length) {
  console.error(`Only ${allowed} may contain CSS. Move these styles into it:\n  ${bad.join("\n  ")}`);
  process.exit(1);
}
console.log(`CSS check passed: ${allowed} is the only stylesheet.`);
