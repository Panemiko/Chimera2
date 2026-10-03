import { ChevronLeft, History } from "lucide-react";
import { useState } from "react";

import { Button } from "@chimera2/ui/components/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@chimera2/ui/components/card";
import { Empty, EmptyDescription } from "@chimera2/ui/components/empty";
import { impliedModifier, type RoomEvent } from "./room-events";

function EventLine({ event }: { event: RoomEvent }) {
  const p = event.payload;

  if (p.kind === "dice_roll") {
    const modifier = p.groups ? impliedModifier(p) : (p.modifier ?? 0);
    return (
      <span>
        {p.authorColor && (
          <span
            className="mr-1 inline-block size-2 rounded-full align-middle"
            style={{ backgroundColor: p.authorColor }}
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

export default function HistoryOverlay({ events }: { events: RoomEvent[] }) {
  const [open, setOpen] = useState(true);

  if (!open) {
    return (
      <Button
        variant="outline"
        size="icon"
        aria-label="Show history"
        className="pointer-events-auto absolute bottom-3 left-3 shadow-md"
        onClick={() => setOpen(true)}
      >
        <History className="size-4" />
      </Button>
    );
  }

  const newestFirst = [...events].reverse();

  return (
    <Card className="pointer-events-auto absolute bottom-3 left-3 flex h-[282px] w-72 flex-col gap-0 py-0 shadow-md">
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
                <EventLine event={event} />
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
  );
}
