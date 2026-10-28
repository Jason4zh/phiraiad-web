/* PhiraiAd Web - 音频引擎：音乐播放 / 打击音效 / 界面音效
   直接复用上游 assets 下的 ogg 音效（click/drag/flick/hold/button/switch/ending/cali） */
(function (global) {
  'use strict';
  const U = global.U;
  const S = global.Settings;

  const A = {};
  A.ac = null;
  A.buf = {};          // 音效缓冲
  A.music = null;      // 音乐 <audio>
  A.musicUrl = null;
  A._paused = false;
  A._rate = 1;

  const SFX_FILES = {
    click: 'assets/click.ogg',
    drag: 'assets/drag.ogg',
    flick: 'assets/flick.ogg',
    hold: 'assets/drag.ogg',
    button: 'assets/button.ogg',
    buttonLarge: 'assets/button_large.ogg',
    switch: 'assets/switch.ogg',
    ending: 'assets/ending.ogg',
    cali: 'assets/cali.ogg',
    caliHit: 'assets/cali_hit.ogg'
  };

  function ensureCtx() {
    if (A.ac) return A.ac;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      A.ac = new AC();
      A.gainSfx = A.ac.createGain();
      A.gainSfx.gain.value = Number(S.get('volumeSfx')) || 1;
      A.gainSfx.connect(A.ac.destination);
    } catch (e) { A.ac = null; }
    return A.ac;
  }
  A.ensureCtx = ensureCtx;
  A.unlock = function () {
    const ac = ensureCtx();
    if (ac && ac.state === 'suspended') ac.resume();
  };

  async function decodeUrl(url) {
    const ac = ensureCtx();
    if (!ac) return null;
    const res = await fetch(url);
    const buf = await res.arrayBuffer();
    return await ac.decodeAudioData(buf);
  }

  A.loadSfx = async function () {
    const ac = ensureCtx();
    if (!ac) return;
    const jobs = Object.keys(SFX_FILES).map(async n => {
      try {
        if (!A.buf[n]) A.buf[n] = await decodeUrl(SFX_FILES[n]);
      } catch (e) { /* 忽略 */ }
    });
    /* 自定义资源（设置页替换） */
    ['click', 'drag', 'flick'].forEach(n => {
      const d = S.get('customSfx.' + n);
      if (d) { A.loadCustomSfx(n, d); }
    });
    await Promise.all(jobs);
  };

  A.loadCustomSfx = async function (name, dataUrl) {
    const ac = ensureCtx();
    if (!ac || !dataUrl) return;
    try {
      const res = await fetch(dataUrl);
      const buf = await res.arrayBuffer();
      A.buf[name] = await ac.decodeAudioData(buf);
    } catch (e) { console.warn('自定义音效载入失败', name); }
  };

  A.sfx = function (name, opt) {
    opt = opt || {};
    const ac = ensureCtx();
    if (ac && ac.state === 'suspended') { try { ac.resume(); } catch (e) { } }
    const vol = (opt.volume === undefined ? 1 : opt.volume) * (Number(S.get('volumeSfx')) || 1);
    if (vol <= 0) return;
    const b = A.buf[name];
    if (ac && b) {
      try {
        const src = ac.createBufferSource();
        src.buffer = b;
        src.playbackRate.value = opt.rate || 1;
        const g = ac.createGain();
        g.gain.value = vol;
        src.connect(g); g.connect(ac.destination);
        src.start(0);
        return;
      } catch (e) { }
    }
    /* 回退：HTMLAudio */
    const url = SFX_FILES[name];
    if (!url) return;
    try {
      const el = new Audio(url);
      el.volume = U.clamp(vol, 0, 1);
      el.play().catch(() => { });
    } catch (e) { }
  };

  /* ---------------- 界面音效 ---------------- */
  A.ui = function (kind) {
    if (S.get('uiAnim') === false) return;
    if (kind === 'switch') A.sfx('switch', { volume: 0.6 });
    else if (kind === 'big') A.sfx('buttonLarge', { volume: 0.75 });
    else A.sfx('button', { volume: 0.6 });
  };

  /* ---------------- 音乐 ---------------- */
  A.loadMusic = function (blobOrUrl) {
    A.stop();
    return new Promise(res => {
      const el = new Audio();
      el.preload = 'auto';
      el.crossOrigin = 'anonymous';
      let url;
      if (typeof blobOrUrl === 'string') url = blobOrUrl;
      else url = URL.createObjectURL(blobOrUrl);
      A.musicUrl = url;
      el.src = url;
      el.onloadedmetadata = () => { A.duration = el.duration || 0; res(el); };
      el.onerror = () => { A.duration = 0; res(el); };
      el.volume = U.clamp(Number(S.get('volumeMusic')) || 1, 0, 1);
      A.music = el;
      A._paused = true;
      /* 部分浏览器 metadata 已缓存 */
      if (el.readyState >= 1) { A.duration = el.duration || 0; res(el); }
    });
  };

  A.hasMusic = function () { return !!(A.music && A.music.src && !A.music.error); };

  A.play = function (offset, nightcore) {
    if (!A.music) return;
    A._rate = nightcore ? 1.1 : 1;
    try {
      A.music.playbackRate = A._rate;
      /* nightcore 默认变调；开启 preservePitch（上游 normal_preserve_pitch）则保持音高 */
      const keep = nightcore ? !!S.get('preservePitch') : true;
      if ('preservesPitch' in A.music) A.music.preservesPitch = keep;
      else if ('mozPreservesPitch' in A.music) A.music.mozPreservesPitch = keep;
      else if ('webkitPreservesPitch' in A.music) A.music.webkitPreservesPitch = keep;
      A.music.currentTime = Math.max(0, offset || 0);
      A.music.volume = U.clamp(Number(S.get('volumeMusic')) || 1, 0, 1);
      const p = A.music.play();
      if (p && p.catch) p.catch(() => { });
      A._paused = false;
    } catch (e) { }
  };

  A.pause = function () {
    if (!A.music) return;
    try { A.music.pause(); } catch (e) { }
    A._paused = true;
  };

  A.resume = function () {
    if (!A.music) return;
    try {
      const p = A.music.play();
      if (p && p.catch) p.catch(() => { });
      A._paused = false;
    } catch (e) { }
  };

  A.stop = function () {
    if (A.music) {
      try { A.music.pause(); } catch (e) { }
      try { A.music.currentTime = 0; } catch (e) { }
    }
    if (A.musicUrl && A.musicUrl.startsWith('blob:')) {
      try { URL.revokeObjectURL(A.musicUrl); } catch (e) { }
      A.musicUrl = null;
    }
    A.music = null;
    A._paused = true;
  };

  A.time = function () {
    if (!A.music) return 0;
    /* currentTime 即"音乐内容时间"，变速播放时无需再乘 rate，
       否则谱面会比音乐快 10% */
    return A.music.currentTime || 0;
  };

  A.duration = 0;
  A.realDuration = function () { return A.music ? (A.music.duration || 0) : 0; };

  A.seek = function (t) { if (A.music) { try { A.music.currentTime = Math.max(0, t); } catch (e) { } } };

  A.setVolumeMusic = function (v) {
    if (A.music) A.music.volume = U.clamp(v, 0, 1);
  };
  A.setVolumeSfx = function (v) {
    if (A.gainSfx) A.gainSfx.gain.value = U.clamp(v, 0, 1);
  };
  A.setVolume = function (v) { A.setVolumeMusic(v); };

  global.AudioEng = A;
})(window);
