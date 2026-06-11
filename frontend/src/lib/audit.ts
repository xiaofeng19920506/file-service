export type BlobActor = 'admin' | 'library' | 'api';

export function formatAuditTime(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale === 'zh-CN' ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

export function actorLabel(
  actor: string | null | undefined,
  t: (key: string) => string,
): string {
  if (!actor) return t('audit.unknown');
  const key = `audit.actor.${actor}`;
  const label = t(key);
  return label === key ? actor : label;
}
