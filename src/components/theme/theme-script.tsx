export const THEME_STORAGE_KEY = "caddy-theme";
export type ThemeChoice = "system" | "light" | "dark";

/**
 * Applies the saved theme before first paint so the page doesn't flash the wrong colours.
 * Kept tiny and dependency-free because it runs inline in <head>.
 */
const script = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t);}}catch(e){}})();`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
