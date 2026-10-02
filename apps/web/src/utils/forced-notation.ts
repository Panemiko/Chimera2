const SIDES = [4, 6, 8, 10, 12, 20, 100];

export type ForcedRollGroup = {
  sides: number;
  rolls: { value: number }[];
};

/**
 * Build a dice-box-threejs forced string (`2d20+1d10@14,7,3`) from server
 * results. Dice order in the spec matches values order, which is how the
 * library maps forced faces onto thrown dice. d100 expands to a tens die
 * plus a units die (the library's d100 only carries tens labels).
 * Returns null when anything is outside the supported range (card and
 * history still show the result).
 */
export function buildForcedNotation(groups: ForcedRollGroup[]): string | null {
  const dice: number[] = [];
  const values: number[] = [];

  for (const group of groups) {
    if (!SIDES.includes(group.sides)) return null;
    for (const roll of group.rolls) {
      if (!Number.isInteger(roll.value) || roll.value < 1) return null;
      if (group.sides === 100) {
        if (roll.value > 100) return null;
        const tens = roll.value === 100 ? 100 : Math.floor(roll.value / 10) * 10 || 100;
        dice.push(100, 10);
        values.push(tens, roll.value % 10);
      } else {
        if (roll.value > group.sides) return null;
        dice.push(group.sides);
        values.push(roll.value);
      }
    }
  }
  if (dice.length === 0) return null;

  const parts: string[] = [];
  let runSides = dice[0]!;
  let runCount = 1;
  for (let i = 1; i <= dice.length; i++) {
    if (dice[i] === runSides) {
      runCount++;
    } else {
      parts.push(`${runCount}d${runSides}`);
      runSides = dice[i]!;
      runCount = 1;
    }
  }
  return `${parts.join("+")}@${values.join(",")}`;
}
