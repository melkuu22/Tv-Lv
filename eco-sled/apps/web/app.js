const app = document.querySelector("#app");

const categoryLabels = {
  transport: "Транспорт",
  energy: "Энергия",
  food: "Питание",
  shopping: "Покупки",
  waste: "Отходы",
  water: "Вода",
};

const options = {
  country: { DE: "Германия", LV: "Латвия", EU: "Другая страна ЕС" },
  housing: { apartment: "Квартира", house: "Дом", other: "Другое" },
  diet: {
    meat_daily: "Мясо каждый день",
    meat_regular: "Мясо несколько раз в неделю",
    meat_rare: "Мясо редко",
    vegetarian: "Вегетарианское",
    vegan: "Растительное",
  },
  shopping: { often: "Часто", sometimes: "Иногда", rare: "Редко", secondhand: "Секонд-хенд" },
  waste: { none: "Почти не сортирую", some: "Частично", most: "Почти всё", all: "Всё по фракциям" },
  priority: { money: "Экономить деньги", waste: "Меньше отходов", co2: "Меньше CO₂", health: "Здоровье", all: "Всё вместе" },
  mode: { car: "Автомобиль", public: "Общественный транспорт", ebike: "E-bike", bike: "Велосипед", walk: "Пешком", plane: "Самолёт" },
};

const state = {
  view: "welcome",
  tab: "home",
  access: "",
  refresh: "",
  user: null,
  board: null,
  footprint: null,
  tips: [],
  challenges: [],
  habits: null,
  category: "transport",
  reveal: null,
  shownScore: 0,
  chat: [],
  draft: defaultDraft(),
  step: 0,
  error: "",
  busy: false,
  confirmDelete: false,
};

function defaultDraft() {
  return {
    country: "DE",
    members: 2,
    housing: "apartment",
    modes: [],
    carKmPerWeek: 80,
    flightsPerYear: 1,
    diet: "meat_regular",
    shopping: "sometimes",
    wasteSorting: "some",
    waterLitersPerDay: 120,
    priority: "all",
    electricityKwhYear: "",
    heatingKwhYear: "",
  };
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}

function loadSession() {
  try {
    const saved = JSON.parse(sessionStorage.getItem("eco-sled-session") || "null");
    if (!saved?.accessToken) return;
    state.access = saved.accessToken;
    state.refresh = saved.refreshToken;
    state.user = saved.user;
  } catch {
    sessionStorage.removeItem("eco-sled-session");
  }
}

function saveSession(data) {
  state.access = data.accessToken;
  state.refresh = data.refreshToken;
  state.user = data.user;
  sessionStorage.setItem(
    "eco-sled-session",
    JSON.stringify({ accessToken: data.accessToken, refreshToken: data.refreshToken, user: data.user }),
  );
}

function plural(count, one, few, many) {
  const abs = Math.abs(count) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}

function draftFromProfile(profile) {
  return {
    ...defaultDraft(),
    ...profile,
    electricityKwhYear: profile.electricityKwhYear ?? "",
    heatingKwhYear: profile.heatingKwhYear ?? "",
  };
}

function clearSession() {
  state.access = "";
  state.refresh = "";
  state.user = null;
  state.board = null;
  state.footprint = null;
  state.tips = [];
  state.challenges = [];
  state.habits = null;
  state.chat = [];
  state.reveal = null;
  state.confirmDelete = false;
  state.draft = defaultDraft();
  state.step = 0;
  sessionStorage.removeItem("eco-sled-session");
}

async function api(path, options = {}, retry = true) {
  const headers = { "content-type": "application/json" };
  if (state.access) headers.authorization = `Bearer ${state.access}`;
  const response = await fetch(path, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  if (response.status === 401 && retry && state.refresh && !path.startsWith("/api/v1/auth/")) {
    const refreshed = await fetch("/api/v1/auth/refresh", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken: state.refresh }),
    });
    if (refreshed.ok) {
      saveSession(await refreshed.json());
      return api(path, options, false);
    }
    clearSession();
    state.view = "welcome";
    throw new Error("Сессия истекла. Войдите снова.");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Не получилось выполнить запрос");
  return data;
}

function ring(score, light = true) {
  const radius = 52;
  const length = 2 * Math.PI * radius;
  const offset = length * (1 - Math.max(0, Math.min(100, score)) / 100);
  const stroke = light ? "#9ddec0" : "#1c7a45";
  const track = light ? "rgba(255,255,255,.16)" : "#ece7dc";
  return `<svg class="mark" viewBox="0 0 120 120" aria-hidden="true">
    <circle cx="60" cy="60" r="${radius}" fill="none" stroke="${track}" stroke-width="10"></circle>
    <circle cx="60" cy="60" r="${radius}" fill="none" stroke="${stroke}" stroke-width="10" stroke-linecap="round"
      stroke-dasharray="${length.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}"
      transform="rotate(-90 60 60)"></circle>
  </svg>`;
}

