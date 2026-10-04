import { useCallback, useEffect, useRef, useState } from "react";

import { Card, CardContent } from "@chimera2/ui/components/card";
import { playDicePopupSound } from "@/utils/dice-popup-sound";

import DiceBreakdown, { LATEST_DICE_CARD_ID } from "./dice-breakdown";
import type { RoomEvent } from "./room-events";

const POPUP_TTL_MS = 4000;
const FLY_MS = 650;
const MAX_VISIBLE = 3;

type ExitTransform = { x: number; y: number; scale: number } | null;

function PopupCard({
  event,
  liveColor,
  onDismiss,
}: {
  event: RoomEvent;
  liveColor?: string | null;
  onDismiss: (id: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const exitingRef = useRef(false);
  const timers = useRef<number[]>([]);
  const [exit, setExit] = useState<ExitTransform>(null);
  const [fading, setFading] = useState(false);

  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);

  const finish = useCallback(() => {
    window.dispatchEvent(new CustomEvent("dice-popup-landed", { detail: { id: event.id } }));
    onDismiss(event.id);
  }, [event.id, onDismiss]);

  const startExit = useCallback(() => {
    if (exitingRef.current) return;
    exitingRef.current = true;
    const el = ref.current;
    if (!el) {
      finish();
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      finish();
      return;
    }
    const source = el.getBoundingClientRect();
    const target = document.getElementById(LATEST_DICE_CARD_ID)?.getBoundingClientRect();
    if (!target || target.width === 0 || source.width === 0) {
      setFading(true);
      later(finish, 250);
      return;
    }
    const dx = target.left + target.width / 2 - (source.left + source.width / 2);
    const dy = target.top + target.height / 2 - (source.top + source.height / 2);
    const scale = Math.min(1, Math.max(0.4, target.width / source.width));
    setExit({ x: dx, y: dy, scale });
    later(finish, FLY_MS + 30);
  }, [event.id, finish, later, onDismiss]);

  // Hook antes do return antecipado: hook depois de return condicional
  // quebra a ordem dos hooks entre renders.
  useEffect(() => {
    if (event.payload.kind !== "dice_roll") return;
    playDicePopupSound();
    const t = window.setTimeout(startExit, POPUP_TTL_MS);
    return () => window.clearTimeout(t);
  }, [event.id, event.payload, startExit]);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const t of pending) window.clearTimeout(t);
    };
  }, []);

  const p = event.payload;
  if (p.kind !== "dice_roll") return null;

  return (
    <div
      ref={ref}
      className="will-change-transform"
      style={
        exit
          ? {
              transform: `translate(${exit.x}px, ${exit.y}px) scale(${exit.scale})`,
              opacity: 0.15,
              transition: `transform ${FLY_MS}ms cubic-bezier(0.22, 0.9, 0.28, 1), opacity ${FLY_MS}ms ease`,
            }
          : fading
            ? { opacity: 0, transition: "opacity 250ms ease" }
            : undefined
      }
    >
      <Card size="sm" className="pointer-events-none w-auto max-w-96 py-1 shadow-lg">
        <CardContent className="py-2.5">
          <DiceBreakdown event={event} liveColor={liveColor} />
        </CardContent>
      </Card>
    </div>
  );
}

export default function DiceResultPopupStack({
  popups,
  colorByUserId,
  onDismiss,
}: {
  popups: RoomEvent[];
  colorByUserId?: Map<string, string | null>;
  onDismiss: (id: number) => void;
}) {
  if (popups.length === 0) return null;
  const visible = [...popups].reverse().slice(0, MAX_VISIBLE);

  return (
    <div className="pointer-events-none absolute inset-x-0 top-[104px] z-40 flex justify-center">
      <div className="flex flex-col items-center gap-1.5">
        {visible.map((event) => (
          <PopupCard
            key={event.id}
            event={event}
            liveColor={event.actorId ? (colorByUserId?.get(event.actorId) ?? undefined) : undefined}
            onDismiss={onDismiss}
          />
        ))}
      </div>
    </div>
  );
}
