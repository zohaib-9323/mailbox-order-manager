import "dotenv/config";
import { afterAll } from "vitest";
import { closeDb } from "@/db/client";

// Point the app's db client at the test database before any test imports it.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

afterAll(async () => {
  await closeDb();
});