function moneyLine(delta) {
  if (delta > 0) return { value: `−${delta} €`, note: "ниже типичных расходов" };
  if (delta < 0) return { value: `+${Math.abs(delta)} €`, note: "выше типичных расходов" };
  return { value: "0 €", note: "как типичные расходы" };
}

function co2Line(pct) {
  if (pct < 0) return { value: `−${Math.abs(pct)}%`, note: "CO₂ к типичному следу" };
  if (pct > 0) return { value: `+${pct}%`, note: "CO₂ к типичному следу" };
  return { value: "0%", note: "CO₂ как у типичного следа" };
}

function stars(count) {
  return `${"★".repeat(count)}${"☆".repeat(Math.max(0, 5 - count))}`;
}

function choice(key, value, text, pressed) {
  return `<button type="button" class="choice" data-action="pick" data-key="${key}" data-value="${esc(value)}" aria-pressed="${pressed}">${esc(text)}</button>`;
}

function captureDraft() {
  for (const input of document.querySelectorAll("[data-draft]")) {
    const key = input.dataset.draft;
    if (input.dataset.nullable && input.value === "") {
      state.draft[key] = "";
      continue;
    }
    state.draft[key] = input.dataset.number ? Number(input.value) : input.value;
  }
}

function payloadFromDraft() {
  const draft = state.draft;
  return {
    country: draft.country,
    members: Number(draft.members),
    housing: draft.housing,
    modes: draft.modes,
    carKmPerWeek: draft.modes.includes("car") ? Number(draft.carKmPerWeek) : 0,
    flightsPerYear: draft.modes.includes("plane") ? Number(draft.flightsPerYear) : 0,
    diet: draft.diet,
    shopping: draft.shopping,
    wasteSorting: draft.wasteSorting,
    waterLitersPerDay: Number(draft.waterLitersPerDay),
    priority: draft.priority,
    electricityKwhYear: draft.electricityKwhYear === "" ? null : Number(draft.electricityKwhYear),
    heatingKwhYear: draft.heatingKwhYear === "" ? null : Number(draft.heatingKwhYear),
  };
}

function errorBlock() {
  return state.error ? `<p class="error" role="alert">${esc(state.error)}</p>` : "";
}

function shell(body) {
  const tabs = [
    ["home", "Главная"],
    ["footprint", "След"],
    ["tips", "Советы"],
    ["goals", "Цели"],
    ["profile", "Профиль"],
  ];
  return `<div class="shell">
    <div class="content">${errorBlock()}${body}</div>
    <nav class="nav" aria-label="Разделы">
      ${tabs.map(([id, label]) => `<button type="button" data-action="tab" data-tab="${id}" aria-current="${state.tab === id ? "page" : "false"}">${label}</button>`).join("")}
    </nav>
  </div>`;
}

function viewWelcome() {
  return `<section class="hero">
    <p class="eyebrow">Эко-След</p>
    <h1>Понимай. Изменяй. Экономь.</h1>
    <p class="lede">Не абстрактный след, а один следующий шаг: что изменить, сколько CO₂ это затронет и сколько евро может остаться.</p>
    ${ring(72)}
    <div class="stack">
      <button class="btn" type="button" data-action="go-register">Рассчитать мой Score</button>
      <button class="btn secondary" type="button" data-action="go-login">Уже есть аккаунт</button>
      <button class="btn ghost" type="button" data-action="demo">Посмотреть пример</button>
      <button class="btn ghost" type="button" data-action="go-privacy">Как устроены данные</button>
    </div>
  </section>`;
}

function viewAuth() {
  const register = state.view === "register";
  return `<section class="auth">
    <button class="back" type="button" data-action="go-welcome">Назад</button>
    <p class="eyebrow">${register ? "Регистрация" : "Вход"}</p>
    <h1>${register ? "Две минуты до первого Score" : "С возвращением"}</h1>
    ${errorBlock()}
    <form id="auth-form">
      ${register ? `<label class="field">Имя<input name="name" type="text" autocomplete="name" required maxlength="80"></label>` : ""}
      <label class="field">Почта<input name="email" type="email" autocomplete="email" required></label>
      <label class="field">Пароль<input name="password" type="password" minlength="8" autocomplete="${register ? "new-password" : "current-password"}" required></label>
      ${register ? `<label class="check"><input name="consent" type="checkbox" required> Соглашаюсь хранить профиль, чтобы считать след, и знаю, что данные можно экспортировать или удалить.</label>` : ""}
      <div class="stack">
        <button class="btn" type="submit" ${state.busy ? "disabled" : ""}>${register ? "Продолжить" : "Войти"}</button>
      </div>
    </form>
  </section>`;
}

