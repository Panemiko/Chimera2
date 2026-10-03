import { useQuery } from "@tanstack/react-query";
import { Suspense, useEffect, useState } from "react";
import { lazy } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { TRPCClientError } from "@trpc/client";
import { User } from "lucide-react";

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  useResizableLayout,
} from "@chimera2/ui/components/resizable";
import { Button } from "@chimera2/ui/components/button";
import { authClient } from "@/lib/auth-client";
import { trpc } from "@/utils/trpc";
import CharacterSheetPanel from "@/components/character-sheet-panel";
import RoomOverlays from "@/components/room-overlays";
import type { Route } from "./+types/$roomId";

const RoomCanvas = lazy(() => import("@/components/room-canvas"));

type LayoutStore = Pick<Storage, "getItem" | "setItem">;

function createMemoryLayoutStore(): LayoutStore {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => (map.has(key) ? (map.get(key) as string) : null),
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  };
}

// react-resizable-panels reads `localStorage` at hook call time, which
// throws outside the browser. Use a memory store there instead.
const layoutStore: LayoutStore =
  typeof window !== "undefined"
    ? createBrowserLayoutStore()
    : createMemoryLayoutStore();

function createBrowserLayoutStore(): LayoutStore {
  try {
    return window.localStorage;
  } catch {
    return createMemoryLayoutStore();
  }
}

export function meta({}: Route.MetaArgs) {
  return [{ title: "Room" }];
}

export default function Room() {
  const navigate = useNavigate();
  const { roomId } = useParams();
  const { data: session, isPending } = authClient.useSession();
  const [mounted, setMounted] = useState(false);
  const [privateOpen, setPrivateOpen] = useState(false);
  const [privateSize, setPrivateSize] = useState("30%");

  const room = useQuery(trpc.rooms.get.queryOptions({ id: roomId ?? "" }, { enabled: !!session && !!roomId }));

  const { defaultLayout, onLayoutChanged } = useResizableLayout({
    id: "chimera2:room-split",
    panelIds: privateOpen ? ["global", "private"] : ["global"],
    storage: layoutStore,
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isPending && !session) {
      navigate("/login");
    }
  }, [session, isPending, navigate]);

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
      setPrivateOpen((v) => !v);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  if (isPending || !session) {
    return <div className="h-full w-full" />;
  }

  if (room.isLoading) {
    return <div className="container mx-auto max-w-2xl px-4 py-6">Loading room...</div>;
  }

  if (room.isError) {
    const code =
      room.error instanceof TRPCClientError ? room.error.data?.code : undefined;
    return (
      <div className="container mx-auto max-w-2xl px-4 py-6">
        <h1 className="mb-2 text-xl font-semibold">
          {code === "FORBIDDEN" ? "Not a member" : "Room not found"}
        </h1>
        <p className="mb-4 text-sm text-muted-foreground">
          {code === "FORBIDDEN"
            ? "Ask the master for an invite link to join this room."
            : "This room does not exist."}
        </p>
        <Link className="rounded border px-3 py-1 text-sm" to="/">
          Back to rooms
        </Link>
      </div>
    );
  }

  const roomData = room.data;
  if (!roomData || !mounted) {
    return <div className="h-full w-full" />;
  }

  return (
    <div className="relative flex h-full w-full overflow-hidden">
      <ResizablePanelGroup
        orientation="horizontal"
        className="min-w-0 flex-1"
        defaultLayout={defaultLayout}
        onLayoutChanged={(layout, meta) => {
          onLayoutChanged(layout, meta);
          const next = layout.private;
          if (typeof next === "number" && Number.isFinite(next)) {
            setPrivateSize(`${next}%`);
          }
        }}
      >
        <ResizablePanel id="global" defaultSize="70%" minSize={320} className="min-w-0">
          <div className="relative h-full w-full min-w-0 overflow-hidden">
            <Suspense fallback={<div className="h-full w-full" />}>
              <RoomCanvas
                room={{
                  id: roomData.id,
                  name: roomData.name,
                  role: roomData.role,
                  inviteToken: roomData.inviteToken,
                }}
              />
            </Suspense>
            <RoomOverlays roomId={roomData.id} role={roomData.role} />
            {!privateOpen && (
              <div className="pointer-events-auto absolute top-3 right-3 z-10">
                <Button
                  variant="outline"
                  size="sm"
                  aria-label="Open private space"
                  className="gap-2 shadow-md"
                  onClick={() => {
                    setPrivateOpen(true);
                  }}
                >
                  <User className="size-4" />
                  Private space
                  <span className="rounded border px-1 font-mono text-[10px] text-muted-foreground">
                    C
                  </span>
                </Button>
              </div>
            )}
          </div>
        </ResizablePanel>
        {privateOpen && (
          <>
            <ResizableHandle withHandle />
            <ResizablePanel
              id="private"
              defaultSize={privateSize}
              minSize={360}
              maxSize="50%"
              className="min-w-0"
            >
              <CharacterSheetPanel
                roomId={roomData.id}
                role={roomData.role}
                onClose={() => {
                  setPrivateOpen(false);
                }}
              />
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>
    </div>
  );
}
