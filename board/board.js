'use strict';
/* 시험 현황판 — data/v1 정적 API(api.js)만 읽는다. 외부 호출·예약 실행 없음. */
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const MINUS = '−';
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const nf = (v, d = 2) => (v == null || Number.isNaN(+v)) ? '—' : Number(v).toLocaleString('ko-KR', {maximumFractionDigits: d});
const fx = (v, d) => v == null ? '—' : Number(v).toLocaleString('ko-KR', {minimumFractionDigits: d, maximumFractionDigits: d});
const sgn = n => n > 0 ? '+' : n < 0 ? MINUS : '±';
const dirCls = n => n > 0 ? 'up' : n < 0 ? 'down' : 'flat';
const decOf = v => (String(v).split('.')[1] ?? '').length;
const ext = (href, text = '공식 발표 보기') => href ? `<a href="${esc(href)}" target="_blank" rel="noopener">${esc(text)} ↗</a>` : '';

/* 차이: 단위 규칙 % → %p, 명 → 명(+증감률), 그 밖 → 같은 단위. 자릿수는 발표 자릿수 */
function delta(unit, a, b, da, db) {
  if (a == null || b == null) return null;
  const k = Math.min(2, Math.max(da ?? decOf(a), db ?? decOf(b)));
  const d = Math.round((b - a) * 1e4) / 1e4;
  if (unit === '명') {
    const p = a ? Math.round((b - a) / a * 1000) / 10 : null;
    return {d, cls: dirCls(d), txt: `${sgn(d)}${nf(Math.abs(d), 0)}명`, sub: p == null ? '' : `${sgn(p)}${fx(Math.abs(p), 1)}%`};
  }
  return {d, cls: dirCls(d), txt: `${sgn(d)}${fx(Math.abs(d), k)}${unit === '%' ? '%p' : unit === '대 1' ? '' : unit}`};
}
const fromDiff = df => df ? {d: df.value, cls: dirCls(df.dir), txt: df.text, sub: df.pctText ?? ''} : null;
const chip = dl => dl ? `<span class="delta-chip ${dl.cls}">${dl.txt}</span>` : '';

