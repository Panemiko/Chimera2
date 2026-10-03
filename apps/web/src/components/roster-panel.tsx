import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Users } from "lucide-react";
import { useState } from "react";

import { Button } from "@chimera2/ui/components/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@chimera2/ui/components/card";
import { Skeleton } from "@chimera2/ui/components/skeleton";
import { trpc } from "@/utils/trpc";

export default function RosterPanel({ roomId }: { roomId: string }) {
  const [open, setOpen] = useState(true);
  const members = useQuery(trpc.characters.members.queryOptions({ roomId }));

  return (
    <Card className="w-full gap-0 py-0 shadow-md">
      <CardHeader className="py-2">
        <CardTitle className="flex items-center gap-2">
          <Users className="size-4" />
          Players
        </CardTitle>
        <CardAction>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={open ? "Collapse player list" : "Expand player list"}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
          </Button>
        </CardAction>
      </CardHeader>
      {open && (
        <CardContent className="border-t py-2">
          <ul className="max-h-40 space-y-1 overflow-y-auto">
            {(members.data ?? []).map((m) => {
              return (
                <li
                  key={m.userId}
                  className="flex items-center gap-2 text-xs text-card-foreground"
                >
                  <span
                    className="inline-block size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: m.userColor ?? "var(--muted-foreground)" }}
                  />
                  <span className="truncate font-medium">{m.userName}</span>
                </li>
              );
            })}
            {members.isLoading && (
              <li className="space-y-1.5">
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </li>
            )}
          </ul>
        </CardContent>
      )}
    </Card>
  );
}
