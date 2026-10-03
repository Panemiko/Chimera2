import "@excalidraw/excalidraw/index.css";
import "./room-canvas.css";
import "./excalidraw-theme.css";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@chimera2/ui/components/dropdown-menu";
import { Button } from "@chimera2/ui/components/button";
import { Input } from "@chimera2/ui/components/input";
import {
  CaptureUpdateAction,
  Excalidraw,
  getSceneVersion,
  reconcileElements,
  restoreElements,
  sceneCoordsToViewportCoords,
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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sceneQuery = useQuery(trpc.canvas.getScene.queryOptions({ roomId: room.id }));
  const pushScene = useMutation(trpc.canvas.pushScene.mutationOptions());
  const pushPointer = useMutation(trpc.canvas.pushPointer.mutationOptions());
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSentVersion = useRef<number | null>(null);
  const applyingRemote = useRef(false);
  const collaborators = useRef(
    new Map<string, { username: string; color: string; x: number; y: number; tx: number; ty: number; at: number; tool: "pointer" | "laser"; button: "up" | "down" }>(),
  );
  const smoothTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [overlays, setOverlays] = useState<
    { id: string; username: string; color: string; x: number; y: number }[]
  >([]);
  const [initialElements, setInitialElements] = useState<unknown[] | null>(null);
  const [initialFiles, setInitialFiles] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    if (sceneQuery.data && initialElements === null && initialFiles === null) {
      try {
        const parsed = JSON.parse(sceneQuery.data.scene) as {
          elements?: unknown;
          files?: unknown;
        };
        setInitialElements(Array.isArray(parsed.elements) ? parsed.elements : []);
        setInitialFiles(
          parsed.files && typeof parsed.files === "object" && !Array.isArray(parsed.files)
            ? (parsed.files as Record<string, unknown>)
            : {},
        );
      } catch {
        setInitialElements([]);
        setInitialFiles({});
      }
    }
  }, [sceneQuery.data, initialElements, initialFiles]);

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
          const remote = envelope.data as { elements?: unknown; files?: unknown };
          const api = apiRef.current;
          if (!api || !Array.isArray(remote.elements)) return;
          try {
            applyingRemote.current = true;
            if (remote.files && typeof remote.files === "object") {
              const list = Object.values(remote.files as Record<string, unknown>).filter(
                (f): f is { id: string; dataURL: string } =>
                  !!f && typeof f === "object" && typeof (f as { id?: unknown }).id === "string",
              );
              if (list.length > 0) {
                api.addFiles(list as never);
              }
            }
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
            tool: pointer.tool ?? "pointer",
            button: pointer.button ?? "up",
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
        setOverlays([]);
        return;
      }
      const cutoff = Date.now() - 5000;
      let moved = false;
      const next = new Map<
        string,
        {
          username: string;
          id: string;
          button: "up" | "down";
          pointer: {
            x: number;
            y: number;
            tool: "pointer" | "laser";
            laserColor: string;
            renderCursor: false;
          };
        }
      >();
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
          id,
          button: c.button,
          pointer: { x: c.x, y: c.y, tool: c.tool, laserColor: c.color, renderCursor: false },
        });
      }
      if (moved || next.size > 0) {
        try {
          api.updateScene({ collaborators: next });
        } catch {
          // Presence is decorative.
        }
      }
      try {
        const appState = api.getAppState();
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const items: { id: string; username: string; color: string; x: number; y: number }[] = [];
        for (const [id, c] of collaborators.current) {
          const vp = sceneCoordsToViewportCoords(
            { sceneX: c.x, sceneY: c.y },
            {
              zoom: appState.zoom as never,
              offsetLeft: rect.left,
              offsetTop: rect.top,
              scrollX: appState.scrollX,
              scrollY: appState.scrollY,
            },
          );
          items.push({
            id,
            username: c.username,
            color: c.color,
            x: vp.x - rect.left,
            y: vp.y - rect.top,
          });
        }
        setOverlays(items);
      } catch {
        // Overlay is decorative.
      }
    }, 33);
  }

  function sendPointer(clientX: number, clientY: number, rect: DOMRect, pressed: boolean) {
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
      const tool = appState.activeTool?.type === "laser" ? "laser" : "pointer";
      pushPointer.mutate({
        roomId: room.id,
        x: scene.x,
        y: scene.y,
        tool,
        button: pressed ? "down" : "up",
      });
    } catch {
      // Best effort presence.
    }
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (pointerTimer.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = e.clientX;
    const clientY = e.clientY;
    const pressed = e.buttons > 0;
    pointerTimer.current = setTimeout(() => {
      pointerTimer.current = null;
      sendPointer(clientX, clientY, rect, pressed);
    }, 50);
  }

  function handlePointerButton(e: React.PointerEvent<HTMLDivElement>, pressed: boolean) {
    if (pointerTimer.current) {
      clearTimeout(pointerTimer.current);
      pointerTimer.current = null;
    }
    sendPointer(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect(), pressed);
  }

  if (sceneQuery.isLoading || initialElements === null || initialFiles === null) {
    return <div className="h-full w-full" />;
  }

  const dark = resolvedTheme === "dark";
  const dot = dark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.12)";

  return (
    <div
      ref={containerRef}
      className="room-canvas relative h-full w-full"
      style={{
        backgroundImage: `radial-gradient(circle, ${dot} 1.2px, transparent 1.2px)`,
        backgroundSize: "24px 24px",
      }}
      onPointerMove={handlePointerMove}
      onPointerDown={(e) => handlePointerButton(e, true)}
      onPointerUp={(e) => handlePointerButton(e, false)}
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
        validateEmbeddable={true}
        renderTopRightUI={() => null}
        excalidrawAPI={(api) => {
          apiRef.current = api as unknown as RoomCanvasApi;
        }}
        initialData={{
          elements: restoreElements(initialElements as never, null),
          files: initialFiles as never,
          appState: { viewBackgroundColor: "transparent" },
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
      <div className="pointer-events-none absolute inset-0 z-[1] overflow-hidden">
        {overlays.map((o) => (
          <div
            key={o.id}
            className="absolute left-0 top-0"
            style={{ transform: `translate(${o.x}px, ${o.y}px)` }}
          >
            <svg width="11" height="14" viewBox="0 0 11 14" fill="none">
              <path
                d="M0 0 L0 14 L4 9 L11 8 Z"
                fill={o.color}
                stroke="white"
                strokeWidth="2"
                strokeLinejoin="round"
                style={{ paintOrder: "stroke" }}
              />
            </svg>
            <span
              style={{
                position: "absolute",
                left: "5px",
                top: "16px",
                backgroundColor: o.color,
                color: "#1e1e1e",
                border: "1px solid white",
                borderRadius: "8px",
                padding: "2px 7px",
                fontSize: "12px",
                fontWeight: 600,
                fontFamily: "sans-serif",
                lineHeight: "16px",
                whiteSpace: "nowrap",
              }}
            >
              {o.username}
            </span>
          </div>
        ))}
      </div>
      <RoomMenu room={room} />
    </div>
  );
}

type RoomCanvasApi = {
  getSceneElementsIncludingDeleted: () => { version: number }[];
  getSceneElements: () => { version: number }[];
  getAppState: () => {
    scrollX: number;
    scrollY: number;
    zoom: { value: number };
    activeTool?: { type: string };
  };
  getFiles: () => Record<string, unknown>;
  addFiles: (files: unknown[]) => void;
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
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" aria-label="Room menu">
            <Menu className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel>
              <div className="font-semibold">{room.name}</div>
              <div className="font-normal text-muted-foreground">
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
                <div className="mb-1 text-xs text-muted-foreground">Invite link</div>
                <Input
                  ref={inviteInputRef}
                  readOnly
                  value={inviteUrl}
                  onFocus={(e) => e.currentTarget.select()}
                  onClick={(e) => e.currentTarget.select()}
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
              <div className="mb-2 text-muted-foreground">Profile color</div>
              <div className="flex items-center gap-1.5">
                {USER_PALETTE.map((swatch) => (
                  <button
                    key={swatch}
                    aria-label={`Use color ${swatch}`}
                    className="flex h-6 w-6 items-center justify-center rounded-full"
                    style={{ backgroundColor: swatch }}
                    onClick={() => setColor.mutate({ color: swatch })}
                  >
                    {color === swatch && <Check className="h-3.5 w-3.5 text-primary-foreground" />}
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
            <DropdownMenuLabel className="font-normal text-muted-foreground">
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
          className="flex size-8 items-center justify-center rounded-full text-xs font-bold text-primary-foreground"
          style={{ backgroundColor: color }}
          title={name}
        >
          {name.charAt(0).toUpperCase()}
        </span>
        <div className="px-1 py-0.5 text-xs leading-tight drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
          <div className="font-semibold text-foreground">{name}</div>
          <div className="text-muted-foreground">{room.role === "master" ? "Master" : "Player"}</div>
        </div>
      </div>
    </div>
  );
}
