import nodemailer from 'nodemailer';
import type { ApiEnv } from '@file-service/shared';

export type MailConfig = {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
};

export function resolveMailConfig(env: ApiEnv): MailConfig | null {
  if (!env.SMTP_HOST || !env.SMTP_FROM) return null;
  return {
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
    from: env.SMTP_FROM,
  };
}

export function resolveWebAppUrl(env: ApiEnv, processEnv: NodeJS.ProcessEnv = process.env): string {
  if (env.WEB_APP_URL) return env.WEB_APP_URL.replace(/\/$/, '');
  const cors = processEnv.CORS_ORIGIN?.split(',')[0]?.trim();
  if (cors) return cors.replace(/\/$/, '');
  return 'http://localhost:5173';
}

export async function sendMail(opts: {
  config: MailConfig;
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<void> {
  const transport = nodemailer.createTransport({
    host: opts.config.host,
    port: opts.config.port,
    secure: opts.config.secure,
    auth:
      opts.config.user && opts.config.pass
        ? { user: opts.config.user, pass: opts.config.pass }
        : undefined,
  });

  try {
    await transport.sendMail({
      from: opts.config.from,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html ?? opts.text.replace(/\n/g, '<br>'),
    });
  } catch (err) {
    const response =
      err && typeof err === 'object' && 'response' in err
        ? String((err as { response?: unknown }).response ?? '')
        : '';
    const message = err instanceof Error ? err.message : String(err);
    if (/unauthorized ip|525\s*5\.7\.1/i.test(`${response} ${message}`)) {
      throw new Error('smtp_ip_unauthorized');
    }
    throw err instanceof Error ? err : new Error(message);
  }
}
