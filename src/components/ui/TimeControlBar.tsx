import { useState, useEffect } from 'react';
import { useEngineStore, TIME_TIERS } from '../../store/useEngineStore';
import { useTranslation } from '../../hooks/useTranslation';

export function TimeControlBar() {
  const { timeScale, timeTierIndex, isPaused, togglePause, setTimeTierIndex, setCustomTimeScale } = useEngineStore();
  const { t } = useTranslation();
  const [inputValue, setInputValue] = useState(timeScale.toString());

  // Keep input field in sync with global state
  useEffect(() => {
    setInputValue(timeScale.toString());
  }, [timeScale]);

  // Handle input submission logic
  const handleScaleSubmit = () => {
    let val = parseFloat(inputValue);
    if (isNaN(val) || val < 0) val = 1;

    if (val >= 10) val = Math.round(val);
    else val = Math.round(val * 10) / 10;

    setInputValue(val.toString());

    // Check if the input value matches a preset tier
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
        {isPaused ? '▶' : '⏸'}
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