function viewPrivacy() {
  return `<section class="auth">
    <button class="back" type="button" data-action="go-welcome">Назад</button>
    <p class="eyebrow">Данные</p>
    <h1>Что хранит Эко-След</h1>
    <div class="list">
      <article class="card"><p>Аккаунт, ответы онбординга, оценки, привычки, челленджи и очки. Пароль хранится только как хеш.</p></article>
      <article class="card"><p>Сессия лежит в sessionStorage этого браузера, не в рекламной cookie.</p></article>
      <article class="card"><p>Экспорт и удаление — в профиле. Удаление стирает аккаунт и связанные записи.</p></article>
      <article class="card"><p>Eco Score версии eco-1.0.0 — оценка по открытым коэффициентам, не официальный углеродный отчёт и не юридическая консультация.</p></article>
    </div>
  </section>`;
}

function viewWizard() {
  const draft = state.draft;
  const steps = [
    `<h2>Где вы живёте?</h2><div class="choice-grid">${Object.entries(options.country).map(([key, text]) => choice("country", key, text, draft.country === key)).join("")}</div>`,
    `<h2>Сколько человек живёт вместе?</h2><div class="choice-grid two">${[1, 2, 3, 4, 5].map((count) => choice("members", String(count), count === 5 ? "5+" : String(count), Number(draft.members) === count)).join("")}</div>`,
    `<h2>Как вы передвигаетесь?</h2><p class="hint">Можно выбрать несколько.</p><div class="choice-grid">${Object.entries(options.mode).map(([key, text]) => choice("mode", key, text, draft.modes.includes(key))).join("")}</div>
      ${draft.modes.includes("car") ? `<label class="field">Километры на машине в неделю<span data-out="carKmPerWeek">${esc(draft.carKmPerWeek)}</span><input data-draft="carKmPerWeek" data-number type="range" min="0" max="500" value="${esc(draft.carKmPerWeek)}"></label>` : ""}
      ${draft.modes.includes("plane") ? `<label class="field">Перелётов в год<span data-out="flightsPerYear">${esc(draft.flightsPerYear)}</span><input data-draft="flightsPerYear" data-number type="range" min="1" max="12" value="${esc(draft.flightsPerYear)}"></label>` : ""}`,
    `<h2>Какое жильё?</h2><div class="choice-grid">${Object.entries(options.housing).map(([key, text]) => choice("housing", key, text, draft.housing === key)).join("")}</div>`,
    `<h2>Как обычно едите?</h2><div class="choice-grid">${Object.entries(options.diet).map(([key, text]) => choice("diet", key, text, draft.diet === key)).join("")}</div>`,
    `<h2>Покупки, отходы и то, что важнее</h2>
      <p class="hint">Покупки</p><div class="choice-grid two">${Object.entries(options.shopping).map(([key, text]) => choice("shopping", key, text, draft.shopping === key)).join("")}</div>
      <p class="hint">Сортировка</p><div class="choice-grid">${Object.entries(options.waste).map(([key, text]) => choice("wasteSorting", key, text, draft.wasteSorting === key)).join("")}</div>
      <label class="field">Вода, литров в день на человека<span data-out="waterLitersPerDay">${esc(draft.waterLitersPerDay)}</span><input data-draft="waterLitersPerDay" data-number type="range" min="50" max="220" value="${esc(draft.waterLitersPerDay)}"></label>
      <p class="hint">Что важнее</p><div class="choice-grid">${Object.entries(options.priority).map(([key, text]) => choice("priority", key, text, draft.priority === key)).join("")}</div>`,
  ];
  return `<section class="wizard">
    <p class="progress-note">Шаг ${state.step + 1} из ${steps.length}</p>
    ${errorBlock()}
    ${steps[state.step]}
    <div class="stack">
      <button class="btn" type="button" data-action="step-next" ${state.busy ? "disabled" : ""}>${state.step === steps.length - 1 ? "Посчитать Score" : "Дальше"}</button>
      ${state.step > 0 ? `<button class="btn ghost" type="button" data-action="step-back">Назад</button>` : `<button class="btn ghost" type="button" data-action="go-welcome">Выйти</button>`}
    </div>
  </section>`;
}

