import { useI18n } from '../i18n';
import type { SongTitleInput } from '../lib/song-title';

type SongTitleFieldsProps = {
  value: SongTitleInput;
  onChange: (field: keyof SongTitleInput, value: string) => void;
};

export default function SongTitleFields({ value, onChange }: SongTitleFieldsProps) {
  const { t } = useI18n();

  return (
    <>
      <label className="metadata-field">
        <span>{t('metadata.titleZhCn')}</span>
        <input
          type="text"
          value={value.titleZhCn}
          onChange={(e) => onChange('titleZhCn', e.target.value)}
          placeholder={t('metadata.titleZhCnPlaceholder')}
        />
      </label>
      <label className="metadata-field">
        <span>{t('metadata.titleZhTw')}</span>
        <input
          type="text"
          value={value.titleZhTw}
          onChange={(e) => onChange('titleZhTw', e.target.value)}
          placeholder={t('metadata.titleZhTwPlaceholder')}
        />
      </label>
      <label className="metadata-field">
        <span>{t('metadata.titleEn')}</span>
        <input
          type="text"
          value={value.titleEn}
          onChange={(e) => onChange('titleEn', e.target.value)}
          placeholder={t('metadata.titleEnPlaceholder')}
        />
      </label>
    </>
  );
}
