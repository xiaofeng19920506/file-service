const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

/** 打开系统默认邮件客户端，由用户自行填写收件人并发送 */
export function openMailtoShare(opts: { to?: string; subject: string; body: string }): void {
  const params = new URLSearchParams();
  params.set('subject', opts.subject);
  params.set('body', opts.body);
  const to = opts.to?.trim();
  const href = to
    ? `mailto:${encodeURIComponent(to)}?${params.toString()}`
    : `mailto:?${params.toString()}`;
  window.location.href = href;
}

/** 在浏览器新标签页打开 Gmail 撰写界面 */
export function openGmailCompose(opts: { to?: string; subject: string; body: string }): void {
  const params = new URLSearchParams({ view: 'cm', fs: '1' });
  const to = opts.to?.trim();
  if (to) params.set('to', to);
  params.set('su', opts.subject);
  params.set('body', opts.body);
  window.open(`https://mail.google.com/mail/?${params.toString()}`, '_blank', 'noopener,noreferrer');
}
