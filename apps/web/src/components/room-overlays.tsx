import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSubscription } from "@trpc/tanstack-react-query";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";

import { authClient } from "@/lib/auth-client";
import { trpc } from "@/utils/trpc";

import DiceThreeOverlay, { type ThreeDiceRequest } from "./dice-three-overlay";
import DiceResultPopupStack from "./dice-result-popup";
import DiceTray from "./dice-tray";
import HistoryOverlay from "./history-overlay";
import RosterPanel from "./roster-panel";
import type { RoomEvent } from "./room-events";

export default function RoomOverlays({ roomId, role }: { roomId: string; role: "master" | "player" }) {
  const [liveEvents, setLiveEvents] = useState<RoomEvent[]>([]);
  const [popups, setPopups] = useState<RoomEvent[]>([]);
  // A bandeja mostra a última jogada com atraso: só troca quando o voo
  // do pop-up termina, nunca no instante em que o número é decidido.
  const [trayDice, setTrayDice] = useState<RoomEvent | null>(null);
  const popupsRef = useRef<RoomEvent[]>([]);
  popupsRef.current = popups;
  const liveRef = useRef<RoomEvent[]>([]);
  liveRef.current = liveEvents;
  const [threeRequest, setThreeRequest] = useState<ThreeDiceRequest | null>(null);
  const animatedIds = useRef(new Set<number>());
  const pendingDice = useRef(new Map<number, RoomEvent>());

  const { data: session } = authClient.useSession();
  const myId = session?.user.id;
  const queryClient = useQueryClient();

  const history = useQuery(trpc.events.list.queryOptions({ roomId }));
  // Mesma queryKey do RosterPanel: compartilha o cache e serve de fonte
  // da cor viva para recolorir o histórico de forma retroativa.
  const members = useQuery({
    ...trpc.characters.members.queryOptions({ roomId }),
    refetchInterval: 10_000,
    staleTime: 5_000,
  });

  const myColor = (session?.user as { color?: string | null } | undefined)?.color ?? null;

  const colorByUserId = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const m of members.data ?? []) {
      map.set(m.userId, m.userColor ?? null);
    }
    if (session?.user?.id && myColor) {
      // Otimista local: minha cor nova aparece sem esperar o refetch.
      map.set(session.user.id, myColor);
    }
    return map;
  }, [members.data, session?.user?.id, myColor]);
  const colorRef = useRef(colorByUserId);
  colorRef.current = colorByUserId;

  const dismissPopup = useCallback((id: number) => {
    // Fallback: mesmo nos caminhos sem animação a bandeja assume o
    // resultado só aqui, quando o pop-up sai de cena.
    const event = popupsRef.current.find((e) => e.id === id);
    setPopups((prev) => prev.filter((e) => e.id !== id));
    if (event) setTrayDice(event);
  }, []);

  // Histórico do servidor: preenche a bandeja na abertura da sala,
  // antes de qualquer pop-up novo existir.
  useEffect(() => {
    if (trayDice) return;
    const list = (history.data ?? []) as RoomEvent[];
    const latest = [...list].reverse().find((e) => e.payload.kind === "dice_roll") ?? null;
    if (latest) setTrayDice(latest);
  }, [history.data, trayDice]);

  // O voo avisa um pouco antes do dismiss: a bandeja assume o novo
  // resultado no momento da chegada, não no momento da rolagem.
  useEffect(() => {
    function onLanded(e: Event) {
      const id = (e as CustomEvent<{ id: number }>).detail?.id;
      if (typeof id !== "number") return;
      const found =
        popupsRef.current.find((ev) => ev.id === id) ??
        liveRef.current.find((ev) => ev.id === id) ??
        null;
      if (found) setTrayDice(found);
    }
    window.addEventListener("dice-popup-landed", onLanded);
    return () => window.removeEventListener("dice-popup-landed", onLanded);
  }, []);

  function releaseDiceEvent(id: number) {
    const event = pendingDice.current.get(id);
    pendingDice.current.delete(id);
    if (!event) return;
    setLiveEvents((prev) =>
      prev.some((e) => e.id === event.id) ? prev : [...prev.slice(-99), event],
    );
    setPopups((prev) =>
      prev.some((e) => e.id === event.id) ? prev : [...prev, event].slice(-3),
    );
  }

  useSubscription(
    trpc.events.onEvent.subscriptionOptions(
      { roomId },
      {
        onData: (envelope) => {
          const event = envelope.data as RoomEvent;
          if (event.payload.kind === "member_joined") {
            // Alguém entrou: a lista de players precisa refetch.
            void queryClient.invalidateQueries({
              queryKey: trpc.characters.members.queryKey(),
            });
          }
          if (event.payload.kind === "dice_roll") {
            // Dice wait for the 3D to settle (plus grace) before hitting history.
            if (animatedIds.current.has(event.id) || pendingDice.current.has(event.id)) return;
            animatedIds.current.add(event.id);
            pendingDice.current.set(event.id, event);
            if (event.payload.groups && (!event.secret || event.actorId === myId) && myId) {
              setThreeRequest({
                key: event.id,
                groups: event.payload.groups,
                color:
                  (event.actorId ? colorRef.current.get(event.actorId) : undefined) ??
                  event.payload.authorColor ??
                  "#555",
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

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      <HistoryOverlay events={events} colorByUserId={colorByUserId} />
      <DiceResultPopupStack popups={popups} colorByUserId={colorByUserId} onDismiss={dismissPopup} />
      <div className="pointer-events-auto absolute bottom-3 right-3 flex w-64 flex-col gap-2">
        <RosterPanel roomId={roomId} />
        <DiceTray roomId={roomId} latestDice={trayDice} colorByUserId={colorByUserId} />
      </div>
      <DiceThreeOverlay request={threeRequest} onSettled={handleThreeSettled} />
    </div>
  );
}
