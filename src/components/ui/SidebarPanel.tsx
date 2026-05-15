import { useState } from 'react';
import { useEngineStore } from '../../store/useEngineStore';
import { useUIStore } from '../../store/useUIStore';
import { useTranslation } from '../../hooks/useTranslation';

// 左侧实体导航面板
export function SidebarPanel() {
  const { bodies, deleteBody } = useEngineStore();
  const { selectedBodyId, setSelectedBody, setAddModalOpen, setFocusMode } = useUIStore();
  const { t } = useTranslation();
  
  // 组件状态管理
  const [activeTab, setActiveTab] = useState<'ENTITIES' | 'VEHICLES'>('ENTITIES');
  const [isCollapsed, setIsCollapsed] = useState(false);

  // 根据标签页过滤显示列表
  const displayList = bodies.filter(b => {
    if (activeTab === 'ENTITIES') return b.type !== 'VEHICLE';
    if (activeTab === 'VEHICLES') return b.type === 'VEHICLE';
    return false;
  });

  return (
    <div className="sidebar-container">
      <div className={`floating-panel sidebar-panel ${isCollapsed ? 'collapsed' : ''}`}>

        <div className="tabs-header">
          <button className={`tab-btn ${activeTab === 'ENTITIES' ? 'active' : ''}`} onClick={() => setActiveTab('ENTITIES')}>{t('ui.tab.entities')}</button>
          <button className={`tab-btn ${activeTab === 'VEHICLES' ? 'active' : ''}`} onClick={() => setActiveTab('VEHICLES')}>{t('ui.tab.vehicles')}</button>
        </div>
        <div className="list-container">
          {displayList.length === 0 && <p className="empty-text">{t('ui.empty')}</p>}
          {displayList.map(body => (
            <div
              key={body.id}
              className={`list-item ${selectedBodyId === body.id ? 'selected' : ''}`}
              onClick={() => { setFocusMode('JUMP'); setSelectedBody(body.id); }}
            >
              <div className="item-info">
                <span className="item-color" style={{ backgroundColor: body.color }}></span>
                <span className="item-name">{t(body.name)}</span>
              </div>
              {body.id !== 0 && (
                <button className="delete-btn" onClick={(e) => { e.stopPropagation(); const deletedId = deleteBody(body.id); if (deletedId === selectedBodyId) setSelectedBody(null); }}>{t('ui.destroy')}</button>
              )}
            </div>
          ))}
          <button className="add-mini-btn" onClick={() => setAddModalOpen(true)}>+</button>
        </div>
      </div>
      <button className={`toggle-sidebar-btn ${isCollapsed ? 'collapsed' : ''}`} onClick={() => setIsCollapsed(!isCollapsed)}>
        {isCollapsed ? '⟩' : '⟨'}
      </button>
    </div>
  );
}