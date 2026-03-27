import { useEngineStore } from '../../store/useEngineStore';
import { useTranslation, AVAILABLE_LANGUAGES } from '../../hooks/useTranslation';
import { useNativeDrag } from '../../hooks/useNativeDrag';
import { AVAILABLE_SYSTEMS } from '../../data/systemsLoader';

// 全局设置悬浮窗组件
export function SettingsWindow() {
  const { t, language } = useTranslation();
  const { isSettingsWindowOpen, setSettingsWindowOpen, loadSystem, setLanguage } = useEngineStore();

  const panelRef = useNativeDrag(isSettingsWindowOpen);

  if (!isSettingsWindowOpen) return null;

  return (
    <div
      ref={panelRef}
      className="floating-panel settings-panel"
      style={{
        position: 'absolute', 
        zIndex: 110,
        top: '60px', 
        left: window.innerWidth - 380
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="drag-handle" style={{ padding: '0 12px', justifyContent: 'flex-end' }}>
        <button className="close-btn" onClick={() => setSettingsWindowOpen(false)} />
      </div>

      <div className="settings-category-title">{t('ui.settings.section.system')}</div>
      <div className="settings-row">
        <div className="label">{t('ui.settings.config.load')}</div>
        <div className="control">
          <select onChange={(e) => { loadSystem(AVAILABLE_SYSTEMS[e.target.value]); e.target.blur(); }}>
            {Object.keys(AVAILABLE_SYSTEMS).map((systemName) => (
              <option key={systemName} value={systemName}>{systemName}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="settings-divider"></div>

      <div className="settings-category-title">{t('ui.settings.section.interface')}</div>
      <div className="settings-row">
        <div className="label">{t('ui.settings.lang')}</div>
        <div className="control">
          <select
            value={language}
            onChange={(e) => { setLanguage(e.target.value); e.target.blur(); }}
          >
            {AVAILABLE_LANGUAGES.map(lang => (
              <option key={lang} value={lang}>{lang}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}