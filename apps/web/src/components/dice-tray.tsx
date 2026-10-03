import { useMutation } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Dices, Lock } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { trpc } from "@/utils/trpc";

import type { RoomEvent } from "./room-events";

function ResultCard({ event }: { event: RoomEvent }) {
  if (event.payload.kind !== "dice_roll") return null;
  const p = event.payload;
  return (
    <div className="panel-solid pointer-events-auto absolute bottom-full right-0 mb-2 flex w-72 max-w-72 flex-col gap-1 rounded-md border border-input px-3 py-2 shadow-md">
      <span
        className="w-fit rounded px-1.5 py-0.5 text-xs font-semibold text-white"
        style={{ backgroundColor: p.authorColor ?? "#555" }}
      >
        {p.author}
      </span>
      <span className="text-xs opacity-70">{p.notation}</span>
      <span className="text-lg font-bold leading-none">
        {p.total}
        {p.successes !== null && p.successes !== undefined && (
          <span className="ml-1 text-xs font-normal opacity-60">
            ({p.successes} {p.successes === 1 ? "success" : "successes"})
          </span>
        )}
      </span>
      {event.secret && (
        <span className="flex items-center gap-1 text-[11px] italic opacity-60">
          <Lock className="h-3 w-3" /> secret
        </span>
      )}
    </div>
  );
}

export default function DiceTray({
  roomId,
  latestDice,
}: {
  roomId: string;
  latestDice: RoomEvent | null;
}) {
  const [notation, setNotation] = useState("2d20");
  const [secret, setSecret] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = useMutation(
    trpc.dice.submit.mutationOptions({
      onError: (error) => toast.error(error.message),
    }),
  );

  // "/" focuses the dice input from anywhere outside a text field.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      inputRef.current?.focus();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      {latestDice && <ResultCard event={latestDice} />}

    <div className="panel-solid w-full rounded-md border border-input shadow-md">
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <Dices className="h-4 w-4" />
          <span className="text-sm font-semibold">Roll dice</span>
          <button
            aria-label={panelOpen ? "Collapse dice panel" : "Expand dice panel"}
            className="ml-auto"
            onClick={() => setPanelOpen((v) => !v)}
          >
            {panelOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>
        </div>
        {panelOpen && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (submit.isPending || notation.trim() === "") return;
              // Server parses and rolls; syntax errors surface as a toast.
              submit.mutate({ roomId, notation: notation.trim(), secret });
            }}
          >
            <div className="space-y-1 px-3 py-2">
              <input
                ref={inputRef}
                aria-label="Dice notation"
                type="text"
                spellCheck={false}
                autoComplete="off"
                placeholder="2d20kh1, 4d6!, 3d6+2"
                className="w-full rounded border bg-background px-2 py-1 text-sm"
                value={notation}
                onChange={(e) => setNotation(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2 border-t px-3 py-2 text-sm">
              <label className="flex items-center gap-1 text-xs">
                <input
                  type="checkbox"
                  checked={secret}
                  onChange={(e) => setSecret(e.target.checked)}
                />
                Secret
              </label>
              <button
                className="ml-auto rounded border px-3 py-0.5"
                type="submit"
                disabled={submit.isPending}
              >
                Roll
              </button>
            </div>
          </form>
        )}
      </div>
    </>
  );
}
