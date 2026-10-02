export const USER_PALETTE = [
  "#e03131",
  "#f76707",
  "#fcc419",
  "#2f9e44",
  "#1971c2",
  "#7048e8",
  "#e64980",
  "#0c8599",
];

export function userColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  }
  return USER_PALETTE[hash % USER_PALETTE.length] ?? USER_PALETTE[0]!;
}

export function randomUserColor(): string {
  const pick = USER_PALETTE[Math.floor(Math.random() * USER_PALETTE.length)];
  return pick ?? USER_PALETTE[0]!;
}
