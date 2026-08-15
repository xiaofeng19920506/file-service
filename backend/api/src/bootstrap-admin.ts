import { eq } from 'drizzle-orm';
import { users, type ApiEnv, type Db } from '@file-service/shared';
import { hashPassword } from './auth.js';

/** 库中还没有任何 admin 时，用环境变量创建（或提升）默认管理员。 */
export async function ensureBootstrapAdmin(db: Db, env: ApiEnv): Promise<void> {
  const email = env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const password = env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!email || !password) return;

  const [existingAdmin] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, 'admin'))
    .limit(1);
  if (existingAdmin) return;

  const [existingUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existingUser) {
    await db.update(users).set({ role: 'admin' }).where(eq(users.id, existingUser.id));
    console.log(`bootstrap admin: promoted existing user ${email}`);
    return;
  }

  await db.insert(users).values({
    email,
    passwordHash: hashPassword(password),
    firstName: 'Aaron',
    lastName: 'Liu',
    role: 'admin',
    phone: '0000000000',
  });
  console.log(`bootstrap admin: created ${email}`);
}
