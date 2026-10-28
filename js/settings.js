/* PhiraiAd Web - 设置项定义与设置页生成
   键名与语义对齐上游 prpr Config（prpr/src/config.rs） */
(function (global) {
  'use strict';
  const U = global.U;

  const DEFAULTS = {
    /* 游玩 */
    'speed': 1.0,                 // 全局流速（note_flow_speed 1.0 = 原速）
    'noteScale': 1.0,             // note_scale
    'judgementMode': 'phira',     // phira | phigros | custom
    'phigrosStrict': false,       // phigros_strict_judgement
    'fullscreenJudgement': false,  // fullscreen_judgement
    'offset': 0,                  // offset (ms)
    'autoplay': false,            // Mods::AUTOPLAY
    'flipX': false,               // Mods::FLIP_X
    'fadeIn': false,              // Mods::FADE_IN
    'fadeOut': false,             // Mods::FADE_OUT
    'nightcore': false,           // Mods::NIGHTCORE
    'rainbow': false,             // Mods::RAINBOW
    'noShader': false,            // Mods::NO_SHADER
    'instantDeathAP': false,      // Mods::INSTANT_DEATH_AP
    'instantDeathFC': false,      // Mods::INSTANT_DEATH_FC
    'useKeyboard': false,         // use_keyboard
    'autoFlipEnabled': true,      // auto_flip_enabled
    'shortenHolds': false,        // shorten_holds
    'holdHeadEffect': false,      // hold_head_effect
    'doubleClickPause': true,     // double_click_to_pause
    'noteFlowInverse': false,     // normal_note_flow_inverse
    'preservePitch': false,       // normal_preserve_pitch
    'aggressive': true,           // aggressive（提前加载/激进判定）
    'apFcIndicator': true,        // ap_fc_indicator

    /* 判定 */
    'jm.perfect': 80,             // 自定义判定区间（ms）
    'jm.good': 160,
    'jm.bad': 220,
    'jm.comboScoreRatio': 0.1,    // combo_score_ratio
    'jm.flickSpeed': 0.30,        // flick_speed_threshold
    'jm.flickRequireDirection': false,
    'jm.countsLocalScore': true,  // counts_local_score
    'jm.dragWindow': 100,         // 额外：Drag 判定窗（ms，Phigros 复刻为 100）

    /* HUD */
    'showScore': true,
    'showCombo': true,
    'showAcc': false,             // show_acc
    'showFps': false,             // show_avg_fps
    'showProgress': true,
    'showCounts': true,
    'showJudgeText': true,
    'timingBar.enabled': false,   // timing_bar.enabled
    'timingBar.recordCounts': true,
    'timingBar.curved': false,
    'timingBar.recordSeconds': 3,
    'timingBar.x': 0,
    'timingBar.y': -0.65,
    'timingBar.size': 100,

    /* 特效 */
    'particle': true,
    'disableEffect': false,
    'hitFxSize': 1.0,
    'hitFxDuration': 0.32,
    'holdProgress': true,
    'lineGlow': 1.0,
    'judgeTextSize': 1.0,
    'fxColor.perfect': '#f5f0a2',
    'fxColor.good': '#8ad4ff',
    'fxColor.bad': '#b7a6d6',
    'fxColor.miss': '#ff5f5f',
    'bgDark': 0.55,

    /* 噪域 */
    'noiseArea.enabled': true,
    'noiseArea.preciseEdges': true,
    'noiseArea.removeDistortion': false,
    'noiseArea.musicUnaffected': true,
    'noiseArea.lowPerformance': false,

    /* 音频 */
    'volumeMusic': 1.0,
    'volumeSfx': 1.0,
    'volumeBgm': 1.0,
    'correctSound': false,        // correct_sound（正解音）
    'correctSoundVolume': 0.7,
    'hitSoundEnabled': true,

    /* 数据 */
    'playerName': 'PhiraiAd Web',
    'replayRecordingEnabled': true,
    'autoExportReport': false,
    'chartDebug': false,
    'touchDebug': false,
    'uiAnim': true,

    /* 自定义资源（dataURL 或 null） */
    'customSfx.click': null,
    'customSfx.drag': null,
    'customSfx.flick': null,
    'customHitFx': null,
    'customLineTex': null
  };

  /* 键位映射默认值（use_keyboard） */
  const DEFAULT_KEYMAP = { tap: ['d', 'f', 'j', 'k'], drag: ['s', 'l'], hold: ['a', ';'], flick: ['q', 'p'] };

  const S = {
    DEFAULTS,
    DEFAULT_KEYMAP,
    data: {},
    keymap: {},
    _subs: [],

    load() {
      const saved = U.store.get('settings', null) || {};
      S.data = Object.assign({}, DEFAULTS, saved);
      S.keymap = Object.assign({}, DEFAULT_KEYMAP, U.store.get('keymap', {}));
    },
    save() {
      U.store.set('settings', S.data);
      U.store.set('keymap', S.keymap);
    },
    get(k) { return S.data[k] === undefined ? DEFAULTS[k] : S.data[k]; },
    set(k, v) {
      S.data[k] = v;
      S.save();
      S._subs.forEach(fn => { try { fn(k, v); } catch (e) { console.warn(e); } });
    },
    onChange(fn) { S._subs.push(fn); },
    resetAll() {
      S.data = Object.assign({}, DEFAULTS);
      S.keymap = Object.assign({}, DEFAULT_KEYMAP);
      S.save();
    },
    export() { return JSON.stringify({ settings: S.data, keymap: S.keymap }, null, 2); },
    import(json) {
      const o = JSON.parse(json);
      if (o.settings) S.data = Object.assign({}, DEFAULTS, o.settings);
      if (o.keymap) S.keymap = Object.assign({}, DEFAULT_KEYMAP, o.keymap);
      S.save();
    },
    /* 当前生效的判定窗（秒） */
    windows() {
      const mode = S.get('judgementMode');
      if (mode === 'custom') {
        return {
          perfect: S.get('jm.perfect') / 1000,
          good: Math.max(S.get('jm.good'), S.get('jm.perfect') + 1) / 1000,
          bad: Math.max(S.get('jm.bad'), S.get('jm.good') + 1) / 1000,
          drag: S.get('jm.dragWindow') / 1000,
          holdTail: S.get('jm.bad') / 1000
        };
      }
      if (mode === 'phigros') {
        const strict = S.get('phigrosStrict');
        return {
          perfect: strict ? 0.04 : 0.08,
          good: strict ? 0.09 : 0.18,
          bad: strict ? 0.14 : 0.22,
          drag: 0.10,
          holdTail: 0.22,
          flick: 1.75 * (strict ? 0.04 : 0.08)
        };
      }
      return { perfect: 0.08, good: 0.16, bad: 0.22, drag: 0.16, holdTail: 0.22, flick: 0.14 };
    },
    /* 连击分占比 */
    comboRatio() {
      const v = Number(S.get('jm.comboScoreRatio'));
      return isFinite(v) ? U.clamp(v, 0, 0.5) : 0.1;
    },
    speedFactor() {
      const v = Number(S.get('speed'));
      return isFinite(v) ? U.clamp(v, 0.1, 5) : 1;
    }
  };

  /* =========================== 设置页定义 =========================== */
  const SECTIONS = [
    {
      id: 'gameplay', name: '游玩', icon: 'play', items: [
        { k: 'speed', t: 'range', label: '流速', min: 0.5, max: 5, step: 0.05, fmt: v => (+v).toFixed(2) + 'x' },
        { k: 'noteScale', t: 'range', label: '音符大小', min: 0.5, max: 2, step: 0.05, fmt: v => (+v).toFixed(2) + 'x' },
        {
          k: 'judgementMode', t: 'select', label: '判定模式', opts: [
            ['phira', 'Phira 默认'], ['phigros', 'Phigros 原版判定'], ['custom', '自定义']
          ]
        },
        { k: 'phigrosStrict', t: 'switch', label: 'Phigros 严格判定', desc: 'P/G/B = 40/90/140 ms', showIf: () => S.get('judgementMode') === 'phigros' },
        { k: 'fullscreenJudgement', t: 'switch', label: '全屏判定', desc: '忽略触点横向位置，仅按时间判定' },
        { k: 'offset', t: 'range', label: '谱面延迟', min: -500, max: 500, step: 5, fmt: v => (v > 0 ? '+' : '') + v + ' ms' },
        { k: 'autoplay', t: 'switch', label: '自动播放', desc: '开启后自动命中全部音符（不计入成绩）' },
        { k: 'flipX', t: 'switch', label: '镜像（Flip X）' },
        { k: 'fadeIn', t: 'switch', label: '淡入（Fade In）' },
        { k: 'fadeOut', t: 'switch', label: '淡出（Fade Out）' },
        { k: 'nightcore', t: 'switch', label: 'Nightcore（1.1x 音高加速）' },
        { k: 'rainbow', t: 'switch', label: '彩虹判定线' },
        { k: 'noShader', t: 'switch', label: '简化着色（低配）' },
        { k: 'instantDeathAP', t: 'switch', label: '死路模式：非 AP 即失败' },
        { k: 'instantDeathFC', t: 'switch', label: '死路模式：非 FC 即失败' },
        { k: 'autoFlipEnabled', t: 'switch', label: '自动倒打', desc: '按谱面内区间自动 180° 翻转画面' },
        { k: 'noteFlowInverse', t: 'switch', label: '逆向流速', desc: '音符自判定线向远处流动' },
        { k: 'shortenHolds', t: 'switch', label: '缩短 Hold 显示' },
        { k: 'holdHeadEffect', t: 'switch', label: 'Hold 头打击特效' },
        { k: 'doubleClickPause', t: 'switch', label: '双击暂停' },
        { k: 'preservePitch', t: 'switch', label: '变速保持音高', desc: 'Nightcore/倒放时尽量维持原音高' },
        { k: 'useKeyboard', t: 'switch', label: '键盘操作' },
        { t: 'keymap', label: '键位映射', showIf: () => S.get('useKeyboard') }
      ]
    },
    {
      id: 'judge', name: '判定', icon: 'target', items: [
        {
          k: 'jm.perfect', t: 'range', label: 'Perfect ±ms', min: 10, max: 200, step: 1, fmt: v => v + ' ms',
          showIf: () => S.get('judgementMode') === 'custom'
        },
        {
          k: 'jm.good', t: 'range', label: 'Good ±ms', min: 20, max: 300, step: 1, fmt: v => v + ' ms',
          showIf: () => S.get('judgementMode') === 'custom'
        },
        {
          k: 'jm.bad', t: 'range', label: 'Bad ±ms', min: 30, max: 400, step: 1, fmt: v => v + ' ms',
          showIf: () => S.get('judgementMode') === 'custom'
        },
        {
          k: 'jm.dragWindow', t: 'range', label: 'Drag 判定窗 ±ms', min: 30, max: 300, step: 1, fmt: v => v + ' ms',
          showIf: () => S.get('judgementMode') === 'custom'
        },
        { k: 'jm.comboScoreRatio', t: 'range', label: '连击分占比', min: 0, max: 0.5, step: 0.01, fmt: v => (v * 100).toFixed(0) + '%' },
        { k: 'jm.flickSpeed', t: 'range', label: 'Flick 滑动阈值', min: 0.05, max: 3, step: 0.05, fmt: v => (+v).toFixed(2) },
        { k: 'jm.flickRequireDirection', t: 'switch', label: 'Flick 需要方向变化' },
        { k: 'jm.countsLocalScore', t: 'switch', label: '非默认判定计入本地成绩' },
        { k: 'aggressive', t: 'switch', label: '激进判定', desc: '提前将音符纳入判定窗口' },
        { k: 'apFcIndicator', t: 'switch', label: 'AP / FC 指示' }
      ]
    },
    {
      id: 'hud', name: '显示', icon: 'eye', items: [
        { k: 'showScore', t: 'switch', label: '显示分数' },
        { k: 'showCombo', t: 'switch', label: '显示连击' },
        { k: 'showAcc', t: 'switch', label: '显示准确率' },
        { k: 'showCounts', t: 'switch', label: '显示 P/G/B/M 记录' },
        { k: 'showJudgeText', t: 'switch', label: '显示判定文字' },
        { k: 'showProgress', t: 'switch', label: '显示进度条' },
        { k: 'showFps', t: 'switch', label: '显示帧率' },
        { k: 'judgeTextSize', t: 'range', label: '判定文字大小', min: 0.5, max: 2, step: 0.05, fmt: v => (+v).toFixed(2) + 'x' },
        { k: 'timingBar.enabled', t: 'switch', label: '实时判定条' },
        { k: 'timingBar.recordCounts', t: 'switch', label: '判定条记录计数' },
        { k: 'timingBar.curved', t: 'switch', label: '弧形判定条' },
        { k: 'timingBar.recordSeconds', t: 'range', label: '判定条保留时长', min: 0.5, max: 10, step: 0.1, fmt: v => (+v).toFixed(1) + ' s' },
        { k: 'timingBar.x', t: 'range', label: '判定条 X 位置', min: -1, max: 1, step: 0.01, fmt: v => (+v).toFixed(2) },
        { k: 'timingBar.y', t: 'range', label: '判定条 Y 位置', min: -1, max: 1, step: 0.01, fmt: v => (+v).toFixed(2) },
        { k: 'timingBar.size', t: 'range', label: '判定条尺寸', min: 40, max: 260, step: 1, fmt: v => v + ' px' },
        { k: 'chartDebug', t: 'switch', label: '谱面调试信息' },
        { k: 'touchDebug', t: 'switch', label: '触点调试' }
      ]
    },
    {
      id: 'effect', name: '特效', icon: 'spark', items: [
        { k: 'particle', t: 'switch', label: '打击粒子' },
        { k: 'disableEffect', t: 'switch', label: '关闭画面特效' },
        { k: 'holdProgress', t: 'switch', label: 'Hold 进度显示' },
        { k: 'hitFxSize', t: 'range', label: '打击特效大小', min: 0.3, max: 2, step: 0.05, fmt: v => (+v).toFixed(2) + 'x' },
        { k: 'hitFxDuration', t: 'range', label: '打击特效时长', min: 0.1, max: 1, step: 0.02, fmt: v => (+v).toFixed(2) + ' s' },
        { k: 'lineGlow', t: 'range', label: '判定线发光', min: 0, max: 2, step: 0.05, fmt: v => (+v).toFixed(2) },
        { k: 'bgDark', t: 'range', label: '背景压暗', min: 0, max: 0.95, step: 0.01, fmt: v => (v * 100).toFixed(0) + '%' },
        { k: 'fxColor.perfect', t: 'color', label: 'Perfect 颜色' },
        { k: 'fxColor.good', t: 'color', label: 'Good 颜色' },
        { k: 'fxColor.bad', t: 'color', label: 'Bad 颜色' },
        { k: 'fxColor.miss', t: 'color', label: 'Miss 颜色' }
      ]
    },
    {
      id: 'noise', name: '噪域', icon: 'grid', items: [
        { k: 'noiseArea.enabled', t: 'switch', label: '噪域显示', desc: '渲染官谱噪域并阻挡触点' },
        { k: 'noiseArea.preciseEdges', t: 'switch', label: '精确边缘' },
        { k: 'noiseArea.removeDistortion', t: 'switch', label: '去除扭曲特效' },
        { k: 'noiseArea.lowPerformance', t: 'switch', label: '低性能模式' },
        { k: 'noiseArea.musicUnaffected', t: 'switch', label: '噪域不影响音乐' }
      ]
    },
    {
      id: 'audio', name: '音频', icon: 'music', items: [
        { k: 'volumeMusic', t: 'range', label: '音乐音量', min: 0, max: 1, step: 0.01, fmt: v => (v * 100).toFixed(0) + '%' },
        { k: 'volumeSfx', t: 'range', label: '打击音音量', min: 0, max: 1, step: 0.01, fmt: v => (v * 100).toFixed(0) + '%' },
        { k: 'volumeBgm', t: 'range', label: '界面音效音量', min: 0, max: 1, step: 0.01, fmt: v => (v * 100).toFixed(0) + '%' },
        { k: 'hitSoundEnabled', t: 'switch', label: '打击音' },
        { k: 'correctSound', t: 'switch', label: '正解音', desc: '按谱面时间播放打击音，与判定无关' },
        { k: 'correctSoundVolume', t: 'range', label: '正解音音量', min: 0, max: 1, step: 0.01, fmt: v => (v * 100).toFixed(0) + '%' }
      ]
    },
    {
      id: 'data', name: '数据', icon: 'data', items: [
        { k: 'playerName', t: 'text', label: '玩家名' },
        { k: 'replayRecordingEnabled', t: 'switch', label: '录制回放' },
        { k: 'autoExportReport', t: 'switch', label: '自动导出对局报告' },
        { k: 'uiAnim', t: 'switch', label: '界面动画' },
        { t: 'buttons', label: '设置存档', buttons: [['导出设置', 'export'], ['导入设置', 'import'], ['恢复默认', 'reset']] }
      ]
    },
    {
      id: 'res', name: '自定义资源', icon: 'image', items: [
        { t: 'respack', label: '打击音替换' },
        { t: 'buttons', label: '打击特效 / 判定线', buttons: [['替换打击特效图', 'hitfx'], ['替换判定线纹理', 'linetex'], ['全部恢复内置', 'resreset']] }
      ]
    }
  ];

  /* =========================== 设置页 UI =========================== */
  const UIState = { tab: 'gameplay' };

  function pathRef(k) {
    return {
      get: () => S.get(k),
      set: v => S.set(k, v)
    };
  }

  function buildItem(it) {
    if (it.showIf && !it.showIf()) return null;
    const row = U.ce('div', { class: 'set-item' });
    const labelWrap = U.ce('div', { class: 'set-label' }, [
      U.ce('span', { class: 'set-name', text: it.label }),
      it.desc ? U.ce('span', { class: 'set-desc', text: it.desc }) : null
    ]);
    row.appendChild(labelWrap);

    const ctrl = U.ce('div', { class: 'set-ctrl' });
    const ref = it.k ? pathRef(it.k) : null;

    if (it.t === 'switch') {
      const sw = U.ce('button', { class: 'switch' + (ref.get() ? ' on' : ''), 'aria-label': it.label });
      sw.appendChild(U.ce('span', { class: 'knob' }));
      sw.onclick = () => {
        const v = !ref.get();
        ref.set(v);
        sw.classList.toggle('on', v);
        if (['judgementMode', 'phigrosStrict', 'useKeyboard', 'timingBar.enabled', 'noiseArea.enabled'].includes(it.k)) render();
      };
      ctrl.appendChild(sw);
    } else if (it.t === 'range') {
      const val = U.ce('span', { class: 'set-val', text: it.fmt ? it.fmt(ref.get()) : String(ref.get()) });
      const input = U.ce('input', {
        type: 'range', min: it.min, max: it.max, step: it.step, value: ref.get(), class: 'range'
      });
      input.oninput = () => {
        const v = Number(input.value);
        val.textContent = it.fmt ? it.fmt(v) : String(v);
        ref.set(v);
      };
      ctrl.appendChild(input); ctrl.appendChild(val);
    } else if (it.t === 'select') {
      const sel = U.ce('select', { class: 'select' });
      it.opts.forEach(([v, t]) => sel.appendChild(U.ce('option', { value: v, text: t, selected: String(ref.get()) === v ? 'selected' : null })));
      sel.onchange = () => { ref.set(sel.value); render(); };
      ctrl.appendChild(sel);
    } else if (it.t === 'color') {
      const input = U.ce('input', { type: 'color', value: ref.get(), class: 'color' });
      input.oninput = () => ref.set(input.value);
      ctrl.appendChild(input);
    } else if (it.t === 'text') {
      const input = U.ce('input', { class: 'input', value: ref.get() });
      input.onchange = () => ref.set(input.value);
      ctrl.appendChild(input);
    } else if (it.t === 'keymap') {
      ctrl.classList.add('keymap');
      ['tap', 'drag', 'hold', 'flick'].forEach(n => {
        const list = S.keymap[n] || [];
        const box = U.ce('div', { class: 'km-row' }, [
          U.ce('span', { class: 'km-name', text: { tap: 'Tap', drag: 'Drag', hold: 'Hold', flick: 'Flick' }[n] }),
          ...list.map(key => {
            const b = U.ce('button', { class: 'key-chip', text: key.toUpperCase() });
            b.onclick = () => {
              b.textContent = '…';
              const h = ev => {
                ev.preventDefault();
                b.textContent = ev.key.toUpperCase();
                const idx = (S.keymap[n] || []).indexOf(key);
                if (idx >= 0) S.keymap[n][idx] = ev.key.toLowerCase();
                S.save();
                window.removeEventListener('keydown', h, true);
              };
              window.addEventListener('keydown', h, true);
            };
            return b;
          })
        ]);
        ctrl.appendChild(box);
      });
    } else if (it.t === 'buttons') {
      it.buttons.forEach(([t, act]) => {
        const b = U.ce('button', { class: 'btn small', text: t });
        b.onclick = () => doAction(act);
        ctrl.appendChild(b);
      });
    } else if (it.t === 'respack') {
      ['click', 'drag', 'flick'].forEach(n => {
        const inp = U.ce('input', { type: 'file', accept: 'audio/*', class: 'hidden-file' });
        const b = U.ce('button', {
          class: 'btn small',
          text: { click: 'Tap 音', drag: 'Drag 音', flick: 'Flick 音' }[n] + (S.get('customSfx.' + n) ? ' ✓' : '')
        });
        b.onclick = () => inp.click();
        inp.onchange = () => {
          const f = inp.files[0]; if (!f) return;
          if (f.size > 3 * 1024 * 1024) { U.toast('文件过大（上限 3MB）'); return; }
          const r = new FileReader();
          r.onload = () => {
            S.set('customSfx.' + n, r.result);
            if (global.AudioEng) global.AudioEng.loadCustomSfx(n, r.result);
            b.textContent = b.textContent.replace(' ✓', '') + ' ✓';
            U.toast('已替换打击音');
          };
          r.readAsDataURL(f);
        };
        ctrl.appendChild(b); ctrl.appendChild(inp);
      });
    }

    row.appendChild(ctrl);
    return row;
  }

  async function doAction(act) {
    if (act === 'export') {
      U.download(new Blob([S.export()], { type: 'application/json' }), 'phiraiad-settings.json');
    } else if (act === 'import') {
      const inp = U.ce('input', { type: 'file', accept: '.json' });
      inp.onchange = () => {
        const f = inp.files[0]; if (!f) return;
        const r = new FileReader();
        r.onload = () => {
          try { S.import(r.result); U.toast('设置已导入'); render(); }
          catch (e) { U.toast('导入失败：格式错误'); }
        };
        r.readAsText(f);
      };
      inp.click();
    } else if (act === 'reset') {
      if (await U.confirm('恢复默认设置', '全部设置项将回到默认值。')) {
        S.resetAll(); U.toast('已恢复默认'); render();
      }
    } else if (act === 'hitfx' || act === 'linetex') {
      const inp = U.ce('input', { type: 'file', accept: 'image/*' });
      inp.onchange = () => {
        const f = inp.files[0]; if (!f) return;
        const r = new FileReader();
        r.onload = () => {
          const k = act === 'hitfx' ? 'customHitFx' : 'customLineTex';
          S.set(k, r.result);
          if (global.Engine && global.Engine.reloadRes) global.Engine.reloadRes();
          U.toast('资源已替换（下次开始游戏生效）');
        };
        r.readAsDataURL(f);
      };
      inp.click();
    } else if (act === 'resreset') {
      ['customSfx.click', 'customSfx.drag', 'customSfx.flick', 'customHitFx', 'customLineTex'].forEach(k => S.set(k, null));
      if (global.Engine && global.Engine.reloadRes) global.Engine.reloadRes();
      U.toast('已恢复内置资源'); render();
    }
  }

  function render() {
    const wrap = U.$('#settings-body');
    if (!wrap) return;
    const tabs = U.$('#settings-tabs');
    if (tabs) {
      tabs.innerHTML = '';
      SECTIONS.forEach(sec => {
        const b = U.ce('button', { class: 'tab' + (UIState.tab === sec.id ? ' active' : ''), text: sec.name });
        b.onclick = () => { UIState.tab = sec.id; render(); U.$('#settings-body').scrollTop = 0; };
        tabs.appendChild(b);
      });
    }
    const sec = SECTIONS.find(s => s.id === UIState.tab) || SECTIONS[0];
    wrap.innerHTML = '';
    wrap.appendChild(U.ce('h2', { class: 'section-title', text: sec.name }));
    const list = U.ce('div', { class: 'set-list' });
    sec.items.forEach(it => {
      const node = buildItem(it);
      if (node) list.appendChild(node);
    });
    wrap.appendChild(list);
  }

  S.SECTIONS = SECTIONS;
  S.renderUI = render;
  S.load();
  global.Settings = S;
})(window);