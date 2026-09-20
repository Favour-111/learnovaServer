// A small static taxonomy used to turn a learner's accumulated skills into
// illustrative career matches. Intentionally simple (skill-overlap scoring)
// rather than a GPT call on every profile view  swap in an AI-driven
// version later via services/openai.ts once an admin-configurable prompt
// exists for it.

export interface CareerPath {
  title: string;
  skillTags: string[];
}

export const CAREER_PATHS: CareerPath[] = [
  { title: "Frontend Developer", skillTags: ["html", "css", "javascript", "react", "ui/ux design", "responsive design"] },
  { title: "Full-Stack Developer", skillTags: ["javascript", "node.js", "react", "mongodb", "express", "rest apis"] },
  { title: "Backend Developer", skillTags: ["node.js", "express", "mongodb", "sql", "rest apis", "authentication"] },
  { title: "Mobile Developer", skillTags: ["react native", "swift", "kotlin", "mobile development", "expo"] },
  { title: "UI-Focused Developer", skillTags: ["ui/ux design", "css", "figma", "responsive design", "accessibility"] },
  { title: "Data Scientist", skillTags: ["python", "data science", "pandas", "statistics", "machine learning"] },
  { title: "AI/ML Engineer", skillTags: ["python", "artificial intelligence", "machine learning", "tensorflow", "pytorch"] },
  { title: "Cybersecurity Analyst", skillTags: ["cybersecurity", "networking", "linux", "security", "penetration testing"] },
  { title: "Cloud Engineer", skillTags: ["cloud computing", "aws", "docker", "kubernetes", "devops"] },
];

export function matchCareerPaths(userSkills: string[], limit = 3) {
  const normalized = new Set(userSkills.map((s) => s.toLowerCase().trim()));

  return CAREER_PATHS.map((path) => {
    const overlap = path.skillTags.filter((tag) => normalized.has(tag.toLowerCase())).length;
    const matchPercent = Math.round((overlap / path.skillTags.length) * 100);
    return { title: path.title, matchPercent, matchedSkills: path.skillTags.filter((t) => normalized.has(t.toLowerCase())) };
  })
    .filter((r) => r.matchPercent > 0)
    .sort((a, b) => b.matchPercent - a.matchPercent)
    .slice(0, limit);
}
