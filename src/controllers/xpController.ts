import { Response } from "express";
import { XPTransaction } from "../models/XPTransaction";
import { AuthedRequest } from "../middleware/auth";
import { levelForXp, nextLevel } from "../config/gamification";

export async function getXp(req: AuthedRequest, res: Response) {
  if (!req.dbUser) return res.status(401).json({ error: "Unauthorized" });
  const current = levelForXp(req.dbUser.xp);
  const upcoming = nextLevel(req.dbUser.xp);
  res.json({
    xp: req.dbUser.xp,
    level: current,
    xpToNextLevel: upcoming ? upcoming.xpRequired - req.dbUser.xp : 0,
  });
}

export async function getXpHistory(req: AuthedRequest, res: Response) {
  if (!req.dbUser) return res.status(401).json({ error: "Unauthorized" });
  const transactions = await XPTransaction.find({ user: req.dbUser._id }).sort({ createdAt: -1 }).limit(100);
  res.json({ transactions });
}
