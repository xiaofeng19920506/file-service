import { useEffect, useMemo, useRef, useState } from 'react';
import {
  inviteBulletinWorshipLeader,
  listWorshipTeamMembers,
  type WorshipTeamMember,
} from '../../api/bulletins';
import { friendlyError } from '../../lib/error-messages';
import { useI18n } from '../../i18n';

type BulletinWorshipInviteModalProps = {
  bulletinId: string;
  onClose: () => void;
  onInvited: (result: { inviteUrl: string; playlistId: string; emailedCount: number }) => void;
};

function memberLabel(member: WorshipTeamMember): string {
  const name = member.displayName.trim() || member.email;
  return `${name}  ${member.email}`;
}

function matchesQuery(member: WorshipTeamMember, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    member.displayName.toLowerCase().includes(q) ||
    member.email.toLowerCase().includes(q)
  );
}

export default function BulletinWorshipInviteModal({
  bulletinId,
  onClose,
  onInvited,
}: BulletinWorshipInviteModalProps) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [members, setMembers] = useState<WorshipTeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [selected, setSelected] = useState<WorshipTeamMember | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void listWorshipTeamMembers()
      .then((data) => {
        if (!cancelled) setMembers(data.members);
      })
      .catch(() => {
        if (!cancelled) {
          setMembers([]);
          setError(friendlyError('load_failed', t));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filtered = useMemo(
    () => members.filter((m) => matchesQuery(m, query)),
    [members, query],
  );

  useEffect(() => {
    setHighlightIndex(0);
  }, [query]);

  const pickMember = (member: WorshipTeamMember) => {
    setSelected(member);
    setQuery(memberLabel(member));
    setOpen(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || sending) return;
    setSending(true);
    setError(null);
    try {
      const result = await inviteBulletinWorshipLeader(bulletinId, {
        userIds: [selected.id],
      });
      onInvited({
        inviteUrl: result.inviteUrl,
        playlistId: result.playlist.id,
        emailedCount: result.emailedCount ?? (result.emailed ? 1 : 0),
      });
      onClose();
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : 'email_send_failed', t));
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setHighlightIndex((i) => Math.min(i + 1, Math.max(filtered.length - 1, 0)));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
      setHighlightIndex((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === 'Enter' && open && filtered[highlightIndex]) {
      e.preventDefault();
      pickMember(filtered[highlightIndex]!);
      return;
    }
    if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        setOpen(false);
      } else {
        onClose();
      }
    }
  };

  return (
    <div
      className="metadata-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bulletin-worship-invite-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="metadata-modal bulletin-worship-invite-modal">
        <div className="metadata-modal-header">
          <h3 id="bulletin-worship-invite-title">{t('bulletin.worshipInviteSectionTitle')}</h3>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label={t('metadata.close')}
          >
            ×
          </button>
        </div>

        <form className="metadata-modal-body" onSubmit={(e) => void handleSubmit(e)}>
          <p className="share-playlist-intro">{t('bulletin.worshipInviteSectionHint')}</p>

          {loading ? (
            <p className="playlists-muted">{t('bulletin.worshipInviteLoadingMembers')}</p>
          ) : members.length === 0 ? (
            <p className="playlists-muted">{t('bulletin.worshipInviteNoMembers')}</p>
          ) : (
            <label className="share-playlist-field bulletin-worship-invite-combobox">
              <span>{t('bulletin.worshipInvitePickMembers')}</span>
              <div className="bulletin-worship-invite-combobox-wrap">
                <input
                  ref={inputRef}
                  type="text"
                  role="combobox"
                  aria-expanded={open}
                  aria-controls="bulletin-worship-invite-listbox"
                  aria-autocomplete="list"
                  className="playlists-text-input"
                  value={query}
                  disabled={sending}
                  placeholder={t('bulletin.worshipInviteSearchPlaceholder')}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setSelected(null);
                    setOpen(true);
                  }}
                  onFocus={() => setOpen(true)}
                  onKeyDown={onKeyDown}
                  onBlur={() => {
                    // 延后关闭，让 option 点击生效
                    window.setTimeout(() => setOpen(false), 120);
                  }}
                />
                {open ? (
                  <ul
                    ref={listRef}
                    id="bulletin-worship-invite-listbox"
                    role="listbox"
                    className="bulletin-worship-invite-options"
                  >
                    {filtered.length === 0 ? (
                      <li className="bulletin-worship-invite-option is-empty" role="presentation">
                        {t('bulletin.worshipInviteNoMatch')}
                      </li>
                    ) : (
                      filtered.map((member, index) => (
                        <li key={member.id} role="option" aria-selected={selected?.id === member.id}>
                          <button
                            type="button"
                            className={`bulletin-worship-invite-option${
                              index === highlightIndex ? ' is-active' : ''
                            }${selected?.id === member.id ? ' is-selected' : ''}`}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => pickMember(member)}
                            onMouseEnter={() => setHighlightIndex(index)}
                          >
                            <span className="bulletin-worship-invite-option-name">
                              {member.displayName.trim() || member.email}
                            </span>
                            <span className="bulletin-worship-invite-option-email">{member.email}</span>
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                ) : null}
              </div>
            </label>
          )}

          {error ? <p className="error-msg">{error}</p> : null}

          <div className="metadata-modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={sending}>
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={sending || !selected || members.length === 0}
            >
              {sending ? t('bulletin.saving') : t('bulletin.worshipSendInvite')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
