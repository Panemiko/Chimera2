export const CHARACTER_TEMPLATE_ID = "dnd5e-full";

export const ATTRIBUTES = ["str", "dex", "con", "int", "wis", "cha"] as const;

export const SKILLS = [
  "acrobatics",
  "animal_handling",
  "arcana",
  "athletics",
  "deception",
  "history",
  "insight",
  "intimidation",
  "investigation",
  "medicine",
  "nature",
  "perception",
  "performance",
  "persuasion",
  "religion",
  "sleight_of_hand",
  "stealth",
  "survival",
] as const;

export type CharacterTemplateDefinition = {
  version: number;
  sections: { id: string; label: string; fields: { key: string; label: string; kind: string }[] }[];
};

function text(key: string, label: string) {
  return { key, label, kind: "text" as const };
}

function num(key: string, label: string) {
  return { key, label, kind: "number" as const };
}

function full(key: string, label: string) {
  return { key, label, kind: "fulltext" as const };
}

export const DEFAULT_TEMPLATE: CharacterTemplateDefinition = {
  version: 2,
  sections: [
    {
      id: "identity",
      label: "Identity",
      fields: [
        text("characterName", "Character name"),
        text("class", "Class"),
        num("level", "Level"),
        text("background", "Background"),
        text("race", "Race"),
        text("alignment", "Alignment"),
        num("xp", "XP"),
      ],
    },
    {
      id: "attributes",
      label: "Abilities",
      fields: [
        num("str", "STR"),
        num("dex", "DEX"),
        num("con", "CON"),
        num("int", "INT"),
        num("wis", "WIS"),
        num("cha", "CHA"),
      ],
    },
    {
      id: "combat",
      label: "Combat",
      fields: [
        num("hpCurrent", "HP current"),
        num("hpMax", "HP max"),
        num("tempHp", "Temp HP"),
        num("ac", "Armor class"),
        num("initiative", "Initiative"),
        num("speed", "Speed"),
        text("hitDice", "Hit dice"),
        text("deathSaves", "Death saves"),
      ],
    },
    {
      id: "skills",
      label: "Skills",
      fields: SKILLS.map((s) => num(s, s)),
    },
    {
      id: "traits",
      label: "Traits",
      fields: [
        full("proficiencies", "Proficiencies"),
        full("languages", "Languages"),
        full("features", "Features and traits"),
      ],
    },
    {
      id: "spells",
      label: "Spells",
      fields: [
        text("spellcastingClass", "Spellcasting class"),
        text("spellcastingAbility", "Ability"),
        num("saveDc", "Save DC"),
        num("attackBonus", "Attack bonus"),
        full("slots", "Slots"),
        full("spellList", "Spell list"),
      ],
    },
    {
      id: "inventory",
      label: "Inventory",
      fields: [full("equipment", "Equipment"), full("treasure", "Treasure"), full("notes", "Notes")],
    },
  ],
};

export function getTemplateFieldKind(key: string): string | null {
  for (const section of DEFAULT_TEMPLATE.sections) {
    const found = section.fields.find((f) => f.key === key);
    if (found) return found.kind;
  }
  return null;
}
