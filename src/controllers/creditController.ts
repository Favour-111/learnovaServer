import { Response } from "express";
import { CreditTransaction } from "../models/CreditTransaction";
import { AuthedRequest } from "../middleware/auth";

export async function getCredits(req: AuthedRequest, res: Response) {
  if (!req.dbUser) return res.status(401).json({ error: "Unauthorized" });
  res.json({ credits: req.dbUser.credits });
}

export async function getCreditTransactions(req: AuthedRequest, res: Response) {
  if (!req.dbUser) return res.status(401).json({ error: "Unauthorized" });
  const transactions = await CreditTransaction.find({ user: req.dbUser._id }).sort({ createdAt: -1 }).limit(100).lean();
  const earned = transactions.filter((t) => t.amount > 0).reduce((sum, t) => sum + t.amount, 0);
  const spent = transactions.filter((t) => t.amount < 0).reduce((sum, t) => sum + Math.abs(t.amount), 0);
  res.json({ transactions, earned, spent });
}
