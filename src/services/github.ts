import { env } from "../config/env";

// All GitHub access lives here, server-side only  the mobile/admin clients
// never see a token and never talk to GitHub directly (section 4/23 of the
// project-evaluation spec). Unauthenticated requests work fine for public
// repos (60 req/hr); set GITHUB_TOKEN in .env to raise that to 5000/hr and,
// later, to support private-repo access via the same client.
const GITHUB_API = "https://api.github.com";

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { Accept: "application/vnd.github+json", "User-Agent": "Learnova" };
  if (env.githubToken) headers.Authorization = `Bearer ${env.githubToken}`;
  return headers;
}

export class GithubAccessError extends Error {
  constructor(
    message: string,
    public reason: "invalid_url" | "not_found" | "inaccessible" | "empty" | "rate_limited" | "network_error"
  ) {
    super(message);
  }
}

export interface ParsedRepoUrl {
  owner: string;
  repo: string;
}

// Accepts the usual GitHub URL shapes (with/without protocol, trailing
// slash, .git suffix, or a deep link into a subpath/branch) and pulls out
// just owner/repo.
export function parseGithubUrl(url: string): ParsedRepoUrl | null {
  const trimmed = url.trim();
  const match = trimmed.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/.*)?\/?$/i);
  if (!match) return null;
  const [, owner, repo] = match;
  if (!owner || !repo) return null;
  return { owner, repo };
}

interface RepoMeta {
  defaultBranch: string;
  isPrivate: boolean;
  description: string | null;
  htmlUrl: string;
}

async function githubFetch(path: string): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${GITHUB_API}${path}`, { headers: authHeaders() });
  } catch {
    throw new GithubAccessError("Couldn't reach GitHub  network error.", "network_error");
  }
  if (res.status === 403 || res.status === 429) {
    throw new GithubAccessError("GitHub API rate limit reached  try again shortly.", "rate_limited");
  }
  return res;
}

// GET /repos/:owner/:repo  confirms the repo exists and is reachable, and
// returns the info needed to pull its default-branch tree next.
export async function fetchRepoMeta(parsed: ParsedRepoUrl): Promise<RepoMeta> {
  const res = await githubFetch(`/repos/${parsed.owner}/${parsed.repo}`);
  if (res.status === 404) {
    throw new GithubAccessError("Repository not found  check the URL and that it's public.", "not_found");
  }
  if (!res.ok) {
    throw new GithubAccessError(`GitHub returned an error (${res.status}) fetching the repository.`, "inaccessible");
  }
  const data = (await res.json()) as { default_branch: string; private: boolean; description: string | null; html_url: string };
  return {
    defaultBranch: data.default_branch,
    isPrivate: data.private,
    description: data.description,
    htmlUrl: data.html_url,
  };
}

export interface CommitInfo {
  sha: string;
  message: string;
  date: string;
}

// GET /repos/:owner/:repo/commits/:branch  the tip commit of the branch
// being evaluated. This SHA is what gets stored on the submission/attempt,
// so a later push to the same repo never makes an old score look current.
//
// This is also the real "is this repo empty" check  GitHub's repo `size`
// field is NOT reliable for that (it's a periodically-recomputed storage
// stat that can read 0 for small/brand-new repos that already have real
// committed content). A genuinely empty repo (no commits at all) instead
// fails right here with a 409 Conflict.
export async function fetchLatestCommit(parsed: ParsedRepoUrl, branch: string): Promise<CommitInfo> {
  const res = await githubFetch(`/repos/${parsed.owner}/${parsed.repo}/commits/${encodeURIComponent(branch)}`);
  if (res.status === 409 || res.status === 404) {
    throw new GithubAccessError("This repository is empty  push your code before submitting.", "empty");
  }
  if (!res.ok) {
    throw new GithubAccessError("Couldn't read the repository's commit history.", "inaccessible");
  }
  const data = (await res.json()) as { sha: string; commit: { message: string; author: { date: string } } };
  return { sha: data.sha, message: data.commit.message, date: data.commit.author.date };
}

export interface TreeEntry {
  path: string;
  type: "blob" | "tree";
  size?: number;
}

// GET /repos/:owner/:repo/git/trees/:sha?recursive=1  the full file listing
// at the evaluated commit. `truncated` (GitHub caps very large trees) is
// surfaced so callers can flag "repo larger than we could fully inspect"
// rather than silently evaluating a partial listing.
export async function fetchRepoTree(parsed: ParsedRepoUrl, commitSha: string): Promise<{ entries: TreeEntry[]; truncated: boolean }> {
  const res = await githubFetch(`/repos/${parsed.owner}/${parsed.repo}/git/trees/${commitSha}?recursive=1`);
  if (!res.ok) {
    throw new GithubAccessError("Couldn't read the repository's file tree.", "inaccessible");
  }
  const data = (await res.json()) as { tree: { path: string; type: string; size?: number }[]; truncated: boolean };
  return {
    entries: data.tree.filter((e) => e.type === "blob" || e.type === "tree").map((e) => ({ path: e.path, type: e.type as "blob" | "tree", size: e.size })),
    truncated: data.truncated,
  };
}

// Fetches a file's raw text content at the evaluated commit  raw.githubusercontent.com
// serves plain bytes (no JSON/base64 wrapping), which is both simpler and
// keeps this off the stricter api.github.com rate-limit bucket.
export async function fetchFileContent(parsed: ParsedRepoUrl, commitSha: string, path: string): Promise<string | null> {
  try {
    const res = await fetch(`https://raw.githubusercontent.com/${parsed.owner}/${parsed.repo}/${commitSha}/${path}`);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}
