export type DiceRollDetail = {
  value: number;
  dropped: boolean;
  crit: "success" | "failure" | null;
};

export type DiceRollGroup = {
  sides: number;
  rolls: DiceRollDetail[];
};

export type EventPayload =
  | {
      kind: "dice_roll";
      notation: string;
      groups: DiceRollGroup[];
      total: number;
      successes: number | null;
      author: string;
      authorColor?: string | null;
      /** Legacy pre-parser events. */
      dice?: { sides: number; qty: number }[];
      modifier?: number;
      results?: { sides: number; rolls: number[] }[];
    }
  | { kind: "room_created"; name: string; author: string }
  | { kind: "member_joined"; name: string };

export type RoomEvent = {
  id: number;
  type: string;
  secret: boolean;
  actorId: string | null;
  payload: EventPayload;
  createdAt: string;
};

/** Flat modifier implied by total minus kept dice (display only). */
export function impliedModifier(
  payload: Extract<EventPayload, { kind: "dice_roll" }>,
): number {
  if (payload.successes !== null && payload.successes !== undefined) return 0;
  if (payload.groups) {
    const kept = payload.groups.flatMap((g) => g.rolls.filter((r) => !r.dropped));
    return payload.total - kept.reduce((a, r) => a + r.value, 0);
  }
  return payload.modifier ?? 0;
}
