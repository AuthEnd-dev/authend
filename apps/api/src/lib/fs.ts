import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export async function writeTextFile(path: string, contents: string) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents, "utf8");
}

export async function readTextFile(path: string) {
  return readFile(path, "utf8");
}

export async function fileExists(path: string) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export async function listSqlFiles(path: string) {
  if (!(await fileExists(path))) {
    return [];
  }

  const entries = await readdir(path);
  return entries
    .filter((entry) => entry.endsWith(".sql"))
    .sort()
    .map((entry) => resolve(path, entry));
}
