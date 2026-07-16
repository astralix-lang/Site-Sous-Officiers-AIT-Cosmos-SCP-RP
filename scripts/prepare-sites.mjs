import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

function copy(source, destination) {
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(source, destination);
}

if (!existsSync("dist/server/index.js")) {
  copy("dist/server/index.mjs", "dist/server/index.js");
}
copy(".openai/hosting.json", "dist/.openai/hosting.json");

console.log("Sites package prepared.");
