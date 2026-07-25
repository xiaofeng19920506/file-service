import { useI18n } from '../../../../i18n';
import RibbonButton from '../RibbonButton';
import RibbonColorPicker from '../RibbonColorPicker';
import RibbonCombo from '../RibbonCombo';
import RibbonGallery from '../RibbonGallery';
import RibbonGroup, { RibbonRow } from '../RibbonGroup';
import { RibbonMenuItem } from '../RibbonPopover';
import RibbonSplitButton from '../RibbonSplitButton';
import RibbonToggle from '../RibbonToggle';
import { SHAPE_PRESETS, ShapePreview } from '../shape-presets';
import {
  FONT_FAMILIES,
  FONT_SIZES,
  LINE_SPACINGS,
  type RibbonContextValue,
  type ShapePresetId,
} from '../types';

export default function HomeTab({ ctx }: { ctx: RibbonContextValue }) {
  const { t } = useI18n();
  const { cmd, textFormat, shapeFormat, hasSelection, hasTextSelection, canEditSlide } = ctx;
  const todo = t('ppt.ribbon.notImplemented');
  const noText = !hasTextSelection;

  return (
    <>
      <RibbonGroup label={t('ppt.ribbon.groupClipboard')}>
        <RibbonButton
          icon="paste"
          label={t('ppt.ribbon.paste')}
          size="large"
          onClick={cmd.paste}
          disabled={!cmd.paste}
        />
        <div className="ppt-rb-col">
          <RibbonButton
            icon="cut"
            label={t('ppt.ribbon.cut')}
            onClick={cmd.cut}
            disabled={!hasSelection}
          />
          <RibbonButton
            icon="copy"
            label={t('ppt.ribbon.copy')}
            onClick={cmd.copy}
            disabled={!hasSelection}
          />
          <RibbonToggle
            icon="formatPainter"
            label={t('ppt.ribbon.formatPainter')}
            size="small"
            on={cmd.formatPainterActive}
            onToggle={cmd.toggleFormatPainter}
            disabled={!hasTextSelection && !cmd.formatPainterActive}
          />
        </div>
      </RibbonGroup>

      <RibbonGroup label={t('ppt.ribbon.groupSlides')}>
        <RibbonSplitButton
          icon="newSlide"
          label={t('ppt.ribbon.newSlide')}
          size="large"
          onClick={cmd.newSlide ? () => cmd.newSlide?.() : undefined}
          disabled={!cmd.newSlide}
          menuTitle={t('ppt.ribbon.newSlide')}
        >
          {(close) => (
            <div className="ppt-rb-menu-list">
              <RibbonMenuItem
                disabled={!cmd.newSlide}
                onClick={() => {
                  cmd.newSlide?.();
                  close();
                }}
              >
                {t('ppt.ribbon.blankSlide')}
              </RibbonMenuItem>
              <RibbonMenuItem
                disabled={!cmd.duplicateSlide}
                onClick={() => {
                  cmd.duplicateSlide?.();
                  close();
                }}
              >
                {t('ppt.ribbon.duplicateSlide')}
              </RibbonMenuItem>
            </div>
          )}
        </RibbonSplitButton>
        <div className="ppt-rb-col">
          <RibbonSplitButton
            icon="layout"
            label={t('ppt.ribbon.layout')}
            onClick={undefined}
            disabled={!cmd.applyLayout || !ctx.layouts.length}
            menuTitle={t('ppt.ribbon.layoutGalleryTitle')}
          >
            {(close) => (
              <div className="ppt-rb-menu-list">
                {ctx.layouts.map((l) => (
                  <RibbonMenuItem
                    key={l.path}
                    onClick={() => {
                      cmd.applyLayout?.(l.path);
                      close();
                    }}
                  >
                    {l.name}
                  </RibbonMenuItem>
                ))}
              </div>
            )}
          </RibbonSplitButton>
          <RibbonButton
            icon="reset"
            label={t('ppt.ribbon.reset')}
            onClick={cmd.resetSlide}
            disabled={!canEditSlide}
          />
          <RibbonButton
            icon="section"
            label={t('ppt.ribbon.section')}
            onClick={cmd.addSection}
            notImplemented={!cmd.addSection}
            notImplementedHint={todo}
          />
        </div>
        <div className="ppt-rb-col">
          <RibbonButton
            icon="duplicate"
            label={t('ppt.ribbon.duplicateSlide')}
            onClick={cmd.duplicateSlide}
            disabled={!cmd.duplicateSlide}
          />
          <RibbonButton
            icon="delete"
            label={t('ppt.ribbon.deleteSlide')}
            onClick={cmd.deleteSlide}
            disabled={!cmd.deleteSlide}
          />
        </div>
      </RibbonGroup>

      <RibbonGroup label={t('ppt.ribbon.groupFont')} className="ppt-rb-group--font">
        <RibbonRow>
          <RibbonCombo
            ariaLabel={t('ppt.fontFamily')}
            value={textFormat?.fontFamily ?? FONT_FAMILIES[0]}
            options={FONT_FAMILIES}
            onCommit={cmd.setFontFamily}
            disabled={noText}
            width={124}
            renderOption={(f) => <span style={{ fontFamily: `"${f}", sans-serif` }}>{f}</span>}
          />
          <RibbonCombo
            ariaLabel={t('ppt.fontSize')}
            value={String(textFormat?.fontSizePt ?? 18)}
            options={FONT_SIZES.map(String)}
            onCommit={(v) => cmd.setFontSize?.(Number(v))}
            disabled={noText}
            width={58}
            numeric
          />
          <RibbonButton
            icon="growFont"
            label={t('ppt.ribbon.growFont')}
            size="icon"
            onClick={cmd.growFont}
            disabled={noText}
          />
          <RibbonButton
            icon="shrinkFont"
            label={t('ppt.ribbon.shrinkFont')}
            size="icon"
            onClick={cmd.shrinkFont}
            disabled={noText}
          />
        </RibbonRow>
        <RibbonRow>
          <RibbonToggle
            icon="bold"
            label={t('ppt.bold')}
            on={textFormat?.bold}
            onToggle={cmd.toggleBold}
            disabled={noText}
            shortcut="Ctrl+B"
          />
          <RibbonToggle
            icon="italic"
            label={t('ppt.italic')}
            on={textFormat?.italic}
            onToggle={cmd.toggleItalic}
            disabled={noText}
            shortcut="Ctrl+I"
          />
          <RibbonToggle
            icon="underline"
            label={t('ppt.ribbon.underline')}
            on={textFormat?.underline}
            onToggle={cmd.toggleUnderline}
            disabled={noText}
            shortcut="Ctrl+U"
          />
          <RibbonToggle
            icon="strike"
            label={t('ppt.ribbon.strike')}
            on={textFormat?.strike}
            onToggle={cmd.toggleStrike}
            disabled={noText}
          />
          <RibbonToggle
            icon="shadow"
            label={t('ppt.ribbon.shadow')}
            on={textFormat?.shadow}
            onToggle={cmd.toggleShadow}
            disabled={noText}
          />
          <RibbonSplitButton
            icon="changeCase"
            label={t('ppt.ribbon.changeCase')}
            size="icon"
            disabled={noText || !cmd.changeCase}
            menuTitle={t('ppt.ribbon.changeCase')}
          >
            {(close) => (
              <div className="ppt-rb-menu-list">
                {(
                  [
                    ['sentence', 'ppt.ribbon.caseSentence'],
                    ['lower', 'ppt.ribbon.caseLower'],
                    ['upper', 'ppt.ribbon.caseUpper'],
                    ['capitalize', 'ppt.ribbon.caseCapitalize'],
                    ['toggle', 'ppt.ribbon.caseToggle'],
                  ] as const
                ).map(([action, key]) => (
                  <RibbonMenuItem
                    key={action}
                    onClick={() => {
                      cmd.changeCase?.(action);
                      close();
                    }}
                  >
                    {t(key)}
                  </RibbonMenuItem>
                ))}
              </div>
            )}
          </RibbonSplitButton>
          <RibbonColorPicker
            icon="fontColor"
            label={t('ppt.ribbon.fontColor')}
            size="icon"
            value={textFormat?.color ?? '#000000'}
            onPick={(hex) => hex && cmd.setFontColor?.(hex)}
            disabled={noText}
          />
          <RibbonButton
            icon="clearFormat"
            label={t('ppt.ribbon.clearFormat')}
            size="icon"
            onClick={cmd.clearFormatting}
            disabled={noText}
          />
        </RibbonRow>
      </RibbonGroup>

      <RibbonGroup label={t('ppt.ribbon.groupParagraph')}>
        <RibbonRow>
          <RibbonSplitButton
            icon="bullets"
            label={t('ppt.ribbon.bullets')}
            size="icon"
            onClick={cmd.setBullet ? () => cmd.setBullet?.('char') : undefined}
            active={textFormat?.bullet === 'char'}
            disabled={noText}
            menuTitle={t('ppt.ribbon.bullets')}
          >
            {(close) => (
              <div className="ppt-rb-menu-list">
                <RibbonMenuItem
                  active={textFormat?.bullet === 'none'}
                  onClick={() => {
                    cmd.setBullet?.('none');
                    close();
                  }}
                >
                  {t('ppt.ribbon.bulletNone')}
                </RibbonMenuItem>
                <RibbonMenuItem
                  active={textFormat?.bullet === 'char'}
                  onClick={() => {
                    cmd.setBullet?.('char');
                    close();
                  }}
                >
                  {t('ppt.ribbon.bulletChar')}
                </RibbonMenuItem>
              </div>
            )}
          </RibbonSplitButton>
          <RibbonToggle
            icon="numbering"
            label={t('ppt.ribbon.numbering')}
            on={textFormat?.bullet === 'number'}
            onToggle={
              cmd.setBullet
                ? () => cmd.setBullet?.(textFormat?.bullet === 'number' ? 'none' : 'number')
                : undefined
            }
            disabled={noText}
          />
          <RibbonButton
            icon="indentLess"
            label={t('ppt.ribbon.indentLess')}
            size="icon"
            onClick={cmd.indentLess}
            disabled={noText}
          />
          <RibbonButton
            icon="indentMore"
            label={t('ppt.ribbon.indentMore')}
            size="icon"
            onClick={cmd.indentMore}
            disabled={noText}
          />
          <RibbonSplitButton
            icon="textDirection"
            label={t('ppt.ribbon.textDirection')}
            size="icon"
            disabled={noText || !cmd.setTextDirection}
            menuTitle={t('ppt.ribbon.textDirection')}
          >
            {(close) => (
              <div className="ppt-rb-menu-list">
                {(
                  [
                    ['horz', 'ppt.ribbon.dirHorizontal'],
                    ['vert', 'ppt.ribbon.dirRotate90'],
                    ['vert270', 'ppt.ribbon.dirRotate270'],
                  ] as const
                ).map(([dir, key]) => (
                  <RibbonMenuItem
                    key={dir}
                    active={textFormat?.direction === dir}
                    onClick={() => {
                      cmd.setTextDirection?.(dir);
                      close();
                    }}
                  >
                    {t(key)}
                  </RibbonMenuItem>
                ))}
              </div>
            )}
          </RibbonSplitButton>
          <RibbonSplitButton
            icon="alignText"
            label={t('ppt.ribbon.alignTextVertical')}
            size="icon"
            disabled={noText || !cmd.setTextValign}
            menuTitle={t('ppt.ribbon.alignTextVertical')}
          >
            {(close) => (
              <div className="ppt-rb-menu-list">
                {(
                  [
                    ['top', 'ppt.ribbon.valignTop'],
                    ['middle', 'ppt.ribbon.valignMiddle'],
                    ['bottom', 'ppt.ribbon.valignBottom'],
                  ] as const
                ).map(([v, key]) => (
                  <RibbonMenuItem
                    key={v}
                    active={textFormat?.valign === v}
                    onClick={() => {
                      cmd.setTextValign?.(v);
                      close();
                    }}
                  >
                    {t(key)}
                  </RibbonMenuItem>
                ))}
              </div>
            )}
          </RibbonSplitButton>
        </RibbonRow>
        <RibbonRow>
          <RibbonToggle
            icon="alignLeft"
            label={t('ppt.ribbon.alignLeft')}
            on={textFormat?.align === 'left'}
            onToggle={cmd.setAlign ? () => cmd.setAlign?.('left') : undefined}
            disabled={noText}
          />
          <RibbonToggle
            icon="alignCenter"
            label={t('ppt.ribbon.alignCenter')}
            on={textFormat?.align === 'center'}
            onToggle={cmd.setAlign ? () => cmd.setAlign?.('center') : undefined}
            disabled={noText}
          />
          <RibbonToggle
            icon="alignRight"
            label={t('ppt.ribbon.alignRight')}
            on={textFormat?.align === 'right'}
            onToggle={cmd.setAlign ? () => cmd.setAlign?.('right') : undefined}
            disabled={noText}
          />
          <RibbonToggle
            icon="alignJustify"
            label={t('ppt.ribbon.alignJustify')}
            on={textFormat?.align === 'justify'}
            onToggle={cmd.setAlign ? () => cmd.setAlign?.('justify') : undefined}
            disabled={noText}
          />
          <RibbonSplitButton
            icon="lineSpacing"
            label={t('ppt.ribbon.lineSpacing')}
            size="icon"
            disabled={noText || !cmd.setLineSpacing}
            menuTitle={t('ppt.ribbon.lineSpacing')}
          >
            {(close) => (
              <div className="ppt-rb-menu-list">
                {LINE_SPACINGS.map((v) => (
                  <RibbonMenuItem
                    key={v}
                    active={Math.abs((textFormat?.lineSpacing ?? 1) - v) < 0.01}
                    onClick={() => {
                      cmd.setLineSpacing?.(v);
                      close();
                    }}
                  >
                    {v.toFixed(2).replace(/\.00$/, '.0')}
                  </RibbonMenuItem>
                ))}
              </div>
            )}
          </RibbonSplitButton>
        </RibbonRow>
      </RibbonGroup>

      <RibbonGroup label={t('ppt.ribbon.groupDrawing')}>
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
          menuTitle={t('ppt.ribbon.shapes')}
        />
        <div className="ppt-rb-col">
          <RibbonColorPicker
            icon="shapeFill"
            label={t('ppt.ribbon.shapeFill')}
            value={shapeFormat?.fill ?? null}
            onPick={cmd.setShapeFill}
            disabled={!hasSelection}
            allowNone
          />
          <RibbonColorPicker
            icon="shapeOutline"
            label={t('ppt.ribbon.shapeOutline')}
            value={shapeFormat?.line ?? null}
            onPick={cmd.setShapeLine}
            disabled={!hasSelection}
            allowNone
          />
          <RibbonSplitButton
            icon="arrange"
            label={t('ppt.ribbon.arrange')}
            disabled={!hasSelection}
            menuTitle={t('ppt.ribbon.arrange')}
          >
            {(close) => (
              <div className="ppt-rb-menu-list">
                {(
                  [
                    ['front', 'ppt.ribbon.bringToFront'],
                    ['forward', 'ppt.ribbon.bringForward'],
                    ['backward', 'ppt.ribbon.sendBackward'],
                    ['back', 'ppt.ribbon.sendToBack'],
                  ] as const
                ).map(([action, key]) => (
                  <RibbonMenuItem
                    key={action}
                    onClick={() => {
                      cmd.orderShape?.(action);
                      close();
                    }}
                  >
                    {t(key)}
                  </RibbonMenuItem>
                ))}
                <span className="ppt-rb-menu-sep" />
                {(
                  [
                    ['left', 'ppt.ribbon.alignObjLeft'],
                    ['centerH', 'ppt.ribbon.alignObjCenterH'],
                    ['right', 'ppt.ribbon.alignObjRight'],
                    ['top', 'ppt.ribbon.alignObjTop'],
                    ['middleV', 'ppt.ribbon.alignObjMiddleV'],
                    ['bottom', 'ppt.ribbon.alignObjBottom'],
                  ] as const
                ).map(([action, key]) => (
                  <RibbonMenuItem
                    key={action}
                    onClick={() => {
                      cmd.alignShape?.(action);
                      close();
                    }}
                  >
                    {t(key)}
                  </RibbonMenuItem>
                ))}
              </div>
            )}
          </RibbonSplitButton>
        </div>
        <div className="ppt-rb-col">
          <RibbonButton
            icon="duplicate"
            label={t('ppt.ribbon.duplicateShape')}
            onClick={cmd.duplicateSelection}
            disabled={!hasSelection}
          />
          <RibbonButton
            icon="delete"
            label={t('ppt.ribbon.deleteShape')}
            onClick={cmd.deleteSelection}
            disabled={!hasSelection}
          />
        </div>
      </RibbonGroup>

      <RibbonGroup label={t('ppt.ribbon.groupEditing')}>
        <div className="ppt-rb-col">
          <RibbonButton icon="find" label={t('ppt.ribbon.find')} onClick={cmd.openFind} />
          <RibbonButton icon="replace" label={t('ppt.ribbon.replace')} onClick={cmd.openReplace} />
          <RibbonButton
            icon="selectPane"
            label={t('ppt.ribbon.selectPane')}
            onClick={cmd.toggleSelectionPane}
          />
        </div>
      </RibbonGroup>
    </>
  );
}
