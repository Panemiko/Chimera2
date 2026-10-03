import { roomSheetTemplate } from "@chimera2/db/schema/characters";
import { roomMember } from "@chimera2/db/schema/rooms";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";

import { createContext } from "./context";
import { db } from "./services";

export const UPLOAD_DIR = resolve(import.meta.dir, "..", "..", "..", ".data", "uploads");
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const ALLOWED_IMAGES = new Map([
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".gif", "image/gif"],
]);

export function safeName(name: string): string | null {
  const base = basename(name);
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(base)) return null;
  return base;
}

export async function storeTemplateImage(roomId: string, userId: string, ext: string, bytes: Buffer) {
  const filename = `${crypto.randomUUID()}${ext}`;
  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(join(UPLOAD_DIR, filename), bytes);

  const [previous] = await db
    .select()
    .from(roomSheetTemplate)
    .where(eq(roomSheetTemplate.roomId, roomId));
  if (previous && previous.imagePath !== filename) {
    const oldSafe = safeName(previous.imagePath);
    if (oldSafe) await rm(join(UPLOAD_DIR, oldSafe), { force: true });
  }
  if (previous) {
    await db
      .update(roomSheetTemplate)
      .set({ imagePath: filename, updatedBy: userId })
      .where(eq(roomSheetTemplate.roomId, roomId));
  } else {
    await db.insert(roomSheetTemplate).values({ roomId, imagePath: filename, updatedBy: userId });
  }
  return filename;
}

export async function registerUploads(fastify: FastifyInstance) {
  await mkdir(UPLOAD_DIR, { recursive: true });

  fastify.post(
    "/uploads/sheet-template",
    { bodyLimit: MAX_IMAGE_BYTES + 1024 * 1024 },
    async (request, reply) => {
      const ctx = await createContext({ req: request });
      if (!ctx.session) {
        return reply.status(401).send({ error: "Authentication required" });
      }
      const userId = ctx.session.user.id;
      const body = request.body as { roomId?: unknown; filename?: unknown; dataUrl?: unknown };
      if (typeof body?.roomId !== "string" || !body.roomId) {
        return reply.status(400).send({ error: "Missing roomId" });
      }
      const [membership] = await db
        .select()
        .from(roomMember)
        .where(and(eq(roomMember.roomId, body.roomId), eq(roomMember.userId, userId)));
      if (!membership || membership.role !== "master") {
        return reply.status(403).send({ error: "Only the master can change the template" });
      }
      if (typeof body.filename !== "string" || typeof body.dataUrl !== "string") {
        return reply.status(400).send({ error: "Missing file" });
      }
      const ext = extname(body.filename).toLowerCase();
      const expectedMime = ALLOWED_IMAGES.get(ext);
      const match = /^data:(image\/png|image\/jpeg|image\/webp|image\/gif);base64,([A-Za-z0-9+/=]+)$/.exec(
        body.dataUrl,
      );
      const mime = match?.[1];
      const payload = match?.[2];
      if (!expectedMime || !mime || !payload || mime !== expectedMime) {
        return reply.status(400).send({ error: "Only png, jpg, webp or gif images" });
      }
      const bytes = Buffer.from(payload, "base64");
      if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) {
        return reply.status(400).send({ error: "Image must be under 5 MB" });
      }
      const filename = await storeTemplateImage(body.roomId, userId, ext, bytes);
      return { url: `/uploads/${filename}` };
    },
  );

  fastify.get("/uploads/:name", async (request, reply) => {
    const ctx = await createContext({ req: request });
    if (!ctx.session) {
      return reply.status(401).send({ error: "Authentication required" });
    }
    const name = safeName((request.params as { name: string }).name);
    if (!name) return reply.status(400).send({ error: "Invalid file" });
    const ext = extname(name).toLowerCase();
    const mime = ALLOWED_IMAGES.get(ext);
    if (!mime) return reply.status(404).send({ error: "Not found" });
    const [template] = await db
      .select()
      .from(roomSheetTemplate)
      .where(eq(roomSheetTemplate.imagePath, name));
    if (!template) return reply.status(404).send({ error: "Not found" });
    const [membership] = await db
      .select()
      .from(roomMember)
      .where(
        and(eq(roomMember.roomId, template.roomId), eq(roomMember.userId, ctx.session.user.id)),
      );
    if (!membership) return reply.status(403).send({ error: "Not a member of this room" });
    const filePath = join(UPLOAD_DIR, name);
    if (!filePath.startsWith(UPLOAD_DIR)) return reply.status(400).send({ error: "Invalid file" });
    try {
      const data = await readFile(filePath);
      return reply.header("Content-Type", mime).header("Cache-Control", "private, max-age=3600").send(data);
    } catch {
      return reply.status(404).send({ error: "Not found" });
    }
  });
}
