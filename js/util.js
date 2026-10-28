/* PhiraiAd Web - 通用工具 */
(function (global) {
  'use strict';
  const U = {};

  U.$ = (s, r) => (r || document).querySelector(s);
  U.$$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  U.ce = function (tag, props, kids) {
    const e = document.createElement(tag);
    if (props) for (const k in props) {
      const v = props[k];
      if (v === null || v === undefined) continue;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else if (k === 'data' && typeof v === 'object') for (const d in v) e.dataset[d] = v[d];
      else e.setAttribute(k, v);
    }
    if (kids) (Array.isArray(kids) ? kids : [kids]).forEach(k => {
      if (k === null || k === undefined) return;
      e.appendChild(typeof k === 'string' || typeof k === 'number' ? document.createTextNode(String(k)) : k);
    });
    return e;
  };

  U.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.mod = (a, n) => ((a % n) + n) % n;
  U.rand = (a, b) => a + Math.random() * (b - a);
  U.now = () => performance.now();
  U.uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  /* ---------------- RPE 缓动表（索引 1..29，与 prpr RPE_TWEEN_MAP 对齐） --------------- */
  const PI = Math.PI;
  const c1 = 1.70158, c3 = c1 + 1, c4 = (2 * PI) / 3, c5 = (2 * PI) / 4.5;
  const EASE = [];
  EASE[0] = x => x;
  EASE[1] = x => x;                                        // linear
  EASE[2] = x => Math.sin((x * PI) / 2);                   // sine out
  EASE[3] = x => 1 - Math.cos((x * PI) / 2);               // sine in
  EASE[4] = x => 1 - (1 - x) * (1 - x);                    // quad out
  EASE[5] = x => x * x;                                    // quad in
  EASE[6] = x => -(Math.cos(PI * x) - 1) / 2;              // sine inout
  EASE[7] = x => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
  EASE[8] = x => 1 - Math.pow(1 - x, 3);
  EASE[9] = x => x * x * x;
  EASE[10] = x => 1 - Math.pow(1 - x, 4);
  EASE[11] = x => x * x * x * x;
  EASE[12] = x => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  EASE[13] = x => (x < 0.5 ? 8 * x * x * x * x : 1 - Math.pow(-2 * x + 2, 4) / 2);
  EASE[14] = x => 1 - Math.pow(1 - x, 5);
  EASE[15] = x => Math.pow(x, 5);
  EASE[16] = x => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));
  EASE[17] = x => (x <= 0 ? 0 : Math.pow(2, 10 * x - 10));
  EASE[18] = x => Math.sqrt(1 - Math.pow(x - 1, 2));
  EASE[19] = x => 1 - Math.sqrt(1 - Math.pow(x, 2));
  EASE[20] = x => 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
  EASE[21] = x => c3 * x * x * x - c1 * x * x;
  EASE[22] = x => (x < 0.5
    ? (1 - Math.sqrt(1 - Math.pow(2 * x, 2))) / 2
    : (Math.sqrt(1 - Math.pow(-2 * x + 2, 2)) + 1) / 2);
  EASE[23] = x => (x < 0.5
    ? (Math.pow(2 * x, 2) * ((c1 + 1) * 2 * x - c1)) / 2
    : (Math.pow(2 * x - 2, 2) * ((c1 + 1) * (x * 2 - 2) + c1) + 2) / 2);
  EASE[24] = x => (x === 0 ? 0 : x === 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * c4) + 1);
  EASE[25] = x => (x === 0 ? 0 : x === 1 ? 1 : -Math.pow(2, 10 * x - 10) * Math.sin((x * 10 - 10.75) * c4));
  const bounceOut = x => {
    const n1 = 7.5625, d1 = 2.75;
    if (x < 1 / d1) return n1 * x * x;
    if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + 0.75;
    if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + 0.9375;
    return n1 * (x -= 2.625 / d1) * x + 0.984375;
  };
  EASE[26] = bounceOut;
  EASE[27] = x => 1 - bounceOut(1 - x);
  EASE[28] = x => (x < 0.5 ? (1 - bounceOut(1 - 2 * x)) / 2 : (1 + bounceOut(2 * x - 1)) / 2);
  EASE[29] = x => (x === 0 ? 0 : x === 1 ? 1
    : x < 0.5
      ? -(Math.pow(2, 20 * x - 10) * Math.sin((20 * x - 11.125) * c5)) / 2
      : (Math.pow(2, -20 * x + 10) * Math.sin((20 * x - 11.125) * c5)) / 2 + 1);
  U.EASE = EASE;
  U.ease = (id, x) => (EASE[id] || EASE[1])(U.clamp(x, 0, 1));

  /* 关键帧求值：kfs = [{t, v, tw, e0, e1}]，tw 控制 [kfs[i], kfs[i+1]] 区间 */
  U.evalKfs = function (kfs, t) {
    if (!kfs || !kfs.length) return 0;
    if (t <= kfs[0].t) return kfs[0].v;
    let lo = 0, hi = kfs.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (kfs[mid].t <= t) lo = mid; else hi = mid - 1;
    }
    const k = kfs[lo], n = kfs[lo + 1];
    if (!n) return k.v;
    const span = n.t - k.t;
    if (span <= 1e-9) return n.v;
    let u = (t - k.t) / span;
    if (k.e0 !== undefined && k.e1 !== undefined) {
      if (k.e1 <= k.e0) return k.e0 <= 0 ? k.v : n.v;
      u = U.clamp((u - k.e0) / (k.e1 - k.e0), 0, 1);
    }
    const fn = EASE[k.tw || 1] || EASE[1];
    const e = fn(U.clamp(u, 0, 1));
    return k.v + (n.v - k.v) * e;
  };

  /* ---------------- 存储 ---------------- */
  const LS = 'phiraiad.web.';
  U.store = {
    get(k, d) {
      try {
        const v = localStorage.getItem(LS + k);
        return v === null ? d : JSON.parse(v);
      } catch (e) { return d; }
    },
    set(k, v) {
      try { localStorage.setItem(LS + k, JSON.stringify(v)); return true; }
      catch (e) { console.warn('storage full', e); return false; }
    },
    del(k) { try { localStorage.removeItem(LS + k); } catch (e) { } }
  };

  /* ---------------- 格式化 ---------------- */
  U.fmtTime = s => {
    if (!isFinite(s) || s < 0) s = 0;
    const m = Math.floor(s / 60), ss = Math.floor(s % 60);
    return m + ':' + (ss < 10 ? '0' : '') + ss;
  };
  U.fmtScore = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  U.fmtSize = b => (b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : (b / 1024).toFixed(0) + ' KB');
  U.rank = (score, allPerfect) => {
    if (allPerfect) return 'phi';
    if (score >= 960000) return 'V';
    if (score >= 920000) return 'S';
    if (score >= 880000) return 'A';
    if (score >= 820000) return 'B';
    if (score >= 780000) return 'C';
    return 'F';
  };
  U.rankColor = r => ({ phi: '#fff', V: '#f5d76e', S: '#ffd166', A: '#8be9fd', B: '#50fa7b', C: '#bd93f9', F: '#ff5555' }[r] || '#fff');

  /* ---------------- 下载 / 提示 ---------------- */
  U.download = function (blob, name) {
    const url = URL.createObjectURL(blob);
    const a = U.ce('a', { href: url, download: name });
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 400);
  };

  let toastWrap = null;
  U.toast = function (msg, ms) {
    if (!toastWrap || !toastWrap.isConnected) {
      toastWrap = document.getElementById('toast-wrap');
      if (!toastWrap) {
        toastWrap = U.ce('div', { id: 'toast-wrap', class: 'toast-wrap' });
        document.body.appendChild(toastWrap);
      }
    }
    const t = U.ce('div', { class: 'toast', text: msg });
    toastWrap.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => {
      t.classList.remove('show');
      setTimeout(() => t.remove(), 300);
    }, ms || 2200);
  };

  U.confirm = function (title, text) {
    return new Promise(res => {
      const mask = U.ce('div', { class: 'modal-mask' });
      const okBtn = U.ce('button', { class: 'btn primary', text: '确定' });
      const noBtn = U.ce('button', { class: 'btn', text: '取消' });
      const box = U.ce('div', { class: 'modal' }, [
        U.ce('h3', { text: title }),
        U.ce('p', { text: text || '' }),
        U.ce('div', { class: 'modal-actions' }, [noBtn, okBtn])
      ]);
      mask.appendChild(box);
      document.body.appendChild(mask);
      const done = v => { mask.remove(); res(v); };
      okBtn.onclick = () => done(true);
      noBtn.onclick = () => done(false);
      mask.onclick = e => { if (e.target === mask) done(false); };
    });
  };

  U.prompt = function (title, value) {
    return new Promise(res => {
      const mask = U.ce('div', { class: 'modal-mask' });
      const input = U.ce('input', { class: 'input', value: value || '' });
      const okBtn = U.ce('button', { class: 'btn primary', text: '确定' });
      const noBtn = U.ce('button', { class: 'btn', text: '取消' });
      const box = U.ce('div', { class: 'modal' }, [
        U.ce('h3', { text: title }), input,
        U.ce('div', { class: 'modal-actions' }, [noBtn, okBtn])
      ]);
      mask.appendChild(box);
      document.body.appendChild(mask);
      input.focus(); input.select();
      const done = v => { mask.remove(); res(v); };
      okBtn.onclick = () => done(input.value);
      noBtn.onclick = () => done(null);
      input.onkeydown = e => { if (e.key === 'Enter') done(input.value); if (e.key === 'Escape') done(null); };
      mask.onclick = e => { if (e.target === mask) done(null); };
    });
  };

  /* ---------------- 颜色 ---------------- */
  U.rgba = (r, g, b, a) => 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  U.hex2rgba = (hex, a) => {
    hex = (hex || '#ffffff').replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const n = parseInt(hex.slice(0, 6), 16) || 0xffffff;
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  };
  U.hsl = (h, s, l, a) => 'hsla(' + h + ',' + s + '%,' + l + '%,' + a + ')';

  U.debounce = function (fn, ms) {
    let t = 0;
    return function () {
      const a = arguments;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(null, a), ms);
    };
  };

  global.U = U;
})(window);
