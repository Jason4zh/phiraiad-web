/* PhiraiAd Web - 界面控制器：路由 / 谱面库 / 导入 / HUD / 结算 / 弹窗 */
(function (global) {
  'use strict';
  const U = global.U;
  const S = global.Settings;
  const E = global.Engine;
  const A = global.AudioEng;
  const C = global.ChartLib;

  const UI = {};
  global.UI = UI;
  const APP_VERSION = '1.4.0';
  global.APP_VERSION = APP_VERSION;
  if (global.console) console.log('PhiraiAd Web v' + APP_VERSION);

  const st = {
    screen: 'home',
    lib: { q: '', sort: 'added', star: false },
    curId: null,
    curChart: null,
    chartUrl: null,
    hudRaf: 0,
    lastTap: 0
  };
  UI.st = st;

  const $ = U.$;

  /* ============================ 路由 ============================ */
  UI.go = function (name) {
    U.$$('.screen').forEach(s => s.classList.remove('active'));
    const el = $('#screen-' + name);
    if (el) el.classList.add('active');
    st.screen = name;
    document.body.classList.toggle('playing', name === 'play');
    if (name === 'home') renderHome();
    else if (name === 'lib') renderLib();
    else if (name === 'settings') S.renderUI();
  };

  /* ============================ 首页 ============================ */
  async function renderHome() {
    const list = await global.Repo.list();
    const el = $('#home-count');
    if (!el) return;
    if (!list.length) el.textContent = '谱面库为空，先导入谱面';
    else {
      const best = list.filter(m => m.record).length;
      el.textContent = '已收录 ' + list.length + ' 张谱面' + (best ? ' · ' + best + ' 张已有成绩' : '');
    }
  }

  /* ============================ 谱面库 ============================ */
  let libCache = [];

  async function renderLib() {
    const wrap = $('#lib-list');
    if (!wrap) return;
    const list = await global.Repo.list();
    libCache = list;
    const q = st.lib.q.trim().toLowerCase();
    let arr = list.filter(m => {
      if (st.lib.star && !m.star) return false;
      if (!q) return true;
      return [m.name, m.artist, m.charter, m.level, String(m.difficulty)].join(' ').toLowerCase().indexOf(q) >= 0;
    });
    const sort = st.lib.sort;
    arr.sort((a, b) => {
      if (sort === 'star') return (b.star ? 1 : 0) - (a.star ? 1 : 0) || b.addedAt - a.addedAt;
      if (sort === 'name') return String(a.name).localeCompare(String(b.name), 'zh');
      if (sort === 'level') return (Number(b.difficulty) || 0) - (Number(a.difficulty) || 0);
      if (sort === 'score') return ((b.record && b.record.score) || 0) - ((a.record && a.record.score) || 0);
      return b.addedAt - a.addedAt;
    });
    wrap.innerHTML = '';
    if (!arr.length) {
      wrap.appendChild(U.ce('div', {
        class: 'lib-empty',
        html: list.length ? '没有匹配的谱面' : '谱面库空空如也<br>点击上方「导入谱面」选择 zip 谱面包或谱面文件<br>也可以把文件拖进来'
      }));
      return;
    }
    arr.forEach(m => wrap.appendChild(buildCard(m)));
  }

  function buildCard(m) {
    const rec = m.record;
    const ill = U.ce('div', { class: 'cc-ill', text: (m.name || '?').slice(0, 1) });
    if (m.hasImage) {
      C.Lib.getBlob(m.id, 'image').then(b => {
        if (!b) return;
        const url = URL.createObjectURL(b);
        const img = U.ce('img', { src: url });
        ill.innerHTML = ''; ill.appendChild(img);
      }).catch(() => { });
    }
    const badges = U.ce('div', { class: 'cc-badges' });
    badges.appendChild(U.ce('span', { class: 'badge', text: (m.format || '').toUpperCase() || 'CHART' }));
    if (m.difficulty) badges.appendChild(U.ce('span', { class: 'badge dim', text: '难度 ' + m.difficulty }));
    if (!m.hasAudio) badges.appendChild(U.ce('span', { class: 'badge warn', text: '无音乐' }));
    if (rec) badges.appendChild(U.ce('span', { class: 'badge', text: '最佳 ' + U.fmtScore(rec.score) }));

    const right = U.ce('div', { class: 'cc-right' });
    if (rec) {
      right.appendChild(U.ce('div', { class: 'cc-score', text: U.fmtScore(rec.score) }));
      right.appendChild(U.ce('img', { class: 'cc-rank', src: 'assets/rank/' + (rec.rank || 'C') + '.png', alt: rec.rank }));
    }
    if (m.star) right.appendChild(U.ce('div', { class: 'cc-star', text: '★' }));

    const card = U.ce('div', { class: 'chart-card' }, [
      ill,
      U.ce('div', { class: 'cc-main' }, [
        U.ce('div', { class: 'cc-name', text: m.name || '未命名谱面' }),
        U.ce('div', {
          class: 'cc-meta',
          text: [m.artist || '未知艺术家', m.charter ? '谱师 ' + m.charter : '', m.notes ? m.notes + ' notes' : '', U.fmtTime(m.duration || 0)].filter(Boolean).join(' · ')
        }),
        badges
      ]),
      right
    ]);
    card.onclick = () => { A.ui(); openChartMenu(m); };
    return card;
  }

  /* 谱面详情 / 操作 */
  function openChartMenu(m) {
    const rec = m.record;
    const mask = U.ce('div', { class: 'modal-mask' });
    const info = U.ce('div', { class: 'modal' }, [
      U.ce('h3', { text: m.name || '未命名谱面' }),
      U.ce('p', {
        text: [
          '艺术家：' + (m.artist || '—'),
          '谱师：' + (m.charter || '—'),
          '难度：' + (m.level || m.difficulty || '—'),
          '音符：' + (m.notes || 0) + ' · 时长 ' + U.fmtTime(m.duration || 0),
          rec ? ('最佳：' + U.fmtScore(rec.score) + ' (' + (rec.acc * 100).toFixed(2) + '%) ' + rec.rank + (rec.ap ? ' AP' : rec.fc ? ' FC' : '')) : '尚无游玩记录'
        ].join('\n')
      })
    ]);
    const p = info.querySelector('p');
    p.style.whiteSpace = 'pre-line';

    const btns = U.ce('div', { class: 'modal-actions' });
    const mk = (txt, cls, fn) => {
      const b = U.ce('button', { class: 'btn small' + (cls ? ' ' + cls : ''), text: txt });
      b.onclick = fn;
      return b;
    };
    btns.appendChild(mk(m.star ? '取消收藏' : '收藏', '', () => {
      global.Repo.toggleStar(m.id);
      mask.remove(); renderLib(); A.ui('switch');
    }));
    btns.appendChild(mk('导出 RPE', '', async () => {
      try {
        const data = await C.Lib.loadChart(m.id);
        const json = C.toRPE(data.chart);
        if (!json) throw new Error('该谱面不支持导出');
        U.download(new Blob([JSON.stringify(json)], { type: 'application/json' }), (m.name || 'chart') + '.json');
      } catch (e) { U.toast('导出失败：' + (e.message || e)); }
    }));
    btns.appendChild(mk('删除', '', async () => {
      const ok = await U.confirm('删除谱面', '「' + (m.name || '未命名') + '」将从谱面库中移除，成绩记录一并删除。');
      if (!ok) return;
      await global.Repo.remove(m.id);
      mask.remove(); renderLib(); U.toast('已删除');
    }));
    const startBtn = mk('开始游玩', 'primary', () => { mask.remove(); startPlay(m.id); });
    btns.appendChild(startBtn);
    info.appendChild(btns);
    mask.appendChild(info);
    mask.onclick = e => { if (e.target === mask) mask.remove(); };
    document.body.appendChild(mask);
  }

  /* ============================ 游玩 ============================ */
  async function startPlay(id) {
    const canvas = $('#play-canvas');
    if (!canvas) return;
    E.canvas = canvas;
    E.ctx = canvas.getContext('2d', { alpha: false });
    U.toast('载入谱面…');
    let data;
    try {
      data = await global.Repo.load(id);
    } catch (e) {
      U.toast('谱面载入失败：' + (e.message || e));
      return;
    }
    st.curId = id;
    st.curChart = data.chart;
    A.unlock();
    await A.loadSfx();
    await E.loadRes();
    /* 画布尺寸需在 screen 显示后计算 */
    UI.go('play');
    E.resize();
    $('#pause-menu').classList.remove('show');
    st.lastTap = 0;
    await E.start(data.chart);
    startHud();
  }

  function startHud() {
    stopHud();
    const el = {
      score: $('#hud-score'), acc: $('#hud-acc'), combo: $('#hud-combo'),
      counts: $('#hud-counts'), fps: $('#hud-fps'), info: $('#hud-info')
    };
    let lastCombo = -1;
    const tick = () => {
      const s = E.state;
      if (!s) { st.hudRaf = 0; return; }
      /* HUD 各元素显示开关（上游 show_score / show_combo / show_acc） */
      const showScore = S.get('showScore') !== false;
      const showAcc = !!S.get('showAcc');
      const showCombo = S.get('showCombo') !== false;
      if (el.score) { el.score.style.display = showScore ? '' : 'none'; el.score.textContent = U.fmtScore(s.score); }
      if (el.acc) { el.acc.style.display = showAcc ? '' : 'none'; el.acc.textContent = (s.acc * 100).toFixed(2) + '%'; }
      if (el.combo) el.combo.style.display = showCombo ? '' : 'none';
      if (s.combo !== lastCombo) {
        lastCombo = s.combo;
        if (el.combo) {
          el.combo.textContent = s.combo >= 3 ? s.combo : '';
          el.combo.style.transform = 'scale(1.14)';
          setTimeout(() => { if (el.combo) el.combo.style.transform = 'scale(1)'; }, 90);
        }
      }
      if (S.get('showCounts')) {
        const c = s.counts;
        el.counts.innerHTML = '';
        [['perfect', 'PERFECT'], ['good', 'GOOD'], ['bad', 'BAD'], ['miss', 'MISS']].forEach(([k, n]) => {
          el.counts.appendChild(U.ce('div', { class: 'c-' + k, text: n + ' ' + c[k] }));
        });
      } else el.counts.innerHTML = '';
      el.fps.textContent = S.get('showFps') ? Math.round(s.fps) + ' FPS' : '';
      if (S.get('chartDebug')) {
        el.info.textContent = 'time ' + s.chartTime.toFixed(2) + 's / ' + (s.chart.duration || 0).toFixed(1) + 's · notes ' + s.numNotes + ' · ' + (s.music ? 'music' : 'clock');
        el.info.style.display = 'block';
      } else if (s.auto) {
        el.info.textContent = 'AUTOPLAY';
        el.info.style.display = 'block';
      } else el.info.style.display = 'none';
      st.hudRaf = requestAnimationFrame(tick);
    };
    st.hudRaf = requestAnimationFrame(tick);
  }

  function stopHud() {
    if (st.hudRaf) cancelAnimationFrame(st.hudRaf);
    st.hudRaf = 0;
  }

  /* 结算 */
  function renderResult(res) {
    st.result = res;
    UI.go('result');
    const ill = res.chart && res.chart.info;
    $('#res-title').textContent = (ill && ill.name) || '未命名谱面';
    $('#res-sub').textContent = [
      ill && ill.artist, ill && ill.charter ? '谱师 ' + ill.charter : '',
      '难度 ' + ((ill && (ill.level || ill.difficulty)) || '—')
    ].filter(Boolean).join(' · ');
    $('#res-score').textContent = U.fmtScore(res.score);
    $('#res-acc').textContent = (res.acc * 100).toFixed(2) + '%';
    $('#res-rank').src = 'assets/rank/' + (res.failed ? 'F' : res.rank) + '.png';
    const badges = $('#res-badges');
    badges.innerHTML = '';
    const showIndicator = S.get('apFcIndicator') !== false;
    if (showIndicator && res.allPerfect) badges.appendChild(U.ce('span', { class: 'badge', text: 'ALL PERFECT' }));
    if (showIndicator && res.fullCombo) badges.appendChild(U.ce('span', { class: 'badge', text: 'FULL COMBO' }));
    badges.appendChild(U.ce('span', { class: 'badge dim', text: '最大连击 ' + res.maxCombo + ' / ' + res.total }));
    const pname = S.get('playerName');
    if (pname) badges.appendChild(U.ce('span', { class: 'badge dim', text: String(pname) }));
    if (res.failed) badges.appendChild(U.ce('span', { class: 'badge warn', text: res.failReason || '挑战失败' }));
    if (res.auto) badges.appendChild(U.ce('span', { class: 'badge dim', text: 'AUTOPLAY · 不计成绩' }));

    const counts = $('#res-counts');
    counts.innerHTML = '';
    [['perfect', 'PERFECT'], ['good', 'GOOD'], ['bad', 'BAD'], ['miss', 'MISS']].forEach(([k, n]) => {
      counts.appendChild(U.ce('div', { class: 'count-item ' + k }, [
        U.ce('span', { class: 'cn', text: n }),
        U.ce('span', { class: 'cv', text: res.counts[k] })
      ]));
    });
    try { A.sfx('ending', { volume: 0.55 }); } catch (e) { }
    /* 自动导出成绩报告（上游 auto_export_report） */
    if (S.get('autoExportReport')) {
      try {
        const rep = {
          chart: (ill && ill.name) || '未命名谱面', artist: (ill && ill.artist) || '',
          score: res.score, acc: res.acc, rank: res.rank, maxCombo: res.maxCombo,
          counts: res.counts, allPerfect: res.allPerfect, fullCombo: res.fullCombo,
          failed: res.failed, at: new Date().toISOString(), version: 'PhiraiAd Web'
        };
        U.download(new Blob([JSON.stringify(rep, null, 2)], { type: 'application/json' }),
          ((ill && ill.name) || 'result') + '-result.json');
      } catch (e) { }
    }
  }

  /* ============================ 导入 ============================ */
  function bindImport() {
    const fileInput = $('#file-input');
    const dirInput = $('#dir-input');
    $('#btn-import').onclick = () => { A.ui(); fileInput.click(); };
    $('#btn-import-dir').onclick = () => { A.ui(); dirInput.click(); };
    fileInput.onchange = async () => {
      const files = fileInput.files;
      if (!files || !files.length) return;
      await doImport(files);
      fileInput.value = '';
    };
    dirInput.onchange = async () => {
      const files = dirInput.files;
      if (!files || !files.length) return;
      await doImport(files);
      dirInput.value = '';
    };
    /* 拖拽 */
    const lib = $('#screen-lib');
    const hint = $('#drop-hint');
    let dragDepth = 0;
    lib.addEventListener('dragover', e => { e.preventDefault(); hint.classList.add('show'); });
    lib.addEventListener('dragenter', e => { e.preventDefault(); dragDepth++; hint.classList.add('show'); });
    lib.addEventListener('dragleave', e => { dragDepth--; if (dragDepth <= 0) hint.classList.remove('show'); });
    lib.addEventListener('drop', async e => {
      e.preventDefault();
      dragDepth = 0;
      hint.classList.remove('show');
      if (e.dataTransfer && e.dataTransfer.files) await doImport(e.dataTransfer.files);
    });
  }

  async function doImport(files) {
    U.toast('正在解析 ' + files.length + ' 个文件…');
    try {
      const out = await global.Repo.importFiles(files);
      if (out && out.length) U.toast('已导入 ' + out.length + ' 张谱面');
      else U.toast('未识别到可用谱面');
    } catch (e) {
      U.toast('导入失败：' + (e.message || e));
    }
    renderLib();
  }

  /* 配置转谱 */
  function openConfigModal() {
    const mask = U.ce('div', { class: 'modal-mask' });
    const name = U.ce('input', { class: 'input', placeholder: '谱面名称（可留空）' });
    const area = U.ce('textarea', {
      class: 'textarea',
      placeholder: '# name 示例谱面\n# bpm 180\n# 时间,类型,x,持续\n0,tap,0\n0.5,drag,0.2\n1,hold,-0.3,1.2\n2,flick,0.5\n---\n0,tap,0\n\n也可以直接粘贴 JSON：{bpm:180, lines:[{x:0,notes:[{t:0,type:"tap",x:0}]}]}'
    });
    const ok = U.ce('button', { class: 'btn primary', text: '生成' });
    const no = U.ce('button', { class: 'btn', text: '取消' });
    const box = U.ce('div', { class: 'modal', style: { width: 'min(94vw, 520px)' } }, [
      U.ce('h3', { text: '配置转谱' }),
      U.ce('p', { text: '支持紧凑行格式（每行 时间,类型[,x][,持续]，--- 分隔多条判定线）或 JSON 配置，生成后可直接游玩。' }),
      name, area,
      U.ce('div', { class: 'modal-actions' }, [no, ok])
    ]);
    ok.onclick = async () => {
      try {
        await global.Repo.importConfig(area.value, name.value.trim() || null);
        mask.remove();
        U.toast('已生成谱面');
        renderLib();
      } catch (e) { U.toast('生成失败：' + (e.message || e)); }
    };
    no.onclick = () => mask.remove();
    mask.onclick = e => { if (e.target === mask) mask.remove(); };
    mask.appendChild(box);
    document.body.appendChild(mask);
    setTimeout(() => area.focus(), 60);
  }

  /* ============================ 关于 ============================ */
  function openAbout() {
    const mask = U.ce('div', { class: 'modal-mask' });
    const box = U.ce('div', { class: 'modal' }, [
      U.ce('h3', { text: 'PhiraiAd Web' }),
      U.ce('p', {
        html: '本项目是 <b>PhiraiAd</b>（Phira 的非官方改版，Rust + wgpu 原生应用）的<b>网页移植版</b>，' +
          '保留其核心玩法与绝大部分设置项，纯前端实现，无需安装。<br><br>' +
          '<b>已实现</b>：RPE / Phira 谱面解析（多判定线与 29 种缓动、速度事件、噪域、自动倒打）、' +
          '四类音符与完整判定（Phira / Phigros / 严格 / 自定义判定窗）、连击与计分、Mod（Autoplay / FlipX / FadeIn·Out / Nightcore / Rainbow / 死路模式）、' +
          '打击特效与打击音、噪域渲染、判定时间条、键位映射、自定义打击音与资源、谱面库（IndexedDB）、成绩记录与评级。<br><br>' +
          '<b>未包含</b>：在线谱面下载、账号与云同步、排行榜、判定范围可视化、练习模式、定数预测、RKS / B30。<br><br>' +
          '材质与音效直接取自上游 <i>assets/</i> 与 <i>prpr/src/noise_area/assets/</i>。<br>' +
          '上游作者：Adai-add 及 Phira 项目贡献者。<br>' +
          '许可证：GPL-3.0（与上游一致）。本项目与 Phira / Phigros 官方无关，仅供学习交流。'
      }),
      U.ce('div', { class: 'modal-actions' }, [
        U.ce('button', { class: 'btn primary', text: '知道了', onclick: () => mask.remove() })
      ])
    ]);
    mask.appendChild(box);
    mask.onclick = e => { if (e.target === mask) mask.remove(); };
    document.body.appendChild(mask);
  }

  /* ============================ 事件绑定 ============================ */
  function bind() {
    $('#btn-start').onclick = () => { A.ui('big'); UI.go('lib'); };
    $('#btn-lib').onclick = () => { A.ui('big'); UI.go('lib'); };
    $('#btn-settings').onclick = () => { A.ui('big'); UI.go('settings'); };
    $('#btn-about').onclick = () => { A.ui('big'); openAbout(); };
    $('#lib-back').onclick = () => { A.ui(); UI.go('home'); };
    $('#lib-refresh').onclick = () => { A.ui(); renderLib(); U.toast('已刷新'); };
    $('#set-back').onclick = () => { A.ui(); UI.go('home'); };
    $('#set-reset').onclick = async () => {
      if (await U.confirm('恢复默认设置', '全部设置项将回到默认值。')) { S.resetAll(); S.renderUI(); U.toast('已恢复默认'); }
    };
    $('#btn-config').onclick = () => { A.ui(); openConfigModal(); };

    const search = $('#lib-search');
    search.oninput = U.debounce(() => { st.lib.q = search.value; renderLib(); }, 160);
    $('#lib-sort').onchange = e => { st.lib.sort = e.target.value; renderLib(); };
    $('#lib-star-filter').onclick = e => {
      st.lib.star = !st.lib.star;
      e.target.classList.toggle('primary', st.lib.star);
      renderLib();
    };

    /* 暂停菜单 */
    $('#btn-pause').onclick = () => { A.ui(); E.pause(); $('#pause-menu').classList.add('show'); };
    $('#btn-resume').onclick = () => { A.ui(); $('#pause-menu').classList.remove('show'); E.resume(); };
    $('#btn-restart').onclick = () => {
      A.ui();
      $('#pause-menu').classList.remove('show');
      if (st.curId) startPlay(st.curId);
    };
    $('#btn-quit').onclick = () => {
      A.ui();
      $('#pause-menu').classList.remove('show');
      E.stopLoop(); E.quit();
      stopHud();
      UI.go('lib');
    };

    /* 结算 */
    $('#btn-retry').onclick = () => { A.ui(); if (st.curId) startPlay(st.curId); };
    $('#btn-back-lib').onclick = () => { A.ui(); E.quit(); stopHud(); UI.go('lib'); };

    /* 画布输入 */
    const canvas = $('#play-canvas');
    canvas.addEventListener('pointerdown', e => {
      e.preventDefault();
      const now = performance.now();
      if (S.get('doubleClickPause') && now - st.lastTap < 260) {
        st.lastTap = 0;
        if (!E.state || E.state.finished) return;
        if (E.state.paused) { $('#pause-menu').classList.remove('show'); E.resume(); }
        else { E.pause(); $('#pause-menu').classList.add('show'); }
        return;
      }
      st.lastTap = now;
      canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
      E.pointerDown(e);
    }, { passive: false });
    canvas.addEventListener('pointermove', e => { e.preventDefault(); E.pointerMove(e); }, { passive: false });
    canvas.addEventListener('pointerup', e => { E.pointerUp(e); });
    canvas.addEventListener('pointercancel', e => { E.pointerUp(e); });
    canvas.addEventListener('contextmenu', e => e.preventDefault());

    /* 键盘 */
    window.addEventListener('keydown', e => {
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'Escape') {
        if (st.screen === 'play' && E.state && !E.state.finished) {
          if (E.state.paused) { $('#pause-menu').classList.remove('show'); E.resume(); }
          else { E.pause(); $('#pause-menu').classList.add('show'); }
        }
        return;
      }
      if (st.screen === 'play' && E.state && !E.state.paused && S.get('useKeyboard')) {
        if (e.repeat) return;
        E.keyDown(e.key);
        if ([' ', 'ArrowUp', 'ArrowDown'].indexOf(e.key) >= 0) e.preventDefault();
      }
    });

    /* 尺寸变化 */
    window.addEventListener('resize', () => {
      if (st.screen === 'play') E.resize();
    });
    window.addEventListener('orientationchange', () => setTimeout(() => { if (st.screen === 'play') E.resize(); }, 220));

    /* 页面隐藏自动暂停 */
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && st.screen === 'play' && E.state && !E.state.paused && !E.state.finished) {
        E.pause();
        $('#pause-menu').classList.add('show');
      }
    });

    /* 设置变更即时生效 */
    S.onChange((k, v) => {
      if (k === 'volumeMusic') A.setVolumeMusic(v);
      if (k === 'volumeSfx') A.setVolumeSfx(v);
    });
  }

  /* ============================ 启动 ============================ */
  UI.boot = async function () {
    bindImport();
    bind();
    /* 结束回调 */
    E.onEnd = function (res) {
      stopHud();
      const id = st.curId;
      const isAuto = !!(E.state && E.state.auto);
      /* Autoplay 不计入成绩（与上游一致） */
      if (id && !isAuto) {
        const rec = global.Repo.setRecord(id, res);
        res.isBest = rec && rec.score === res.score;
      }
      res.auto = isAuto;
      /* 留一点余韵再切结算 */
      setTimeout(() => renderResult(res), 420);
    };
    try { await A.loadSfx(); } catch (e) { }
    await global.Repo.init();
    await E.loadRes();
    renderHome();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => UI.boot());
  } else {
    UI.boot();
  }
})(window);