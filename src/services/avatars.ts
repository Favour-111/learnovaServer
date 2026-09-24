// The approved set of DiceBear avatar seeds Learnova users can choose from
// (mirrored on the client in learnovaApp/src/constants/avatars.ts  keep
// both lists identical). A seed is just an identifier; the actual image is
// generated on demand from DiceBear's HTTP API, never stored or uploaded
// (see https://www.dicebear.com/how-to-use/http-api/), which is why only
// membership in this list is validated here, never an arbitrary string or
// external URL.
export const APPROVED_AVATAR_SEEDS = [
  "learnova-01",
  "learnova-02",
  "learnova-03",
  "learnova-04",
  "learnova-05",
  "learnova-06",
  "learnova-07",
  "learnova-08",
  "learnova-09",
  "learnova-10",
  "learnova-11",
  "learnova-12",
  "learnova-13",
  "learnova-14",
  "learnova-15",
  "learnova-16",
  "learnova-17",
  "learnova-18",
  "learnova-19",
  "learnova-20",
] as const;

const APPROVED_AVATAR_SEED_SET = new Set<string>(APPROVED_AVATAR_SEEDS);

export function isValidAvatarSeed(seed: string): boolean {
  return APPROVED_AVATAR_SEED_SET.has(seed);
}