function viewReveal() {
  const score = state.reveal;
  if (!score) return viewWizard();
  const rows = Object.entries(categoryLabels)
    .map(([key, label]) => `<div class="cat"><span>${label}</span><b>${score.categories[key].score}</b><span class="bar" style="grid-column: 1 / -1"><span style="width:${score.categories[key].score}%"></span></span></div>`)
    .join("");
  return `<section class="reveal">
    <p class="eyebrow">Твой Eco Score</p>
    <div class="score-num">${state.shownScore}</div>
    <h2>${esc(score.label)}</h2>
    <p class="lede">Уверенность ${Math.round(score.confidence * 100)}%. Сравнение — с типичными привычками в таком же жилье, версия ${esc(score.version)}.</p>
    <div class="card">${rows}</div>
    <div class="stack">
      <button class="btn" type="button" data-action="enter-app">Что изменить?</button>
    </div>
  </section>`;
}

function viewHome() {
  const board = state.board;
  if (!board) return `<p>Считаем…</p>`;
  const money = moneyLine(board.score.moneyDeltaEurMonth);
  const co2 = co2Line(board.score.co2DeltaPct);
  const today = board.today;
  return shell(`<div class="topbar">
      <div><p class="eyebrow">${esc(board.greeting)}</p><h1>${esc(board.name)}</h1></div>
      <div class="pill">${board.points} очков</div>
    </div>
    <article class="card score-card">
      <div class="score-row">${ring(board.score.score)}<div><p class="eyebrow">Eco Score</p><div class="score-num">${board.score.score}</div><p class="score-meta">${esc(board.score.label)}</p></div></div>
      <p class="score-meta">${board.scoreChange ? `Изменение к прошлой оценке: ${board.scoreChange > 0 ? "+" : ""}${board.scoreChange}` : "Первая сохранённая оценка уже в истории."}</p>
      <div class="deltas">
        <div class="delta"><strong>${co2.value}</strong><span>${co2.note}</span></div>
        <div class="delta"><strong>${money.value}</strong><span>${money.note}</span></div>
      </div>
    </article>
    <p class="section-title">Что сделать сегодня</p>
    <article class="card">
      ${today ? `<p class="stars" aria-label="Сложность ${today.difficulty} из 5">${stars(today.difficulty)}</p><h2 class="today-title">${esc(today.title)}</h2><p class="muted">${esc(today.description)}</p><p><strong>около ${today.savingsEurMonth} € и ${today.co2KgMonth} кг CO₂ / мес</strong></p><button class="btn" type="button" data-action="complete-rec" data-id="${esc(today.id)}">Выполнить</button>` : `<p>На сегодня шаги отмечены. Загляните в цели — серия любит повтор.</p>`}
      <p class="muted small">Серия: ${board.streak} ${plural(board.streak, "день", "дня", "дней")}</p>
    </article>
    <p class="section-title">Категории</p>
    <article class="card">${board.categories.map((item) => `<button class="cat" type="button" data-action="open-category" data-category="${item.key}"><span>${esc(item.label)}</span><b>${item.score}</b><span class="bar" style="grid-column:1 / -1"><span style="width:${item.score}%"></span></span></button>`).join("")}</article>`);
}

function viewFootprint() {
  const data = state.footprint;
  if (!data?.score) return shell(`<p>Сначала нужен расчёт.</p>`);
  return shell(`<p class="eyebrow">Мой след</p><h1>${data.score.score} / 100</h1>
    <p class="lede">${data.score.co2KgYear} кг CO₂ в год на домохозяйство. ${esc(moneyLine(data.score.moneyDeltaEurMonth).value)} ${moneyLine(data.score.moneyDeltaEurMonth).note}.</p>
    <div class="list">${Object.entries(categoryLabels).map(([key, label]) => `<button class="card cat" type="button" data-action="open-category" data-category="${key}"><span>${label}</span><b>${data.score.categories[key].score}</b></button>`).join("")}</div>
    <p class="section-title">Журнал</p>
    <p class="muted small">Журнал помнит факты и не меняет Score. Чтобы пересчитать, откройте категорию и сохраните привычки.</p>
    <form id="entry-form" class="card">
      <label class="field">Категория<select name="category">${Object.entries(categoryLabels).map(([key, label]) => `<option value="${key}">${label}</option>`).join("")}</select></label>
      <label class="field">Что случилось<input name="subcategory" required maxlength="40" placeholder="Например, поездка"></label>
      <label class="field">Сколько<input name="value" type="number" min="0" step="0.1" required></label>
      <label class="field">Единица<input name="unit" required maxlength="16" placeholder="км"></label>
      <button class="btn" type="submit">Добавить в журнал</button>
    </form>
    <div class="list" style="margin-top:12px">${(data.entries || []).map((entry) => `<article class="card"><strong>${esc(categoryLabels[entry.category] || entry.category)}</strong><p>${esc(entry.subcategory)} · ${esc(entry.value)} ${esc(entry.unit)}</p><button class="btn ghost" type="button" data-action="delete-entry" data-id="${esc(entry.id)}">Удалить</button></article>`).join("") || `<p class="muted">Пока пусто.</p>`}</div>`);
}

