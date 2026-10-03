import "@excalidraw/excalidraw/index.css";
import "./room-canvas.css";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@chimera2/ui/components/dropdown-menu";
import {
  CaptureUpdateAction,
  Excalidraw,
  getSceneVersion,
  reconcileElements,
  restoreElements,
  THEME,
  viewportCoordsToSceneCoords,
} from "@excalidraw/excalidraw";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useSubscription } from "@trpc/tanstack-react-query";
import { Check, Copy, Keyboard, LogOut, Menu, Moon, Rows3, Sun } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useTheme } from "next-themes";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";
import { randomUserColor, USER_PALETTE, userColor } from "@/utils/user-color";
import { trpc } from "@/utils/trpc";
import { forwardToolToSheet, setSheetFocused } from "./canvas-focus";
import ShortcutsDialog from "./shortcuts-dialog";

export type RoomMenuInfo = {
  id: string;
  name: string;
  role: "master" | "player";
  inviteToken: string | null;
};

export default function RoomCanvas({ room }: { room: RoomMenuInfo }) {
  const { resolvedTheme } = useTheme();
  const apiRef = useRef<RoomCanvasApi | null>(null);
  const sceneQuery = useQuery(trpc.canvas.getScene.queryOptions({ roomId: room.id }));
  const pushScene = useMutation(trpc.canvas.pushScene.mutationOptions());
  const pushPointer = useMutation(trpc.canvas.pushPointer.mutationOptions());
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSentVersion = useRef<number | null>(null);
  const applyingRemote = useRef(false);
  const collaborators = useRef(new Map<string, { username: string; color: string; x: number; y: number; tx: number; ty: number; at: number }>());
  const smoothTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [initialElements, setInitialElements] = useState<unknown[] | null>(null);

  useEffect(() => {
    if (sceneQuery.data && initialElements === null) {
      try {
        const parsed = JSON.parse(sceneQuery.data.scene) as { elements?: unknown };
        setInitialElements(Array.isArray(parsed.elements) ? parsed.elements : []);
      } catch {
        setInitialElements([]);
      }
    }
  }, [sceneQuery.data, initialElements]);

  function queuePush() {
    if (pushTimer.current) return;
    pushTimer.current = setTimeout(() => {
      pushTimer.current = null;
      const api = apiRef.current;
      if (!api) return;
      try {
        const elements = api.getSceneElementsIncludingDeleted();
        const version = getSceneVersion(elements as never);
        if (lastSentVersion.current === version) return;
        lastSentVersion.current = version;
        pushScene.mutate({ roomId: room.id, elements: elements as never, files: api.getFiles() as never });
      } catch {
        // Best effort sync.
      }
    }, 400);
  }

  useEffect(() => {
    return () => {
      if (pushTimer.current) clearTimeout(pushTimer.current);
      if (pointerTimer.current) clearTimeout(pointerTimer.current);
      if (smoothTimer.current) clearInterval(smoothTimer.current);
    };
  }, []);

  useSubscription(
    trpc.canvas.onScene.subscriptionOptions(
      { roomId: room.id },
      {
        onData: (envelope) => {
          const remote = envelope.data;
          const api = apiRef.current;
          if (!api || !Array.isArray(remote.elements)) return;
          try {
            applyingRemote.current = true;
            const local = api.getSceneElementsIncludingDeleted();
            const reconciled = reconcileElements(
              local as never,
              remote.elements as never,
              api.getAppState() as never,
            );
            api.updateScene({ elements: reconciled, captureUpdate: CaptureUpdateAction.NEVER });
            lastSentVersion.current = getSceneVersion(reconciled as never);
          } catch {
            // Keep local scene on merge failure.
          } finally {
            applyingRemote.current = false;
          }
        },
      },
    ),
  );

  useSubscription(
    trpc.canvas.onPointer.subscriptionOptions(
      { roomId: room.id },
      {
        onData: (envelope) => {
          const pointer = envelope.data;
          const api = apiRef.current;
          if (!api) return;
          const prev = collaborators.current.get(pointer.from);
          collaborators.current.set(pointer.from, {
            username: pointer.userName,
            color: pointer.userColor,
            x: prev && Date.now() - prev.at < 5000 ? prev.x : pointer.x,
            y: prev && Date.now() - prev.at < 5000 ? prev.y : pointer.y,
            tx: pointer.x,
            ty: pointer.y,
            at: Date.now(),
          });
          startSmoothing();
        },
      },
    ),
  );

  function startSmoothing() {
    if (smoothTimer.current) return;
    smoothTimer.current = setInterval(() => {
      const api = apiRef.current;
      if (!api || collaborators.current.size === 0) {
        if (smoothTimer.current) {
          clearInterval(smoothTimer.current);
          smoothTimer.current = null;
        }
        return;
      }
      const cutoff = Date.now() - 5000;
      let moved = false;
      const next = new Map<string, { username: string; color: { background: string; stroke: string }; pointer: { x: number; y: number } }>();
      for (const [id, c] of collaborators.current) {
        if (c.at < cutoff) {
          collaborators.current.delete(id);
          moved = true;
          continue;
        }
        const dx = c.tx - c.x;
        const dy = c.ty - c.y;
        if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
          c.x += dx * 0.35;
          c.y += dy * 0.35;
          moved = true;
        } else if (c.x !== c.tx || c.y !== c.ty) {
          c.x = c.tx;
          c.y = c.ty;
          moved = true;
        }
        next.set(id, {
          username: c.username,
          color: { background: c.color, stroke: c.color },
          pointer: { x: c.x, y: c.y },
        });
      }
      if (moved) {
        try {
          api.updateScene({ collaborators: next });
        } catch {
          // Presence is decorative.
        }
      }
    }, 33);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (pointerTimer.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = e.clientX;
    const clientY = e.clientY;
    pointerTimer.current = setTimeout(() => {
      pointerTimer.current = null;
      const api = apiRef.current;
      if (!api) return;
      try {
        const appState = api.getAppState();
        const scene = viewportCoordsToSceneCoords(
          { clientX, clientY },
          {
            zoom: appState.zoom as never,
            offsetLeft: rect.left,
            offsetTop: rect.top,
            scrollX: appState.scrollX,
            scrollY: appState.scrollY,
          },
        );
        pushPointer.mutate({ roomId: room.id, x: scene.x, y: scene.y });
      } catch {
        // Best effort presence.
      }
    }, 150);
  }

  if (sceneQuery.isLoading || initialElements === null) {
    return <div className="h-full w-full" />;
  }

  return (
    <div
      className="relative h-full w-full"
      onPointerMove={handlePointerMove}
      onPointerDownCapture={(e) => {
        // Toolbar clicks keep the current focus so the main toolbar
        // can drive the private canvas. Canvas clicks take focus back.
        const target = e.target as HTMLElement | null;
        if (target?.closest?.(".App-toolbar")) return;
        setSheetFocused(false);
      }}
    >
      <Excalidraw
        theme={resolvedTheme === "dark" ? THEME.DARK : THEME.LIGHT}
        renderTopRightUI={() => null}
        excalidrawAPI={(api) => {
          apiRef.current = api as unknown as RoomCanvasApi;
        }}
        initialData={{
          elements: restoreElements(initialElements as never, null),
          appState: { gridSize: 20 },
        }}
        onChange={(elements, appState, files) => {
          if (applyingRemote.current) return;
          forwardToolToSheet(appState.activeTool?.type ?? "selection", appState.activeTool?.locked ?? false);
          queuePush();
          void files;
        }}
        UIOptions={{
          canvasActions: {
            changeViewBackgroundColor: false,
            clearCanvas: false,
            export: false,
            loadScene: false,
            saveToActiveFile: false,
            toggleTheme: false,
            saveAsImage: false,
          },
        }}
      />
      <RoomMenu room={room} />
    </div>
  );
}

