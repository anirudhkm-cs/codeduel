import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().default("postgres://codeduel:codeduel@localhost:5432/codeduel"),
  EXECUTOR: z.enum(["local", "judge0"]).default("local"),
  JUDGE0_URL: z.string().url().default("http://localhost:2358"),
  JUDGE0_AUTH_TOKEN: z.string().optional(),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const config = schema.parse(env);
  if (config.NODE_ENV === "production" && config.EXECUTOR === "local") {
    throw new Error(
      "EXECUTOR=local runs untrusted code on the host and is not allowed in production. Use EXECUTOR=judge0.",
    );
  }
  return config;
}
