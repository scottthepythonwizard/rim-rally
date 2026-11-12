import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";

const root = fileURLToPath(new URL("../", import.meta.url));
const from = fileURLToPath(new URL("../src/app/globals.css", import.meta.url));
const to = fileURLToPath(new URL("../rim_rally/static/rim_rally/site.css", import.meta.url));
const source = await readFile(from, "utf8");
const result = await postcss([tailwindcss({ base: root, optimize: true })])
  .process(source, { from, to });
await writeFile(to, result.css);
