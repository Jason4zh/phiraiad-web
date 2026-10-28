/* PhiraiAd Web - 谱面库数据层：导入 / 归档 / 成绩记录 / 收藏 */
(function (global) {
  'use strict';
  const U = global.U;
  const S = global.Settings;
  const C = global.ChartLib;

  const Repo = {};
  const REC_KEY = 'records';
  const STAR_KEY = 'stars';

  Repo.ready = false;
  Repo.init = async function () {
    if (Repo.ready) return;
    Repo.ready = true;
    Repo.records = U.store.get(REC_KEY, {}) || {};
    Repo.stars = U.store.get(STAR_KEY, {}) || {};
  };

  Repo.saveRecords = () => U.store.set(REC_KEY, Repo.records);
  Repo.saveStars = () => U.store.set(STAR_KEY, Repo.stars);

  Repo.list = async function () {
    await Repo.init();
    let arr = [];
    try { arr = await C.Lib.all(); } catch (e) { console.warn(e); }
    return arr.map(m => Object.assign({}, m, {
      star: !!Repo.stars[m.id],
      record: Repo.records[m.id] || null
    }));
  };

  /* ---------------- 导入 ---------------- */
  Repo.importFiles = async function (files) {
    const list = Array.from(files || []);
    if (!list.length) return [];
    const out = [];
    const zips = list.filter(f => /\.(zip|pez)$/i.test(f.name));
    const others = list.filter(f => !/\.(zip|pez)$/i.test(f.name));
    for (const z of zips) {
      try {
        const buf = await z.arrayBuffer();
        const b = await C.bundleFromZip(buf, z.name);
        out.push(await C.Lib.save(b));
      } catch (e) {
        console.warn(e);
        U.toast('「' + z.name + '」解析失败：' + (e.message || e));
      }
    }
    if (others.length) {
      try {
        const b = await C.bundleFromFiles(others);
        out.push(await C.Lib.save(b));
      } catch (e) {
        console.warn(e);
        U.toast('导入失败：' + (e.message || e));
      }
    }
    return out;
  };

  /* 从纯配置文本生成谱面（JSON 或紧凑行格式） */
  Repo.importConfig = async function (text, name) {
    const t = (text || '').trim();
    if (!t) throw new Error('内容为空');
    let cfg = null;
    if (/^[{[]/.test(t)) {
      try { cfg = JSON.parse(t); } catch (e) { throw new Error('JSON 解析失败'); }
      if (cfg && cfg.BPMList && cfg.judgeLineList) {
        /* 其实是 RPE 谱面 */
        const chart = C.parseChartJSON(cfg, { name: name });
        return C.Lib.save({ chart, chartText: JSON.stringify(cfg), audio: null, illustration: null, files: [{ name: name || 'chart.json', size: t.length }] });
      }
    }
    const chart = C.buildFromConfig(cfg, cfg ? null : t);
    if (name) chart.info.name = name;
    return C.Lib.save({ chart, chartText: JSON.stringify(cfg || chart.config), audio: null, illustration: null, files: [{ name: (name || 'config') + '.json', size: t.length }] });
  };

  Repo.remove = async function (id) {
    await C.Lib.remove(id);
    delete Repo.records[id];
    delete Repo.stars[id];
    Repo.saveRecords(); Repo.saveStars();
  };

  Repo.toggleStar = function (id) {
    Repo.stars[id] = !Repo.stars[id];
    Repo.saveStars();
    return Repo.stars[id];
  };

  Repo.setRecord = function (id, result) {
    const old = Repo.records[id];
    const rec = {
      score: result.score, acc: result.acc, rank: result.rank,
      ap: result.allPerfect, fc: result.fullCombo,
      counts: result.counts, at: Date.now(),
      plays: ((old && old.plays) || 0) + 1
    };
    if (!old || result.score > old.score) {
      Repo.records[id] = rec;
    } else {
      Repo.records[id] = Object.assign({}, old, { plays: rec.plays, lastAt: Date.now() });
    }
    Repo.saveRecords();
    return Repo.records[id];
  };

  Repo.getRecord = id => Repo.records[id] || null;

  /* 载入谱面并准备播放资源 */
  Repo.load = async function (id) {
    await Repo.init();
    const data = await C.Lib.loadChart(id);
    if (data.audio) {
      await global.AudioEng.loadMusic(data.audio);
    } else if (global.AudioEng) {
      global.AudioEng.stop();
    }
    if (data.illustration) {
      const url = URL.createObjectURL(data.illustration);
      const im = new Image();
      im.src = url;
      data.chart._illImg = im;
    }
    return data;
  };

  global.Repo = Repo;
})(window);