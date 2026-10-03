import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, User } from "lucide-react";
import { Suspense, lazy, useEffect, useState } from "react";

import { Button } from "@chimera2/ui/components/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@chimera2/ui/components/card";
import { Label } from "@chimera2/ui/components/label";
import { Skeleton } from "@chimera2/ui/components/skeleton";
import { ENV } from "@/env";
import { authClient } from "@/lib/auth-client";
import { trpc } from "@/utils/trpc";

import { parseSheetScene } from "./sheet-scene";
import { setPrivateOpen, setSheetFocused } from "./canvas-focus";

const SheetCanvas = lazy(() => import("./sheet-canvas"));

export default function CharacterSheetPanel({
  roomId,
  role,
}: {
  roomId: string;
  role: "master" | "player";
}) {
  const [open, setOpen] = useState(false);
  const { data: session } = authClient.useSession();
  const myId = session?.user.id;
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const template = useQuery(trpc.characters.getCanvasTemplate.queryOptions({ roomId }));
  const members = useQuery(
    trpc.characters.members.queryOptions({ roomId }, { enabled: role === "master" }),
  );

  const viewingUserId = role === "master" ? (selectedUserId ?? myId ?? "") : (myId ?? "");

  const sheetQuery = useQuery(
    trpc.characters.getSheetCanvas.queryOptions(
      { roomId, userId: viewingUserId },
      { enabled: !!viewingUserId },
    ),
  );

  useEffect(() => {
    setPrivateOpen(open);
    if (open) {
      void sheetQuery.refetch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "c" && e.key !== "C") return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
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
      setOpen(!open);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open ]);

  const templateUrl = template.data?.url ? `${ENV.VITE_SERVER_URL}${template.data.url}` : null;
  const scene = sheetQuery.data ? parseSheetScene(sheetQuery.data.scene) : null;

  return (
    <div className="pointer-events-auto absolute bottom-3 left-1/2 w-[min(46rem,calc(100%-2rem))] -translate-x-1/2">
      <Card className="gap-0 overflow-hidden py-0 shadow-md">
        <CardHeader className="py-2">
          <CardTitle className="flex items-center gap-2">
            <User className="size-4" />
            Private space
            <span className="text-xs font-normal text-muted-foreground">press C</span>
          </CardTitle>
          <CardAction>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={open ? "Collapse private space" : "Expand private space"}
              onClick={() => {
                setOpen(!open);
              }}
            >
              {open ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
            </Button>
          </CardAction>
        </CardHeader>
        {open && (
          <CardContent className="space-y-2 border-t py-3">
            {role === "master" && (
              <div className="flex flex-wrap items-center gap-2">
                <Label htmlFor="sheet-viewing">Viewing</Label>
                <select
                  id="sheet-viewing"
                  aria-label="Select player sheet"
                  className="h-7 rounded-md border border-input bg-input/20 px-2 text-xs/relaxed text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 dark:bg-input/30"
                  value={viewingUserId}
                  onChange={(e) => {
                    setSelectedUserId(e.target.value);
                  }}
                >
                  {(members.data ?? []).map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.userName} ({m.role})
                    </option>
                  ))}
                  {(!members.data || members.data.length === 0) && myId && (
                    <option value={myId}>My space</option>
                  )}
                </select>
              </div>
            )}
            {sheetQuery.isLoading || !scene || !viewingUserId ? (
              <Skeleton className="h-48 w-full" />
            ) : (
              <div onPointerDownCapture={() => setSheetFocused(true)}>
                <Suspense fallback={<Skeleton className="h-48 w-full" />}>
                  <SheetCanvas
                    key={viewingUserId}
                    roomId={roomId}
                    userId={viewingUserId}
                    initialScene={scene}
                    templateUrl={templateUrl}
                  />
                </Suspense>
              </div>
            )}
            {!templateUrl && scene && scene.elements.length === 0 && (
              <p className="text-xs text-muted-foreground">
                A free space for notes, sketches and anything else. It saves on its own.
              </p>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
}
