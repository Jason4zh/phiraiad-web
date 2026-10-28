# PhiraiAd Web

**Phira 非官方改版的网页移植版** —— 把 [PhiraiAd](https://github.com/Adai-add/PhiraiAd)（Rust + wgpu 原生应用）的核心玩法、渲染与设置搬进浏览器，纯前端、零构建、零后端依赖。

> 打开即玩：所有谱面解析、判定、渲染、成绩记录都在浏览器本地完成，谱面数据只存在你自己的 IndexedDB 里。

---

## 快速开始

```bash
# 任意静态服务器即可（不要用 file:// 打开，IndexedDB / fetch 会受限）
python3 -m http.server 8080
# 浏览器访问 http://localhost:8080
```

或者直接使用 GitHub Pages 线上版本。

### 导入谱面

三种方式任选：

| 方式 | 说明 |
| --- | --- |
| **导入谱面（pez / zip / 文件）** | 选择 `.pez`（Phira 官方打包格式）或 `.zip` 谱面包（内含 `chart.json` + `info.yml`/`info.txt` + 音频 + 曲绘），或直接多选谱面文件 + 音频 + 图片 |
| **导入文件夹** | 选择整个谱面文件夹（`webkitdirectory`），自动配对谱面 / 音频 / 曲绘 |
| **配置转谱** | 粘贴紧凑行文本或 JSON 配置，现场生成可游玩的谱面（无需任何素材） |

支持的谱面格式：

- **RPE / Phira JSON**（`.json`、`.rpe`）：完整支持多判定线、父子判定线、`eventLayers` 事件层、29 种缓动、`speedEvents` 速度事件、噪域 `blockAreaList`、自动倒打 `autoFlipIntervals`。
- **Phira 谱面包 `.pez`**（本质是 zip）：自动解包，按内容识别真正的谱面文件（避开 `chart_stats.json`），并从 `info.yml` / `info.txt` 读取曲名、曲师、谱师、难度、曲绘名。
- **Phigros 官方格式 v1 / v3**（`.pez` / `.zip` 内的 `chart.json`）：1/32 拍时间轴、`judgeLineList`、`PositionX` 缩放、速度事件积分出线高度、噪域、自动倒打。
- **PEC 文本**（`.pec`）：`&` 偏移行、`#` 事件行、`n1..n4` 音符行。
- **纯配置**：JSON `{name,bpm,offset,duration,lines:[{x,y,rotate,notes:[{t,type,x,hold}]}]}` 或紧凑行

  ```
  # name 示例谱面
  # bpm 180
  # 时间,类型,x[,持续]     类型 = tap / drag / hold / flick 或 1..4
  0,tap,0
  0.5,drag,0.2
  1,hold,-0.3,1.2
  2,flick,0.5
  ---
  0,tap,0
  ```

  多条判定线用独占一行的 `---` 分隔。

---

## 已实现

### 谱面与渲染
- RPE / Phira / PEC 解析，坐标系与上游一致（1350×900 画布 → `positionX/(1350/2)`、`moveY*2/900`、`rotate` 取负、`yOffset*2/900*speed`）。
- 父子判定线变换继承（`father` + `rotateWithFather`，最多 8 层），alpha / scale 相乘。
- 29 项缓动表（与 RPE `easingType` 编号一致），关键帧区间裁剪求值。
- 判定线按 `zOrder` 分层绘制，支持 `rainbow` 彩虹色与 `lineGlow` 泛光。
- **噪域（Noise）**：`blockAreaList` 四段时间（appear / enable / disable / disappear）alpha 曲线、rotate / move / scale 事件、`isSubtract` 反向挖空（`destination-out`），贴图取自上游 `texture_15/17/30.png`，低配模式降级为纯黑块。
- 四类音符：Tap（白色渐变圆角条）、Drag（黄色细条）、Flick（红色闪电形）、Hold（蓝青渐变长条 + 头部描边 + 按住进度填充）。
- 谱面自带 offset（`META.offset`，ms/s 自动识别）与用户延迟偏移叠加，Nightcore 变速时仍与音乐对齐。
- 自动倒打：按 `autoFlipIntervals` 在 0.8 秒内旋转 180°（与上游一致的翻转时长）。
- 击打特效：`hit_fx.png` + `lighter` 混合 + 径向光晕 + 粒子，按判定染色（`fxColor.*`）。
- 判定文字（PERFECT / GOOD / BAD / MISS + EARLY/LATE 毫秒提示）、进度条、触控调试圆点（`touch.png`）。

### 判定与计分
- 判定窗（秒）：Phira 默认 `P/G/B = 0.08/0.16/0.22`、Phigros 复刻 `0.08/0.18/0.22`、Phigros 严格 `0.04/0.09/0.14`、自定义（可调 P/G/B/Drag/Hold 尾）。
- Flick 判定窗 = Perfect × 1.75（Phigros 复刻），支持**滑动速度触发**（`flick_speed_threshold`）。
- Drag：触点落在横向范围内自动 Perfect，漏掉记 Miss 但**不断连击**（Phigros 规则）。
- Hold：头判 + 尾判，提前松手按剩余时长降级，`holdProgress` 显示按住进度。
- 计分：`acc = (P + 0.65G) / N`，`score = ((1-r)·acc + maxCombo/N·r) × 1000000`，全 Perfect 直接 1000000；`jm.comboScoreRatio`（r）与 `jm.countsLocalScore` 可调。
- 评级：`φ`（All Perfect）/ V ≥ 960000 / S ≥ 920000 / A ≥ 880000 / B ≥ 820000 / C ≥ 780000 / F。
- 死路模式：`instantDeathAP`（非 Perfect 即失败）、`instantDeathFC`（MISS/BAD 即失败）。

### 输入
- 多点触控（Pointer Events），横向命中范围 `1.6 ×` 音符半宽，可选 `fullscreenJudgement` 全屏判定。
- 键盘映射（Tap/Drag/Hold/Flick 四组，设置页可逐键重绑）。
- 双击屏幕 / Esc 暂停，切到后台自动暂停；暂停面板支持继续 / 重开 / 退出。

### 素材（100% 取自上游，未自绘替代）
- 音效：`click / drag / flick / hold / button / button_large / switch / ending / cali / cali_hit`（`.ogg`）。
- 材质：`respack/click|drag|flick|hold(_mh).png`、`hit_fx.png`、噪域 `texture_15/17/30.png`、`touch.png`、`abstract.jpg`。
- 字体：`phigros.ttf`、`bold.ttf`；评级图 `rank/{phi,V,S,A,B,C,F,FC}.png`。
- 支持在设置页**替换自定义打击音**（click / drag / flick）与**自定义打击特效图 / 判定线贴图**，存为 dataURL。

### 界面
- 首页 / 谱面库 / 设置 / 游玩 / 结算 五屏。
- 谱面库：搜索（曲名 / 谱师 / 难度）、排序（导入时间 / 曲名 / 难度 / 成绩 / 收藏）、仅收藏筛选、拖拽导入、卡片显示曲绘 / 格式 / 难度 / 最佳成绩与评级。
- 谱面详情：收藏、导出 RPE、删除、开始游玩。
- 结算：评级图、分数、准度、AP/FC 标记、四类计数、最大连击、失败原因、重试 / 返回。
- 设置页 8 个分组（游玩 / 判定 / 显示 / 特效 / 噪域 / 音频 / 数据 / 自定义资源），含开关、滑条、下拉、颜色、键位绑定、资源替换、导入导出 / 恢复默认。
- 极致精简的依赖：**无框架、无构建、无 CDN**，7 个 JS 文件按序加载。

---

## 未包含（与上游的差异）

以下能力**故意未实现**（需要账号体系 / 服务端 / 大量二进制资源，或已与作者确认剔除）：

- 在线谱面下载（谱面库只支持本地导入）
- 账号、云同步、排行榜、成绩上传
- 判定范围可视化、练习模式扩展（变速 / 段落循环）
- AI 定数（难度星级）预测、自定义 RKS、B30 统计
- 录制回放文件（`replayRecordingEnabled` 目前仅保留设置项）

`noiseArea.preciseEdges`（噪域边缘精修）与 `aggressive`（激进预载）保留设置项但为占位，不影响游玩。

---

## 目录结构

```
phiraiad-web/
├── index.html          # 五屏结构 + 脚本加载顺序
├── css/app.css         # 暗色玻璃主题（@font-face、控件、HUD、弹窗、动画）
├── js/
│   ├── util.js         # 工具：DOM、缓动表、关键帧求值、localStorage、toast/confirm、下载
│   ├── settings.js     # 设置项定义（约 90 项，键名对齐上游 Config）+ 设置页生成
│   ├── chart.js        # RPE/PEC 解析、ZIP 解包、IndexedDB 谱面库、配置转谱、导出 RPE
│   ├── audio.js        # WebAudio 音效、音乐播放/变速、自定义音效
│   ├── engine.js       # 判定核心 + 全部渲染（背景/噪域/判定线/音符/特效/HUD 画布层）
│   ├── data.js         # 谱面库数据层（导入/成绩/收藏）
│   └── ui.js           # 路由、谱面库、导入、HUD、结算、弹窗、事件绑定
├── assets/             # 上游素材（音效 / 贴图 / 字体 / 评级图）
└── prpr/src/noise_area/assets/   # 噪域贴图与 touch.png（保持上游路径）
```

---

## 部署（GitHub Pages）

仓库根目录即站点根目录，`main` 分支 + 根路径直接发布，无需构建：

1. Settings → Pages → Source 选 **Deploy from a branch**
2. Branch 选 `main`、目录选 `/ (root)`
3. 访问 `https://<user>.github.io/phiraiad-web/`

`.nojekyll` 已包含，避免 Jekyll 处理静态资源。

---

## 许可证与致谢

- 本项目以 **GPL-3.0** 发布（与上游一致），见 [LICENSE](LICENSE)。
- 上游项目：[PhiraiAd](https://github.com/Adai-add/PhiraiAd)（Phira 非官方改版），以及 [Phira](https://github.com/TeamFlos/phira) 项目及其贡献者。
- 所有音效、贴图、字体均来自上述上游仓库，版权归原作者所有；本项目仅做网页端移植。
- **本项目与 Phira / Phigros 官方无关**，仅供学习与交流，请勿用于商业用途。游玩请支持正版 Phigros。
