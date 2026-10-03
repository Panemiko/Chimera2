import type { SheetApi } from "./sheet-canvas";

let sheetApi: SheetApi | null = null;
let sheetFocused = false;
let privateOpen = false;

export function registerSheetApi(api: SheetApi | null) {
  sheetApi = api;
}

export function setSheetFocused(focused: boolean) {
  sheetFocused = focused;
}

export function setPrivateOpen(open: boolean) {
  privateOpen = open;
}

export function isPrivateOpen() {
  return privateOpen;
}

// The main canvas toolbar drives the private space canvas while it
// holds focus, so there is a single toolbar for both canvases.
export function forwardToolToSheet(type: string, locked: boolean) {
  if (!sheetFocused || !sheetApi) return;
  try {
    sheetApi.setActiveTool({ type, locked });
  } catch {
    // Sheet canvas not ready yet.
  }
}
