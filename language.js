(function () {
  const body = document.body;
  const buttons = Array.from(document.querySelectorAll("[data-lang-option]"));
  const panels = Array.from(document.querySelectorAll("[data-lang-panel]"));
  const availableLanguages = buttons.map((button) => button.dataset.langOption).filter(Boolean);
  const defaultLanguage = body.getAttribute("data-language") || "tr";

  function readLanguage() {
    try {
      return localStorage.getItem("studyduckLanguage");
    } catch (error) {
      return null;
    }
  }

  function saveLanguage(language) {
    try {
      localStorage.setItem("studyduckLanguage", language);
    } catch (error) {
      return;
    }
  }

  function setLanguage(language) {
    const hasPanel = panels.some((panel) => panel.dataset.langPanel === language);
    const hasButton = availableLanguages.includes(language);
    const activeLanguage = hasPanel || hasButton ? language : defaultLanguage;

    body.setAttribute("data-language", activeLanguage);
    document.documentElement.setAttribute("lang", activeLanguage);

    buttons.forEach((button) => {
      const isActive = button.dataset.langOption === activeLanguage;
      button.setAttribute("aria-pressed", String(isActive));
    });

    panels.forEach((panel) => {
      panel.hidden = panel.dataset.langPanel !== activeLanguage;
    });

    saveLanguage(activeLanguage);
  }

  buttons.forEach((button) => {
    button.addEventListener("click", function () {
      setLanguage(button.dataset.langOption);
    });
  });

  setLanguage(readLanguage() || defaultLanguage);
})();
