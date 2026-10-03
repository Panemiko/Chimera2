import type { Database } from "@chimera2/db";
import { user } from "@chimera2/db/schema/auth";
import {
  characterCustomField,
  characterSheet,
  characterTemplate,
  roomSheetTemplate,
} from "@chimera2/db/schema/characters";
import { roomMember } from "@chimera2/db/schema/rooms";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure, router } from "../index";
import { CHARACTER_TEMPLATE_ID, DEFAULT_TEMPLATE } from "../characters/template";

async function getMembership(db: Database, roomId: string, userId: string) {
  const [membership] = await db
    .select()
    .from(roomMember)
    .where(and(eq(roomMember.roomId, roomId), eq(roomMember.userId, userId)));
  if (!membership) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Not a member of this room" });
  }
  return membership;
}

const dataValue = z.union([z.string().max(20000), z.number().finite()]);
const sheetData = z.record(z.string().min(1).max(64), dataValue).refine(
  (obj) => Object.keys(obj).length <= 200,
  "Too many fields",
);

function parseSheetData(raw: string): Record<string, string | number> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, string | number>;
    }
  } catch {
    // Corrupt JSON resets to empty.
  }
  return {};
}

export const charactersRouter = router({
  getTemplate: protectedProcedure.query(async ({ ctx }) => {
    const [row] = await ctx.db.select().from(characterTemplate).where(eq(characterTemplate.id, CHARACTER_TEMPLATE_ID));
    if (!row) {
      await ctx.db.insert(characterTemplate).values({
        id: CHARACTER_TEMPLATE_ID,
        name: "D&D 5e",
        definition: JSON.stringify(DEFAULT_TEMPLATE),
      });
      return { id: CHARACTER_TEMPLATE_ID, name: "D&D 5e", definition: DEFAULT_TEMPLATE };
    }
    try {
      const stored = JSON.parse(row.definition) as { version?: unknown };
      // Code updates reseed the template, but never overwrite a master's edit.
      if (
        typeof stored.version !== "number" ||
        (stored.version < DEFAULT_TEMPLATE.version && row.updatedBy == null)
      ) {
        await ctx.db
          .update(characterTemplate)
          .set({ definition: JSON.stringify(DEFAULT_TEMPLATE) })
          .where(eq(characterTemplate.id, CHARACTER_TEMPLATE_ID));
        return { id: row.id, name: row.name, definition: DEFAULT_TEMPLATE };
      }
      return { id: row.id, name: row.name, definition: stored };
    } catch {
      return { id: row.id, name: row.name, definition: DEFAULT_TEMPLATE };
    }
  }),

  updateTemplate: protectedProcedure
    .input(
      z.object({
        roomId: z.string().min(1),
        name: z.string().min(1).max(100).optional(),
        definition: z
          .object({
            version: z.number(),
            sections: z
              .array(
                z.object({
                  id: z.string().min(1).max(64),
                  label: z.string().min(1).max(100),
                  fields: z
                    .array(
                      z.object({
                        key: z.string().min(1).max(64),
                        label: z.string().min(1).max(100),
                        kind: z.string().min(1).max(20),
                      }),
                    )
                    .max(200),
                }),
              )
              .max(50),
          })
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const membership = await getMembership(ctx.db, input.roomId, ctx.session.user.id);
      if (membership.role !== "master") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only the master can edit the template" });
      }
      const [row] = await ctx.db
        .select()
        .from(characterTemplate)
        .where(eq(characterTemplate.id, CHARACTER_TEMPLATE_ID));
      if (!row) {
        await ctx.db.insert(characterTemplate).values({
          id: CHARACTER_TEMPLATE_ID,
          name: input.name ?? "D&D 5e",
          definition: JSON.stringify(input.definition ?? DEFAULT_TEMPLATE),
          updatedBy: ctx.session.user.id,
        });
      } else {
        await ctx.db
          .update(characterTemplate)
          .set({
            name: input.name ?? row.name,
            definition: input.definition ? JSON.stringify(input.definition) : row.definition,
            updatedBy: ctx.session.user.id,
          })
          .where(eq(characterTemplate.id, CHARACTER_TEMPLATE_ID));
      }
      return { ok: true };
    }),

  members: protectedProcedure.input(z.object({ roomId: z.string().min(1) })).query(async ({ ctx, input }) => {
    await getMembership(ctx.db, input.roomId, ctx.session.user.id);
    const rows = await ctx.db
      .select({
        userId: roomMember.userId,
        role: roomMember.role,
        userName: user.name,
        userColor: user.color,
      })
      .from(roomMember)
      .innerJoin(user, eq(user.id, roomMember.userId))
      .where(eq(roomMember.roomId, input.roomId));
    return rows;
  }),

  list: protectedProcedure.input(z.object({ roomId: z.string().min(1) })).query(async ({ ctx, input }) => {    const membership = await getMembership(ctx.db, input.roomId, ctx.session.user.id);
    if (membership.role === "master") {
      const rows = await ctx.db
        .select({
          sheetId: characterSheet.id,
          roomId: characterSheet.roomId,
          userId: characterSheet.userId,
          name: characterSheet.name,
          updatedAt: characterSheet.updatedAt,
          userName: user.name,
        })
        .from(characterSheet)
        .innerJoin(user, eq(user.id, characterSheet.userId))
        .where(eq(characterSheet.roomId, input.roomId));
      return rows;
    }
    const [mine] = await ctx.db
      .select()
      .from(characterSheet)
      .where(and(eq(characterSheet.roomId, input.roomId), eq(characterSheet.userId, ctx.session.user.id)));
    if (!mine) return [];
    return [
      {
        sheetId: mine.id,
        roomId: mine.roomId,
        userId: mine.userId,
        name: mine.name,
        updatedAt: mine.updatedAt,
        userName: ctx.session.user.name,
      },
    ];
  }),

  getMine: protectedProcedure.input(z.object({ roomId: z.string().min(1) })).query(async ({ ctx, input }) => {
    await getMembership(ctx.db, input.roomId, ctx.session.user.id);
    const [sheet] = await ctx.db
      .select()
      .from(characterSheet)
      .where(and(eq(characterSheet.roomId, input.roomId), eq(characterSheet.userId, ctx.session.user.id)));
    if (!sheet) {
      return { sheet: null, customFields: [] };
    }
    const fields = await ctx.db
      .select()
      .from(characterCustomField)
      .where(eq(characterCustomField.sheetId, sheet.id));
    return { sheet: { ...sheet, data: parseSheetData(sheet.data) }, customFields: fields };
  }),

  upsertMine: protectedProcedure
    .input(
      z.object({
        roomId: z.string().min(1),
        name: z.string().max(100).default(""),
        data: sheetData.default({}),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await getMembership(ctx.db, input.roomId, ctx.session.user.id);
      const [existing] = await ctx.db
        .select()
        .from(characterSheet)
        .where(and(eq(characterSheet.roomId, input.roomId), eq(characterSheet.userId, ctx.session.user.id)));
      const payload = {
        name: input.name,
        data: JSON.stringify(input.data),
      };
      if (!existing) {
        const id = crypto.randomUUID();
        await ctx.db.insert(characterSheet).values({
          id,
          roomId: input.roomId,
          userId: ctx.session.user.id,
          ...payload,
        });
        return { id };
      }
      await ctx.db.update(characterSheet).set(payload).where(eq(characterSheet.id, existing.id));
      return { id: existing.id };
    }),

  getForMaster: protectedProcedure
    .input(z.object({ roomId: z.string().min(1), userId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const membership = await getMembership(ctx.db, input.roomId, ctx.session.user.id);
      if (membership.role !== "master" && input.userId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only the master can open other sheets" });
      }
      const [sheet] = await ctx.db
        .select()
        .from(characterSheet)
        .where(and(eq(characterSheet.roomId, input.roomId), eq(characterSheet.userId, input.userId)));
      if (!sheet) return { sheet: null, customFields: [] };
      const fields = await ctx.db
        .select()
        .from(characterCustomField)
        .where(eq(characterCustomField.sheetId, sheet.id));
      return { sheet: { ...sheet, data: parseSheetData(sheet.data) }, customFields: fields };
    }),

  upsertForMaster: protectedProcedure
    .input(
      z.object({
        roomId: z.string().min(1),
        userId: z.string().min(1),
        name: z.string().max(100).default(""),
        data: sheetData.default({}),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const membership = await getMembership(ctx.db, input.roomId, ctx.session.user.id);
      if (membership.role !== "master" && input.userId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only the master can edit other sheets" });
      }
      const [member] = await ctx.db
        .select()
        .from(roomMember)
        .where(and(eq(roomMember.roomId, input.roomId), eq(roomMember.userId, input.userId)));
      if (!member) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Player is not in this room" });
      }
      const [existing] = await ctx.db
        .select()
        .from(characterSheet)
        .where(and(eq(characterSheet.roomId, input.roomId), eq(characterSheet.userId, input.userId)));
      const payload = { name: input.name, data: JSON.stringify(input.data) };
      if (!existing) {
        const id = crypto.randomUUID();
        await ctx.db.insert(characterSheet).values({ id, roomId: input.roomId, userId: input.userId, ...payload });
        return { id };
      }
      await ctx.db.update(characterSheet).set(payload).where(eq(characterSheet.id, existing.id));
      return { id: existing.id };
    }),

  addCustomField: protectedProcedure
    .input(
      z.object({
        sheetId: z.string().min(1),
        key: z.string().min(1).max(64),
        kind: z.enum(["text", "number", "fulltext"]),
        textValue: z.string().max(20000).optional(),
        numberValue: z.number().finite().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [sheet] = await ctx.db.select().from(characterSheet).where(eq(characterSheet.id, input.sheetId));
      if (!sheet) throw new TRPCError({ code: "NOT_FOUND", message: "Sheet not found" });
      const membership = await getMembership(ctx.db, sheet.roomId, ctx.session.user.id);
      if (membership.role !== "master" && sheet.userId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Cannot edit this sheet" });
      }
      const id = crypto.randomUUID();
      const isNumber = input.kind === "number";
      await ctx.db.insert(characterCustomField).values({
        id,
        sheetId: input.sheetId,
        key: input.key,
        kind: input.kind,
        textValue: isNumber ? null : (input.textValue ?? ""),
        numberValue: isNumber ? (input.numberValue ?? null) : null,
      });
      return { id };
    }),

  updateCustomField: protectedProcedure
    .input(
      z.object({
        fieldId: z.string().min(1),
        key: z.string().min(1).max(64).optional(),
        textValue: z.string().max(20000).optional(),
        numberValue: z.number().finite().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [field] = await ctx.db.select().from(characterCustomField).where(eq(characterCustomField.id, input.fieldId));
      if (!field) throw new TRPCError({ code: "NOT_FOUND", message: "Field not found" });
      const [sheet] = await ctx.db.select().from(characterSheet).where(eq(characterSheet.id, field.sheetId));
      if (!sheet) throw new TRPCError({ code: "NOT_FOUND", message: "Sheet not found" });
      const membership = await getMembership(ctx.db, sheet.roomId, ctx.session.user.id);
      if (membership.role !== "master" && sheet.userId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Cannot edit this sheet" });
      }
      await ctx.db
        .update(characterCustomField)
        .set({
          key: input.key ?? field.key,
          textValue: input.textValue ?? field.textValue,
          numberValue: input.numberValue !== undefined ? input.numberValue : field.numberValue,
        })
        .where(eq(characterCustomField.id, input.fieldId));
      return { ok: true };
    }),

  deleteCustomField: protectedProcedure
    .input(z.object({ fieldId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const [field] = await ctx.db.select().from(characterCustomField).where(eq(characterCustomField.id, input.fieldId));
      if (!field) throw new TRPCError({ code: "NOT_FOUND", message: "Field not found" });
      const [sheet] = await ctx.db.select().from(characterSheet).where(eq(characterSheet.id, field.sheetId));
      if (!sheet) throw new TRPCError({ code: "NOT_FOUND", message: "Sheet not found" });
      const membership = await getMembership(ctx.db, sheet.roomId, ctx.session.user.id);
      if (membership.role !== "master" && sheet.userId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Cannot edit this sheet" });
      }
      await ctx.db.delete(characterCustomField).where(eq(characterCustomField.id, input.fieldId));
      return { ok: true };
    }),

  getCanvasTemplate: protectedProcedure
    .input(z.object({ roomId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      await getMembership(ctx.db, input.roomId, ctx.session.user.id);
      const [row] = await ctx.db
        .select()
        .from(roomSheetTemplate)
        .where(eq(roomSheetTemplate.roomId, input.roomId));
      return { url: row ? `/uploads/${row.imagePath}` : null };
    }),

  getSheetCanvas: protectedProcedure
    .input(z.object({ roomId: z.string().min(1), userId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const membership = await getMembership(ctx.db, input.roomId, ctx.session.user.id);
      if (membership.role !== "master" && input.userId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only the master can open other sheets" });
      }
      let [sheet] = await ctx.db
        .select()
        .from(characterSheet)
        .where(and(eq(characterSheet.roomId, input.roomId), eq(characterSheet.userId, input.userId)));
      if (!sheet) {
        const id = crypto.randomUUID();
        await ctx.db.insert(characterSheet).values({ id, roomId: input.roomId, userId: input.userId });
        [sheet] = await ctx.db.select().from(characterSheet).where(eq(characterSheet.id, id));
      }
      if (!sheet) throw new TRPCError({ code: "NOT_FOUND", message: "Sheet not found" });
      return { sheetId: sheet.id, name: sheet.name, scene: sheet.scene };
    }),

  saveSheetCanvas: protectedProcedure
    .input(
      z.object({
        roomId: z.string().min(1),
        userId: z.string().min(1),
        scene: z.string().max(8000000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const membership = await getMembership(ctx.db, input.roomId, ctx.session.user.id);
      if (membership.role !== "master" && input.userId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Cannot edit this sheet" });
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(input.scene);
      } catch {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid scene" });
      }
      if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { elements?: unknown }).elements)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid scene" });
      }
      const [existing] = await ctx.db
        .select()
        .from(characterSheet)
        .where(and(eq(characterSheet.roomId, input.roomId), eq(characterSheet.userId, input.userId)));
      if (!existing) {
        const id = crypto.randomUUID();
        await ctx.db.insert(characterSheet).values({
          id,
          roomId: input.roomId,
          userId: input.userId,
          scene: input.scene,
        });
        return { id };
      }
      await ctx.db.update(characterSheet).set({ scene: input.scene }).where(eq(characterSheet.id, existing.id));
      return { id: existing.id };
    }),
});

export type CharactersRouter = typeof charactersRouter;
