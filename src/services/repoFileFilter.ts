import { TreeEntry } from "./github";

// Repository safety/relevance filtering (spec section 5)  decides which
// files are even worth fetching content for for evaluation. Applied to
// every submitted repo before any content ever reaches the AI.

const IGNORE_DIR_SEGMENTS = new Set([
  "node_modules",
  ".git",
  "build",
  "dist",
  "coverage",
  ".next",
  ".expo",
  ".expo-shared",
  "out",
  "target",
  "vendor",
  ".cache",
  ".turbo",
  "android/app/build",
  "ios/Pods",
]);

const BINARY_OR_MEDIA_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".ico", ".svg",
  ".mp4", ".mov", ".avi", ".webm", ".mp3", ".wav", ".ogg",
  ".woff", ".woff2", ".ttf", ".eot", ".otf",
  ".pdf", ".zip", ".tar", ".gz", ".rar", ".7z",
  ".exe", ".dll", ".so", ".dylib", ".class", ".jar", ".bin",
]);

const LOCK_FILES = new Set(["package-lock.json", "yarn.lock", "pnpm-lock.yaml", "Gemfile.lock", "poetry.lock", "composer.lock"]);

// Never fetch content for these regardless of anything else  real secrets
// or environment-specific values, not something an evaluator should read.
const SENSITIVE_FILES = new Set([".env", ".env.local", ".env.production", ".env.development"]);

const MAX_FILE_BYTES = 20_000;
const MAX_TOTAL_BYTES = 200_000;
const MAX_FILES = 40;

function isIgnoredPath(path: string): boolean {
  const segments = path.split("/");
  return segments.some((seg) => IGNORE_DIR_SEGMENTS.has(seg));
}

function extensionOf(path: string): string {
  const lastDot = path.lastIndexOf(".");
  return lastDot === -1 ? "" : path.slice(lastDot).toLowerCase();
}

function basenameOf(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

// Higher = fetched first when the file/byte budget is tight. Priority
// mirrors section 5's list: package manifest and README first, then real
// source directories, then config/tests, everything else last.
function priorityOf(path: string): number {
  const base = basenameOf(path).toLowerCase();
  if (base === "package.json") return 100;
  if (base.startsWith("readme")) return 95;
  if (/^(src|app|components|pages|screens)\//.test(path)) return 80;
  if (path.startsWith("public/") && (base === "index.html" || base === "manifest.json")) return 40;
  if (/\.(test|spec)\.[jt]sx?$/.test(base) || path.includes("__tests__/")) return 60;
  if (/^(tsconfig|next\.config|vite\.config|tailwind\.config|babel\.config|\.eslintrc)/.test(base)) return 55;
  return 30;
}

export interface RepoSummary {
  totalFiles: number;
  totalDirs: number;
  truncatedTree: boolean;
  topLevelEntries: string[];
}

// Cheap stats over the WHOLE tree (not just the content-fetch subset) 
// used both for the static-analysis summary and as an integrity signal
// (an "almost empty" repo is suspicious regardless of what we fetch).
export function summarizeTree(entries: TreeEntry[], truncated: boolean): RepoSummary {
  const files = entries.filter((e) => e.type === "blob" && !isIgnoredPath(e.path));
  const dirs = new Set(entries.filter((e) => e.type === "tree" && !isIgnoredPath(e.path)).map((e) => e.path));
  const topLevel = new Set(entries.filter((e) => !e.path.includes("/")).map((e) => e.path));
  return {
    totalFiles: files.length,
    totalDirs: dirs.size,
    truncatedTree: truncated,
    topLevelEntries: Array.from(topLevel),
  };
}

// Picks the subset of files worth fetching content for, within the byte/
// file-count budget, highest priority first.
export function selectRelevantFiles(entries: TreeEntry[]): { path: string; size: number }[] {
  const candidates = entries
    .filter((e) => e.type === "blob")
    .filter((e) => !isIgnoredPath(e.path))
    .filter((e) => !SENSITIVE_FILES.has(basenameOf(e.path)))
    .filter((e) => !LOCK_FILES.has(basenameOf(e.path)))
    .filter((e) => !BINARY_OR_MEDIA_EXTENSIONS.has(extensionOf(e.path)))
    .filter((e) => (e.size ?? 0) <= MAX_FILE_BYTES * 4) // skip absurdly large single files outright
    .sort((a, b) => priorityOf(b.path) - priorityOf(a.path));

  const selected: { path: string; size: number }[] = [];
  let totalBytes = 0;
  for (const entry of candidates) {
    if (selected.length >= MAX_FILES || totalBytes >= MAX_TOTAL_BYTES) break;
    const estSize = Math.min(entry.size ?? MAX_FILE_BYTES, MAX_FILE_BYTES);
    selected.push({ path: entry.path, size: estSize });
    totalBytes += estSize;
  }
  return selected;
}

export function truncateContent(content: string): string {
  if (content.length <= MAX_FILE_BYTES) return content;
  return `${content.slice(0, MAX_FILE_BYTES)}\n… (truncated, file exceeds ${MAX_FILE_BYTES} bytes)`;
}

// File-extension -> technology name, used alongside package.json
// dependency detection so a repo with no manifest (or a non-JS stack)
// still gets a reasonable stack guess.
const EXTENSION_TECHNOLOGIES: Record<string, string> = {
  ".tsx": "TypeScript",
  ".ts": "TypeScript",
  ".jsx": "React",
  ".vue": "Vue",
  ".svelte": "Svelte",
  ".py": "Python",
  ".rb": "Ruby",
  ".go": "Go",
  ".rs": "Rust",
  ".java": "Java",
  ".kt": "Kotlin",
  ".swift": "Swift",
  ".php": "PHP",
  ".cs": "C#",
};

export function detectTechnologiesFromExtensions(entries: TreeEntry[]): string[] {
  const found = new Set<string>();
  for (const entry of entries) {
    if (entry.type !== "blob") continue;
    const tech = EXTENSION_TECHNOLOGIES[extensionOf(entry.path)];
    if (tech) found.add(tech);
  }
  return Array.from(found);
}
