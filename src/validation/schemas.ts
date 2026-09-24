import { z } from "zod";

// Type-shape validation only  business-rule checks that already exist in
// each controller (e.g. "githubUrl is required for this project", "role
// must actually change") stay exactly where they are and keep their own
// specific error messages. This layer's only job is to reject a
// structurally wrong body (missing field, wrong type) with a clean 400
// before it reaches a controller that assumes the shape is already right.

export const quizSubmitSchema = z.object({
  answers: z.array(
    z.object({
      questionId: z.string().min(1),
      selectedOptionIndex: z.number().int().optional(),
      selectedBoolean: z.boolean().optional(),
    })
  ),
});

export const projectSubmitSchema = z.object({
  githubUrl: z.string().min(1).optional(),
  demoUrl: z.string().min(1).optional(),
  notes: z.string().optional(),
  branch: z.string().min(1).optional(),
});

// githubUrl stays optional here too (like projectSubmitSchema above)  the
// controller's own `if (!githubUrl)` check keeps producing its specific
// "githubUrl is required" message rather than this layer's generic one.
export const validateGithubSchema = z.object({
  githubUrl: z.string().min(1).optional(),
});

export const adminRoleChangeSchema = z.object({
  role: z.enum(["user", "admin"]),
});

// Every field mirrors the controller's own existing typeof/trim checks
// exactly (email is intentionally NOT constrained to RFC email-shape here
// the controller never enforced that, and tightening it could reject a
// previously-accepted value; only the type matters at this layer).
export const profileUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().min(1).optional(),
  reducedMotion: z.boolean().optional(),
  dailyGoalTarget: z.number().optional(),
  timezone: z.string().min(1).optional(),
  avatarSeed: z.string().min(1).optional(),
});
