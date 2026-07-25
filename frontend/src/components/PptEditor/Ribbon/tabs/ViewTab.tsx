import { useI18n } from '../../../../i18n';
import RibbonButton from '../RibbonButton';
import RibbonGroup from '../RibbonGroup';
import { RibbonMenuItem } from '../RibbonPopover';
import RibbonSplitButton from '../RibbonSplitButton';
import RibbonToggle from '../RibbonToggle';
import type { RibbonContextValue } from '../types';

const ZOOM_STEPS = [50, 75, 100, 125, 150, 200];

export default function ViewTab({ ctx }: { ctx: RibbonContextValue }) {
  const { t } = useI18n();
  const { cmd } = ctx;
  const todo = t('ppt.ribbon.notImplemented');

  return (
    <>
      <RibbonGroup label={t('ppt.ribbon.groupPresentationViews')}>
        <RibbonButton icon="layout" label={t('ppt.ribbon.viewNormal')} size="large" active onClick={() => {}} />
        <div className="ppt-rb-col">
          <RibbonButton
            icon="outline"
            label={t('ppt.ribbon.viewOutline')}
            notImplemented
            notImplementedHint={todo}
          />
          <RibbonButton
            icon="arrange"
            label={t('ppt.ribbon.viewSorter')}
            notImplemented
            notImplementedHint={todo}
          />
          <RibbonButton
            icon="comment"
            label={t('ppt.ribbon.viewNotes')}
            notImplemented
            notImplementedHint={todo}
          />
        </div>
      </RibbonGroup>

      <RibbonGroup label={t('ppt.ribbon.groupMasterViews')}>
        <div className="ppt-rb-col">
          <RibbonButton
            icon="master"
            label={t('ppt.ribbon.slideMaster')}
            notImplemented
            notImplementedHint={todo}
          />
          <RibbonButton
            icon="headerFooter"
            label={t('ppt.ribbon.handoutMaster')}
            notImplemented
            notImplementedHint={todo}
          />
        </div>
      </RibbonGroup>

      <RibbonGroup label={t('ppt.ribbon.groupShow')}>
        <RibbonToggle
          icon="ruler"
          label={t('ppt.ribbon.ruler')}
          size="small"
          on={cmd.showRuler}
          onToggle={cmd.toggleRuler}
        />
        <RibbonToggle
          icon="grid"
          label={t('ppt.ribbon.gridlines')}
          size="small"
          on={cmd.showGrid}
          onToggle={cmd.toggleGrid}
        />
        <RibbonToggle
          icon="guides"
          label={t('ppt.ribbon.guides')}
          size="small"
          on={cmd.showGuides}
          onToggle={cmd.toggleGuides}
        />
      </RibbonGroup>

      <RibbonGroup label={t('ppt.ribbon.groupZoom')}>
        <RibbonSplitButton
          icon="zoom"
          label={t('ppt.ribbon.zoom')}
          size="large"
          disabled={!cmd.setZoom}
          menuTitle={t('ppt.ribbon.zoom')}
        >
          {(close) => (
            <div className="ppt-rb-menu-list">
              {ZOOM_STEPS.map((z) => (
                <RibbonMenuItem
                  key={z}
                  active={cmd.zoom === z}
                  onClick={() => {
                    cmd.setZoom?.(z);
                    close();
                  }}
                >
                  {z}%
                </RibbonMenuItem>
              ))}
            </div>
          )}
        </RibbonSplitButton>
        <RibbonButton
          icon="fitWindow"
          label={t('ppt.ribbon.fitWindow')}
          size="large"
          onClick={cmd.fitToWindow}
        />
      </RibbonGroup>

      <RibbonGroup label={t('ppt.ribbon.groupWindow')}>
        <div className="ppt-rb-col">
          <RibbonButton
            icon="duplicate"
            label={t('ppt.ribbon.newWindow')}
            notImplemented
            notImplementedHint={todo}
          />
          <RibbonButton
            icon="arrange"
            label={t('ppt.ribbon.arrangeAll')}
            notImplemented
            notImplementedHint={todo}
          />
        </div>
      </RibbonGroup>
    </>
  );
}
