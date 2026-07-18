(function () {
  const STORAGE = {
    token: "studyDuckWebToken",
    user: "studyDuckWebUser",
    apiBase: "studyDuckApiBaseUrl"
  };

  const UNTITLED_NOTEBOOK = "Yeni çalışma defteri";

  const state = {
    token: readStorage(STORAGE.token),
    user: readJsonStorage(STORAGE.user),
    notes: [],
    activeNotebook: "",
    activeNote: null,
    pendingSource: null,
    extractedPdf: null,
    quiz: [],
    quizIndex: 0,
    score: 0,
    selectedAnswers: [],
    screen: "library",
    sourceFormOpen: false,
    busy: false
  };

  const els = {
    authPanel: document.querySelector("[data-auth-panel]"),
    workspace: document.querySelector("[data-workspace]"),
    siteChrome: Array.from(document.querySelectorAll("[data-site-chrome]")),
    loginForm: document.querySelector("[data-login-form]"),
    noteForm: document.querySelector("[data-note-form]"),
    libraryScreen: document.querySelector("[data-library-screen]"),
    notebookScreen: document.querySelector("[data-notebook-screen]"),
    notebookGrid: document.querySelector("[data-notebook-grid]"),
    recentGrid: document.querySelector("[data-recent-grid]"),
    notesList: document.querySelector("[data-notes-list]"),
    notebookTitle: document.querySelector("[data-notebook-title]"),
    noteDetail: document.querySelector("[data-note-detail]"),
    quizContent: document.querySelector("[data-quiz-content]"),
    quizPanel: document.querySelector("[data-quiz-panel]"),
    chatLog: document.querySelector("[data-chat-log]"),
    chatForm: document.querySelector("[data-chat-form]"),
    sessionStatus: document.getElementById("session-status"),
    toast: document.querySelector("[data-toast]")
  };

  function readStorage(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function writeStorage(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      return;
    }
  }

  function removeStorage(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      return;
    }
  }

  function readJsonStorage(key) {
    const raw = readStorage(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function getApiBase() {
    const configured = readStorage(STORAGE.apiBase);
    if (configured) return configured.replace(/\/$/, "");

    const host = window.location.hostname;
    if (!host || host === "localhost" || host === "127.0.0.1") {
      return "https://studybuddyapi-1.onrender.com";
    }

    return "https://studybuddyapi-1.onrender.com";
  }

  function authHeaders(extra) {
    return {
      ...(extra || {}),
      ...(state.token ? { Authorization: `Bearer ${state.token}` } : {})
    };
  }

  async function readResponse(response) {
    const text = await response.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }

    if (!response.ok) {
      const message = json?.message || json?.error || text || "İstek başarısız oldu.";
      throw new Error(message);
    }

    return json ?? text;
  }

  async function api(path, options) {
    const response = await fetch(`${getApiBase()}${path}`, options);
    return readResponse(response);
  }

  function setBusy(isBusy) {
    state.busy = isBusy;
    document.body.classList.toggle("is-busy", isBusy);
    document.querySelectorAll("button, input, textarea, select").forEach((control) => {
      control.disabled = isBusy;
    });
    updateActionAvailability();
  }

  function toast(message, type) {
    if (!els.toast) return;
    els.toast.textContent = message;
    els.toast.dataset.type = type || "info";
    els.toast.hidden = false;
    window.clearTimeout(toast.timer);
    toast.timer = window.setTimeout(() => {
      els.toast.hidden = true;
    }, 4200);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function normalizeNotes(groups) {
    if (!Array.isArray(groups)) return [];

    return groups.flatMap((group) => {
      const groupName = group.groupName || group.GroupName || "Genel";
      const notes = group.notes || group.Notes || [];
      return notes.map((note) => ({
        id: note.id ?? note.Id,
        title: note.title || note.Title || "Ders notu",
        content: note.content || note.Content || "",
        summary: note.summary || note.Summary || "",
        createdAt: note.createdAt || note.CreatedAt,
        fileUrl: note.fileUrl || note.FileUrl || "",
        groupName
      }));
    });
  }

  function getNotebooks() {
    const map = new Map();
    state.notes.forEach((note) => {
      const name = note.groupName || "Genel";
      if (!map.has(name)) {
        map.set(name, {
          name,
          notes: [],
          lastUsed: note.createdAt || "",
          preview: note.summary || note.content || ""
        });
      }

      const notebook = map.get(name);
      notebook.notes.push(note);
      if (new Date(note.createdAt || 0) > new Date(notebook.lastUsed || 0)) {
        notebook.lastUsed = note.createdAt;
        notebook.preview = note.summary || note.content || notebook.preview;
      }
    });

    return Array.from(map.values()).sort((a, b) => new Date(b.lastUsed || 0) - new Date(a.lastUsed || 0));
  }

  function getActiveNotebookNotes() {
    if (!state.activeNotebook) return [];
    return state.notes.filter((note) => (note.groupName || "Genel") === state.activeNotebook);
  }

  function renderShell() {
    const isLoggedIn = Boolean(state.token);
    document.body.classList.toggle("is-study-authenticated", isLoggedIn);
    if (els.authPanel) els.authPanel.hidden = isLoggedIn;
    if (els.workspace) els.workspace.hidden = !isLoggedIn;
    els.siteChrome.forEach((node) => {
      node.hidden = isLoggedIn;
    });

    const username = state.user?.username || state.user?.Username || state.user?.email || state.user?.Email;
    if (els.sessionStatus) {
      els.sessionStatus.textContent = isLoggedIn ? `${username || "StudyDuck"} ile bağlı` : "Giriş bekleniyor";
    }

    renderScreens();
  }

  function renderScreens() {
    if (els.libraryScreen) els.libraryScreen.hidden = state.screen !== "library";
    if (els.notebookScreen) els.notebookScreen.hidden = state.screen !== "notebook";
    renderLibrary();
    renderNotebook();
  }

  function renderLibrary() {
    if (!els.notebookGrid || !els.recentGrid) return;
    const notebooks = getNotebooks();
    const notebookCards = notebooks.map(renderNotebookCard).join("");
    const createCard = `
      <button class="notebook-card notebook-card--create" type="button" data-action="create-notebook">
        <span class="notebook-card__plus">+</span>
        <strong>Yeni çalışma defteri oluştur</strong>
      </button>`;

    els.notebookGrid.innerHTML = notebookCards || `
      <div class="library-empty">
        <strong>Henüz çalışma defterin yok</strong>
        <span>Yeni oluştur ile ilk defterini aç, sonra kaynak ekle.</span>
      </div>`;

    els.recentGrid.innerHTML = `${createCard}${notebooks.slice(0, 5).map(renderRecentCard).join("")}`;
  }

  function renderNotebookCard(notebook, index) {
    const date = formatDate(notebook.lastUsed);
    const theme = (index % 5) + 1;
    return `
      <button class="notebook-card notebook-card--theme-${theme}" type="button" data-notebook-name="${escapeHtml(notebook.name)}">
        <span class="notebook-card__badge">StudyDuck</span>
        <strong>${escapeHtml(notebook.name)}</strong>
        <small>${date || "Bugün"} · ${notebook.notes.length} kaynak</small>
      </button>`;
  }

  function renderRecentCard(notebook) {
    const preview = String(notebook.preview || "").replace(/\s+/g, " ").slice(0, 90);
    return `
      <button class="recent-card" type="button" data-notebook-name="${escapeHtml(notebook.name)}">
        <span class="recent-card__icon">▦</span>
        <strong>${escapeHtml(notebook.name)}</strong>
        <small>${formatDate(notebook.lastUsed)} · ${notebook.notes.length} kaynak</small>
        ${preview ? `<p>${escapeHtml(preview)}...</p>` : ""}
      </button>`;
  }

  function renderNotebook() {
    if (els.notebookTitle) {
      els.notebookTitle.textContent = state.activeNotebook || UNTITLED_NOTEBOOK;
    }
    if (els.noteForm?.elements.groupName && !els.noteForm.elements.groupName.value.trim()) {
      els.noteForm.elements.groupName.placeholder = state.activeNotebook || UNTITLED_NOTEBOOK;
    }
    if (els.noteForm) {
      els.noteForm.hidden = !state.sourceFormOpen;
    }
    renderNotes();
    renderActiveNote();
    renderQuiz();
    updateActionAvailability();
  }

  function renderNotes() {
    if (!els.notesList) return;
    const notes = getActiveNotebookNotes();
    const pendingHtml = state.pendingSource && state.pendingSource.groupName === state.activeNotebook
      ? `
        <div class="source-row source-row--pending">
          <div class="source-item">
            <span>${escapeHtml(state.pendingSource.title)}</span>
            <small>${escapeHtml(state.pendingSource.status || "Kaynak hazırlanıyor")}</small>
          </div>
          <span class="source-spinner" aria-label="Kaynak yükleniyor"></span>
        </div>`
      : "";

    if (!notes.length && !pendingHtml) {
      els.notesList.innerHTML = `
        <div class="study-empty study-empty--small">
          <strong>Kayıtlı kaynaklar burada gösterilir</strong>
          <span>PDF veya metin eklemek için Kaynak ekle düğmesini kullan.</span>
        </div>`;
      return;
    }

    els.notesList.innerHTML = `${pendingHtml}${notes.map((note) => `
      <div class="source-row${state.activeNote?.id === note.id ? " is-active" : ""}">
        <button class="source-item" type="button" data-note-id="${note.id}">
          <span>${escapeHtml(note.title)}</span>
          <small>${formatDate(note.createdAt) || "Kaynak"}</small>
        </button>
        <button class="source-delete" type="button" data-delete-note-id="${note.id}" aria-label="${escapeHtml(note.title)} kaynağını sil" title="Kaynağı sil">Sil</button>
      </div>
    `).join("")}`;
  }

  function renderActiveNote() {
    if (!els.noteDetail) return;

    const shouldShowPendingSource =
      state.pendingSource
      && state.pendingSource.groupName === state.activeNotebook
      && (!state.activeNote || state.activeNote.id === state.pendingSource.noteId);

    if (shouldShowPendingSource) {
      els.noteDetail.innerHTML = `
        <div class="note-processing">
          <span class="note-processing__spinner" aria-hidden="true"></span>
          <p class="eyebrow">Kaynak işleniyor</p>
          <h2>${escapeHtml(state.pendingSource.title)}</h2>
          <p>Belge okunuyor, çalışma notu hazırlanıyor. Birkaç saniye içinde burada açılacak.</p>
        </div>`;
      renderChat([]);
      return;
    }

    if (!state.activeNote) {
      els.noteDetail.innerHTML = `
        <div class="note-hero__empty">
          <span class="note-hero__icon">▦</span>
          <h2>${escapeHtml(state.activeNotebook || UNTITLED_NOTEBOOK)}</h2>
          <p>Kaynak ekledikten sonra burada not içeriği ve Ask Duck sohbeti açılır.</p>
        </div>`;
      renderChat([]);
      return;
    }

    els.noteDetail.innerHTML = `
      <div class="note-hero__content">
        <div>
          <span class="note-hero__icon">▦</span>
          <p class="eyebrow">${escapeHtml(state.activeNote.groupName || "Genel")}</p>
          <h2>${escapeHtml(state.activeNote.title)}</h2>
          <small>${formatDate(state.activeNote.createdAt)} · ${estimateWords(state.activeNote.content)} kelime</small>
        </div>
        ${state.activeNote.fileUrl ? `<a class="button button--secondary button--compact" href="${escapeHtml(state.activeNote.fileUrl)}" target="_blank" rel="noreferrer">PDF</a>` : ""}
      </div>
      <div class="note-content">${formatNotebookContent(state.activeNote.content)}</div>`;
    renderChat([]);
  }

  function renderSuggestedQuestions(note) {
    const title = note?.title || "bu konu";
    const group = note?.groupName || "bu çalışma";
    const questions = [
      `${title} konusunun en önemli noktaları neler?`,
      `${group} içinde sınavda çıkabilecek yerleri özetler misin?`,
      `${title} için kısa bir tekrar planı hazırlar mısın?`
    ];

    return `
      <div class="note-suggestions" aria-label="Önerilen sorular">
        ${questions.map((question) => `
          <button type="button" data-suggested-question="${escapeHtml(question)}">${escapeHtml(question)}</button>
        `).join("")}
      </div>`;
  }

  function formatNotebookContent(content) {
    const safe = escapeHtml(content || "Bu notun içeriği boş.");
    return safe
      .replace(/^### (.*)$/gm, "<h4>$1</h4>")
      .replace(/^## (.*)$/gm, "<h3>$1</h3>")
      .replace(/^# (.*)$/gm, "<h2>$1</h2>")
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\n/g, "<br />");
  }

  function renderQuiz() {
    if (!els.quizContent) return;

    if (!state.activeNote) {
      els.quizContent.innerHTML = `
        <p class="study-muted">Önce bir kaynak seç. Sonra StudyDuck o kaynaktan quiz hazırlar.</p>
        <button class="button button--primary" type="button" data-action="start-quiz" disabled>Quiz oluştur</button>`;
      return;
    }

    if (!state.quiz.length) {
      els.quizContent.innerHTML = `
        <p class="study-muted"><strong>${escapeHtml(state.activeNote.title)}</strong> kaynağından quiz oluştur.</p>
        <label class="quiz-mode">
          Quiz uzunluğu
          <select data-quiz-mode>
            <option value="short">Kısa quiz</option>
            <option value="long">Uzun quiz</option>
          </select>
        </label>
        <button class="button button--primary" type="button" data-action="start-quiz">Quiz oluştur</button>`;
      return;
    }

    const current = state.quiz[state.quizIndex];
    if (!current) {
      const total = state.quiz.length;
      els.quizContent.innerHTML = `
        <div class="quiz-result">
          <strong>${state.score}/${total}</strong>
          <span>Quiz tamamlandı</span>
        </div>
        <button class="button button--secondary" type="button" data-action="reset-quiz">Yeni quiz</button>`;
      return;
    }

    els.quizContent.innerHTML = `
      <div class="quiz-progress">
        <span>Soru ${state.quizIndex + 1}/${state.quiz.length}</span>
        <span>${state.score} doğru</span>
      </div>
      ${renderVisualAid(current.visualAid || current.VisualAid)}
      <h3 class="quiz-question">${escapeHtml(current.question || current.Question)}</h3>
      <div class="quiz-options">
        ${(current.options || current.Options || []).map((option) => `
          <button class="quiz-option" type="button" data-answer="${escapeHtml(option)}">${escapeHtml(option)}</button>
        `).join("")}
      </div>`;
  }

  function renderVisualAid(visualAid) {
    if (!visualAid) return "";
    const title = visualAid.title || visualAid.Title || "Görsel dayanak";
    const description = visualAid.description || visualAid.Description || "";
    const markdown = visualAid.markdown || visualAid.Markdown || "";
    const imageUrl = visualAid.imageUrl || visualAid.ImageUrl || "";

    return `
      <div class="visual-aid">
        <strong>${escapeHtml(title)}</strong>
        ${description ? `<p>${escapeHtml(description)}</p>` : ""}
        ${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(title)}" />` : ""}
        ${markdown ? `<pre>${escapeHtml(markdown)}</pre>` : ""}
      </div>`;
  }

  function renderChat(messages) {
    if (!els.chatLog) return;

    if (!messages.length) {
      els.chatLog.innerHTML = state.activeNote
        ? `
          <div class="chat-empty">
            <strong>Ask Duck'a sor</strong>
            <span>${escapeHtml(state.activeNote.title)} hakkında hızlıca soru sorabilirsin.</span>
            ${renderSuggestedQuestions(state.activeNote)}
          </div>`
        : `<div class="chat-empty"><span>Kaynak ekleyince Ask Duck burada cevap verir.</span></div>`;
      return;
    }

    els.chatLog.innerHTML = `<div class="chat-thread">${messages.map((message) => {
      const role = (message.role || message.Role) === "user" ? "user" : "assistant";
      const content = message.content || message.Content || "";
      return `
        <div class="chat-turn chat-turn--${role}">
          <div class="chat-turn__content">${formatChatContent(content)}</div>
        </div>`;
    }).join("")}</div>`;
    els.chatLog.scrollTop = els.chatLog.scrollHeight;
  }

  function formatChatContent(content) {
    return escapeHtml(content || "")
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/^- (.*)$/gm, "<span class=\"chat-bullet\">$1</span>")
      .replace(/\n{2,}/g, "<br><br>")
      .replace(/\n/g, "<br>");
  }

  function updateActionAvailability() {
    const hasNote = Boolean(state.activeNote);
    document.querySelectorAll("[data-action='start-quiz']").forEach((button) => {
      button.disabled = state.busy || !hasNote;
    });

    if (els.chatForm) {
      const input = els.chatForm.elements.question;
      const button = els.chatForm.querySelector("button");
      if (input) input.disabled = state.busy || !hasNote;
      if (button) button.disabled = state.busy || !hasNote;
    }
  }

  function formatDate(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short", year: "numeric" }).format(date);
  }

  function estimateWords(content) {
    return String(content || "").trim().split(/\s+/).filter(Boolean).length;
  }

  function detectQuestionLanguage(text) {
    const value = String(text || "").trim().toLowerCase();
    if (!value) return document.body.dataset.language || "tr";

    if (/[çğıöşü]/i.test(value)) return "tr";
    if (/[\u0400-\u04ff]/.test(value)) return "ru";
    if (/[\u0370-\u03ff]/.test(value)) return "el";
    if (/[\u3040-\u30ff]/.test(value)) return "ja";
    if (/[\uac00-\ud7af]/.test(value)) return "ko";
    if (/[\u4e00-\u9fff]/.test(value)) return "zh";
    if (/[\u0600-\u06ff]/.test(value)) return /[پچژگکی]/.test(value) ? "fa" : "ar";

    const words = value.match(/[a-zà-ÿ]+/gi) || [];
    const score = (list) => words.reduce((total, word) => total + (list.includes(word) ? 1 : 0), 0);
    const scores = {
      tr: score(["mı", "mi", "mu", "mü", "nedir", "nasil", "nasıl", "neden", "niye", "hangi", "bana", "acikla", "açıkla", "ozetle", "özetle", "ornek", "örnek", "konu", "hakkinda", "hakkında", "nelerdir", "fark", "arasindaki", "arasındaki"]),
      en: score(["what", "why", "how", "when", "which", "explain", "summarize", "summary", "example", "difference", "between", "does", "is", "are", "can", "should"]),
      de: score(["was", "warum", "wie", "wann", "welche", "erkläre", "erklaere", "zusammenfassung", "beispiel", "unterschied"]),
      es: score(["qué", "que", "por", "cómo", "como", "cuándo", "cuando", "explica", "resume", "ejemplo", "diferencia"]),
      fr: score(["quoi", "pourquoi", "comment", "quand", "explique", "résume", "resume", "exemple", "différence"]),
      it: score(["cosa", "perché", "perche", "come", "quando", "spiega", "riassumi", "esempio", "differenza"]),
      pt: score(["o", "que", "por", "como", "quando", "explique", "resuma", "exemplo", "diferença"])
    };

    const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
    if (best && best[1] > 0) return best[0];

    return document.body.dataset.language || "en";
  }

  function getThinkingMessage(language) {
    return {
      tr: "Düşünüyorum...",
      de: "Ich denke nach...",
      el: "Σκέφτομαι...",
      es: "Pensando...",
      fa: "در حال فکر کردن...",
      fr: "Je réfléchis...",
      it: "Sto pensando...",
      ja: "考えています...",
      ko: "생각 중...",
      pt: "Pensando...",
      ru: "Думаю...",
      zh: "正在思考...",
      ar: "أفكر..."
    }[language] || "Thinking...";
  }

  async function login(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);

    setBusy(true);
    try {
      const result = await api("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formData.get("email"),
          password: formData.get("password"),
          rememberMe: formData.get("rememberMe") === "on"
        })
      });

      state.token = result.token;
      state.user = result.user;
      state.screen = "library";
      writeStorage(STORAGE.token, state.token);
      writeStorage(STORAGE.user, JSON.stringify(state.user));
      renderShell();
      await loadNotes();
      toast("Giriş başarılı.", "success");
    } catch (error) {
      toast(error.message || "Giriş yapılamadı.", "error");
    } finally {
      setBusy(false);
    }
  }

  function logout() {
    state.token = null;
    state.user = null;
    state.notes = [];
    state.activeNotebook = "";
    state.activeNote = null;
    state.quiz = [];
    state.screen = "library";
    state.sourceFormOpen = false;
    removeStorage(STORAGE.token);
    removeStorage(STORAGE.user);
    renderShell();
    toast("Çıkış yapıldı.", "info");
  }

  async function loadNotes(options) {
    const quiet = Boolean(options?.quiet);
    if (!state.token) return;
    if (!quiet) setBusy(true);
    try {
      const groups = await api("/api/notes/grouped", {
        headers: authHeaders({ Accept: "application/json" })
      });
      state.notes = normalizeNotes(groups);

      if (state.activeNotebook) {
        const activeNotes = getActiveNotebookNotes();
        const preservedNote = activeNotes.find((note) => note.id === state.activeNote?.id) || null;
        if (preservedNote || !state.pendingSource) {
          state.activeNote = preservedNote || activeNotes[0] || null;
        }
      }

      renderScreens();
      if (state.activeNote) await loadChatHistory();
    } catch (error) {
      if (/401|unauthorized|yetki/i.test(error.message)) logout();
      toast(error.message || "Notlar yüklenemedi.", "error");
    } finally {
      if (!quiet) setBusy(false);
    }
  }

  function openNotebook(name, preferredNoteId) {
    state.activeNotebook = name || UNTITLED_NOTEBOOK;
    const notes = getActiveNotebookNotes();
    state.activeNote = notes.find((note) => note.id === preferredNoteId) || notes[0] || null;
    state.quiz = [];
    state.quizIndex = 0;
    state.score = 0;
    state.selectedAnswers = [];
    state.screen = "notebook";
    state.sourceFormOpen = false;
    renderScreens();
    if (state.activeNote) loadChatHistory();
  }

  function createNotebook() {
    state.activeNotebook = UNTITLED_NOTEBOOK;
    state.activeNote = null;
    state.quiz = [];
    state.screen = "notebook";
    state.sourceFormOpen = false;
    if (els.noteForm) {
      els.noteForm.reset();
      els.noteForm.elements.groupName.value = UNTITLED_NOTEBOOK;
    }
    renderScreens();
  }

  function showLibrary() {
    state.screen = "library";
    state.sourceFormOpen = false;
    renderScreens();
  }

  function toggleSourceForm(forceOpen) {
    state.sourceFormOpen = typeof forceOpen === "boolean" ? forceOpen : !state.sourceFormOpen;
    if (state.sourceFormOpen && els.noteForm?.elements.groupName && !els.noteForm.elements.groupName.value.trim()) {
      els.noteForm.elements.groupName.value = state.activeNotebook || UNTITLED_NOTEBOOK;
    }
    updateFileName();
    renderNotebook();
  }

  function updateFileName() {
    const file = els.noteForm?.elements.pdf?.files?.[0];
    const label = els.noteForm?.querySelector("[data-file-name]");
    if (!label) return;
    label.textContent = file ? file.name : "veya seçmek için tıkla";
  }

  async function extractPdfFromForm(options) {
    const background = Boolean(options?.background);
    const showToast = options?.showToast !== false;
    const fileInput = els.noteForm?.elements.pdf;
    const file = fileInput?.files?.[0];
    if (!file) {
      toast("Önce bir PDF seç.", "error");
      return null;
    }

    if (!background) setBusy(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("language", document.body.dataset.language || "tr");

      const result = await api("/api/pdf/extract-text", {
        method: "POST",
        headers: authHeaders({ Accept: "application/json" }),
        body: formData
      });

      state.extractedPdf = {
        file,
        content: result.content || "",
        pageCount: result.pageCount,
        isLongDocument: Boolean(result.isLongDocument),
        suggestedPartCount: result.suggestedPartCount,
        visualReferences: Array.isArray(result.visualReferences) ? result.visualReferences : []
      };

      els.noteForm.elements.content.value = state.extractedPdf.content;
      if (!els.noteForm.elements.title.value.trim()) {
        els.noteForm.elements.title.value = file.name.replace(/\.pdf$/i, "");
      }

      if (showToast) {
        toast(
          state.extractedPdf.isLongDocument
            ? `Uzun PDF algılandı. Yaklaşık ${state.extractedPdf.suggestedPartCount || 1} parçalık defter oluşturulabilir.`
            : "PDF metni çıkarıldı.",
          "success"
        );
      }

      return state.extractedPdf;
    } catch (error) {
      toast(error.message || "PDF metni çıkarılamadı.", "error");
      return null;
    } finally {
      if (!background) setBusy(false);
    }
  }

  async function uploadPdf(file) {
    if (!file) return "";
    const formData = new FormData();
    formData.append("file", file);
    const result = await api("/api/upload/pdf", {
      method: "POST",
      headers: authHeaders({ Accept: "application/json" }),
      body: formData
    });
    return result.url || "";
  }

  async function saveNote(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const file = form.elements.pdf.files?.[0];
    let content = String(formData.get("content") || "").trim();
    const title = String(formData.get("title") || "").trim();
    const groupName = String(formData.get("groupName") || "").trim() || state.activeNotebook || title || "Genel";

    if (!title) {
      toast("Başlık gerekli.", "error");
      return;
    }

    if (!file && !content) {
      toast("İçerik boş olamaz.", "error");
      return;
    }

    state.activeNotebook = groupName;
    state.activeNote = null;
    state.pendingSource = {
      title: file?.name ? file.name.replace(/\.pdf$/i, "") : title,
      groupName,
      status: file ? "PDF okunuyor" : "Not hazırlanıyor"
    };
    state.sourceFormOpen = false;
    state.screen = "notebook";
    renderScreens();

    if (file && (!state.extractedPdf || state.extractedPdf.file !== file)) {
      const extracted = await extractPdfFromForm({ background: true, showToast: false });
      if (!extracted) {
        state.pendingSource = null;
        state.sourceFormOpen = true;
        renderScreens();
        return;
      }
      content = extracted.content.trim();
      state.pendingSource = { title, groupName, status: "Not kaydediliyor" };
      renderScreens();
    }

    if (!content) {
      state.pendingSource = null;
      state.sourceFormOpen = true;
      renderScreens();
      toast("İçerik boş olamaz.", "error");
      return;
    }

    try {
      const fileUrl = file ? await uploadPdf(file) : "";
      const extracted = state.extractedPdf;
      const endpoint = extracted?.isLongDocument ? "/api/notes/import-long-document" : "/api/notes";
      const body = extracted?.isLongDocument
        ? {
            title,
            groupName,
            content,
            fileUrl,
            language: document.body.dataset.language || "tr",
            pageCount: extracted.pageCount,
            suggestedPartCount: extracted.suggestedPartCount
          }
        : {
            title,
            groupName,
            content,
            fileUrl,
            language: document.body.dataset.language || "tr"
          };

      await api(endpoint, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json", Accept: "application/json" }),
        body: JSON.stringify(body)
      });

      form.reset();
      state.extractedPdf = null;
      updateFileName();
      state.sourceFormOpen = false;
      const shouldOpenSavedNote = state.screen === "notebook" && state.activeNotebook === groupName;
      await loadNotes({ quiet: true });
      state.pendingSource = null;
      const saved = state.notes
        .filter((note) => (note.groupName || "Genel") === groupName)
        .find((note) => note.title === title);

      if (shouldOpenSavedNote) {
        state.activeNote = saved || getActiveNotebookNotes()[0] || null;
        state.screen = "notebook";
      } else if (state.activeNotebook) {
        const activeNotes = getActiveNotebookNotes();
        state.activeNote = activeNotes.find((note) => note.id === state.activeNote?.id) || state.activeNote;
      }

      renderScreens();
      if (shouldOpenSavedNote && state.activeNote) await loadChatHistory();
      toast("Kaynak çalışma defterine eklendi.", "success");
    } catch (error) {
      state.pendingSource = null;
      if (state.screen === "notebook" && state.activeNotebook === groupName) {
        state.sourceFormOpen = true;
      }
      renderScreens();
      toast(error.message || "Not kaydedilemedi.", "error");
    }
  }

  async function deleteNote(noteId) {
    const note = state.notes.find((item) => item.id === noteId);
    if (!note) return;
    if (!window.confirm(`"${note.title}" kaynağını silmek istiyor musun?`)) return;

    setBusy(true);
    try {
      await api(`/api/notes/delete/${noteId}`, {
        method: "DELETE",
        headers: authHeaders({ Accept: "application/json" })
      });

      if (state.activeNote?.id === noteId) {
        state.activeNote = null;
        state.quiz = [];
        state.quizIndex = 0;
        state.score = 0;
        state.selectedAnswers = [];
      }

      await loadNotes();
      const remaining = getActiveNotebookNotes();
      state.activeNote = remaining[0] || null;
      if (!remaining.length) state.sourceFormOpen = false;
      renderScreens();
      if (state.activeNote) await loadChatHistory();
      toast("Kaynak silindi.", "success");
    } catch (error) {
      toast(error.message || "Kaynak silinemedi.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function deleteActiveNotebook() {
    const notes = getActiveNotebookNotes();
    const name = state.activeNotebook || UNTITLED_NOTEBOOK;
    if (!notes.length) {
      showLibrary();
      return;
    }

    if (!window.confirm(`"${name}" çalışma defterini ve içindeki ${notes.length} kaynağı silmek istiyor musun?`)) return;

    setBusy(true);
    try {
      for (const note of notes) {
        await api(`/api/notes/delete/${note.id}`, {
          method: "DELETE",
          headers: authHeaders({ Accept: "application/json" })
        });
      }

      state.activeNotebook = "";
      state.activeNote = null;
      state.quiz = [];
      state.quizIndex = 0;
      state.score = 0;
      state.selectedAnswers = [];
      state.sourceFormOpen = false;
      state.screen = "library";
      await loadNotes();
      renderScreens();
      toast("Çalışma defteri silindi.", "success");
    } catch (error) {
      toast(error.message || "Çalışma defteri silinemedi.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function startQuiz() {
    if (!state.activeNote) return;
    const mode = document.querySelector("[data-quiz-mode]")?.value || "short";
    const idempotencyKey = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    setBusy(true);
    try {
      let result = null;
      for (let attempt = 0; attempt < 12; attempt += 1) {
        const response = await fetch(`${getApiBase()}/api/notes/generate-quiz-v2`, {
          method: "POST",
          headers: authHeaders({
            "Content-Type": "application/json",
            Accept: "application/json",
            "Idempotency-Key": idempotencyKey
          }),
          body: JSON.stringify({
            content: state.activeNote.content,
            mode,
            language: document.body.dataset.language || "tr",
            title: state.activeNote.title
          })
        });

        if (response.status === 202) {
          await wait(1500);
          continue;
        }

        result = await readResponse(response);
        break;
      }

      if (!result?.questions?.length) {
        throw new Error("Quiz oluşturma zaman aşımına uğradı.");
      }

      state.quiz = result.questions;
      state.quizIndex = 0;
      state.score = 0;
      state.selectedAnswers = [];
      renderQuiz();
      toast("Quiz hazır.", "success");
    } catch (error) {
      toast(error.message || "Quiz oluşturulamadı.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function chooseAnswer(answer) {
    const current = state.quiz[state.quizIndex];
    if (!current) return;

    const correctAnswer = current.correctAnswer || current.CorrectAnswer;
    const isCorrect = answer.trim().toLowerCase() === String(correctAnswer).trim().toLowerCase();
    if (isCorrect) state.score += 1;

    state.selectedAnswers.push({
      question: current.question || current.Question,
      selectedAnswer: answer,
      correctAnswer
    });

    document.querySelectorAll(".quiz-option").forEach((button) => {
      button.disabled = true;
      const value = button.dataset.answer;
      if (String(value).trim().toLowerCase() === String(correctAnswer).trim().toLowerCase()) {
        button.classList.add("is-correct");
      } else if (value === answer) {
        button.classList.add("is-wrong");
      }
    });

    await wait(800);
    state.quizIndex += 1;

    if (state.quizIndex >= state.quiz.length) {
      await saveQuizResult();
    }

    renderQuiz();
  }

  async function saveQuizResult() {
    if (!state.activeNote || !state.selectedAnswers.length) return;
    try {
      await api("/api/notes/quiz-history", {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json", Accept: "application/json" }),
        body: JSON.stringify({
          score: state.score,
          totalQuestions: state.selectedAnswers.length,
          groupName: state.activeNote.groupName || "Genel",
          title: state.activeNote.title || "Web Quiz",
          answers: state.selectedAnswers
        })
      });
      toast("Quiz sonucu kaydedildi.", "success");
    } catch (error) {
      toast(error.message || "Quiz sonucu kaydedilemedi.", "error");
    }
  }

  async function loadChatHistory() {
    if (!state.activeNote) return;
    try {
      const messages = await api(`/api/notes/${state.activeNote.id}/ask-duck/history`, {
        headers: authHeaders({ Accept: "application/json" })
      });
      renderChat(Array.isArray(messages) ? messages : []);
    } catch {
      renderChat([]);
    }
  }

  async function askDuck(event) {
    event.preventDefault();
    if (!state.activeNote) return;
    const input = event.currentTarget.elements.question;
    const question = input.value.trim();
    if (!question) return;
    const responseLanguage = detectQuestionLanguage(question);

    const pending = [
      { role: "user", content: question },
      { role: "assistant", content: getThinkingMessage(responseLanguage) }
    ];
    renderChat(pending);
    input.value = "";

    setBusy(true);
    try {
      await api(`/api/notes/${state.activeNote.id}/ask-duck`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json", Accept: "application/json" }),
        body: JSON.stringify({
          question,
          language: responseLanguage
        })
      });
      await loadChatHistory();
    } catch (error) {
      toast(error.message || "Ask Duck yanıt veremedi.", "error");
      await loadChatHistory();
    } finally {
      setBusy(false);
    }
  }

  function wait(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function bindEvents() {
    els.loginForm?.addEventListener("submit", login);
    els.noteForm?.addEventListener("submit", saveNote);
    els.noteForm?.elements.pdf?.addEventListener("change", updateFileName);
    els.chatForm?.addEventListener("submit", askDuck);

    const uploadZone = els.noteForm?.querySelector(".source-upload");
    uploadZone?.addEventListener("dragover", (event) => {
      event.preventDefault();
      uploadZone.classList.add("is-dragging");
    });
    uploadZone?.addEventListener("dragleave", () => {
      uploadZone.classList.remove("is-dragging");
    });
    uploadZone?.addEventListener("drop", (event) => {
      event.preventDefault();
      uploadZone.classList.remove("is-dragging");
      const file = Array.from(event.dataTransfer?.files || []).find((item) => item.type === "application/pdf" || /\.pdf$/i.test(item.name));
      if (!file || !els.noteForm?.elements.pdf) {
        toast("Sadece PDF dosyası ekleyebilirsin.", "error");
        return;
      }
      const transfer = new DataTransfer();
      transfer.items.add(file);
      els.noteForm.elements.pdf.files = transfer.files;
      updateFileName();
    });

    document.addEventListener("click", (event) => {
      const action = event.target.closest("[data-action]")?.dataset.action;
      const notebookButton = event.target.closest("[data-notebook-name]");
      const noteButton = event.target.closest("[data-note-id]");
      const answerButton = event.target.closest("[data-answer]");
      const deleteNoteButton = event.target.closest("[data-delete-note-id]");
      const suggestedQuestion = event.target.closest("[data-suggested-question]");

      if (notebookButton) {
        openNotebook(notebookButton.dataset.notebookName);
        return;
      }

      if (noteButton) {
        const noteId = Number(noteButton.dataset.noteId);
        state.activeNote = state.notes.find((note) => note.id === noteId) || null;
        state.quiz = [];
        state.quizIndex = 0;
        state.score = 0;
        state.selectedAnswers = [];
        renderNotebook();
        if (state.activeNote) loadChatHistory();
        return;
      }

      if (deleteNoteButton) {
        deleteNote(Number(deleteNoteButton.dataset.deleteNoteId));
        return;
      }

      if (answerButton) {
        chooseAnswer(answerButton.dataset.answer);
        return;
      }

      if (suggestedQuestion && els.chatForm?.elements.question) {
        els.chatForm.elements.question.value = suggestedQuestion.dataset.suggestedQuestion || "";
        els.chatForm.elements.question.focus();
        return;
      }

      if (action === "logout") logout();
      if (action === "refresh-notes") loadNotes();
      if (action === "library-home") showLibrary();
      if (action === "create-notebook") createNotebook();
      if (action === "delete-notebook") deleteActiveNotebook();
      if (action === "toggle-source-form") toggleSourceForm();
      if (action === "extract-pdf") extractPdfFromForm();
      if (action === "start-quiz") startQuiz();
      if (action === "reset-quiz") {
        state.quiz = [];
        state.quizIndex = 0;
        state.score = 0;
        state.selectedAnswers = [];
        renderQuiz();
      }
    });
  }

  bindEvents();
  renderShell();
  if (state.token) loadNotes();
})();
