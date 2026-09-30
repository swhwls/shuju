/* ============================================================================
   AI 漫剧全网实时流量监控大屏 —— 单屏 1920×1080 静态交付版
   视觉：浅色编辑排版（纸白 + 墨黑发丝线 + 朱红强调），无圆角/阴影/发光。
   无后台：static 模式为确定性数据快照；live 模式为前端有界游走的演示数据源。
   ============================================================================ */
(function () {
  'use strict';

  /* ---------- 0. 运行参数 ---------- */
  var Q = new URLSearchParams(location.search);
  var MODE = (Q.get('mode') || 'static').toLowerCase();      // static | live
  var STATE = (Q.get('state') || 'ok').toLowerCase();        // ok | loading | nodata | offline
  if (['loading', 'nodata', 'offline'].indexOf(STATE) < 0) STATE = 'ok';

  var REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var HAS_ECHARTS = typeof window.echarts !== 'undefined';

  function $(id) { return document.getElementById(id); }
  function el(html) { var d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild; }

  /* ---------- 1. 确定性随机（static 模式同一 seed → 每次刷新数值完全一致） ---------- */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  var SEED = MODE === 'live' ? (Date.now() % 2147483647) : 20260930;
  var rnd = mulberry32(SEED);

  /* ---------- 2. 静态字典 ---------- */
  /* 平台标志色：编辑风不使用高饱和品牌色，改为同一墨色族内的明度阶梯，
     仅"优酷"一处用告警色表示异常。排名靠前的平台在竞速榜中以朱红标注。 */
  var PLAT = [
    { nm: '抖音',       st: 'ok' }, { nm: '快手',       st: 'ok' },
    { nm: '红果短剧',   st: 'w'  }, { nm: '微信视频号', st: 'ok' },
    { nm: '哔哩哔哩',   st: 'ok' }, { nm: '腾讯视频',   st: 'ok' },
    { nm: '爱奇艺',     st: 'ok' }, { nm: '优酷',       st: 'e'  }
  ];
  var SRC = ['推荐信息流', '搜索进入', '关注订阅', '社交分享', '广告投放', '其他'];
  var SRC_V = [52.4, 16.8, 14.2, 9.7, 5.3, 1.6];
  var TOPN = [
    { n1: '我在天庭收破烂',     n2: '抖音' },
    { n1: '末日列车：第七车厢', n2: '快手' },
    { n1: '重生之我是首富他妈', n2: '红果短剧' },
    { n1: '修仙界第一打工人',   n2: '哔哩哔哩' },
    { n1: '总裁的 AI 替身妻',   n2: '微信视频号' },
    { n1: '山海经：归墟启航',   n2: '抖音' }
  ];
  /* 省级流量权重（近似网民规模分布，代码内归一化），34 个省级行政区与地图要素一一对应 */
  var PROV_W = {
    '广东省': 11.2, '山东省': 7.0, '江苏省': 6.7, '河南省': 6.4, '四川省': 5.9, '浙江省': 5.7,
    '河北省': 5.0, '湖南省': 4.5, '湖北省': 4.2, '安徽省': 3.9, '福建省': 3.4, '北京市': 3.3,
    '上海市': 3.1, '广西壮族自治区': 2.9, '陕西省': 2.8, '江西省': 2.7, '辽宁省': 2.7, '云南省': 2.6,
    '重庆市': 2.4, '贵州省': 2.2, '山西省': 2.1, '黑龙江省': 2.0, '台湾省': 1.8, '吉林省': 1.6,
    '天津市': 1.5, '甘肃省': 1.4, '内蒙古自治区': 1.3, '新疆维吾尔自治区': 1.3, '海南省': 0.9,
    '香港特别行政区': 0.6, '宁夏回族自治区': 0.5, '青海省': 0.4, '西藏自治区': 0.3, '澳门特别行政区': 0.2
  };
  /* 地图上不显示文字标注的极小行政区（避免与邻省标签重叠，数值在省级榜中可读） */
  var NO_LABEL = ['北京市', '上海市', '天津市', '香港特别行政区', '澳门特别行政区', '南海诸岛'];

  function shortName(n) {
    return n.replace(/(特别行政区|自治区|省|市)$/, '').replace(/(壮族|回族|维吾尔族|维吾尔)$/, '');
  }

  /* ---------- 3. 实时数据容器 ---------- */
  var RT = {
    plays: 353420000, ccu: 869200, dramas: 1286, inter: 23930000, complete: 46.1,
    kd: [2.4, 3.1, 43, 1.8, -0.6],
    rate: [268900, 268400, 271200, 265800, 274600, 279300, 282100, 276900,
           284500, 291200, 288700, 295400, 301800, 297600, 306200, 312500],
    health: [12860, 7340, 5920, 3180, 2460, 1540, 1180, 860],
    hdt: [1.8, 3.2, 2.7, 0.9, 2.4, -1.1, 0.6, -2.3],
    top: [4820, 3650, 3180, 2740, 2310, 1960],
    topc: [12.4, 8.7, 6.2, 15.3, -2.1, 21.8],
    src: SRC_V.slice(),
    prov: null
  };
  (function initProv() {
    var names = Object.keys(PROV_W), sum = 0, i;
    for (i = 0; i < names.length; i++) sum += PROV_W[names[i]];
    RT.prov = {};
    for (i = 0; i < names.length; i++) {
      var w = PROV_W[names[i]] / sum * 100;
      RT.prov[names[i]] = MODE === 'live' ? w * (1 + (rnd() * 2 - 1) * 0.03) : w;
    }
  })();

  /* 基准值：波动带轻微均值回归，长时间挂机不会漂到不可信的区间。
     累计量（播放量/互动量）另按单调增长处理，不参与回归。 */
  var BASE = {
    ccu: RT.ccu, complete: RT.complete, kd: RT.kd.slice(),
    /* 速率窗口的基准在下面由种子数组均值回填 */
    rate: 285000,
    health: RT.health.slice(), hdt: RT.hdt.slice(),
    top: RT.top.slice(), topc: RT.topc.slice(),
    src: RT.src.slice(), prov: {}
  };
  (function () { for (var k in RT.prov) BASE.prov[k] = RT.prov[k]; })();

  /* 速率窗口：种子数组的离散度比实时游走的稳态带宽大得多，
     先把基准取为种子均值、并把种子向均值压缩，否则固定量程下曲线会长期贴在底部。 */
  (function () {
    var m = 0, i, TARGET = 280000;   /* 取整数万，使固定量程的上下沿都能落在刻度整数倍上 */
    for (i = 0; i < RT.rate.length; i++) m += RT.rate[i];
    m /= RT.rate.length;
    BASE.rate = TARGET;
    for (i = 0; i < RT.rate.length; i++) RT.rate[i] = Math.round(TARGET + (RT.rate[i] - m) * 0.55);
  })();

  /* 有界游走：cur 按 vol 比例抖动后，向 base 回归 rev 比例 */
  function walk(cur, base, vol, rev) {
    var v = cur * (1 + (rnd() * 2 - 1) * vol);
    return v + (base - v) * rev;
  }

  /* ---------- 4. 告警：单一数据源 ----------
     口径：活跃告警 = 流水列表中「未恢复」的条目数（lv!=='r'）；恢复条目只作流水展示不计入。
     指标带与告警面板表头均从本函数取值，两处数字恒等，可现场核对。 */
  var ALERTS = [
    { lv: 'e', lg: '异常', ms: '推荐池命中异常 · 抖音',        t: -42 },
    { lv: 'w', lg: '预警', ms: '完播率骤降 8.3pt · 红果短剧',  t: -128 },
    { lv: 'i', lg: '提示', ms: '新剧上线首小时破百万',          t: -215 },
    { lv: 'r', lg: '恢复', ms: '弹幕接口抖动已自动重连',        t: -331 },
    { lv: 'w', lg: '警告', ms: 'CDN 命中率跌至 91.4%',         t: -508 }
  ];
  var ALERT_POOL = [
    '接口延迟 4.2s 超 P95 阈值', '流量突增触发限流', '转码队列积压 12 条',
    '海外节点回源超时', '跨区同步延迟 2.7s', '爆款增长预警 +21.8%',
    '连续 3 周期下滑', '实时在线数环比跳变'
  ];
  var VIS_ALERT = 7;   // 版面高度可容 7 条，其余以 +N 提示（单屏不滚动）

  function alertActive() { return ALERTS.filter(function (a) { return a.lv !== 'r'; }); }
  function alertMix() {
    var order = [['e', '异常'], ['w', '预警'], ['i', '提示']], out = [];
    for (var i = 0; i < order.length; i++) {
      var n = ALERTS.filter(function (a) { return a.lv === order[i][0]; }).length;
      if (n) out.push(n + ' ' + order[i][1]);
    }
    return out.length ? out.join(' · ') : '无活跃告警';
  }

  /* ---------- 5. 格式化 ---------- */
  function sign(v, unit) {
    unit = unit || '';
    return (v >= 0 ? '▲ +' : '▼ ') + v.toFixed(1) + unit;
  }
  function hms(off) {
    var d = new Date(Date.now() + (off || 0) * 1000);
    return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) +
           ':' + ('0' + d.getSeconds()).slice(-2);
  }
  function cnDate() {
    var d = new Date(), w = '日一二三四五六'.charAt(d.getDay());
    return d.getFullYear() + ' 年 ' + (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日  星期' + w;
  }

  /* ---------- 6. 面板骨架 ---------- */
  var PANELS = [];
  function panel(no, title, en, rightHtml, bodyHtml) {
    var p = el(
      '<section class="panel">' +
        '<div class="ph"><span class="no">' + no + '</span><h2>' + title + '</h2>' +
        '<span class="en">' + en + '</span>' +
        (rightHtml ? '<span class="rv">' + rightHtml + '</span>' : '') + '</div>' +
        '<div class="bd">' + (bodyHtml || '') + '</div>' +
        '<div class="ov"><span class="ico">—</span><span class="t">暂无数据</span>' +
        '<span class="e">NO DATA</span></div>' +
      '</section>'
    );
    PANELS.push(p);
    return p;
  }

  /* ============================ 报头 ============================ */
  function buildMasthead() {
    $('masthead').innerHTML =
      '<div class="mh-title">' +
        '<h1>AI 漫剧全网实时流量监控</h1>' +
        '<div class="mh-en">AI Comic Drama · Realtime Traffic Monitor</div>' +
      '</div>' +
      '<div class="mh-meta">' +
        '<div class="mh-block">' +
          '<span class="mh-date" id="mhDate">—</span>' +
          '<span class="mh-status"><i class="dot" id="linkDot"></i><span id="linkTxt">数据链路正常</span>' +
            '<span class="sep">|</span><span id="upd">1s 刷新 · 8 平台 · 34 省级行政区</span></span>' +
        '</div>' +
        '<span class="mh-clock" id="clock">00:00:00</span>' +
      '</div>' +
      '<div class="acsw" id="acsw">' +
        '<span class="lb">色阶</span>' +
        '<button data-a="vermilion">朱红</button>' +
        '<button data-a="indigo">靛蓝</button>' +
        '<button data-a="moss">墨绿</button>' +
      '</div>';

    var saved = 'vermilion';
    try { saved = localStorage.getItem('dashAccent') || 'vermilion'; } catch (e) {}
    function setAccent(a) {
      document.documentElement.dataset.accent = a;
      var bs = document.querySelectorAll('#acsw button');
      for (var i = 0; i < bs.length; i++) bs[i].classList.toggle('on', bs[i].dataset.a === a);
      try { localStorage.setItem('dashAccent', a); } catch (e) {}
      if (window.__recolor) window.__recolor();
    }
    $('acsw').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (b) setAccent(b.dataset.a);
    });
    setAccent(saved);
  }

  /* ============================ 指标带 ============================ */
  function buildKPIBand() { /* 结构由 drawKPI 填充 */ }

  function drawKPI() {
    var act = alertActive().length;
    /* 精度取值以"每秒都能看出变化"为准：累计量给到 4 位亿 / 2 位万 */
    var rows = [
      ['全网今日播放量', 'Daily Plays', (RT.plays / 1e8).toFixed(4) + ' 亿',
        sign(RT.kd[0]) + '% 较昨日同刻', 'up', true],
      ['实时在线观看',   'Live Viewers', (RT.ccu / 1e4).toFixed(1) + ' 万',
        sign(RT.kd[1]) + '% 较昨日同刻', 'up', false],
      ['在播 AI 漫剧',   'Active Titles', Math.round(RT.dramas) + ' 部',
        '▲ +' + Math.round(RT.kd[2]) + ' 今日新增', 'up', false],
      ['全网互动量',     'Engagements', (RT.inter / 1e4).toFixed(2) + ' 万',
        sign(RT.kd[3]) + '% 较昨日同刻', 'up', false],
      ['平均完播率',     'Completion', RT.complete.toFixed(1) + ' %',
        sign(RT.kd[4]) + 'pt 较昨日同刻', RT.kd[4] >= 0 ? 'up' : 'down', false],
      ['活跃告警',       'Active Alerts', act + ' 条', alertMix(), 'warn', false]
    ];
    /* loading / nodata 尚无数据可读，数值位留破折号；offline 保留最后已知值（压暗显示） */
    var blank = STATE === 'loading' || STATE === 'nodata';
    var s = '';
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      s += '<div class="kitem' + (r[5] ? ' key' : '') + '">' +
             '<div class="klab">' + r[0] + '<i>' + r[1] + '</i></div>' +
             '<div class="kval">' + (blank ? '—' : r[2]) + '</div>' +
             '<div class="kdl ' + r[4] + '">' + (blank ? '等待数据' : r[3]) + '</div>' +
           '</div>';
    }
    $('kpiBand').innerHTML = s;
  }

  /* ============================ 各面板 ============================ */
  function buildPanels() {
    /* 地图：主视觉（朱红渐变色阶 + 南海诸岛附图） */
    var mapPanel = panel('01', '中国地域实时流量分布', 'China Province Traffic Map',
      '<span id="mapTotal">—</span>',
      '<div id="mapWrap">' +
        '<div id="mapChart"></div>' +
        '<div id="nanhai"><div id="nanhaiChart"></div>' +
        '<span class="cap">南海诸岛 · SOUTH CHINA SEA</span></div>' +
        '<div id="mapScale">占比 %　<i></i>低<u></u>高</div>' +
        '<div id="mapNote"><b>34 省级行政区</b> · 含台湾省、香港/澳门特别行政区<br>' +
        '<b>南海诸岛及九段线</b> 依国家标准地图绘制（见右下附图）</div>' +
      '</div>');
    mapPanel.classList.add('wide');
    $('cellMap').appendChild(mapPanel);

    /* 侧栏 A：竞速榜 + 平台健康度 */
    var rank = panel('02', '平台流量竞速榜', 'Play Ranking · 今日播放(万)',
      '8 平台', '<div id="rankList"></div>');
    rank.style.height = '242px'; rank.style.flex = 'none';
    $('cellSideA').appendChild(rank);

    var health = panel('03', '平台健康度', 'Platform Health',
      '<span id="healthSum">—</span>', '<div id="healthList"></div>');
    health.classList.add('wide');
    $('cellSideA').appendChild(health);

    /* 侧栏 B：省级 TOP + TOP 漫剧 */
    var prov = panel('04', '省级流量 TOP 12', 'China Province Top 12',
      '占比 %', '<div class="geogrid" id="geoBox"></div>');
    prov.style.height = '242px'; prov.style.flex = 'none';
    $('cellSideB').appendChild(prov);

    var top = panel('05', 'TOP 热门 AI 漫剧', 'Hot Drama · 近 30 分钟增速',
      'TOP 6', '<div id="topList"></div>');
    top.classList.add('wide');
    $('cellSideB').appendChild(top);

    /* 趋势：通栏宽图 */
    var trend = panel('06', '全网实时流量趋势', 'Rolling 16s · 次/分',
      '<span id="trendNow">—</span>', '<div id="trendChart"></div>');
    trend.classList.add('wide');
    $('cellTrend').appendChild(trend);

    /* 来源：条形表（编辑风不用环形图） */
    $('cellSource').appendChild(panel('07', '流量来源构成', 'Traffic Source',
      '占比 %', '<div id="srcList"></div>'));

    /* 告警：表头与指标带同源 */
    $('cellAlert').appendChild(panel('08', '实时告警事件流', 'Alert Stream',
      '<span id="alertCnt">—</span>', '<div id="alertList"></div>'));
  }

  function drawRank() {
    var mx = Math.max.apply(null, RT.health), s = '';
    for (var i = 0; i < PLAT.length; i++) {
      var bad = PLAT[i].st === 'e';
      s += '<div class="rk' + (bad ? ' bad' : '') + '">' +
             '<span class="nm">' + PLAT[i].nm + '</span>' +
             '<span class="bt"><i style="width:' + (RT.health[i] / mx * 100).toFixed(1) + '%"></i></span>' +
             '<span class="vv">' + RT.health[i].toLocaleString('en-US') + '</span>' +
           '</div>';
    }
    $('rankList').innerHTML = s;
  }

  function drawHealth() {
    var s = '', sum = 0, mx = Math.max.apply(null, RT.health);
    for (var i = 0; i < PLAT.length; i++) {
      var d = RT.hdt[i];
      sum += RT.health[i];
      s += '<div class="hr">' +
             '<span class="nm">' + PLAT[i].nm + '</span>' +
             '<span class="hb"><i style="width:' + (RT.health[i] / mx * 100).toFixed(1) + '%"></i></span>' +
             '<span class="vv">' + RT.health[i].toLocaleString('en-US') + '</span>' +
             '<span class="dt ' + (PLAT[i].st === 'e' ? 'down' : d >= 0 ? 'up' : 'down') + '">' +
               sign(d) + '%</span>' +
           '</div>';
    }
    $('healthList').innerHTML = s;
    var hs = $('healthSum');
    if (hs) hs.textContent = '合计 ' + sum.toLocaleString('en-US') + ' 万';
  }

  function drawSrc() {
    var s = '';
    for (var i = 0; i < SRC.length; i++) {
      s += '<div class="sr">' +
             '<span class="nm">' + SRC[i] + '</span>' +
             '<span class="bb"><i style="width:' + RT.src[i].toFixed(1) + '%"></i></span>' +
             '<span class="vv">' + RT.src[i].toFixed(1) + '</span>' +
           '</div>';
    }
    $('srcList').innerHTML = s;
  }

  function drawTop() {
    var s = '';
    for (var i = 0; i < TOPN.length; i++) {
      var c = RT.topc[i];
      s += '<div class="tp">' +
             '<span class="no">' + (i + 1) + '</span>' +
             '<span class="n1">' + TOPN[i].n1 + '<i>' + TOPN[i].n2 + '</i></span>' +
             '<span class="pv">' + RT.top[i].toLocaleString('en-US') + '</span>' +
             '<span class="pc ' + (c >= 0 ? 'up' : 'down') + '">' + sign(c) + '%</span>' +
           '</div>';
    }
    $('topList').innerHTML = s;
  }

  function provSorted() {
    return Object.keys(RT.prov).map(function (k) { return { n: k, v: RT.prov[k] }; })
      .sort(function (a, b) { return b.v - a.v; });
  }

  function drawGeo() {
    var list = provSorted().slice(0, 12), mx = list[0].v, s = '';
    for (var i = 0; i < list.length; i++) {
      s += '<div class="geo' + (i < 3 ? ' hot' : '') + '" data-prov="' + list[i].n + '">' +
             '<span class="pn">' + shortName(list[i].n) + '</span>' +
             '<span class="gb"><i style="width:' + (list[i].v / mx * 100).toFixed(1) + '%"></i></span>' +
             '<span class="gv">' + list[i].v.toFixed(2) + '</span>' +
           '</div>';
    }
    $('geoBox').innerHTML = s;
  }

  function drawAlerts() {
    var act = alertActive(), list = ALERTS.slice(0, VIS_ALERT), s = '';
    for (var i = 0; i < list.length; i++) {
      var a = list[i];
      s += '<div class="al lv-' + a.lv + '">' +
             '<span class="lg">' + a.lg + '</span>' +
             '<span class="ms">' + a.ms + '</span>' +
             '<span class="tm">' + hms(a.t) + '</span>' +
           '</div>';
    }
    var shownActive = list.filter(function (a) { return a.lv !== 'r'; }).length;
    var more = act.length - shownActive;
    if (more > 0) s += '<div class="alMore">另有 ' + more + ' 条活跃告警未展开</div>';
    $('alertList').innerHTML = s;

    var cnt = $('alertCnt');
    cnt.textContent = '活跃 ' + act.length + ' 条 · 流水 ' + ALERTS.length + ' 条';
    cnt.className = 'rv' + (ALERTS.some(function (a) { return a.lv === 'e'; }) ? ' bad'
      : act.length ? ' warn' : '');
  }

  /* ============================ 图表 ============================ */
  var charts = {};
  function cssv(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
  var LABEL_FONT = "'PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif";
  var MONO_FONT = "'IBM Plex Mono','JetBrains Mono',Consolas,monospace";

  function hex2rgb(h) {
    h = h.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function lerp(a, b, t) {
    var A = hex2rgb(a), B = hex2rgb(b);
    return 'rgb(' + Math.round(A[0] + (B[0] - A[0]) * t) + ',' +
                    Math.round(A[1] + (B[1] - A[1]) * t) + ',' +
                    Math.round(A[2] + (B[2] - A[2]) * t) + ')';
  }
  function tip() {
    return {
      backgroundColor: '#FFFFFF', borderColor: cssv('--rule-2'), borderWidth: 1,
      padding: [7, 10], extraCssText: 'box-shadow:none;border-radius:0',
      textStyle: { color: cssv('--ink'), fontSize: 11, fontFamily: LABEL_FONT }
    };
  }

  /* 主图：中国省级色阶图（浅→深强调色），主图裁到大陆范围，南海诸岛另见右下附图 */
  function mapOption() {
    var feat = window.CHINA_GEO.features, vals = [], regions = [], i;
    for (i = 0; i < feat.length; i++) {
      var nm = feat[i].properties.name;
      if (nm === '南海诸岛') continue;
      vals.push(RT.prov[nm] || 0);
    }
    var mx = Math.max.apply(null, vals), mn = Math.min.apply(null, vals);
    var lo = cssv('--map-lo'), hi = cssv('--map-hi');
    var ink = cssv('--ink'), ink3 = cssv('--ink-3'), rule2 = cssv('--rule-2');

    function ramp(v) {
      var t = mx === mn ? 0.5 : Math.pow((v - mn) / (mx - mn), 0.55);
      return lerp(lo, hi, t);
    }

    for (i = 0; i < feat.length; i++) {
      var n = feat[i].properties.name, isJD = n === '南海诸岛';
      var v = isJD ? null : (RT.prov[n] || 0);
      var t = (v === null || mx === mn) ? 0 : (v - mn) / (mx - mn);
      regions.push({
        name: n,
        itemStyle: {
          /* 主图裁到大陆范围，九段线整体交给右下附图呈现，避免只画出半截 */
          areaColor: isJD ? 'rgba(0,0,0,0)' : (STATE === 'nodata' ? '#F0EDE6' : ramp(v)),
          borderColor: isJD ? 'rgba(0,0,0,0)' : '#FFFFFF',
          borderWidth: isJD ? 0 : 0.7
        },
        emphasis: { itemStyle: { areaColor: isJD ? 'rgba(0,0,0,0)' : hi, borderColor: ink } },
        label: {
          /* 深色块上用反白字，浅色块上用墨色 */
          show: NO_LABEL.indexOf(n) < 0,
          color: t > 0.6 ? '#FFFFFF' : ink3,
          fontSize: 9.5, fontFamily: LABEL_FONT
        }
      });
    }

    var top = provSorted().slice(0, 6);
    var pts = [];
    for (i = 0; i < top.length; i++) {
      var f2 = feat.filter(function (f) { return f.properties.name === top[i].n; })[0];
      if (!f2) continue;
      var c = f2.properties.centroid || f2.properties.center;
      if (c) pts.push({ name: shortName(top[i].n), value: [c[0], c[1], top[i].v] });
    }

    return {
      animationDuration: 600,
      tooltip: Object.assign(tip(), {
        trigger: 'item',
        formatter: function (p) {
          if (p.seriesType === 'scatter') return p.name + '　' + p.value[2].toFixed(2) + ' %';
          var v = RT.prov[p.name];
          return p.name + (v === undefined ? '' : '　' + v.toFixed(2) + ' %');
        }
      }),
      geo: {
        map: 'china', roam: false, top: 6, bottom: 6, left: 6, right: 6,
        /* 裁到大陆范围：南海诸岛另以右下标准附图呈现，主图因此获得接近 16:9 的构图 */
        boundingCoords: [[73, 17.5], [136, 54]],
        tooltip: {
          show: true, backgroundColor: '#FFFFFF', borderColor: rule2, borderWidth: 1,
          padding: [7, 10], extraCssText: 'box-shadow:none;border-radius:0',
          textStyle: { color: ink, fontSize: 11, fontFamily: LABEL_FONT },
          formatter: function (p) {
            var v = RT.prov[p.name];
            return p.name + (v === undefined ? '' : '　' + v.toFixed(2) + ' %');
          }
        },
        itemStyle: { areaColor: '#F0EDE6', borderColor: '#FFFFFF', borderWidth: 0.7 },
        emphasis: { itemStyle: { areaColor: hi }, label: { show: true, color: '#FFFFFF', fontSize: 10 } },
        regions: regions,
        label: { show: false }
      },
      series: [{
        /* 编辑风：静态圆点而非涟漪动效 */
        type: 'scatter', coordinateSystem: 'geo', data: pts, zlevel: 2,
        symbolSize: function (val) { return 5 + Math.sqrt(val[2]) * 2.6; },
        itemStyle: { color: ink, borderColor: '#FFFFFF', borderWidth: 1.2 },
        label: {
          show: true, position: 'right', offset: [4, 0],
          formatter: function (p) { return p.name; },
          color: ink, fontSize: 10, fontFamily: LABEL_FONT
        },
        emphasis: { scale: 1.2 }
      }]
    };
  }

  /* 九段线：源数据里每段是一条细长多边形，缩到附图尺寸后填充会细到看不见。
     这里取每段多边形的"最长弦"当作该段的中轴线，改用 1.8px 线宽绘制，
     保证在附图尺度下九段线始终清晰可辨。 */
  function jdSegments() {
    var f = window.CHINA_GEO.features.filter(function (x) {
      return x.properties.name === '南海诸岛';
    })[0];
    if (!f || !f.geometry) return [];
    var polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    var segs = [];
    for (var p = 0; p < polys.length; p++) {
      var ring = polys[p][0];
      if (!ring || ring.length < 3) continue;
      var best = -1, a = ring[0], b = ring[1];
      for (var i = 0; i < ring.length; i++) {
        for (var j = i + 1; j < ring.length; j++) {
          var dx = ring[i][0] - ring[j][0], dy = ring[i][1] - ring[j][1];
          var d = dx * dx + dy * dy;
          if (d > best) { best = d; a = ring[i]; b = ring[j]; }
        }
      }
      segs.push([a, b]);
    }
    return segs;
  }

  /* 南海诸岛附图：九段线 + 华南沿海作地理参照 —— 标准横版中国地图的必备附图 */
  function nanhaiOption() {
    var hi = cssv('--map-hi'), ink3 = cssv('--ink-3');
    return {
      animation: false,
      geo: {
        map: 'nanhai', roam: false, left: 4, right: 4, top: 4, bottom: 4,
        boundingCoords: [[106, 2], [124, 24]],
        itemStyle: { areaColor: '#F0EDE6', borderColor: ink3, borderWidth: .6 },
        regions: [{ name: '南海诸岛', itemStyle: { areaColor: 'rgba(0,0,0,0)', borderColor: 'rgba(0,0,0,0)', borderWidth: 0 } }],
        silent: true
      },
      series: [{
        type: 'lines', coordinateSystem: 'geo', silent: true, zlevel: 2,
        lineStyle: { color: hi, width: 1.8, opacity: 1 },
        data: jdSegments().map(function (s) { return { coords: s }; })
      }]
    };
  }

  /* 趋势图 = 16 秒滚动窗口，每秒右端进一个新采样、左端掉一个旧采样。
     要点：
     1) 关闭更新补间（animationDurationUpdate:0）——否则 ECharts 会在新旧数组间插值，
        整条曲线一起扭动；我们要的是"已画出的线段不动，整体左移一格"。
     2) Y 轴量程写死，不随数据自动缩放，避免旧点跟着上下跳。
     3) 采样间隔 1s，所以 x 轴用 时:分:秒 标注（原来标分钟，与刷新频率对不上）。 */
  /* Y 轴量程固定：中点吸附到 5000 整数倍、半幅取整 2 万，使量程恰为 4 万。
     ECharts 一定会把 min/max 原样保留为首尾刻度，再在中间填"整"值——
     量程不是整刻度的整数倍时，首尾两格间距就会比中间小一半（刻度看起来忽疏忽密）。 */
  var RATE_MID = Math.round(BASE.rate / 10000) * 10000;
  var RATE_MIN = RATE_MID - 20000, RATE_MAX = RATE_MID + 20000;
  function trendOption() {
    var ink = cssv('--ink'), accent = cssv('--accent');
    var rule = cssv('--rule'), ink4 = cssv('--ink-4');
    var labels = [], i, n = RT.rate.length;
    for (i = 0; i < n; i++) labels.push(hms(-(n - 1 - i)));
    return {
      animation: false,
      animationDuration: 0,
      animationDurationUpdate: 0,
      grid: { left: 56, right: 30, top: 18, bottom: 22 },
      tooltip: Object.assign(tip(), { trigger: 'axis' }),
      xAxis: {
        type: 'category', data: labels, boundaryGap: false,
        axisLine: { lineStyle: { color: rule } },
        axisTick: { show: false },
        axisLabel: {
          color: ink4, fontSize: 9, fontFamily: MONO_FONT,
          interval: function (idx) { return idx % 5 === 0 || idx === n - 1; }
        }
      },
      yAxis: {
        type: 'value', min: RATE_MIN, max: RATE_MAX, splitNumber: 4,
        splitLine: { lineStyle: { color: rule, type: 'dotted' } },
        axisLine: { show: false }, axisTick: { show: false },
        axisLabel: {
          color: ink4, fontSize: 9, fontFamily: MONO_FONT,
          formatter: function (v) { return (v / 1e4).toFixed(1) + '万'; }
        }
      },
      series: [{
        type: 'line', data: RT.rate, smooth: false, showSymbol: false,
        sampling: 'none', silent: false,
        lineStyle: { color: ink, width: 1.6 },
        areaStyle: { color: accent, opacity: 0.07 },
        /* 只标当前值一点；滚动窗口里"最大值"会不停易主，标注反而干扰阅读 */
        markPoint: {
          symbol: 'circle', symbolSize: 6, silent: true,
          itemStyle: { color: accent, borderColor: '#FFFFFF', borderWidth: 1.2 },
          label: { show: false },
          data: [{ coord: [n - 1, RT.rate[n - 1]], value: RT.rate[n - 1] }]
        }
      }]
    };
  }

  function initCharts() {
    if (!HAS_ECHARTS) return;
    var base = { renderer: 'canvas', useDirtyRect: true };
    if (STATE === 'loading') return;         // loading 态只出骨架屏，不建图表

    charts.trend = echarts.init($('trendChart'), null, base);
    charts.trend.setOption(trendOption());

    if (window.CHINA_GEO) {
      echarts.registerMap('china', window.CHINA_GEO);
      var NH_KEEP = ['南海诸岛', '海南省', '台湾省', '广东省', '广西壮族自治区'];
      echarts.registerMap('nanhai', {
        type: 'FeatureCollection',
        features: window.CHINA_GEO.features.filter(function (f) {
          return NH_KEEP.indexOf(f.properties.name) >= 0;
        })
      });
      charts.map = echarts.init($('mapChart'), null, base);
      charts.map.setOption(mapOption());
      charts.nanhai = echarts.init($('nanhaiChart'), null, base);
      charts.nanhai.setOption(nanhaiOption());
    } else {
      $('mapChart').innerHTML = '<div style="color:#8E877C;font-size:11px;padding:20px">' +
        '地图数据未加载 (assets/china.geo.js)</div>';
    }
  }

  /* 色阶档位切换后重绘（canvas 内取不到 CSS 变量，需按新值重建） */
  window.__recolor = function () {
    if (!HAS_ECHARTS || STATE === 'loading') return;
    try {
      if (charts.trend) charts.trend.setOption(trendOption());
      if (charts.map) charts.map.setOption(mapOption());
      if (charts.nanhai) charts.nanhai.setOption(nanhaiOption());
    } catch (e) {}
  };

  function redrawAll() {
    drawKPI(); drawRank(); drawHealth(); drawSrc(); drawTop(); drawGeo(); drawAlerts();
    var tn = $('trendNow');
    if (tn) tn.textContent = Math.round(RT.rate[RT.rate.length - 1]).toLocaleString('en-US') + ' 次/分';
    var mt = $('mapTotal');
    if (mt) {
      if (STATE === 'nodata') { mt.textContent = '无数据'; }
      else {
        var t = 0, k;
        for (k in RT.prov) t += RT.prov[k];
        mt.textContent = t.toFixed(1) + '% 覆盖';
      }
    }
  }

  /* ============================ 状态层 ============================ */
  function applyState() {
    var stage = $('stage');
    stage.dataset.st = STATE;
    var banner = $('banner');
    var txt = {
      loading: ['数据加载中', 'DATA LOADING', 'warn'],
      nodata:  ['暂无数据',   'NO DATA',      'warn'],
      offline: ['数据链路中断 · 正在重连', 'LINK DOWN / RECONNECTING', 'err']
    };
    var ovt = {
      loading: ['数据加载中', 'DATA LOADING'],
      nodata:  ['暂无数据', 'NO DATA'],
      offline: ['数据链路中断', 'LINK DOWN']
    };

    for (var i = 0; i < PANELS.length; i++) {
      var p = PANELS[i];
      if (STATE === 'ok') { p.removeAttribute('data-st'); continue; }
      p.setAttribute('data-st', STATE);
      var i1 = p.querySelector('.ov .ico'), t1 = p.querySelector('.ov .t'), e1 = p.querySelector('.ov .e');
      if (STATE === 'loading') {
        i1.textContent = '⋯'; t1.textContent = ovt.loading[0]; e1.textContent = ovt.loading[1];
        if (!p.querySelector('.skel')) {
          var s = '';
          for (var r = 0; r < 6; r++) s += '<i style="height:' + (r === 0 ? 26 : 14) + 'px"></i>';
          p.appendChild(el('<div class="skel">' + s + '</div>'));
        }
      } else if (STATE === 'nodata') {
        i1.textContent = '—'; t1.textContent = ovt.nodata[0]; e1.textContent = ovt.nodata[1];
      } else {
        i1.textContent = '!'; t1.textContent = ovt.offline[0]; e1.textContent = ovt.offline[1];
      }
    }

    if (STATE === 'ok') {
      banner.classList.remove('on');
      $('linkDot').className = 'dot';
      $('linkTxt').textContent = '数据链路正常';
      $('upd').textContent = '1s 刷新 · 8 平台 · 34 省级行政区';
    } else {
      banner.className = 'on ' + txt[STATE][2];
      banner.innerHTML = '<b>' + txt[STATE][1] + '</b><span>' + txt[STATE][0] + '</span>';
      $('linkDot').className = 'dot ' + (STATE === 'offline' ? 'bad' : 'idle');
      $('linkTxt').textContent = STATE === 'offline' ? '数据链路异常' : '数据链路待机';
      $('upd').textContent = STATE === 'offline'
        ? '重连中 · 8 平台 · 34 省级行政区' : '等待数据 · 8 平台 · 34 省级行政区';
    }

    var tag = $('modeTag');
    tag.className = MODE === 'live' ? 'live' : '';
    tag.textContent = STATE !== 'ok'
      ? 'Mode ' + MODE + ' / State ' + STATE
      : (MODE === 'live'
          ? '● Live · 1s 波动 + 告警流推送（前端演示数据源）'
          : '● 演示数据源 · 1s 波动（起始值固定）');
  }

  /* ============================ 时钟与实时循环 ============================ */
  function tickClock() {
    $('clock').textContent = hms(0);
    $('mhDate').textContent = cnDate();
  }

  /* 数据波动：两种模式都持续刷新（static 用固定种子起步，live 另叠加告警流推送）。
     状态不为 ok 时完全冻结 —— loading/nodata/offline 下数值必须静止。 */
  var tickN = 0;
  function dataTick() {
    if (STATE !== 'ok') return;
    tickN++;
    var i, k;

    /* 累计量单调增长：约 4200~6600 次/秒，与日播放量量级相符 */
    RT.plays += Math.round(4200 + rnd() * 2400);
    RT.inter += Math.round(420 + rnd() * 360);
    if (rnd() < 0.12) RT.dramas += 1;

    RT.ccu = Math.round(walk(RT.ccu, BASE.ccu, .014, .03));
    RT.complete = Math.min(72, Math.max(30, walk(RT.complete, BASE.complete, .006, .03)));
    for (i = 0; i < RT.kd.length; i++) {
      /* kd[2] 是"今日新增部数"，绝对量级大，单独收小波动幅度 */
      RT.kd[i] = walk(RT.kd[i], BASE.kd[i], i === 2 ? .012 : .05, .02);
    }

    /* 右端进新采样、左端掉旧采样 —— 已画出的线段不会再变，只整体左移一格 */
    RT.rate.push(Math.round(walk(RT.rate[RT.rate.length - 1], BASE.rate, .012, .05)));
    RT.rate.shift();

    for (i = 0; i < RT.health.length; i++) {
      RT.health[i] = Math.max(120, Math.round(walk(RT.health[i], BASE.health[i], .016, .03)));
      RT.hdt[i] = Math.max(-9, Math.min(29, walk(RT.hdt[i], BASE.hdt[i], .35, .04)));
    }
    for (i = 0; i < RT.top.length; i++) {
      RT.top[i] = Math.round(walk(RT.top[i], BASE.top[i], .012, .03));
      RT.topc[i] = Math.max(-9, Math.min(39, walk(RT.topc[i], BASE.topc[i], .06, .04)));
    }

    /* 来源构成：先游走再归一化，合计恒为 100% */
    var sum = 0;
    for (i = 0; i < RT.src.length; i++) {
      RT.src[i] = Math.max(0.3, walk(RT.src[i], BASE.src[i], .006, .05));
      sum += RT.src[i];
    }
    for (i = 0; i < RT.src.length; i++) RT.src[i] = RT.src[i] / sum * 100;

    for (k in RT.prov) RT.prov[k] = Math.max(.05, walk(RT.prov[k], BASE.prov[k], .012, .03));

    redrawAll();
    if (charts.trend) {
      var L = [], n = RT.rate.length;
      for (var m = 0; m < n; m++) L.push(hms(-(n - 1 - m)));
      /* 只推 x 轴与数据，动画补间已在 trendOption 里关掉 → 呈现为整体左移一格 */
      charts.trend.setOption({ xAxis: { data: L }, series: [{ data: RT.rate }] });
    }
    /* 地图整块重着色较重，降到 2s 一次，肉眼看仍是连续变化 */
    if (charts.map && tickN % 2 === 0) {
      charts.map.setOption(mapOption());
      if (charts.nanhai) charts.nanhai.setOption(nanhaiOption());
    }
  }

  var alertSeq = 0;
  function alertTick() {
    if (STATE !== 'ok') return;
    alertSeq++;
    var pool = ALERT_POOL[alertSeq % ALERT_POOL.length];
    /* 活跃数逼近上限时强制补一条「恢复」，让计数围绕 3~7 条振荡而非单调累加 */
    var lv = alertActive().length >= 7 ? 'r'
           : (alertSeq % 4 === 0 ? 'r' : (alertSeq % 3 === 0 ? 'w' : 'i'));
    var lg = { e: '异常', w: '预警', i: '提示', r: '恢复' }[lv];
    ALERTS.unshift({ lv: lv, lg: lg, ms: pool + ' · ' + PLAT[alertSeq % PLAT.length].nm, t: 0 });
    if (ALERTS.length > 12) ALERTS.pop();
    for (var i = 1; i < ALERTS.length; i++) ALERTS[i].t -= 9;
    drawAlerts(); drawKPI();
  }

  /* ============================ 自适应缩放（单屏不滚动） ============================ */
  function fit() {
    var s = Math.min(innerWidth / 1920, innerHeight / 1080);
    $('stage').style.transform = 'scale(' + s + ')';
  }

  /* ============================ 启动 ============================ */
  function boot() {
    buildMasthead();
    buildKPIBand();
    buildPanels();
    $('stage').appendChild(el('<div id="modeTag"></div>'));
    $('stage').appendChild(el('<div id="banner"></div>'));

    redrawAll();
    initCharts();
    applyState();
    tickClock();
    fit();

    addEventListener('resize', function () {
      fit();
      if (charts.trend) charts.trend.resize();
      if (charts.map) charts.map.resize();
      if (charts.nanhai) charts.nanhai.resize();
    });
    setInterval(tickClock, 1000);
    setInterval(dataTick, 1000);
    setInterval(alertTick, 9000);
  }

  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', boot);
  else boot();
})();
