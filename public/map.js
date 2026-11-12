/* Mini mapa de tiles (OpenStreetMap) sem dependências: arrastar, pinça, roda do mouse,
   marcadores e círculos de região. Tiles são carregados da URL pública oficial, com atribuição visível. */
(function () {
  const TILE = 256;
  const MIN_Z = 3, MAX_Z = 19;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function lngToX(lng, z) { return ((lng + 180) / 360) * TILE * Math.pow(2, z); }
  function latToY(lat, z) {
    const s = Math.sin((clamp(lat, -85.05, 85.05) * Math.PI) / 180);
    return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * TILE * Math.pow(2, z);
  }
  function xToLng(x, z) { return (x / (TILE * Math.pow(2, z))) * 360 - 180; }
  function yToLat(y, z) {
    const n = Math.PI - (2 * Math.PI * y) / (TILE * Math.pow(2, z));
    return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  }

  class TileMap {
    constructor(el, opts) {
      this.el = el;
      this.opts = opts || {};
      this.lat = opts.center[0]; this.lng = opts.center[1]; this.z = opts.zoom || 12;
      this.tiles = new Map();
      this.items = [];
      this.itemEls = new Map();
      this.pick = null; this.me = null;
      this.onClick = opts.onClick || (() => {});
      this.onMove = opts.onMove || (() => {});

      el.classList.add("tm");
      el.innerHTML = "";
      this.tileLayer = document.createElement("div"); this.tileLayer.className = "tm-tiles";
      this.overLayer = document.createElement("div"); this.overLayer.className = "tm-over";
      this.attr = document.createElement("div"); this.attr.className = "tm-attr";
      this.attr.innerHTML = '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';
      const zoom = document.createElement("div"); zoom.className = "tm-zoom";
      zoom.innerHTML = '<button type="button" aria-label="Aproximar">+</button><button type="button" aria-label="Afastar">−</button><button type="button" aria-label="Ir para minha localização" title="Minha localização">◎</button>';
      zoom.children[0].onclick = () => this.zoomBy(1);
      zoom.children[1].onclick = () => this.zoomBy(-1);
      zoom.children[2].onclick = () => this.opts.onLocate && this.opts.onLocate();
      el.append(this.tileLayer, this.overLayer, zoom, this.attr);

      this._bind();
      new ResizeObserver(() => this.render()).observe(el);
      this.render();
    }

    size() { return { w: this.el.clientWidth || 300, h: this.el.clientHeight || 300 }; }
    project(lat, lng) {
      const { w, h } = this.size();
      return [lngToX(lng, this.z) - lngToX(this.lng, this.z) + w / 2,
              latToY(lat, this.z) - latToY(this.lat, this.z) + h / 2];
    }
    unproject(px, py) {
      const { w, h } = this.size();
      const x = lngToX(this.lng, this.z) + px - w / 2;
      const y = latToY(this.lat, this.z) + py - h / 2;
      return [yToLat(y, this.z), xToLng(x, this.z)];
    }
    center() { return [this.lat, this.lng]; }

    setView(lat, lng, z) {
      this.lat = clamp(lat, -84, 84); this.lng = lng;
      if (z != null) this.z = clamp(z, MIN_Z, MAX_Z);
      this.render();
    }
    panByPx(dx, dy) {
      const { w, h } = this.size();
      const x = lngToX(this.lng, this.z) - dx, y = latToY(this.lat, this.z) - dy;
      this.lat = clamp(yToLat(y, this.z), -84, 84); this.lng = xToLng(x, this.z);
    }
    zoomAt(newZ, px, py) {
      newZ = clamp(newZ, MIN_Z, MAX_Z);
      const [la, ln] = this.unproject(px, py);
      this.z = newZ;
      const { w, h } = this.size();
      const x = lngToX(ln, newZ) - (px - w / 2), y = latToY(la, newZ) - (py - h / 2);
      this.lat = clamp(yToLat(y, newZ), -84, 84); this.lng = xToLng(x, newZ);
      this.render();
    }
    zoomBy(d) { const { w, h } = this.size(); this.zoomAt(Math.round(this.z + d), w / 2, h / 2); }

    // enquadra uma lista de [lat,lng] na tela
    fitBounds(pts, maxZoom = 16) {
      if (!pts.length) return;
      const la = pts.map((p) => p[0]), ln = pts.map((p) => p[1]);
      const { w, h } = this.size();
      const minLa = Math.min(...la), maxLa = Math.max(...la), minLn = Math.min(...ln), maxLn = Math.max(...ln);
      let z = maxZoom;
      for (; z > MIN_Z; z--) {
        const dx = Math.abs(lngToX(maxLn, z) - lngToX(minLn, z)), dy = Math.abs(latToY(minLa, z) - latToY(maxLa, z));
        if (dx < w - 120 && dy < h - 260) break;
      }
      this.setView((minLa + maxLa) / 2, (minLn + maxLn) / 2, z);
    }

    setItems(items) { this.items = items; this.render(true); }
    setPick(p) { this.pick = p; this.render(true); }
    setMe(p) { this.me = p; this.render(true); }

    _bind() {
      const el = this.el, ptrs = new Map();
      let moved = 0, startPinch = null;
      el.addEventListener("pointerdown", (e) => {
        if (e.target.closest(".tm-zoom,.tm-attr")) return;
        ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (ptrs.size === 1) moved = 0;
        if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; startPinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: this.z }; moved = 99; for (const id of ptrs.keys()) { try { el.setPointerCapture(id); } catch {} } }
      });
      el.addEventListener("pointermove", (e) => {
        const p = ptrs.get(e.pointerId); if (!p) return;
        const dx = e.clientX - p.x, dy = e.clientY - p.y;
        p.x = e.clientX; p.y = e.clientY;
        if (ptrs.size === 1) { moved += Math.abs(dx) + Math.abs(dy); if (moved > 4) { try { el.setPointerCapture(e.pointerId); } catch {} this.panByPx(dx, dy); this.render(); } }
        else if (ptrs.size === 2 && startPinch) {
          const [a, b] = [...ptrs.values()];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          const r = el.getBoundingClientRect();
          this.zoomAt(startPinch.z + Math.log2(d / startPinch.d), (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
        }
      });
      const up = (e) => {
        const had = ptrs.delete(e.pointerId);
        if (ptrs.size < 2) startPinch = null;
        if (had && e.type === "pointerup" && ptrs.size === 0 && moved <= 4 && !e.target.closest(".tm-item,.tm-zoom,.tm-attr")) {
          const r = el.getBoundingClientRect();
          const [la, ln] = this.unproject(e.clientX - r.left, e.clientY - r.top);
          this.onClick(la, ln);
        }
      };
      el.addEventListener("pointerup", up);
      el.addEventListener("pointercancel", up);
      el.addEventListener("wheel", (e) => {
        e.preventDefault();
        const r = el.getBoundingClientRect();
        this.zoomAt(this.z - Math.sign(e.deltaY) * 0.5, e.clientX - r.left, e.clientY - r.top);
      }, { passive: false });
      el.addEventListener("dblclick", (e) => {
        const r = el.getBoundingClientRect();
        this.zoomAt(Math.round(this.z) + 1, e.clientX - r.left, e.clientY - r.top);
      });
      el.tabIndex = 0;
      el.addEventListener("keydown", (e) => {
        const k = { ArrowLeft: [60, 0], ArrowRight: [-60, 0], ArrowUp: [0, 60], ArrowDown: [0, -60] }[e.key];
        if (k) { e.preventDefault(); this.panByPx(k[0], k[1]); this.render(); }
        else if (e.key === "+" || e.key === "=") this.zoomBy(1);
        else if (e.key === "-") this.zoomBy(-1);
      });
    }

    render(itemsChanged) {
      const { w, h } = this.size();
      const tz = clamp(Math.round(this.z), MIN_Z, 19);
      const s = Math.pow(2, this.z - tz), ts = TILE * s;
      const cx = lngToX(this.lng, tz), cy = latToY(this.lat, tz);
      const x0 = Math.floor((cx - w / 2 / s) / TILE), x1 = Math.floor((cx + w / 2 / s) / TILE);
      const y0 = Math.floor((cy - h / 2 / s) / TILE), y1 = Math.floor((cy + h / 2 / s) / TILE);
      const n = Math.pow(2, tz), seen = new Set();
      for (let tx = x0; tx <= x1; tx++) for (let ty = y0; ty <= y1; ty++) {
        if (ty < 0 || ty >= n) continue;
        const key = tz + "/" + tx + "/" + ty;
        seen.add(key);
        let img = this.tiles.get(key);
        if (!img) {
          img = new Image(); img.alt = ""; img.draggable = false; img.decoding = "async";
          img.className = "tm-tile";
          img.src = "https://tile.openstreetmap.org/" + tz + "/" + (((tx % n) + n) % n) + "/" + ty + ".png";
          this.tileLayer.appendChild(img); this.tiles.set(key, img);
        }
        img.style.width = img.style.height = ts + 0.5 + "px";
        img.style.transform = "translate(" + ((tx * TILE - cx) * s + w / 2) + "px," + ((ty * TILE - cy) * s + h / 2) + "px)";
      }
      for (const [k, img] of this.tiles) if (!seen.has(k)) { img.remove(); this.tiles.delete(k); }

      // itens (círculo de região + marcador)
      if (itemsChanged) {
        this.overLayer.innerHTML = ""; this.itemEls.clear();
        const all = [...this.items];
        if (this.me) all.push({ id: "__me", lat: this.me[0], lng: this.me[1], kind: "me" });
        if (this.pick) all.push({ id: "__pick", lat: this.pick[0], lng: this.pick[1], kind: "pick" });
        for (const it of all) {
          const wrap = document.createElement("div"); wrap.className = "tm-item";
          if (it.radius) {
            const c = document.createElement("div"); c.className = "tm-area";
            c.style.setProperty("--c", it.color); if (it.dim) c.classList.add("dim");
            wrap.appendChild(c); wrap._area = c;
          }
          const m = document.createElement(it.kind ? "div" : "button");
          m.className = "tm-pin " + (it.kind || "");
          if (!it.kind) {
            m.type = "button"; m.style.setProperty("--c", it.color);
            m.textContent = it.symbol; m.setAttribute("aria-label", it.label);
            m.title = it.label;
            if (it.pending) m.classList.add("pending");
            if (it.demo) m.classList.add("demo");
            if (it.selected) m.classList.add("selected");
            m.addEventListener("click", (e) => { e.stopPropagation(); it.onClick && it.onClick(it); });
          }
          wrap.appendChild(m); wrap._it = it; wrap._pin = m;
          this.overLayer.appendChild(wrap); this.itemEls.set(it.id, wrap);
        }
      }
      for (const wrap of this.itemEls.values()) {
        const it = wrap._it, [px, py] = this.project(it.lat, it.lng);
        wrap.style.transform = "translate(" + px + "px," + py + "px)";
        if (wrap._area) {
          const mpp = (156543.03392 * Math.cos((it.lat * Math.PI) / 180)) / Math.pow(2, this.z);
          const d = Math.max(22, (it.radius * 2) / mpp);
          wrap._area.style.width = wrap._area.style.height = d + "px";
        }
      }
      this.onMove(this);
    }
  }
  window.TileMap = TileMap;
})();
