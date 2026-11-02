import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
function envValue(name: string): string | null {
  for (const line of readFileSync("/home/z/my-project/.env", "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)="(.*)"$/.exec(line.trim());
    if (m && m[1] === name) return m[2];
  }
  return null;
}
const db = new PrismaClient({ datasourceUrl: envValue("DIRECT_URL") + "&connect_timeout=30" });
const vids = await db.video.findMany({ select: { id: true, userToken: true }, take: 3, orderBy: { createdAt: "desc" } });
console.log("videos:", JSON.stringify(vids));
const imgs = await db.generation.findMany({ select: { id: true, userToken: true }, take: 2, orderBy: { createdAt: "desc" } });
console.log("images:", JSON.stringify(imgs));
await db.$disconnect();
