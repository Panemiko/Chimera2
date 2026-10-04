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
  usePanelRef,
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
  return [{ title: "Room | Chimera2" }];
}

export default function Room() {
  const navigate = useNavigate();
  const { roomId } = useParams();
  const { data: session, isPending } = authClient.useSession();
  const [mounted, setMounted] = useState(false);
  const [privateOpen, setPrivateOpen] = useState(false);
  const [privateSize, setPrivateSize] = useState("30%");
  // The private panel stays mounted for the whole room session (collapsed
  // when closed) so its canvas never loses state on fast open/close and
  // keeps receiving remote scenes in the background.
  const privatePanelRef = usePanelRef();

  const room = useQuery(trpc.rooms.get.queryOptions({ id: roomId ?? "" }, { enabled: !!session && !!roomId }));

  const { defaultLayout, onLayoutChanged } = useResizableLayout({
    id: "chimera2:room-split",
    panelIds: ["global", "private"],
    storage: layoutStore,
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (room.data?.name) {
      document.title = `${room.data.name} | Chimera2`;
    }
  }, [room.data?.name]);

  useEffect(() => {
    if (privateOpen) {
      privatePanelRef.current?.expand();
    } else {
      privatePanelRef.current?.collapse();
    }
  }, [privateOpen, privatePanelRef]);

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
          // Ignore the collapsed state so reopening restores the last
          // visible size instead of 0%.
          if (typeof next === "number" && Number.isFinite(next) && next > 1) {
            setPrivateSize(`${next}%`);
          }
        }}
      >
        <ResizablePanel id="global" defaultSize="70%" minSize={320} className="min-w-0">
          <div className="relative h-full w-full min-w-0 overflow-hidden">
            <Suspense fallback={<div className="h-full w-full" />}>
              <RoomCanvas
                key={roomData.id}
                room={{
                  id: roomData.id,
                  name: roomData.name,
                  role: roomData.role,
                  inviteToken: roomData.inviteToken,
                }}
              />
            </Suspense>
            <RoomOverlays roomId={roomData.id} role={roomData.role} />
            <div
              inert={privateOpen}
              className={`pointer-events-auto absolute top-3 right-3 z-10 origin-top-right transition-all duration-300 ease-out motion-reduce:transition-none ${
                privateOpen
                  ? "pointer-events-none -translate-y-1 scale-95 opacity-0"
                  : "translate-y-0 scale-100 opacity-100"
              }`}
            >
              <Button
                variant="outline"
                size="sm"
                aria-label="Open private space"
                tabIndex={privateOpen ? -1 : undefined}
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
          </div>
        </ResizablePanel>
        <ResizableHandle
          withHandle
          disabled={!privateOpen}
          className={`transition-opacity duration-300 ease-out motion-reduce:transition-none ${
            privateOpen ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
        />
        <ResizablePanel
          id="private"
          panelRef={privatePanelRef}
          collapsible
          collapsedSize={0}
          defaultSize={privateSize}
          minSize={360}
          maxSize="50%"
          className="relative z-30 min-w-0 isolate bg-background transition-[flex-basis] duration-300 ease-out motion-reduce:transition-none"
        >
          <CharacterSheetPanel
            roomId={roomData.id}
            role={roomData.role}
            open={privateOpen}
            onClose={() => {
              setPrivateOpen(false);
            }}
          />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
