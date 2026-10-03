export type SheetScene = {
  elements: Record<string, unknown>[];
  files: Record<string, unknown>;
};

export function parseSheetScene(raw: string): SheetScene {
  try {
    const parsed = JSON.parse(raw) as { elements?: unknown; files?: unknown };
    return {
      elements: Array.isArray(parsed.elements)
        ? parsed.elements.filter(
            (el): el is Record<string, unknown> =>
              !!el && typeof el === "object" && typeof (el as { id?: unknown }).id === "string",
          )
        : [],
      files:
        parsed.files && typeof parsed.files === "object" && !Array.isArray(parsed.files)
          ? (parsed.files as Record<string, unknown>)
          : {},
    };
  } catch {
    return { elements: [], files: {} };
  }
}