function viewCategory() {
  const data = state.footprint;
  const key = state.category;
  const impact = data?.score?.categories?.[key];
  const profile = data?.profile;
  if (!impact || !profile) return shell(`<p>Нет данных категории.</p>`);
  const editor = categoryEditor(key);
  return shell(`<button class="back" type="button" data-action="tab" data-tab="footprint">К следу</button>
    <p class="eyebrow">${categoryLabels[key]}</p>
    <h1>${impact.score}</h1>
    <p class="lede">${impact.co2KgYear} кг CO₂ в год · ${impact.costEurMonth} € в месяц по этой категории.</p>
    <article class="card">${impact.assumptions.map((line) => `<p class="small">${esc(line)}</p>`).join("")}</article>
    <p class="section-title">Уточнить привычку</p>
    <form id="category-form" class="card">${editor}<button class="btn" type="submit">Пересчитать</button></form>`);
}

function categoryEditor(key) {
  const draft = state.draft;
  if (key === "transport") {
    return `<div class="choice-grid">${Object.entries(options.mode).map(([mode, text]) => choice("mode", mode, text, draft.modes.includes(mode))).join("")}</div>
      <label class="field">Км на машине в неделю<input data-draft="carKmPerWeek" data-number type="number" min="0" max="2000" value="${esc(draft.carKmPerWeek)}"></label>
      <label class="field">Перелётов в год<input data-draft="flightsPerYear" data-number type="number" min="0" max="52" value="${esc(draft.flightsPerYear)}"></label>`;
  }
  if (key === "energy") {
    const heat = state.footprint.score.categories.energy.details.heatingKwhYear;
    const elec = state.footprint.score.categories.energy.details.electricityKwhYear;
    return `<label class="field">Электричество, кВт⋅ч/год<input data-draft="electricityKwhYear" data-nullable data-number type="number" min="0" placeholder="${esc(elec)}" value="${esc(draft.electricityKwhYear)}"></label>
      <p class="hint">Пусто — оставить оценку ${esc(elec)} кВт⋅ч.</p>
      <label class="field">Отопление, кВт⋅ч/год<input data-draft="heatingKwhYear" data-nullable data-number type="number" min="0" placeholder="${esc(heat)}" value="${esc(draft.heatingKwhYear)}"></label>`;
  }
  if (key === "food") return `<div class="choice-grid">${Object.entries(options.diet).map(([value, text]) => choice("diet", value, text, draft.diet === value)).join("")}</div>`;
  if (key === "shopping") return `<div class="choice-grid">${Object.entries(options.shopping).map(([value, text]) => choice("shopping", value, text, draft.shopping === value)).join("")}</div>`;
  if (key === "waste") return `<div class="choice-grid">${Object.entries(options.waste).map(([value, text]) => choice("wasteSorting", value, text, draft.wasteSorting === value)).join("")}</div>`;
  return `<label class="field">Литров в день на человека<span data-out="waterLitersPerDay">${esc(draft.waterLitersPerDay)}</span><input data-draft="waterLitersPerDay" data-number type="range" min="50" max="250" value="${esc(draft.waterLitersPerDay)}"></label>`;
}

function viewTips() {
  const open = state.tips.filter((item) => item.status !== "completed");
  const done = state.tips.filter((item) => item.status === "completed");
  const hero = open[0];
  return shell(`<p class="eyebrow">Советы</p><h1>Один главный шаг</h1>
    ${hero ? `<article class="card"><p class="stars">${stars(hero.difficulty)}</p><h2>${esc(hero.title)}</h2><p>${esc(hero.description)}</p><p><strong>${hero.savingsEurMonth} € / мес · ${hero.co2KgMonth} кг CO₂ / мес · +${hero.points} очков</strong></p>
      <div class="row-actions">${hero.status === "suggested" ? `<button class="btn secondary" type="button" data-action="start-rec" data-id="${esc(hero.id)}">Попробовать</button>` : ""}<button class="btn" type="button" data-action="complete-rec" data-id="${esc(hero.id)}">Отметить выполненным</button></div></article>` : `<article class="card"><p>Открытых советов нет. Обновите привычки — список соберётся заново.</p></article>`}
    <div class="list" style="margin-top:12px">${open.slice(1).map(tipCard).join("")}</div>
    ${done.length ? `<p class="section-title">Уже сделано</p><div class="list">${done.map(tipCard).join("")}</div>` : ""}
    <p class="section-title">Спросить расчёт</p>
    <button class="btn secondary" type="button" data-action="open-assistant">Открыть помощника</button>`);
}

