declare module "@3d-dice/dice-box-threejs" {
  export type ThreeDiceBoxOptions = {
    assetPath?: string;
    sounds?: boolean;
    volume?: number;
    strength?: number;
    theme_colorset?: string;
    theme_texture?: string;
    theme_material?: string;
    theme_customColorset?: Record<string, unknown>;
    [key: string]: unknown;
  };

  export default class DiceBox {
    constructor(selector: string, options?: ThreeDiceBoxOptions);
    initialize(): Promise<void>;
    roll(notation: string): Promise<unknown>;
    reroll(diceIdArray: number[]): Promise<unknown>;
    clearDice(): void;
    theme_customColorset: Record<string, unknown> | null;
    loadTheme(themeConfig: { colorset?: string; texture?: string; material?: string }): Promise<void>;
  }
}
