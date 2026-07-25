import { useState } from 'react';
import { useI18n } from '../../../i18n';
import RibbonIcon from './icons';
import HomeTab from './tabs/HomeTab';
import InsertTab from './tabs/InsertTab';
import PlaceholderTab, {
  ANIMATIONS_GROUPS,
  DESIGN_GROUPS,
  REVIEW_GROUPS,
  SLIDESHOW_GROUPS,
  TRANSITIONS_GROUPS,
} from './tabs/PlaceholderTab';
import ViewTab from './tabs/ViewTab';
import type { RibbonContextValue, RibbonTabId } from './types';

const TABS: { id: RibbonTabId; labelKey: string }[] = [
  { id: 'home', labelKey: 'ppt.ribbon.tabHome' },
  { id: 'insert', labelKey: 'ppt.ribbon.tabInsert' },
  { id: 'design', labelKey: 'ppt.ribbon.tabDesign' },
  { id: 'transitions', labelKey: 'ppt.ribbon.tabTransitions' },
  { id: 'animations', labelKey: 'ppt.ribbon.tabAnimations' },
  { id: 'slideShow', labelKey: 'ppt.ribbon.tabSlideShow' },
  { id: 'review', labelKey: 'ppt.ribbon.tabReview' },
  { id: 'view', labelKey: 'ppt.ribbon.tabView' },
];

export default function Ribbon({ ctx }: { ctx: RibbonContextValue }) {
  const { t } = useI18n();
  const [tab, setTab] = useState<RibbonTabId>('home');
  const [collapsed, setCollapsed] = useState(false);
  const { cmd } = ctx;

  return (
    <div className="ppt-rb" role="region" aria-label={t('ppt.toolbar')}>
      <div className="ppt-rb-tabrow">
        <div className="ppt-rb-tabs" role="tablist" aria-label={t('ppt.toolbar')}>
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              className={`ppt-rb-tab${tab === item.id ? ' is-active' : ''}`}
              onClick={() => {
                setTab(item.id);
                setCollapsed(false);
              }}
            >
              {t(item.labelKey)}
            </button>
          ))}
        </div>

        <div className="ppt-rb-qat">
          <button
            type="button"
            className="ppt-rb-qat-btn"
            title={t('ppt.shortcutUndo')}
            aria-label={t('preview.undo')}
            disabled={!ctx.canUndo}
            onClick={cmd.undo}
          >
            <RibbonIcon name="undo" />
          </button>
          <button
            type="button"
            className="ppt-rb-qat-btn"
            title={t('ppt.shortcutRedo')}
            aria-label={t('preview.redo')}
            disabled={!ctx.canRedo}
            onClick={cmd.redo}
          >
            <RibbonIcon name="redo" />
          </button>
          <button
            type="button"
            className="ppt-rb-qat-btn"
            title={t('preview.discard')}
            aria-label={t('preview.discard')}
            disabled={!ctx.dirty || ctx.saving}
            onClick={cmd.discard}
          >
            <RibbonIcon name="discard" />
          </button>
          <button
            type="button"
            className={`ppt-rb-qat-btn ppt-rb-qat-save${ctx.dirty ? ' is-dirty' : ''}`}
            title={t('slides.save')}
            aria-label={t('slides.save')}
            disabled={!ctx.dirty || ctx.saving}
            onClick={cmd.save}
          >
            <RibbonIcon name="save" />
            <span>{ctx.saving ? t('preview.saving') : t('slides.save')}</span>
          </button>
          <button
            type="button"
            className="ppt-rb-collapse"
            title={collapsed ? t('ppt.ribbon.expandRibbon') : t('ppt.ribbon.collapseRibbon')}
            aria-label={collapsed ? t('ppt.ribbon.expandRibbon') : t('ppt.ribbon.collapseRibbon')}
            aria-expanded={!collapsed}
            onClick={() => setCollapsed((v) => !v)}
          >
            <svg viewBox="0 0 10 6" width={10} height={6} aria-hidden>
              <path
                d={collapsed ? 'M0 6h10L5 0z' : 'M0 0h10L5 6z'}
                fill="currentColor"
              />
            </svg>
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="ppt-rb-panel" role="tabpanel">
          {tab === 'home' && <HomeTab ctx={ctx} />}
          {tab === 'insert' && <InsertTab ctx={ctx} />}
          {tab === 'design' && <PlaceholderTab groups={DESIGN_GROUPS} />}
          {tab === 'transitions' && <PlaceholderTab groups={TRANSITIONS_GROUPS} />}
          {tab === 'animations' && <PlaceholderTab groups={ANIMATIONS_GROUPS} />}
          {tab === 'slideShow' && <PlaceholderTab groups={SLIDESHOW_GROUPS} />}
          {tab === 'review' && <PlaceholderTab groups={REVIEW_GROUPS} />}
          {tab === 'view' && <ViewTab ctx={ctx} />}
        </div>
      )}
    </div>
  );
}
