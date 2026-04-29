import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  FILE_STORAGE_DIR: z.string().default("./data/files"),
  CHUNK_STORAGE_DIR: z.string().default("./data/chunks"),
  MAX_UPLOAD_BYTES: z.coerce.number().positive().default(524_288_000),
});

export type ServerEnv = z.infer<typeof schema>;

let cached: ServerEnv | null = null;

export function getServerEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`环境变量无效: ${parsed.error.flatten().fieldErrors}`);
  }
  cached = parsed.data;
  return parsed.data;
}
