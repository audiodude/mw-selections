import { copyFile, rm } from "node:fs/promises";

// npm runs each package's build with that workspace as its working directory.
await rm("dist", { recursive: true, force: true });
await copyFile(new URL("../LICENSE", import.meta.url), "LICENSE");
