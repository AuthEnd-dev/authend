import { mkdir, readdir, readFile, lstat, rm, symlink } from "node:fs/promises";
import { join, resolve } from "node:path";

const rootDir = resolve(import.meta.dirname, "..");
const nodeModulesDir = join(rootDir, "node_modules");
const bunStoreDir = join(nodeModulesDir, ".bun");

async function pathExists(path) {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
}

async function listWorkspacePackageJsons() {
  const targets = [join(rootDir, "package.json")];
  for (const scope of ["apps", "packages"]) {
    const scopeDir = join(rootDir, scope);
    if (!(await pathExists(scopeDir))) {
      continue;
    }
    for (const entry of await readdir(scopeDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }
      const packageJson = join(scopeDir, entry.name, "package.json");
      if (await pathExists(packageJson)) {
        targets.push(packageJson);
      }
    }
  }
  return targets;
}

async function collectExternalDependencies() {
  const packageJsonFiles = await listWorkspacePackageJsons();
  const names = new Set();

  for (const packageJsonFile of packageJsonFiles) {
    const contents = JSON.parse(await readFile(packageJsonFile, "utf8"));
    for (const field of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
      const entries = contents[field] ?? {};
      for (const [name, version] of Object.entries(entries)) {
        if (typeof version === "string" && !version.startsWith("workspace:")) {
          names.add(name);
        }
      }
    }
  }

  return [...names];
}

async function buildStorePackageMap() {
  const map = new Map();
  if (!(await pathExists(bunStoreDir))) {
    return map;
  }

  for (const storeEntry of await readdir(bunStoreDir, { withFileTypes: true })) {
    if (!storeEntry.isDirectory()) {
      continue;
    }

    const nestedNodeModules = join(bunStoreDir, storeEntry.name, "node_modules");
    if (!(await pathExists(nestedNodeModules))) {
      continue;
    }

    for (const nestedEntry of await readdir(nestedNodeModules, { withFileTypes: true })) {
      if (nestedEntry.name.startsWith("@")) {
        const scopeDir = join(nestedNodeModules, nestedEntry.name);
        for (const scopedEntry of await readdir(scopeDir, { withFileTypes: true })) {
          if (!scopedEntry.isDirectory()) {
            continue;
          }
          const packageName = `${nestedEntry.name}/${scopedEntry.name}`;
          map.set(packageName, join(scopeDir, scopedEntry.name));
        }
        continue;
      }

      if (nestedEntry.isDirectory()) {
        map.set(nestedEntry.name, join(nestedNodeModules, nestedEntry.name));
      }
    }
  }

  return map;
}

async function repairLinks() {
  const requiredPackages = await collectExternalDependencies();
  const packageMap = await buildStorePackageMap();

  for (const packageName of requiredPackages) {
    const targetPath = join(nodeModulesDir, ...packageName.split("/"));
    if (await pathExists(targetPath)) {
      continue;
    }

    const sourcePath = packageMap.get(packageName);
    if (!sourcePath) {
      continue;
    }

    await mkdir(join(nodeModulesDir, ...packageName.split("/").slice(0, -1)), { recursive: true });
    await rm(targetPath, { force: true, recursive: true }).catch(() => undefined);
    await symlink(sourcePath, targetPath, "dir");
  }
}

await repairLinks();
