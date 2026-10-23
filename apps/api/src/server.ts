import { z } from "zod";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { database } from "./database.js";
const env = z
  .object({
    DATABASE_URL: z.string().url(),
    PORT: z.coerce.number().default(3000),
    APP_ORIGIN: z.string().url(),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
  })
  .parse(process.env);
const server = createApp(database(), {
  production: env.NODE_ENV === "production",
  origin: env.APP_ORIGIN,
  webPath: fileURLToPath(new URL("../../web/dist", import.meta.url)),
}).listen(env.PORT, "0.0.0.0", () =>
  console.log(`CRM listening on ${env.PORT}`),
);
process.on("SIGTERM", () => server.close(() => process.exit(0)));
