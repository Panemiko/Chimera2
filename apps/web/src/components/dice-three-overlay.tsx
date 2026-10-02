import { useEffect, useRef } from "react";
import { toast } from "sonner";

import type DiceBoxThree from "@3d-dice/dice-box-threejs";
import { buildForcedNotation, type ForcedRollGroup } from "@/utils/forced-notation";

export type ThreeDiceRequest = {
  key: number;
  groups: ForcedRollGroup[];
  color: string;
};

const SETTLE_GRACE_MS = 3000;
const SETTLE_FAILSAFE_MS = 20000;

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function textOn(hex: string): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  if (!Number.isFinite(n)) return "#ffffff";
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? "#1c2430" : "#ffffff";
}

export default function DiceThreeOverlay({
  request,
  onSettled,
}: {
  request: ThreeDiceRequest | null;
  onSettled: (key: number) => void;
}) {
  const boxRef = useRef<DiceBoxThree | null>(null);
  const failedRef = useRef(false);
  const latestRef = useRef<ThreeDiceRequest | null>(null);
  const onSettledRef = useRef(onSettled);
  onSettledRef.current = onSettled;

  useEffect(() => {
    let cancelled = false;
    let box: DiceBoxThree | null = null;
    (async () => {
      const { default: DiceBox } = await import("@3d-dice/dice-box-threejs");
      if (cancelled) return;
      try {
        box = new DiceBox("#dice-three-overlay", {
          sounds: false,
          baseScale: 125,
          // Even matte shading: wood is diffuse-dominant (roughness 0.9),
          // neutral spotlight and softer light kill the specular hotspots
          // that made faces blow out at some angles.
          theme_material: "wood",
          color_spotlight: 0xffffff,
          light_intensity: 0.45,
        });
        await box.initialize();
      } catch {
        if (!cancelled && !failedRef.current) {
          failedRef.current = true;
          toast.error("3D dice unavailable, results still appear on cards");
        }
        return;
      }
      if (cancelled) return;
      boxRef.current = box;
    })();
    return () => {
      cancelled = true;
      try {
        box?.clearDice();
      } catch {
        // Engine teardown is best-effort.
      }
      boxRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!request) return;
    latestRef.current = request;
    let cancelled = false;
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      onSettledRef.current(request.key);
    };
    const failsafe = setTimeout(settle, SETTLE_FAILSAFE_MS);
    (async () => {
      while (!boxRef.current && !failedRef.current && !cancelled) {
        await sleep(50);
      }
      if (cancelled || failedRef.current || !boxRef.current) {
        settle();
        return;
      }
      const box = boxRef.current;
      const notation = buildForcedNotation(request.groups);
      if (!notation) {
        settle();
        return;
      }
      // Player-colored dice; falls back to the default theme on failure.
      try {
        box.theme_customColorset = {
          name: `player-${request.color}`,
          foreground: textOn(request.color),
          background: request.color,
        };
        await box.loadTheme({ colorset: "white", texture: "", material: "glass" });
      } catch {
        // Keep the default theme.
      }
      try {
        await box.roll(notation);
      } catch {
        settle();
        return;
      }
      settle();
      if (cancelled || latestRef.current !== request) return;
      await sleep(900);
      if (cancelled || latestRef.current !== request) return;
      try {
        box.clearDice();
      } catch {
        // Engine teardown is best-effort.
      }
    })();
    return () => {
      cancelled = true;
      clearTimeout(failsafe);
    };
  }, [request]);

  return <div id="dice-three-overlay" className="pointer-events-none absolute inset-0 z-50" />;
}
