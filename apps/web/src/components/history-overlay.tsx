import { ChevronLeft, History } from "lucide-react";
import { useState } from "react";

import { impliedModifier, type RoomEvent } from "./room-events";

function formatTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function EventLine({ event }: { event: RoomEvent }) {
  const p = event.payload;

  if (p.kind === "dice_roll") {
    const modifier = p.groups ? impliedModifier(p) : (p.modifier ?? 0);
    return (
      <span>
        {p.authorColor && (
          <span
            className="mr-1 inline-block h-2 w-2 rounded-full align-middle"
            style={{ backgroundColor: p.authorColor }}
          />
        )}
        <span className="font-semibold">{p.author}</span>{" "}
        <span className="opacity-60">rolled</span>{" "}
        {p.groups ? (
          <span className="font-medium">
            {p.groups.map((g, gi) => (
              <span key={gi}>
                {gi > 0 && <span className="opacity-60"> + </span>}
                d{g.sides} [
                {[...g.rolls]
                  .sort((a, b) => b.value - a.value)
                  .map((r, ri) => (
                  <span key={ri}>
                    {ri > 0 && ", "}
                    <span
                      className={
                        r.dropped
                          ? "line-through opacity-60"
                          : r.crit
                            ? "font-bold underline"
                            : undefined
                      }
                    >
                      {r.value}
                      {r.crit === "success" ? "!" : r.crit === "failure" ? "x" : ""}
                    </span>
                  </span>
                ))}
                ]
              </span>
            ))}
          </span>
        ) : (
          <span className="font-medium">
            {(p.results ?? [])
              .map((r) => `d${r.sides} [${[...r.rolls].sort((a, b) => b - a).join(", ")}]`)
              .join(" + ")}
          </span>
        )}{" "}
        {modifier !== 0 && (
          <>
            <span className="opacity-60">{modifier > 0 ? "+" : "-"}</span>{" "}
            <span className="font-medium">{Math.abs(modifier)}</span>{" "}
          </>
        )}
        <span className="opacity-60">=</span> <span className="font-semibold">{p.total}</span>
        {p.successes !== null && p.successes !== undefined && (
          <span className="opacity-60">
            {" "}
            ({p.successes} {p.successes === 1 ? "success" : "successes"})
          </span>
        )}
        {event.secret && <span className="italic opacity-60"> (secret)</span>}
      </span>
    );
  }

  if (p.kind === "room_created") {
    return (
      <span>
        <span className="font-semibold">{p.author}</span>{" "}
        <span className="opacity-60">created the room</span>
      </span>
    );
  }

  return (
    <span>
      <span className="font-semibold">{p.name}</span>{" "}
      <span className="opacity-60">joined the room</span>
    </span>
  );
}

export default function HistoryOverlay({ events }: { events: RoomEvent[] }) {
  const [open, setOpen] = useState(true);
  const newestFirst = [...events].reverse();

  if (!open) {
    return (
      <button
        aria-label="Show history"
        className="pointer-events-auto absolute left-3 top-16 rounded-md border border-input bg-background p-2 shadow-md"
        onClick={() => setOpen(true)}
      >
        <History className="h-4 w-4" />
      </button>
    );
  }

  return (
    <div className="pointer-events-auto absolute left-3 top-16 flex max-h-72 w-72 flex-col rounded-md border border-input bg-background/95 shadow-md backdrop-blur">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <History className="h-4 w-4" />
        <span className="text-sm font-semibold">History</span>
        <button aria-label="Hide history" className="ml-auto" onClick={() => setOpen(false)}>
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>
      <ul className="min-h-0 space-y-1.5 overflow-y-auto px-3 py-2">
        {newestFirst.map((event) => (
          <li key={event.id} className="text-xs leading-snug">
            <span className="mr-1 text-[10px] tabular-nums opacity-40">
              {formatTime(event.createdAt)}
            </span>
            <EventLine event={event} />
          </li>
        ))}
        {events.length === 0 && (
          <li className="text-xs text-muted-foreground">No events yet.</li>
        )}
      </ul>
    </div>
  );
}
