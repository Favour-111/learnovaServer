import { RepoSummary } from "./repoFileFilter";

export interface FetchedFile {
  path: string;
  content: string;
}

export interface AutomatedCheckResult {
  hasPackageJson: boolean;
  hasReadme: boolean;
  hasTests: boolean;
  dependencies: string[];
  detectedTechnologies: string[];
  requiredTechnologyResults: { name: string; present: boolean }[];
  fileCount: number;
  summary: string;
}

export interface IntegrityCheckResult {
  flags: string[];
}

// Free-text "required technology" (admin-entered, e.g. "React", "Express",
// "MongoDB") -> the package.json dependency name(s) that would prove it's
// actually used. Anything not in this map falls back to a case-insensitive
// substring match against dependency names and detected file-extension
// technologies, so an unlisted technology still gets a best-effort check
// rather than always failing.
const TECH_ALIASES: Record<string, string[]> = {
  react: ["react"],
  "react native": ["react-native", "expo"],
  "next.js": ["next"],
  nextjs: ["next"],
  vue: ["vue"],
  angular: ["@angular/core"],
  svelte: ["svelte"],
  express: ["express"],
  "node.js": ["express", "fastify", "koa"],
  mongodb: ["mongoose", "mongodb"],
  mongoose: ["mongoose"],
  postgresql: ["pg", "prisma", "sequelize", "typeorm"],
  postgres: ["pg", "prisma", "sequelize", "typeorm"],
  typescript: ["typescript"],
  tailwind: ["tailwindcss"],
  "tailwind css": ["tailwindcss"],
  redux: ["redux", "@reduxjs/toolkit"],
  graphql: ["graphql"],
  jest: ["jest"],
  vite: ["vite"],
};

function findPackageJson(files: FetchedFile[]): Record<string, unknown> | null {
  const pkgFile = files.find((f) => f.path === "package.json");
  if (!pkgFile) return null;
  try {
    return JSON.parse(pkgFile.content);
  } catch {
    return null;
  }
}

function checkTechnologyPresent(name: string, dependencyNames: string[], detectedTechnologies: string[]): boolean {
  const lowerDeps = dependencyNames.map((d) => d.toLowerCase());
  const lowerDetected = detectedTechnologies.map((d) => d.toLowerCase());
  const aliases = TECH_ALIASES[name.toLowerCase()];
  if (aliases) return aliases.some((alias) => lowerDeps.some((d) => d.includes(alias)));
  const needle = name.toLowerCase();
  return lowerDeps.some((d) => d.includes(needle)) || lowerDetected.some((d) => d.includes(needle));
}

// Objective, deterministic checks that don't need the AI at all  these
// results are handed to the AI as ground truth it must respect (e.g. it
// can't claim "no React" when package.json clearly lists it), and drive
// the requirement-verification checklist alongside the AI's own read.
export function runAutomatedChecks(
  files: FetchedFile[],
  extensionTechnologies: string[],
  requiredTechnologies: string[],
  treeSummary: RepoSummary
): AutomatedCheckResult {
  const pkg = findPackageJson(files);
  const dependencies = pkg
    ? Object.keys({ ...(pkg.dependencies as object | undefined), ...(pkg.devDependencies as object | undefined) })
    : [];
  const detectedTechnologies = Array.from(new Set([...extensionTechnologies, ...dependencies]));

  const requiredTechnologyResults = requiredTechnologies.map((name) => ({
    name,
    present: checkTechnologyPresent(name, dependencies, detectedTechnologies),
  }));

  const hasReadme = files.some((f) => f.path.toLowerCase().startsWith("readme"));
  const hasTests = files.some((f) => /\.(test|spec)\.[jt]sx?$/.test(f.path) || f.path.includes("__tests__/"));

  const summaryParts = [
    `${treeSummary.totalFiles} source file(s) across ${treeSummary.totalDirs} folder(s).`,
    pkg ? `package.json found with ${dependencies.length} dependencies.` : "No package.json found.",
    hasReadme ? "README present." : "No README found.",
    hasTests ? "Test files present." : "No test files found.",
    detectedTechnologies.length > 0 ? `Detected technologies: ${detectedTechnologies.join(", ")}.` : "",
  ].filter(Boolean);

  return {
    hasPackageJson: !!pkg,
    hasReadme,
    hasTests,
    dependencies,
    detectedTechnologies,
    requiredTechnologyResults,
    fileCount: treeSummary.totalFiles,
    summary: summaryParts.join(" "),
  };
}

// Non-accusatory integrity signals (spec section 14)  surfaced to admins
// for review, never used to auto-reject or auto-flag a student as cheating.
export function runIntegrityChecks(checks: AutomatedCheckResult, treeSummary: RepoSummary): IntegrityCheckResult {
  const flags: string[] = [];

  if (treeSummary.totalFiles === 0) {
    flags.push("Repository appears to be empty.");
  } else if (treeSummary.totalFiles < 3) {
    flags.push("Repository contains very little source code.");
  }

  const missingRequired = checks.requiredTechnologyResults.filter((r) => !r.present);
  if (missingRequired.length > 0) {
    flags.push(`Required technology not detected: ${missingRequired.map((r) => r.name).join(", ")}.`);
  }

  if (!checks.hasPackageJson && checks.requiredTechnologyResults.length > 0) {
    flags.push("No package.json found to verify dependencies against.");
  }

  return { flags };
}
