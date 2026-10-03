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

function vividColor(hex: string): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  if (!Number.isFinite(n)) return hex;
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let hslH = 0;
  let hslS = 0;
  let hslL = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    hslS = hslL > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) hslH = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) hslH = (b - r) / d + 2;
    else hslH = (r - g) / d + 4;
    hslH /= 6;
  }
  // Light touch: keep the user's hue and lightness, just lift dull colors.
  // Grays and white pass through untouched. Light pinks stay light.
  if (hslS < 0.08) return hex;
  hslS = Math.min(1, hslS * 1.08 + 0.03);
  if (hslL > 0.7) hslL = 0.7 + (hslL - 0.7) * 0.85;
  else if (hslL < 0.32) hslL = 0.32 + (hslL - 0.32) * 0.6;

  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  let vr = hslL;
  let vg = hslL;
  let vb = hslL;
  if (hslS !== 0) {
    const q = hslL < 0.5 ? hslL * (1 + hslS) : hslL + hslS - hslL * hslS;
    const p = 2 * hslL - q;
    vr = hue2rgb(p, q, hslH + 1 / 3);
    vg = hue2rgb(p, q, hslH);
    vb = hue2rgb(p, q, hslH - 1 / 3);
  }
  const to255 = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 255);
  return `#${((1 << 24) + (to255(vr) << 16) + (to255(vg) << 8) + to255(vb)).toString(16).slice(1)}`;
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
          assetPath: "/",
          sounds: true,
          volume: 50,
          baseScale: 125,
          // Glossy shading keeps player colors punchy: glass has low
          // roughness, so saturated colors read as vivid instead of chalky.
          theme_material: "glass",
          color_spotlight: 0xffffff,
          light_intensity: 1.0,
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
      // The custom set carries its own material because loadTheme ignores
      // the argument when a custom colorset is present.
      try {
        const vivid = vividColor(request.color);
        box.theme_customColorset = {
          name: `player-${vivid}`,
          foreground: textOn(vivid),
          background: vivid,
          outline: "none",
          texture: "none",
          material: "glass",
        };
        await box.loadTheme({ colorset: "white", texture: "none", material: "glass" });
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
