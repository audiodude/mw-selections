import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const core = "@audiodude/selection-core";
const picker = "@audiodude/selection-picker";
const standalone = `${picker}/selection-picker.min.js`;

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    env: { ...process.env, NODE_PATH: "" },
  });
  if (result.error || result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed in ${cwd}\n${result.error?.message ?? ""}\n${result.stdout ?? ""}${result.stderr ?? ""}`,
    );
  }
  return result.stdout;
}

function npm(args, cwd) {
  // npm supplies its JavaScript entrypoint, avoiding platform-specific npm.cmd shells.
  assert.ok(process.env.npm_execpath, "Run this check with npm run check:packages (after npm ci).");
  return run(process.execPath, [process.env.npm_execpath, ...args], cwd);
}

function resolveImport(specifier, cwd) {
  const url = JSON.parse(run(process.execPath, [
    "--input-type=module", "--eval",
    `console.log(JSON.stringify(import.meta.resolve(${JSON.stringify(specifier)})))`,
  ], cwd));
  return fileURLToPath(url);
}

function inspectPack(pack, name) {
  assert.equal(pack.name, name, "Unexpected packed package name");
  const files = new Map(pack.files.map((file) => [file.path, file.size]));
  const required = ["package.json", "dist/index.js", "dist/index.d.ts"];
  if (name === picker) required.push("dist/selection-picker.min.js");
  for (const file of required) {
    assert.ok(files.get(file) > 0, `${name}: missing or empty ${file}; run npm run build first`);
  }
  for (const document of ["readme", "license"]) {
    assert.ok(
      [...files].some(([path, size]) => new RegExp(`^${document}(?:\\.[^/]+)?$`, "i").test(path) && size > 0),
      `${name}: missing ${document}`,
    );
  }
  for (const file of files.keys()) {
    const forbidden =
      /(^|\/)(?:src|tests?|__tests__|fixtures|node_modules|coverage|examples)(\/|$)/i.test(file) ||
      /(^|\/)\./.test(file) ||
      /(?:^|\/)(?:.*(?:secret|credential).*|tsconfig[^/]*\.json|(?:vite|vitest)\.config\.[^/]+)$/i.test(file) ||
      /\.(?:test|spec)\.[^/]+$/i.test(file) ||
      /\.(?:pem|key|p12|pfx|env|tgz|zip|tsbuildinfo|map)$/i.test(file) ||
      (/\.(?:tsx?|mts|cts)$/i.test(file) && !/\.d\.(?:ts|mts|cts)$/i.test(file));
    assert.ok(!forbidden, `${name}: unexpected source, test, configuration, or sensitive file in tarball: ${file}`);
  }
  console.log(`Checked ${name}@${pack.version}: ${files.size} packed files`);
}

async function check() {
  const args = process.argv.slice(2);
  assert.ok(
    args.length === 0 || (args.length === 2 && args[0] === "--browser-output"),
    "Usage: npm run check:packages -- [--browser-output /path/to/consumer.js]",
  );
  const browserOutput = args.length ? resolve(args[1]) : undefined;
  const temporary = await mkdtemp(join(tmpdir(), "mw-selections-packages-"));
  try {
    const tarballs = [];
    for (const [directory, name] of [["selection-core", core], ["selection-picker", picker]]) {
      const output = npm(
        ["pack", "--ignore-scripts", "--json", "--pack-destination", temporary],
        join(root, "packages", directory),
      );
      // npm versions return either an array or a package-name-keyed object.
      const packs = Object.values(JSON.parse(output));
      assert.equal(packs.length, 1, `${name}: expected one tarball`);
      inspectPack(packs[0], name);
      tarballs.push(join(temporary, packs[0].filename));
    }

    const consumer = join(temporary, "consumer");
    await mkdir(consumer);
    await writeFile(join(consumer, "package.json"), JSON.stringify({ private: true, type: "module" }));
    // Install both tarballs together so the picker's core dependency uses this release,
    // not a workspace link or a registry copy of selection-core.
    npm([
      "install", "--ignore-scripts", "--no-audit", "--no-fund", "--package-lock=false",
      "--workspaces=false", ...tarballs,
    ], consumer);
    for (const name of [core, picker]) {
      const entry = resolveImport(name, consumer);
      assert.equal(await realpath(entry), join(await realpath(consumer), "node_modules", name, "dist", "index.js"),
        `${name}: package must resolve to its installed artifact, not source or a workspace link`);
    }
    assert.equal(
      resolveImport(core, dirname(resolveImport(picker, consumer))),
      resolveImport(core, consumer),
      "Picker must consume the same locally packed core release",
    );
    const standalonePath = resolveImport(standalone, consumer);

    await writeFile(join(consumer, "runtime.mjs"), `
import assert from "node:assert/strict";
import { normalizeManualText, serializeSelectionJson, parseSelectionJson } from "${core}";
const normalized = normalizeManualText("Statue of Liberty\\n# ignored\\nStatue_of_Liberty\\nhttps://en.wikipedia.org/wiki/New_York_City");
assert.equal(normalized.ok, true);
assert.deepEqual(normalized.value.pages, ["Statue_of_Liberty", "New_York_City"]);
const selection = { dbname: "enwiki", pages: normalized.value.pages, source: { type: "simple" } };
const serialized = serializeSelectionJson(selection);
assert.equal(serialized.ok, true);
assert.deepEqual(JSON.parse(serialized.value), selection);
assert.deepEqual(parseSelectionJson(serialized.value), { ok: true, value: selection });
console.log("Packed core ESM normalization and serialization passed");
`);
    process.stdout.write(run(process.execPath, ["runtime.mjs"], consumer));

    await writeFile(join(consumer, "core-consumer.ts"), `
import { normalizeManualText, serializeSelectionJson, type Item, type Result, type Selection, type FetchLike } from "${core}";
const normalized: Result<{ pages: Item[] }> = normalizeManualText("Statue of Liberty");
if (!normalized.ok) throw new Error(normalized.error.message);
const selection: Selection = { dbname: "enwiki", pages: normalized.value.pages };
const json: Result<string> = serializeSelectionJson(selection);
const fetchImpl: FetchLike = fetch;
void [json, fetchImpl];
`);
    await writeFile(join(consumer, "tsconfig.node.json"), JSON.stringify({
      compilerOptions: {
        target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext",
        lib: ["ES2022"], types: ["node"], typeRoots: [join(root, "node_modules", "@types")],
        strict: true, noEmit: true, skipLibCheck: false,
      },
      files: ["core-consumer.ts"],
    }));
    run(process.execPath, [require.resolve("typescript/bin/tsc"), "-p", "tsconfig.node.json"], consumer);

    await writeFile(join(consumer, "consumer.ts"), `
import { normalizeManualText, serializeSelectionJson, type Item, type Result, type Selection } from "${core}";
import { SelectionPicker, defineSelectionPicker, PICKER_MODES, type PickerMode, type Mode } from "${picker}";
const result: Result<{ pages: Item[] }> = normalizeManualText("Statue of Liberty");
if (!result.ok) throw new Error(result.error.message);
const selection: Selection = { dbname: "enwiki", pages: result.value.pages };
const serialized: Result<string> = serializeSelectionJson(selection);
defineSelectionPicker();
const element: SelectionPicker = new SelectionPicker();
const htmlElement: HTMLElement = element;
const selected: Promise<Selection> = element.open(selection);
const modes: readonly PickerMode[] = PICKER_MODES;
const mode: Mode = modes[0].name;
void [serialized, htmlElement, selected, mode];
`);
    await writeFile(join(consumer, "tsconfig.json"), JSON.stringify({
      compilerOptions: {
        target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext",
        lib: ["ES2022", "DOM", "DOM.Iterable"], types: [], strict: true,
        noEmit: true, skipLibCheck: false,
      },
      files: ["consumer.ts"],
    }));
    run(process.execPath, [require.resolve("typescript/bin/tsc"), "-p", "tsconfig.json"], consumer);
    console.log("Packed Node core and browser picker TypeScript consumers passed");

    const browserEntry = join(consumer, "browser.js");
    const bundle = join(consumer, "consumer.js");
    await writeFile(browserEntry, `import "${picker}";
if (!customElements.get("selection-picker")) {
  throw new Error("Packed picker side-effect import did not register selection-picker");
}
`);
    await build({
      absWorkingDir: consumer, entryPoints: [browserEntry], outfile: bundle,
      bundle: true, format: "esm", platform: "browser", target: "es2022",
      minify: true, treeShaking: true, logOverride: { "ignored-bare-import": "error" },
    });
    // With bundling disabled, esbuild reports any remaining runtime imports. A CDN
    // module must work without resolving bare Lit/core imports or sibling files.
    const standaloneBuild = await build({
      entryPoints: [standalonePath], bundle: false, write: false, metafile: true,
      format: "esm", platform: "browser", target: "es2022",
    });
    for (const output of Object.values(standaloneBuild.metafile.outputs)) {
      assert.equal(output.imports.length, 0, "Picker standalone bundle must be self-contained");
    }
    console.log("Packed browser side-effect consumer and standalone bundle passed build checks");
    if (browserOutput) {
      await mkdir(dirname(browserOutput), { recursive: true });
      await copyFile(bundle, browserOutput);
      console.log(`Browser consumer saved to ${browserOutput}; load as a module in a real browser to exercise registration.`);
    }
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

check().catch((error) => {
  console.error(`Package verification failed: ${error.stack ?? error}`);
  process.exitCode = 1;
});
