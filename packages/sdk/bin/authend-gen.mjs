#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import process from "node:process";
import { generateSource } from "./generator-lib.mjs";

function parseArgs(argv) {
  const [command = "generate", ...rest] = argv;
  const options = {};

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith("--")) {
      continue;
    }
    const key = token.slice(2);
    const value = rest[index + 1] && !rest[index + 1].startsWith("--") ? rest[++index] : "true";
    options[key] = value;
  }

  return { command, options };
}

async function readJson(filePath) {
  try {
    const contents = await readFile(filePath, "utf8");
    return JSON.parse(contents);
  } catch {
    return null;
  }
}

async function loadConfig(cwd) {
  const fileConfig = (await readJson(resolve(cwd, "authend.config.json"))) ?? {};
  const packageJson = (await readJson(resolve(cwd, "package.json"))) ?? {};
  const packageConfig = packageJson.authend ?? {};
  return {
    ...fileConfig,
    ...packageConfig,
  };
}

function ensureTrailingApiUrl(url) {
  return url.replace(/\/+$/, "");
}

async function writeFileRecursive(filePath, contents) {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, contents, "utf8");
}

async function commandInit(cwd) {
  const configPath = resolve(cwd, "authend.config.json");
  const existing = await readJson(configPath);
  if (existing) {
    process.stdout.write(`Config already exists at ${configPath}\n`);
    return;
  }

  const config = {
    apiUrl: "http://localhost:7002",
    output: "./src/generated/authend.ts",
  };
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  process.stdout.write(`Created ${configPath}\n`);
}

async function commandGenerate(cwd, options) {
  const config = await loadConfig(cwd);
  const apiUrl = ensureTrailingApiUrl(options["api-url"] ?? options.url ?? config.apiUrl ?? "");
  const output = options.output ?? config.output ?? "./src/generated/authend.ts";
  const schemaOutput = options["schema-output"] ?? config.schemaOutput ?? null;

  if (!apiUrl) {
    throw new Error("Missing apiUrl. Pass --api-url or create authend.config.json.");
  }

  const response = await fetch(`${apiUrl}/api/system/sdk-schema`);
  if (!response.ok) {
    throw new Error(`Failed to fetch SDK schema from ${apiUrl}/api/system/sdk-schema: ${response.status} ${response.statusText}`);
  }

  const manifest = await response.json();
  const outputPath = isAbsolute(output) ? output : resolve(cwd, output);
  const source = generateSource(manifest, apiUrl);
  await writeFileRecursive(outputPath, source);

  if (schemaOutput) {
    const schemaPath = isAbsolute(schemaOutput) ? schemaOutput : resolve(cwd, schemaOutput);
    await writeFileRecursive(schemaPath, `${JSON.stringify(manifest, null, 2)}\n`);
  }

  process.stdout.write(`Generated Authend types at ${outputPath}\n`);
}

async function main() {
  const cwd = process.cwd();
  const { command, options } = parseArgs(process.argv.slice(2));

  if (command === "init") {
    await commandInit(cwd);
    return;
  }

  if (command === "generate") {
    await commandGenerate(cwd, options);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
