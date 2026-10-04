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
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useTheme } from "next-themes";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";
import { randomUserColor, USER_PALETTE, userColor } from "@/utils/user-color";
import { queryClient, trpc } from "@/utils/trpc";
import ShortcutsDialog from "./shortcuts-dialog";

export type RoomMenuInfo = {
  id: string;
  name: string;
  role: "master" | "player";
  inviteToken: string | null;
};

// Raio do hexagono da grade (centro ao vertice, em unidades de cena).
// 52 da hexes de ~90px de largura em zoom 1, uma escala usual de mesa.
const HEX_RADIUS = 52;

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
  const dirtyRef = useRef(false);
  const pendingRef = useRef<{
    elements: { version: number }[];
    files: Record<string, unknown>;
  } | null>(null);
  // Latched from the first server response (see the effect below). Seeding
  // lastSentVersion with it skips the onChange echo on mount, and the count
  // guard in pushNow stops a transient empty read from wiping real content.
  const baselineRef = useRef<{ version: number; count: number } | null>(null);
  const collaborators = useRef(
    new Map<string, { username: string; color: string; x: number; y: number; tx: number; ty: number; at: number; tool: "pointer" | "laser"; button: "up" | "down" }>(),
  );
  const smoothTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [overlays, setOverlays] = useState<
    { id: string; username: string; color: string; x: number; y: number }[]
  >([]);
  const [initialElements, setInitialElements] = useState<unknown[] | null>(null);
  const [initialFiles, setInitialFiles] = useState<Record<string, unknown> | null>(null);
  // Camera da cena (scroll + zoom). A grade de hexagonos e desenhada por
  // escrita direta no DOM (refs), fora do render do React: atualizar via
  // setState atrasa um frame em relacao ao canvas e a grade parece flutuar.
  const gridSvgRef = useRef<SVGSVGElement | null>(null);
  const gridPathRef = useRef<SVGPathElement | null>(null);
  const gridSizeRef = useRef({ w: 0, h: 0 });
  const gridCamRef = useRef({ scrollX: 0, scrollY: 0, zoom: 1 });
  const gridLoopRef = useRef<number | null>(null);

  function paintGrid(scrollX: number, scrollY: number, zoom: number) {
    gridCamRef.current = { scrollX, scrollY, zoom };
    const path = gridPathRef.current;
    const svg = gridSvgRef.current;
    if (!path || !svg) return;
    const { w, h } = gridSizeRef.current;
    if (w <= 0 || h <= 0 || zoom <= 0) {
      path.setAttribute("d", "");
      return;
    }
    const radius = HEX_RADIUS;
    const hexW = Math.sqrt(3) * radius;
    const rowStep = 1.5 * radius;
    if (hexW * zoom < 12) {
      path.setAttribute("d", "");
      return;
    }
    const sceneX0 = -scrollX - hexW;
    const sceneX1 = -scrollX + w / zoom + hexW;
    const sceneY0 = -scrollY - radius * 2;
    const sceneY1 = -scrollY + h / zoom + radius * 2;
    const row0 = Math.floor(sceneY0 / rowStep);
    const row1 = Math.ceil(sceneY1 / rowStep);
    if (row1 - row0 > 400) {
      path.setAttribute("d", "");
      return;
    }
    const cos30 = Math.sqrt(3) / 2;
    const sin30 = 0.5;
    const corners: [number, number][] = [
      [cos30, sin30],
      [0, 1],
      [-cos30, sin30],
      [-cos30, -sin30],
      [0, -1],
      [cos30, -sin30],
    ];
    let d = "";
    for (let row = row0; row <= row1; row += 1) {
      const cy = row * rowStep;
      const offsetX = Math.abs(row % 2) === 1 ? hexW / 2 : 0;
      const col0 = Math.floor((sceneX0 - offsetX) / hexW);
      const col1 = Math.ceil((sceneX1 - offsetX) / hexW);
      if (col1 - col0 > 400) {
        path.setAttribute("d", "");
        return;
      }
      for (let col = col0; col <= col1; col += 1) {
        const cx = col * hexW + offsetX;
        const vx0 = (cx + scrollX) * zoom;
        const vy0 = (cy + scrollY) * zoom;
        const rr = radius * zoom;
        for (let i = 0; i < 6; i += 1) {
          const [ux, uy] = corners[i];
          const px = vx0 + ux * rr;
          const py = vy0 + uy * rr;
          d += i === 0 ? `M${px.toFixed(1)} ${py.toFixed(1)}` : `L${px.toFixed(1)} ${py.toFixed(1)}`;
        }
        d += "Z";
      }
    }
    if (path.getAttribute("d") !== d) path.setAttribute("d", d);
  }

  function handleViewChange(appState: unknown) {
    const state = appState as { scrollX?: number; scrollY?: number; zoom?: { value: number } };
    paintGrid(state.scrollX ?? 0, state.scrollY ?? 0, state.zoom?.value ?? 1);
  }

  function syncViewFromApi() {
    try {
      const appState = apiRef.current?.getAppState() as
        | { scrollX?: number; scrollY?: number; zoom?: { value: number } }
        | undefined;
      if (appState) handleViewChange(appState);
    } catch {
      // Grade e decorativa.
    }
  }

  function startGridLoop() {
    if (gridLoopRef.current !== null) return;
    const tick = () => {
      gridLoopRef.current = requestAnimationFrame(tick);
      try {
        const appState = apiRef.current?.getAppState() as
          | { scrollX?: number; scrollY?: number; zoom?: { value: number } }
          | undefined;
        if (!appState) return;
        const next = {
          scrollX: appState.scrollX ?? 0,
          scrollY: appState.scrollY ?? 0,
          zoom: appState.zoom?.value ?? 1,
        };
        const prev = gridCamRef.current;
        if (prev.scrollX !== next.scrollX || prev.scrollY !== next.scrollY || prev.zoom !== next.zoom) {
          paintGrid(next.scrollX, next.scrollY, next.zoom);
        }
      } catch {
        // Grade e decorativa.
      }
    };
    gridLoopRef.current = requestAnimationFrame(tick);
  }

  useEffect(() => {
    if (sceneQuery.data && initialElements === null && initialFiles === null) {
      try {
        const parsed = JSON.parse(sceneQuery.data.scene) as {
          elements?: unknown;
          files?: unknown;
        };
        const elements = Array.isArray(parsed.elements) ? parsed.elements : [];
        const files =
          parsed.files && typeof parsed.files === "object" && !Array.isArray(parsed.files)
            ? (parsed.files as Record<string, unknown>)
            : {};
        setInitialElements(elements);
        setInitialFiles(files);
        baselineRef.current = {
          version: getSceneVersion(elements as never),
          count: elements.length,
        };
        lastSentVersion.current = baselineRef.current.version;
      } catch {
        setInitialElements([]);
        setInitialFiles({});
        baselineRef.current = { version: getSceneVersion([] as never), count: 0 };
        lastSentVersion.current = baselineRef.current.version;
      }
    }
  }, [sceneQuery.data, initialElements, initialFiles]);

  function pushNow() {
    // Reads the snapshot taken during onChange, never the live API: on
    // unmount the Excalidraw instance may already be torn down, and reading
    // it then can return an empty scene that would overwrite real content.
    const snap = pendingRef.current;
    pendingRef.current = null;
    if (!snap) return;
    const version = getSceneVersion(snap.elements as never);
    if (lastSentVersion.current === version) return;
    if (snap.elements.length === 0 && (baselineRef.current?.count ?? 0) > 0) return;
    lastSentVersion.current = version;
    const scene = JSON.stringify({ elements: snap.elements, files: snap.files });
    pushScene.mutate(
      { roomId: room.id, elements: snap.elements as never, files: snap.files as never },
      {
        // Keep the query cache in sync with what was saved, so a future
        // mount starts from this content instead of a stale copy.
        onSuccess: () => {
          queryClient.setQueryData(trpc.canvas.getScene.queryKey({ roomId: room.id }), (old) =>
            old ? { ...old, scene } : old,
          );
        },
      },
    );
  }

  function queuePush() {
    if (pushTimer.current) return;
    pushTimer.current = setTimeout(() => {
      pushTimer.current = null;
      pushNow();
    }, 400);
  }

  function handleLocalChange() {
    const api = apiRef.current;
    if (!api) return;
    let elements: { version: number }[];
    let files: Record<string, unknown>;
    try {
      // IncludingDeleted keeps tombstones so deletions propagate to the
      // other side instead of being resurrected by reconcile.
      elements = api.getSceneElementsIncludingDeleted();
      files = api.getFiles() as Record<string, unknown>;
    } catch {
      return;
    }
    if (lastSentVersion.current === getSceneVersion(elements as never)) return;
    pendingRef.current = { elements, files: files ?? {} };
    dirtyRef.current = true;
    queuePush();
  }

  // Latest server copy. Stored on every query change and applied when the
  // user has no local edits, including the case where the data arrives
  // before the Excalidraw API is ready (applied from the api callback then).
  const serverSceneRef = useRef<{ elements: unknown; files: unknown; version: number } | null>(null);

  function applyServerSceneIfClean() {
    const server = serverSceneRef.current;
    if (!server || dirtyRef.current || applyingRemote.current || !apiRef.current) return;
    if (server.version === lastSentVersion.current) return;
    applyRemoteScene(server.elements, server.files);
  }

  function applyRemoteScene(elements: unknown, files: unknown) {
    const api = apiRef.current;
    if (!api || !Array.isArray(elements)) return;
    try {
      applyingRemote.current = true;
      if (files && typeof files === "object") {
        const list = Object.values(files as Record<string, unknown>).filter(
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
        elements as never,
        api.getAppState() as never,
      );
      api.updateScene({ elements: reconciled, captureUpdate: CaptureUpdateAction.NEVER });
      lastSentVersion.current = getSceneVersion(reconciled as never);
    } catch {
      // Keep local scene on merge failure.
    } finally {
      applyingRemote.current = false;
    }
  }

  // Fresh server data that arrives after mount (background refetch over a
  // stale cache, reconnect, focus) applies itself while the user has no
  // local edits. Without this the mounted scene keeps stale content and the
  // next autosave overwrites the newer server copy.
  useEffect(() => {
    if (!sceneQuery.data || initialElements === null) return;
    try {
      const parsed = JSON.parse(sceneQuery.data.scene) as { elements?: unknown; files?: unknown };
      if (!Array.isArray(parsed.elements)) return;
      serverSceneRef.current = {
        elements: parsed.elements,
        files: parsed.files,
        version: getSceneVersion(parsed.elements as never),
      };
      applyServerSceneIfClean();
    } catch {
      // Keep local scene on parse failure.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneQuery.data]);

  useEffect(() => {
    return () => {
      if (pushTimer.current) {
        clearTimeout(pushTimer.current);
        pushTimer.current = null;
        pushNow();
      }
      if (pointerTimer.current) clearTimeout(pointerTimer.current);
      if (smoothTimer.current) clearInterval(smoothTimer.current);
      if (gridLoopRef.current !== null) cancelAnimationFrame(gridLoopRef.current);
      gridLoopRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tamanho do container para a grade saber quantos hexagonos desenhar.
  // Depende dos dados iniciais porque antes deles o container nem existe
  // (early return de loading), e o efeito com [] nunca religaria o observer.
  // Escreve direto no DOM para nao passar pelo render do React no pan.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      const w = Math.round(rect.width);
      const h = Math.round(rect.height);
      const prev = gridSizeRef.current;
      if (prev.w === w && prev.h === h) return;
      gridSizeRef.current = { w, h };
      gridSvgRef.current?.setAttribute("width", String(w));
      gridSvgRef.current?.setAttribute("height", String(h));
      const cam = gridCamRef.current;
      paintGrid(cam.scrollX, cam.scrollY, cam.zoom);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialElements, initialFiles]);

  useSubscription(
    trpc.canvas.onScene.subscriptionOptions(
      { roomId: room.id },
      {
        onData: (envelope) => {
          const remote = envelope.data as { elements?: unknown; files?: unknown };
          applyRemoteScene(remote.elements, remote.files);
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
    }, 150);
  }

  function handlePointerButton(e: React.PointerEvent<HTMLDivElement>, pressed: boolean) {
    if (pointerTimer.current) {
      clearTimeout(pointerTimer.current);
      pointerTimer.current = null;
    }
    sendPointer(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect(), pressed);
  }

  const dark = resolvedTheme === "dark";
  const gridColor = dark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.10)";

  // Mantem o stroke em dia quando o tema muda (o path e pintado por ref).
  // Fica antes do return antecipado: hook depois de return condicional
  // quebra a ordem dos hooks entre renders.
  useEffect(() => {
    gridPathRef.current?.setAttribute("stroke", gridColor);
  }, [gridColor]);

  if (sceneQuery.isLoading || initialElements === null || initialFiles === null) {
    return <div className="h-full w-full" />;
  }

  return (
    <div
      ref={containerRef}
      className="room-canvas relative h-full w-full"
      onPointerMove={handlePointerMove}
      onPointerDown={(e) => handlePointerButton(e, true)}
      onPointerUp={(e) => handlePointerButton(e, false)}
    >
      {/* Grade por baixo do canvas: o fundo do Excalidraw e transparente
          (ver room-canvas.css) e o path e pintado por ref a cada frame,
          sem passar pelo React. Elementos da cena cobrem a grade. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <svg ref={gridSvgRef} className="block">
          <path
            ref={gridPathRef}
            fill="none"
            stroke={gridColor}
            strokeWidth={1}
            strokeOpacity={0.5}
          />
        </svg>
      </div>
      <div className="absolute inset-0">
        <Excalidraw
          theme={resolvedTheme === "dark" ? THEME.DARK : THEME.LIGHT}
          validateEmbeddable={true}
          renderTopRightUI={() => null}
          excalidrawAPI={(api) => {
            apiRef.current = api as unknown as RoomCanvasApi;
            // The server copy may have arrived before the API was ready.
            applyServerSceneIfClean();
            syncViewFromApi();
            startGridLoop();
          }}
          initialData={{
            elements: restoreElements(initialElements as never, null),
            files: initialFiles as never,
            appState: { viewBackgroundColor: "transparent" },
          }}
          onChange={(elements, appState, files) => {
            if (applyingRemote.current) {
              handleViewChange(appState);
              return;
            }
            handleLocalChange();
            handleViewChange(appState);
            void elements;
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
      </div>
      <div className="pointer-events-none absolute inset-0 z-[2] overflow-hidden">
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
      onSuccess: () => {
        void refetch();
        // Atualiza a lista de players na hora: sem isso o RosterPanel
        // mantém a cor antiga até o próximo polling.
        void queryClient.invalidateQueries({
          queryKey: trpc.characters.members.queryKey(),
        });
      },
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
        <div className="px-1 py-0.5 text-xs leading-tight dark:drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
          <div className="font-semibold text-foreground">{name}</div>
          <div className="text-muted-foreground">{room.role === "master" ? "Master" : "Player"}</div>
        </div>
      </div>
    </div>
  );
}