function tipCard(item) {
  return `<article class="card"><h2>${esc(item.title)}</h2><p class="small muted">${esc(item.categoryLabel)} · ${item.savingsEurMonth} € · ${item.co2KgMonth} кг</p>${item.status !== "completed" ? `<button class="btn" type="button" data-action="complete-rec" data-id="${esc(item.id)}">Сделано</button>` : `<p class="muted small">Готово</p>`}</article>`;
}

function viewGoals() {
  const habits = state.habits?.habits ?? [];
  const presets = state.habits?.presets ?? [];
  return shell(`<p class="eyebrow">Цели</p><h1>Челленджи и привычки</h1>
    <div class="list">${state.challenges.map((item) => `<article class="card"><h2>${esc(item.title)}</h2><p>${esc(item.description)}</p><div class="bar"><span style="width:${Math.min(100, (item.progress / item.durationDays) * 100)}%"></span></div><p class="small">${item.progress}/${item.durationDays} · +${item.rewardPoints} очков · около ${item.savingsEur} €</p>
      ${item.status === "completed" ? `<p>Пройден</p>` : item.joined ? `<button class="btn" type="button" data-action="checkin" data-id="${esc(item.id)}" ${item.lastCheckin === new Date().toISOString().slice(0, 10) ? "disabled" : ""}>Отметить сегодня</button>` : `<button class="btn secondary" type="button" data-action="join" data-id="${esc(item.id)}">Участвовать</button>`}
    </article>`).join("")}</div>
    <p class="section-title">Привычки</p>
    <div class="chips">${presets.map((preset) => `<button class="chip" type="button" data-action="add-habit" data-preset="${esc(preset.code)}">${esc(preset.name)}</button>`).join("")}</div>
    <div class="list" style="margin-top:12px">${habits.map((habit) => `<article class="card"><h2>${esc(habit.name)}</h2><p class="small">Серия ${habit.streak}</p><button class="btn" type="button" data-action="checkin-habit" data-id="${esc(habit.id)}" ${habit.checkedInToday ? "disabled" : ""}>${habit.checkedInToday ? "Сегодня уже есть" : "Отметить"}</button></article>`).join("") || `<p class="muted">Добавьте привычку кнопкой выше.</p>`}</div>`);
}

function viewAssistant() {
  return shell(`<button class="back" type="button" data-action="tab" data-tab="tips">К советам</button>
    <p class="eyebrow">Помощник</p><h1>Только ваши цифры</h1>
    <div class="chips">
      <button class="chip" type="button" data-action="ask" data-text="Как уменьшить мой след?">Как уменьшить след?</button>
      <button class="chip" type="button" data-action="ask" data-text="Как уменьшить расходы на отопление?">Расходы на отопление</button>
      <button class="chip" type="button" data-action="ask" data-text="Сколько я могу сэкономить?">Сколько €?</button>
    </div>
    <div class="chat-log" style="margin-top:14px">${state.chat.map((item) => `<div class="bubble ${item.role}">${esc(item.text).replaceAll("\n\n", "<br><br>")}</div>`).join("")}</div>
    <form id="chat-form" class="composer"><input name="message" maxlength="500" placeholder="Свой вопрос" required><button class="btn" type="submit">Спросить</button></form>`);
}

function viewProfile() {
  const user = state.user;
  if (!user?.achievements) return shell(`<p>Открываем профиль…</p>`);
  return shell(`<p class="eyebrow">Профиль</p><h1>${esc(user.name)}</h1>
    <article class="card"><p>Уровень ${user.level}</p><div class="bar"><span style="width:${Math.round(user.levelProgress * 100)}%"></span></div><p>${user.points} очков · серия ${user.streak} · отмеченная экономия ${user.actionSavingsEur} €</p></article>
    <p class="section-title">Достижения</p>
    <div class="achievements">${user.achievements.map((item) => `<article class="card achievement" data-locked="${item.unlockedAt ? "false" : "true"}"><span aria-hidden="true">${esc(item.icon)}</span><div><strong>${esc(item.name)}</strong><p class="small muted">${esc(item.description)}</p></div></article>`).join("")}</div>
    <p class="section-title">Данные</p>
    <div class="stack">
      <button class="btn secondary" type="button" data-action="export">Экспортировать данные</button>
      ${state.confirmDelete ? `<button class="btn danger" type="button" data-action="delete-confirm">Да, удалить аккаунт</button>` : `<button class="btn danger" type="button" data-action="delete-ask">Удалить аккаунт</button>`}
      <button class="btn ghost" type="button" data-action="logout">Выйти</button>
    </div>
    <p class="small muted">Расчёт eco-1.0.0. Это оценка, не сертификат.</p>`);
}

