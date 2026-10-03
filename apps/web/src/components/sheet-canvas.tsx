import { Excalidraw, THEME } from "@excalidraw/excalidraw";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { useTheme } from "next-themes";
import { useEffect } from "react";

import type { SheetScene } from "./sheet-scene";
import { registerSheetApi } from "./canvas-focus";
import "./sheet-canvas.css";

export type SheetApi = {
  setActiveTool: (tool: { type: string; locked?: boolean }) => void;
};

export default function SheetCanvas({
  initialScene,
  templateUrl,
  onScene,
}: {
  initialScene: SheetScene;
  templateUrl: string | null;
  onScene: (scene: SheetScene) => void;
}) {
  const { resolvedTheme } = useTheme();
  useEffect(() => {
    return () => registerSheetApi(null);
  }, []);
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
        excalidrawAPI={(api) => {
          registerSheetApi(api as unknown as SheetApi);
        }}
        initialData={{
          elements: initialScene.elements as unknown as OrderedExcalidrawElement[],
          appState: { viewBackgroundColor: "transparent", gridSize: 20 },
        }}
        onChange={(elements, _appState, files) => {
          onScene({
            elements: [...elements] as unknown as Record<string, unknown>[],
            files: files ?? {},
          });
        }}
      />
    </div>
  );
}
