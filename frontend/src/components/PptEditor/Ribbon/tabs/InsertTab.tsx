import { useState } from 'react';
import { useI18n } from '../../../../i18n';
import RibbonButton from '../RibbonButton';
import RibbonGallery from '../RibbonGallery';
import RibbonGroup from '../RibbonGroup';
import RibbonSplitButton from '../RibbonSplitButton';
import { SHAPE_PRESETS, ShapePreview } from '../shape-presets';
import { SYMBOLS, type RibbonContextValue, type ShapePresetId } from '../types';

const TABLE_MAX_ROWS = 8;
const TABLE_MAX_COLS = 10;

function TableGridPicker({
  onPick,
  close,
}: {
  onPick: (rows: number, cols: number) => void;
  close: () => void;
}) {
  const { t } = useI18n();
  const [hover, setHover] = useState<{ r: number; c: number } | null>(null);

  return (
    <div className="ppt-rb-table-picker">
      <p className="ppt-rb-table-hint">
        {hover
          ? t('ppt.ribbon.tableSize', { cols: hover.c, rows: hover.r })
          : t('ppt.ribbon.insertTablePrompt')}
      </p>
      <div
        className="ppt-rb-table-grid"
        style={{ gridTemplateColumns: `repeat(${TABLE_MAX_COLS}, 16px)` }}
        onMouseLeave={() => setHover(null)}
      >
        {Array.from({ length: TABLE_MAX_ROWS * TABLE_MAX_COLS }, (_, i) => {
          const r = Math.floor(i / TABLE_MAX_COLS) + 1;
          const c = (i % TABLE_MAX_COLS) + 1;
          const on = hover && r <= hover.r && c <= hover.c;
          return (
            <button
              key={i}
              type="button"
              className={`ppt-rb-table-cell${on ? ' is-on' : ''}`}
              onMouseEnter={() => setHover({ r, c })}
              onClick={() => {
                onPick(r, c);
                close();
              }}
              aria-label={`${c} x ${r}`}
            />
          );
        })}
      </div>
    </div>
  );
}

function LinkForm({ onSubmit, close }: { onSubmit: (url: string) => void; close: () => void }) {
  const { t } = useI18n();
  const [url, setUrl] = useState('https://');

  return (
    <form
      className="ppt-rb-link-form"
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = url.trim();
        if (!trimmed || trimmed === 'https://') return;
        onSubmit(trimmed);
        close();
      }}
    >
      <label className="ppt-rb-field">
        <span>{t('ppt.ribbon.linkAddress')}</span>
        <input value={url} onChange={(e) => setUrl(e.target.value)} autoFocus />
      </label>
      <div className="ppt-rb-form-actions">
        <button type="button" className="ppt-rb-menu-item" onClick={close}>
          {t('common.cancel')}
        </button>
        <button type="submit" className="ppt-rb-menu-item is-primary">
          {t('ppt.ribbon.linkApply')}
        </button>
      </div>
    </form>
  );
}