function render() {
  const views = {
    welcome: viewWelcome,
    register: viewAuth,
    login: viewAuth,
    privacy: viewPrivacy,
    wizard: viewWizard,
    reveal: viewReveal,
    home: viewHome,
    footprint: viewFootprint,
    category: viewCategory,
    tips: viewTips,
    goals: viewGoals,
    assistant: viewAssistant,
    profile: viewProfile,
  };
  app.innerHTML = (views[state.view] || viewWelcome)();
  app.toggleAttribute("aria-busy", state.busy);
}

async function run(work) {
  state.error = "";
  state.busy = true;
  render();
  try {
    await work();
  } catch (error) {
    state.error = error.message || "Не получилось";
  } finally {
    state.busy = false;
    render();
  }
}

async function showHome() {
  state.board = await api("/api/v1/dashboard");
  state.view = "home";
  state.tab = "home";
}

function animateScore(target) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    state.shownScore = target;
    render();
    return;
  }
  const started = performance.now();
  const tick = (now) => {
    const progress = Math.min(1, (now - started) / 700);
    state.shownScore = Math.round(target * (1 - (1 - progress) ** 3));
    if (state.view === "reveal") render();
    if (progress < 1 && state.view === "reveal") requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

async function submitAuth(form) {
  const register = state.view === "register";
  const body = {
    email: form.email.value,
    password: form.password.value,
  };
  if (register) {
    body.name = form.name.value;
    body.consent = form.consent.checked;
    if (!body.consent) throw new Error("Нужно согласие на хранение профиля.");
  }
  const data = await api(register ? "/api/v1/auth/register" : "/api/v1/auth/login", { method: "POST", body });
  saveSession(data);
  if (data.user.onboardingCompleted) await showHome();
  else {
    state.draft = defaultDraft();
    state.step = 0;
    state.view = "wizard";
  }
}

async function finishWizard() {
  const result = await api("/api/v1/onboarding", { method: "POST", body: payloadFromDraft() });
  state.reveal = result.score;
  state.user = { ...state.user, onboardingCompleted: true };
  state.view = "reveal";
  state.shownScore = 0;
  render();
  animateScore(result.score.score);
}

async function openTab(tab) {
  state.tab = tab;
  state.view = tab;
  if (tab === "home") state.board = await api("/api/v1/dashboard");
  if (tab === "footprint") state.footprint = await api("/api/v1/footprint");
  if (tab === "tips") state.tips = await api("/api/v1/recommendations");
  if (tab === "goals") {
    state.challenges = await api("/api/v1/challenges");
    state.habits = await api("/api/v1/habits");
  }
  if (tab === "profile") state.user = await api("/api/v1/user");
}

document.body.addEventListener("click", (event) => {
  const target = event.target.closest("[data-action]");
  if (!target || state.busy) return;
  captureDraft();
  const action = target.dataset.action;
  if (action === "go-welcome") state.view = "welcome";
  else if (action === "go-register") {
    state.error = "";
    state.view = state.access && state.user && !state.user.onboardingCompleted ? "wizard" : "register";
  }
  else if (action === "go-login") state.view = "login";
  else if (action === "go-privacy") state.view = "privacy";
  else   if (action === "pick") {
    const key = target.dataset.key;
    if (key === "mode") {
      const modes = new Set(state.draft.modes);
      if (modes.has(target.dataset.value)) modes.delete(target.dataset.value);
      else modes.add(target.dataset.value);
      state.draft.modes = [...modes];
    } else {
      state.draft[key] = key === "members" ? Number(target.dataset.value) : target.dataset.value;
    }
  } else if (action === "step-back") state.step = Math.max(0, state.step - 1);
  else if (action === "step-next") {
    if (state.step === 2 && state.draft.modes.length === 0) {
      state.error = "Выберите хотя бы один способ передвижения.";
      render();
      return;
    }
    state.error = "";
    if (state.step < 5) state.step += 1;
    else {
      run(finishWizard);
      return;
    }
  } else if (action === "demo") {
    run(async () => {
      const data = await api("/api/v1/auth/demo", { method: "POST" });
      saveSession(data);
      await showHome();
    });
    return;
  } else if (action === "enter-app") {
    run(showHome);
    return;
  } else if (action === "tab") {
    run(() => openTab(target.dataset.tab));
    return;
  } else if (action === "open-category") {
    run(async () => {
      state.footprint = await api("/api/v1/footprint");
      state.draft = draftFromProfile(state.footprint.profile);
      state.category = target.dataset.category;
      state.view = "category";
      state.tab = "footprint";
    });
    return;
  } else if (action === "complete-rec") {
    run(async () => {
      await api(`/api/v1/recommendations/${target.dataset.id}/complete`, { method: "POST" });
      if (state.view === "tips") state.tips = await api("/api/v1/recommendations");
      if (state.view === "home" || state.tab === "home") await showHome();
    });
    return;
  } else if (action === "start-rec") {
    run(async () => {
      await api(`/api/v1/recommendations/${target.dataset.id}/start`, { method: "POST" });
      state.tips = await api("/api/v1/recommendations");
    });
    return;
  } else if (action === "join") {
    run(async () => {
      await api(`/api/v1/challenges/${target.dataset.id}/join`, { method: "POST" });
      state.challenges = await api("/api/v1/challenges");
    });
    return;
  } else if (action === "checkin") {
    run(async () => {
      await api(`/api/v1/challenges/${target.dataset.id}/checkin`, { method: "POST" });
      state.challenges = await api("/api/v1/challenges");
    });
    return;
  } else if (action === "add-habit") {
    run(async () => {
      state.habits = await api("/api/v1/habits", { method: "POST", body: { preset: target.dataset.preset } });
    });
    return;
  } else if (action === "checkin-habit") {
    run(async () => {
      state.habits = await api(`/api/v1/habits/${target.dataset.id}/checkin`, { method: "POST" });
    });
    return;
  } else if (action === "delete-entry") {
    run(async () => {
      state.footprint = await api(`/api/v1/footprint/${target.dataset.id}`, { method: "DELETE" });
    });
    return;
  } else if (action === "open-assistant") {
    state.view = "assistant";
    state.tab = "tips";
    if (state.chat.length === 0) {
      state.chat.push({ role: "assistant", text: "Спросите про след, деньги или отопление. Я отвечу цифрами из вашего расчёта и не придумаю новые." });
    }
  } else if (action === "ask") {
    run(() => ask(target.dataset.text));
    return;
  } else if (action === "export") {
    run(async () => {
      const data = await api("/api/v1/user/export");
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "eco-sled-export.json";
      link.click();
      URL.revokeObjectURL(url);
    });
    return;
  } else if (action === "delete-ask") state.confirmDelete = true;
  else if (action === "delete-confirm") {
    run(async () => {
      await api("/api/v1/user", { method: "DELETE" });
      clearSession();
      state.confirmDelete = false;
      state.view = "welcome";
    });
    return;
  } else if (action === "logout") {
    run(async () => {
      if (state.refresh) await api("/api/v1/auth/logout", { method: "POST", body: { refreshToken: state.refresh } });
      clearSession();
      state.view = "welcome";
    });
    return;
  }
  render();
});

document.body.addEventListener("input", (event) => {
  const input = event.target.closest("[data-draft]");
  if (!input) return;
  const out = document.querySelector(`[data-out="${input.dataset.draft}"]`);
  if (out) out.textContent = input.value;
});

document.body.addEventListener("submit", (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  event.preventDefault();
  captureDraft();
  if (form.id === "auth-form") {
    run(() => submitAuth(form));
    return;
  }
  if (form.id === "entry-form") {
    const body = {
      category: form.category.value,
      subcategory: form.subcategory.value,
      value: Number(form.value.value),
      unit: form.unit.value,
    };
    run(async () => {
      state.footprint = await api("/api/v1/footprint", { method: "POST", body });
    });
    return;
  }
  if (form.id === "category-form") {
    run(async () => {
      const body = payloadFromDraft();
      await api("/api/v1/footprint/profile", { method: "PUT", body });
      state.footprint = await api("/api/v1/footprint");
      state.draft = draftFromProfile(state.footprint.profile);
      state.board = await api("/api/v1/dashboard");
    });
    return;
  }
  if (form.id === "chat-form") {
    const message = form.message.value.trim();
    form.reset();
    run(() => ask(message));
  }
});

async function ask(message) {
  state.chat.push({ role: "user", text: message });
  const result = await api("/api/v1/ai/chat", { method: "POST", body: { message } });
  state.chat.push({ role: "assistant", text: result.reply });
  state.view = "assistant";
}

loadSession();
render();
if (state.access) {
  run(async () => {
    state.user = await api("/api/v1/user");
    if (state.user.onboardingCompleted) await showHome();
    else state.view = "wizard";
  });
}
