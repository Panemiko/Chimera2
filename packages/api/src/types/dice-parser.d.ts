declare module "@3d-dice/dice-parser-interface" {
  export type ParserDieGroup = {
    qty: number;
    sides: number | string;
    mods: unknown[];
  };

  export type BoxRerollSpec = {
    groupId: number;
    rollId: number | string;
    sides: number;
    qty: number;
  };

  export type ParserFinalResults = {
    value: number;
    success?: boolean | null;
    successes?: number;
    failures?: number;
    valid?: boolean;
    [key: string]: unknown;
  };

  export default class DiceParser {
    constructor(options?: {
      targetRollsCritSuccess?: boolean;
      targetRollsCritFailure?: boolean;
      targetRollsCrit?: boolean;
    });
    parseNotation(notation: string): ParserDieGroup[];
    handleRerolls(rollResults: unknown[]): BoxRerollSpec[];
    parseFinalResults(rollResults: unknown): ParserFinalResults;
    clear(): void;
  }
}
