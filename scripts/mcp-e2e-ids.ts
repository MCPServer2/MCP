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
const img = await db.generation.findFirst({ select: { id: true, userToken: true }, orderBy: { createdAt: "desc" } });
const vid = await db.video.findFirst({ select: { id: true, userToken: true }, orderBy: { createdAt: "desc" } });
console.log(JSON.stringify({ img, vid }));
await db.$disconnect();
