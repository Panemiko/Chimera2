import type { Session } from "@chimera2/auth";
import type { Database } from "@chimera2/db";

export type Context = {
  session: Session | null;
  db: Database;
};
