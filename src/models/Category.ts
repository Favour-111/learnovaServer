import { Schema, model } from "mongoose";

export interface ICategory {
  name: string;
  slug: string;
  icon: string;
  colorToken: string;
  order: number;
  // Optional artwork for the "Learning Paths" card on the Courses tab 
  // when set, the mobile app shows this image instead of the Ionicons
  // `icon` for that one big card (the small category chips/pills elsewhere
  // keep using `icon` regardless, so this is additive, not a replacement).
  imageUrl?: string;
}

const categorySchema = new Schema<ICategory>(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    icon: { type: String, required: true },
    colorToken: { type: String, required: true },
    order: { type: Number, default: 0 },
    imageUrl: String,
  },
  { timestamps: true }
);

export const Category = model<ICategory>("Category", categorySchema);
