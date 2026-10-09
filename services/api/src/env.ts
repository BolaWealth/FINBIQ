// FINBIQ env loader v0.1.0 — MUST be the first import in src/index.ts.
// ESM hoists all imports, so calling dotenv.config() inside index.ts runs
// too late: auth.ts creates the pg Pool (and reads BETTER_AUTH_*) before
// process.env is populated, which broke every DB-backed endpoint with
// "SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string".
// Importing this module first guarantees .env is loaded before any other
// module evaluates.
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

dotenv.config({
  path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", ".env"),
});
