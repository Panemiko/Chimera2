import { sql } from "drizzle-orm";
import { integer, real, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";

import { user } from "./auth";
import { room } from "./rooms";

export const characterTemplate = sqliteTable("character_template", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  definition: text("definition").notNull(),
  updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
});

export const characterSheet = sqliteTable(
  "character_sheet",
  {
    id: text("id").primaryKey(),
    roomId: text("room_id")
      .notNull()
      .references(() => room.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull().default(""),
    data: text("data").notNull().default("{}"),
    scene: text("scene").notNull().default("{}"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => [unique("character_sheet_room_user_unique").on(table.roomId, table.userId)],
);

export const characterCustomField = sqliteTable("character_custom_field", {
  id: text("id").primaryKey(),
  sheetId: text("sheet_id")
    .notNull()
    .references(() => characterSheet.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  kind: text("kind", { enum: ["text", "number", "fulltext"] }).notNull(),
  textValue: text("text_value"),
  numberValue: real("number_value"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
});

export const roomSheetTemplate = sqliteTable("room_sheet_template", {
  roomId: text("room_id")
    .primaryKey()
    .references(() => room.id, { onDelete: "cascade" }),
  imagePath: text("image_path").notNull(),
  updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
});
