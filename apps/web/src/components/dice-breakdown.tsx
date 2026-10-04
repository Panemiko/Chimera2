import { Lock } from "lucide-react";

import { impliedModifier, type RoomEvent } from "./room-events";

export const LATEST_DICE_CARD_ID = "latest-dice-card";

export default function DiceBreakdown({
  event,
  liveColor,
}: {
  event: RoomEvent;
  liveColor?: string | null;
}) {
  const p = event.payload;
  if (p.kind !== "dice_roll") return null;
  const modifier = p.groups ? impliedModifier(p) : (p.modifier ?? 0);
  const displayColor = liveColor ?? p.authorColor;

  return (
    <div className="flex flex-col gap-1">
      <span className="flex items-center gap-1.5 text-xs font-semibold">
        <span
          className="inline-block size-2 rounded-full"
          style={{ backgroundColor: displayColor ?? "var(--muted-foreground)" }}
        />
        {p.author}
        {event.secret && (
          <span className="flex items-center gap-0.5 font-normal text-muted-foreground italic">
            <Lock className="size-3" />
          </span>
        )}
      </span>
      {p.groups ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {p.groups.map((g, gi) => (
            <span key={gi} className="flex flex-wrap items-center gap-1">
              {gi > 0 && <span className="text-sm text-muted-foreground">+</span>}
              <span className="text-xs font-medium text-muted-foreground">d{g.sides}</span>
              {[...g.rolls]
                .sort((a, b) => b.value - a.value)
                .map((r, ri) => (
                  <span
                    key={ri}
                    className={
                      r.dropped
                        ? "rounded border px-1.5 py-0.5 text-xs text-muted-foreground line-through opacity-60"
                        : r.crit === "success"
                          ? "rounded border border-emerald-500/50 bg-emerald-500/10 px-1.5 py-0.5 text-xs font-bold text-emerald-600 dark:text-emerald-400"
                          : r.crit === "failure"
                            ? "rounded border border-red-500/50 bg-red-500/10 px-1.5 py-0.5 text-xs font-bold text-red-600 dark:text-red-400"
                            : "rounded border px-1.5 py-0.5 text-xs font-semibold"
                    }
                  >
                    {r.value}
                    {r.crit === "success" ? "!" : r.crit === "failure" ? "x" : ""}
                  </span>
                ))}
            </span>
          ))}
          {modifier !== 0 && (
            <span className="text-xs font-medium">
              <span className="text-muted-foreground">{modifier > 0 ? "+" : "-"}</span>{" "}
              {Math.abs(modifier)}
            </span>
          )}
        </div>
      ) : (
        <span className="text-xs font-medium">
          {(p.results ?? [])
            .map((r) => `d${r.sides} [${[...r.rolls].sort((a, b) => b - a).join(", ")}]`)
            .join(" + ")}
          {modifier !== 0 && ` ${modifier > 0 ? "+" : "-"} ${Math.abs(modifier)}`}
        </span>
      )}
      <div className="flex items-baseline gap-1.5">
        <span className="text-muted-foreground">=</span>
        <span className="text-xl leading-none font-bold">{p.total}</span>
        {p.successes !== null && p.successes !== undefined && (
          <span className="text-xs font-normal text-muted-foreground">
            ({p.successes} {p.successes === 1 ? "success" : "successes"})
          </span>
        )}
      </div>
    </div>
  );
}
