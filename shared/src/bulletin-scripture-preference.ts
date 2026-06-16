import { and, eq, lt } from 'drizzle-orm';
import { bulletinScripturePreferences, type Db } from './db/index.js';

export const SCRIPTURE_PREFERENCE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type ScripturePreference = {
  bulletinId: string;
  scriptureBook: string;
  scriptureReference: string;
  updatedAt: string;
  expiresAt: string;
};

export function scripturePreferenceExpiresAt(from = new Date()): Date {
  return new Date(from.getTime() + SCRIPTURE_PREFERENCE_TTL_MS);
}

export async function purgeExpiredScripturePreferences(db: Db): Promise<number> {
  const now = new Date();
  const deleted = await db
    .delete(bulletinScripturePreferences)
    .where(lt(bulletinScripturePreferences.expiresAt, now))
    .returning({ bulletinId: bulletinScripturePreferences.bulletinId });
  return deleted.length;
}

export async function getScripturePreference(
  db: Db,
  userId: string,
  bulletinId: string,
): Promise<ScripturePreference | null> {
  await purgeExpiredScripturePreferences(db);
  const [row] = await db
    .select()
    .from(bulletinScripturePreferences)
    .where(
      and(
        eq(bulletinScripturePreferences.userId, userId),
        eq(bulletinScripturePreferences.bulletinId, bulletinId),
      ),
    );
  if (!row) return null;
  if (row.expiresAt.getTime() <= Date.now()) {
    await db
      .delete(bulletinScripturePreferences)
      .where(
        and(
          eq(bulletinScripturePreferences.userId, userId),
          eq(bulletinScripturePreferences.bulletinId, bulletinId),
        ),
      );
    return null;
  }
  return {
    bulletinId: row.bulletinId,
    scriptureBook: row.scriptureBook,
    scriptureReference: row.scriptureReference,
    updatedAt: row.updatedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
  };
}

export async function upsertScripturePreference(
  db: Db,
  input: {
    userId: string;
    bulletinId: string;
    scriptureBook: string;
    scriptureReference: string;
  },
): Promise<ScripturePreference> {
  await purgeExpiredScripturePreferences(db);
  const now = new Date();
  const expiresAt = scripturePreferenceExpiresAt(now);
  const [row] = await db
    .insert(bulletinScripturePreferences)
    .values({
      userId: input.userId,
      bulletinId: input.bulletinId,
      scriptureBook: input.scriptureBook,
      scriptureReference: input.scriptureReference,
      updatedAt: now,
      expiresAt,
    })
    .onConflictDoUpdate({
      target: [
        bulletinScripturePreferences.userId,
        bulletinScripturePreferences.bulletinId,
      ],
      set: {
        scriptureBook: input.scriptureBook,
        scriptureReference: input.scriptureReference,
        updatedAt: now,
        expiresAt,
      },
    })
    .returning();
  return {
    bulletinId: row!.bulletinId,
    scriptureBook: row!.scriptureBook,
    scriptureReference: row!.scriptureReference,
    updatedAt: row!.updatedAt.toISOString(),
    expiresAt: row!.expiresAt.toISOString(),
  };
}
