/* PhiraiAd Web - 谱面解析（RPE / Phira JSON / PEC 实验）、谱面包载入、纯配置转谱 */
(function (global) {
  'use strict';
  const U = global.U;
  const RPE_W = 1350, RPE_H = 900;

  /* ------------------------- 基础工具 ------------------------- */
  function triple(v) {
    if (typeof v === 'number') return v;
    if (Array.isArray(v)) {
      const d = Number(v[1]);
      return d ? Number(v[0]) / d : Number(v[0]) || 0;
    }
    if (v && typeof v === 'object') {
      if ('numerator' in v) return (Number(v.numerator) || 0) / (Number(v.denominator) || 1);
      if ('value' in v) return Number(v.value) || 0;
    }
    return 0;
  }

  /* BPM 列表 → 拍号到秒 */
  function makeTiming(bpmList, offsetSec) {
    const items = (bpmList || []).map(b => ({ beat: triple(b.startTime !== undefined ? b.startTime : b.start_time), bpm: Number(b.bpm) || 120 }))
      .filter(b => isFinite(b.beat) && b.bpm > 0)
      .sort((a, b) => a.beat - b.beat);
    if (!items.length) items.push({ beat: 0, bpm: 120 });
    if (items[0].beat > 1e-6) items.unshift({ beat: 0, bpm: items[0].bpm });
    const seg = [];
    let acc = 0;
    for (let i = 0; i < items.length; i++) {
      const cur = items[i];
      if (i > 0) acc += (cur.beat - items[i - 1].beat) * 60 / items[i - 1].bpm;
      seg.push({ beat: cur.beat, time: acc, bpm: cur.bpm });
    }
    function beatToTime(beat) {
      if (beat <= 0) return seg[0].time + beat * 60 / seg[0].bpm + offsetSec;
      let s = seg[0];
      for (let i = 0; i < seg.length; i++) {
        if (seg[i].beat <= beat) s = seg[i]; else break;
      }
      return s.time + (beat - s.beat) * 60 / s.bpm + offsetSec;
    }
    return { seg, beatToTime };
  }

  /* 事件 → 关键帧（tw 控制 [kf, kf+1] 区间，e0/e1 为 clamped 区间） */
  function eventKfs(events, beatToTime, factor, def) {
    const kfs = [];
    if (!events || !events.length) return kfs;
    const first = beatToTime(triple(events[0].startTime !== undefined ? events[0].startTime : events[0].start_time));
    if (def !== undefined && Math.abs(first) > 1e-6) kfs.push({ t: 0, v: def, tw: 1 });
    for (const e of events) {
      const st = e.startTime !== undefined ? e.startTime : e.start_time;
      const et = e.endTime !== undefined ? e.endTime : e.end_time;
      let sv = e.start, ev = e.end;
      if (factor === 'color') { sv = e.start; ev = e.end; }
      else { sv = Number(e.start) * factor; ev = Number(e.end) * factor; }
      const t0 = beatToTime(triple(st)), t1 = beatToTime(triple(et));
      const k = { t: t0, v: sv, tw: e.easingType || 1 };
      const e0 = e.easingLeft, e1 = e.easingRight;
      if (e0 !== undefined && e1 !== undefined && (e0 > 1e-6 || e1 < 1 - 1e-6)) { k.e0 = U.clamp(e0, 0, 1); k.e1 = U.clamp(e1, 0, 1); }
      kfs.push(k);
      kfs.push({ t: Math.max(t1, t0), v: ev, tw: 1 });
    }
    kfs.sort((a, b) => a.t - b.t);
    return kfs;
  }

  /* 速度事件 → 高度函数（对速度积分）；scale 为上游的 SPEED_RATIO 口径换算 */
  function buildHeight(layers, beatToTime, duration, scale) {
    scale = scale || 1;
    const evs = [];
    (layers || []).forEach(layer => {
      const arr = layer && (layer.speedEvents || layer.speed_events);
      if (arr && arr.length) evs.push(arr);
    });
    if (!evs.length) return { at: t => t, simple: true };
    const layer = evs[evs.length - 1];
    const segs = [];
    for (const e of layer) {
      const st = e.startTime !== undefined ? e.startTime : e.start_time;
      const et = e.endTime !== undefined ? e.endTime : e.end_time;
      segs.push({
        t0: beatToTime(triple(st)), t1: beatToTime(triple(et)),
        v0: Number(e.start) || 0, v1: Number(e.end) || 0,
        tw: e.easingType || 1, e0: e.easingLeft, e1: e.easingRight
      });
    }
    segs.sort((a, b) => a.t0 - b.t0);
    const tEnd = Math.max(duration, segs.length ? segs[segs.length - 1].t1 : 0, 1) + 0.5;
    const dt = 1 / 240, n = Math.ceil(tEnd / dt) + 2;
    const arr = new Float64Array(n);
    let si = 0, h = 0, lastV = 0;
    for (let i = 1; i < n; i++) {
      const t = (i - 1) * dt;
      while (si < segs.length && segs[si].t1 <= t) { lastV = segs[si].v1; si++; }
      let v = lastV;
      const s = segs[si];
      if (s && t >= s.t0 && t <= s.t1) {
        const span = s.t1 - s.t0;
        let u = span > 1e-9 ? (t - s.t0) / span : 1;
        if (s.e0 !== undefined && s.e1 !== undefined) {
          if (s.e1 <= s.e0) u = s.e0 <= 0 ? 0 : 1;
          else u = U.clamp((u - s.e0) / (s.e1 - s.e0), 0, 1);
        }
        v = s.v0 + (s.v1 - s.v0) * U.ease(s.tw, u);
      } else if (s && t < s.t0) {
        v = lastV;
      }
      h += v * dt * scale;
      arr[i] = h;
    }
    return {
      at: t => {
        if (t <= 0) return 0;
        const x = t / dt;
        const i = Math.floor(x);
        if (i + 1 >= n) return arr[n - 1] + (t - (n - 1) * dt) * (segs.length ? segs[segs.length - 1].v1 : 0) * scale;
        return arr[i] + (arr[i + 1] - arr[i]) * (x - i);
      },
      simple: false
    };
  }

  const NOTE_TYPES = { 1: 'tap', 2: 'hold', 3: 'flick', 4: 'drag' };

  /* ------------------------- RPE / Phira JSON ------------------------- */
  function parseRPE(obj, extra) {
    extra = extra || {};
    const meta = obj.META || obj.meta || {};
    let offset = Number(meta.offset);
    if (!isFinite(offset)) offset = 0;
    offset = Math.abs(offset) > 20 ? offset / 1000 : offset;  // 兼容 ms / s
    const bpmList = obj.BPMList || obj.bpmList || [];
    const timing = makeTiming(bpmList, offset);
    const b2t = timing.beatToTime;

    const rawLines = obj.judgeLineList || obj.judge_lines || [];
    const lines = [];
    let maxTime = 0;

    rawLines.forEach((rl, idx) => {
      const L = rl.Line || rl;                       // 兼容嵌套 Line
      const layers = rl.eventLayers || L.eventLayers || [{ alphaEvents: rl.alphaEvents, moveXEvents: rl.moveXEvents, moveYEvents: rl.moveYEvents, rotateEvents: rl.rotateEvents, speedEvents: rl.speedEvents }];
      const pick = key => {
        const out = [];
        (layers || []).forEach(layer => { if (layer && layer[key] && layer[key].length) out.push(layer[key]); });
        return out.length ? out[out.length - 1] : [];
      };
      const ext = rl.extended || L.extended || {};

      const line = {
        index: idx,
        name: rl.Name || rl.name || L.name || ('line' + idx),
        texture: rl.Texture || rl.texture || L.texture || '',
        father: (rl.father !== undefined ? rl.father : (L.father !== undefined ? L.father : null)),
        rotateWithFather: !!(rl.rotateWithFather !== undefined ? rl.rotateWithFather : L.rotateWithFather),
        zOrder: Number(rl.zOrder !== undefined ? rl.zOrder : (L.zOrder !== undefined ? L.zOrder : 0)) || 0,
        alpha: eventKfs(pick('alphaEvents'), b2t, 1 / 255, 1),
        moveX: eventKfs(pick('moveXEvents'), b2t, 2 / RPE_W, 0),
        /* 上游 RPE 的 y 轴向下为正，引擎世界坐标向上为正 → 取反 */
        moveY: eventKfs(pick('moveYEvents'), b2t, -2 / RPE_H, 0),
        rotate: eventKfs(pick('rotateEvents'), b2t, -1, 0),
        scaleX: eventKfs(ext.scaleXEvents, b2t, 1, 1),
        scaleY: eventKfs(ext.scaleYEvents, b2t, 1, 1),
        incline: eventKfs(ext.inclineEvents, b2t, 1, 0),
        color: eventKfs(ext.colorEvents, b2t, 'color', [255, 255, 255]),
        notes: [],
        speed: null
      };
      line.height = buildHeight(layers, b2t, 0, RPE_SPEED_RATIO); // 后面重算（需 duration）
      line._layers = layers;
      line._b2t = b2t;

      const rawNotes = (rl.notes || L.notes || rl.Notes || L.Notes || []);
      rawNotes.forEach(rn => {
        const type = NOTE_TYPES[rn.type] || 'tap';
        const st = rn.startTime !== undefined ? rn.startTime : rn.start_time;
        const et = rn.endTime !== undefined ? rn.endTime : rn.end_time;
        const time = b2t(triple(st));
        const endTime = type === 'hold' ? Math.max(b2t(triple(et)), time + 0.02) : time;
        const speed = Number(rn.speed) || 1;
        const n = {
          type,
          time,
          endTime,
          x: (Number(rn.positionX !== undefined ? rn.positionX : rn.position_x) || 0) / (RPE_W / 2),
          yOffset: -(Number(rn.yOffset !== undefined ? rn.yOffset : rn.y_offset) || 0) * 2 / RPE_H * speed,
          size: Number(rn.size) || 1,
          speed,
          above: rn.above === undefined ? true : !!Number(rn.above),
          fake: !!Number(rn.isFake !== undefined ? rn.isFake : rn.is_fake),
          alpha: U.clamp(Number(rn.alpha === undefined ? 255 : rn.alpha) / 255, 0, 1),
          visibleTime: Number(rn.visibleTime !== undefined ? rn.visibleTime : rn.visible_time) || 0,
          hitsound: rn.hitsound || null,
          tint: rn.tint || null,
          fxTint: rn.tintHitEffects || rn.tint_hit_effects || null,
          judgeArea: Number(rn.judgeArea !== undefined ? rn.judgeArea : rn.judge_area) || 1,
          line,
          status: 'wait', count: false
        };
        n.visible = n.visibleTime > 0.001;
        line.notes.push(n);
        maxTime = Math.max(maxTime, endTime);
      });
      lines.push(line);
    });

    const duration = Math.max(maxTime + 2, 3);
    lines.forEach(l => { l.height = buildHeight(l._layers, l._b2t, duration, RPE_SPEED_RATIO); });

    /* note.height / endHeight 与可见时间 */
    lines.forEach(l => {
      l.notes.forEach(n => {
        n.height = l.height.at(n.time);
        n.endHeight = n.type === 'hold' ? l.height.at(n.endTime) : n.height;
        const vis = n.visibleTime > 0.001 ? n.visibleTime : 0;
        n.visStart = vis > 0 ? n.time - vis : -1e9;
      });
      l.notes.sort((a, b) => a.time - b.time || a.x - b.x);
    });

    /* 噪域（Phigros 官谱 / 点缀星空 噪域格式） */
    const noise = (obj.blockAreaList || obj.block_area_list || []).map(b => ({
      topRight: pt(b.topRightPercentage),
      bottomLeft: pt(b.bottomLeftPercentage),
      appearTime: +b.appearTime || 0,
      enableTime: +b.enableTime || 0,
      disableTime: +b.disableTime || 0,
      disappearTime: +b.disappearTime || 0,
      isSubtract: !!b.isSubtract,
      rotateEvents: (b.rotateEvents || []).map(e => ({ anchor: pt(e.anchor), time: +e.time || 0, rotation: +e.rotation || 0, ease: e.easeType | 0 })),
      moveEvents: (b.moveEvents || []).map(e => ({ end: pt(e.endPosition), time: +e.time || 0, easeX: e.easeTypeX | 0, easeY: e.easeTypeY | 0 })),
      scaleEvents: (b.scaleEvents || []).map(e => ({ anchor: pt(e.anchor), time: +e.time || 0, scale: pt(e.scale), easeX: e.easeTypeX | 0, easeY: e.easeTypeY | 0 }))
    }));

    const flipIntervals = (obj.autoFlipIntervals || obj.auto_flip_intervals || []).map(r => ({ start: +r.start || 0, end: +r.end || 0 }));

    const info = {
      name: extra.name || obj.name || obj.Name || '未命名谱面',
      artist: extra.artist || obj.artist || obj.composer || '',
      charter: extra.charter || obj.charter || obj.Chart || '',
      difficulty: extra.difficulty !== undefined ? Number(extra.difficulty) : (obj.difficulty !== undefined ? Number(obj.difficulty) : 0),
      level: extra.level || obj.level || '',
      illustration: extra.illustration || obj.illustration || ''
    };

    return finalize({
      format: 'rpe',
      info,
      offset: offset + (extra.audioOffset || 0),
      duration,
      lines,
      noise,
      flipIntervals,
      raw: obj,
      timing
    });
  }

  /* ------------ Phigros 官方格式 1 / 3（.pez 内 chart.json 的常见格式） ------------
     对齐上游 prpr/src/parse/pgr.rs：
       · 时间单位为 1/32 拍，r = 60/32/bpm 秒
       · 线位移 v3 为 (start, start2)∈[0,1]，x = -1+2*start，y(internal, 向下为正) = -1+2*start2
       · v1 的 start 打包为 x*1000+y（x∈[-880,880]，y∈[-520,520]）
       · 速度事件只有恒定 value，按时间积分得到“高度”，并 /HEIGHT_RATIO
       · 音符 type：1 tap / 2 drag / 3 hold / 4 flick；positionX 上下限 ±8.889 → 世界 ±1
     引擎的世界坐标 y 向上为正，故内部“向下为正”的量在此取反。 */
  const PGR_NOTE_TYPES = { 1: 'tap', 2: 'drag', 3: 'hold', 4: 'flick' };
  const PGR_X_FACTOR = 2 * 9 / 160;      /* 8.889 * 0.1125 = 1 */
  const HEIGHT_RATIO = 900 / 1600;
  /* 上游 prpr RPE: SPEED_RATIO = 10 / 45 / HEIGHT_RATIO */
  const RPE_SPEED_RATIO = 10 / 45 / HEIGHT_RATIO;

  function pgrHeight(evs, r, duration) {
    const segs = (evs || []).map(e => {
      const st = e.startTime !== undefined ? e.startTime : e.start_time;
      const et = e.endTime !== undefined ? e.endTime : e.end_time;
      return {
        t0: Math.max(0, (Number(st) || 0) * r),
        t1: Math.max(0, (Number(et) || 0) * r),
        v: Number(e.value) || 0
      };
    }).filter(s => isFinite(s.t1) && s.t1 >= s.t0).sort((a, b) => a.t0 - b.t0);
    if (!segs.length) return { at: t => t, simple: true };
    const dt = 1 / 240;
    const tEnd = Math.max(duration, segs[segs.length - 1].t1) + 0.5;
    const n = Math.ceil(tEnd / dt) + 2;
    const arr = new Float64Array(n);
    let si = 0, h = 0, lastV = 0;
    for (let i = 1; i < n; i++) {
      const t = (i - 1) * dt;
      while (si < segs.length && segs[si].t1 <= t) { lastV = segs[si].v; si++; }
      let v = lastV;
      const s = segs[si];
      if (s && t >= s.t0 && t <= s.t1) v = s.v;
      h += v * dt;
      arr[i] = h;
    }
    return {
      at: t => {
        if (t <= 0) return 0;
        const x = t / dt, i = Math.floor(x);
        if (i + 1 >= n) return arr[n - 1] + (t - (n - 1) * dt) * (si < segs.length ? segs[si].v : (segs.length ? segs[segs.length - 1].v : 0));
        return arr[i] + (arr[i + 1] - arr[i]) * (x - i);
      },
      simple: false
    };
  }

  function parsePGR(obj, extra) {
    extra = extra || {};
    const version = Number(obj.formatVersion !== undefined ? obj.formatVersion : obj.format_version) || 3;
    const offset = Number(obj.offset) || 0;   /* Phigros 的 offset 单位是秒 */
    const rawLines = obj.judgeLineList || obj.judge_lines || [];
    const lines = [];
    let maxTime = 0;

    rawLines.forEach((rl, idx) => {
      const bpm = Number(rl.bpm) || 120;
      const r = 60 / 32 / bpm;
      const t2s = v => (Number(v) || 0) * r;
      const num = v => Number(v) || 0;

      /* 事件 → 关键帧；恒定缓动（上游 Keyframe::new(..., 2) 即线性） */
      const kfs = (evs, fn, def) => {
        const out = [];
        (evs || []).forEach(e => {
          const t0 = Math.max(0, t2s(e.startTime !== undefined ? e.startTime : e.start_time));
          const t1 = Math.max(0, t2s(e.endTime !== undefined ? e.endTime : e.end_time));
          const v0 = fn(e, 0), v1 = fn(e, 1);
          out.push({ t: t0, v: v0, tw: 1 });
          out.push({ t: Math.max(t1, t0), v: v1, tw: 1 });
        });
        out.sort((a, b) => a.t - b.t);
        if (!out.length) out.push({ t: 0, v: def, tw: 1 });
        else if (out[0].t > 1e-6) out.unshift({ t: 0, v: out[0].v, tw: 1 });
        return out;
      };

      const moveEvents = rl.judgeLineMoveEvents || rl.judge_line_move_events || rl.moveEvents;
      const moveXOf = version === 1
        ? (e, w) => { const raw = num(w ? e.end : e.start); return (-880 + (raw - raw % 1000) / 1000 * 2) / 880; }
        : (e, w) => -1 + num(w ? e.end : e.start) * 2;
      const moveYOf = version === 1
        ? (e, w) => (520 - num(w ? e.end : e.start) % 1000 * 2) / 520
        : (e, w) => 1 - num(w ? e.end2 : e.start2) * 2;

      const line = {
        index: idx,
        name: rl.name || ('line' + idx),
        texture: rl.Texture || rl.texture || '',
        father: null,
        rotateWithFather: false,
        zOrder: 0,
        alpha: kfs(rl.judgeLineDisappearEvents || rl.judge_line_disappear_events || rl.alphaEvents, (e, w) => num(w ? e.end : e.start), 1),
        moveX: kfs(moveEvents, moveXOf, 0),
        moveY: kfs(moveEvents, moveYOf, 0),
        rotate: kfs(rl.judgeLineRotateEvents || rl.judge_line_rotate_events || rl.rotateEvents, (e, w) => -num(w ? e.end : e.start), 0),
        scaleX: [], scaleY: [], incline: [], color: [],
        notes: [],
        height: null,
        speedEvents: rl.speedEvents || rl.speed_events || [],
        bpmRate: r
      };

      const addNotes = (arr, above) => {
        (arr || []).forEach(rn => {
          const type = PGR_NOTE_TYPES[rn.type] || 'tap';
          const time = t2s(rn.time);
          const hold = Number(rn.holdTime !== undefined ? rn.holdTime : rn.hold_time) || 0;
          const endTime = type === 'hold' ? Math.max(t2s(num(rn.time) + hold), time + 0.03) : time;
          line.notes.push({
            type, time, endTime,
            x: num(rn.positionX !== undefined ? rn.positionX : rn.position_x) * PGR_X_FACTOR,
            yOffset: 0,
            size: 1,
            speed: num(rn.speed) || 1,
            above: !!above, fake: false, alpha: 1,
            visibleTime: 0, visStart: -1e9,
            hitsound: null, tint: null, fxTint: null, judgeArea: 1,
            line, status: 'wait', count: false, height: 0, endHeight: 0
          });
          maxTime = Math.max(maxTime, endTime);
        });
      };
      addNotes(rl.notesAbove || rl.notes_above, true);
      addNotes(rl.notesBelow || rl.notes_below, false);

      lines.push(line);
    });

    const duration = Math.max(maxTime + 2, 3);
    lines.forEach(l => {
      const h = pgrHeight(l.speedEvents, l.bpmRate, duration);
      l.height = h.simple ? h : { at: t => h.at(t) / HEIGHT_RATIO, simple: false };
      l.notes.forEach(n => {
        n.height = l.height.at(n.time);
        n.endHeight = n.type === 'hold' ? l.height.at(n.endTime) : n.height;
      });
      l.notes.sort((a, b) => a.time - b.time || a.x - b.x);
    });

    const noise = (obj.blockAreaList || obj.block_area_list || []).map(b => ({
      topRight: pt(b.topRightPercentage),
      bottomLeft: pt(b.bottomLeftPercentage),
      appearTime: +b.appearTime || 0,
      enableTime: +b.enableTime || 0,
      disableTime: +b.disableTime || 0,
      disappearTime: +b.disappearTime || 0,
      isSubtract: !!b.isSubtract,
      rotateEvents: [], moveEvents: [], scaleEvents: []
    }));

    const info = {
      name: extra.name || obj.name || '未命名谱面',
      artist: extra.artist || obj.artist || obj.composer || '',
      charter: extra.charter || obj.charter || '',
      difficulty: extra.difficulty !== undefined ? Number(extra.difficulty) : (obj.difficulty !== undefined ? Number(obj.difficulty) : 0),
      level: extra.level || obj.level || '',
      illustration: extra.illustration || ''
    };

    return finalize({
      format: 'pgr' + version,
      info,
      offset,
      duration,
      lines,
      noise,
      flipIntervals: [],
      raw: obj,
      timing: null
    });
  }

  /* 自动判别 JSON 谱面格式：RPE（META/BPMList/eventLayers）还是 Phigros（formatVersion/notesAbove） */
  function parseChartJSON(obj, extra) {
    obj = obj || {};
    const rpeLike = !!(obj.META || obj.BPMList || obj.bpmList || obj.eventLayers);
    const first = rpeLike ? parseRPE(obj, extra) : parsePGR(obj, extra);
    if ((first.stats && first.stats.playable) > 0) return first;
    /* 判定反了就换另一种再解析一次，取音符更多的一方 */
    try {
      const alt = rpeLike ? parsePGR(obj, extra) : parseRPE(obj, extra);
      if ((alt.stats && alt.stats.playable) > (first.stats && first.stats.playable)) return alt;
    } catch (e) { }
    return first;
  }

  function pt(p) {
    if (!p) return { x: 0, y: 0 };
    return { x: Number(p.x) || 0, y: Number(p.y) || 0 };
  }

  function finalize(chart) {
    let playable = 0, tap = 0, drag = 0, hold = 0, flick = 0;
    chart.lines.forEach(l => l.notes.forEach(n => {
      if (n.fake) return;
      playable++;
      if (n.type === 'tap') tap++;
      else if (n.type === 'drag') drag++;
      else if (n.type === 'hold') hold++;
      else flick++;
    }));
    chart.stats = { playable, tap, drag, hold, flick };
    chart.numNotes = playable || 1;
    return chart;
  }

  /* ------------------------- PEC（实验性） ------------------------- */
  function parsePEC(text, extra) {
    /* PEC 为文本谱面：& / # 事件行 + n1..n4 音符行
       本实现按最通用写法解析，音符时间在“拍”上，靠 # bp 提供 BPM */
    const lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    let bpm = 120, offset = 0;
    const notes = [];
    const bpmList = [];
    const events = { alpha: [], moveX: [], moveY: [], rotate: [] };
    let firstLine = true;

    const num = (s, d) => { const v = parseFloat(s); return isFinite(v) ? v : d; };
    for (const line of lines) {
      if (firstLine && line[0] === '&') {
        firstLine = false;
        const t = line.slice(1).trim().split(/\s+/);
        if (t.length >= 1) offset = num(t[0], 0);
        continue;
      }
      firstLine = false;
      if (line[0] === '#') {
        const t = line.slice(1).trim().split(/\s+/);
        const cmd = (t[0] || '').toLowerCase();
        if (cmd === 'bp' || cmd === 'bpm') bpmList.push({ bpm: num(t[2] !== undefined ? t[2] : t[1], bpm), beat: num(t[1], 0) });
        else if (cmd === 'ca') events.alpha.push({ beat: num(t[1], 0), value: num(t[2], 1) });
        else if (cmd === 'cv' || cmd === 'cm') {
          events.moveX.push({ beat: num(t[1], 0), value: num(t[2], 0) });
          events.moveY.push({ beat: num(t[1], 0), value: num(t[3], 0) });
        } else if (cmd === 'cr') events.rotate.push({ beat: num(t[1], 0), value: num(t[2], 0) });
        continue;
      }
      if (line[0] === 'n' || line[0] === '&') {
        const t = line.replace(/^[n&]/, '').trim().split(/\s+/);
        let kind = 1, i = 0;
        if (/^n\d/.test(line)) { kind = parseInt(line[1], 10); i = 0; }
        const x = num(t[i], 0);
        const above = t[i + 1] === undefined ? 1 : num(t[i + 1], 1);
        const beat = num(t[i + 2], 0);
        const hold = num(t[i + 3], 0);
        notes.push({ kind, x, above, beat, hold });
      }
    }
    if (!bpmList.length) bpmList.push({ bpm, beat: 0 });
    const timing = makeTiming(bpmList, 0);
    const b2t = timing.beatToTime;

    const lineObj = {
      index: 0, name: 'pec', texture: '', father: null, rotateWithFather: false, zOrder: 0,
      alpha: events.alpha.slice().sort((a, b) => a.beat - b.beat).map(e => ({ t: b2t(e.beat), v: e.value, tw: 1 })),
      moveX: events.moveX.slice().sort((a, b) => a.beat - b.beat).map(e => ({ t: b2t(e.beat), v: e.value / (RPE_W / 2) * 0.5, tw: 1 })),
      moveY: events.moveY.slice().sort((a, b) => a.beat - b.beat).map(e => ({ t: b2t(e.beat), v: e.value / (RPE_H / 2) * 0.5, tw: 1 })),
      rotate: events.rotate.slice().sort((a, b) => a.beat - b.beat).map(e => ({ t: b2t(e.beat), v: -e.value, tw: 1 })),
      scaleX: [], scaleY: [], incline: [], color: [], notes: [], height: { at: t => t, simple: true }
    };
    let maxT = 0;
    notes.forEach(rn => {
      const type = rn.kind === 1 ? 'tap' : rn.kind === 2 ? 'drag' : rn.kind === 3 ? 'hold' : 'flick';
      const time = b2t(rn.beat);
      const endTime = type === 'hold' ? Math.max(b2t(rn.beat + rn.hold), time + 0.05) : time;
      lineObj.notes.push({
        type, time, endTime,
        x: U.clamp(rn.x / (RPE_W / 2), -2, 2),
        yOffset: 0, size: 1, speed: 1, above: !!rn.above, fake: false, alpha: 1,
        visibleTime: 0, visStart: -1e9, hitsound: null, tint: null, fxTint: null, judgeArea: 1,
        line: lineObj, status: 'wait', count: false, height: time, endHeight: endTime
      });
      maxT = Math.max(maxT, endTime);
    });
    lineObj.notes.sort((a, b) => a.time - b.time);
    return finalize({
      format: 'pec',
      info: {
        name: extra.name || 'PEC 谱面', artist: extra.artist || '', charter: extra.charter || '',
        difficulty: extra.difficulty || 0, level: extra.level || '', illustration: extra.illustration || ''
      },
      offset: offset / 1000,
      duration: Math.max(maxT + 2, 3),
      lines: [lineObj],
      noise: [],
      flipIntervals: [],
      raw: null,
      timing
    });
  }

  /* ------------------------- 谱面包载入 ------------------------- */
  /* 不依赖后缀：仅用扩展名/MIME 粗分“演奏素材”，谱面与元数据一律靠内容嗅探 */
  const AUDIO_EXT = /\.(mp3|ogg|oga|wav|m4a|aac|flac|opus|wma|aiff?|ape)$/i;
  const IMG_EXT = /\.(png|jpe?g|webp|gif|bmp|avif|svg|tiff?)$/i;
  const CHART_HINT = /(chart|谱面|谱|diff|level|map)/i;
  const baseName = p => String(p || '').split(/[\\/]/).pop();
  const stem = p => baseName(p).replace(/\.[^.]+$/, '');

  async function bundleFromFiles(files) {
    const list = Array.from(files).filter(f => f && (f.size === undefined || f.size > 0));
    let chartFile = null, audioFile = null, imageFile = null, infoFile = null;

    const isAudio = f => AUDIO_EXT.test(f.name) || /^audio\//.test(f.type || '');
    const isImage = f => IMG_EXT.test(f.name) || /^image\//.test(f.type || '');
    const isMeta = f => /^info(\.[^.]*)?$/i.test(stem(f.name));

    const rest = [];
    for (const f of list) {
      if (isMeta(f)) { if (!infoFile) infoFile = f; continue; }
      if (isAudio(f)) { if (!audioFile) audioFile = f; continue; }
      if (isImage(f)) { if (!imageFile) imageFile = f; continue; }
      rest.push(f);
    }

    /* 谱面识别：完全按内容。
       JSON 看是否含判定线 / BPM 结构；文本看是否像 PEC（&/# 事件行 + n1..n4 音符行）。
       .pez 内常同时有 chart.json 与 chart_stats.json，只能这样区分。 */
    const looksLikeChart = o => !!(o && typeof o === 'object' &&
      (o.judgeLineList || o.judge_lines || o.BPMList || o.bpmList ||
        o.formatVersion !== undefined || o.format_version !== undefined));
    const looksLikePEC = t => /(^|\n)\s*[&#]/.test(t) && /(^|\n)\s*n[1-4]\b/i.test(t);

    const candidates = rest.slice().sort((a, b) => {
      const score = f => (/^chart$/i.test(stem(f.name)) ? 0 : (CHART_HINT.test(stem(f.name)) ? 1 : 2));
      return score(a) - score(b);
    });

    let chartObj = null, chartText = null;
    for (const f of candidates) {
      let t;
      try { t = await f.text(); } catch (e) { continue; }
      t = (t || '').replace(/^\uFEFF/, '').trim();
      if (!t) continue;
      if (t[0] === '{' || t[0] === '[') {
        let o = null;
        try { o = JSON.parse(t); } catch (e) { o = null; }
        if (looksLikeChart(o)) { chartFile = f; chartObj = o; chartText = t; break; }
      } else if (looksLikePEC(t)) {
        chartFile = f; chartText = t; break;
      }
      /* 其它文本（stats / 说明 / 日志）继续往后找 */
    }

    if (!chartFile) {
      const yml = rest.find(f => /\.(ya?ml)$/i.test(f.name));
      if (yml) throw new Error('该谱面为旧版 YAML 格式（' + yml.name + '），请先用 Phira 打开并另存为 chart.json');
      throw new Error('未找到谱面内容（任意后缀均可：JSON 或 PEC 文本；.pez / .zip 可直接拖入）');
    }

    const extra = { name: '', artist: '', charter: '', difficulty: 0, level: '', illustration: '' };
    if (infoFile) {
      try {
        const txt = await infoFile.text();
        const head = txt.replace(/^\uFEFF/, '').trim();
        let info = null;
        if (head[0] === '{') { try { info = JSON.parse(head); } catch (e) { info = null; } }
        if (info) {
          Object.assign(extra, {
            name: info.name || info.song || info.title || '', artist: info.composer || info.artist || '',
            charter: info.charter || info.chart_by || '', difficulty: info.difficulty || 0,
            level: info.level || info.difficulty_name || '', illustration: info.illustration || ''
          });
        } else {
          const get = k => {
            const m = txt.match(new RegExp('^\\s*' + k + '\\s*[:=]\\s*(.+)$', 'im'));
            return m ? m[1].trim().replace(/^["']|["']$/g, '') : '';
          };
          extra.name = get('name') || get('song') || get('title');
          extra.artist = get('composer') || get('artist');
          extra.charter = get('charter') || get('chart_by');
          extra.level = get('level') || get('difficulty');
          extra.difficulty = Number(get('difficulty')) || 0;
          extra.illustration = get('illustration');
        }
      } catch (e) { }
    }

    let chart;
    const text = chartText !== null ? chartText : await chartFile.text();
    const head = text.replace(/^\uFEFF/, '').trim();
    if (chartObj || head[0] === '{' || head[0] === '[') {
      let obj = chartObj;
      if (!obj) {
        try { obj = JSON.parse(head); } catch (e) { throw new Error('谱面 JSON 解析失败：' + e.message); }
      }
      chart = parseChartJSON(obj, extra);
      chart.info.name = extra.name || chart.info.name;
      chart.info.artist = extra.artist || chart.info.artist;
      chart.info.charter = extra.charter || chart.info.charter;
    } else {
      chart = parsePEC(text, extra);
    }
    if (!chart.info.name || chart.info.name === '未命名谱面') {
      chart.info.name = chartFile.name.replace(/\.[^.]+$/, '');
    }
    chart.info.fileName = chartFile.name;

    return {
      chart,
      chartText: text,
      audio: audioFile ? new Blob([await audioFile.arrayBuffer()], { type: audioFile.type || 'audio/mpeg' }) : null,
      illustration: imageFile ? new Blob([await imageFile.arrayBuffer()], { type: imageFile.type || 'image/png' }) : null,
      files: list.map(f => ({ name: f.webkitRelativePath || f.name, size: f.size })),
      infoFile: infoFile ? infoFile.name : null
    };
  }

  /* ------------------------- ZIP 解包 ------------------------- */
  async function readZip(buf) {
    const dv = new DataView(buf);
    // 找 EOCD
    let eocd = -1;
    for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 66000); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('不是有效的 zip 文件');
    const count = dv.getUint16(eocd + 10, true);
    let off = dv.getUint32(eocd + 16, true);
    const out = [];
    for (let i = 0; i < count; i++) {
      if (dv.getUint32(off, true) !== 0x02014b50) break;
      const method = dv.getUint16(off + 10, true);
      const csize = dv.getUint32(off + 20, true);
      const usize = dv.getUint32(off + 24, true);
      const nlen = dv.getUint16(off + 28, true);
      const elen = dv.getUint16(off + 30, true);
      const clen = dv.getUint16(off + 32, true);
      const lho = dv.getUint32(off + 42, true);
      const name = new TextDecoder('utf-8').decode(new Uint8Array(buf, off + 46, nlen));
      off += 46 + nlen + elen + clen;
      if (name.endsWith('/')) continue;
      const lnlen = dv.getUint16(lho + 26, true);
      const lelen = dv.getUint16(lho + 28, true);
      const dataStart = lho + 30 + lnlen + lelen;
      const raw = new Uint8Array(buf, dataStart, csize);
      let data;
      if (method === 0) data = raw;
      else if (method === 8) {
        if (typeof DecompressionStream === 'undefined') throw new Error('当前浏览器不支持 zip 解压');
        const ds = new DecompressionStream('deflate-raw');
        const stream = new Blob([raw]).stream().pipeThrough(ds);
        data = new Uint8Array(await new Response(stream).arrayBuffer());
      } else throw new Error('不支持的压缩方式: ' + method);
      if (usize && data.length && usize !== data.length) { /* 大小不符时忽略 */ }
      out.push({ name, data });
    }
    return out;
  }

  async function bundleFromZip(arrayBuffer, zipName) {
    const entries = await readZip(arrayBuffer);
    const files = entries.map(e => new File([e.data], e.name.split('/').pop(), { type: guessType(e.name) }));
    /* 保留相对路径用于识别子目录 */
    entries.forEach((e, i) => { try { Object.defineProperty(files[i], 'webkitRelativePath', { value: e.name }); } catch (err) { } });
    const b = await bundleFromFiles(files);
    if ((!b.chart.info.name || b.chart.info.name === '未命名谱面') && zipName) b.chart.info.name = zipName.replace(/\.(zip|pez)$/i, '');
    return b;
  }

  function guessType(name) {
    if (/\.mp3$/i.test(name)) return 'audio/mpeg';
    if (/\.ogg$/i.test(name)) return 'audio/ogg';
    if (/\.wav$/i.test(name)) return 'audio/wav';
    if (/\.png$/i.test(name)) return 'image/png';
    if (/\.jpe?g$/i.test(name)) return 'image/jpeg';
    if (/\.json$/i.test(name)) return 'application/json';
    return 'application/octet-stream';
  }

  /* ------------------------- IndexedDB 谱面库 ------------------------- */
  const DB_NAME = 'phiraiad-web', DB_VER = 1;
  let dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains('charts')) d.createObjectStore('charts', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('blobs')) d.createObjectStore('blobs');
      };
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
    return dbp;
  }
  async function tx(store, mode, fn) {
    const d = await db();
    return new Promise((res, rej) => {
      const t = d.transaction(store, mode);
      const s = t.objectStore(store);
      const r = fn(s);
      t.oncomplete = () => res(r && r.result);
      t.onerror = () => rej(t.error);
    });
  }

  const Lib = {
    /* 保存谱面包：charts 存元数据，blobs 存谱面/音频/曲绘 */
    async save(bundle, id) {
      id = id || U.uid();
      const meta = {
        id,
        name: bundle.chart.info.name,
        artist: bundle.chart.info.artist,
        charter: bundle.chart.info.charter,
        difficulty: bundle.chart.info.difficulty,
        level: bundle.chart.info.level,
        format: bundle.chart.format,
        notes: bundle.chart.stats.playable,
        duration: bundle.chart.duration,
        files: bundle.files,
        addedAt: Date.now(),
        hasAudio: !!bundle.audio,
        hasImage: !!bundle.illustration
      };
      await tx('charts', 'readwrite', s => s.put(meta));
      await tx('blobs', 'readwrite', s => {
        s.put(bundle.chartText, id + ':chart');
        if (bundle.audio) s.put(bundle.audio, id + ':audio');
        if (bundle.illustration) s.put(bundle.illustration, id + ':image');
      });
      return meta;
    },
    async all() {
      const arr = await tx('charts', 'readonly', s => s.getAll());
      return (arr || []).sort((a, b) => b.addedAt - a.addedAt);
    },
    async getBlob(id, kind) { return tx('blobs', 'readonly', s => s.get(id + ':' + kind)); },
    async remove(id) {
      await tx('charts', 'readwrite', s => s.delete(id));
      await tx('blobs', 'readwrite', s => {
        s.delete(id + ':chart'); s.delete(id + ':audio'); s.delete(id + ':image');
      });
    },
    async loadChart(id) {
      const text = await Lib.getBlob(id, 'chart');
      if (!text) throw new Error('谱面数据丢失');
      const chart = /^\s*[#&n]/.test(text.slice(0, 80)) && !/^\s*[{[]/.test(text.slice(0, 80))
        ? parsePEC(text, {}) : parseChartJSON(JSON.parse(text), {});
      const audio = await Lib.getBlob(id, 'audio');
      const image = await Lib.getBlob(id, 'image');
      return { chart, audio: audio || null, illustration: image || null };
    }
  };

  /* ------------------------- 纯配置转谱 ------------------------- */
  /* 支持两种写法：
     1) JSON：{name,bpm,offset,duration,lines:[{x,y,rotate,notes:[{t,type,x,hold,speed,size}]}]}
     2) 紧凑行：每行 "时间,类型[,x][,持续]"（类型 tap/drag/hold/flick 或 1..4），多判定线用 --- 分隔 */
  function buildFromConfig(cfg, rawText) {
    let conf = cfg;
    if (!conf && rawText) conf = parseCompact(rawText);
    const bpm = Number(conf.bpm) || 180;
    const offset = Number(conf.offset) || 0;
    const linesCfg = conf.lines && conf.lines.length ? conf.lines : [{ notes: conf.notes || [] }];
    let duration = Number(conf.duration) || 0;

    const lines = linesCfg.map((lc, li) => {
      const line = {
        index: li, name: lc.name || ('line' + li), texture: lc.texture || '', father: null,
        rotateWithFather: false, zOrder: lc.z || 0,
        alpha: kfStatic(Number(lc.alpha === undefined ? 1 : lc.alpha)),
        moveX: kfStatic(Number(lc.x) || 0), moveY: kfStatic(Number(lc.y) || 0),
        rotate: kfStatic(-(Number(lc.rotate) || 0)),
        scaleX: [], scaleY: [], incline: [], color: [], notes: [],
        height: { at: t => t, simple: true }
      };
      (lc.notes || []).forEach(rn => {
        const type = typeof rn.type === 'number' ? (NOTE_TYPES[rn.type] || 'tap') : (rn.type || 'tap');
        const time = Number(rn.t !== undefined ? rn.t : rn.time) || 0;
        const hold = Number(rn.hold) || 0;
        const endTime = type === 'hold' ? time + Math.max(hold, 0.05) : time;
        const n = {
          type, time, endTime,
          x: Number(rn.x) || 0,
          yOffset: 0,
          size: Number(rn.size) || 1,
          speed: Number(rn.speed) || 1,
          above: rn.above === undefined ? true : !!rn.above,
          fake: !!rn.fake,
          alpha: 1, visibleTime: 0, visStart: -1e9,
          hitsound: rn.sound || null, tint: rn.tint || null, fxTint: rn.fxTint || null,
          judgeArea: 1, line, status: 'wait', count: false,
          height: time, endHeight: endTime
        };
        line.notes.push(n);
        duration = Math.max(duration, endTime);
      });
      line.notes.sort((a, b) => a.time - b.time);
      return line;
    });

    const chart = finalize({
      format: 'config',
      info: {
        name: conf.name || '配置谱面', artist: conf.artist || '', charter: conf.charter || '纯配置',
        difficulty: conf.difficulty || 0, level: conf.level || ''
      },
      offset: offset / 1000,
      duration: Math.max(duration + 2, 3),
      lines,
      noise: [],
      flipIntervals: [],
      raw: conf,
      timing: makeTiming([{ bpm, beat: 0 }], 0)
    });
    chart.config = conf;
    chart.configBpm = bpm;
    return chart;
  }

  function kfStatic(v) { return [{ t: 0, v: v, tw: 1 }]; }

  function parseCompact(text) {
    const blocks = text.split(/^---+$/m);
    const conf = { name: '配置谱面', bpm: 180, offset: 0, duration: 0, lines: [] };
    blocks.forEach((blk, bi) => {
      const lc = { notes: [] };
      blk.split(/\r?\n/).forEach(lineRaw => {
        const line = lineRaw.trim();
        if (!line || line.startsWith('//') || line.startsWith('#')) {
          if (line.startsWith('#')) {
            const m = line.match(/^#\s*(\w+)\s*[:=]\s*(.+)$/);
            if (m) {
              const k = m[1].toLowerCase(), v = m[2].trim();
              if (k === 'name') conf.name = v;
              else if (k === 'bpm') conf.bpm = Number(v) || 180;
              else if (k === 'artist') conf.artist = v;
              else if (k === 'x') lc.x = Number(v);
              else if (k === 'y') lc.y = Number(v);
              else if (k === 'rotate') lc.rotate = Number(v);
            }
          }
          return;
        }
        const p = line.split(/[,\s]+/).map(s => s.trim()).filter(s => s !== '');
        if (!p.length) return;
        const t = Number(p[0]) || 0;
        let type = p[1] || 'tap';
        if (/^\d$/.test(type)) type = NOTE_TYPES[Number(type)] || 'tap';
        const note = { t, type };
        if (p[2] !== undefined && p[2] !== '') note.x = Number(p[2]) || 0;
        if (p[3] !== undefined && p[3] !== '') note.hold = Number(p[3]) || 0;
        lc.notes.push(note);
        conf.duration = Math.max(conf.duration, t + (note.hold || 0));
      });
      if (lc.notes.length) conf.lines.push(lc);
    });
    return conf;
  }

  /* 导出为 RPE 谱面 JSON */
  function toRPE(chart) {
    const conf = chart.config || chart.raw;
    if (!conf) return null;
    const bpm = chart.configBpm || Number(conf.bpm) || 180;
    const notesToRPE = (notes) => notes.map(n => {
      const st = n.time;
      const beat = st * bpm / 60;
      const et = (n.endTime || n.time) * bpm / 60;
      return {
        type: n.type === 'hold' ? 2 : n.type === 'flick' ? 3 : n.type === 'drag' ? 4 : 1,
        above: n.above ? 1 : 0,
        startTime: [Math.round(beat * 1000), 1000, 1],
        endTime: [Math.round(et * 1000), 1000, 1],
        positionX: n.x * (RPE_W / 2), positionY: 0,
        yOffset: 0, alpha: 255, hitsound: '', size: n.size || 1, speed: 1, isFake: n.fake ? 1 : 0,
        visibleTime: 0
      };
    });
    const judgeLineList = chart.lines.map((l, i) => ({
      Name: l.name, Texture: 'line.png',
      eventLayers: [{
        alphaEvents: [{ start: U.evalKfs(l.alpha, 0) * 255, end: U.evalKfs(l.alpha, 0) * 255, startTime: [0, 1, 1], endTime: [0, 1, 1], easingType: 1 }],
        moveXEvents: [{ start: U.evalKfs(l.moveX, 0) * (RPE_W / 2), end: U.evalKfs(l.moveX, 0) * (RPE_W / 2), startTime: [0, 1, 1], endTime: [0, 1, 1], easingType: 1 }],
        moveYEvents: [{ start: -U.evalKfs(l.moveY, 0) * (RPE_H / 2), end: -U.evalKfs(l.moveY, 0) * (RPE_H / 2), startTime: [0, 1, 1], endTime: [0, 1, 1], easingType: 1 }],
        rotateEvents: [{ start: -U.evalKfs(l.rotate, 0), end: -U.evalKfs(l.rotate, 0), startTime: [0, 1, 1], endTime: [0, 1, 1], easingType: 1 }],
        speedEvents: [{ start: 1, end: 1, startTime: [0, 1, 1], endTime: [0, 1, 1], easingType: 1 }]
      }],
      extended: { scaleXEvents: [], scaleYEvents: [], colorEvents: [], inclineEvents: [] },
      notes: notesToRPE(l.notes)
    }));
    return {
      formatVersion: 3,
      offset: Math.round((chart.offset || 0) * 1000),
      META: { offset: Math.round((chart.offset || 0) * 1000), RPEVersion: 160, name: chart.info.name },
      BPMList: [{ bpm, startTime: [0, 1, 1] }],
      judgeLineList
    };
  }

  global.ChartLib = {
    parseRPE, parsePGR, parsePEC, parseChartJSON, makeTiming, eventKfs, buildHeight,
    bundleFromFiles, bundleFromZip, readZip,
    Lib, buildFromConfig, parseCompact, toRPE, finalize,
    RPE_W, RPE_H
  };
})(window);