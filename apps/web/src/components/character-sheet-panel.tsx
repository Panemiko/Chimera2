import { useMutation, useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, User } from "lucide-react";
import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { ENV } from "@/env";
import { authClient } from "@/lib/auth-client";
import { trpc } from "@/utils/trpc";

import type { SheetScene } from "./sheet-scene";
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

  const saveScene = useMutation(
    trpc.characters.saveSheetCanvas.mutationOptions({
      onError: (e) => toast.error(e.message),
    }),
  );
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestScene = useRef<SheetScene | null>(null);
  const lastSaved = useRef<string | null>(null);

  function flush() {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    if (latestScene.current && viewingUserId) {
      const payload = JSON.stringify(latestScene.current);
      latestScene.current = null;
      if (payload === lastSaved.current) return;
      if (payload.length > 8000000) {
        toast.error("Drawing too large to save, try a smaller image");
        return;
      }
      lastSaved.current = payload;
      saveScene.mutate({ roomId, userId: viewingUserId, scene: payload });
    }
  }

  function handleScene(scene: SheetScene) {
    latestScene.current = scene;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flush, 2000);
  }

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  useEffect(() => {
    setPrivateOpen(open);
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
      if (open) flush();
      setOpen(!open);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const templateUrl = template.data?.url ? `${ENV.VITE_SERVER_URL}${template.data.url}` : null;
  const scene = sheetQuery.data ? parseSheetScene(sheetQuery.data.scene) : null;

  return (
    <div className="pointer-events-auto absolute bottom-3 left-1/2 w-[min(46rem,calc(100%-2rem))] -translate-x-1/2">
      <div className="panel-solid overflow-hidden rounded-md border border-input shadow-md">
        <button
          aria-label={open ? "Collapse private space" : "Expand private space"}
          className="flex w-full items-center gap-2 px-3 py-2 text-sm"
          onClick={() => {
            if (open) flush();
            setOpen(!open);
          }}
        >
          <User className="h-4 w-4" />
          <span className="font-semibold">Private space</span>
          <span className="text-xs opacity-50">press C</span>
          <span className="ml-auto">{open ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}</span>
        </button>
        <div className={open ? "space-y-2 border-t px-3 py-3" : "hidden"}>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {role === "master" && (
                <>
                  <span className="text-xs opacity-60">Viewing</span>
                  <select
                    aria-label="Select player sheet"
                    className="rounded border bg-background px-2 py-1 text-sm"
                    value={viewingUserId}
                    onChange={(e) => {
                      flush();
                      latestScene.current = null;
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
                </>
              )}
            </div>
            {sheetQuery.isLoading || !scene ? (
              <p className="py-8 text-center text-xs opacity-60">Loading sheet...</p>
            ) : (
              <div onPointerDownCapture={() => setSheetFocused(true)}>
                <Suspense fallback={<p className="py-8 text-center text-xs opacity-60">Loading canvas...</p>}>
                  <SheetCanvas
                    key={viewingUserId}
                    initialScene={scene}
                    templateUrl={templateUrl}
                    onScene={handleScene}
                  />
                </Suspense>
              </div>
            )}
            {!templateUrl && scene && scene.elements.length === 0 && (
              <p className="text-xs opacity-60">
                A free space for notes, sketches and anything else. It saves on its own.
              </p>
            )}
          </div>
      </div>
    </div>
  );
}
