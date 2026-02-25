const files: Record<string, string> = {};
const dirs: Set<string> = new Set();

export const documentDirectory = '/mock/documents/';

export async function getInfoAsync(path: string): Promise<{ exists: boolean }> {
  return { exists: dirs.has(path) || files[path] !== undefined };
}

export async function makeDirectoryAsync(path: string, _options?: { intermediates?: boolean }): Promise<void> {
  dirs.add(path);
}

export async function writeAsStringAsync(path: string, content: string): Promise<void> {
  files[path] = content;
}

export async function readAsStringAsync(path: string): Promise<string> {
  if (files[path] === undefined) throw new Error(`File not found: ${path}`);
  return files[path];
}

export async function readDirectoryAsync(path: string): Promise<string[]> {
  return Object.keys(files)
    .filter((f) => f.startsWith(path))
    .map((f) => f.replace(path, ''));
}

export async function deleteAsync(path: string): Promise<void> {
  delete files[path];
}
