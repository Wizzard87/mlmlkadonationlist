(() => {
  const apiBase = String(window.ORDER_API_BASE_URL || "").trim().replace(/\/+$/, "");
  const tokenKey = "mlmlka.admin.token";
  const expiryKey = "mlmlka.admin.expiry";
  const $ = (id) => document.getElementById(id);
  let busy = false;
  let selected = new Set();
  let refreshTimer;

  function banner(message) {
    const node = $("banner");
    node.textContent = message;
    node.hidden = !message;
  }

  function showSession(user) {
    $("signedOut").hidden = true;
    $("workspace").hidden = false;
    $("login").hidden = true;
    $("logout").hidden = false;
    $("accountName").textContent = user?.username ? `Discord: ${user.username}` : "";
    $("connection").textContent = "Подключено";
    $("connection").classList.add("online");
    if (refreshTimer) clearInterval(refreshTimer);
    refresh();
    refreshTimer = setInterval(refresh, 15000);
  }

  function showSignedOut() {
    sessionStorage.removeItem(tokenKey);
    sessionStorage.removeItem(expiryKey);
    $("workspace").hidden = true;
    $("signedOut").hidden = false;
    $("login").hidden = false;
    $("logout").hidden = true;
    $("accountName").textContent = "";
    $("connection").textContent = "Не подключено";
    $("connection").classList.remove("online");
    if (refreshTimer) clearInterval(refreshTimer);
  }

  function authErrorMessage(code) {
    return ({
      not_admin: "Этот Discord-аккаунт не входит в список администраторов.",
      discord_denied: "Вход через Discord отменён.",
      invalid_state: "Не прошла проверка безопасности входа. Начните вход заново.",
      server_not_configured: "Вход через Discord ещё не настроен на сервере.",
      discord_error: "Discord не завершил вход. Попробуйте ещё раз.",
      configuration: "Укажите HTTPS-адрес API в файле config.js."
    })[code] || "Не удалось выполнить вход.";
  }

  async function api(path, options = {}) {
    if (!apiBase) throw new Error(authErrorMessage("configuration"));
    const token = sessionStorage.getItem(tokenKey);
    const headers = new Headers(options.headers || {});
    if (token) headers.set("Authorization", `Bearer ${token}`);
    if (options.body !== undefined) headers.set("Content-Type", "application/json");
    let response;
    try {
      response = await fetch(`${apiBase}/api/${path}`, { ...options, headers, mode: "cors", cache: "no-store" });
    } catch {
      throw new Error("Не удалось связаться с API. Проверьте HTTPS-сертификат сервера и настройки CORS для GitHub Pages.");
    }
    if (response.status === 401) {
      showSignedOut();
      throw new Error("Сессия истекла. Войдите через Discord ещё раз.");
    }
    if (!response.ok) {
      let detail = "";
      try { detail = (await response.json()).error || ""; } catch { /* no JSON body */ }
      throw new Error(detail || `Ошибка API (${response.status}).`);
    }
    if (response.status === 204) return null;
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  function setSelectedCount() {
    $("selectedCount").textContent = `Выбрано: ${selected.size}`;
    $("deleteSelected").disabled = selected.size === 0;
  }

  async function refresh() {
    if (busy || !sessionStorage.getItem(tokenKey)) return;
    busy = true;
    try {
      const [orders, status, donations] = await Promise.all([
        api("orders"), api("status"), api("donations")
      ]);
      renderOrders(orders || []);
      renderDonations(donations || []);
      renderProviders(status || {});
      $("orderCount").textContent = orders.length;
      $("reviewCount").textContent = donations.filter(x => x.state === "review" || x.state === "error").length;
      $("updatedAt").textContent = new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
      banner("");
    } catch (error) {
      if (sessionStorage.getItem(tokenKey)) banner(error.message || "Не удалось загрузить данные.");
    } finally {
      busy = false;
    }
  }

  function sourceLabel(provider) {
    if (provider === "DonationAlerts") return { label: "А", cls: "" };
    if (provider === "DonatePay") return { label: "П", cls: "pay" };
    return { label: "—", cls: "" };
  }

  function renderOrders(orders) {
    const body = $("ordersBody");
    body.replaceChildren();
    const ids = new Set(orders.map(order => String(order.id)));
    selected = new Set([...selected].filter(id => ids.has(id)));
    for (const order of orders) {
      const id = String(order.id);
      const row = document.createElement("tr");
      const selectCell = document.createElement("td");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = selected.has(id);
      checkbox.setAttribute("aria-label", `Выбрать заказ ${id}`);
      checkbox.onchange = () => { checkbox.checked ? selected.add(id) : selected.delete(id); setSelectedCount(); };
      selectCell.append(checkbox);
      const sourceCell = document.createElement("td");
      const badge = document.createElement("span");
      const src = sourceLabel(order.provider);
      badge.className = `source-badge ${src.cls}`;
      badge.textContent = src.label;
      badge.title = order.provider || "Добавлен вручную";
      sourceCell.append(badge);
      const nameCell = document.createElement("td");
      nameCell.className = "order-name";
      nameCell.textContent = order.aircraftName;
      const actionCell = document.createElement("td");
      const remove = document.createElement("button");
      remove.className = "row-delete";
      remove.textContent = "Удалить";
      remove.onclick = () => runAction(async () => {
        if (!confirm(`Удалить заказ «${order.aircraftName}»?`)) return;
        await api(`orders/${encodeURIComponent(id)}`, { method: "DELETE" });
        selected.delete(id);
        await refresh();
      });
      actionCell.append(remove);
      row.append(selectCell, sourceCell, nameCell, actionCell);
      body.append(row);
    }
    $("emptyOrders").hidden = orders.length > 0;
    $("selectAll").checked = orders.length > 0 && selected.size === orders.length;
    setSelectedCount();
  }

  function stateText(state) {
    return ({ pending: "Ожидает распознавания", error: "Ошибка — будет повтор", review: "Нужна проверка", added: "Заказ добавлен", ignored: "Не заказ" })[state] || state;
  }

  function renderDonations(donations) {
    const list = $("donationsList");
    list.replaceChildren();
    if (!donations.length) {
      const empty = document.createElement("div"); empty.className = "empty"; empty.textContent = "В журнале пока нет донатов."; list.append(empty); return;
    }
    for (const item of donations) {
      const block = document.createElement("article"); block.className = "donation";
      const head = document.createElement("div"); head.className = "donation-head";
      const src = sourceLabel(item.provider); const badge = document.createElement("span"); badge.className = `source-badge ${src.cls}`; badge.textContent = src.label;
      const name = document.createElement("span"); name.textContent = `${item.provider} #${item.id}`;
      const state = document.createElement("span"); state.className = "donation-meta"; state.textContent = `· ${stateText(item.state)} · попыток: ${item.attempts}`;
      head.append(badge, name, state);
      const message = document.createElement("div"); message.className = "donation-message"; message.textContent = item.message;
      block.append(head, message);
      if (item.reason) { const reason = document.createElement("div"); reason.className = "donation-reason"; reason.textContent = item.reason; block.append(reason); }
      if (["error", "review"].includes(item.state)) {
        const actions = document.createElement("div"); actions.className = "donation-actions";
        const retry = document.createElement("button"); retry.className = "quiet"; retry.textContent = "Повторить распознавание";
        retry.onclick = () => runAction(async () => { await api(`donations/${encodeURIComponent(item.provider)}/${item.id}/retry`, { method: "POST" }); await refresh(); });
        actions.append(retry);
        if (item.state === "review") {
          const accept = document.createElement("button"); accept.className = "primary"; accept.textContent = "Добавить заказ";
          accept.onclick = () => runAction(async () => {
            const aircraft = prompt("Самолёт / текст заказа", item.aircraft || item.message);
            if (!aircraft?.trim()) return;
            await api(`donations/${encodeURIComponent(item.provider)}/${item.id}/accept`, { method: "POST", body: JSON.stringify(aircraft.trim()) });
            await refresh();
          });
          actions.append(accept);
        }
        block.append(actions);
      }
      list.append(block);
    }
  }

  function renderProviders(status) {
    const root = $("providers"); root.replaceChildren();
    for (const [name, info] of Object.entries(status)) {
      const card = document.createElement("div"); card.className = "provider";
      const title = document.createElement("b"); title.textContent = name;
      const detail = document.createElement("span");
      const state = ({ connected: "Подключён", disabled: "Выключен", error: "Ошибка", waiting: "Ожидает донат" })[info.state] || info.state || "Состояние неизвестно";
      detail.textContent = info.error ? `${state} — ${info.error}` : state;
      card.append(title, detail); root.append(card);
    }
    if (!root.children.length) root.textContent = "Нет данных о провайдерах.";
  }

  async function runAction(action) {
    try { banner(""); await action(); }
    catch (error) { banner(error.message || "Операция не выполнена."); }
  }

  async function signIn() {
    if (!apiBase) { banner(authErrorMessage("configuration")); return; }
    window.location.assign(`${apiBase}/api/auth/discord/login`);
  }

  async function start() {
    $("login").onclick = signIn;
    $("loginWelcome").onclick = signIn;
    $("refresh").onclick = refresh;
    document.querySelectorAll(".tab").forEach(button => button.onclick = () => {
      document.querySelectorAll(".tab").forEach(item => item.classList.toggle("active", item === button));
      document.querySelectorAll(".panel").forEach(panel => panel.hidden = panel.id !== button.dataset.panel);
    });
    $("addForm").onsubmit = event => runAction(async () => {
      event.preventDefault();
      const input = $("orderInput"); const value = input.value.trim(); if (!value) return;
      await api("orders", { method: "POST", body: JSON.stringify(value) }); input.value = ""; await refresh();
    });
    $("selectAll").onchange = () => {
      document.querySelectorAll("#ordersBody input[type=checkbox]").forEach(box => { box.checked = $("selectAll").checked; box.onchange(); });
    };
    $("deleteSelected").onclick = () => runAction(async () => {
      const ids = [...selected];
      if (!ids.length || !confirm(`Удалить выбранные заказы (${ids.length})?`)) return;
      const results = await Promise.allSettled(ids.map(id => api(`orders/${encodeURIComponent(id)}`, { method: "DELETE" })));
      const failed = results.filter(item => item.status === "rejected").length;
      selected.clear(); await refresh();
      if (failed) banner(`Удалено не всё: ошибок ${failed} из ${ids.length}.`);
    });
    $("logout").onclick = () => runAction(async () => {
      try { await api("auth/discord/logout", { method: "POST" }); } finally { showSignedOut(); banner("Вы вышли из аккаунта."); }
    });

    const params = new URLSearchParams(location.search);
    const ticket = params.get("ticket"); const error = params.get("auth_error");
    if (ticket || error) history.replaceState(null, "", location.pathname + location.hash);
    if (error) banner(authErrorMessage(error));
    if (ticket) {
      try {
        const result = await api("auth/discord/exchange", { method: "POST", body: JSON.stringify({ ticket }) });
        sessionStorage.setItem(tokenKey, result.token);
        sessionStorage.setItem(expiryKey, result.expiresAt);
        showSession(result.user);
      } catch (e) { showSignedOut(); banner(e.message || "Не удалось завершить вход."); }
      return;
    }

    const token = sessionStorage.getItem(tokenKey);
    const expiresAt = Date.parse(sessionStorage.getItem(expiryKey) || "");
    if (!token || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) { showSignedOut(); return; }
    try {
      const profile = await api("auth/discord/me");
      showSession(profile.user);
    } catch (e) { showSignedOut(); if (e.message) banner(e.message); }
  }

  start();
})();
