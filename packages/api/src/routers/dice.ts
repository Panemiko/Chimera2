import DiceParser from "@3d-dice/dice-parser-interface";
import { user } from "@chimera2/db/schema/auth";
import { roomMember } from "@chimera2/db/schema/rooms";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { randomInt } from "node:crypto";
import { z } from "zod";

import { protectedProcedure, router } from "../index";
import { logRoomEvent } from "../realtime/log";

const SIDES = [4, 6, 8, 10, 12, 20, 100] as const;
const MAX_ROLLS = 20;
const MAX_REROLL_ROUNDS = 25;

type BoxDie = {
  sides: number;
  groupId: number;
  rollId: number | string;
  theme: string;
  value: number;
};

type BoxGroup = {
  qty: number;
  sides: number;
  mods: unknown[];
  rolls: BoxDie[];
  groupId: number;
  value: number;
};

/** Collect every array stored under `key` anywhere in a parser result object. */
function collectKeyedArrays(node: unknown, key: string): unknown[][] {
  const out: unknown[][] = [];
  const walk = (current: unknown): void => {
    if (Array.isArray(current)) {
      for (const item of current) walk(item);
      return;
    }
    if (current && typeof current === "object") {
      for (const [k, v] of Object.entries(current)) {
        if (k === key && Array.isArray(v)) out.push(v);
        else walk(v);
      }
    }
  };
  walk(node);
  return out;
}

function badRequest(message: string): TRPCError {
  return new TRPCError({ code: "BAD_REQUEST", message });
}

export const diceRouter = router({
  submit: protectedProcedure
    .input(
      z.object({
        roomId: z.string().min(1),
        notation: z.string().min(1).max(120),
        secret: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [membership] = await ctx.db
        .select()
        .from(roomMember)
        .where(
          and(eq(roomMember.roomId, input.roomId), eq(roomMember.userId, ctx.session.user.id)),
        );
      if (!membership) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not a member of this room" });
      }

      // Server-authoritative rolls: parse the notation, resolve every die with
      // crypto randomness, then let the parser score keep/drop/explode/success.
      // NOTE: dice-roller-parser's own roll() maps floats with round(f*sides)+1,
      // which is biased and can exceed the die size, so randomness never flows
      // through it. Floats only travel the exact invertible path (v-1)/sides
      // inside parseFinalResults, mirroring dice-parser-interface's box flow.
      const parser = new DiceParser();
      let dieGroups;
      try {
        dieGroups = parser.parseNotation(input.notation);
      } catch {
        throw badRequest("Invalid dice notation");
      }

      const groups: BoxGroup[] = [];
      let planned = 0;
      for (const [index, g] of dieGroups.entries()) {
        const sides = g.sides === "100" ? 100 : g.sides;
        if (typeof sides === "string") {
          throw badRequest("Fate dice aren't supported yet");
        }
        if (!(SIDES as readonly number[]).includes(sides)) {
          throw badRequest(`d${sides} isn't supported here`);
        }
        if (!Number.isInteger(g.qty) || g.qty < 1) {
          throw badRequest("Invalid dice notation");
        }
        planned += g.qty;
        groups.push({ qty: g.qty, sides, mods: g.mods ?? [], rolls: [], groupId: index, value: 0 });
      }
      if (planned === 0 || planned > MAX_ROLLS) {
        throw badRequest("Too many dice in one roll");
      }

      let rolled = 0;
      for (const g of groups) {
        for (let i = 0; i < g.qty; i++) {
          g.rolls.push({
            sides: g.sides,
            groupId: g.groupId,
            rollId: i,
            theme: "default",
            value: randomInt(1, g.sides + 1),
          });
          rolled++;
        }
      }

      for (let round = 0; round < MAX_REROLL_ROUNDS; round++) {
        const rerolls = parser.handleRerolls(groups);
        if (rerolls.length === 0) break;
        for (const spec of rerolls) {
          const target = groups[spec.groupId];
          if (!target || target.sides !== spec.sides) {
            throw badRequest("Could not score that roll");
          }
          target.rolls.push({
            sides: target.sides,
            groupId: target.groupId,
            rollId: spec.rollId,
            theme: "default",
            value: randomInt(1, target.sides + 1),
          });
          rolled++;
          if (rolled > MAX_ROLLS) {
            throw badRequest("Too many dice in one roll");
          }
        }
      }

      let final;
      try {
        final = parser.parseFinalResults(groups);
      } catch {
        throw badRequest("Could not score that roll");
      }
      if (typeof final.value !== "number" || !Number.isInteger(final.value)) {
        throw badRequest("Could not score that roll");
      }

      const bySides = new Map<number, { value: number; dropped: boolean; crit: "success" | "failure" | null }[]>();
      for (const r of collectKeyedArrays(final, "rolls").flat()) {
        if (!r || typeof r !== "object" || !("value" in r) || !("die" in r)) continue;
        const { die, value } = r as { die: unknown; value: unknown };
        const critRaw = (r as { critical?: unknown }).critical;
        const rerolled = (r as { reroll?: unknown }).reroll === true;
        const valid = (r as { valid?: unknown }).valid !== false;
        if (typeof die !== "number" || !(SIDES as readonly number[]).includes(die)) continue;
        if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > die) {
          continue;
        }
        const list = bySides.get(die) ?? [];
        list.push({
          value,
          dropped: !valid && !rerolled,
          crit: critRaw === "success" || critRaw === "failure" ? critRaw : null,
        });
        bySides.set(die, list);
      }
      if (bySides.size === 0) {
        throw badRequest("Could not score that roll");
      }

      const successes =
        final.success === true || final.success === false
          ? (typeof final.successes === "number" ? final.successes : 0)
          : null;

      const [authorRow] = await ctx.db
        .select({ color: user.color })
        .from(user)
        .where(eq(user.id, ctx.session.user.id));

      return logRoomEvent(ctx.db, {
        roomId: input.roomId,
        actorId: ctx.session.user.id,
        type: "dice_roll",
        secret: input.secret,
        payload: {
          kind: "dice_roll",
          notation: input.notation,
          groups: [...bySides.entries()].map(([sides, rolls]) => ({ sides, rolls })),
          total: final.value,
          successes,
          author: ctx.session.user.name,
          authorColor: authorRow?.color ?? null,
        },
      });
    }),
});
