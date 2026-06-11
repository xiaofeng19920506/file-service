import { localizedSongTitle } from '../lib/song-title';
import { useDebouncedBlobSearch } from '../hooks/useDebouncedBlobSearch';
import { SearchIcon } from './icons';
import { useI18n } from '../i18n';
import type { BlobRecord } from '../types';

type LibrarySearchSectionProps = {
  addedBlobIds: Set<string>;
  onAdd: (blob: BlobRecord) => void;
};

export default function LibrarySearchSection({ addedBlobIds, onAdd }: LibrarySearchSectionProps) {
  const { t, locale } = useI18n();
  const {
    searchQuery,
    setSearchQuery,
    searchResults,
    searchLoading,
    searchError,
    hasSearched,
    searchNow,
  } = useDebouncedBlobSearch();

  return (
    <section className="merge-library-search">
      <div className="search-box">
        <div className="search-input-wrap">
          <SearchIcon />
          <input
            type="text"
            className="search-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                searchNow();
              }
            }}
            placeholder={t('search.placeholder')}
          />
        </div>
        <button
          type="button"
          className="btn-secondary btn-search"
          onClick={searchNow}
          disabled={searchLoading}
        >
          {searchLoading ? t('search.searching') : t('search.button')}
        </button>
      </div>
      {searchError && <p className="error-msg">{searchError}</p>}
      {!searchLoading && hasSearched && searchResults.length === 0 && !searchError && (
        <p className="search-empty">{t('search.noResults')}</p>
      )}
      {hasSearched && searchResults.length > 0 && (
        <ul className="search-results">
          {searchResults.map((blob) => {
            const inList = addedBlobIds.has(blob.id);
            const displayTitle = localizedSongTitle(
              blob,
              locale,
              blob.originalFilename ?? blob.id,
            );
            return (
              <li key={blob.id} className="search-result-item search-result-card">
                <strong className="search-result-title">{displayTitle}</strong>
                <div className="search-result-meta">
                  {blob.composer && (
                    <span className="meta-tag">
                      {t('search.composer')}：{blob.composer}
                    </span>
                  )}
                  {blob.author && (
                    <span className="meta-tag">
                      {t('search.author')}：{blob.author}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  className={`btn-secondary btn-add${inList ? ' added' : ''}`}
                  onClick={() => onAdd(blob)}
                  disabled={inList}
                >
                  {inList ? t('search.added') : t('search.add')}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
