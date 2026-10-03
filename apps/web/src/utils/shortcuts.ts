export type AppShortcut = {
  key: string;
  action: string;
  hint: string;
};

export const APP_SHORTCUTS: AppShortcut[] = [
  { key: "/", action: "Focus dice input", hint: "Outside text fields" },
  { key: "C", action: "Toggle character sheet", hint: "Outside text fields" },
];
