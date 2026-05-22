(function () {
  const root = document.documentElement;
  const toggle = document.querySelector("[data-theme-toggle]");
  const preferredTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";

  function readStoredTheme() {
    try {
      return localStorage.getItem("theme");
    } catch (error) {
      return null;
    }
  }

  function saveTheme(theme) {
    try {
      localStorage.setItem("theme", theme);
    } catch (error) {
      return;
    }
  }

  function setTheme(theme) {
    root.setAttribute("data-theme", theme);
    saveTheme(theme);

    if (toggle) {
      const nextTheme = theme === "dark" ? "light" : "dark";
      toggle.setAttribute("aria-label", "Switch to " + nextTheme + " theme");
      toggle.setAttribute("title", "Switch to " + nextTheme + " theme");
    }
  }

  setTheme(readStoredTheme() || preferredTheme);

  if (toggle) {
    toggle.addEventListener("click", function () {
      const isDark = root.getAttribute("data-theme") === "dark";
      setTheme(isDark ? "light" : "dark");
    });
  }
})();
