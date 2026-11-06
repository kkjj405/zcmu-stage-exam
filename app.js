/* ================= 医考通 · 题库刷题 App =================
   结构对齐医考帮：我的课程 → 课程 → 题型(A1/A2/B1) → 模式(练习/快刷/测试/背题) → 答题 + 答题卡
   状态码：0 未做 / 1 正确 / 2 错误 / 3 已斩(掌握) / 4 待提交(测试中)
   ========================================================= */
(function () {
  'use strict';

  var MODES = [
    { k: 0, name: '练习', desc: '即时判对错' },
    { k: 1, name: '快刷', desc: '答对自动跳' },
    { k: 2, name: '测试', desc: '交卷后判分' },
    { k: 3, name: '背题', desc: '直接看答案' }
  ];
  var ST = { NONE: 0, RIGHT: 1, WRONG: 2, SKIP: 3, PENDING: 4 };
  var LETTER = 'ABCDE';
  var APP_VERSION = '1.1';          // 与 APK/manifest 保持一致
  var WEB_VERSION_KEY = 'webver';   // 记录本地 web 资源版本（热更新用）
  var QK = 'ykt-state-v1';

  /* 内联 SVG 图标（离线、清晰；不用 emoji 以免在不同设备上发虚） */
  function svg(paths) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + '</svg>';
  }
  var ICON = {
    book: svg('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>'),
    wrong: svg('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><path d="m9.6 7.4 4.8 4.8m0-4.8-4.8 4.8"/>'),
    stats: svg('<path d="M18 20V10M12 20V4M6 20v-6"/>'),
    me: svg('<circle cx="12" cy="8" r="3.4"/><path d="M5 20.2c0-3.4 3.2-5.6 7-5.6s7 2.2 7 5.6"/>'),
    bell: svg('<path d="M18 8.4A6 6 0 0 0 6 8.4c0 6.6-2.6 8.4-2.6 8.4h17.2S18 15 18 8.4"/><path d="M13.7 20.4a2 2 0 0 1-3.4 0"/>'),
    star: svg('<path d="m12 3.6 2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.6 9.7l5.8-.8L12 3.6z"/>'),
    pen: svg('<path d="M4 20h4l10-10a2.4 2.4 0 0 0-3.4-3.4L4.6 16.6 4 20z"/><path d="m13.5 7.5 3 3"/>'),
    check: svg('<path d="M20 6 9 17l-5-5"/>'),
    redo: svg('<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>'),
    grid: svg('<rect x="3.5" y="3.5" width="7" height="7" rx="1.4"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.4"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.4"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.4"/>'),
    trash: svg('<path d="M4 7h16"/><path d="M9.6 7V4.8h4.8V7"/><path d="M6.6 7l1 13h8.8l1-13"/><path d="M10.4 11v5M13.6 11v5"/>'),
    search: svg('<circle cx="11" cy="11" r="6.6"/><path d="m16 16 4.6 4.6"/>')
  };

  /* ---------------- 存储 ---------------- */
  function lsGet(k, dft) {
    try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : dft; }
    catch (e) { return dft; }
  }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) { } }
  function allKeys() {
    var out = [];
    for (var i = 0; i < localStorage.length; i++) out.push(localStorage.key(i));
    return out;
  }
  function recKey(b, c, t) { return 'rec:' + b + '/' + c + '/' + t; }
  function favKey(b, c, t) { return 'fav:' + b + '/' + c + '/' + t; }
  function lastKey(b, c, t) { return 'last:' + b + '/' + c + '/' + t; }
  function noteKey(b, c, t) { return 'note:' + b + '/' + c + '/' + t; }

  /* ---------------- 全局状态 ---------------- */
  var S = {
    view: 'banks',
    stack: [],
    bank: null, course: null, type: null, typeEntry: null,
    mode: 0, idx: 0, qs: [], rec: {}, fav: {}, notes: {},
    noteOpen: false, noteDraft: null,
    search: { q: '', scope: 'stem', bank: 'all', hits: [], busy: false, searched: false },
    filter: 'all',       // all | wrong | fav
    testing: false, t0: 0,
    wrongSeg: 'wrong'
  };

  /* ---------------- 工具 ---------------- */
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }
  var toastTimer = null;
  function toast(msg) {
    var t = $('toast'); t.textContent = msg; t.classList.add('on');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('on'); }, 1600);
  }
  function dialog(html) { $('dlg').innerHTML = '<div class="box">' + html + '</div>'; $('dlg').classList.add('on'); }
  function closeDlg() { $('dlg').classList.remove('on'); $('dlg').innerHTML = ''; }
  function todayKey() {
    var d = new Date();
    return 'day:' + d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }
  function pct(a, b) { return b ? Math.round(a / b * 100) : 0; }

  /* ---------------- 数据加载 ---------------- */
  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = res; s.onerror = function () { rej(new Error('资源加载失败: ' + src)); };
      document.head.appendChild(s);
    });
  }
  function ensureShard(te) {
    window.__Q = window.__Q || {};
    if (window.__Q[te.key]) return Promise.resolve(window.__Q[te.key]);
    return loadScript('data/' + te.f).then(function () { return window.__Q[te.key] || []; });
  }
  function bankById(id) {
    return (window.BANKS.banks || []).filter(function (b) { return b.id === id; })[0];
  }

  /* ---------------- 统计工具 ---------------- */
  function readAllRecords() {
    // 返回 { 'tcm/1/A1': {idx:{c,s}} , ...}
    var out = {};
    allKeys().forEach(function (k) {
      if (k.indexOf('rec:') !== 0) return;
      var key = k.slice(4);
      var v = lsGet(k, null);
      if (v) out[key] = v;
    });
    return out;
  }
  function typeStats(key) {
    var rec = lsGet('rec:' + key, {}) || {};
    var s = { total: 0, done: 0, right: 0, wrong: 0, skip: 0, pending: 0 };
    for (var i in rec) {
      var st = rec[i].s;
      s.total++;
      if (st === ST.RIGHT) { s.right++; s.done++; }
      else if (st === ST.WRONG) { s.wrong++; s.done++; }
      else if (st === ST.SKIP) { s.skip++; }
      else if (st === ST.PENDING) { s.pending++; }
    }
    return s;
  }
  function courseStats(bank, course) {
    var out = { n: 0, done: 0, right: 0, wrong: 0 };
    course.types.forEach(function (te) {
      var n = te.n;
      var st = typeStats(bank.id + '/' + course.no + '/' + te.t);
      out.n += n; out.done += st.done; out.right += st.right; out.wrong += st.wrong;
    });
    return out;
  }
  function bankStats(bank) {
    var out = { n: 0, done: 0, right: 0, wrong: 0, types: 0, doneTypes: 0 };
    bank.courses.forEach(function (c) {
      var cs = courseStats(bank, c);
      out.n += cs.n; out.done += cs.done; out.right += cs.right; out.wrong += cs.wrong;
      c.types.forEach(function (te) {
        out.types++;
        var st = typeStats(bank.id + '/' + c.no + '/' + te.t);
        if (st.done >= te.n) out.doneTypes++;
      });
    });
    return out;
  }

  /* ---------------- 路由 ---------------- */
  function go(view, patch) {
    if (view !== S.view) S.stack.push({ view: S.view });
    S.view = view;
    if (patch) for (var k in patch) S[k] = patch[k];
    render();
  }
  function back() {
    var prev = S.stack.pop();
    if (!prev) return false;
    S.view = prev.view;
    render();
    return true;
  }
  function goRoot() { S.stack = []; go('banks'); }

  /* ---------------- 顶栏 / 底栏 ---------------- */
  function renderHeader() {
    var hd = $('hd');
    var canBack = S.stack.length > 0;
    var title = '', sub = '', acts = '';
    if (S.view === 'banks') { title = '我的课程'; sub = '选择题库开始刷题'; }
    else if (S.view === 'courses') { title = S.bank.name; sub = '选择课程'; }
    else if (S.view === 'types') { title = S.course.name; sub = S.bank.name; }
    else if (S.view === 'quiz') {
      title = S.course.name + ' · ' + S.type;
      sub = MODES[S.mode].name + '模式' + (S.filter === 'wrong' ? ' · 错题' : S.filter === 'fav' ? ' · 收藏' : S.filter === 'note' ? ' · 笔记' : '');
      acts = '<button class="chip" id="btnGrid">答题卡</button>';
    }
    else if (S.view === 'grid') {
      var _fl = filterLabel();
      title = _fl || '答题卡';
      sub = S.course.name + ' · ' + S.type + ' · 共 ' +
        ((_fl ? filteredIdx().length : (S.qs ? S.qs.length : 0))) + ' 题';
    }
    else if (S.view === 'search') { title = '搜索题目'; sub = '按题干或选项检索 · 可选题库'; }
    else if (S.view === 'wrong') { title = '错题本'; sub = '错题与收藏'; }
    else if (S.view === 'stats') { title = '学习统计'; sub = '进度与正确率'; }
    else if (S.view === 'me') { title = '我的'; sub = ''; }

    hd.innerHTML =
      (canBack ? '<button class="back" id="btnBack">‹</button>' : '<span style="width:34px"></span>') +
      '<div class="ttl"><h1>' + esc(title) + '</h1>' + (sub ? '<div class="sub">' + esc(sub) + '</div>' : '') + '</div>' +
      '<div class="act">' + acts + '</div>';
    if (canBack) $('btnBack').onclick = function () { back(); };
    if ($('btnGrid')) $('btnGrid').onclick = function () { go('grid'); };
  }

  function renderTabbar() {
    var show = (S.view === 'banks' || S.view === 'wrong' || S.view === 'stats' || S.view === 'me');
    $('app').classList.toggle('nobar', !show);
    if (!show) { $('tabbar').innerHTML = ''; return; }
    var items = [
      { v: 'banks', ic: ICON.book, t: '课程' },
      { v: 'wrong', ic: ICON.wrong, t: '错题' },
      { v: 'stats', ic: ICON.stats, t: '统计' },
      { v: 'me', ic: ICON.me, t: '我的' }
    ];
    $('tabbar').innerHTML = items.map(function (it) {
      return '<button class="tb' + (S.view === it.v ? ' on' : '') + '" data-v="' + it.v + '">' +
        '<span class="ic">' + it.ic + '</span>' + it.t + '</button>';
    }).join('');
    Array.prototype.forEach.call($('tabbar').querySelectorAll('.tb'), function (b) {
      b.onclick = function () { S.stack = []; S.view = b.dataset.v; render(); };
    });
  }

  /* ---------------- 视图：题库列表 ---------------- */
  /* 首页公告：内嵌卡片（刻意不用弹窗，避免打断操作） */
  var ANNOUNCE = '作者柯基的一些说明：本题库的内容（包括题干，选项，答案）都是与学校题库一致的。' +
    '制作不易，如有不好的地方，还请多多谅解。祝大家考试顺利。';

  function noticeCard() {
    return '<div class="notice">' +
      '<div class="nt">' + ICON.bell + '公告</div>' +
      '<div class="nb">' + esc(ANNOUNCE) + '</div>' +
      '</div>';
  }

  function viewBanks() {
    var banks = window.BANKS.banks || [];
    var html = noticeCard() +
      '<div class="search-entry" id="goSearch">' + ICON.search +
      '<span>搜索题目（按题干 / 按选项）</span><em>›</em></div>' +
      '<div class="h2">选择题库</div>';
    banks.forEach(function (b) {
      var st = bankStats(b);
      var p = pct(st.done, st.n);
      html +=
        '<div class="card bank press" data-bank="' + b.id + '">' +
        '<div class="row"><div class="grow"><div class="title">' + esc(b.name) + '</div>' +
        '<div class="desc">' + b.courses.length + ' 门课程 · ' + st.types + ' 个题型 · ' + st.n + ' 题</div></div>' +
        '<div class="chev">›</div></div>' +
        '<div class="nums"><span>已做 <b>' + st.done + '</b></span>' +
        '<span>正确率 <b>' + pct(st.right, st.right + st.wrong) + '%</b></span>' +
        '<span>进度 <b>' + p + '%</b></span></div>' +
        '<div class="pb"><i style="width:' + p + '%"></i></div>' +
        '</div>';
    });
    html += '<div class="muted" style="text-align:center;margin:18px 0 4px">' +
      '共 ' + (window.BANKS.total || 0) + ' 道题 · 完全离线可用</div>';
    return html;
  }

  /* ---------------- 视图：课程列表 ---------------- */
  function viewCourses() {
    var b = S.bank;
    var html = '<div class="h2">' + b.courses.length + ' 门课程</div>';
    b.courses.forEach(function (c) {
      var st = courseStats(b, c);
      var p = pct(st.done, st.n);
      html +=
        '<div class="card press" data-course="' + c.no + '">' +
        '<div class="row"><div class="grow"><div style="font-weight:600">' + c.no + '. ' + esc(c.name) + '</div>' +
        '<div class="muted">' + c.types.map(function (t) { return t.t + ' ' + t.n; }).join(' · ') + '</div></div>' +
        '<div class="chev">›</div></div>' +
        '<div class="pb thin"><i style="width:' + p + '%"></i></div>' +
        '<div class="muted" style="margin-top:6px">已做 ' + st.done + '/' + st.n + ' · 正确率 ' +
        pct(st.right, st.right + st.wrong) + '% · 进度 ' + p + '%</div>' +
        '</div>';
    });
    return html;
  }

  /* ---------------- 视图：题型 + 模式 ---------------- */
  function viewTypes() {
    var b = S.bank, c = S.course;
    var html = '<div class="h2">题型</div><div class="card">';
    c.types.forEach(function (te) {
      var st = typeStats(b.id + '/' + c.no + '/' + te.t);
      var p = pct(st.done, te.n);
      html +=
        '<div class="trow" data-type="' + te.t + '">' +
        '<span class="tag ' + te.t + '">' + te.t + '</span>' +
        '<div class="grow"><div class="tname">' + te.t + '型题</div>' +
        '<div class="tsub">' + te.n + ' 题 · 已做 ' + st.done + ' · 正确率 ' + pct(st.right, st.right + st.wrong) + '%</div>' +
        '<div class="pb thin"><i style="width:' + p + '%"></i></div></div>' +
        '<div class="tn">' + p + '%<br><span style="font-size:16px;color:#c8ced8">›</span></div>' +
        '</div>';
    });
    html += '</div>';
    html += '<div class="h2">练习模式</div><div class="card"><div class="modes" id="modes">' +
      MODES.map(function (m) {
        return '<button class="mode' + (S.mode === m.k ? ' on' : '') + '" data-mode="' + m.k + '">' +
          '<b>' + m.name + '</b><span>' + m.desc + '</span></button>';
      }).join('') + '</div></div>';
    html += '<div class="hint">' + ICON.pen.replace('<svg', '<svg class="hint-ic"') +
      '点击题型即可开始练习（上方可选练习 / 快刷 / 测试 / 背题模式）</div>';
    return html;
  }

  /* ---------------- 进入答题 ---------------- */
  function startQuiz(te, filter, jumpTo) {
    S.type = te.t; S.typeEntry = te;
    S.filter = filter || 'all';
    var key = S.bank.id + '/' + S.course.no + '/' + S.type;
    ensureShard(te).then(function (qs) {
      S.qs = qs;
      S.rec = lsGet(recKey(S.bank.id, S.course.no, S.type), {}) || {};
      S.fav = lsGet(favKey(S.bank.id, S.course.no, S.type), {}) || {};
      S.notes = lsGet(noteKey(S.bank.id, S.course.no, S.type), {}) || {};
      S.noteOpen = false; S.noteDraft = null;
      // 过滤（错题 / 收藏）
      S.idx = (jumpTo == null)
        ? (lsGet(lastKey(S.bank.id, S.course.no, S.type), 0) || 0)
        : jumpTo;
      if (S.mode === 2) { S.testing = true; S.t0 = Date.now(); }
      else S.testing = false;
      go('quiz');
      // 位置保护：过滤模式下寻找第一个可用下标
      if (S.filter !== 'all' && jumpTo == null) {
        var list = filteredIdx();
        if (list.length && list.indexOf(S.idx) < 0) S.idx = list[0];
      }
    }).catch(function (e) { toast(e.message); });
  }

  function filteredIdx() {
    var out = [];
    for (var i = 0; i < S.qs.length; i++) {
      var r = S.rec[i];
      if (S.filter === 'wrong') { if (r && r.s === ST.WRONG) out.push(i); }
      else if (S.filter === 'fav') { if (S.fav[i]) out.push(i); }
      else if (S.filter === 'note') { if (S.notes[i]) out.push(i); }
      else out.push(i);
    }
    return out;
  }
  function step(d) {
    if (S.noteOpen) { commitDraft(); S.noteOpen = false; }
    var list = filteredIdx();
    if (!list.length) return;
    var pos = list.indexOf(S.idx);
    if (pos < 0) pos = 0;
    var np = pos + d;
    if (np < 0) { toast('已经是第一题'); return; }
    if (np >= list.length) {
      if (S.mode === 2) { confirmSubmit(); return; }
      toast('已经是最后一题了'); return;
    }
    S.idx = list[np];
    lsSet(lastKey(S.bank.id, S.course.no, S.type), S.idx);
    render();
  }

  /* ---------------- 视图：答题页 ---------------- */
  function viewQuiz() {
    if (!S.qs.length) return '<div class="empty">加载中…</div>';
    if (S.filter !== 'all' && filteredIdx().length === 0) {
      var nm = S.filter === 'wrong' ? '错题' : S.filter === 'fav' ? '收藏' : '笔记';
      return '<div class="gridwrap"><div class="empty">这个' + nm + '集合里已经没有题目了<br><br>' +
        '<button class="btn ghost sm" id="bEmptyBack">返回</button></div></div>';
    }
    var q = S.qs[S.idx];
    if (!q) return '<div class="empty">题目不存在</div>';
    var r = S.rec[S.idx] || null;
    var revealed = (S.mode === 0 || S.mode === 1) ? !!(r && (r.s === ST.RIGHT || r.s === ST.WRONG)) : (S.mode === 3);
    var list = filteredIdx();
    var pos = Math.max(0, list.indexOf(S.idx));
    var total = list.length;

    var html = '';
    if (S.mode === 2) {
      var answered = 0;
      for (var i in S.rec) { if (S.rec[i].s === ST.PENDING || S.rec[i].s === ST.RIGHT || S.rec[i].s === ST.WRONG) answered++; }
      html += '<div class="testbar"><span>测试中 · 已答 <b>' + answered + '</b>/' + total + '</span>' +
        '<span style="flex:1"></span><button class="btn sm" id="btnSubmit">交卷</button></div>';
    }
    html += '<div class="qstat">' + ICON.redo + '<span>' + esc(statText(S.idx)) + '</span>' +
      (S.notes[S.idx] ? '<span class="ntag">' + ICON.pen + '有笔记</span>' : '') + '</div>';
    html += '<div class="qhead"><span class="idx">第 <b>' + (S.idx + 1) + '</b> / ' + S.qs.length + ' 题</span>' +
      '<span>' + S.type + '型题 · ' + MODES[S.mode].name + (S.filter === 'wrong' ? ' · 错题' : S.filter === 'fav' ? ' · 收藏' : S.filter === 'note' ? ' · 笔记' : '') +
      '</span></div>';
    html += '<div class="pb thin" style="margin:-2px 0 10px"><i style="width:' +
      pct(pos + 1, total) + '%"></i></div>';
    html += '<div class="qbody"><div class="qstem">' + esc(q.q) + '</div><div class="opts">';
    for (var k = 0; k < q.o.length; k++) {
      var cls = 'opt';
      var showAns = revealed;
      if (S.mode === 3) {
        if (k === q.a) cls += ' right';
      } else if (revealed && r) {
        if (k === q.a) cls += ' right';
        else if (r.c === k && r.s === ST.WRONG) cls += ' wrong';
        else cls += ' dim';
      } else if (r && r.c === k) {
        cls += ' sel';
      }
      html += '<button class="' + cls + '" data-opt="' + k + '">' +
        '<span class="k">' + LETTER[k] + '</span><span class="v">' + esc(q.o[k]) + '</span></button>';
    }
    html += '</div>';
    if (revealed) {
      html += '<div class="explain"><div class="h">答案解析</div>' +
        '<div class="ans">正确答案：' + LETTER[q.a] + '. ' + esc(q.o[q.a]) + '</div>' +
        (r && r.s === ST.WRONG ? '<div class="meta" style="color:' + '#e5484d' + '">你的答案：' + LETTER[r.c] + '. ' + esc(q.o[r.c]) + '</div>' : '') +
        '<div class="meta">' + esc(S.course.name) + ' · ' + S.type + '型题 · 题库内第 ' + (S.idx + 1) + ' 题</div>' +
        '</div>';
    }
    html += '</div>';

    // 笔记：已作答后，题目下方就地展开编辑区 / 显示已有笔记
    if (isAnswered(S.idx)) {
      html += (S.noteOpen ? noteEditorHTML() : (S.notes[S.idx] ? notePreviewHTML() : ''));
    }

    // 工具条：收藏 / 笔记 / 已掌握 / 重做 —— 只有答完这道题才出现
    if (isAnswered(S.idx)) {
      var favOn = S.fav[S.idx] ? ' on' : '';
      var noteOn = S.notes[S.idx] ? ' on' : '';
      var skipOn = (r && r.s === ST.SKIP) ? ' on' : '';
      html += '<div class="qtools">' +
        '<button class="tool' + favOn + '" id="bFav">' + ICON.star + '<span>收藏</span></button>' +
        '<button class="tool' + noteOn + '" id="bNote">' + ICON.pen + '<span>笔记</span></button>' +
        '<button class="tool' + skipOn + '" id="bSkip">' + ICON.check + '<span>已掌握</span></button>' +
        (S.filter === 'wrong'
          ? '<button class="tool" id="bRemove">' + ICON.trash + '<span>去掉该题</span></button>'
          : '<button class="tool" id="bRedo">' + ICON.redo + '<span>重做</span></button>') +
        '</div>';
    }
    // 底部导航
    html += '<div class="qfoot">' +
      '<button class="fb" id="bPrev">上一题</button>' +
      '<button class="fb" id="bGrid">' + ICON.grid + '答题卡</button>' +
      '<button class="fb primary" id="bNext">下一题</button>' +
      '</div>';
    return html;
  }

  function bindQuiz() {
    var q = S.qs[S.idx];
    if (!q) return;
    var opts = $('main').querySelectorAll('.opt');
    Array.prototype.forEach.call(opts, function (b) {
      b.onclick = function () { choose(parseInt(b.dataset.opt, 10)); };
    });
    if ($('bPrev')) $('bPrev').onclick = function () { step(-1); };
    if ($('bNext')) $('bNext').onclick = function () { step(1); };
    if ($('bFav')) $('bFav').onclick = function () {
      S.fav[S.idx] = !S.fav[S.idx];
      if (!S.fav[S.idx]) delete S.fav[S.idx];
      persist(); render(); toast(S.fav[S.idx] ? '已收藏' : '已取消收藏');
    };
    if ($('bNote')) $('bNote').onclick = openNote;
    if ($('bSkip')) $('bSkip').onclick = function () {
      var r = recOf(S.idx) || { n: 0, r: 0, w: 0 };
      if (r.s === ST.SKIP) S.rec[S.idx] = { c: -1, s: ST.NONE, n: r.n, r: r.r, w: r.w };
      else S.rec[S.idx] = { c: (r.c == null ? -1 : r.c), s: ST.SKIP, n: r.n, r: r.r, w: r.w };
      persist(); render();
    };
    if ($('bRedo')) $('bRedo').onclick = redoQuestion;
    if ($('bRemove')) $('bRemove').onclick = removeWrongQuestion;
    if ($('bGrid')) $('bGrid').onclick = function () { go('grid'); };
    if ($('noteTa')) {
      var ta = $('noteTa');
      ta.oninput = function () { S.noteDraft = ta.value; };
      ta.focus();
      try { ta.selectionStart = ta.selectionEnd = ta.value.length; } catch (e) { }
    }
    if ($('ntSave')) $('ntSave').onclick = function () {
      S.noteDraft = $('noteTa').value;
      commitDraft();
      S.noteOpen = false;
      render();
      toast(S.notes[S.idx] ? '笔记已保存' : '笔记已清空');
    };
    if ($('ntDel')) $('ntDel').onclick = function () {
      delete S.notes[S.idx];
      S.noteDraft = null; S.noteOpen = false;
      persist(); render(); toast('笔记已删除');
    };
    if ($('notePrev')) $('notePrev').onclick = openNote;
    if ($('btnSubmit')) $('btnSubmit').onclick = confirmSubmit;
    if ($('bEmptyBack')) $('bEmptyBack').onclick = function () { back(); };
  }

  function persist() {
    lsSet(recKey(S.bank.id, S.course.no, S.type), S.rec);
    lsSet(favKey(S.bank.id, S.course.no, S.type), S.fav);
    lsSet(noteKey(S.bank.id, S.course.no, S.type), S.notes);
  }

  /* 兼容旧记录：补齐作答次数 n / 答对 r / 答错 w */
  function recOf(i) {
    var r = S.rec[i];
    if (!r) return null;
    if (r.n == null) {
      r.n = (r.s === ST.RIGHT || r.s === ST.WRONG) ? 1 : 0;
      r.r = (r.s === ST.RIGHT) ? 1 : 0;
      r.w = (r.s === ST.WRONG) ? 1 : 0;
    }
    return r;
  }
  function newRec(k, ok, prev) {
    prev = prev || {};
    return {
      c: k, s: ok ? ST.RIGHT : ST.WRONG,
      n: (prev.n || 0) + 1,
      r: (prev.r || 0) + (ok ? 1 : 0),
      w: (prev.w || 0) + (ok ? 0 : 1)
    };
  }
  function statText(i) {
    var r = recOf(i);
    if (!r || !r.n) return '本题还未作答';
    return '已做 ' + r.n + ' 次 · 答对 ' + (r.r || 0) + ' 次 · 答错 ' + (r.w || 0) + ' 次';
  }
  /* 是否“已答完这道题”：练习/快刷答过、测试选过、或标记过已掌握；
     背题模式直接给出答案，视为已答完。未答完时四个工具按钮不出现。 */
  function isAnswered(i) {
    if (S.mode === 3) return true;
    var r = S.rec[i];
    return !!(r && (r.s === ST.RIGHT || r.s === ST.WRONG || r.s === ST.PENDING || r.s === ST.SKIP));
  }
  function filterLabel() {
    return S.filter === 'wrong' ? '错题答题卡'
      : S.filter === 'fav' ? '收藏答题卡'
        : S.filter === 'note' ? '笔记答题卡' : '';
  }

  function choose(k) {
    var q = S.qs[S.idx];
    if (!q) return;
    if (S.mode === 3) { toast('背题模式：已直接显示答案'); return; }
    if (S.mode === 2) {                                  // 测试：只记录待提交
      if (S.testing === false) { toast('本卷已交卷'); return; }
      var pp = S.rec[S.idx] || {};
      S.rec[S.idx] = { c: k, s: ST.PENDING, n: pp.n || 0, r: pp.r || 0, w: pp.w || 0 };
      persist(); render(); return;
    }
    var r = S.rec[S.idx];
    if (r && (r.s === ST.RIGHT || r.s === ST.WRONG)) { toast('本题已作答'); return; }
    var ok = (k === q.a);
    S.rec[S.idx] = newRec(k, ok, S.rec[S.idx] || {});
    persist();
    var day = todayKey();
    lsSet(day, (lsGet(day, 0) || 0) + 1);
    render();
    if (S.mode === 1 && ok) {                            // 快刷：答对自动跳
      setTimeout(function () { step(1); }, 420);
    }
  }

  /* 重做：清空本题当前作答状态（答题卡回到未做），但保留历史作答统计 */
  function redoQuestion() {
    var r = recOf(S.idx);
    var info = r && r.n
      ? ('本题历史：已做 ' + r.n + ' 次 · 答对 ' + (r.r || 0) + ' 次 · 答错 ' + (r.w || 0) + ' 次')
      : '本题还没有作答记录';
    dialog('<h3>重做本题</h3>' +
      '<p>将清除这道题当前的作答状态（答题卡回到"未做"），可以重新作答。\n' +
      '<b>历史作答次数与对错统计会保留。</b>\n\n' + info + '</p>' +
      '<div class="acts"><button class="btn ghost" id="rdNo">取消</button>' +
      '<button class="btn" id="rdYes">重做</button></div>');
    $('rdNo').onclick = closeDlg;
    $('rdYes').onclick = function () {
      var cur = S.rec[S.idx] || { n: 0, r: 0, w: 0 };
      S.rec[S.idx] = { c: -1, s: ST.NONE, n: cur.n || 0, r: cur.r || 0, w: cur.w || 0 };
      persist(); closeDlg(); render();
      toast('已清空作答状态，可重新作答（历史统计保留）');
    };
  }

  /* 批量重做：把当前答题卡范围内的作答状态全部清空（历史统计保留） */
  function batchRedo() {
    var list = filteredIdx();
    if (!list.length) { toast('当前答题卡没有题目'); return; }
    var touched = 0;
    list.forEach(function (i) { if (S.rec[i]) touched++; });
    var scope = filterLabel() || '全部题目';
    dialog('<h3>批量重做</h3>' +
      '<p>范围：<b>' + esc(scope) + '</b>（共 ' + list.length + ' 题，其中 ' + touched + ' 题有作答记录）</p>' +
      '<p>将把这些题的作答状态清空 —— 答题卡回到「未做」，可以重新作答。<br>' +
      '<b>历史作答次数与对错统计会保留。</b></p>' +
      '<div class="acts"><button class="btn ghost" id="brNo">取消</button>' +
      '<button class="btn" id="brYes">确定重做</button></div>');
    $('brNo').onclick = closeDlg;
    $('brYes').onclick = function () {
      var n = 0;
      list.forEach(function (i) {
        var cur = S.rec[i];
        if (!cur) return;                       // 没作答过的题不用动
        S.rec[i] = { c: -1, s: ST.NONE, n: cur.n || 0, r: cur.r || 0, w: cur.w || 0 };
        n++;
      });
      persist(); closeDlg(); render();
      toast(n ? ('已批量重做 ' + n + ' 道题（历史统计保留）') : '这些题还没有作答记录');
    };
  }

  /* 错题本专用：把本题从错题本移除（历史统计保留，答题卡回到未做） */
  function removeWrongQuestion() {
    var r = recOf(S.idx);
    var info = r && r.n
      ? ('本题历史：已做 ' + r.n + ' 次 · 答对 ' + (r.r || 0) + ' 次 · 答错 ' + (r.w || 0) + ' 次')
      : '';
    dialog('<h3>去掉该题</h3>' +
      '<p>把这题从错题本移除？\n移除后它不再出现在错题本里，答题卡上回到"未做"。\n' +
      '<b>历史作答统计会保留。</b>\n\n' + info + '</p>' +
      '<div class="acts"><button class="btn ghost" id="rmNo">取消</button>' +
      '<button class="btn" id="rmYes">去掉</button></div>');
    $('rmNo').onclick = closeDlg;
    $('rmYes').onclick = function () {
      var before = filteredIdx();
      var pos = Math.max(0, before.indexOf(S.idx));
      var cur = S.rec[S.idx] || { n: 0, r: 0, w: 0 };
      S.rec[S.idx] = { c: -1, s: ST.NONE, n: cur.n || 0, r: cur.r || 0, w: cur.w || 0 };
      persist(); closeDlg();
      var after = filteredIdx();
      if (after.length) S.idx = after[Math.min(pos, after.length - 1)];
      render();
      toast('已从错题本移除（历史统计保留）');
    };
  }

  /* 笔记：在题目下方内嵌展开编辑区（不是弹窗） */
  function openNote() {
    if (S.noteOpen) {                     // 再点一次收起（先保存草稿）
      commitDraft(); S.noteOpen = false; render(); return;
    }
    S.noteOpen = true;
    S.noteDraft = S.notes[S.idx] || '';
    render();
  }
  function commitDraft() {
    if (!S.noteOpen) return;
    var v = (S.noteDraft == null ? '' : String(S.noteDraft)).trim();
    if (v) S.notes[S.idx] = v; else delete S.notes[S.idx];
    S.noteDraft = null;
    persist();
  }
  function noteEditorHTML() {
    var val = (S.noteDraft != null) ? S.noteDraft : (S.notes[S.idx] || '');
    return '<div class="note-inline">' +
      '<div class="nh">' + ICON.pen + '<span>本题笔记</span>' +
      '<em>只保存在本机</em></div>' +
      '<textarea id="noteTa" maxlength="2000" placeholder="写下这道题的记忆点 / 易错点…">' + esc(val) + '</textarea>' +
      '<div class="nacts">' +
      '<button class="btn ghost sm" id="ntDel">删除</button>' +
      '<button class="btn sm" id="ntSave">保存笔记</button>' +
      '</div></div>';
  }
  function notePreviewHTML() {
    return '<div class="note-prev" id="notePrev">' + ICON.pen +
      '<span>' + esc(S.notes[S.idx]) + '</span></div>';
  }

  function confirmSubmit() {
    var answered = 0, right = 0, wrong = 0, blank = 0;
    S.qs.forEach(function (q, i) {
      var r = S.rec[i];
      if (!r || r.s === ST.NONE || r.s === ST.SKIP) { blank++; return; }
      if (r.s === ST.PENDING) {
        var okS = (r.c === q.a);
        r.s = okS ? ST.RIGHT : ST.WRONG;
        r.n = (r.n || 0) + 1;
        r.r = (r.r || 0) + (okS ? 1 : 0);
        r.w = (r.w || 0) + (okS ? 0 : 1);
      }
      if (r.s === ST.RIGHT) right++;
      else if (r.s === ST.WRONG) wrong++;
      answered++;
    });
    S.testing = false;
    persist();
    var used = Math.round((Date.now() - S.t0) / 1000);
    var mm = Math.floor(used / 60), ss = used % 60;
    dialog('<h3>交卷完成</h3>' +
      '<p>已答 ' + answered + ' / ' + S.qs.length + ' 题\n正确 ' + right + ' · 错误 ' + wrong + ' · 未答 ' + blank +
      '\n正确率 ' + pct(right, answered) + '%\n用时 ' + mm + ' 分 ' + ss + ' 秒</p>' +
      '<div class="acts"><button class="btn ghost" id="dClose">关闭</button>' +
      '<button class="btn" id="dWrong">看错题</button></div>');
    $('dClose').onclick = function () { closeDlg(); render(); };
    $('dWrong').onclick = function () { closeDlg(); S.filter = 'wrong'; S.mode = 0; S.idx = firstWrong(); render(); };
  }
  function firstWrong() {
    for (var i = 0; i < S.qs.length; i++) {
      var r = S.rec[i];
      if (r && r.s === ST.WRONG) return i;
    }
    return 0;
  }

  /* ---------------- 视图：答题卡 ---------------- */
  function viewGrid() {
    /* 过滤模式（错题/收藏/笔记）下，答题卡只展示该集合的题 —— 即“独立的答题卡” */
    var list = filteredIdx();
    var scope = filterLabel() || '全部题目';
    var topbar = '<div class="gbar">' +
      '<button class="btn ghost sm gbar-btn" id="gBatchRedo">批量重做</button>' +
      '<button class="btn sm gbar-btn" id="gStart">开始答题</button>' +
      '</div>';
    var st = { done: 0, right: 0, wrong: 0, skip: 0, pending: 0 };
    var cells = '';
    for (var n = 0; n < list.length; n++) {
      var i = list[n];
      var r = S.rec[i] || null;
      var s = r ? r.s : 0;
      if (s === ST.RIGHT) st.right++;
      else if (s === ST.WRONG) st.wrong++;
      else if (s === ST.SKIP) st.skip++;
      else if (s === ST.PENDING) st.pending++;
      if (s === ST.RIGHT || s === ST.WRONG) st.done++;
      var cls = 'gcell' + (s ? ' s' + s : '') + (S.notes[i] ? ' hasnote' : '') + (i === S.idx ? ' cur' : '');
      cells += '<button class="' + cls + '" data-i="' + i + '">' + (n + 1) + '</button>';
    }
    var fl = filterLabel();
    if (!list.length) {
      return topbar + '<div class="gridwrap">' + (fl ? '<div class="ghead">' + esc(fl) + '</div>' : '') +
        '<div class="empty">这个集合里还没有题目</div></div>';
    }
    return topbar + '<div class="gridwrap">' +
      (fl ? '<div class="ghead">' + esc(fl) + ' · 共 ' + list.length + ' 题</div>' : '') +
      '<div class="gstats">' +
      '<div class="gstat"><b>' + st.done + '</b><span>已做</span></div>' +
      '<div class="gstat"><b style="color:#07a35a">' + st.right + '</b><span>正确</span></div>' +
      '<div class="gstat"><b style="color:#e5484d">' + st.wrong + '</b><span>错误</span></div>' +
      '<div class="gstat"><b>' + pct(st.right, st.right + st.wrong) + '%</b><span>正确率</span></div>' +
      '</div>' +
      '<div class="grid">' + cells + '</div>' +
      '<div class="legend">' +
      '<span><i style="background:#fff;border-color:#cfd6df"></i>未做</span>' +
      '<span><i style="background:#07a35a;border-color:#07a35a"></i>正确</span>' +
      '<span><i style="background:#e5484d;border-color:#e5484d"></i>错误</span>' +
      '<span><i style="background:#d98b00;border-color:#d98b00"></i>已掌握</span>' +
      '<span><i style="background:#2f6fed;border-color:#2f6fed"></i>待提交</span>' +
      '<span><i style="background:#fff;outline:2px solid #2f6fed"></i>当前题</span>' +
      '<span><i style="background:#fff;border-color:#cfd6df"></i>右上角小蓝点 = 有笔记</span>' +
      '</div></div>';
  }
  function bindGrid() {
    if ($('gBatchRedo')) $('gBatchRedo').onclick = batchRedo;
    if ($('gStart')) $('gStart').onclick = function () {
      var list = filteredIdx();
      if (!list.length) { toast('这个集合里还没有题目'); return; }
      if (list.indexOf(S.idx) < 0) S.idx = list[0];
      S.noteOpen = false; S.noteDraft = null;
      /* 从答题卡进入题目时，要像 startQuiz 一样初始化“测试模式”状态，
         否则测试模式下点选项会被当成“已交卷”而拒绝作答 */
      if (S.mode === 2) { S.testing = true; S.t0 = Date.now(); } else { S.testing = false; }
      S.stack.pop();                 // 用答题页替换答题卡（返回时回到题型页）
      S.view = 'quiz';
      render();
    };
    Array.prototype.forEach.call($('main').querySelectorAll('.gcell'), function (b) {
      b.onclick = function () {
        if (S.noteOpen) { commitDraft(); S.noteOpen = false; }
        S.idx = parseInt(b.dataset.i, 10);
        lsSet(lastKey(S.bank.id, S.course.no, S.type), S.idx);
        S.stack.pop();            // 回到 quiz（替换 grid）
        S.view = 'quiz';
        render();
      };
    });
  }

  /* ---------------- 视图：错题本 ---------------- */
  function viewWrong() {
    var banks = window.BANKS.banks || [];
    var html = '<div class="seg">' +
      '<button data-seg="wrong" class="' + (S.wrongSeg === 'wrong' ? 'on' : '') + '">错题本</button>' +
      '<button data-seg="fav" class="' + (S.wrongSeg === 'fav' ? 'on' : '') + '">我的收藏</button>' +
      '<button data-seg="note" class="' + (S.wrongSeg === 'note' ? 'on' : '') + '">我的笔记</button>' +
      '</div>';
    var any = false;
    banks.forEach(function (b) {
      var rows = '';
      b.courses.forEach(function (c) {
        c.types.forEach(function (te) {
          var key = b.id + '/' + c.no + '/' + te.t;
          var rec = lsGet('rec:' + key, {}) || {};
          var fav = lsGet('fav:' + key, {}) || {};
          var notes = lsGet('note:' + key, {}) || {};
          var cnt = 0;
          if (S.wrongSeg === 'wrong') {
            for (var i in rec) if (rec[i].s === ST.WRONG) cnt++;
          } else if (S.wrongSeg === 'note') {
            cnt = Object.keys(notes).filter(function (k) { return (notes[k] || '').trim(); }).length;
          } else {
            cnt = Object.keys(fav).filter(function (k) { return fav[k]; }).length;
          }
          if (cnt > 0) {
            rows += '<div class="trow" data-wb="' + b.id + '" data-wc="' + c.no + '" data-wt="' + te.t + '">' +
              '<span class="tag ' + te.t + '">' + te.t + '</span>' +
              '<div class="grow"><div class="tname">' + esc(c.name) + '</div>' +
              '<div class="tsub">' + esc(b.name) + ' · ' + te.t + '型题</div></div>' +
              '<div class="tn">' + cnt + ' 题 <span style="font-size:16px;color:#c8ced8">›</span></div></div>';
            any = true;
          }
        });
      });
      if (rows) html += '<div class="h2">' + esc(b.name) + '</div><div class="card">' + rows + '</div>';
    });
    if (!any) html += '<div class="empty">还没有' +
      (S.wrongSeg === 'wrong' ? '错题' : (S.wrongSeg === 'note' ? '笔记' : '收藏')) + '，去刷几题吧～</div>';
    return html;
  }
  function bindWrong() {
    Array.prototype.forEach.call($('main').querySelectorAll('[data-seg]'), function (b) {
      b.onclick = function () { S.wrongSeg = b.dataset.seg; render(); };
    });
    Array.prototype.forEach.call($('main').querySelectorAll('[data-wb]'), function (b) {
      b.onclick = function () {
        var bank = bankById(b.dataset.wb);
        var course = bank.courses.filter(function (c) { return String(c.no) === b.dataset.wc; })[0];
        var te = course.types.filter(function (t) { return t.t === b.dataset.wt; })[0];
        S.bank = bank; S.course = course; S.typeEntry = te; S.type = te.t;
        S.mode = 0;
        S.stack = [{ view: 'wrong' }];
        startQuiz(te, S.wrongSeg === 'wrong' ? 'wrong' : (S.wrongSeg === 'note' ? 'note' : 'fav'));
      };
    });
  }

  /* ---------------- 视图：搜索 ---------------- */
  function hl(text, q) {
    var e = esc(text);
    if (!q) return e;
    var needle = esc(q);
    var idx = e.toLowerCase().indexOf(needle.toLowerCase());
    if (idx < 0) return e;
    return e.slice(0, idx) + '<mark>' + e.slice(idx, idx + needle.length) + '</mark>' + e.slice(idx + needle.length);
  }

  function ensureBankLoaded(bankId) {
    var b = bankById(bankId);
    var jobs = [];
    window.__Q = window.__Q || {};
    b.courses.forEach(function (c) {
      c.types.forEach(function (te) {
        if (!window.__Q[te.key]) jobs.push(loadScript('data/' + te.f));
      });
    });
    return Promise.all(jobs);
  }

  function viewSearch() {
    var sr = S.search;
    var html = '<div class="sbox">' +
      '<input id="sInput" class="sinput" type="search" enterkeyhint="search" ' +
      'placeholder="输入关键词，搜索题干或选项" value="' + esc(sr.q || '') + '">' +
      '<button class="sbtn" id="sGo">搜索</button></div>' +
      '<div class="h2">搜索范围</div><div class="seg" id="sScope">' +
      '<button data-scope="stem" class="' + (sr.scope === 'stem' ? 'on' : '') + '">按题干</button>' +
      '<button data-scope="option" class="' + (sr.scope === 'option' ? 'on' : '') + '">按选项</button>' +
      '</div>' +
      '<div class="h2">题库</div><div class="chips" id="sBank">' +
      '<button data-bank="all" class="chip' + (sr.bank === 'all' ? ' on' : '') + '">全部题库</button>' +
      (window.BANKS.banks || []).map(function (b) {
        return '<button data-bank="' + b.id + '" class="chip' + (sr.bank === b.id ? ' on' : '') + '">' +
          esc(b.name) + '</button>';
      }).join('') + '</div>';

    if (sr.busy) {
      html += '<div class="empty">正在载入题库…<br><span class="muted">首次搜索需要载入所选题库，请稍候</span></div>';
    } else if (sr.searched) {
      var n = sr.hits.length;
      html += '<div class="h2">搜索结果 ' + n + ' 条' + (n > 200 ? '（仅显示前 200 条）' : '') + '</div>';
      if (!n) {
        html += '<div class="empty">没有找到匹配的题目<br><span class="muted">换个关键词，或切换"按选项"试试</span></div>';
      } else {
        html += '<div class="card" style="padding:2px 14px">' + sr.hits.slice(0, 200).map(function (h, i) {
          return '<div class="srow" data-hit="' + i + '">' +
            '<div class="smeta">' + esc(h.bankName) + ' · ' + esc(h.courseName) + ' · ' + h.type + '型题</div>' +
            '<div class="sstem">' + hl(h.q, S.search.q) + '</div>' +
            '<div class="sans">答案 ' + LETTER[h.a] +
            (h.optHit != null ? ' · 命中选项 ' + LETTER[h.optHit] + '：' + hl(h.o[h.optHit], S.search.q) : '') +
            '</div></div>';
        }).join('') + '</div>';
      }
    } else {
      html += '<div class="empty">输入关键词后点「搜索」<br><span class="muted">可先选择按题干或按选项，以及限定题库</span></div>';
    }
    return html;
  }

  function doSearch() {
    var sr = S.search;
    var q = (sr.q || '').trim();
    if (!q) { toast('请输入关键词'); return; }
    var wantIds = sr.bank === 'all'
      ? (window.BANKS.banks || []).map(function (b) { return b.id; })
      : [sr.bank];
    sr.busy = true; sr.searched = false; sr.hits = [];
    render();
    Promise.all(wantIds.map(ensureBankLoaded)).then(function () {
      var needle = q.toLowerCase();
      var hits = [];
      wantIds.forEach(function (id) {
        var b = bankById(id);
        b.courses.forEach(function (c) {
          c.types.forEach(function (te) {
            var list = window.__Q[te.key] || [];
            for (var i = 0; i < list.length; i++) {
              var it = list[i], optHit = null, ok = false;
              if (sr.scope === 'option') {
                for (var k = 0; k < it.o.length; k++) {
                  if (it.o[k].toLowerCase().indexOf(needle) >= 0) { optHit = k; ok = true; break; }
                }
              } else {
                ok = it.q.toLowerCase().indexOf(needle) >= 0;
              }
              if (ok) {
                hits.push({
                  bank: id, bankName: b.name, courseNo: c.no, courseName: c.name, type: te.t,
                  idx: i, q: it.q, o: it.o, a: it.a, optHit: optHit
                });
              }
            }
          });
        });
      });
      sr.hits = hits; sr.searched = true; sr.busy = false;
      render();
      toast('找到 ' + hits.length + ' 道题');
    }).catch(function (e) {
      sr.busy = false; sr.searched = false; render();
      toast('载入题库失败：' + e.message);
    });
  }

  function openFromSearch(h) {
    var b = bankById(h.bank);
    var c = b.courses.filter(function (x) { return x.no === h.courseNo; })[0];
    var te = c.types.filter(function (x) { return x.t === h.type; })[0];
    if (!c || !te) { toast('题目定位失败'); return; }
    S.bank = b; S.course = c; S.typeEntry = te;
    S.stack = [{ view: 'search' }];
    startQuiz(te, 'all', h.idx);
  }

  function bindSearch() {
    var sr = S.search;
    var inp = $('sInput');
    if (inp) {
      inp.oninput = function () { sr.q = inp.value; };
      inp.onkeydown = function (e) {
        if (e.key === 'Enter' || e.keyCode === 13) { sr.q = inp.value; doSearch(); }
      };
    }
    if ($('sGo')) $('sGo').onclick = function () { if (inp) sr.q = inp.value; doSearch(); };
    Array.prototype.forEach.call($('main').querySelectorAll('[data-scope]'), function (b) {
      b.onclick = function () { sr.scope = b.dataset.scope; render(); };
    });
    Array.prototype.forEach.call($('main').querySelectorAll('#sBank [data-bank]'), function (b) {
      b.onclick = function () { sr.bank = b.dataset.bank; render(); };
    });
    Array.prototype.forEach.call($('main').querySelectorAll('[data-hit]'), function (b) {
      b.onclick = function () {
        var h = sr.hits[parseInt(b.dataset.hit, 10)];
        if (h) openFromSearch(h);
      };
    });
  }

  /* ---------------- 视图：统计 ---------------- */
  function viewStats() {
    var banks = window.BANKS.banks || [];
    var T = { n: 0, done: 0, right: 0, wrong: 0 };
    var perBank = banks.map(function (b) {
      var st = bankStats(b);
      T.n += st.n; T.done += st.done; T.right += st.right; T.wrong += st.wrong;
      return { b: b, st: st };
    });
    var today = lsGet(todayKey(), 0) || 0;
    var days = [];
    for (var d = 6; d >= 0; d--) {
      var dt = new Date(Date.now() - d * 86400000);
      var k = 'day:' + dt.getFullYear() + '-' + (dt.getMonth() + 1) + '-' + dt.getDate();
      days.push({ k: k, label: (dt.getMonth() + 1) + '/' + dt.getDate(), v: lsGet(k, 0) || 0 });
    }
    var maxv = Math.max.apply(null, days.map(function (x) { return x.v; }).concat([1]));

    var html = '<div class="kpis">' +
      '<div class="kpi"><b class="mono">' + T.done + '</b><span>已做题目 / 共 ' + T.n + '</span></div>' +
      '<div class="kpi"><b class="mono" style="color:#07a35a">' + pct(T.right, T.right + T.wrong) + '%</b><span>总正确率</span></div>' +
      '<div class="kpi"><b class="mono" style="color:#e5484d">' + T.wrong + '</b><span>错题数</span></div>' +
      '<div class="kpi"><b class="mono">' + today + '</b><span>今日已答</span></div>' +
      '</div>';

    html += '<div class="h2">近 7 天答题</div><div class="card"><div class="bars">' +
      days.map(function (x) {
        var h = Math.max(2, Math.round(x.v / maxv * 64));
        return '<div class="bar"><i style="height:' + h + 'px"></i><span>' + x.label + '</span></div>';
      }).join('') + '</div></div>';

    html += '<div class="h2">各题库进度</div>';
    perBank.forEach(function (o) {
      var p = pct(o.st.done, o.st.n);
      html += '<div class="card"><div class="row"><div class="grow"><b>' + esc(o.b.name) + '</b></div>' +
        '<span class="muted">' + o.st.done + '/' + o.st.n + ' · ' + p + '%</span></div>' +
        '<div class="pb"><i style="width:' + p + '%"></i></div>' +
        '<div class="muted" style="margin-top:6px">正确率 ' + pct(o.st.right, o.st.right + o.st.wrong) + '% · 错题 ' + o.st.wrong + ' 题</div></div>';
      var rows = '';
      o.b.courses.forEach(function (c) {
        var cs = courseStats(o.b, c);
        var cp = pct(cs.done, cs.n);
        rows += '<div style="padding:9px 0;border-bottom:1px solid #eef1f5">' +
          '<div class="row"><div class="grow" style="font-size:13px">' + esc(c.name) + '</div>' +
          '<span class="muted mono">' + cs.done + '/' + cs.n + ' · ' + cp + '%</span></div>' +
          '<div class="pb thin"><i style="width:' + cp + '%"></i></div></div>';
      });
      html += '<div class="card" style="padding-top:4px;padding-bottom:4px">' + rows + '</div>';
    });
    return html;
  }

  /* ---------------- 视图：我的 ---------------- */
  function viewMe() {
    var T = { done: 0, right: 0, wrong: 0 };
    (window.BANKS.banks || []).forEach(function (b) {
      var st = bankStats(b); T.done += st.done; T.right += st.right; T.wrong += st.wrong;
    });
    return '<div class="card"><div class="row"><div class="grow">' +
      '<div style="font-size:17px;font-weight:600">zcmu阶段考 · 医学题库</div>' +
      '<div class="muted">离线刷题 · 共 ' + (window.BANKS.total || 0) + ' 题</div></div>' +
      '<span class="chip on">v' + APP_VERSION + '</span></div>' +
      '<div class="muted" style="margin-top:10px">已做 ' + T.done + ' 题 · 正确率 ' +
      pct(T.right, T.right + T.wrong) + '% · 错题 ' + T.wrong + '</div></div>' +
      '<div class="h2">版本与更新</div><div class="card">' +
      '<div class="muted" id="mVerLine" style="margin-bottom:6px">当前版本 v' + APP_VERSION +
      ' · 题库 ' + (window.BANKS.total || 0) + ' 题</div>' +
      '<div class="muted" id="mStoreLine" style="margin-bottom:8px">存储状态：读取中…</div>' +
      '<button class="btn ghost sm" id="mCheckUpdate">检查更新</button></div>' +
      '<div class="h2">数据备份</div><div class="card">' +
      '<div class="muted" style="margin-bottom:8px">做题记录只存在这台设备的浏览器里。' +
      '无痕模式、清理浏览数据、换浏览器都会让它消失 —— 建议定期导出备份，' +
      '换设备时用「导入做题记录」恢复。</div>' +
      '<button class="btn ghost sm" id="mExport" style="margin-bottom:8px">导出做题记录（.json 文件）</button>' +
      '<button class="btn ghost sm" id="mImport" style="margin-bottom:8px">导入做题记录</button>' +
      '<button class="btn ghost sm" id="mReset">清空全部做题记录</button></div>' +
      '<div class="h2">关于</div><div class="card">' +
      '<div class="muted">题库来源：浙江中医药大学考易学生练习端，按正常练习流程逐题读屏采集（非接口抓取）。</div>' +
      '<div class="muted" style="margin-top:6px">包含：中医学类 ' + (bankById('tcm') ? bankById('tcm').courses.length : 0) +
      ' 门、临床医学类 ' + (bankById('clin') ? bankById('clin').courses.length : 0) +
      ' 门、预防医学类 ' + (bankById('prev') ? bankById('prev').courses.length : 0) + ' 门课程。</div>' +
      '<div class="muted" style="margin-top:6px">题型：A1 单项选择 / A2 病例型 / B1 共用备选答案。</div>' +
      '</div>';
  }
  function bindMe() {
    if ($('mCheckUpdate')) $('mCheckUpdate').onclick = checkUpdate;
    if ($('mExport')) $('mExport').onclick = downloadBackup;
    if ($('mImport')) $('mImport').onclick = openImport;
    if ($('mStoreLine')) {
      storageLabel(function (t) {
        var el = $('mStoreLine');
        if (el) el.textContent = '存储状态：' + t;
      });
    }
    if ($('mReset')) $('mReset').onclick = function () {
      dialog('<h3>清空做题记录</h3><p>将删除所有作答、错题、收藏与统计记录，题库本身不受影响。确定吗？</p>' +
        '<div class="acts"><button class="btn ghost" id="dNo">取消</button>' +
        '<button class="btn warn" id="dYes">确定清空</button></div>');
      $('dNo').onclick = closeDlg;
      $('dYes').onclick = function () {
        var kill = [];
        allKeys().forEach(function (k) {
          if (k.indexOf('rec:') === 0 || k.indexOf('fav:') === 0 || k.indexOf('note:') === 0 ||
              k.indexOf('last:') === 0 || k.indexOf('day:') === 0) kill.push(k);
        });
        kill.forEach(lsDel);
        closeDlg(); toast('已清空'); render();
      };
    };
  }

  /* ---------------- 存储持久化 / 备份恢复 ---------------- */
  /* 浏览器（Chrome/Edge/Safari）默认把站点数据当“尽力而为”：
     无痕模式、清理浏览数据、存储紧张时都可能被清掉。
     这里申请“持久化存储”，并要求用户把站点装成应用（桌面/主屏），可显著降低被清风险。 */
  function ensurePersistent() {
    try {
      if (window.NativeBridge) return;                 // 原生壳：数据在 App 私有目录，不必申请
      if (!navigator.storage || !navigator.storage.persist) return;
      navigator.storage.persisted().then(function (p) {
        if (!p) navigator.storage.persist();
      }).catch(function () { });
    } catch (e) { }
  }
  function storageLabel(cb) {
    try {
      if (window.NativeBridge) return cb('App 私有目录（持久）');
      if (!navigator.storage || !navigator.storage.persisted) return cb('浏览器存储');
      navigator.storage.persisted().then(function (p) {
        cb(p ? '已持久化（不会被自动清理）' : '普通存储（建议定期导出备份）');
      }).catch(function () { cb('浏览器存储'); });
    } catch (e) { cb('浏览器存储'); }
  }
  function collectBackup() {
    var data = {};
    allKeys().forEach(function (k) {
      if (k.indexOf('rec:') === 0 || k.indexOf('fav:') === 0 || k.indexOf('note:') === 0) {
        data[k] = lsGet(k, null);
      }
    });
    return { app: 'zcmu-stage-exam', v: 1, ver: APP_VERSION, at: new Date().toISOString(), data: data };
  }
  function downloadBackup() {
    var txt = JSON.stringify(collectBackup());
    var name = 'zcmu阶段考-做题记录-' + new Date().toISOString().slice(0, 10) + '.json';
    try {
      var blob = new Blob([txt], { type: 'application/json;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click();
      setTimeout(function () {
        try { document.body.removeChild(a); URL.revokeObjectURL(url); } catch (e) { }
      }, 2000);
      toast('已导出：' + name);
    } catch (e) {
      dialog('<h3>导出做题记录</h3><p>浏览器不支持直接下载文件，下面是记录内容，' +
        '请长按/全选复制后保存。</p><textarea readonly>' + esc(txt) + '</textarea>' +
        '<div class="acts"><button class="btn" id="exClose">关闭</button></div>');
      if ($('exClose')) $('exClose').onclick = closeDlg;
    }
  }
  function applyBackup(text) {
    var o;
    try { o = JSON.parse(text); } catch (e) { return { ok: false, msg: '内容不是有效的 JSON' }; }
    var d = (o && o.data) ? o.data : o;
    if (!d || typeof d !== 'object') return { ok: false, msg: '文件里没有做题记录' };
    var n = 0;
    Object.keys(d).forEach(function (k) {
      if (!/^(rec|fav|note):/.test(k)) return;
      try { localStorage.setItem(k, JSON.stringify(d[k])); n++; } catch (e) { }
    });
    return n > 0 ? { ok: true, n: n, msg: '已导入 ' + n + ' 组记录' } : { ok: false, msg: '没有可导入的记录' };
  }
  function openImport() {
    dialog('<h3>导入做题记录</h3>' +
      '<p class="muted" style="margin-bottom:8px">选择之前导出的 .json 文件；或把内容粘贴到下面再点导入。' +
      '导入是合并覆盖，不会删除现有记录。</p>' +
      '<input type="file" id="impFile" accept=".json,application/json" ' +
      'style="margin-bottom:8px;font-size:12px;max-width:100%">' +
      '<textarea id="impTa" placeholder="把导出的 JSON 内容粘贴到这里"></textarea>' +
      '<div class="acts"><button class="btn ghost" id="impNo">取消</button>' +
      '<button class="btn" id="impYes">导入</button></div>');
    var fi = $('impFile');
    if (fi) fi.onchange = function () {
      var f = fi.files && fi.files[0];
      if (!f) return;
      try {
        var rd = new FileReader();
        rd.onload = function () { $('impTa').value = String(rd.result || ''); toast('已读取文件，点「导入」确认'); };
        rd.readAsText(f, 'utf-8');
      } catch (e) { toast('读取文件失败：' + e.message); }
    };
    $('impNo').onclick = closeDlg;
    $('impYes').onclick = function () {
      var r = applyBackup(($('impTa') || {}).value || '');
      if (!r.ok) { toast(r.msg); return; }
      closeDlg(); render();
      toast(r.msg + '，做题记录已恢复');
    };
  }

  /* ---------------- 更新检查 ---------------- */
  /* 安卓壳注入 window.NativeBridge（见 MainActivity）：
       NativeBridge.getVersionInfo() -> '{"apk":"1.1","web":"1.1"}'
       NativeBridge.checkUpdate()    -> 异步，完成后调用 window.__onUpdateResult(json)
     网页版（PWA）没有该对象，由 Service Worker 自动更新。 */
  function checkUpdate() {
    if (!window.NativeBridge || !window.NativeBridge.checkUpdate) {
      dialog('<h3>检查更新</h3><p>当前为网页版（PWA）：新版本会在你下次打开时自动生效，' +
        '无需手动更新。\n\n如果打开的还是旧界面，下拉刷新或从桌面图标重新打开一次即可。</p>' +
        '<div class="acts"><button class="btn" id="upClose">知道了</button></div>');
      $('upClose').onclick = closeDlg;
      return;
    }
    toast('正在检查更新…');
    try { window.NativeBridge.checkUpdate(); } catch (e) { toast('检查失败：' + e.message); }
  }

  /* 安卓壳回调 */
  window.__onUpdateResult = function (jsonStr) {
    var r = {};
    try { r = JSON.parse(jsonStr); } catch (e) { r = { ok: false, msg: '返回数据解析失败' }; }
    if (r.msg && !r.updated) { toast(r.msg); }
    if (!r.ok) {
      dialog('<h3>检查更新</h3><p>' + esc(r.msg || '检查失败，请稍后再试') + '</p>' +
        '<div class="acts"><button class="btn" id="upClose2">关闭</button></div>');
      if ($('upClose2')) $('upClose2').onclick = closeDlg;
      return;
    }
    if (r.updated) {
      dialog('<h3>发现新版本</h3><p>已更新到 v' + esc(r.web || '') + '（APK v' + esc(r.apk || '') + '）。\n' +
        '题库与做题记录都已保留，重启应用即可生效。</p>' +
        '<div class="acts"><button class="btn" id="upNow">立即重启</button></div>');
      if ($('upNow')) $('upNow').onclick = function () {
        try { window.NativeBridge.reload(); } catch (e) { location.reload(); }
      };
    } else {
      dialog('<h3>检查更新</h3><p>当前已是最新版本（v' + esc(r.web || APP_VERSION) + '）。</p>' +
        '<div class="acts"><button class="btn" id="upClose3">关闭</button></div>');
      if ($('upClose3')) $('upClose3').onclick = closeDlg;
    }
  };

  /* ---------------- 渲染入口 ---------------- */
  function render() {
    renderHeader();
    renderTabbar();
    var main = $('main');
    var html = '';
    if (S.view === 'banks') html = viewBanks();
    else if (S.view === 'courses') html = viewCourses();
    else if (S.view === 'types') html = viewTypes();
    else if (S.view === 'quiz') html = viewQuiz();
    else if (S.view === 'grid') html = viewGrid();
    else if (S.view === 'search') html = viewSearch();
    else if (S.view === 'wrong') html = viewWrong();
    else if (S.view === 'stats') html = viewStats();
    else if (S.view === 'me') html = viewMe();
    main.innerHTML = html;
    main.scrollTop = 0;

    if (S.view === 'banks') bindBanks();
    else if (S.view === 'courses') bindCourses();
    else if (S.view === 'types') bindTypes();
    else if (S.view === 'quiz') bindQuiz();
    else if (S.view === 'grid') bindGrid();
    else if (S.view === 'wrong') bindWrong();
    else if (S.view === 'search') bindSearch();
    else if (S.view === 'me') bindMe();
  }

  function bindBanks() {
    if ($('goSearch')) $('goSearch').onclick = function () { go('search'); };
    Array.prototype.forEach.call($('main').querySelectorAll('[data-bank]'), function (b) {
      b.onclick = function () {
        S.bank = bankById(b.dataset.bank);
        go('courses');
      };
    });
  }
  function bindCourses() {
    Array.prototype.forEach.call($('main').querySelectorAll('[data-course]'), function (b) {
      b.onclick = function () {
        var no = parseInt(b.dataset.course, 10);
        S.course = S.bank.courses.filter(function (c) { return c.no === no; })[0];
        go('types');
      };
    });
  }
  function bindTypes() {
    Array.prototype.forEach.call($('main').querySelectorAll('[data-type]'), function (b) {
      b.onclick = function () {
        var te = S.course.types.filter(function (t) { return t.t === b.dataset.type; })[0];
        openGridFor(te);          // 题型 → 先进答题卡
      };
    });
    Array.prototype.forEach.call($('main').querySelectorAll('[data-mode]'), function (b) {
      b.onclick = function () {
        S.mode = parseInt(b.dataset.mode, 10);
        Array.prototype.forEach.call($('main').querySelectorAll('.mode'), function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        lsSet('mode', S.mode);
      };
    });
  }

  /* 打开某个题型的答题卡（不直接进题目） */
  function openGridFor(te) {
    S.type = te.t; S.typeEntry = te;
    var b = S.bank, c = S.course;
    ensureShard(te).then(function (qs) {
      S.qs = qs;
      S.rec = lsGet(recKey(b.id, c.no, te.t), {}) || {};
      S.fav = lsGet(favKey(b.id, c.no, te.t), {}) || {};
      S.notes = lsGet(noteKey(b.id, c.no, te.t), {}) || {};
      S.noteOpen = false; S.noteDraft = null;
      S.filter = 'all';
      S.testing = false;
      S.idx = lsGet(lastKey(b.id, c.no, te.t), 0) || 0;
      go('grid');
    }).catch(function (e) { toast(e.message); });
  }

  /* ---------------- Android 返回键 ---------------- */
  window.appBack = function () {
    if ($('dlg').classList.contains('on')) { closeDlg(); return true; }
    if (S.stack.length > 0) { back(); return true; }
    return false;
  };

  /* ---------------- 启动 ---------------- */
  function boot() {
    ensurePersistent();
    try {
      if (localStorage.getItem('migrated_v11') === '1') {
        localStorage.removeItem('migrated_v11');
        setTimeout(function () { toast('已升级到 v1.1，做题记录已保留'); }, 700);
      }
    } catch (e) { }
    // 恢复上次模式
    var m = lsGet('mode', 0);
    if (typeof m === 'number' && m >= 0 && m <= 3) S.mode = m;
    if (!window.BANKS) {
      $('main').innerHTML = '<div class="empty">题库资源加载失败</div>';
      return;
    }
    render();
  }
  /* ---------------- 安卓壳：1.0 记录迁移 / 热更新 ---------------- */
  (function androidShellInit() {
    var nb = window.NativeBridge;
    if (!nb) return;
    /* 新路径页面：把 1.0 旧路径下导出的记录导入回来 */
    try {
      if (nb.takeLegacy) {
        var raw = nb.takeLegacy();
        if (raw && raw !== '{}') {
          var d = JSON.parse(raw), n = 0;
          for (var k in d) {
            if (!Object.prototype.hasOwnProperty.call(d, k)) continue;
            try { localStorage.setItem(k, d[k]); n++; } catch (e) { }
          }
          if (n) {
            try { localStorage.setItem('migrated_v11', '1'); } catch (e) { }
            location.reload();
            return;
          }
        }
      }
    } catch (e) { }
    /* 老路径（assets）首次启动：导出记录 → 复制资源 → 重新加载 */
    try {
      if (nb.needsMigrate && nb.needsMigrate()) {
        var dump = {};
        for (var i = 0; i < localStorage.length; i++) {
          var kk = localStorage.key(i);
          dump[kk] = localStorage.getItem(kk);
        }
        nb.saveLegacy(JSON.stringify(dump));
        if (nb.doMigrate()) { nb.reload(); }
      }
    } catch (e) { }
  })();

  window.addEventListener('load', boot);
})();
