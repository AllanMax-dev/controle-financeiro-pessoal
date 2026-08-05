import { z } from "zod";

const serverEnvironmentSchema = z.object({
  DATABASE_URL: z.string().min(1),
  APP_URL: z.url().default("http://localhost:3000"),
  WORKSPACE_NAME: z.string().trim().min(1).max(120).default("Minhas Finanças"),
  WORKSPACE_SLUG: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .default("minhas-financas"),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
});

export type ServerEnvironment = z.infer<typeof serverEnvironmentSchema>;

export function getServerEnvironment(): ServerEnvironment {
  return serverEnvironmentSchema.parse({
    DATABASE_URL: process.env.DATABASE_URL,
    APP_URL: process.env.APP_URL,
    WORKSPACE_NAME: process.env.WORKSPACE_NAME,
    WORKSPACE_SLUG: process.env.WORKSPACE_SLUG,
    SESSION_TTL_DAYS: process.env.SESSION_TTL_DAYS,
  });
}
