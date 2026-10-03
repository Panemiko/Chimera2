import { useQuery } from "@tanstack/react-query";
import { ChevronRight, User } from "lucide-react";
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
  onClose,
}: {
  roomId: string;
  role: "master" | "player";
  onClose: () => void;
}) {
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
    setPrivateOpen(true);
    void sheetQuery.refetch();
    return () => setPrivateOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const templateUrl = template.data?.url ? `${ENV.VITE_SERVER_URL}${template.data.url}` : null;
  const scene = sheetQuery.data ? parseSheetScene(sheetQuery.data.scene) : null;

  return (
    <Card className="flex h-full min-h-0 min-w-0 flex-col gap-0 overflow-hidden rounded-none border-0 border-l py-0 shadow-none">
      <CardHeader className="shrink-0 py-2">
        <CardTitle className="flex items-center gap-2">
          <User className="size-4" />
          Private space
          <span className="text-xs font-normal text-muted-foreground">press C</span>
        </CardTitle>
        <CardAction>
          <Button variant="ghost" size="icon-sm" aria-label="Close private space" onClick={onClose}>
            <ChevronRight className="size-4" />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col space-y-2 overflow-hidden border-t py-3">
        {role === "master" && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
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
          <Skeleton className="min-h-0 w-full flex-1" />
        ) : (
          <div
            className="flex min-h-0 flex-1 flex-col"
            onPointerDownCapture={() => setSheetFocused(true)}
          >
            <Suspense fallback={<Skeleton className="min-h-0 w-full flex-1" />}>
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
          <p className="shrink-0 text-xs text-muted-foreground">
            A free space for notes, sketches and anything else. It saves on its own.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
