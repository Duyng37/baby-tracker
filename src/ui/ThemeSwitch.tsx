import { useId } from 'react';
import { Icon } from './Icon';
import { useTheme } from './theme';

export function ThemeSwitch() {
  const { theme, toggleTheme } = useTheme();
  const description = useId();
  const enabled = theme === 'dark';
  return <button type="button" className="setting-row theme-setting" role="switch" aria-checked={enabled}
    aria-label="Chế độ ban đêm" aria-describedby={description} onClick={toggleTheme}>
    <Icon name="sleep" /><span><strong>Chế độ ban đêm</strong><small id={description}>{enabled ? 'Đang bật' : 'Đang tắt'} · Giao diện dịu mắt khi chăm bé lúc khuya</small></span>
    <span className="switch-track" aria-hidden="true"><span className="switch-thumb" /></span>
  </button>;
}