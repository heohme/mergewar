import { cp, mkdir, rm } from "node:fs/promises";

const output = new URL("../dist/", import.meta.url);
const project = new URL("../", import.meta.url);

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

for (const file of ["index.html", "styles.css"]) {
  await cp(new URL(file, project), new URL(file, output));
}
await cp(new URL("src/", project), new URL("src/", output), { recursive: true });

console.log("Built static site in dist/");
