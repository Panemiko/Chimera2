import { useMutation } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Dices, Lock } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@chimera2/ui/components/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@chimera2/ui/components/card";
import { Checkbox } from "@chimera2/ui/components/checkbox";
import { Input } from "@chimera2/ui/components/input";
import { Label } from "@chimera2/ui/components/label";
import { trpc } from "@/utils/trpc";

import type { RoomEvent } from "./room-events";

function ResultCard({ event }: { event: RoomEvent }) {
  if (event.payload.kind !== "dice_roll") return null;
  const p = event.payload;
  return (
    <Card
      size="sm"
      className="pointer-events-auto absolute right-0 bottom-full mb-2 w-56 py-0 shadow-md"
    >
      <CardContent className="flex flex-col gap-0.5 py-2">
        <span
          className="w-fit rounded px-1.5 py-0.5 text-xs font-semibold text-primary-foreground"
          style={{ backgroundColor: p.authorColor ?? "var(--muted-foreground)" }}
        >
          {p.author}
        </span>
        <span className="text-xs text-muted-foreground">{p.notation}</span>
        <span className="text-base leading-none font-bold">
          {p.total}
          {p.successes !== null && p.successes !== undefined && (
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              ({p.successes} {p.successes === 1 ? "success" : "successes"})
            </span>
          )}
        </span>
        {event.secret && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground italic">
            <Lock className="size-3" /> secret
          </span>
        )}
      </CardContent>
    </Card>
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

      <Card className="w-full gap-0 py-0 shadow-md">
        <CardHeader className="py-2">
          <CardTitle className="flex items-center gap-2">
            <Dices className="size-4" />
            Roll dice
          </CardTitle>
          <CardAction>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={panelOpen ? "Collapse dice panel" : "Expand dice panel"}
              onClick={() => setPanelOpen((v) => !v)}
            >
              {panelOpen ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
            </Button>
          </CardAction>
        </CardHeader>
        {panelOpen && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (submit.isPending || notation.trim() === "") return;
              // Server parses and rolls; syntax errors surface as a toast.
              submit.mutate({ roomId, notation: notation.trim(), secret });
            }}
          >
            <CardContent className="border-t py-2">
              <Input
                ref={inputRef}
                aria-label="Dice notation"
                type="text"
                spellCheck={false}
                autoComplete="off"
                placeholder="2d20kh1, 4d6!, 3d6+2"
                value={notation}
                onChange={(e) => setNotation(e.target.value)}
              />
            </CardContent>
            <CardContent className="flex items-center border-t py-2">
              <Label htmlFor="dice-secret" className="flex items-center gap-1.5">
                <Checkbox
                  id="dice-secret"
                  checked={secret}
                  onCheckedChange={(v) => setSecret(v === true)}
                />
                Secret
              </Label>
              <Button className="ml-auto" type="submit" disabled={submit.isPending}>
                Roll
              </Button>
            </CardContent>
          </form>
        )}
      </Card>
    </>
  );
}
