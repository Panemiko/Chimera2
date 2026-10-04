import {
  CaptureUpdateAction,
  Excalidraw,
  getSceneVersion,
  reconcileElements,
  restoreElements,
  THEME,
} from "@excalidraw/excalidraw";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { useMutation } from "@tanstack/react-query";
import { useSubscription } from "@trpc/tanstack-react-query";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";

import { queryClient, trpc } from "@/utils/trpc";
import type { SheetScene } from "./sheet-scene";
import "./sheet-canvas.css";

type SheetExcalidrawApi = {
  getSceneElementsIncludingDeleted: () => { version: number }[];
  getAppState: () => Record<string, unknown>;
  getFiles: () => Record<string, unknown>;
  addFiles: (files: unknown[]) => void;
  updateScene: (scene: Record<string, unknown>) => void;
};

type PendingSnapshot = {
  elements: { version: number }[];
  files: Record<string, unknown>;
};

export default function SheetCanvas({
  roomId,
  userId,
  initialScene,
  templateUrl,
}: {
  roomId: string;
  userId: string;
  initialScene: SheetScene;
  templateUrl: string | null;
}) {
  const { resolvedTheme } = useTheme();
  const apiRef = useRef<SheetExcalidrawApi | null>(null);
  const pushSheet = useMutation(trpc.characters.pushSheetScene.mutationOptions());
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const applyingRemote = useRef(false);
  const dirtyRef = useRef(false);
  const pendingRef = useRef<PendingSnapshot | null>(null);

  // Baseline captured once per mount. Seeding lastSentVersion with it skips
  // the onChange echo Excalidraw fires on mount, and the element count guard
  // in pushNow stops a transient empty read from wiping a scene with content.
  const [baseline] = useState(() => ({
    version: getSceneVersion(initialScene.elements as never),
    count: initialScene.elements.length,
  }));
  const lastSentVersion = useRef<number>(baseline.version);

  function pushNow() {
    // Reads the snapshot taken during onChange, never the live API: on
    // unmount the Excalidraw instance may already be torn down, and reading
    // it then can return an empty scene that would overwrite real content.
    const snap = pendingRef.current;
    pendingRef.current = null;
    if (!snap) return;
    const version = getSceneVersion(snap.elements as never);
    if (version === lastSentVersion.current) return;
    if (snap.elements.length === 0 && baseline.count > 0) return;
    lastSentVersion.current = version;
    const scene = JSON.stringify({ elements: snap.elements, files: snap.files });
    pushSheet.mutate(
      { roomId, userId, elements: snap.elements as never, files: snap.files as never },
      {
        // Keep the query cache in sync with what was saved, so a future
        // mount starts from this content instead of a stale copy.
        onSuccess: () => {
          queryClient.setQueryData(
            trpc.characters.getSheetCanvas.queryKey({ roomId, userId }),
            (old) => (old ? { ...old, scene } : old),
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
    if (getSceneVersion(elements as never) === lastSentVersion.current) return;
    pendingRef.current = { elements, files: files ?? {} };
    dirtyRef.current = true;
    queuePush();
  }

  // Latest server copy. Stored on every prop change and applied when the
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

  useEffect(() => {
    return () => {
      if (pushTimer.current) {
        clearTimeout(pushTimer.current);
        pushTimer.current = null;
        pushNow();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, userId]);

  // Fresh server data that arrives after mount (background refetch over a
  // stale cache, reconnect, focus) applies itself while the user has no
  // local edits. Without this the mounted scene keeps stale content and the
  // next autosave overwrites the newer server copy.
  useEffect(() => {
    serverSceneRef.current = {
      elements: initialScene.elements,
      files: initialScene.files,
      version: getSceneVersion(initialScene.elements as never),
    };
    applyServerSceneIfClean();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialScene]);

  useSubscription(
    trpc.characters.onSheetScene.subscriptionOptions(
      { roomId, userId },
      {
        onData: (envelope) => {
          const remote = envelope.data as { elements?: unknown; files?: unknown };
          applyRemoteScene(remote.elements, remote.files);
        },
      },
    ),
  );

  const dark = resolvedTheme === "dark";
  const dot = dark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.12)";
  const layers = [];
  if (templateUrl) layers.push(`url("${templateUrl}")`);
  layers.push(`radial-gradient(circle, ${dot} 1.2px, transparent 1.2px)`);
  return (
    <div
      className="sheet-canvas relative min-h-0 w-full flex-1 overflow-hidden rounded border border-input"
      style={{
        backgroundImage: layers.join(", "),
        backgroundSize: templateUrl ? "contain, 24px 24px" : "24px 24px",
        backgroundPosition: "center",
        backgroundRepeat: templateUrl ? "no-repeat, repeat" : "repeat",
      }}
    >
      <Excalidraw
        theme={resolvedTheme === "dark" ? THEME.DARK : THEME.LIGHT}
        validateEmbeddable={true}
        excalidrawAPI={(api) => {
          apiRef.current = api as unknown as SheetExcalidrawApi;
          // The server copy may have arrived before the API was ready.
          applyServerSceneIfClean();
        }}
        initialData={{
          elements: restoreElements(
            initialScene.elements as unknown as OrderedExcalidrawElement[],
            null,
          ),
          files: initialScene.files as unknown as Record<string, never>,
          appState: { viewBackgroundColor: "transparent", gridSize: 20 },
        }}
        onChange={() => {
          if (applyingRemote.current) return;
          handleLocalChange();
        }}
        UIOptions={{
          canvasActions: {
            clearCanvas: false,
          },
        }}
      />
    </div>
  );
}
