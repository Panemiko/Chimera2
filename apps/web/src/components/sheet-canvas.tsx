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
import { useEffect, useRef } from "react";

import { trpc } from "@/utils/trpc";
import type { SheetScene } from "./sheet-scene";
import { registerSheetApi } from "./canvas-focus";
import "./sheet-canvas.css";

export type SheetApi = {
  setActiveTool: (tool: { type: string; locked?: boolean }) => void;
};

type SheetExcalidrawApi = {
  getSceneElementsIncludingDeleted: () => { version: number }[];
  getAppState: () => Record<string, unknown>;
  getFiles: () => Record<string, unknown>;
  addFiles: (files: unknown[]) => void;
  updateScene: (scene: Record<string, unknown>) => void;
  setActiveTool: (tool: { type: string; locked?: boolean }) => void;
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
  const lastSentVersion = useRef<number | null>(null);
  const applyingRemote = useRef(false);

  useEffect(() => {
    return () => registerSheetApi(null);
  }, []);

  function pushNow() {
    const api = apiRef.current;
    if (!api) return;
    try {
      const elements = api.getSceneElementsIncludingDeleted();
      const version = getSceneVersion(elements as never);
      if (lastSentVersion.current === version) return;
      lastSentVersion.current = version;
      pushSheet.mutate({ roomId, userId, elements: elements as never, files: api.getFiles() as never });
    } catch {
      // Best effort sync.
    }
  }

  function queuePush() {
    if (pushTimer.current) return;
    pushTimer.current = setTimeout(() => {
      pushTimer.current = null;
      pushNow();
    }, 400);
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

  useSubscription(
    trpc.characters.onSheetScene.subscriptionOptions(
      { roomId, userId },
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

  const dark = resolvedTheme === "dark";
  const dot = dark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.12)";
  const layers = [];
  if (templateUrl) layers.push(`url("${templateUrl}")`);
  layers.push(`radial-gradient(circle, ${dot} 1.2px, transparent 1.2px)`);
  return (
    <div
      className="sheet-canvas relative h-[60vh] w-full overflow-hidden rounded border border-input"
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
          registerSheetApi(api as unknown as SheetApi);
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
          queuePush();
        }}
      />
    </div>
  );
}
