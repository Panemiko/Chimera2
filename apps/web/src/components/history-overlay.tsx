import { ChevronLeft, History } from "lucide-react";
import { useState } from "react";

import { Button } from "@chimera2/ui/components/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@chimera2/ui/components/card";
import { Empty, EmptyDescription } from "@chimera2/ui/components/empty";
import { impliedModifier, type RoomEvent } from "./room-events";

function EventLine({ event, liveColor }: { event: RoomEvent; liveColor?: string | null }) {
  const p = event.payload;

  if (p.kind === "dice_roll") {
    const modifier = p.groups ? impliedModifier(p) : (p.modifier ?? 0);
    // Recolorir retroativo: a cor viva do membro prevalece sobre o snapshot
    // gravado no payload na hora da rolagem.
    const displayColor = liveColor ?? p.authorColor;
    return (
      <span>
        {displayColor && (
          <span
            className="mr-1 inline-block size-2 rounded-full align-middle"
            style={{ backgroundColor: displayColor }}
          />
        )}
        <span className="font-semibold">{p.author}</span>{" "}
        <span className="text-muted-foreground">rolled</span>{" "}
        {p.groups ? (
          <span className="font-medium">
            {p.groups.map((g, gi) => (
              <span key={gi}>
                {gi > 0 && <span className="text-muted-foreground"> + </span>}
                d{g.sides} [
                {[...g.rolls]
                  .sort((a, b) => b.value - a.value)
                  .map((r, ri) => (
                  <span key={ri}>
                    {ri > 0 && ", "}
                    <span
                      className={
                        r.dropped
                          ? "line-through text-muted-foreground"
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
            <span className="text-muted-foreground">{modifier > 0 ? "+" : "-"}</span>{" "}
            <span className="font-medium">{Math.abs(modifier)}</span>{" "}
          </>
        )}
        <span className="text-muted-foreground">=</span>{" "}
        <span className="font-semibold">{p.total}</span>
        {p.successes !== null && p.successes !== undefined && (
          <span className="text-muted-foreground">
            {" "}
            ({p.successes} {p.successes === 1 ? "success" : "successes"})
          </span>
        )}
        {event.secret && <span className="text-muted-foreground italic"> (secret)</span>}
      </span>
    );
  }

  if (p.kind === "room_created") {
    return (
      <span>
        <span className="font-semibold">{p.author}</span>{" "}
        <span className="text-muted-foreground">created the room</span>
      </span>
    );
  }

  return (
    <span>
      <span className="font-semibold">{p.name}</span>{" "}
      <span className="text-muted-foreground">joined the room</span>
    </span>
  );
}

export default function HistoryOverlay({
  events,
  colorByUserId,
}: {
  events: RoomEvent[];
  colorByUserId?: Map<string, string | null>;
}) {
  const [open, setOpen] = useState(true);

  const newestFirst = [...events].reverse();

  return (
    <div className="pointer-events-none absolute bottom-3 left-3 z-10">
      <Card
        inert={!open}
        className={`pointer-events-auto flex h-[282px] w-72 origin-bottom-left flex-col gap-0 py-0 shadow-md transition-all duration-300 ease-out motion-reduce:transition-none ${
          open
            ? "translate-y-0 scale-100 opacity-100"
            : "pointer-events-none translate-y-2 scale-95 opacity-0"
        }`}
      >
      <CardHeader className="py-2">
        <CardTitle className="flex items-center gap-2">
          <History className="size-4" />
          History
        </CardTitle>
        <CardAction>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Hide history"
            onClick={() => setOpen(false)}
          >
            <ChevronLeft className="size-4" />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden border-t py-2">
        {newestFirst.length > 0 ? (
          <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto">
            {newestFirst.map((event) => (
              <li key={event.id} className="text-xs leading-snug text-card-foreground">
                <EventLine
                  event={event}
                  liveColor={event.actorId ? (colorByUserId?.get(event.actorId) ?? undefined) : undefined}
                />
              </li>
            ))}
          </ul>
        ) : (
          <Empty>
            <EmptyDescription>No events yet.</EmptyDescription>
          </Empty>
        )}
      </CardContent>
      </Card>
      <Button
        variant="outline"
        size="icon"
        aria-label="Show history"
        inert={open}
        onClick={() => setOpen(true)}
        className={`pointer-events-auto absolute bottom-0 left-0 shadow-md transition-all duration-300 ease-out motion-reduce:transition-none ${
          open
            ? "pointer-events-none translate-y-2 scale-90 opacity-0"
            : "translate-y-0 scale-100 opacity-100"
        }`}
      >
        <History className="size-4" />
      </Button>
    </div>
  );
}
