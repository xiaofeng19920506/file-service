import SongTitleFields from './SongTitleFields';
import { useI18n } from '../i18n';
import type { UploadMetadata } from '../hooks/useMergeWorkspace';

type UploadMetadataFormProps = {
  metadata: UploadMetadata;
  onChange: (field: keyof UploadMetadata, value: string) => void;
};

export default function UploadMetadataForm({ metadata, onChange }: UploadMetadataFormProps) {
  const { t } = useI18n();

  return (
    <div className="metadata-grid metadata-grid-with-titles">
      <div className="metadata-grid-titles">
        <SongTitleFields value={metadata} onChange={onChange} />
      </div>
      <label className="metadata-field">
        <span>{t('metadata.composer')}</span>
        <input
          type="text"
          value={metadata.composer}
          onChange={(e) => onChange('composer', e.target.value)}
          placeholder={t('metadata.composerPlaceholder')}
        />
      </label>
      <label className="metadata-field">
        <span>{t('metadata.author')}</span>
        <input
          type="text"
          value={metadata.author}
          onChange={(e) => onChange('author', e.target.value)}
          placeholder={t('metadata.authorPlaceholder')}
        />
      </label>
      <label className="metadata-field metadata-field-notes">
        <span>{t('metadata.notes')}</span>
        <textarea
          value={metadata.notes}
          onChange={(e) => onChange('notes', e.target.value)}
          placeholder={t('metadata.notesPlaceholder')}
          rows={3}
        />
      </label>
    </div>
  );
}
