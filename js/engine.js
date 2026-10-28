/* PhiraiAd Web - 游玩引擎：渲染 / 判定 / 输入 / 特效 / 结算
   坐标与判定规则对齐上游 prpr（Phira）：
   RPE 画布 1350x900，positionX/(1350/2)，moveX*2/1350，moveY*2/900，rotate 取负，
   yOffset*2/900*speed；判定 P/G/B = 80/160/220ms（Phira）、Phigros 复刻 80/180/220 等 */
(function (global) {
  'use strict';
  const U = global.U;
  const S = global.Settings;

  const FLOW = 1.0;            // 1 秒流速高度 = 半个可视高度
  const BASE_NOTE_W = 0.26;    // size = 1 时音符宽度（世界 x 单位）
  const TAU = Math.PI * 2;

  const E = {};
  E.state = null;
  E.onEnd = null;              // (result) => void
  E.onFail = null;
  E.onPauseChange = null;

  /* ============================ 资源 ============================ */
  const RES = { img: {}, ok: false, loading: null };
  E.RES = RES;
  E.img = k => RES.img[k] || null;

  function loadImg(key, src) {
    return new Promise(res => {
      const im = new Image();
      im.onload = () => { RES.img[key] = im; res(im); };
      im.onerror = () => { res(null); };
      im.src = src;
    });
  }

  E.loadRes = function () {
    if (RES.ok) return Promise.resolve(RES);
    if (RES.loading) return RES.loading;
    const list = [
      ['click', 'assets/respack/click.png'],
      ['drag', 'assets/respack/drag.png'],
      ['flick', 'assets/respack/flick.png'],
      ['hold', 'assets/respack/hold.png'],
      ['hit_fx', 'assets/respack/hit_fx.png'],
      ['click_mh', 'assets/respack/click_mh.png'],
      ['drag_mh', 'assets/respack/drag_mh.png'],
      ['flick_mh', 'assets/respack/flick_mh.png'],
      ['hold_mh', 'assets/respack/hold_mh.png'],
      ['noise15', 'prpr/src/noise_area/assets/texture_15.png'],
      ['noise17', 'prpr/src/noise_area/assets/texture_17.png'],
      ['noise30', 'prpr/src/noise_area/assets/texture_30.png'],
      ['touch', 'prpr/src/noise_area/assets/touch.png'],
      ['abstract', 'assets/abstract.jpg']
    ];
    const ranks = ['phi', 'V', 'S', 'A', 'B', 'C', 'F', 'FC'];
    ranks.forEach(r => list.push(['rank_' + r, 'assets/rank/' + r + '.png']));
    RES.loading = Promise.all(list.map(([k, p]) => loadImg(k, p))).then(() => {
      RES.ok = true;
      RES.loading = null;
      return RES;
    });
    return RES.loading;
  };
  E.reloadRes = function () {
    RES.ok = false; RES.loading = null; RES.img = {};
    return E.loadRes();
  };

  /* ============================ 谱面准备 ============================ */
  function resolveFathers(chart) {
    const map = new Map();
    chart.lines.forEach((L, i) => map.set(L.index !== undefined ? L.index : i, L));
    chart.lines.forEach((L, i) => {
      const f = (L.father === null || L.father === undefined) ? -1 : Number(L.father);
      L._fatherLine = (isFinite(f) && f >= 0) ? (map.get(f) || chart.lines[f] || null) : null;
      L._tr = null;
    });
  }

  function prepare(chart) {
    resolveFathers(chart);
    const notes = [];
    chart.lines.forEach(L => L.notes.forEach(n => {
      n._l = L;
      n._done = false;      // 已判定完成
      n._holding = false;
      n._holdingTime = 0;
      n._autoJudged = false;
      n._counted = false;
      notes.push(n);
    }));
    notes.sort((a, b) => a.time - b.time || (a.endTime || 0) - (b.endTime || 0));
    const st = {
      chart,
      notes,
      idx: 0,
      time: 0,
      chartTime: 0,
      paused: false,
      finished: false,
      failed: false,
      failReason: '',
      combo: 0, maxCombo: 0,
      counts: { perfect: 0, good: 0, bad: 0, miss: 0 },
      score: 0, acc: 1,
      judge: null,
      effects: [],
      touches: new Map(),
      flipCur: 0, flipTarget: 0,
      fps: 60, _fpsAcc: 0, _fpsCnt: 0,
      t0: performance.now(),
      lastFrame: performance.now(),
      music: false,
      userOffset: 0,
      errorBar: [],            // timing bar 记录
      ap: true, fc: true,
      result: null,
      auto: false,
      ended: false,
      noteCounts: { played: 0 }
    };
    st.numNotes = chart.numNotes || 1;
    st.auto = !!S.get('autoplay');
    st.userOffset = Number(S.get('offset')) / 1000 || 0;
    /* 谱面自身 offset（META.offset，秒）：谱面时间 = 音频时间 - offset */
    st.chartOffset = Number(chart.offset) || 0;
    st.music = !!(global.AudioEng && global.AudioEng.hasMusic && global.AudioEng.hasMusic());
    if (!st.music) st.chartTime = -(st.chartOffset + st.userOffset);
    E.state = st;
    return st;
  }
  E.prepare = prepare;

  /* ============================ 变换 ============================ */
  function baseTransform(L, t, depth) {
    const tr = {
      x: U.evalKfs(L.moveX, t),
      y: U.evalKfs(L.moveY, t),
      rot: U.evalKfs(L.rotate, t) * Math.PI / 180,
      alpha: U.evalKfs(L.alpha, t),
      sx: U.evalKfs(L.scaleX, t) || 1,
      sy: U.evalKfs(L.scaleY, t) || 1,
      color: U.evalKfs(L.color, t) || [255, 255, 255]
    };
    if (!isFinite(tr.sx) || Math.abs(tr.sx) < 1e-6) tr.sx = 1;
    if (!isFinite(tr.sy) || Math.abs(tr.sy) < 1e-6) tr.sy = 1;
    const F = L._fatherLine;
    if (F && F !== L && depth < 8) {
      const ft = transform(F, t, depth + 1);
      const c = Math.cos(ft.rot), s = Math.sin(ft.rot);
      const lx = tr.x, ly = tr.y;
      tr.x = ft.x + lx * c - ly * s;
      tr.y = ft.y + lx * s + ly * c;
      if (L.rotateWithFather) tr.rot += ft.rot;
      tr.alpha *= ft.alpha;
      tr.sx *= ft.sx;
      tr.sy *= ft.sy;
    }
    return tr;
  }

  function transform(L, t, depth) {
    if (L._tr && Math.abs(L._tr._t - t) < 1e-5) return L._tr;
    const tr = baseTransform(L, t, depth || 0);
    tr._t = t;
    L._tr = tr;
    return tr;
  }
  E.transform = transform;

  /* 音符在世界坐标中的位置与半宽（世界单位：x 以可视半宽为 1，y 以可视半高为 1） */
  function noteWorld(n, t, st) {
    const L = n._l;
    const tr = transform(L, t, 0);
    const hLen = L.height.at ? L.height.at(t) : t;
    const flow = S.speedFactor() * (S.get('noteFlowInverse') ? -1 : 1);
    let dy = (n.height - hLen) * FLOW * flow + (n.yOffset || 0);
    if (st && st.autoFlipActive) { /* 由外部统一旋转，无需改坐标 */ }
    const lx = n.x * tr.sx;
    dy *= tr.sy;
    const cos = Math.cos(tr.rot), sin = Math.sin(tr.rot);
    return {
      x: tr.x + lx * cos - dy * sin,
      y: tr.y + lx * sin + dy * cos,
      rot: tr.rot,
      alpha: tr.alpha * (n.alpha === undefined ? 1 : n.alpha),
      hw: BASE_NOTE_W * 0.5 * (n.size || 1) * S.get('noteScale') * Math.abs(tr.sx)
    };
  }
  E.noteWorld = noteWorld;

  /* ============================ 画布与视口 ============================ */
  const PF = { x: 0, y: 0, w: 0, h: 0, u: 1, cx: 0, cy: 0 };
  E.pf = PF;

  E.resize = function () {
    const cv = E.canvas;
    if (!cv) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const w = cv.clientWidth, h = cv.clientHeight;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    const ctx = E.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    /* 16:9 居中视口 */
    let vw = w, vh = w * 9 / 16;
    if (vh > h) { vh = h; vw = h * 16 / 9; }
    PF.w = vw; PF.h = vh;
    PF.x = (w - vw) / 2; PF.y = (h - vh) / 2;
    PF.u = vh / 2;
    PF.cx = w / 2; PF.cy = h / 2;
    PF.scrW = w; PF.scrH = h;
  };

  const wx2sx = wx => PF.cx + wx * PF.u;
  const wy2sy = wy => PF.cy - wy * PF.u;
  E.wx2sx = wx2sx; E.wy2sy = wy2sy;
  E.sx2wx = sx => (sx - PF.cx) / PF.u;
  E.sy2wy = sy => (PF.cy - sy) / PF.u;

  /* ============================ 判定核心 ============================ */
  function judgeHead(st, n, dt) {
    const w = S.windows();
    const ad = Math.abs(dt);
    let j;
    if (ad <= w.perfect) j = 'perfect';
    else if (ad <= w.good) j = 'good';
    else if (ad <= w.bad) j = 'bad';
    else return null;
    if (n.type === 'flick') {
      /* Flick 判定窗与 Tap 相同，Phigros 复刻额外乘 1.75 */
      const fw = w.flick || w.perfect;
      if (ad <= fw) j = 'perfect';
    }
    commit(st, n, j, dt);
    return j;
  }
  E.judgeHead = judgeHead;

  function commit(st, n, j, dt) {
    if (n._done) return;
    n._done = true;
    n._judged = j;
    n._dt = dt || 0;
    n._counted = true;
    st.counts[j]++;
    if (j === 'bad' || j === 'miss') { st.fc = false; st.ap = false; }
    else if (j !== 'perfect') st.ap = false;
    if (j === 'miss') {
      st.combo = 0;
    } else {
      st.combo++;
      if (st.combo > st.maxCombo) st.maxCombo = st.combo;
    }
    st.judge = { j, dt: dt || 0, t0: st.chartTime, note: n };
    if (j !== 'miss') spawnHit(st, n, j);
    if (S.get('timingBar.enabled') || S.get('showCounts')) {
      if (j !== 'miss' && Math.abs(dt || 0) <= 0.3) st.errorBar.push({ t: st.chartTime, dt: dt || 0, j });
    }
    if (global.AudioEng) {
      if (!n.hitsound && S.get('hitSoundEnabled')) global.AudioEng.sfx(n.type === 'hold' ? 'click' : n.type);
      /* 正确判定音（上游 correct_sound / correct_sound_volume） */
      if (j !== 'miss' && S.get('correctSound')) {
        const cv = Number(S.get('correctSoundVolume'));
        global.AudioEng.sfx('caliHit', { volume: isFinite(cv) ? cv : 0.35 });
      }
    }
    recompute(st);
    checkFail(st, j);
  }

  function spawnHit(st, n, j) {
    if (S.get('disableEffect')) return;
    const p = noteWorld(n, st.chartTime, st);
    st.effects.push({
      x: p.x, y: p.y, rot: p.rot, hw: p.hw,
      type: n.type, j, t0: performance.now() / 1000,
      dur: S.get('hitFxDuration') || 0.32,
      size: S.get('hitFxSize') || 1,
      color: fxColor(j),
      tint: n.fxTint || null
    });
    if (st.effects.length > 260) st.effects.splice(0, 60);
  }

  function fxColor(j) {
    const hex = S.get('fxColor.' + j) || '#ffffff';
    return hex;
  }

  function recompute(st) {
    const c = st.counts;
    const judged = c.perfect + c.good + c.bad + c.miss;
    const acc = judged ? (c.perfect + c.good * 0.65) / judged : 1;
    st.acc = acc;
    const r = S.get('jm.countsLocalScore') === false ? 0 : S.comboRatio();
    const cr = st.maxCombo / st.numNotes;
    let score = ((1 - r) * acc + cr * r) * 1000000;
    if (c.perfect === st.numNotes) score = 1000000;
    st.score = U.clamp(score, 0, 1000000);
  }
  E.recompute = recompute;

  function checkFail(st, j) {
    if (st.failed || st.finished) return;
    const ap = S.get('instantDeathAP'), fc = S.get('instantDeathFC');
    if (ap && j !== 'perfect') fail(st, '死路模式（AP）：出现非 PERFECT');
    else if (fc && (j === 'miss' || j === 'bad')) fail(st, '死路模式（FC）：出现 MISS / BAD');
  }

  function fail(st, reason) {
    st.failed = true;
    st.failReason = reason;
    st.finished = true;
    stopMusic();
    const r = E.result(st);
    r.failed = true;
    r.failReason = reason;
    if (E.onFail) E.onFail(r);
    if (E.onEnd) E.onEnd(r);
  }

  E.result = function (st) {
    st = st || E.state;
    const c = st.counts;
    const total = st.numNotes;
    const acc = (c.perfect + c.good * 0.65) / (total || 1);
    const r = S.comboRatio();
    let score = ((1 - r) * acc + (st.maxCombo / (total || 1)) * r) * 1000000;
    if (c.perfect === total) score = 1000000;
    const ap = c.perfect === total;
    const fc = c.miss === 0 && c.bad === 0;
    return {
      chart: st.chart,
      score: Math.round(score),
      acc,
      maxCombo: st.maxCombo,
      counts: Object.assign({}, c),
      total,
      allPerfect: ap,
      fullCombo: fc,
      rank: U.rank(score, ap),
      failed: st.failed,
      failReason: st.failReason || ''
    };
  };

  /* ============================ 输入 ============================ */
  function hitCandidates(st, w, t, types) {
    const out = [];
    for (let i = 0; i < st.notes.length; i++) {
      const n = st.notes[i];
      if (n._done || n.fake) continue;
      if (n.time - t > w.bad + 0.02) break;
      if (t - n.time > w.bad) continue;
      if (types && types.indexOf(n.type) < 0) continue;
      out.push(n);
    }
    return out;
  }

  E.press = function (wx, wy, id) {
    const st = E.state;
    if (!st || st.paused || st.finished) return;
    const t = st.chartTime;
    const w = S.windows();
    st.touches.set(id, { x: wx, y: wy, t0: t });
    if (st.auto) return;
    const fs = !!S.get('fullscreenJudgement');
    let best = null, bestScore = 1e9;
    const cands = hitCandidates(st, w, t, ['tap', 'flick', 'hold']);
    for (const n of cands) {
      if (n.type === 'hold' && n._holding) continue;
      const p = noteWorld(n, t, st);
      const dx = Math.abs(p.x - wx) / Math.max(p.hw * 1.6, 0.05);
      if (!fs && dx > 1) continue;
      const dt = t - n.time;
      const sc = Math.abs(dt) / w.bad * 0.7 + (fs ? 0 : dx) * 0.3;
      if (sc < bestScore) { bestScore = sc; best = n; }
    }
    if (best) {
      if (best.type === 'hold') {
        const j = judgeHeadHold(st, best, t - best.time);
        if (j) { best._holding = true; }
      } else {
        judgeHead(st, best, t - best.time);
      }
    }
  };

  function judgeHeadHold(st, n, dt) {
    const w = S.windows();
    const ad = Math.abs(dt);
    let j = null;
    if (ad <= w.perfect) j = 'perfect';
    else if (ad <= w.good) j = 'good';
    else if (ad <= w.bad) j = 'bad';
    if (!j) return null;
    n._judgedHead = j;
    n._holdStart = st.chartTime;
    /* 先给反馈（不计数，尾判时再入账） */
    spawnHit(st, n, j);
    st.judge = { j, dt, t0: st.chartTime, note: n };
    if (global.AudioEng && S.get('hitSoundEnabled')) global.AudioEng.sfx('click');
    return j;
  }

  E.release = function (id) {
    const st = E.state;
    if (!st) return;
    st.touches.delete(id);
    if (st.auto) return;
    const t = st.chartTime;
    for (const n of st.notes) {
      if (n.type !== 'hold' || !n._holding || n._done) continue;
      const held = t - n.time;
      if (t >= n.endTime - 0.01) continue; // 已完整按住，由 update 结束
      if (held < 0) continue;
      const remain = n.endTime - t;
      n._holding = false;
      /* 提前松手：按剩余时长降级 */
      const j = remain > (S.windows().bad) ? 'miss' : (remain > 0.08 ? 'bad' : n._judgedHead || 'good');
      n._done = true;
      n._judged = j;
      st.counts[j]++;
      if (j === 'miss' || j === 'bad') { st.combo = 0; st.fc = false; st.ap = false; }
      else { st.combo++; if (st.combo > st.maxCombo) st.maxCombo = st.combo; if (j !== 'perfect') st.ap = false; }
      st.judge = { j, dt: 0, t0: t, note: n };
      recompute(st);
      checkFail(st, j);
    }
  };

  E.pointerDown = function (e) {
    const st = E.state;
    if (!st || st.paused || st.finished) return;
    const cr = E.canvas.getBoundingClientRect();
    const x = e.clientX - cr.left, y = e.clientY - cr.top;
    E.press(E.sx2wx(x), E.sy2wy(y), e.pointerId === undefined ? 'm' : e.pointerId);
  };
  E.pointerMove = function (e) {
    const st = E.state;
    if (!st) return;
    const id = e.pointerId === undefined ? 'm' : e.pointerId;
    const t = st.touches.get(id);
    if (!t) return;
    const cr = E.canvas.getBoundingClientRect();
    const nx = E.sx2wx(e.clientX - cr.left), ny = E.sy2wy(e.clientY - cr.top);
    const now = performance.now();
    const dtm = Math.max((now - (t._lt || now)) / 1000, 0.001);
    const dx = nx - t.x;
    t._lt = now;
    t.x = nx; t.y = ny;
    t.moved = (t.moved || 0) + Math.abs(dx);
    /* Flick：由滑动速度触发（上游 flick_speed_threshold） */
    if (!st.auto && !st.paused && !st.finished) {
      const need = Math.max(0.05, Number(S.get('jm.flickSpeed')) || 0.3);
      const vx = Math.abs(dx) / dtm;
      if (vx >= need) tryFlickSwipe(st, nx, ny);
    }
  };

  /* 滑动命中最近的 Flick 音符 */
  function tryFlickSwipe(st, wx, wy) {
    const t = st.chartTime, w = S.windows();
    const fs = !!S.get('fullscreenJudgement');
    let best = null, bd = 1e9;
    for (const n of hitCandidates(st, w, t, ['flick'])) {
      const p = noteWorld(n, t, st);
      if (!fs && Math.abs(p.x - wx) > Math.max(p.hw * 1.6, 0.05)) continue;
      const d = Math.abs(t - n.time);
      if (d < bd) { bd = d; best = n; }
    }
    if (best) judgeHead(st, best, t - best.time);
  }
  E.pointerUp = function (e) {
    E.release(e.pointerId === undefined ? 'm' : e.pointerId);
  };

  E.keyDown = function (key) {
    const st = E.state;
    if (!st || st.paused || st.finished || st.auto) return;
    key = (key || '').toLowerCase();
    const map = S.keymap;
    let type = null;
    for (const tp in map) if (map[tp].indexOf(key) >= 0) { type = tp; break; }
    if (!type) return;
    const t = st.chartTime, w = S.windows();
    let best = null, bd = 1e9;
    for (const n of st.notes) {
      if (n._done || n.fake) continue;
      if (n.time - t > w.bad) break;
      if (t - n.time > w.bad) continue;
      const same = (type === 'tap' && n.type === 'tap') || (type === 'drag' && n.type === 'drag') ||
        (type === 'flick' && n.type === 'flick') || (type === 'hold' && n.type === 'hold');
      if (!same) continue;
      if (n.type === 'hold' && n._holding) continue;
      const d = Math.abs(t - n.time);
      if (d < bd) { bd = d; best = n; }
    }
    if (!best) return;
    if (best.type === 'hold') { if (judgeHeadHold(st, best, t - best.time)) best._holding = true; }
    else if (best.type === 'drag') { commit(st, best, 'perfect', t - best.time); }
    else judgeHead(st, best, t - best.time);
  };

  /* ============================ 主循环更新 ============================ */
  function stopMusic() {
    if (global.AudioEng) { try { global.AudioEng.pause(); } catch (e) { } }
  }

  function update(st, dt) {
    if (st.paused || st.finished) return;
    const A = global.AudioEng;
    if (st.music && A && A.hasMusic()) {
      st.chartTime = A.time() - st.chartOffset - st.userOffset;
    } else {
      /* 无音乐：按帧累加，起点偏移在 prepare 中已设为 -(谱面 offset + 用户 offset) */
      st.chartTime += dt;
    }
    const t = st.chartTime;
    const w = S.windows();

    /* 自动倒打 */
    updateFlip(st, t);

    /* 判定：自动 miss / 自动 drag / autoplay / hold 收尾 */
    for (const n of st.notes) {
      if (n._done || n.fake) continue;
      if (n.time - t > 1.2 && !(n.type === 'hold' && n._holding)) { if (n.time - t > w.bad + 0.1) break; }
      if (n.time - t > w.bad + 0.05) break;

      if (st.auto) {
        if (n.type === 'hold') {
          if (!n._holding && t >= n.time - 0.001) {
            n._holding = true;
            commit(st, n, 'perfect', 0);
          }
        } else if (t >= n.time) {
          commit(st, n, 'perfect', 0);
        }
        continue;
      }

      if (n.type === 'drag') {
        if (n.autoDone) continue;
        /* 有触点在横向范围内 → 判 Perfect */
        let inRange = false;
        for (const [, tp] of st.touches) {
          const p = noteWorld(n, t, st);
          if (Math.abs(p.x - tp.x) <= Math.max(p.hw * 1.8, 0.09)) { inRange = true; break; }
        }
        if (inRange && t >= n.time - w.drag && t <= n.time + w.drag) {
          n.autoDone = true;
          commit(st, n, 'perfect', t - n.time);
        } else if (t > n.time + w.drag) {
          n.autoDone = true;
          n._done = true; n._judged = 'miss';
          st.counts.miss++;
          st.ap = false; st.fc = false;
          /* Phigros 规则：Drag 漏掉不断连击 */
          st.judge = { j: 'miss', dt: 0, t0: t, note: n };
          recompute(st);
        }
        continue;
      }

      if (n.type === 'hold') {
        if (n._holding) {
          if (t >= n.endTime - 0.02) {
            n._holding = false;
            n._done = true;
            const j = n._judgedHead || 'good';
            n._judged = j;
            st.counts[j]++;
            if (j === 'perfect') { st.combo++; if (st.combo > st.maxCombo) st.maxCombo = st.combo; }
            else { st.ap = false; st.combo++; if (st.combo > st.maxCombo) st.maxCombo = st.combo; }
            recompute(st);
            if (j === 'perfect' && S.get('holdHeadEffect')) spawnHit(st, n, j);
          }
        } else if (t > n.time + w.bad) {
          n._done = true; n._judged = 'miss';
          st.counts.miss++; st.combo = 0; st.ap = false; st.fc = false;
          st.judge = { j: 'miss', dt: 0, t0: t, note: n };
          recompute(st);
          checkFail(st, 'miss');
        }
        continue;
      }

      if (t > n.time + w.bad) {
        n._done = true; n._judged = 'miss';
        st.counts.miss++; st.combo = 0; st.ap = false; st.fc = false;
        st.judge = { j: 'miss', dt: 0, t0: t, note: n };
        recompute(st);
        checkFail(st, 'miss');
      }
    }

    /* 特效衰减 */
    const nowS = performance.now() / 1000;
    for (let i = st.effects.length - 1; i >= 0; i--) {
      if (nowS - st.effects[i].t0 > st.effects[i].dur) st.effects.splice(i, 1);
    }
    if (st.errorBar.length > 400) st.errorBar.splice(0, 100);

    /* 结束判定 */
    const endT = Math.max(st.chart.duration || 0, lastNoteTime(st)) + 0.6;
    if (t > endT && !st.finished) finish(st);
  }

  function lastNoteTime(st) {
    let m = 0;
    for (const n of st.notes) if (n.time > m) m = n.time;
    return m;
  }

  function updateFlip(st, t) {
    const iv = st.chart.flipIntervals || [];
    let target = 0;
    if (S.get('autoFlipEnabled') && iv.length) {
      for (const r of iv) if (t >= r.start && t < r.end) { target = Math.PI; break; }
    }
    st.flipTarget = target;
    if (Math.abs(st.flipCur - target) < 1e-4) { st.flipCur = target; }
    else {
      const speed = Math.PI / 0.8;      // 0.8 秒完成 180°
      const d = target - st.flipCur;
      const step = speed / 60;
      if (Math.abs(d) <= step) st.flipCur = target;
      else st.flipCur += Math.sign(d) * step;
    }
  }

  function finish(st) {
    if (st.finished) return;
    st.finished = true;
    /* 剩余未判定音符按 miss 计 */
    for (const n of st.notes) {
      if (n._done || n.fake) continue;
      n._done = true; n._judged = 'miss';
      st.counts.miss++; st.ap = false; st.fc = false;
    }
    recompute(st);
    stopMusic();
    const r = E.result(st);
    st.result = r;
    if (E.onEnd) E.onEnd(r);
  }
  E.finish = finish;

  /* ============================ 循环 ============================ */
  let raf = 0;
  function loop() {
    const st = E.state;
    if (!st) return;
    const now = performance.now();
    let dt = (now - st.lastFrame) / 1000;
    st.lastFrame = now;
    if (dt > 0.1) dt = 0.1;
    if (!st.paused) {
      st._fpsAcc += dt; st._fpsCnt++;
      if (st._fpsAcc > 0.5) { st.fps = st._fpsCnt / st._fpsAcc; st._fpsAcc = 0; st._fpsCnt = 0; }
      update(st, dt);
    }
    draw(st);
    if (!st.finished) raf = requestAnimationFrame(loop);
    else raf = 0;
  }
  E.loop = loop;

  E.stopLoop = function () { if (raf) cancelAnimationFrame(raf); raf = 0; };

  /* ============================ 渲染 ============================ */
  const NOTE_COLOR = { tap: '#ffffff', drag: '#ffd45a', flick: '#ff5c5c', hold: '#9fe6ff' };
  const JUDGE_COLOR = { perfect: '#f5f0a2', good: '#8ad4ff', bad: '#b7a6d6', miss: '#ff5f5f' };
  const JUDGE_TEXT = { perfect: 'PERFECT', good: 'GOOD', bad: 'BAD', miss: 'MISS' };

  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function noteTint(n) {
    if (n.tint && n.tint.length >= 3) return 'rgb(' + (n.tint[0] | 0) + ',' + (n.tint[1] | 0) + ',' + (n.tint[2] | 0) + ')';
    return NOTE_COLOR[n.type] || '#ffffff';
  }

  /* 背景 */
  function drawBackground(st) {
    const ctx = E.ctx;
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#08080f';
    ctx.fillRect(0, 0, PF.scrW, PF.scrH);
    const im = RES.img.abstract;
    const ill = st.chart.info && st.chart.info.illustration && st.chart._illImg;
    const bg = ill || im;
    if (bg && bg.width) {
      const scale = Math.max(PF.scrW / bg.width, PF.scrH / bg.height);
      const w = bg.width * scale, h = bg.height * scale;
      ctx.globalAlpha = 0.55;
      ctx.drawImage(bg, (PF.scrW - w) / 2, (PF.scrH - h) / 2, w, h);
    }
    const g = ctx.createRadialGradient(PF.cx, PF.cy, PF.u * 0.4, PF.cx, PF.cy, Math.max(PF.scrW, PF.scrH) * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,' + (0.25 + 0.5 * (Number(S.get('bgDark')) || 0.55)) + ')');
    g.addColorStop(1, 'rgba(0,0,0,0.92)');
    ctx.globalAlpha = 1;
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, PF.scrW, PF.scrH);
    ctx.restore();
  }

  /* 噪域 */
  function evAt(events, t, key) {
    if (!events || !events.length) return null;
    let prev = events[0];
    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      if (e.time <= t) prev = e; else break;
    }
    return prev;
  }

  function noiseAlpha(b, t) {
    const a = +b.appearTime || 0, en = +b.enableTime || a, di = +b.disableTime || en, dp = +b.disappearTime || di;
    if (t < a) return 0;
    if (t < en) return en > a ? (t - a) / (en - a) : 1;
    if (t < di) return 1;
    if (t < dp) return dp > di ? 1 - (t - di) / (dp - di) : 0;
    return 0;
  }

  function drawNoise(st, t) {
    if (!S.get('noiseArea.enabled')) return;
    const areas = st.chart.noise || [];
    if (!areas.length) return;
    const ctx = E.ctx;
    const tex = [RES.img.noise17, RES.img.noise15, RES.img.noise30].find(i => i && i.width);
    const low = S.get('noiseArea.lowPerformance');
    const noDistort = S.get('noiseArea.removeDistortion');
    for (const b of areas) {
      const al = noiseAlpha(b, t);
      if (al <= 0.002) continue;
      const x1 = b.bottomLeft.x, y1 = b.topRight.y, x2 = b.topRight.x, y2 = b.bottomLeft.y;
      let px = PF.x + Math.min(x1, x2) * PF.w;
      let py = PF.y + Math.min(y1, y2) * PF.h;
      let pw = Math.abs(x2 - x1) * PF.w;
      let ph = Math.abs(y2 - y1) * PF.h;
      let cx = px + pw / 2, cy = py + ph / 2;
      let rot = 0, sx = 1, sy = 1;
      let mvx = 0, mvy = 0;
      if (!noDistort) {
        const r = evAt(b.rotateEvents, t);
        if (r) { rot = (r.rotation || 0) * Math.PI / 180; if (r.anchor) { cx = px + r.anchor.x * pw; cy = py + r.anchor.y * ph; } }
        const s = evAt(b.scaleEvents, t);
        if (s && s.scale) { sx = s.scale.x; sy = s.scale.y; }
        const m = evAt(b.moveEvents, t);
        if (m && m.end) { mvx = m.end.x * PF.w; mvy = m.end.y * PF.h; }
      }
      ctx.save();
      ctx.globalAlpha = al * (low ? 0.9 : 1);
      ctx.translate(cx + mvx, cy + mvy);
      ctx.rotate(rot);
      ctx.scale(sx || 1, sy || 1);
      ctx.translate(-cx, -cy);
      if (tex && !low) {
        const pat = ctx.createPattern(tex, 'repeat');
        ctx.fillStyle = pat;
        ctx.fillRect(px, py, pw, ph);
      } else {
        ctx.fillStyle = '#000';
        ctx.fillRect(px, py, pw, ph);
      }
      if (b.isSubtract) {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.globalAlpha = al * 0.85;
        ctx.fillRect(px, py, pw, ph);
      }
      ctx.restore();
    }
  }

  /* 单条判定线 + 音符 */
  function drawLine(st, L, t) {
    const ctx = E.ctx;
    const tr = transform(L, t);
    if (!tr.alpha || tr.alpha <= 0.004) return;
    const sx0 = wx2sx(tr.x), sy0 = wy2sy(tr.y);
    const rainbow = S.get('rainbow');
    let col = '#ffffff';
    if (rainbow) col = U.hsl((t * 140) % 360, 90, 62, tr.alpha);
    else if (tr.color && tr.color.length >= 3 && tr.color[0] !== undefined && (tr.color[0] !== 255 || tr.color[1] !== 255)) {
      col = 'rgba(' + (tr.color[0] | 0) + ',' + (tr.color[1] | 0) + ',' + (tr.color[2] | 0) + ',' + tr.alpha + ')';
    } else col = 'rgba(255,255,255,' + tr.alpha + ')';

    const len = Math.max(PF.w, PF.h) * 1.6;
    const th = Math.max(2, PF.u * 0.013);
    ctx.save();
    ctx.translate(sx0, sy0);
    ctx.rotate(-tr.rot);
    ctx.globalAlpha = tr.alpha;
    const glow = Number(S.get('lineGlow'));
    if (glow > 0 && !S.get('noShader')) {
      ctx.shadowColor = col;
      ctx.shadowBlur = 18 * glow;
    }
    ctx.fillStyle = col;
    rr(ctx, -len / 2, -th / 2, len, th, th / 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();

    /* 音符（先画 below，再画 above） */
    const list = L.notes;
    for (const above of [false, true]) {
      for (let i = 0; i < list.length; i++) {
        const n = list[i];
        if (!!n.above !== above) continue;
        if (n.time - t > 4) break;                 // 过早的音符不画
        if (n.type === 'hold' ? (n.endTime < t - 0.4) : (n.time < t - 0.4)) continue;
        drawNote(st, n, t, tr);
      }
    }
  }

  function noteAlphaMod(st, n, dx, dy) {
    let a = 1;
    if (S.get('fadeIn')) a *= U.clamp((1.35 - dy) / 1.0, 0, 1);
    if (S.get('fadeOut')) a *= U.clamp(dy / 1.1, 0, 1);
    if (S.get('nightcore')) a *= 1;
    return U.clamp(a, 0, 1);
  }

  function drawNote(st, n, t, tr) {
    const ctx = E.ctx;
    const p = noteWorld(n, t, st);
    if (!isFinite(p.x) || !isFinite(p.y)) return;
    const sx = wx2sx(p.x), sy = wy2sy(p.y);
    const u = PF.u;
    const w = p.hw * 2 * u;
    if (w < 1) return;
    const dy = Math.abs(p.y) ;
    const a = p.alpha * noteAlphaMod(st, n, 0, Math.abs(n.height - n._l.height.at(t)) * FLOW);
    if (a <= 0.004) return;
    /* 视口裁剪（留余量） */
    if (sx < -w * 4 || sx > PF.scrW + w * 4 || sy < -u * 3 || sy > PF.scrH + u * 3) {
      if (n.type !== 'hold') return;
    }
    const col = noteTint(n);
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(-p.rot);

    if (n.type === 'hold') {
      /* 长条（shortenHolds：上游 shorten_holds，视觉缩短但判定时长不变） */
      const hNow = n._l.height.at(t);
      let dyT = (n.endHeight - hNow) * FLOW * S.speedFactor() + (n.yOffset || 0);
      let dyH = (n.height - hNow) * FLOW * S.speedFactor() + (n.yOffset || 0);
      if (S.get('shortenHolds')) {
        const vis = dyT - dyH;
        dyT = dyH + Math.sign(vis || 1) * Math.min(Math.abs(vis), 0.32);
      }
      const tailY = -dyT * u;
      const headY = -dyH * u;
      const bw = w * 0.86;
      ctx.globalAlpha = a * 0.55;
      const g = ctx.createLinearGradient(0, headY, 0, tailY);
      g.addColorStop(0, col);
      g.addColorStop(1, U.hex2rgba('#7fd8ff', 0.15));
      ctx.fillStyle = g;
      rr(ctx, -bw / 2, Math.min(headY, tailY), bw, Math.abs(tailY - headY) || 2, bw * 0.4);
      ctx.fill();
      /* 尾部 */
      ctx.globalAlpha = a * 0.8;
      ctx.fillStyle = col;
      rr(ctx, -bw / 2, tailY - w * 0.09, bw, w * 0.18, w * 0.09);
      ctx.fill();
      /* 头部 */
      ctx.globalAlpha = a;
      ctx.fillStyle = '#ffffff';
      rr(ctx, -w / 2, headY - w * 0.21, w, w * 0.42, w * 0.16);
      ctx.fill();
      ctx.strokeStyle = col;
      ctx.lineWidth = Math.max(1, w * 0.05);
      rr(ctx, -w / 2 + ctx.lineWidth / 2, headY - w * 0.21 + ctx.lineWidth / 2, w - ctx.lineWidth, w * 0.42 - ctx.lineWidth, w * 0.14);
      ctx.stroke();
      if (n._holding && S.get('holdProgress')) {
        const prog = U.clamp((t - n.time) / Math.max(n.endTime - n.time, 0.01), 0, 1);
        ctx.globalAlpha = a;
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        rr(ctx, -bw / 2, headY - w * 0.21, bw * prog, w * 0.42, w * 0.12);
        ctx.fill();
      }
    } else if (n.type === 'drag') {
      ctx.globalAlpha = a;
      ctx.fillStyle = col;
      rr(ctx, -w / 2, -w * 0.11, w, w * 0.22, w * 0.11);
      ctx.fill();
    } else if (n.type === 'flick') {
      ctx.globalAlpha = a;
      ctx.fillStyle = col;
      const hh = w * 0.5;
      ctx.beginPath();
      ctx.moveTo(-w / 2, hh * 0.45);
      ctx.lineTo(-w / 2 + w * 0.28, -hh * 0.5);
      ctx.lineTo(0, -hh * 0.05);
      ctx.lineTo(w / 2 - w * 0.28, -hh * 0.5);
      ctx.lineTo(w / 2, hh * 0.45);
      ctx.lineTo(0, hh * 0.28);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.globalAlpha = a;
      const hh = w * 0.42;
      const g = ctx.createLinearGradient(0, -hh / 2, 0, hh / 2);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(1, U.hex2rgba('#d8e6ff', 0.92));
      ctx.fillStyle = g;
      rr(ctx, -w / 2, -hh / 2, w, hh, hh * 0.2);
      ctx.fill();
      ctx.strokeStyle = U.hex2rgba(n.tint ? col : '#ffffff', 0.9);
      ctx.lineWidth = Math.max(1, hh * 0.09);
      rr(ctx, -w / 2 + ctx.lineWidth, -hh / 2 + ctx.lineWidth, w - ctx.lineWidth * 2, hh - ctx.lineWidth * 2, hh * 0.14);
      ctx.stroke();
    }
    ctx.restore();
  }

  /* 打击特效 */
  function drawEffects(st) {
    const ctx = E.ctx;
    const nowS = performance.now() / 1000;
    for (const e of st.effects) {
      const age = nowS - e.t0;
      const k = U.clamp(age / e.dur, 0, 1);
      const cx = wx2sx(e.x), cy = wy2sy(e.y);
      const base = e.hw * 2 * PF.u * (e.size || 1);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-e.rot);
      const col = e.color || '#ffffff';
      if (!S.get('noShader')) {
        ctx.globalCompositeOperation = 'lighter';
        const im = RES.img.hit_fx;
        if (im && im.width) {
          ctx.globalAlpha = (1 - k) * 0.55;
          const sz = base * (2.2 + k * 2.0);
          ctx.drawImage(im, -sz / 2, -sz / 2, sz, sz * (im.height / im.width));
        }
        ctx.globalAlpha = (1 - k) * 0.5;
        const r = base * (0.4 + k * 1.5);
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(r, 1));
        g.addColorStop(0, U.hex2rgba(col, 0.85));
        g.addColorStop(0.55, U.hex2rgba(col, 0.25));
        g.addColorStop(1, U.hex2rgba(col, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(r, 1), 0, TAU);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = (1 - k) * 0.9;
      ctx.strokeStyle = col;
      ctx.lineWidth = Math.max(1, base * 0.08 * (1 - k) + 1);
      const rr2 = base * (0.45 + k * 0.95);
      rr(ctx, -rr2, -base * 0.16 - k * base * 0.2, rr2 * 2, base * 0.32 + k * base * 0.4, base * 0.14);
      ctx.stroke();
      if (S.get('particle')) {
        ctx.globalAlpha = (1 - k) * 0.75;
        ctx.fillStyle = col;
        for (let i = 0; i < 4; i++) {
          const ang = (i / 4) * TAU + k * 1.4;
          const d = base * (0.4 + k * 1.1);
          ctx.beginPath();
          ctx.arc(Math.cos(ang) * d, Math.sin(ang) * d * 0.6, Math.max(1, base * 0.05 * (1 - k)), 0, TAU);
          ctx.fill();
        }
      }
      ctx.restore();
    }
  }

  /* 判定文字 */
  function drawJudgeText(st) {
    const j = st.judge;
    if (!j || !S.get('showJudgeText')) return;
    const age = st.chartTime - j.t0;
    if (age < 0 || age > 0.5) return;
    const ctx = E.ctx;
    const k = U.clamp(age / 0.5, 0, 1);
    const scale = (1 + 0.28 * Math.max(0, 0.16 - age) / 0.16) * (S.get('judgeTextSize') || 1);
    const col = JUDGE_COLOR[j.j] || '#fff';
    const txt = JUDGE_TEXT[j.j] || '';
    ctx.save();
    ctx.globalAlpha = 1 - k * k;
    ctx.translate(PF.cx, PF.cy - PF.u * 0.32);
    ctx.scale(scale, scale);
    ctx.font = '900 ' + Math.round(PF.u * 0.13) + 'px "phigros", "bold", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (!S.get('noShader')) { ctx.shadowColor = col; ctx.shadowBlur = 18; }
    ctx.fillStyle = col;
    ctx.fillText(txt, 0, 0);
    if (j.dt && Math.abs(j.dt) > 0.001 && j.j !== 'miss') {
      ctx.font = '500 ' + Math.round(PF.u * 0.055) + 'px sans-serif';
      ctx.globalAlpha = (1 - k) * 0.75;
      ctx.fillStyle = '#fff';
      ctx.fillText((j.dt > 0 ? 'LATE' : 'EARLY') + ' ' + Math.round(Math.abs(j.dt) * 1000) + 'ms', 0, PF.u * 0.13);
    }
    ctx.restore();
  }

  /* 判定时间条（timing bar） */
  function drawTimingBar(st) {
    if (!S.get('timingBar.enabled')) return;
    const ctx = E.ctx;
    const w = PF.u * 1.15 * (Number(S.get('timingBar.size')) || 100) / 100;
    const h = Math.max(6, PF.u * 0.028);
    const cx = PF.cx + (Number(S.get('timingBar.x')) || 0) * PF.u;
    const cy = PF.cy - (Number(S.get('timingBar.y')) || 0) * PF.u;
    const rec = Number(S.get('timingBar.recordSeconds')) || 3;
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    rr(ctx, cx - w / 2, cy - h / 2, w, h, h / 2);
    ctx.fill();
    /* 判定窗刻度 */
    const wd = S.windows();
    const maxT = 0.25;
    const segs = [['perfect', '#f5f0a2'], ['good', '#8ad4ff'], ['bad', '#b7a6d6']];
    let last = 0;
    segs.forEach(([k, c]) => {
      const t = Math.min(wd[k], maxT);
      const x1 = cx - (t / maxT) * (w / 2), x2 = cx + (t / maxT) * (w / 2);
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = c;
      rr(ctx, x1, cy - h / 2, (x2 - x1), h, h / 2);
      ctx.fill();
      last = t;
    });
    ctx.globalAlpha = 0.9;
    const items = st.errorBar.filter(e => st.chartTime - e.t < rec);
    for (const e of items) {
      const dt = U.clamp(e.dt, -maxT, maxT);
      const x = cx + (dt / maxT) * (w / 2);
      const fade = 1 - (st.chartTime - e.t) / rec;
      ctx.globalAlpha = U.clamp(fade, 0, 1);
      ctx.fillStyle = JUDGE_COLOR[e.j] || '#fff';
      ctx.fillRect(x - 1, cy - h, 2, h * 2);
    }
    ctx.restore();
  }

  /* 触控调试 */
  function drawTouches(st) {
    if (!S.get('touchDebug')) return;
    const ctx = E.ctx;
    const im = RES.img.touch;
    ctx.save();
    ctx.globalAlpha = 0.85;
    for (const [, tp] of st.touches) {
      const sx = wx2sx(tp.x), sy = wy2sy(tp.y);
      if (im && im.width) ctx.drawImage(im, sx - 22, sy - 22, 44, 44);
      else { ctx.fillStyle = '#0f0'; ctx.beginPath(); ctx.arc(sx, sy, 16, 0, TAU); ctx.fill(); }
    }
    ctx.restore();
  }

  function drawProgress(st) {
    if (!S.get('showProgress')) return;
    const ctx = E.ctx;
    const total = Math.max(st.chart.duration || 1, 1);
    const k = U.clamp(st.chartTime / total, 0, 1);
    const h = Math.max(3, PF.scrH * 0.006);
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(0, 0, PF.scrW, h);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(0, 0, PF.scrW * k, h);
    ctx.restore();
  }

  function draw(st) {
    if (!E.ctx) return;
    const ctx = E.ctx;
    ctx.setTransform(Math.min(window.devicePixelRatio || 1, 2.5), 0, 0, Math.min(window.devicePixelRatio || 1, 2.5), 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    drawBackground(st);
    const t = st.chartTime;

    ctx.save();
    /* 镜像 */
    if (S.get('flipX')) {
      ctx.translate(PF.cx, 0); ctx.scale(-1, 1); ctx.translate(-PF.cx, 0);
    }
    /* 自动倒打 */
    if (st.flipCur) {
      ctx.translate(PF.cx, PF.cy); ctx.rotate(st.flipCur); ctx.translate(-PF.cx, -PF.cy);
    }

    drawNoise(st, t);

    const lines = st.chart.lines.slice().sort((a, b) => (a.zOrder || 0) - (b.zOrder || 0));
    for (const L of lines) drawLine(st, L, t);
    drawEffects(st);
    drawJudgeText(st);
    drawTouches(st);
    ctx.restore();

    drawTimingBar(st);
    drawProgress(st);
  }
  E.draw = draw;

  /* ============================ 对外 API ============================ */
  E.start = async function (chart, opts) {
    opts = opts || {};
    E.stopLoop();
    await E.loadRes();
    const st = prepare(chart);
    if (global.AudioEng) {
      global.AudioEng.setVolumeMusic(Number(S.get('volumeMusic')));
      if (global.AudioEng.hasMusic()) {
        global.AudioEng.play(0, S.get('nightcore'));
      }
    }
    E.resize();
    st.lastFrame = performance.now();
    st.t0 = st.lastFrame;
    E.state = st;
    DRAWN = false;
    loop();
    return st;
  };

  E.pause = function () {
    const st = E.state;
    if (!st || st.finished) return;
    st.paused = true;
    if (global.AudioEng) global.AudioEng.pause();
    if (E.onPauseChange) E.onPauseChange(true);
  };
  E.resume = function () {
    const st = E.state;
    if (!st || st.finished) return;
    st.paused = false;
    st.lastFrame = performance.now();
    if (global.AudioEng && st.music) global.AudioEng.resume();
    if (E.onPauseChange) E.onPauseChange(false);
    if (!raf) loop();
  };
  E.restart = function () {
    const st = E.state;
    if (!st) return;
    const chart = st.chart;
    E.start(chart);
  };
  E.quit = function () {
    E.stopLoop();
    stopMusic();
    E.state = null;
  };

  let DRAWN = false;
  global.Engine = E;
})(window);
