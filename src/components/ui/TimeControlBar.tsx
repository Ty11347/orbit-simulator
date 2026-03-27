import { useState, useEffect } from 'react';
import { useEngineStore, TIME_TIERS } from '../../store/useEngineStore';

// 顶部时间流速控制器
export function TimeControlBar() {
  const { timeScale, timeTierIndex, isPaused, togglePause, setTimeTierIndex, setCustomTimeScale } = useEngineStore();
  const [inputValue, setInputValue] = useState(timeScale.toString());

  // 确保输入框内容与全局状态同步
  useEffect(() => {
    setInputValue(timeScale.toString());
  }, [timeScale]);

  // 处理输入框内容提交逻辑
  const handleScaleSubmit = () => {
    let val = parseFloat(inputValue);
    if (isNaN(val) || val < 0) val = 1;

    if (val >= 10) val = Math.round(val);
    else val = Math.round(val * 10) / 10;

    setInputValue(val.toString());

    // 判断输入值是否属于预设梯度
    const matchedIndex = TIME_TIERS.indexOf(val);
    if (matchedIndex !== -1) setTimeTierIndex(matchedIndex);
    else setCustomTimeScale(val);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') e.currentTarget.blur();
  };

  return (
    <div className="ksp-time-bar floating-panel" style={{ flexDirection: 'row' }}>
      <button className={`play-pause-square ${isPaused ? 'paused' : 'playing'}`} onClick={togglePause}>
        {isPaused ? '播放' : '暂停'}
      </button>

      <div className="warp-triangles">
        {TIME_TIERS.map((tier, idx) => (
          <div
            key={idx}
            className={`ksp-triangle ${idx <= timeTierIndex && !isPaused ? 'active' : ''}`}
            onClick={() => {
              if (isPaused) togglePause();
              setTimeTierIndex(idx);
            }}
            title={`${tier}x`}
          />
        ))}
      </div>

      <div className="time-input-wrapper">
        <span className="time-x">T: </span>
        <input
          type="text"
          className="time-scale-input"
          value={inputValue}
          onChange={(e) => {
            let val = e.target.value.replace(/[^0-9.]/g, '');
            if (val.length > 8) val = val.slice(0, 8);
            setInputValue(val);
          }}
          onBlur={handleScaleSubmit}
          onKeyDown={handleKeyDown}
        />
        <span className="time-x"> x</span>
      </div>
    </div>
  );
}