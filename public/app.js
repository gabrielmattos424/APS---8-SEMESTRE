"use strict";
(function () {
  // ---------- constantes ----------
  const SEV = {
    low: { label: "Baixa", symbol: "1", color: "var(--low)", radius: 80 },
    moderate: { label: "Moderada", symbol: "2", color: "var(--mod)", radius: 130 },
    high: { label: "Alta", symbol: "3", color: "var(--high)", radius: 190 },
    critical: { label: "Crítica", symbol: "!", color: "var(--crit)", radius: 260 },
  };
  const STA = { reported: "Relato recebido", monitoring: "Em acompanhamento", resolved: "Água baixou" };
  const STA_ORDER = ["reported", "monitoring", "resolved"];
  const SP = [-23.5505, -46.6333];
  const K = { outbox: "alagaviz.outbox.v1", auth: "alagaviz.auth.v1", admin: "alagaviz.admin.v1", view: "alagaviz.view.v1" };
  const MAX_OUTBOX = 100, POLL_MS = 45000;

  const $ = (id) => document.getElementById(id);
  const el = { q: $("q"), net: $("net"), banner: $("banner"), list: $("list"), count: $("count"), panel: $("panel"), sheet: $("sheet"),
    fsev: $("fsev"), fsta: $("fsta"), fab: $("fab"), dlg: $("dlg"), form: $("form"), locsum: $("locsum"), lat: $("lat"), lng: $("lng"),
    title: $("title"), desc: $("desc"), nbh: $("nbh"), addr: $("addr"), err: $("err"), send: $("send"), detail: $("detail"),
    pickbar: $("pickbar"), toast: $("toast"), install: $("install"), formTitle: $("formTitle"), mod: $("mod"),
    account: $("account"), authDlg: $("authDlg"), authForm: $("authForm"), authTitle: $("authTitle"), authMsg: $("authMsg"),
    nameRow: $("nameRow"), aname: $("aname"), aemail: $("aemail"), apass: $("apass"), authErr: $("authErr"), authSend: $("authSend"), authSwitch: $("authSwitch") };

  // ---------- armazenamento local (tolerante a falhas) ----------
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); return true; } catch { return false; } };
  const lsJSON = (k, d) => { try { const v = JSON.parse(lsGet(k)); return v ?? d; } catch { return d; } };

  // ---------- estado ----------
  let server = [], isDemo = false, serverOk = true, selectedId = null, pick = null, syncing = false, editing = null, firstLoad = true;
  let outbox = lsJSON(K.outbox, []); if (!Array.isArray(outbox)) outbox = [];
  let auth = lsJSON(K.auth, null); if (!auth || !auth.token || !auth.user) auth = null; // { token, user: { id, name, email } }
  let adminKey = lsGet(K.admin) || "";
  let memoryOnly = false;
  const saveOutbox = () => { memoryOnly = !lsSet(K.outbox, JSON.stringify(outbox)); };
  const isMine = (r) => !!auth && r.userId === auth.user.id;
  const rnd = () => (crypto.randomUUID ? crypto.randomUUID() :
    "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === "x" ? r : (r & 3) | 8).toString(16); }));

  // ---------- API ----------
  async function api(method, url, body) {
    const headers = { "Content-Type": "application/json" };
    if (adminKey) headers["X-Admin-Key"] = adminKey;
    if (auth) headers.Authorization = "Bearer " + auth.token;
    const r = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
    let json = {}; try { json = await r.json(); } catch {}
    if (r.status === 401 && auth) setAuth(null); // sessão expirou
    return { ok: r.ok, status: r.status, json };
  }

  // ---------- mapa ----------
  const savedView = lsJSON(K.view, null);
  const hasView = !!(savedView && Number.isFinite(savedView.lat) && Number.isFinite(savedView.lng));
  let vt;
  const map = new TileMap($("map"), {
    center: hasView ? [savedView.lat, savedView.lng] : SP, zoom: hasView ? savedView.z : 12,
    onClick: onMapClick, onLocate: locateMe,
    onMove: (m) => { clearTimeout(vt); vt = setTimeout(() => lsSet(K.view, JSON.stringify({ lat: m.lat, lng: m.lng, z: m.z })), 400); },
  });

  function onMapClick(lat, lng) {
    if (document.body.classList.contains("picking")) { setPick(lat, lng); endPicking(); showDialog(); }
    else if (selectedId) { selectedId = null; el.detail.hidden = true; render(); }
  }
  function locateMe() {
    if (!navigator.geolocation) return toast("Seu navegador não oferece geolocalização.");
    navigator.geolocation.getCurrentPosition((p) => {
      map.setMe([p.coords.latitude, p.coords.longitude]); map.setView(p.coords.latitude, p.coords.longitude, Math.max(map.z, 15));
    }, (e) => toast(e.code === 1 ? "Permissão de localização negada." : "Não foi possível obter sua localização."),
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 });
  }

  // ---------- dados ----------
  const all = () => [...outbox.map((o) => ({ ...o, id: "p-" + o.clientId, status: "reported", isDemo: false, pendingSync: true, updatedAt: o.createdAt })), ...server];
  const canEdit = (r) => !r.isDemo && !r.pendingSync && (!!adminKey || isMine(r));
  const visible = () => {
    const q = el.q.value.trim().toLowerCase(), s = el.fsev.value, t = el.fsta.value;
    return all().filter((r) => (!s || r.severity === s) && (!t || r.status === t) &&
      (!q || [r.title, r.address, r.neighborhood, r.description].some((x) => (x || "").toLowerCase().includes(q))));
  };

  async function refresh() {
    try {
      const r = await api("GET", "/api/reports");
      if (!r.ok) throw new Error(r.status);
      server = r.json.reports; isDemo = r.json.demo; serverOk = true;
      if (firstLoad) { firstLoad = false; if (!hasView && !isDemo && server.length) map.fitBounds(server.map((x) => [x.latitude, x.longitude])); }
    } catch { serverOk = false; }
    updateNet(); render();
  }

  // ---------- render ----------
  function ago(iso) {
    const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    if (m < 1) return "agora"; if (m < 60) return "há " + m + " min";
    const h = Math.round(m / 60); if (h < 24) return "há " + h + " h";
    return "há " + Math.round(h / 24) + " d";
  }
  const when = (r) => ago(r.createdAt) + (r.updatedAt && new Date(r.updatedAt) - new Date(r.createdAt) > 60000 ? " · atualizado " + ago(r.updatedAt) : "");
  function elx(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function btn(text, cls, fn) { const b = elx("button", cls, text); b.type = "button"; b.onclick = fn; return b; }

  function render() {
    const rows = visible();
    const active = rows.filter((r) => !r.isDemo && r.status !== "resolved").length;
    el.count.textContent = rows.length ? `${rows.length} relato${rows.length > 1 ? "s" : ""} no mapa` + (isDemo ? " (exemplos)" : ` · ${active} ativo${active === 1 ? "" : "s"}`) : "Nenhum relato";

    map.setItems(rows.map((r) => ({
      id: r.id, lat: r.latitude, lng: r.longitude, color: SEV[r.severity].color, symbol: SEV[r.severity].symbol,
      radius: SEV[r.severity].radius, dim: r.status === "resolved", pending: r.pendingSync, demo: r.isDemo, selected: r.id === selectedId,
      label: `${SEV[r.severity].label}: ${r.title}`, onClick: () => select(r.id, false),
    })));

    el.list.innerHTML = "";
    if (!rows.length) el.list.appendChild(elx("li", "empty", "Nenhum relato com esses filtros."));
    for (const r of rows) {
      const li = elx("li"), b = elx("button", "item" + (r.status === "resolved" ? " done" : "")); b.type = "button";
      if (r.id === selectedId) b.setAttribute("aria-current", "true");
      const sym = elx("i", "sym", SEV[r.severity].symbol); sym.style.setProperty("--c", SEV[r.severity].color);
      const body = elx("div");
      body.appendChild(elx("h3", null, r.title));
      const tags = elx("p");
      if (r.pendingSync) tags.appendChild(elx("span", "tag pend", "Pendente de envio"));
      if (r.isDemo) tags.appendChild(elx("span", "tag demo", "Exemplo"));
      if ((r.pendingSync || isMine(r)) && !r.isDemo) tags.appendChild(elx("span", "tag mine", "Meu relato"));
      tags.appendChild(elx("span", "tag", SEV[r.severity].label));
      tags.appendChild(elx("span", "tag st-" + r.status, STA[r.status]));
      body.appendChild(tags);
      const loc = [r.neighborhood, r.address].filter(Boolean).join(" · ");
      body.appendChild(elx("p", null, (loc ? loc + " — " : "") + when(r)));
      b.append(sym, body); b.onclick = () => select(r.id, true);
      li.appendChild(b); el.list.appendChild(li);
    }
    renderBanner();
    el.mod.textContent = adminKey ? "Modo moderador ativo · sair" : "Sou moderador";
    renderAccount();
    if (selectedId) { const r = all().find((x) => x.id === selectedId); r ? showDetail(r) : (selectedId = null, el.detail.hidden = true); }
  }

  function renderBanner() {
    const msgs = []; let warn = false;
    if (!serverOk) { msgs.push("Sem conexão com o servidor — mostrando os últimos dados carregados."); warn = true; }
    if (outbox.length) { msgs.push(`${outbox.length} relato(s) aguardando envio.${memoryOnly ? " O armazenamento local falhou: não feche a página antes de enviar." : ""}`); warn = true; }
    el.banner.hidden = !msgs.length; el.banner.className = "banner" + (warn ? " warn" : "");
    el.banner.textContent = msgs.join(" ");
    if (outbox.length) el.banner.appendChild(btn("Sincronizar agora", null, syncOutbox));
  }

  function select(id, fromList) {
    selectedId = id;
    const r = all().find((x) => x.id === id); if (!r) return;
    map.setView(r.latitude, r.longitude, Math.max(map.z, 15));
    if (fromList && window.matchMedia("(max-width: 899px)").matches) setSheet(false);
    render();
  }

  function showDetail(r) {
    const d = el.detail; d.hidden = false; d.innerHTML = ""; d.style.setProperty("--c", SEV[r.severity].color);
    d.append(btn("×", "x", () => { selectedId = null; d.hidden = true; render(); }), elx("h3", null, r.title));
    d.lastChild.previousSibling.setAttribute("aria-label", "Fechar");
    d.appendChild(elx("p", null, `${SEV[r.severity].label} · ${STA[r.status]} · ${when(r)}`));
    if (r.description) d.appendChild(elx("p", null, r.description));
    const loc = [r.neighborhood, r.address].filter(Boolean).join(" · ");
    if (loc) d.appendChild(elx("p", null, loc));

    if (r.pendingSync) {
      d.appendChild(elx("p", "warn", "Ainda não enviado ao servidor; será reenviado automaticamente."));
      d.appendChild(btn("Cancelar envio", "danger", () => {
        outbox = outbox.filter((o) => o.clientId !== r.clientId); saveOutbox();
        selectedId = null; render(); toast("Envio cancelado.");
      }));
    } else if (r.isDemo) {
      d.appendChild(elx("p", "warn", "Exemplo fictício, não é uma ocorrência real."));
    } else {
      d.appendChild(elx("p", "lbl", "Atualizar situação (qualquer pessoa logada pode):"));
      const bar = elx("div", "stbar");
      for (const s of STA_ORDER) {
        const b = btn(STA[s], "st st-" + s, () => setStatus(r, s));
        b.setAttribute("aria-pressed", String(r.status === s)); if (r.status === s) b.disabled = true;
        bar.appendChild(b);
      }
      d.appendChild(bar);
      if (canEdit(r)) {
        const act = elx("div", "stbar");
        act.append(btn("Editar", "ghost2", () => openEdit(r)), btn("Excluir", "danger", () => removeReport(r)));
        d.appendChild(act);
      }
      d.appendChild(elx("p", "warn", "Relato de usuário, não verificado. Gravidade autodeclarada."));
    }
  }

  async function setStatus(r, status) {
    if (!auth) return openAuth("Entre para atualizar a situação de um relato.");
    try {
      const res = await api("PATCH", "/api/reports/" + encodeURIComponent(r.id), { status });
      if (res.ok) toast("Situação atualizada: " + STA[status]);
      else if (res.status === 401) openAuth(res.json.error);
      else toast(res.json.error || "Não foi possível atualizar.");
    } catch { toast("Sem conexão. Tente novamente quando voltar a rede."); }
    refresh();
  }
  async function removeReport(r) {
    if (!auth) return openAuth("Entre para excluir relatos.");
    if (!confirm("Excluir este relato do mapa para todos?")) return;
    try {
      const res = await api("DELETE", "/api/reports/" + encodeURIComponent(r.id));
      if (res.ok || res.status === 404) { selectedId = null; toast("Relato excluído."); }
      else if (res.status === 401) openAuth(res.json.error);
      else toast(res.json.error || "Não foi possível excluir.");
    } catch { toast("Sem conexão. Tente novamente quando voltar a rede."); }
    refresh();
  }

  function setSheet(open) { el.panel.classList.toggle("open", open); el.sheet.setAttribute("aria-expanded", String(open)); }
  el.sheet.onclick = () => setSheet(!el.panel.classList.contains("open"));
  [el.q, el.fsev, el.fsta].forEach((e) => e.addEventListener("input", render));

  // moderador
  el.mod.onclick = async () => {
    if (adminKey) { adminKey = ""; try { localStorage.removeItem(K.admin); } catch {} toast("Modo moderador desativado."); return render(); }
    const k = (prompt("Chave de moderador (aparece no terminal onde o servidor foi iniciado):") || "").trim();
    if (!k) return;
    try {
      const r = await fetch("/api/admin/check", { headers: { "X-Admin-Key": k } });
      if (r.ok) { adminKey = k; lsSet(K.admin, k); toast("Modo moderador ativo: você pode editar e excluir qualquer relato."); render(); }
      else toast("Chave incorreta.");
    } catch { toast("Sem conexão com o servidor."); }
  };

  // ---------- rede ----------
  function updateNet() {
    const on = navigator.onLine && serverOk;
    el.net.textContent = on ? "online" : "offline"; el.net.className = "net" + (on ? "" : " off");
  }
  window.addEventListener("online", () => { updateNet(); syncOutbox(); });
  window.addEventListener("offline", updateNet);

  // ---------- formulário (novo / editar) ----------
  const validCoords = (c) => c && c[0] >= -90 && c[0] <= 90 && c[1] >= -180 && c[1] <= 180;
  function setPick(la, ln) { pick = [la, ln]; el.lat.value = la.toFixed(5); el.lng.value = ln.toFixed(5); map.setPick(pick); updateLocSum(); }
  function updateLocSum() { el.locsum.textContent = pick ? `📍 ${pick[0].toFixed(5)}, ${pick[1].toFixed(5)}` : "Nenhum local escolhido"; }
  function readCoords() {
    const la = parseFloat(String(el.lat.value).replace(",", ".")), ln = parseFloat(String(el.lng.value).replace(",", "."));
    return Number.isFinite(la) && Number.isFinite(ln) ? [la, ln] : null;
  }
  [el.lat, el.lng].forEach((i) => i.addEventListener("change", () => {
    const c = readCoords(); if (validCoords(c)) { pick = c; map.setPick(pick); map.setView(c[0], c[1]); } else if (c) showErr("Coordenadas fora do intervalo válido."); updateLocSum();
  }));
  const setSev = (v) => { el.form.querySelector(`input[name=sev][value=${v}]`).checked = true; };

  function showDialog() { showErr(""); updateLocSum(); el.formTitle.textContent = editing ? "Editar relato" : "Sinalizar alagamento"; el.send.textContent = editing ? "Salvar alterações" : "Enviar relato"; if (!el.dlg.open) el.dlg.showModal(); }
  function openNew() { editing = null; if (!pick) { const c = map.center(); setPick(c[0], c[1]); } showDialog(); }
  function openEdit(r) {
    if (!auth) return openAuth("Entre para editar relatos.");
    editing = r; el.title.value = r.title; el.desc.value = r.description || ""; el.nbh.value = r.neighborhood || ""; el.addr.value = r.address || "";
    setSev(r.severity); setPick(r.latitude, r.longitude); setSheet(false); showDialog();
  }
  function resetForm() { editing = null; pick = null; map.setPick(null); el.form.reset(); setSev("moderate"); showErr(""); }
  // fechar o diálogo (Cancelar, Esc, enviar) limpa o formulário — exceto ao ir marcar no mapa
  el.dlg.addEventListener("close", () => { if (!document.body.classList.contains("picking")) resetForm(); });

  function startPicking() { el.dlg.close(); document.body.classList.add("picking"); el.pickbar.hidden = false; setSheet(false); }
  function endPicking() { document.body.classList.remove("picking"); el.pickbar.hidden = true; }
  function showErr(m) { el.err.hidden = !m; el.err.textContent = m || ""; }
  function toast(m) { el.toast.textContent = m; el.toast.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (el.toast.hidden = true), 4500); }

  el.fab.onclick = () => {
    setSheet(false);
    if (!auth) return openAuth("Entre ou cadastre-se para sinalizar um alagamento.");
    openNew();
  };
  $("cancel").onclick = () => el.dlg.close();
  $("pickmap").onclick = startPicking;
  $("pickcancel").onclick = () => { endPicking(); showDialog(); };
  $("geo").onclick = () => {
    if (!navigator.geolocation) return showErr("Seu navegador não oferece geolocalização.");
    showErr(""); el.locsum.textContent = "Obtendo localização…";
    navigator.geolocation.getCurrentPosition((p) => {
      setPick(p.coords.latitude, p.coords.longitude); map.setMe([p.coords.latitude, p.coords.longitude]); map.setView(p.coords.latitude, p.coords.longitude, Math.max(map.z, 16));
    }, (e) => { updateLocSum(); showErr(e.code === 1 ? "Permissão de localização negada. Marque no mapa ou digite as coordenadas." : "Não foi possível obter sua localização."); },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 });
  };

  el.form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const c = readCoords() || pick;
    const sev = el.form.querySelector("input[name=sev]:checked").value, title = el.title.value.trim();
    if (title.length < 3) return showErr("Informe um título com pelo menos 3 caracteres.");
    if (!c) return showErr("Escolha o local do alagamento.");
    if (!validCoords(c)) return showErr("Coordenadas inválidas (latitude -90 a 90, longitude -180 a 180).");
    const fields = { title, description: el.desc.value.trim(), neighborhood: el.nbh.value.trim(), address: el.addr.value.trim(), latitude: c[0], longitude: c[1], severity: sev };
    el.send.disabled = true;
    try {
      if (editing) {
        const r = editing;
        let res;
        try { res = await api("PATCH", "/api/reports/" + encodeURIComponent(r.id), fields); }
        catch { return showErr("Sem conexão. Não foi possível salvar agora."); }
        if (res.status === 401) { el.dlg.close(); return openAuth(res.json.error); }
        if (!res.ok) return showErr(res.json.error || "Não foi possível salvar.");
        toast("Relato atualizado."); selectedId = r.id; el.dlg.close(); await refresh(); return;
      }
      const report = { clientId: rnd(), ...fields, createdAt: new Date().toISOString() };
      const r = await post(report);
      if (r === "ok") toast("Alagamento sinalizado. Obrigado!");
      else if (r === "queued") toast("Sem conexão: relato guardado e será enviado quando voltar.");
      else if (r !== "login") return showErr(r);
      map.setView(c[0], c[1], Math.max(map.z, 15)); selectedId = null; el.dlg.close();
      if (r === "login") openAuth("Sessão expirada. Entre novamente: o relato foi guardado e será enviado em seguida.");
      await refresh();
    } finally { el.send.disabled = false; }
  });

  // "ok" | "queued" | "login" | mensagem de erro (400: não entra na fila)
  async function post(report) {
    let status = 0;
    try {
      const r = await api("POST", "/api/reports", report);
      if (r.ok) return "ok";
      if (r.status === 400) return r.json.error || "Dados inválidos.";
      status = r.status;
      throw new Error(r.status); // 401/429/5xx: guarda e tenta de novo depois
    } catch {
      if (outbox.length >= MAX_OUTBOX) return "Fila local cheia (100 relatos). Sincronize antes de enviar novos.";
      outbox.push(report); saveOutbox(); return status === 401 ? "login" : "queued";
    }
  }

  async function syncOutbox() {
    if (syncing || !outbox.length || !auth) return;
    syncing = true;
    try {
      while (outbox.length) {
        const item = outbox[0]; let r;
        try { r = await api("POST", "/api/reports", item); } catch { break; }
        if (r.ok) { outbox.shift(); saveOutbox(); }
        else if (r.status === 400) { outbox.shift(); saveOutbox(); toast("Um relato pendente foi recusado pelo servidor e removido."); }
        else break; // preserva este item e os seguintes
      }
    } finally { syncing = false; }
    await refresh();
  }

  // ---------- conta (login / cadastro) ----------
  let authMode = "login";
  function setAuth(a) {
    auth = a;
    if (a) lsSet(K.auth, JSON.stringify(a)); else try { localStorage.removeItem(K.auth); } catch {}
    renderAccount();
  }
  function renderAccount() {
    el.account.textContent = auth ? "Sair" : "Entrar";
    el.account.title = auth ? "Conectado como " + auth.user.name : "Entrar ou criar conta";
  }
  function setAuthMode(m) {
    authMode = m; const reg = m === "register";
    el.authTitle.textContent = reg ? "Criar conta" : "Entrar";
    el.authSend.textContent = reg ? "Cadastrar" : "Entrar";
    el.authSwitch.textContent = reg ? "Já tem conta? Entrar" : "Não tem conta? Cadastre-se";
    el.nameRow.hidden = !reg;
    el.apass.autocomplete = reg ? "new-password" : "current-password";
    showAuthErr("");
  }
  function showAuthErr(m) { el.authErr.hidden = !m; el.authErr.textContent = m || ""; }
  function openAuth(msg) {
    setAuthMode("login");
    el.authMsg.textContent = msg || "Entre com seu e-mail e senha.";
    if (!el.authDlg.open) el.authDlg.showModal();
  }
  el.authSwitch.onclick = () => setAuthMode(authMode === "login" ? "register" : "login");
  $("authCancel").onclick = () => el.authDlg.close();
  el.authDlg.addEventListener("close", () => { el.authForm.reset(); showAuthErr(""); });

  el.account.onclick = async () => {
    if (!auth) return openAuth();
    try { await api("POST", "/api/auth/logout"); } catch {}
    setAuth(null); toast("Você saiu da sua conta."); render();
  };

  el.authForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const reg = authMode === "register";
    const body = { email: el.aemail.value.trim(), password: el.apass.value };
    if (reg) body.name = el.aname.value.trim();
    if (reg && body.name.length < 2) return showAuthErr("Informe seu nome.");
    if (!body.email) return showAuthErr("Informe seu e-mail.");
    if (body.password.length < 6) return showAuthErr("A senha precisa ter pelo menos 6 caracteres.");
    el.authSend.disabled = true;
    try {
      const r = await api("POST", reg ? "/api/auth/register" : "/api/auth/login", body);
      if (!r.ok) return showAuthErr(r.json.error || "Não foi possível entrar.");
      setAuth({ token: r.json.token, user: r.json.user });
      el.authDlg.close();
      toast((reg ? "Conta criada. " : "") + "Olá, " + r.json.user.name + "!");
      render(); syncOutbox();
    } catch { showAuthErr("Sem conexão com o servidor."); }
    finally { el.authSend.disabled = false; }
  });

  // ---------- instalação / service worker ----------
  let deferred;
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e; el.install.hidden = false; });
  el.install.onclick = async () => { if (!deferred) return; deferred.prompt(); await deferred.userChoice; deferred = null; el.install.hidden = true; };
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) navigator.serviceWorker.register("/sw.js").catch(() => {});

  // ---------- início ----------
  updateNet(); render();
  if (auth) api("GET", "/api/auth/me").catch(() => {}); // confere se a sessão salva ainda vale
  refresh().then(() => { if (outbox.length) syncOutbox(); });
  setInterval(() => { if (!document.hidden) { syncOutbox(); refresh(); } }, POLL_MS);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
})();
