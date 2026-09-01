/**
 * ThemeToggle.jsx — Reusable theme toggle button.
 *
 * Visual: exactly matches Navigation.jsx's toggle —
 *   ☾ Dark Mode  (when theme is 'dark')
 *   ☀ Light Mode (when theme is 'light')
 *
 * Uses useTheme() from ThemeContext — no local state.
 * Accepts an optional `style` prop for positioning overrides.
 */
import { useTheme } from '../ThemeContext.jsx';

export default function ThemeToggle({ style = {} }) {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      id="theme-toggle-btn"
      onClick={toggleTheme}
      title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        color: 'var(--text-primary)',
        fontFamily: 'var(--text-mono)',
        fontSize: '10px',
        fontWeight: 600,
        padding: '4px 10px',
        borderRadius: '2px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
        flexShrink: 0,
        ...style,
      }}
    >
      {theme === 'dark' ? '☾ Dark Mode' : '☀ Light Mode'}
    </button>
  );
}