type RoomCanvasApi = {
  getSceneElementsIncludingDeleted: () => { version: number }[];
  getSceneElements: () => { version: number }[];
  getAppState: () => { scrollX: number; scrollY: number; zoom: { value: number } };
  getFiles: () => Record<string, unknown>;
  updateScene: (scene: Record<string, unknown>) => void;
};

function RoomMenu({ room }: { room: RoomMenuInfo }) {
  const navigate = useNavigate();
  const { data: session, refetch } = authClient.useSession();
  const { resolvedTheme, setTheme } = useTheme();
  const [copied, setCopied] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const assignedDefault = useRef(false);
  const inviteInputRef = useRef<HTMLInputElement>(null);

  const name = session?.user.name ?? "?";
  const savedColor = session?.user.color as string | null | undefined;
  const color = savedColor ?? userColor(session?.user.id ?? "?");
  const dark = resolvedTheme === "dark";
  const inviteUrl =
    room.inviteToken != null ? `${window.location.origin}/invite/${room.inviteToken}` : null;

  const setColor = useMutation(
    trpc.profile.setColor.mutationOptions({
      onSuccess: () => refetch(),
    }),
  );

  useEffect(() => {
    if (session && !savedColor && !assignedDefault.current) {
      assignedDefault.current = true;
      setColor.mutate({ color: randomUserColor() });
    }
  }, [session, savedColor, setColor]);

  async function copyInvite() {
    if (!inviteUrl) return;
    // navigator.clipboard needs a secure context; plain http dev servers throw.
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      inviteInputRef.current?.focus();
      inviteInputRef.current?.select();
      toast.error("Clipboard blocked here, copy the link manually");
    }
  }

  async function signOut() {
    await authClient.signOut();
    navigate("/login");
  }

  return (
    <div className="absolute left-3 top-3 z-10 flex items-center gap-3">
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Room menu"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-input bg-background text-sm font-medium shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <Menu className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel>
              <div className="font-semibold">{room.name}</div>
              <div className="font-normal opacity-60">
                {room.role === "master" ? "Master" : "Player"}
              </div>
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          {room.role === "master" && inviteUrl && (
            <>
              <DropdownMenuItem onClick={copyInvite}>
                <Copy className="h-4 w-4" />
                {copied ? "Invite copied" : "Copy invite link"}
              </DropdownMenuItem>
              <div className="px-2 py-1.5">
                <div className="mb-1 text-xs opacity-60">Invite link</div>
                <input
                  ref={inviteInputRef}
                  readOnly
                  value={inviteUrl}
                  onFocus={(e) => e.currentTarget.select()}
                  onClick={(e) => e.currentTarget.select()}
                  className="w-full rounded border border-input bg-background px-2 py-1 text-xs"
                />
              </div>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem onClick={() => navigate("/")}>
            <Rows3 className="h-4 w-4" />
            Back to rooms
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setShortcutsOpen(true)}>
            <Keyboard className="h-4 w-4" />
            Keyboard shortcuts
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setTheme(dark ? "light" : "dark")}>
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            {dark ? "Light mode" : "Dark mode"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel className="font-normal">
              <div className="mb-2 opacity-60">Profile color</div>
              <div className="flex items-center gap-1.5">
                {USER_PALETTE.map((swatch) => (
                  <button
                    key={swatch}
                    aria-label={`Use color ${swatch}`}
                    className="flex h-6 w-6 items-center justify-center rounded-full"
                    style={{ backgroundColor: swatch }}
                    onClick={() => setColor.mutate({ color: swatch })}
                  >
                    {color === swatch && <Check className="h-3.5 w-3.5 text-white" />}
                  </button>
                ))}
                <label
                  className="flex h-6 w-6 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-dashed"
                  title="Custom color"
                >
                  <input
                    type="color"
                    className="h-0 w-0 opacity-0"
                    value={color}
                    onChange={(e) => setColor.mutate({ color: e.target.value })}
                  />
                  <span className="text-xs font-bold">+</span>
                </label>
              </div>
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel className="font-normal opacity-60">
              {session?.user.email}
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuItem onClick={signOut}>
            <LogOut className="h-4 w-4" />
            Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <div className="flex items-center gap-1">
        <span
          className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white"
          style={{ backgroundColor: color }}
          title={name}
        >
          {name.charAt(0).toUpperCase()}
        </span>
        <div className="panel-solid rounded px-2 py-1 text-xs leading-tight shadow-md">
          <div className="font-semibold">{name}</div>
          <div className="opacity-60">{room.role === "master" ? "Master" : "Player"}</div>
        </div>
      </div>
    </div>
  );
}
