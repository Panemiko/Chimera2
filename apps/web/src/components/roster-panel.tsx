import { useMutation, useQuery } from "@tanstack/react-query";
import { useSubscription } from "@trpc/tanstack-react-query";
import { ChevronDown, ChevronUp, Users } from "lucide-react";
import { useEffect, useState } from "react";

import { trpc } from "@/utils/trpc";

import { isPrivateOpen } from "./canvas-focus";

type PresenceEntry = { userId: string; inPrivate: boolean };

export default function RosterPanel({ roomId }: { roomId: string }) {
  const [open, setOpen] = useState(true);
  const [online, setOnline] = useState<Map<string, PresenceEntry>>(new Map());
  const members = useQuery(trpc.characters.members.queryOptions({ roomId }));
  const heartbeat = useMutation(trpc.canvas.heartbeat.mutationOptions());
  const leave = useMutation(trpc.canvas.leave.mutationOptions());

  useEffect(() => {
    const beat = () => heartbeat.mutate({ roomId, inPrivate: isPrivateOpen() });
    beat();
    const timer = setInterval(beat, 15000);
    const onUnload = () => leave.mutate({ roomId });
    window.addEventListener("beforeunload", onUnload);
    return () => {
      clearInterval(timer);
      window.removeEventListener("beforeunload", onUnload);
      leave.mutate({ roomId });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  useSubscription(
    trpc.canvas.onPresence.subscriptionOptions(
      { roomId },
      {
        onData: (envelope) => {
          const list = envelope.data as PresenceEntry[];
          setOnline(new Map(list.map((p) => [p.userId, p])));
        },
      },
    ),
  );

  return (
    <div className="panel-solid w-full rounded-md border border-input shadow-md">
      <button
        aria-label={open ? "Collapse player list" : "Expand player list"}
        className="flex w-full items-center gap-2 px-3 py-2 text-sm"
        onClick={() => setOpen((v) => !v)}
      >
        <Users className="h-4 w-4" />
        <span className="font-semibold">Players</span>
        <span className="ml-auto">{open ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}</span>
      </button>
      {open && (
        <ul className="max-h-40 space-y-1 overflow-y-auto border-t px-3 py-2">
          {(members.data ?? []).map((m) => {
            const presence = online.get(m.userId);
            const isOnline = !!presence;
            return (
              <li
                key={m.userId}
                className={isOnline ? "flex items-center gap-2 text-xs" : "flex items-center gap-2 text-xs opacity-50"}
              >
                <span className="relative flex shrink-0">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: m.userColor ?? "#555" }}
                  />
                  {isOnline && (
                    <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-green-500" />
                  )}
                </span>
                <span className="truncate font-medium">{m.userName}</span>
                <span className="ml-auto opacity-60">
                  {presence?.inPrivate ? "Private" : isOnline ? "Online" : "Away"}
                </span>
              </li>
            );
          })}
          {members.isLoading && <li className="text-xs opacity-60">Loading...</li>}
        </ul>
      )}
    </div>
  );
}
