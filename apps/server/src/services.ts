import { createAuth } from "@chimera2/auth";
import { createDb } from "@chimera2/db";

import { ENV } from "./env.server";

export const db = createDb(ENV);
export const auth = createAuth(ENV, db);
