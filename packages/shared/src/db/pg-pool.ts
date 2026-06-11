import type { PoolConfig } from 'pg';

/** 连接串含 sslmode=require 等时启用 SSL */
export function needsPgSsl(connectionString: string): boolean {
  return /sslmode=(require|verify-full|verify-ca)/i.test(connectionString);
}

export function pgPoolConfig(connectionString: string): PoolConfig {
  const config: PoolConfig = { connectionString };
  if (needsPgSsl(connectionString)) {
    config.ssl = { rejectUnauthorized: false };
  }
  return config;
}