/* ---------- 작은 차트 ---------- */
function donut(size, now, prev, center = '') {
  const c = size / 2, r1 = size / 2 - 6, r2 = r1 - 11, w1 = Math.max(6, size / 12), w2 = w1 * .7;
  const ring = (r, v, cls, w) => {
    const L = 2 * Math.PI * r, off = v == null ? L : L * (1 - Math.min(Math.max(v, 0), 100) / 100);
    return `<circle class="track" cx="${c}" cy="${c}" r="${r}" stroke-width="${w}"/>` +
      `<circle class="${cls}" cx="${c}" cy="${c}" r="${r}" stroke-width="${w}" stroke-linecap="round" stroke-dasharray="${L}" stroke-dashoffset="${L}" data-off="${off}" transform="rotate(-90 ${c} ${c})"/>`;
  };
  return `<svg class="donut" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">${ring(r1, now, 'r-now', w1)}${prev === undefined ? '' : ring(r2, prev, 'r-prev', w2)}${center}</svg>`;
}
function columns([lo, hi], prev, curr, unit = '점') { /* 점수·경쟁률: 두 해 막대를 같은 눈금에 */
  const h = 64, wpx = 84;
  const y = v => h - (Math.min(Math.max(v, lo), hi) - lo) / (hi - lo) * h;
  const bar = (v, x, fill) => v == null ? '' : `<rect x="${x}" width="22" rx="3" y="${h}" height="0" data-y="${y(v)}" data-h="${h - y(v)}" style="fill:${fill};transition:all .9s ease-out"/>`;
  return `<div class="gauge"><svg width="${wpx}" height="${h + 16}" viewBox="0 0 ${wpx} ${h + 16}" aria-hidden="true">
    <line x1="0" x2="${wpx}" y1="${h}" y2="${h}" style="stroke:var(--line-2)"/>${bar(prev, 14, 'var(--prev)')}${bar(curr, 46, 'var(--now)')}
    <text x="0" y="${h + 13}" style="fill:var(--faint);font-size:10px">${lo}–${hi}${unit === '점' ? '점' : ''} 눈금</text></svg></div>`;
}
function spark(points) {
  const w = 240, h = 30, vs = points.map(p => p.value), lo = Math.min(...vs) - 3, hi = Math.max(...vs) + 3;
  const xy = points.map((p, i) => [i / (points.length - 1) * (w - 8) + 4, h - 4 - (p.value - lo) / (hi - lo) * (h - 8)]);
  const last = xy.at(-1);
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
    <polyline points="${xy.map(p => p.join(',')).join(' ')}" style="fill:none;stroke:var(--now);stroke-width:2;vector-effect:non-scaling-stroke"/>
    <circle cx="${last[0]}" cy="${last[1]}" r="3" style="fill:var(--now)"/></svg>`;
}
/* 그래프·숫자는 최종값을 먼저 확정하고, 화면이 보일 때만 움직임을 덧입힌다 */
function animate(root) {
  const settle = () => {
    root.querySelectorAll('[data-off]').forEach(el => el.setAttribute('stroke-dashoffset', el.dataset.off));
    root.querySelectorAll('rect[data-y]').forEach(el => { el.setAttribute('y', el.dataset.y); el.setAttribute('height', el.dataset.h); });
    root.querySelectorAll('[data-w]').forEach(el => { el.style.width = el.dataset.w; });
  };
  if (REDUCED || document.visibilityState !== 'visible') { settle(); return; }
  setTimeout(settle, 40);
  root.querySelectorAll('[data-count]').forEach(countUp);
}
function countUp(el) {
  const final = el.dataset.final, dur = 800, t0 = performance.now();
  let done = false;
  const step = () => {
    if (done) return;
    const k = Math.min(1, (performance.now() - t0) / dur), lock = Math.floor(final.length * k);
    el.textContent = [...final].map((ch, i) => i < lock || !/\d/.test(ch) ? ch : String(Math.floor(Math.random() * 10))).join('');
    if (k < 1) setTimeout(step, 45); else { done = true; el.textContent = final; }
  };
  step();
  setTimeout(() => { done = true; el.textContent = final; }, dur + 200); /* 타이머가 늦어도 최종값 확정 */
}
const counted = (v, u, d) => {
  if (v == null) return '<span class="flat">미확보</span>';
  const t = u === '명' ? nf(v, 0) : fx(v, d ?? decOf(v));
  return `<span class="num" data-count="1" data-final="${t}">${t}</span><span class="u">${esc(u)}</span>`;
};

/* ---------- 상태 ---------- */
let IDX, SUM, SCHED, VIEW = 'home', openId = null, HERO_ID = null;
const SINGLE = () => IDX.categories.length === 1;   /* 분야가 하나뿐이면 탭 없는 한 페이지 */
const title = s => s.exam === 'csat' ? `수능 ${s.subject}` : `${s.short}${s.stageName ? ` ${s.stageName}` : ''}`;
const fullTitle = s => s.exam === 'csat' ? `수능 ${s.subject}` : `${s.examName}${s.stageName ? ` ${s.stageName}` : ''}`;
const valTxt = (s, v) => `${s.unit === '명' ? nf(v, 0) : fx(v, s.decimals)}${s.unit}`;
const dlOf = s => fromDiff(s.diff);
const rates = () => SUM.filter(s => s.metric === 'pass_rate');
function caption(s) {
  const c = s.context || {};
  if (s.metric === 'pass_rate' && c.appeared != null && c.passed != null) return `응시 ${nf(c.appeared, 0)}명 중 ${nf(c.passed, 0)}명 합격`;
  if (s.metric === 'competition' && c.quota != null && c.applied != null) return [`선발 예정 ${nf(c.quota, 0)}명에 ${nf(c.applied, 0)}명 지원`, s.caption].filter(Boolean).join(' · ');
  const extra = c.applied != null && s.metric === 'sitting_rate' ? `지원 ${nf(c.applied, 0)}명` : c.appeared != null && s.exam === 'csat' ? `응시 ${nf(c.appeared, 0)}명` : '';
  return [s.caption, extra].filter(Boolean).join(' · ');
}

/* ---------- 카드 ---------- */
function tileHTML(s, i) {
  const dl = dlOf(s);
  const viz = s.unit === '%' ? donut(84, s.curr.value, s.prev ? s.prev.value : undefined) : s.scale ? columns(s.scale, s.prev?.value, s.curr.value, s.unit) : '';
  return `<article class="tile" role="button" tabindex="0" data-id="${esc(s.id)}" aria-pressed="${s.id === openId}" style="animation-delay:${i * 35}ms">
    <div class="tile-top"><div><div class="tile-name">${esc(s.exam === 'csat' ? `수능 ${s.subject}` : s.examName)} <span class="tile-sub">${esc(s.exam === 'csat' ? s.label : s.stageName)}</span></div>
      <div class="tile-about">${esc(s.about)}</div>
      <div class="tile-sub">${esc(s.label)} · ${s.prev ? `${esc(s.prev.label)} → ` : ''}${esc(s.curr.label)}</div></div>${chip(dl)}</div>
    <div class="tile-mid">${viz}<div style="min-width:0"><div class="tile-val">${counted(s.curr.value, s.unit, s.decimals)}</div>
      <div class="tile-prev">${s.prev ? `${esc(s.prev.label)} ${valTxt(s, s.prev.value)}` : '<span class="missing">이전 연도 없음</span>'}</div>
      <div class="tile-sub">${esc(caption(s))}</div>${s.missing ? `<div class="missing">${esc(s.missing)}</div>` : ''}${s.prev && !s.comparable ? '<div class="missing">기준이 달라 직접 비교 안 함</div>' : ''}</div></div>
    ${s.series ? `<div>${spark(s.series)}<div class="tile-sub">${esc(s.series[0].label)}–${esc(s.series.at(-1).label)} ${esc(s.label)} 추이</div></div>` : ''}
    <div class="tile-foot"><span>상세 비교 →</span>${ext(s.sourceUrl)}</div></article>`;
}

/* ---------- 분야·라우팅 ---------- */
function renderTabs() {
  const tabs = [{id: 'home', name: '한눈에'}, ...IDX.categories];
  $('tabs').innerHTML = tabs.map(c => `<a href="#${c.id === 'home' ? '' : c.id}" class="tab" ${c.id === VIEW ? 'aria-current="page"' : ''}>${esc(c.name)}${c.id === 'home' ? '' : `<span class="flat"> ${SUM.filter(s => s.category === c.id).length}</span>`}</a>`).join('');
}
function renderCats() {
  $('cats').innerHTML = IDX.categories.map(c => {
    const list = SUM.filter(s => s.category === c.id);
    const top = list.filter(s => s.diff).sort((x, y) => Math.abs(y.diff.value) - Math.abs(x.diff.value))[0];
    const names = [...new Set(IDX.exams.filter(e => e.category === c.id).map(e => e.short || e.name))];
    return `<a class="cat" href="#${c.id}"><div class="cat-top"><strong>${esc(c.name)}</strong><span class="flat mono">${list.length}개 →</span></div>
      <p>${esc(c.lead)}</p><div class="cat-names">${names.map(esc).join(' · ')}</div>
      ${top ? `<div class="cat-hl">가장 큰 변화 <b>${esc(title(top))}</b> ${esc(top.label)} <span class="${dirCls(top.diff.dir)} mono">${esc(top.diff.text)}</span></div>` : ''}</a>`;
  }).join('');
  const soon = IDX.plannedCategories.map(c => esc(c.name)).join(' · ');
  $('cats').insertAdjacentHTML('afterend', soon ? `<p class="cats-soon" id="cats-soon">준비 중: ${soon} — 공식 통계와 이용 조건을 확인한 뒤 추가해요.</p>` : '');
}
function renderGrid() {
  const c = IDX.categories.find(x => x.id === VIEW); if (!c) return;
  const list = SUM.filter(s => s.category === c.id);
  $('cat-head').innerHTML = `<div class="eyebrow mono"><a href="#">한눈에</a> / ${esc(c.name)}</div><h1>${esc(c.name)}</h1><p class="lead">${esc(c.lead)}</p>${c.desc ? `<p class="sub-d">${esc(c.desc)}</p>` : ''}`;
  $('grid').innerHTML = list.map(tileHTML).join('');
  $('cycler').hidden = c.id !== 'csat';
  $('guide').hidden = c.id !== 'csat';
  if (c.id === 'csat') { startCycler(); renderGuide(); }
  animate($('grid'));
}
function route() {
  const h = decodeURIComponent(location.hash.slice(1));
  const item = SUM.find(s => s.id === h);
  if (SINGLE()) {
    VIEW = IDX.categories[0].id; $('view-cat').hidden = false;
    if (!$('guide').dataset.ready) { $('guide').dataset.ready = 1; renderGrid(); }
    if (item) openDetail(item.id, {silent: true});
    else { if (openId) closeDetail(true); if (h === VIEW || h === 'cuts') $(h === 'cuts' ? 'cycler' : 'guide').scrollIntoView({behavior: REDUCED ? 'auto' : 'smooth'}); }
    return;
  }
  const next = item ? item.category : IDX.categories.some(c => c.id === h) ? h : 'home';
  const changed = next !== VIEW;
  VIEW = next;
  $('view-home').hidden = VIEW !== 'home';
  $('view-cat').hidden = VIEW === 'home';
  renderTabs();
  if (VIEW !== 'home') renderGrid();
  if (item) openDetail(item.id, {silent: changed});
  else { if (openId) closeDetail(true); if (changed) window.scrollTo({top: 0}); }
}

/* ---------- 홈 패널 ---------- */
function renderTicker() {
  const items = SUM.filter(s => s.diff).map(s => `<span><b>${esc(title(s))}</b> ${esc(s.label)} ${valTxt(s, s.prev.value)} → ${valTxt(s, s.curr.value)} <span class="${dirCls(s.diff.dir)}">${esc(s.diff.text)}</span></span>`).join('');
  $('ticker').innerHTML = items + items;
}
function renderRates() {
  const list = rates().sort((x, y) => y.curr.value - x.curr.value);
  $('radial').innerHTML = `<div class="p-head"><span class="tag">pass-rate</span><span class="p-sub mono">${list.length} 시험·단계</span></div>
    <h3 class="p-title">최근 합격률</h3>
    <div class="rt">${list.map(s => `<div class="rt-row" data-id="${esc(s.id)}" title="${esc(title(s))} ${s.prev ? `${s.prev.label} ${valTxt(s, s.prev.value)} → ` : ''}${s.curr.label} ${valTxt(s, s.curr.value)}">
      <span class="rt-name">${esc(title(s))}</span>
      <div class="rt-track"><i class="rt-bar" style="width:0" data-w="${s.curr.value}%"></i>${s.prev ? `<i class="rt-prev" style="left:${s.prev.value}%"></i>` : ''}</div>
      <span class="rt-val">${valTxt(s, s.curr.value)}</span></div>`).join('')}</div>
    <div class="rt-axis"><span></span><div><span>0</span><span>50</span><span>100%</span></div><span></span></div>
    <div class="legend"><span><i class="lg now"></i>최근 연도</span><span><i style="width:2px;height:12px;background:var(--text);display:inline-block"></i>이전 연도</span><span>누르면 상세</span></div>`;
  animate($('radial'));
}
function renderDiverge() {
  const list = rates().filter(s => s.diff).sort((x, y) => y.diff.value - x.diff.value);
  const max = Math.max(5, Math.ceil(Math.max(...list.map(s => Math.abs(s.diff.value))) / 5) * 5);
  $('diverge').innerHTML = `<div class="p-head"><span class="tag">delta</span><span class="p-sub mono">unit: %p</span></div>
    <h3 class="p-title">합격률, 전년보다 얼마나 변했나</h3>
    <div class="dv">${list.map(s => `<div class="dv-row" data-id="${esc(s.id)}" title="${esc(title(s))} ${s.prev.label} ${valTxt(s, s.prev.value)} → ${s.curr.label} ${valTxt(s, s.curr.value)}">
      <span class="dv-name">${esc(title(s))}</span>
      <div class="dv-track"><i class="dv-bar ${dirCls(s.diff.dir)}" data-w="${Math.abs(s.diff.value) / max * 50}%"></i></div>
      <span class="dv-val ${dirCls(s.diff.dir)}">${esc(s.diff.text)}</span></div>`).join('')}</div>
    <div class="dv-axis"><span></span><div><span>${MINUS}${max}%p</span><span>0</span><span>+${max}%p</span></div><span></span></div>
    <div class="p-sub" style="margin-top:6px">왼쪽(하늘색)은 합격률 하락, 오른쪽(호박색)은 상승. 각 시험의 최근 두 해 비교.</div>`;
  animate($('diverge'));
}

/* 기준 시각: 평소엔 지금. 점검용으로 ?asOf=2026-11-19T10:45 를 주면 그 시각으로 화면을 그린다 */
const NOW = () => { const q = new URLSearchParams(location.search).get('asOf'); const d = q ? new Date(q) : new Date(); return isNaN(d) ? new Date() : d; };
const dayDiff = iso => { const t = NOW(); t.setHours(0, 0, 0, 0); return Math.round((new Date(iso + 'T00:00:00') - t) / 864e5); };
const md = iso => { const d = new Date(iso + 'T00:00:00'); return `${d.getMonth() + 1}월 ${d.getDate()}일(${'일월화수목금토'[d.getDay()]})`; };
function renderCountdown() {
  const s = SCHED.items.filter(i => i.examDate || i.resultDate).sort((x, y) => (x.examDate ?? '').localeCompare(y.examDate ?? ''))[0];
  HERO_ID = s?.id;
  if (!s) { $('countdown').innerHTML = '<p class="sub-d">예정된 시험 일정이 없습니다. data/src/schedule.json에 추가하세요.</p>'; return; }
  const dEx = s.examDate ? dayDiff(s.examDate) : null, dRes = s.resultDate ? dayDiff(s.resultDate) : null;
  let big, cap;
  if (dEx != null && dEx > 0) { big = `D-${dEx}`; cap = '시험까지'; }
  else if (dEx === 0) { big = 'D-DAY'; cap = '오늘 시험'; }
  else if (dRes != null && dRes > 0) { big = `D-${dRes}`; cap = `${s.resultLabel ?? '결과'}까지`; }
  else if (dRes === 0) { big = 'D-DAY'; cap = `오늘 ${s.resultLabel ?? '결과'}`; }
  else { big = '결과 발표'; cap = `${s.resultDate ? md(s.resultDate) + ' ' : ''}${s.resultLabel ?? '결과'} 완료`; }
  const released = dRes != null && dRes <= 0;
  const ap = s.applicants, total = ap?.total, colors = ['var(--now)', 'var(--now-2)', 'var(--prev)'];
  let seg = '', acc = 0;
  if (ap) {
    const size = 120, c = 60, r = 48, L = 2 * Math.PI * r;
    seg = ap.breakdown.map((p, i) => { const len = p.value / total * L, o = -acc; acc += len;
      return `<circle cx="${c}" cy="${c}" r="${r}" stroke-width="14" style="stroke:${colors[i]}" stroke-dasharray="${len} ${L - len}" stroke-dashoffset="${L}" data-off="${o}" transform="rotate(-90 ${c} ${c})"/>`; }).join('');
    seg = `<svg class="donut" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true"><circle class="track" cx="${c}" cy="${c}" r="${r}" stroke-width="14"/>${seg}
      <text x="${c}" y="${c - 2}" text-anchor="middle" style="font-size:12px;fill:var(--muted);font-weight:500">지원자</text><text x="${c}" y="${c + 16}" text-anchor="middle" style="font-size:15px">${nf(total / 1e4, 1)}만</text></svg>`;
  }
  const dl = ap ? delta('명', ap.previousTotal, total) : null;
  const doneMsg = dEx == null || dEx >= 0 || s.group !== '수능' ? ''
    : released ? `<p class="cd-done">성적이 나왔어요. <a href="#cuts">공식 등급컷·작년 대비 보기 →</a> · <a href="#csat">남은 일정·혜택 →</a></p>`
    : `<p class="cd-done">수능 보느라 고생 많았어요. <a href="#csat">수험생 혜택·남은 일정 보기 →</a></p>`;
  const tag = dEx != null && dEx < 0 ? (released ? '결과 발표' : '채점 중') : '다가오는 시험';
  $('countdown').innerHTML = `<div class="eyebrow"><span class="pill live">${tag}</span>${esc(s.group)}</div>
    <h3>${esc(s.name)}</h3>
    ${doneMsg}
    <div class="dday"><div><div class="big num">${big}</div><div class="stat-lab">${cap}</div></div>
      <div class="dates">${s.examDate ? `<span>시험 <b>${md(s.examDate)}</b></span>` : ''}${s.resultDate ? `<span>${esc(s.resultLabel ?? '결과')} <b>${md(s.resultDate)}</b></span>` : ''}</div></div>
    ${ap ? `<div class="cd-body">${seg}<div style="min-width:0"><div class="stat-lab">${esc(ap.label)} 인원</div>
      <div class="stat-big">${counted(total, '명')}</div>
      <div class="stat-lab">${esc(ap.previousLabel)} ${nf(ap.previousTotal, 0)}명 대비 <span class="${dl.cls}">${dl.txt} (${dl.sub})</span></div>
      <div class="mix">${ap.breakdown.map((p, i) => `<div class="mix-row"><i style="background:${colors[i]}"></i><span>${esc(p.name)}</span><span class="num">${nf(p.value, 0)}명 · ${fx(p.value / total * 100, 1)}%</span></div>`).join('')}</div></div></div>
      <div class="hl">${ap.highlights.map(h => `<div><strong><span class="num">${h.unit === '명' ? nf(h.value, 0) : fx(h.value, 1)}</span><span class="u">${esc(h.unit)}</span></strong><span>${esc(h.label)}${h.note ? ` · ${esc(h.note)}` : ''}</span></div>`).join('')}</div>
      <div class="src">출처: ${esc(ap.source)} <span class="pill">B</span> · ${ext(ap.sourceUrl, '기사')} · ${ext(s.sourceUrl, '시행 일정')}</div>` : ''}`;
  animate($('countdown'));
}

let spotIdx = 0, spotTimer = null, spotList = [];
function renderSpot(i) {
  spotIdx = (i + spotList.length) % spotList.length;
  const s = spotList[spotIdx], el = $('spotlight'), dl = dlOf(s);
  el.innerHTML = `<div class="eyebrow"><span class="pill">전년 대비 가장 크게 변한 수치</span><span class="num">${spotIdx + 1} / ${spotList.length}</span></div>
    <h3>${esc(title(s))} ${esc(s.label)}</h3>
    <div class="spot-body">${donut(132, s.curr.value, s.prev.value, `<text x="66" y="62" text-anchor="middle" style="font-size:11px;fill:var(--muted);font-weight:500">${esc(s.curr.label)}</text><text x="66" y="80" text-anchor="middle" style="font-size:18px">${fx(s.curr.value, 1)}%</text>`)}
      <div class="spot-nums"><span class="spot-from">${esc(s.prev.label)} ${valTxt(s, s.prev.value)} →</span><span class="spot-to">${counted(s.curr.value, '%', s.decimals)}</span>${chip(dl)}
      <span class="tile-sub">${esc(caption(s))}</span><span class="tile-sub">${ext(s.sourceUrl)}</span></div></div>
    <div class="spot-dots">${spotList.map((x, k) => `<button aria-label="${esc(title(x))}" class="${k === spotIdx ? 'on' : ''}" data-k="${k}"></button>`).join('')}</div>
    <ol class="rank">${spotList.map((x, k) => `<li class="${k === spotIdx ? 'on' : ''}" data-k="${k}"><span class="num">${k + 1}</span><span>${esc(title(x))} ${esc(x.label)}</span><span class="num ${dirCls(x.diff.dir)}">${esc(x.diff.text)}</span></li>`).join('')}</ol>`;
  animate(el);
}
function startSpot() {
  spotList = rates().filter(s => s.diff).sort((x, y) => Math.abs(y.diff.value) - Math.abs(x.diff.value)).slice(0, 5);
  if (!spotList.length) return;
  renderSpot(0);
  if (REDUCED) return;
  const tick = () => { spotTimer = setTimeout(() => { renderSpot(spotIdx + 1); tick(); }, 6000); };
  tick();
  const el = $('spotlight');
  el.addEventListener('mouseenter', () => clearTimeout(spotTimer));
  el.addEventListener('mouseleave', () => { clearTimeout(spotTimer); tick(); });
  el.addEventListener('click', e => { const b = e.target.closest('[data-k]'); if (b) { clearTimeout(spotTimer); renderSpot(+b.dataset.k); } });
}
function renderSchedule() {
  const pill = i => {
    if (i.status === 'upcoming' && i.examDate) { const d = dayDiff(i.examDate); return `<span class="pill live">${d > 0 ? `D-${d}` : d === 0 ? 'D-DAY' : '시험 종료'}</span>`; }
    if (i.status === 'plan_pending') return '<span class="pill wait">일정 공고 전</span>';
    if (i.status === 'result_unverified') return '<span class="pill wait">결과 확인 전</span>';
    return `<span class="pill">${esc(i.status)}</span>`;
  };
  $('sched').innerHTML = SCHED.items.filter(i => i.id !== HERO_ID).map(i => `<div class="sch">${pill(i)}<h4>${esc(i.name)}</h4>
    ${i.examDate ? `<p>시험 <b class="num">${md(i.examDate)}</b>${i.resultDate ? ` · ${esc(i.resultLabel ?? '결과')} ${md(i.resultDate)}` : ''}</p>` : ''}
    ${i.note ? `<p>${esc(i.note)}</p>` : ''}${ext(i.sourceUrl, '공식 공고 보기')}</div>`).join('');
}

/* ---------- 수능 순환판(수능 탭) ---------- */
let cyIdx = 0, cyTimer = null, CSAT = null, cyBound = false;
const visible = () => !REDUCED && document.visibilityState === 'visible';
const csatYears = E => [...new Set(E.observations.map(o => o.year))].sort((a, b) => a - b);
const gobs = (E, y, subj, metric, g) => E.observations.find(o => o.year === y && o.subject === subj && o.metric === metric && (g == null ? o.grade == null : o.grade === g));
function renderCycler(i) {
  const E = CSAT, subjects = E.subjects.map(s => s.name), years = csatYears(E), y1 = years.at(-1), y0 = years.at(-2);
  cyIdx = (i + subjects.length) % subjects.length;
  const s = subjects[cyIdx], area = E.subjects[cyIdx].area;
  const ramp = k => `color-mix(in srgb, var(--now) ${100 - k * 11}%, var(--panel-2))`;
  const bar = y => `<div class="cy-row"><span>${y}학년도</span><div class="cy-bar">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(g => { const o = gobs(E, y, s, 'grade_share', g);
    return `<i title="${g}등급 ${o?.value == null ? '공란' : fx(o.value, 2) + '%'}" style="width:0;background:${ramp(g - 1)}" data-w="${o?.value ?? 0}%"></i>`; }).join('')}</div></div>`;
  const c1 = gobs(E, y1, s, 'grade_cutoff', 1), c0 = gobs(E, y0, s, 'grade_cutoff', 1), r1 = gobs(E, y1, s, 'grade_share', 1), r0 = gobs(E, y0, s, 'grade_share', 1);
  const dc = c0?.scale === c1?.scale ? delta('점', c0?.value, c1?.value) : null, ds = delta('%', r0?.value, r1?.value, 2, 2);
  $('cycler').innerHTML = `<div class="p-head"><span class="tag">csat ${cyIdx + 1}/${subjects.length}</span><span class="p-sub mono">auto · 5s</span></div>
    <div><div class="cy-sub">수능 ${esc(s)}</div><div class="p-sub">${esc(area)} · ${c1?.scale === 'standard_score' ? '표준점수 등급컷' : '원점수 절대평가'} · 등급별 인원 비율</div></div>
    <div class="cy-bars">${y0 ? bar(y0) : ''}${bar(y1)}</div>
    <div class="cy-scale"><span>1등급</span><span>→</span><span>9등급</span></div>
    <div class="cy-stats">
      <div><span>${y1} 응시자</span><strong>${nf(gobs(E, y1, s, 'appeared')?.value, 0)}<span class="u">명</span></strong></div>
      <div><span>1등급컷</span><strong>${c1?.value == null ? '공란' : nf(c1.value)}<span class="u">점</span></strong>${dc ? `<span class="${dc.cls}">${dc.txt}</span>` : ''}</div>
      <div><span>1등급 비율</span><strong>${r1?.value == null ? '공란' : fx(r1.value, 2) + '%'}</strong>${ds ? `<span class="${ds.cls}">${ds.txt}</span>` : ''}</div>
    </div>
    <div class="cy-prog"><i class="${visible() ? 'run' : ''}"></i></div>
    <div class="controls"><button class="close" data-cy="-1" aria-label="이전 과목">◀ 이전</button><button class="close" data-cy="1" aria-label="다음 과목">다음 ▶</button><button class="close" data-cy-open="${esc(s)}">이 과목 상세</button></div>`;
  animate($('cycler'));
}
async function startCycler() {
  if (cyBound) return;
  cyBound = true;
  try { CSAT = await API.exam('csat'); } catch (e) { $('cycler').innerHTML = `<p class="missing">수능 자료를 읽지 못했어요(${esc(e.message)}).</p>`; return; }
  renderCycler(0);
  const loop = () => { clearTimeout(cyTimer); cyTimer = setTimeout(() => { if (visible() && VIEW === 'csat') renderCycler(cyIdx + 1); loop(); }, 5000); };
  if (!REDUCED) loop();
  const el = $('cycler');
  el.addEventListener('mouseenter', () => clearTimeout(cyTimer));
  el.addEventListener('mouseleave', () => { if (!REDUCED) loop(); });
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-cy]'); if (b) { renderCycler(cyIdx + +b.dataset.cy); return; }
    const o = e.target.closest('[data-cy-open]'); if (o) { const s = SUM.find(x => x.exam === 'csat'); openDetail(s.id, {subject: o.dataset.cyOpen}); }
  });
}

/* ---------- 수능 안내(시간표·준비물·일정·혜택) — 날짜에 따라 시험 전/당일/후 화면이 바뀐다 ---------- */
let GUIDE = null;
const resultOut = () => { const s = SCHED.items.find(i => i.id === HERO_ID); return !!(s?.resultDate && dayDiff(s.resultDate) <= 0); };
const guidePhase = g => { const d = dayDiff(g.examDate); return d > 0 ? 'before' : d === 0 ? 'day' : 'after'; };
async function loadGuide() {
  const meta = (IDX.guides || []).find(x => x.exam === 'csat');
  if (!meta) return null;
  if (!GUIDE) { try { GUIDE = await API.guide(meta.id); } catch (e) { return null; } }
  return GUIDE;
}
async function renderGuide() {
  const g = await loadGuide(), el = $('guide');
  if (!g) { el.hidden = true; return; }
  const phase = guidePhase(g), dd = dayDiff(g.examDate);
  const srcLink = (url, label = '출처') => url ? `<a class="g-src" href="${esc(url)}" target="_blank" rel="noopener">${esc(label)} ↗</a>` : '';
  const head = phase === 'after'
    ? `<div class="g-banner"><strong>${esc(g.afterTitle || '수능 보느라 정말 고생 많았어요')}</strong><span>${esc(resultOut() ? (g.afterResultMessage || '성적이 나왔어요. 공식 등급컷은 아래에서, 남은 정시 일정은 오른쪽에서 확인하세요.') : (g.afterMessage || ''))}</span></div>`
    : `<div class="p-head"><span class="tag">${phase === 'day' ? 'today' : 'd-' + dd}</span><span class="p-sub mono">확인 ${esc(g.checkedAt)}</span></div><h3 class="p-title">${esc(g.title)} ${phase === 'day' ? '— 오늘이에요' : `— D-${dd}`}</h3>`;
  const dates = (g.dates || []).slice().sort((a, b) => a.date.localeCompare(b.date));
  const nextIdx = dates.findIndex(x => dayDiff(x.end || x.date) >= 0);
  const dateLi = (x, i) => {
    const past = dayDiff(x.end || x.date) < 0, d0 = dayDiff(x.date);
    const when = x.end ? `${md(x.date)} ~ ${md(x.end)}` : md(x.date);
    return `<li class="${past ? 'past' : i === nextIdx ? 'next' : ''}"><span class="g-when num">${when}</span><span class="g-what">${esc(x.label)}${x.note ? ` <span class="flat">· ${esc(x.note)}</span>` : ''}</span><span class="g-dd mono">${past ? '지남' : d0 > 0 ? `D-${d0}` : '진행 중'}</span>${srcLink(x.url)}</li>`;
  };
  /* 일정: 다가오는 4개만 펼치고 전체는 접어 둔다 */
  const from = nextIdx < 0 ? Math.max(0, dates.length - 3) : nextIdx, shown = dates.slice(from, from + 4);
  const timeline = dates.length ? `<div class="g-block"><h4 class="sub-h">주요 일정</h4><ol class="g-dates">${shown.map((x, k) => dateLi(x, from + k)).join('')}</ol>
    ${dates.length > shown.length ? `<details class="g-more"><summary>전체 일정 ${dates.length}개 보기</summary><ol class="g-dates">${dates.map(dateLi).join('')}</ol></details>` : ''}</div>` : '';
  /* 시간표: 표 대신 한 줄 목록(옆으로 밀 필요 없음). 당일엔 진행 중인 교시 강조 */
  const tt = g.timetable && phase !== 'after' ? `<div class="g-block"><h4 class="sub-h">${esc(g.timetable.title || '시험 시간표')}</h4>${g.timetable.note ? `<p class="sub-d">${esc(g.timetable.note)}</p>` : ''}
    <ol class="g-tt">${g.timetable.rows.map(r => `<li class="${r.subject ? '' : 'rest'}" data-s="${esc(r.start)}" data-e="${esc(r.end)}"><span class="g-tt-p">${esc(r.period)}</span><span class="g-tt-s">${esc(r.subject || '')}</span><span class="g-tt-t num">${esc(r.time)}</span>${r.note ? `<span class="g-tt-n">${esc(r.note)}</span>` : ''}</li>`).join('')}</ol>
    <p class="sub-d">${srcLink(g.timetable.url, g.timetable.source || '공식 출처')}</p></div>` : '';
  /* 준비물 등 안내: 제목만 보이고 눌러서 펼친다 */
  const secs = (g.sections || []).filter(s => !s.phases || s.phases.includes(phase)).map(s => `<details class="g-sec"><summary><span class="sub-h">${esc(s.title)}</span><span class="flat">${s.items.length}</span></summary><ul class="notes">${s.items.map(t => `<li>${esc(t)}</li>`).join('')}</ul><p class="sub-d">${srcLink(s.url, s.source || '공식 출처')}</p></details>`).join('');
  const benefits = (g.benefits || []);
  const benCard = b => `<div class="g-ben"><div class="g-ben-top"><strong>${esc(b.org)}</strong>${b.category ? `<span class="pill">${esc(b.category)}</span>` : ''}</div>
      <p>${esc(b.desc)}</p><dl>${b.period ? `<dt>기간</dt><dd>${esc(b.period)}</dd>` : ''}${b.condition ? `<dt>조건</dt><dd>${esc(b.condition)}</dd>` : ''}</dl>
      <div class="g-ben-foot">${srcLink(b.url, b.sourceType === 'official' ? '공식 안내' : '보도 기사')}<span class="flat">${esc(b.checkedAt || g.checkedAt)} 확인</span></div></div>`;
  const BEN_FIRST = 6;
  const ben = benefits.length ? `<div class="g-block" id="csat-benefits"><h4 class="sub-h">${phase === 'after' ? '수험생 혜택' : '수능이 끝나면 받을 수 있는 혜택'} <span class="flat">${benefits.length}곳</span></h4>
    <p class="sub-d">${esc(g.benefitsNote || '업체·기관 사정으로 바뀌거나 일찍 끝날 수 있어요. 이용 전에 원문을 꼭 확인하세요. 이 사이트는 각 업체와 관계가 없어요.')}</p>
    <div class="g-benefits">${benefits.slice(0, BEN_FIRST).map(benCard).join('')}</div>
    ${benefits.length > BEN_FIRST ? `<details class="g-more"><summary>혜택 ${benefits.length - BEN_FIRST}곳 더 보기</summary><div class="g-benefits">${benefits.slice(BEN_FIRST).map(benCard).join('')}</div></details>` : ''}</div>` : '';
  const live = phase === 'day' && g.timetable ? `<div class="g-live" id="g-live">${liveText(g.timetable.rows)}</div>` : '';
  el.innerHTML = head + live + `<div class="g-grid"><div class="g-col">${phase === 'after' ? ben : tt + secs}</div><div class="g-col">${timeline}${phase === 'after' ? secs : ''}</div></div>` + (phase !== 'after' ? ben : '');
  el.hidden = false;
  clearInterval(liveTimer);
  if (phase === 'day' && g.timetable) { markPeriod(); liveTimer = setInterval(() => { const x = $('g-live'); if (x) x.innerHTML = liveText(g.timetable.rows); markPeriod(); }, 30000); }
}
function markPeriod() {
  const now = NOW(), mins = now.getHours() * 60 + now.getMinutes(), m = s => { const [h, mm] = s.split(':').map(Number); return h * 60 + mm; };
  document.querySelectorAll('.g-tt li').forEach(li => { li.classList.toggle('now', mins >= m(li.dataset.s) && mins < m(li.dataset.e)); li.classList.toggle('done', mins >= m(li.dataset.e)); });
}
/* 수능 당일: 지금 몇 교시인지 시간표로 계산 */
let liveTimer = null;
function liveText(rows) {
  const now = NOW(), mins = now.getHours() * 60 + now.getMinutes();
  const m = s => { const [h, mm] = s.split(':').map(Number); return h * 60 + mm; };
  const exams = rows.filter(r => r.subject);
  const cur = rows.find(r => mins >= m(r.start) && mins < m(r.end));
  if (mins < m(exams[0].start)) return `<strong>입실은 08:10까지</strong><span>1교시 ${esc(exams[0].subject)} ${esc(exams[0].start)} 시작 · ${m(exams[0].start) - mins}분 남음</span>`;
  if (cur && cur.subject) return `<strong>지금 ${esc(cur.period)} ${esc(cur.subject)}</strong><span>${esc(cur.time)} · 종료까지 ${m(cur.end) - mins}분</span>`;
  const next = exams.find(r => m(r.start) > mins);
  if (next) return `<strong>쉬는 시간</strong><span>다음 ${esc(next.period)} ${esc(next.subject)} ${esc(next.start)} 시작 · ${m(next.start) - mins}분 남음(10분 전 입실)</span>`;
  return `<strong>오늘 시험이 모두 끝났어요</strong><span>정말 고생 많았어요. 문제·정답은 평가원 누리집에서 확인할 수 있어요.</span>`;
}

/* ---------- 상세 ---------- */
const KPI_ORDER = ['pass_rate', 'sitting_rate', 'competition', 'cutoff_score', 'cutoff_total', 'avg_score', 'quota', 'appeared', 'passed', 'applied'];
const table = (head, rows) => `<div class="tbl-wrap"><table><thead><tr>${head.map(h => `<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map((c, i) => i === 0 ? `<th scope="row" style="font-size:14px;color:var(--text);font-weight:600;text-align:left">${c}</th>` : `<td${typeof c === 'object' ? ` class="${c.cls}"` : ''}>${typeof c === 'object' ? c.h : c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
const oval = (o, unit) => o == null ? '—' : o.value == null ? ({blank_in_source: '공란', not_applicable: '해당 없음', not_collected: '미확보'}[o.status] ?? '—') : `${unit === '명' ? nf(o.value, 0) : fx(o.value, o.decimals ?? decOf(o.value))}${unit}`;
const odelta = (unit, a, b) => { const d = a?.value != null && b?.value != null ? delta(unit, a.value, b.value, a.decimals, b.decimals) : null; return d ? {cls: d.cls, h: d.txt + (d.sub ? ` <span class="flat">(${d.sub})</span>` : '')} : {cls: 'flat', h: '—'}; };
function arrow(a, b, max = 100) {
  if (a == null || b == null) return '';
  const pa = a / max * 100, pb = b / max * 100, col = b >= a ? 'var(--up)' : 'var(--down)';
  return `<div class="arrow" role="img" aria-label="${nf(a)}에서 ${nf(b)}"><i class="ax"></i><i class="seg" style="left:${Math.min(pa, pb)}%;width:${Math.abs(pb - pa)}%;background:${col}"></i><i class="pa" style="left:${pa}%"></i><i class="pb" style="left:${pb}%"></i></div>`;
}
function kpiCard(E, m, o0, o1, yl0) {
  const unit = E.metrics[m].unit, d = odelta(unit, o0, o1);
  const name = (o1?.label ?? E.metrics[m].name) + (o1?.maxScore ? ` (${o1.maxScore}점 만점)` : '') + (o1?.derived ? ' · 인원으로 계산' : '');
  return `<div class="kpi"><span class="k">${esc(name)}</span><span class="v">${o1?.value != null ? counted(o1.value, unit, o1.decimals) : `<span class="flat">${oval(o1, unit)}</span>`}</span>
    <span class="p">${yl0 ? `${esc(yl0)} ${oval(o0, unit)}` : ''}</span><span class="dl ${d.cls}">${d.h === '—' ? '비교 불가' : d.h}</span></div>`;
}
function detailBody(E, s, opts) {
  const yl = y => y == null ? '' : E.yearType === 'academic' ? `${y}학년도` : `${y}년`;
  if (E.id === 'csat') return detailCsat(E, opts.subject ?? s.subject, yl);
  const obs = E.observations.filter(o => o.stage === s.stage);
  const y1 = s.curr.year, y0 = s.prev?.year;
  const at = (y, m, subj = null) => obs.find(o => o.year === y && o.metric === m && (o.subject ?? null) === subj && !o.bin && o.grade == null);
  let h = `<div class="kpis">${KPI_ORDER.filter(m => at(y1, m)?.value != null || at(y0, m)?.value != null).map(m => kpiCard(E, m, at(y0, m), at(y1, m), yl(y0))).join('')}</div>`;
  /* 과목별 */
  const subjects = [...new Set(obs.filter(o => o.subject && !o.bin).map(o => o.subject))];
  if (subjects.length) {
    const primary = ['subject_fail_rate', 'sitting_rate', 'competition'].find(m => obs.some(o => o.subject && o.metric === m)) ?? null;
    const pct = primary && E.metrics[primary].unit === '%';
    const others = [...new Set(obs.filter(o => o.subject && !o.bin && o.metric !== primary).map(o => o.metric))].sort((a, b) => (E.metrics[a].unit === '명') - (E.metrics[b].unit === '명'));
    const rows = subjects.map(n => ({n, a: primary && at(y0, primary, n), b: primary && at(y1, primary, n)}))
      .sort((p, q) => ((q.b?.value ?? 0) - (q.a?.value ?? 0)) - ((p.b?.value ?? 0) - (p.a?.value ?? 0)));
    const head = ['과목'];
    if (primary) y0 ? head.push(`${y0} ${E.metrics[primary].name}`, `${y1} ${E.metrics[primary].name}`, '변화', ...(pct ? ['0–100% 눈금'] : [])) : head.push(`${y1} ${E.metrics[primary].name}`);
    head[0] = primary === 'subject_fail_rate' ? '과목' : '구분';
    others.forEach(m => E.metrics[m].unit === '명' || !y0 ? head.push(`${y1} ${E.metrics[m].name}`) : head.push(`${y0} ${E.metrics[m].name}`, `${y1} ${E.metrics[m].name}`));
    h += `<div><h4 class="sub-h">${primary === 'subject_fail_rate' ? '과목별 비교' : '구분별 비교'}</h4><p class="sub-d">${primary === 'subject_fail_rate' ? '과락률 = 그 과목 응시자 중 과락한 사람 비율. 과목마다 응시자 수가 달라요. 증가 폭 큰 순.' : primary === 'competition' ? '직군·전형별 경쟁률(지원자 ÷ 선발 예정).' : '영역별 값이에요.'}</p></div>` +
      table(head, rows.map(r => {
        const cells = [esc(r.n)];
        if (primary) { const u = E.metrics[primary].unit; y0 ? cells.push(oval(r.a, u), {cls: 'cur', h: oval(r.b, u)}, odelta(u, r.a, r.b), ...(pct ? [{cls: 'bar', h: arrow(r.a?.value, r.b?.value)}] : [])) : cells.push({cls: 'cur', h: oval(r.b, u)}); }
        others.forEach(m => { const u = E.metrics[m].unit; u === '명' || !y0 ? cells.push(oval(at(y1, m, r.n), u)) : cells.push(oval(at(y0, m, r.n), u), {cls: 'cur', h: oval(at(y1, m, r.n), u)}); });
        return cells;
      }));
  }
  /* 점수 분포 */
  const binSubjects = [...new Set(obs.filter(o => o.bin).map(o => o.subject))];
  binSubjects.forEach(subj => {
    const den = y => at(y, 'appeared', subj)?.value;
    const share = (y, b) => { const o = obs.find(x => x.year === y && x.subject === subj && x.bin && x.bin[0] === b[0]); return o?.value == null || !den(y) ? null : {c: o.value, p: o.value / den(y) * 100}; };
    const bins = obs.filter(o => o.year === y1 && o.subject === subj && o.bin).map(o => o.bin).sort((a, b) => b[0] - a[0]);
    const max = Math.max(...bins.flatMap(b => [share(y1, b)?.p ?? 0, y0 ? share(y0, b)?.p ?? 0 : 0]));
    h += `<div><h4 class="sub-h">${esc(subj)} 점수 분포</h4><p class="sub-d">구간별 응시자 비율(분모: 그해 ${esc(subj)} 응시자). 회색 ${esc(yl(y0))}, 초록 ${esc(yl(y1))}. 원문 공란은 0이 아니라 공란으로 둬요.</p></div><div class="stack">` +
      bins.map(b => { const a = y0 ? share(y0, b) : null, c = share(y1, b);
        return `<div class="stack-row" style="grid-template-columns:64px minmax(0,1fr) 120px"><span class="num">${b[0]}–${b[1]}</span>
          <div style="display:grid;gap:2px">${a ? `<i style="display:block;height:6px;background:var(--prev);width:${a.p / max * 100}%"></i>` : ''}${c ? `<i style="display:block;height:8px;background:var(--now);width:${c.p / max * 100}%"></i>` : '<span style="font-size:11px">공란</span>'}</div>
          <span class="num" style="text-align:right">${c ? `${nf(c.c, 0)}명 · ${fx(c.p, 1)}%` : '공란'}</span></div>`; }).join('') + '</div>';
  });
  /* 여러 해 추이 */
  if (s.series && s.unit !== '%') {
    h += `<div><h4 class="sub-h">${esc(s.series[0].label)}–${esc(s.series.at(-1).label)} ${esc(s.label)} 추이</h4></div>` + table(['연도', s.label, '전년 대비'], s.series.map((p, i) => { const d = i ? delta(s.unit === '대 1' ? '' : s.unit, s.series[i - 1].value, p.value, s.decimals, s.decimals) : null; return [p.label, {cls: 'cur', h: `${fx(p.value, s.decimals)}${s.unit}`}, d ? {cls: d.cls, h: d.txt} : '—']; }));
  } else if (s.series) {
    const years = s.series.map(p => p.year), w = 640, ht = 220, pad = 34, ap = years.map(y => at(y, 'appeared')?.value ?? 0);
    const maxN = Math.max(...ap) * 1.1 || 1, bw = (w - pad * 2) / years.length;
    const x = i => pad + bw * i + bw / 2, yN = v => ht - pad - v / maxN * (ht - pad * 2), yR = v => ht - pad - v / 100 * (ht - pad * 2);
    h += `<div><h4 class="sub-h">${esc(yl(years[0]))}–${esc(yl(years.at(-1)))} 추이</h4><p class="sub-d">막대: 응시 인원 · 선: ${esc(s.label)}(오른쪽 눈금)</p></div>
      <div class="chart"><svg viewBox="0 0 ${w} ${ht}" role="img" aria-label="연도별 응시자와 ${esc(s.label)}">
      ${[0, 25, 50, 75, 100].map(v => `<line x1="${pad}" x2="${w - pad}" y1="${yR(v)}" y2="${yR(v)}" style="stroke:var(--line)"/><text x="${w - pad + 4}" y="${yR(v) + 4}">${v}%</text>`).join('')}
      ${years.map((y, i) => `<rect x="${x(i) - bw * .28}" width="${bw * .56}" y="${yN(ap[i])}" height="${ht - pad - yN(ap[i])}" style="fill:var(--line-2)"/><text x="${x(i)}" y="${ht - pad + 16}" text-anchor="middle">${y}</text>${ap[i] ? `<text x="${x(i)}" y="${yN(ap[i]) - 6}" text-anchor="middle">${nf(ap[i] / 1e4, 1)}만명</text>` : ''}`).join('')}
      <polyline points="${s.series.map((p, i) => `${x(i)},${yR(p.value)}`).join(' ')}" style="fill:none;stroke:var(--now);stroke-width:2.5"/>
      ${s.series.map((p, i) => `<circle cx="${x(i)}" cy="${yR(p.value)}" r="4" style="fill:var(--now)"/><text x="${x(i)}" y="${yR(p.value) - 10}" text-anchor="middle" style="fill:var(--text);font-weight:700">${fx(p.value, s.decimals)}%</text>`).join('')}
      </svg></div>` + table(['연도', '응시', '합격', s.label, '전년 대비'], years.map((y, i) => [yl(y), oval(at(y, 'appeared'), '명'), oval(at(y, 'passed'), '명'), {cls: 'cur', h: oval(at(y, s.metric), s.unit)}, i ? odelta(s.unit, at(years[i - 1], s.metric), at(y, s.metric)) : '—']));
  }
  return h;
}
function detailCsat(E, subj, yl) {
  const years = csatYears(E), y1 = years.at(-1), y0 = years.at(-2);
  const opts = [...new Set(E.subjects.map(s => s.area))].map(a => `<optgroup label="${esc(a)}">${E.subjects.filter(s => s.area === a).map(s => `<option${s.name === subj ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}</optgroup>`).join('');
  const c1 = gobs(E, y1, subj, 'grade_cutoff', 1), c0 = gobs(E, y0, subj, 'grade_cutoff', 1);
  const kind = c1?.scale === 'standard_score' ? '표준점수 기준 등급 구분점수(선택과목별 원점수 예상컷과 다름)' : '원점수 절대평가 기준';
  const cut = o => o == null ? '—' : o.value != null ? `${nf(o.value)}점` : o.bound ? `${nf(o.bound.value)}점 미만` : '공란';
  const ramp = i => `color-mix(in srgb, var(--now) ${100 - i * 11}%, var(--panel-2))`;
  const stack = y => `<div class="stack-row"><span>${y}학년도</span><div class="stack-bar" role="img" aria-label="${y}학년도 등급별 인원 비율">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((g, i) => { const o = gobs(E, y, subj, 'grade_share', g); return `<i title="${g}등급 ${oval(o, '%')}" style="width:${o?.value ?? 0}%;background:${ramp(i)}"></i>`; }).join('')}</div></div>`;
  const same = c0?.scale === c1?.scale;
  return `<div class="controls"><label for="csat-subj" class="sub-d" style="margin:0">과목</label><select id="csat-subj">${opts}</select><span class="sub-d" style="margin:0">${esc(kind)}</span></div>
    ${same ? '' : '<p class="missing">두 학년도의 점수 체계가 달라 직접 비교하지 마세요.</p>'}
    <div class="kpis">${kpiCard(E, 'appeared', gobs(E, y0, subj, 'appeared'), gobs(E, y1, subj, 'appeared'), yl(y0))}${kpiCard(E, 'grade_cutoff', same ? c0 : null, c1, yl(y0)).replace('등급 구분점수', '1등급 구분점수')}${kpiCard(E, 'grade_share', gobs(E, y0, subj, 'grade_share', 1), gobs(E, y1, subj, 'grade_share', 1), yl(y0)).replace('등급 인원 비율', '1등급 인원 비율')}</div>
    <div><h4 class="sub-h">등급별 인원 비율</h4><p class="sub-d">왼쪽부터 1등급 → 9등급. 진할수록 상위 등급.</p></div>
    <div class="stack">${y0 ? stack(y0) : ''}${stack(y1)}</div>
    <div><h4 class="sub-h">등급별 구분점수와 인원 비율</h4><p class="sub-d">구분점수는 점수(점), 비율은 응시자 중 해당 등급 인원(%). 비율 차이는 %p.</p></div>
    ${table(['등급', `${y0} 구분점수`, `${y1} 구분점수`, '점수 차이', `${y0} 비율`, `${y1} 비율`, '비율 변화', `${y1} 인원`], [1, 2, 3, 4, 5, 6, 7, 8, 9].map(g => {
      const a = gobs(E, y0, subj, 'grade_cutoff', g), b = gobs(E, y1, subj, 'grade_cutoff', g), sa = gobs(E, y0, subj, 'grade_share', g), sb = gobs(E, y1, subj, 'grade_share', g);
      return [`${g}등급`, cut(a), {cls: 'cur', h: cut(b)}, same ? odelta('점', a, b) : {cls: 'flat', h: '—'}, oval(sa, '%'), {cls: 'cur', h: oval(sb, '%')}, odelta('%', sa, sb), oval(gobs(E, y1, subj, 'grade_count', g), '명')];
    }))}`;
}
async function openDetail(id, opts = {}) {
  const s = SUM.find(x => x.id === id); if (!s) return;
  openId = id;
  document.querySelectorAll('.tile').forEach(x => x.setAttribute('aria-pressed', x.dataset.id === id));
  let E;
  try { E = await API.exam(s.exam); } catch (e) { $('detail').innerHTML = `<p class="missing">상세 자료를 읽지 못했어요(${esc(e.message)}).</p>`; return; }
  const name = s.exam === 'csat' ? `수능 ${opts.subject ?? s.subject}` : fullTitle(s);
  const nulls = E.observations.filter(o => o.stage === s.stage && o.status === 'not_collected' && o.note).map(o => o.note);
  const notes = [...new Set([...(E.notes ?? []), ...nulls])];
  $('detail').innerHTML = `<div class="detail-card"><div class="detail-head"><div><div class="eyebrow">${esc(IDX.categories.find(c => c.id === s.category)?.name)} · 상세 비교</div><h3>${esc(name)}</h3>
    <div class="sub-d">${esc(E.about)} · ${esc(E.org)}</div></div>
    <div class="controls">${ext(s.sourceUrl)}<button class="close" id="close">닫기</button></div></div>
    ${detailBody(E, s, opts)}
    ${notes.length ? `<div><h4 class="sub-h">읽을 때 주의</h4><ul class="notes">${notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul></div>` : ''}
    <div><h4 class="sub-h">출처</h4><ul class="notes">${E.sources.map(x => `<li><span class="pill">${esc(x.grade)}</span> ${esc(x.org)} · ${ext(x.url, x.title)} <span class="flat">(${esc(x.checkedAt)} 확인${x.note ? ` · ${esc(x.note)}` : ''})</span></li>`).join('')}</ul></div></div>`;
  animate($('detail'));
  $('close').onclick = () => closeDetail();
  const sel = $('csat-subj'); if (sel) sel.onchange = () => openDetail(id, {subject: sel.value, keep: true});
  history.replaceState(null, '', `#${id}`);
  if (!opts.keep && !opts.silent) $('detail').scrollIntoView({behavior: REDUCED ? 'auto' : 'smooth', block: 'start'});
}
function closeDetail(keepHash) {
  openId = null; $('detail').innerHTML = '';
  document.querySelectorAll('.tile').forEach(x => x.setAttribute('aria-pressed', 'false'));
  if (keepHash !== true) history.replaceState(null, '', VIEW === 'home' || SINGLE() ? location.pathname + location.search : `#${VIEW}`);
}

function renderIssue() {
  const i = IDX.notices[0]; if (!i) return;
  $('issue').innerHTML = `<div class="panel"><div class="eyebrow"><span class="pill wait">${esc(i.title)}</span>${esc(i.asOf)} 기준</div>
    <p>${esc(i.summary)}</p><p class="src">통계 변화만으로 부정행위를 판단하지 않습니다. ${ext(i.url, `${i.org} 발표`)}</p></div>`;
}
function renderMeta(generatedAt) {
  $('stamp').textContent = `공식 자료 확인 ${IDX.dataCheckedAt} · 수동 갱신`;
  $('foot').innerHTML = `<span>모든 수치는 공식 발표 원문(A) 또는 공식 발표를 인용한 보도(B)를 사람이 확인해 넣은 값입니다. 자동 수집이나 실시간 갱신이 아닙니다.</span>
    <span>숫자만 옮겨 표·그래프로 다시 구성했습니다. 원본 자료는 각 기관 누리집에 있으며, 상세 화면의 출처 링크(기관·자료명·확인일)로 확인할 수 있습니다. 이 사이트는 각 기관과 관계가 없고 후원을 받지 않습니다.</span>
    <span>데이터 빌드 ${new Date(generatedAt).toLocaleString('ko-KR')} · API data/v1 · 출처는 각 상세 화면 아래</span>`;
}

/* 다크/라이트: 기본은 기기 설정, 직접 고른 값만 저장 */
function initTheme() {
  const root = document.documentElement, btn = $('theme');
  if (!btn) return;
  let saved = null; try { saved = localStorage.getItem('exam-theme'); } catch (e) {}
  if (saved === 'light' || saved === 'dark') root.dataset.theme = saved;
  const current = () => root.dataset.theme || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  const label = () => { const c = current(); btn.textContent = c === 'dark' ? '☀ 라이트' : '☾ 다크'; btn.setAttribute('aria-label', c === 'dark' ? '라이트 모드로 바꾸기' : '다크 모드로 바꾸기'); };
  btn.onclick = () => { const next = current() === 'dark' ? 'light' : 'dark'; root.dataset.theme = next; try { localStorage.setItem('exam-theme', next); } catch (e) {} label(); };
  matchMedia('(prefers-color-scheme: light)').addEventListener?.('change', label);
  label();
}
function startClock() {
  const p = n => String(n).padStart(2, '0');
  const f = () => { const d = new Date(); $('clock').textContent = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; };
  f(); setInterval(f, 1000);
}

document.addEventListener('click', e => {
  if (e.target.closest('a')) return;
  const t = e.target.closest('.tile, .dv-row, .rt-row'); if (t) openDetail(t.dataset.id);
});
document.addEventListener('keydown', e => {
  const t = e.target.closest?.('.tile'); if (t && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openDetail(t.dataset.id); }
});

(async function init() {
  initTheme();
  let meta;
  try {
    const [idxRes, sum, sched] = await Promise.all([fetch('../data/v1/index.json', {cache: 'no-store'}).then(r => r.json()), API.summary(), API.schedule()]);
    meta = idxRes; IDX = idxRes.data; SUM = sum; SCHED = sched;
  } catch (err) {
    $('cats').innerHTML = `<p class="missing">데이터를 읽지 못했습니다(${esc(err.message)}). python work/build_v1.py 로 data/v1 을 만들었는지, 로컬 서버로 열었는지 확인하세요.</p>`; return;
  }
  if (IDX.site?.name) { document.querySelector('.brand span').textContent = IDX.site.name; document.title = IDX.site.name; }
  startClock(); renderMeta(meta.generatedAt); renderTicker(); renderCountdown(); renderIssue();
  if (SINGLE()) document.body.classList.add('single');
  else { renderRates(); renderCats(); renderSchedule(); renderDiverge(); startSpot(); }
  addEventListener('hashchange', route);
  route();
})();
