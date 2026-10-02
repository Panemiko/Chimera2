import { useQuery } from "@tanstack/react-query";
import { useSubscription } from "@trpc/tanstack-react-query";
import { useRef, useState } from "react";

import { authClient } from "@/lib/auth-client";
import { trpc } from "@/utils/trpc";

import DiceThreeOverlay, { type ThreeDiceRequest } from "./dice-three-overlay";
import DiceTray from "./dice-tray";
import HistoryOverlay from "./history-overlay";
import type { RoomEvent } from "./room-events";

export default function RoomOverlays({ roomId }: { roomId: string }) {
  const [liveEvents, setLiveEvents] = useState<RoomEvent[]>([]);
  const [threeRequest, setThreeRequest] = useState<ThreeDiceRequest | null>(null);
  const animatedIds = useRef(new Set<number>());
  const pendingDice = useRef(new Map<number, RoomEvent>());

  const { data: session } = authClient.useSession();
  const myId = session?.user.id;

  const history = useQuery(trpc.events.list.queryOptions({ roomId }));

  function releaseDiceEvent(id: number) {
    const event = pendingDice.current.get(id);
    pendingDice.current.delete(id);
    if (!event) return;
    setLiveEvents((prev) =>
      prev.some((e) => e.id === event.id) ? prev : [...prev.slice(-99), event],
    );
  }

  useSubscription(
    trpc.events.onEvent.subscriptionOptions(
      { roomId },
      {
        onData: (envelope) => {
          const event = envelope.data as RoomEvent;
          if (event.payload.kind === "dice_roll") {
            // Dice wait for the 3D to settle (plus grace) before hitting history.
            if (animatedIds.current.has(event.id) || pendingDice.current.has(event.id)) return;
            animatedIds.current.add(event.id);
            pendingDice.current.set(event.id, event);
            if (event.payload.groups && (!event.secret || event.actorId === myId) && myId) {
              setThreeRequest({
                key: event.id,
                groups: event.payload.groups,
                color: event.payload.authorColor ?? "#555",
              });
            } else {
              // No animation for this viewer: release straight away.
              releaseDiceEvent(event.id);
            }
            return;
          }
          setLiveEvents((prev) =>
            prev.some((e) => e.id === event.id) ? prev : [...prev.slice(-99), event],
          );
        },
      },
    ),
  );

  function handleThreeSettled(key: number) {
    releaseDiceEvent(key);
  }

  const liveIds = new Set(liveEvents.map((e) => e.id));
  const events = [
    ...((history.data ?? []).filter((e) => !liveIds.has(e.id)) as RoomEvent[]),
    ...liveEvents,
  ];

  const latestDice = [...events].reverse().find((e) => e.payload.kind === "dice_roll") ?? null;

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      <HistoryOverlay events={events} />
      <DiceTray roomId={roomId} latestDice={latestDice} />
      <DiceThreeOverlay request={threeRequest} onSettled={handleThreeSettled} />
    </div>
  );
}
