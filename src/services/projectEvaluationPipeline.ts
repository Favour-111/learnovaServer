// Orchestrates the project-evaluation pipeline end to end, working
// entirely off the GitHub API (repo metadata, tree, and file contents) 
// no cloning, no `npm install`/`npm run build` execution anywhere. That's
// a deliberate choice: there's no sandboxed/containerized execution
// environment in this deployment, and running untrusted student code
// directly on the main application server is exactly what we must never
// do. The "build/tests" stage below honestly reports that it wasn't run,
// rather than faking a result  wire a real sandbox runner (Docker with
// --memory/--cpus/--network=none, or a managed sandbox service) into
// `runBuildAndTests` later without touching anything else in this file.

import { IProject } from "../models/Project";
import { EvaluationStage } from "../models/ProjectSubmission";
import {
  parseGithubUrl,
  fetchRepoMeta,
  fetchLatestCommit,
  fetchRepoTree,
  fetchFileContent,
  GithubAccessError,
} from "./github";
import { summarizeTree, selectRelevantFiles, truncateContent, detectTechnologiesFromExtensions } from "./repoFileFilter";
import { runAutomatedChecks, runIntegrityChecks, FetchedFile } from "./projectAutomatedChecks";
import { evaluateProjectWithAI, EvaluationResult } from "./openai";

export class EvaluationError extends Error {
  constructor(
    message: string,
    public stage: EvaluationStage
  ) {
    super(message);
  }
}

export interface RepositoryInfo {
  owner: string;
  repo: string;
  branch: string;
  commitSha: string;
  fileCount: number;
}

export interface BuildRunResult {
  executed: boolean;
  summary: string;
}

// STUB, honestly: no sandbox execution environment is wired up. Returns a
// clearly-labeled "not executed" result instead of running anything, or
// pretending to.
async function runBuildAndTests(): Promise<BuildRunResult> {
  return {
    executed: false,
    summary: "Automated build/test execution is not available in this environment  evaluated from static file review only.",
  };
}

export interface EvaluationRunResult {
  repository: RepositoryInfo;
  automatedChecksSummary: string;
  integrityFlags: string[];
  buildRun: BuildRunResult;
  ai: EvaluationResult;
}

// Runs every stage in sequence, calling `onStage` as each one starts so the
// caller can persist progress for the mobile client to poll. Throws
// EvaluationError (tagged with the stage it failed at) on any failure.
export async function runProjectEvaluation(
  project: Pick<IProject, "title" | "description" | "requirements" | "requiredTechnologies" | "rubric">,
  githubUrl: string,
  requestedBranch: string | undefined,
  onStage: (stage: EvaluationStage) => Promise<void> | void
): Promise<EvaluationRunResult> {
  await onStage("validating");
  const parsed = parseGithubUrl(githubUrl);
  if (!parsed) {
    throw new EvaluationError("That doesn't look like a valid GitHub repository URL.", "validating");
  }

  await onStage("fetching_repository");
  let meta;
  let commit;
  try {
    meta = await fetchRepoMeta(parsed);
    commit = await fetchLatestCommit(parsed, requestedBranch || meta.defaultBranch);
  } catch (err) {
    throw new EvaluationError(err instanceof Error ? err.message : "Couldn't access the repository.", "fetching_repository");
  }
  const branch = requestedBranch || meta.defaultBranch;
  const { entries, truncated } = await fetchRepoTree(parsed, commit.sha);

  await onStage("analyzing");
  const treeSummary = summarizeTree(entries, truncated);
  const relevant = selectRelevantFiles(entries);
  const fetchedFiles: FetchedFile[] = [];
  // Small concurrency cap  the file list is already bounded by
  // selectRelevantFiles, this just avoids firing 40 requests at once.
  const CONCURRENCY = 6;
  for (let i = 0; i < relevant.length; i += CONCURRENCY) {
    const batch = relevant.slice(i, i + CONCURRENCY);
    // eslint-disable-next-line no-await-in-loop
    const results = await Promise.all(
      batch.map(async (f) => {
        const content = await fetchFileContent(parsed, commit.sha, f.path);
        return content !== null ? { path: f.path, content: truncateContent(content) } : null;
      })
    );
    for (const r of results) if (r) fetchedFiles.push(r);
  }

  const extensionTechnologies = detectTechnologiesFromExtensions(entries);
  const automatedChecks = runAutomatedChecks(fetchedFiles, extensionTechnologies, project.requiredTechnologies, treeSummary);
  const integrity = runIntegrityChecks(automatedChecks, treeSummary);

  await onStage("running_tests");
  const buildRun = await runBuildAndTests();

  await onStage("ai_review");
  const ai = await evaluateProjectWithAI({
    projectTitle: project.title,
    projectDescription: project.description,
    requirements: project.requirements,
    rubric: project.rubric,
    automatedChecksSummary: automatedChecks.summary,
    buildSummary: buildRun.summary,
    files: fetchedFiles,
  });

  await onStage("calculating_score");

  return {
    repository: { owner: parsed.owner, repo: parsed.repo, branch, commitSha: commit.sha, fileCount: treeSummary.totalFiles },
    automatedChecksSummary: automatedChecks.summary,
    integrityFlags: integrity.flags,
    buildRun,
    ai,
  };
}

export { GithubAccessError };
