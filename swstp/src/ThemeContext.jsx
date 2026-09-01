/**
 * ThemeContext.jsx — Global theme state for SWSTP.
 *
 * MECHANISM: Inline <script> in index.html reads localStorage.swstp_theme
 * and sets document.documentElement.setAttribute('data-theme', ...) before
 * first paint — this is the only approach that prevents a flash on cold load
 * to any route (the JS module bundle loads async; a useEffect or pre-render
 * read both fire too late). This file owns the React state layer above that
 * synchronous pre-paint write.
 *
 * The ThemeProvider keeps React state in sync with what the inline script
 * already set. Consumers call useTheme() to get { theme, toggleTheme }.
 *
 * Storage key: 'swstp_theme'  (unchanged from Navigation.jsx's prior usage)
 * DOM target:  document.documentElement  ('data-theme' attribute on <html>)
 * Values:      'dark' (default) | 'light'
 */
import { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext({
  theme: 'dark',
  toggleTheme: () => {},
});

export function ThemeProvider({ children }) {
  // Read the value that the inline index.html script already set.
  // Default matches the inline script default ('dark').
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('swstp_theme') || 'dark';
  });

  // Keep document.documentElement and localStorage in sync whenever theme changes.
  // Note: on first render this is a no-op because the inline script already set
  // the correct value — the effect is idempotent.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('swstp_theme', theme);
  }, [theme]);

  const toggleTheme = () =>
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

/** Hook for all consumers. */
export function useTheme() {
  return useContext(ThemeContext);
}

/**
 * Returns the CARTO basemap tile URL for the current theme.
 * Callers: AdminPanels (FleetPanel), MapView, ReplayView.
 *
 * dark  → dark_all  (current hardcoded value everywhere)
 * light → light_all (CARTO's light variant, same subdomain pattern)
 */
export function cartoTileUrl(theme) {
  const variant = theme === 'light' ? 'light_all' : 'dark_all';
  return `https://{s}.basemaps.cartocdn.com/${variant}/{z}/{x}/{y}{r}.png`;
}