export default function InsertTab({ ctx }: { ctx: RibbonContextValue }) {
  const { t } = useI18n();
  const { cmd, canEditSlide, hasTextSelection } = ctx;
  const todo = t('ppt.ribbon.notImplemented');

  return (
    <>
      <RibbonGroup label={t('ppt.ribbon.groupSlides')}>
        <RibbonButton
          icon="newSlide"
          label={t('ppt.ribbon.newSlide')}
          size="large"
          onClick={cmd.newSlide ? () => cmd.newSlide?.() : undefined}
          disabled={!cmd.newSlide}
        />
      </RibbonGroup>

      <RibbonGroup label={t('ppt.ribbon.groupTables')}>
        <RibbonSplitButton
          icon="table"
          label={t('ppt.ribbon.table')}
          size="large"
          disabled={!canEditSlide || !cmd.insertTable}
          menuTitle={t('ppt.ribbon.table')}
        >
          {(close) => (
            <TableGridPicker
              close={close}
              onPick={(rows, cols) => cmd.insertTable?.(rows, cols)}
            />
          )}
        </RibbonSplitButton>
      </RibbonGroup>

      <RibbonGroup label={t('ppt.ribbon.groupImages')}>
        <RibbonButton
          icon="picture"
          label={t('ppt.ribbon.picture')}
          size="large"
          onClick={cmd.insertPicture}
          disabled={!canEditSlide}
        />
        <div className="ppt-rb-col">
          <RibbonButton
            icon="screenshot"
            label={t('ppt.ribbon.screenshot')}
            notImplemented
            notImplementedHint={todo}
          />
          <RibbonButton
            icon="icons3d"
            label={t('ppt.ribbon.model3d')}
            notImplemented
            notImplementedHint={todo}
          />
        </div>
      </RibbonGroup>

      <RibbonGroup label={t('ppt.ribbon.groupIllustrations')}>
        <RibbonGallery<ShapePresetId>
          icon="shapes"
          label={t('ppt.ribbon.shapes')}
          size="large"
          columns={5}
          items={SHAPE_PRESETS.map((s) => ({
            id: s.id,
            label: t(s.labelKey),
            preview: <ShapePreview>{s.preview}</ShapePreview>,
          }))}
          onPick={cmd.insertShape}
          disabled={!canEditSlide}
        />
        <div className="ppt-rb-col">
          <RibbonButton
            icon="chart"
            label={t('ppt.ribbon.chart')}
            notImplemented
            notImplementedHint={todo}
          />
          <RibbonButton
            icon="smartArt"
            label={t('ppt.ribbon.smartArt')}
            notImplemented
            notImplementedHint={todo}
          />
        </div>
      </RibbonGroup>

      <RibbonGroup label={t('ppt.ribbon.groupLinks')}>
        <RibbonSplitButton
          icon="link"
          label={t('ppt.ribbon.link')}
          size="large"
          disabled={!hasTextSelection || !cmd.insertLink}
          menuTitle={t('ppt.ribbon.link')}
        >
          {(close) => <LinkForm close={close} onSubmit={(url) => cmd.insertLink?.(url)} />}
        </RibbonSplitButton>
      </RibbonGroup>

      <RibbonGroup label={t('ppt.ribbon.groupText')}>
        <RibbonButton
          icon="textBox"
          label={t('ppt.ribbon.textBox')}
          size="large"
          onClick={cmd.insertTextBox}
          disabled={!canEditSlide}
        />
        <div className="ppt-rb-col">
          <RibbonButton
            icon="headerFooter"
            label={t('ppt.ribbon.headerFooter')}
            onClick={cmd.insertHeaderFooter}
            disabled={!canEditSlide}
          />
          <RibbonButton
            icon="wordArt"
            label={t('ppt.ribbon.wordArt')}
            onClick={cmd.insertWordArt}
            disabled={!canEditSlide}
          />
        </div>
        <div className="ppt-rb-col">
          <RibbonButton
            icon="dateTime"
            label={t('ppt.ribbon.dateTime')}
            onClick={cmd.insertDateTime}
            disabled={!canEditSlide}
          />
          <RibbonButton
            icon="slideNumber"
            label={t('ppt.ribbon.slideNumber')}
            onClick={cmd.insertSlideNumber}
            disabled={!canEditSlide}
          />
        </div>
      </RibbonGroup>

      <RibbonGroup label={t('ppt.ribbon.groupSymbols')}>
        <RibbonSplitButton
          icon="symbol"
          label={t('ppt.ribbon.symbol')}
          size="large"
          disabled={!hasTextSelection || !cmd.insertSymbol}
          menuTitle={t('ppt.ribbon.symbol')}
        >
          {(close) => (
            <div className="ppt-rb-symbol-grid">
              {SYMBOLS.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="ppt-rb-symbol-btn"
                  onClick={() => {
                    cmd.insertSymbol?.(s);
                    close();
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </RibbonSplitButton>
      </RibbonGroup>

      <RibbonGroup label={t('ppt.ribbon.groupMedia')}>
        <div className="ppt-rb-col">
          <RibbonButton
            icon="video"
            label={t('ppt.ribbon.video')}
            notImplemented
            notImplementedHint={todo}
          />
          <RibbonButton
            icon="audio"
            label={t('ppt.ribbon.audio')}
            notImplemented
            notImplementedHint={todo}
          />
        </div>
      </RibbonGroup>
    </>
  );
}
