import { createStaticApi } from './static-api.js';

const STORAGE_KEY = 'huajian-assessment-v1';
const STATIC_STORAGE_KEY = 'huajian-static-sessions-v1';
const STATIC_MODE = window.HUAJIAN_STATIC_MODE === true || new URLSearchParams(location.search).has('static');
const APP_ROOT = new URL('.', location.href);
const appURL = path => new URL(String(path).replace(/^\/+/, ''), APP_ROOT).href;
const dimensions = [
  ['connection', '联结倾向', '独处', '联结'],
  ['structure', '结构偏好', '自发', '秩序'],
  ['affect', '情感强度', '克制', '强烈'],
  ['exploration', '探索倾向', '熟悉', '探索'],
  ['imagination', '想象倾向', '现实', '想象'],
];
const chapters = [
  { start: 0, end: 7, title: '关于你', copy: '先从一些很普通的选择开始。没有正确答案，只选更像你的那个。' },
  { start: 8, end: 16, title: '关于你与世界', copy: '接下来，是一些关于变化、未知和生活方式的问题。' },
  { start: 17, end: 24, title: '关于你的内心', copy: '最后，留一点时间给那些不太容易被别人看到的部分。' },
];
const state = { route: 'home', phase: 'chapter', questions: [], catalog: {}, answers: {}, index: 0, sessionId: '', userId: '', chapterIndex: 0, result: null, shareView: null, busy: false, rating: 0 };
let staticAPI;

const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeURL = value => {
  if (!value) return '';
  try { const url = new URL(String(value).replace(/^\/+/, ''), APP_ROOT); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; }
  catch { return ''; }
};
const getSaved = () => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; } };
const saveLocal = () => localStorage.setItem(STORAGE_KEY, JSON.stringify({ sessionId: state.sessionId, userId: state.userId, answers: state.answers, index: state.index, result: state.result, updatedAt: Date.now() }));
const api = async (url, body, method = 'POST') => {
  if (STATIC_MODE) {
    staticAPI ||= createStaticApi();
    return (await staticAPI)(url, body, method);
  }
  const response = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error || '请求未完成'), { status: response.status, data });
  return data;
};
const event = (name, extra = {}) => {
  if (STATIC_MODE) return;
  if (!state.sessionId && name !== 'landing_view') return;
  api('/api/event', { event_name: name, session_id: state.sessionId || null, user_id: state.userId || null, ...extra }).catch(() => {});
};
const toast = message => {
  const node = document.querySelector('#toast');
  if (!node) return;
  node.textContent = message;
  node.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => node.classList.remove('show'), 2600);
};
const artworkImage = (artwork, className = '') => {
  const image = safeURL(artwork?.image_url);
  return image
    ? `<a class="artwork-image-link ${className} ${artwork?.image_layout === 'panorama' ? 'panorama-image' : ''}" href="${escapeHTML(image)}" target="_blank" rel="noreferrer" aria-label="${artwork?.image_layout === 'panorama' ? '横向滑动浏览并打开完整长卷：' : '查看完整作品图：'}${escapeHTML(artwork.name_cn)}"><img class="artwork-image" src="${escapeHTML(image)}" alt="${escapeHTML(artwork.name_cn)}" loading="lazy" referrerpolicy="no-referrer">${artwork?.image_layout === 'panorama' ? '<span class="panorama-hint">长卷 · 横向滑动浏览</span>' : ''}</a>`
    : `<div class="art-placeholder ${className}" role="img" aria-label="${escapeHTML(artwork?.name_cn || '作品图片待补')}"><span class="placeholder-kicker">作品图待补</span><span class="placeholder-title">${escapeHTML(artwork?.name_cn || '无题')}</span><span class="placeholder-caption">${escapeHTML(artwork?.artist_cn || artwork?.artist_en || '')}</span></div>`;
};
const header = (right = '') => `<header class="site-header"><a class="wordmark" href="${appURL('')}" aria-label="画见首页"><img src="${appURL('frontend/mark.svg')}" alt="" aria-hidden="true"><span>画见</span><i>ART & LIFE</i></a><nav class="header-nav"><span>探索生活中的艺术气质</span>${right}</nav></header>`;

function renderHome() {
  state.route = 'home';
  const saved = getSaved();
  const progress = state.questions.length ? Object.keys(saved.answers || {}).length : 0;
  const resume = saved.sessionId && saved.answers && progress > 0 && !saved.result;
  document.querySelector('#main').innerHTML = `${header(STATIC_MODE ? '' : `<a class="admin-link" href="${appURL('admin/')}">作品管理 <span aria-hidden="true">↗</span></a>`)}
    <section class="hero container">
      <div class="hero-copy">
        <p class="eyebrow"><span class="eyebrow-mark"></span> 从日常选择出发，找到与你共鸣的画</p>
        <h1>你的人生<br>像哪一幅<span>名画？</span></h1>
        <p class="hero-lede">几个世纪以来，画家把人面对世界的不同方式留在了画布上：有人走向人群，有人独自远行；有人偏爱秩序，有人追逐未知。</p>
        <p class="hero-copy-small">回答一些关于你的选择，我们会从这些作品中，找到最接近你人生气质的那一幅。</p>
        <div class="hero-actions"><button class="button button-primary" id="start">${resume ? '继续寻找我的画' : '开始寻找我的画'}<span aria-hidden="true">↗</span></button><span class="duration">约 5 分钟 <b>·</b> 25 个选择</span></div>
        ${resume ? `<p class="resume-note">已保存 ${progress} 个选择，从上次的位置接着来。</p>` : ''}
        <p class="small-note">这不是艺术知识测试，也不用于诊断或评判；选择没有好坏之分。</p>
        <p class="privacy-note">${STATIC_MODE ? '答题、结果和自愿反馈仅保存在当前设备，不会发送至服务端；清除浏览器数据会删除本机进度。' : '无需填写身份信息。服务会用随机会话编号保存答题记录、结果和自愿反馈，用于恢复进度与改进测试；请勿填写姓名或联系方式。'}</p>
      </div>
      <div class="hero-art" aria-label="梵高《星月夜》作品展示">
        <div class="art-frame"><img src="${appURL('paints/T06.webp')}" alt="文森特·梵高《星月夜》" fetchpriority="high"><span class="frame-veil"></span><span class="frame-index">FIG. 06 <i>·</i> 1889</span></div>
        <div class="art-caption"><a href="https://commons.wikimedia.org/wiki/File:The_Starry_Night.jpg" target="_blank" rel="noreferrer">《星月夜》· 文森特·梵高 · 1889</a><span>WIKIMEDIA COMMONS</span></div>
      </div>
    </section>
    <section class="manifesto container"><span class="manifesto-rule"></span><p>你的选择、情绪、关系和面对世界的方式，<br><em>也许早已以另一种形式出现在某幅画里。</em></p><span class="manifesto-seal">LOOK<br>AGAIN</span></section>
    <footer class="site-footer container"><span>画见 · ART & LIFE</span><span>五种生活倾向，一次寻找</span><span>V0.6 · 内测版本</span></footer>`;
  document.querySelector('#start').addEventListener('click', () => start(saved));
  event('landing_view');
}

async function start(saved) {
  const canResume = saved?.sessionId && saved?.answers && Object.keys(saved.answers).length && !saved.result;
  if (canResume) {
    state.sessionId = saved.sessionId;
    state.userId = saved.userId || crypto.randomUUID();
    state.answers = saved.answers;
    state.index = Math.min(Number(saved.index || 0), 24);
  } else {
    state.sessionId = crypto.randomUUID();
    state.userId = crypto.randomUUID();
    state.answers = {};
    state.index = 0;
    state.result = null;
  }
  try {
    const [questionSet, catalog] = await Promise.all([api('/api/questions', null, 'GET'), api('/api/catalog', null, 'GET')]);
    state.questions = questionSet.questions;
    state.catalog = catalog;
    await api('/api/session', { session_id: state.sessionId, user_id: state.userId });
    saveLocal();
    if (canResume) { state.route = 'quiz'; state.phase = 'question'; openQuestion(state.index); }
    else { state.route = 'chapter'; state.phase = 'chapter'; state.chapterIndex = 0; renderChapter(); }
  } catch (error) {
    toast(`暂时无法连接测试服务：${error.message}`);
  }
}

function chapterFor(index) { return chapters.findIndex(chapter => index >= chapter.start && index <= chapter.end); }
function renderChapter() {
  state.route = 'chapter';
  const chapter = chapters[state.chapterIndex];
  document.querySelector('#main').innerHTML = `${header('<button class="text-button" id="exit">退出答题</button>')}
    <section class="chapter-screen container"><div class="chapter-number">0${state.chapterIndex + 1}<span> / 03</span></div><div class="chapter-content"><p class="eyebrow">接下来</p><h1>${escapeHTML(chapter.title)}</h1><p>${escapeHTML(chapter.copy)}</p><button class="button button-primary" id="chapter-continue">继续 <span aria-hidden="true">↗</span></button></div><div class="chapter-foot"><span>每一题只选更像你的那个</span><span>无需思考正确答案</span></div></section>`;
  document.querySelector('#chapter-continue').addEventListener('click', () => {
    if (state.chapterIndex > 0) event('chapter_complete', { metadata: { chapter: state.chapterIndex } });
    state.index = chapter.start;
    openQuestion(state.index);
  });
  document.querySelector('#exit').addEventListener('click', renderHome);
}

function openQuestion(index) {
  state.route = 'quiz'; state.phase = 'question'; state.index = index;
  const question = state.questions[index];
  const chapterIndex = chapterFor(index);
  const chapter = chapters[chapterIndex];
  const percent = ((index + 1) / state.questions.length) * 100;
  const chosen = state.answers[question.id];
  document.querySelector('#main').innerHTML = `${header('<button class="text-button" id="exit">退出答题</button>')}
    <section class="quiz-shell container">
      <div class="quiz-top"><button class="back-button" id="back" aria-label="返回上一题" ${index === 0 ? 'disabled' : ''}><span aria-hidden="true">←</span> 上一题</button><span class="chapter-label">${escapeHTML(chapter.title)}</span><span class="question-count">${String(index + 1).padStart(2, '0')} <i>/</i> 25</span></div>
      <div class="progress-track" role="progressbar" aria-label="答题进度" aria-valuemin="1" aria-valuemax="25" aria-valuenow="${index + 1}"><span style="width:${percent}%"></span></div>
      <div class="question-area" key="${question.id}"><p class="question-index">第 ${String(index + 1).padStart(2, '0')} 个选择</p><h1>${escapeHTML(question.stem)}</h1><p class="choose-hint">请选择更接近你的那个</p>
        <div class="answer-list" role="group" aria-label="回答选项">${question.options.map((option, i) => `<button class="answer-option ${chosen === option.id ? 'selected' : ''}" data-option="${option.id}" aria-pressed="${chosen === option.id}" style="--delay:${i * 45}ms"><span class="answer-letter">${option.id}</span><span class="answer-text">${escapeHTML(option.text)}</span><span class="answer-arrow" aria-hidden="true">↗</span></button>`).join('')}</div>
      </div>
      <div class="quiz-bottom"><span>你的回答会自动保存</span><span>不用与任何人比较</span></div>
    </section>`;
  document.querySelector('#exit').addEventListener('click', renderHome);
  document.querySelector('#back').addEventListener('click', backQuestion);
  document.querySelectorAll('.answer-option').forEach(button => button.addEventListener('click', () => choose(question, button.dataset.option)));
  event('question_view', { question_id: question.id });
}

async function choose(question, optionId) {
  if (state.busy) return;
  state.busy = true;
  state.answers[question.id] = optionId;
  saveLocal();
  document.querySelectorAll('.answer-option').forEach(button => {
    const selected = button.dataset.option === optionId;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  try { await api(`/api/session/${state.sessionId}/answer`, { question_id: question.id, option_id: optionId }); }
  catch { toast('答案已在本机保存，稍后会继续同步。'); }
  await new Promise(resolve => setTimeout(resolve, 360));
  const nextIndex = state.index + 1;
  state.busy = false;
  if (nextIndex >= 25) return reveal();
  const nextChapter = chapterFor(nextIndex);
  if (nextChapter !== chapterFor(state.index)) { state.chapterIndex = nextChapter; state.index = nextIndex; saveLocal(); renderChapter(); }
  else { saveLocal(); openQuestion(nextIndex); }
}

function backQuestion() {
  if (state.busy) return;
  if (state.index <= 0) return renderChapter();
  const prior = state.index - 1;
  state.chapterIndex = chapterFor(prior);
  state.index = prior;
  saveLocal();
  event('question_back', { question_id: state.questions[state.index]?.id });
  openQuestion(prior);
}

async function reveal() {
  state.route = 'reveal';
  state.busy = true;
  document.querySelector('#main').innerHTML = `<section class="reveal-screen"><div class="reveal-ring"></div><p class="eyebrow">作品正在靠近</p><h1>我们正在从这些画里，<br>寻找与你最接近的那一幅。</h1><span>让选择停留片刻</span></section>`;
  try {
    // Resend all local answers to cover a dropped connection during the flow.
    for (const question of state.questions) {
      const answer = state.answers[question.id];
      if (answer) await api(`/api/session/${state.sessionId}/answer`, { question_id: question.id, option_id: answer });
    }
    state.result = await api(`/api/session/${state.sessionId}/complete`, {});
    saveLocal();
    await new Promise(resolve => setTimeout(resolve, 1000));
    state.busy = false;
    renderResult();
  } catch (error) {
    state.busy = false;
    document.querySelector('#main').innerHTML = `<section class="reveal-screen error-state"><p class="eyebrow">结果暂未保存</p><h1>${escapeHTML(error.message)}</h1><p>你的 25 个选择仍保存在这台设备上，可以重试。</p><button class="button button-primary" id="retry-result">重试生成结果 <span aria-hidden="true">↗</span></button></section>`;
    document.querySelector('#retry-result').addEventListener('click', reveal);
  }
}

function formatWhy(artwork, scores) {
  const ranges = dimensions.map(([key, label, low, high]) => ({ key, label, edge: scores[key] >= 50 ? high : low, score: scores[key] }));
  const top = [...ranges].sort((a, b) => Math.abs(b.score - 50) - Math.abs(a.score - 50)).slice(0, 2);
  return `<p>在你的回答里，<strong>${top.map(item => `${escapeHTML(item.label)}更靠近「${escapeHTML(item.edge)}」`).join('，')}</strong>更为明显。</p><p>${escapeHTML(artwork.why_this_artwork)}</p>`;
}

function dimensionChart(scores) {
  return `<div class="dimension-list">${dimensions.map(([key, label, low, high]) => `<div class="dimension-row"><div class="dimension-name">${label}</div><div class="dimension-low">${low}</div><div class="dimension-meter" aria-label="${label} ${scores[key]} 分"><span style="left:${scores[key]}%"></span></div><div class="dimension-high">${high}</div><div class="dimension-number">${Number(scores[key]).toFixed(1)}</div></div>`).join('')}</div>`;
}

function renderResult() {
  state.route = 'result';
  const result = state.result;
  const artwork = result.primary;
  if (!artwork) { state.route = 'home'; return renderHome(); }
  const score = result.top3?.[0]?.similarity;
  const savedRating = result.result_rating || state.rating || 0;
  document.querySelector('#main').innerHTML = `${header(STATIC_MODE ? '' : `<a class="admin-link" href="${appURL('admin/')}">作品管理 <span aria-hidden="true">↗</span></a>`)}
    <section class="result-intro container"><p class="eyebrow">在这些人生画面中，最接近你的，是</p><span class="result-overline">YOUR PAINTING · ${escapeHTML(artwork.year || '')}</span></section>
    <section class="result-hero container">
      <div class="result-art-wrap"><div class="result-art-frame">${artworkImage(artwork, 'result-art-image')}<span class="result-art-index">画册藏页 <i>·</i> ${escapeHTML(artwork.year || '')}</span></div><p class="art-credit">${escapeHTML(artwork.artist_cn || artwork.artist_en || '')} <span>${escapeHTML(artwork.year || '')}</span></p></div>
      <div class="result-copy"><p class="archetype-label">你像 <span>${escapeHTML(artwork.archetype_name)}</span></p><h1>${escapeHTML(artwork.name_cn)}</h1><p class="artist-line">${escapeHTML(artwork.artist_en || artwork.artist_cn || '')}</p><blockquote>${escapeHTML(artwork.hit_line)}</blockquote><div class="result-keywords">${(artwork.keywords || []).map(word => `<span>${escapeHTML(word)}</span>`).join('')}</div><p class="match-meta">与这幅画的气质相似度 <strong>${Number(score).toFixed(1)}%</strong><span class="match-disclaimer">这是五维连续分数间的距离换算，不是测验准确率。</span></p></div>
    </section>
    <section class="story-section container"><div class="section-heading"><span>01</span><h2>画里的你</h2></div><div class="story-copy"><p class="story-lede">${escapeHTML(artwork.life_narrative)}</p><div class="why-copy">${formatWhy(artwork, result.calculation.scores)}</div><div class="art-context"><span>作品背景</span><p>${escapeHTML(artwork.art_context || '作品年代与流派资料来自 V0.6 锚点表。')}</p></div></div></section>
    <section class="profile-section"><div class="container profile-inner"><div class="profile-heading"><div class="section-heading"><span>02</span><h2>你的气质侧写</h2></div><p>五种倾向，拼成此刻的你。</p></div>${dimensionChart(result.calculation.scores)}<p class="profile-note">这些倾向没有高低优劣，也不是固定不变的人格标签。</p></div></section>
    <section class="similar-section container"><div class="similar-heading"><div class="section-heading"><span>03</span><h2>还有几幅画，也与你相近</h2></div><p>按五维连续分数的整体距离排序</p></div><div class="similar-grid">${(result.top3 || []).slice(1).map((item, i) => `<article class="similar-card"><div class="similar-art">${artworkImage(item.artwork, '')}<span class="similar-rank">0${i + 2}</span></div><div class="similar-card-copy"><p>${escapeHTML(item.artwork.archetype_name)}</p><h3>${escapeHTML(item.artwork.name_cn)}</h3><span>${escapeHTML(item.artwork.artist_en || item.artwork.artist_cn || '')}</span><b>${Number(item.similarity).toFixed(1)}%</b></div></article>`).join('')}</div></section>
    <section class="feedback-section container"><div class="feedback-copy"><p class="eyebrow">留下一点回声</p><h2>你觉得这幅画像你吗？</h2><p>你的反馈会帮助我们校准作品与气质之间的距离。</p></div><div class="rating-box"><div class="rating-buttons" role="group" aria-label="你觉得匹配结果像你吗？">${[1,2,3,4,5].map(n => `<button class="rating-button ${savedRating >= n ? 'rated' : ''}" aria-label="${n} 分" aria-pressed="${savedRating === n}" data-rating="${n}">★</button>`).join('')}</div><div class="rating-labels"><span>不太像</span><span>很像</span></div><label class="sr-only" for="feedback-text">哪部分最像你？（可选）</label><textarea id="feedback-text" maxlength="500" placeholder="哪部分最像你？（可选）">${escapeHTML(result.feedback_text || '')}</textarea><button class="text-button save-feedback" id="save-rating">保存反馈 <span aria-hidden="true">↗</span></button></div></section>
    <section class="share-section"><div class="container share-inner"><div><p class="eyebrow">把这幅画分享出去</p><h2>也看看他们的人生，<br>像哪一幅画。</h2></div><div class="share-output"><div class="share-card" id="share-card"><div class="share-card-art">${artworkImage(artwork, '')}</div><div class="share-card-copy"><span>我的人生像</span><strong>${escapeHTML(artwork.name_cn)}</strong><p>${escapeHTML(artwork.hit_line)}</p><i>画见 · 发现与你共鸣的名画</i></div></div><button class="text-button" id="download-card">下载结果卡 PNG <span aria-hidden="true">↓</span></button></div><button class="button button-light" id="share">分享我的结果 <span aria-hidden="true">↗</span></button></div></section>
    <footer class="site-footer container"><span>画见 · ART & LIFE</span><span>内容版本 ${escapeHTML(result.artwork_set_version || 'A_V0.6')} · 作品向量与版权信息待复核</span><a class="text-button" id="restart" href="${appURL('?restart=1')}">重新寻找 <span aria-hidden="true">↗</span></a></footer>`;
  document.querySelector('#main').querySelectorAll('.rating-button').forEach(button => button.addEventListener('click', () => {
    state.rating = Number(button.dataset.rating);
    document.querySelectorAll('.rating-button').forEach((node, index) => {
      node.classList.toggle('rated', index < state.rating);
      node.setAttribute('aria-pressed', String(index + 1 === state.rating));
    });
  }));
  document.querySelector('#save-rating').addEventListener('click', submitRating);
  document.querySelector('#share').addEventListener('click', shareResult);
  document.querySelector('#download-card').addEventListener('click', downloadShareCard);
  event('result_view');
}

async function submitRating() {
  if (!state.rating) return toast('先选一个分数，再保存反馈。');
  const feedback = document.querySelector('#feedback-text').value.trim();
  try {
    if (!STATIC_MODE) await api(`/api/session/${state.sessionId}/rating`, { rating: state.rating, feedback_text: feedback });
    state.result.result_rating = state.rating;
    state.result.feedback_text = feedback;
    saveLocal();
    toast('谢谢，你的反馈已保存。');
  } catch (error) { toast(`保存失败：${error.message}`); }
}

function wrapCanvasText(context, text, maxWidth) {
  const lines = [];
  let line = '';
  for (const char of String(text)) {
    if (line && context.measureText(line + char).width > maxWidth) { lines.push(line); line = char; }
    else line += char;
  }
  if (line) lines.push(line);
  return lines;
}

async function shareImageBlob() {
  const artwork = state.result.primary;
  const canvas = document.createElement('canvas');
  canvas.width = 1080; canvas.height = 1350;
  const context = canvas.getContext('2d');
  context.fillStyle = '#eee8dc'; context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = '#c9bda8'; context.lineWidth = 2; context.strokeRect(39, 39, 1002, 1272);
  let hasArtworkImage = false;
  if (artwork.image_url) {
    try {
      const image = new Image(); image.crossOrigin = 'anonymous'; image.referrerPolicy = 'no-referrer';
      image.src = safeURL(artwork.image_url);
      await Promise.race([new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; }), new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3200))]);
      const scale = artwork.image_layout === 'panorama'
        ? Math.max(936 / image.naturalWidth, 710 / image.naturalHeight)
        : Math.min(936 / image.naturalWidth, 710 / image.naturalHeight);
      const width = image.naturalWidth * scale, height = image.naturalHeight * scale;
      context.save(); context.beginPath(); context.rect(72, 72, 936, 710); context.clip();
      context.drawImage(image, 72 + (936 - width) / 2, 72 + (710 - height) / 2, width, height); context.restore();
      hasArtworkImage = true;
    } catch { /* A typographic card is still shareable when its image is unavailable. */ }
  }
  if (!hasArtworkImage) {
    const gradient = context.createLinearGradient(72, 72, 1008, 782);
    gradient.addColorStop(0, '#607068'); gradient.addColorStop(.55, '#46574c'); gradient.addColorStop(1, '#33443b');
    context.fillStyle = gradient; context.fillRect(72, 72, 936, 710);
    context.strokeStyle = 'rgba(241,235,223,.32)'; context.lineWidth = 1; context.strokeRect(95, 95, 890, 664);
    context.fillStyle = '#e3c79c'; context.textAlign = 'center'; context.font = '500 22px sans-serif';
    context.fillText('作品图待补', 540, 385);
    context.fillStyle = '#f2ebdd'; context.font = '500 43px serif';
    wrapCanvasText(context, artwork.name_cn, 790).slice(0, 2).forEach((line, index) => context.fillText(line, 540, 459 + index * 59));
  }
  context.textAlign = 'left';
  context.fillStyle = '#a6553b'; context.font = '500 20px sans-serif'; context.fillText('我的人生像', 75, 851);
  context.fillStyle = '#272c27'; context.font = '500 57px serif';
  const titleLines = wrapCanvasText(context, artwork.name_cn, 910).slice(0, 2);
  titleLines.forEach((line, index) => context.fillText(line, 75, 900 + index * 68));
  const artistY = 900 + (titleLines.length - 1) * 68 + 42;
  context.fillStyle = '#777c71'; context.font = '24px serif'; context.fillText(artwork.artist_en || artwork.artist_cn || '', 76, artistY);
  context.fillStyle = '#536057'; context.font = '28px serif';
  const hitLines = wrapCanvasText(context, artwork.hit_line, 915).slice(0, 2);
  const hitY = artistY + 53;
  hitLines.forEach((line, index) => context.fillText(line, 76, hitY + index * 39));
  const footerRuleY = hitY + (hitLines.length - 1) * 39 + 50;
  context.strokeStyle = '#c9bda8'; context.beginPath(); context.moveTo(76, footerRuleY); context.lineTo(1004, footerRuleY); context.stroke();
  const footerY = footerRuleY + 51;
  context.fillStyle = '#354b40'; context.font = '500 22px serif'; context.fillText('画见 · ART & LIFE', 76, footerY);
  context.textAlign = 'right'; context.fillStyle = '#777c71'; context.font = '17px sans-serif'; context.fillText('发现与你共鸣的名画', 1004, footerY);
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('无法生成结果图')), 'image/png'));
}

async function downloadShareCard() {
  try {
    const blob = await shareImageBlob();
    const url = URL.createObjectURL(blob);
    const anchor = Object.assign(document.createElement('a'), { href: url, download: '我的人生像一幅画.png' });
    anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('结果卡 PNG 已保存。');
  } catch (error) { toast(`生成失败：${error.message}`); }
}

async function shareResult() {
  const button = document.querySelector('#share');
  button.disabled = true;
  try {
    const shareId = state.result.share_id;
    const url = new URL(APP_ROOT.href);
    url.searchParams.set('share', shareId);
    await api(`/api/session/${state.sessionId}/share`, {});
    if (navigator.share && navigator.canShare) {
      const blob = await shareImageBlob();
      const file = new File([blob], '我的人生像一幅画.png', { type: 'image/png' });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: `我的人生像${state.result.primary.name_cn}`, text: state.result.primary.hit_line, url: url.href });
      } else {
        await navigator.share({ title: `我的人生像${state.result.primary.name_cn}`, text: state.result.primary.hit_line, url: url.href });
      }
    } else if (navigator.share) {
      await navigator.share({ title: `我的人生像${state.result.primary.name_cn}`, text: state.result.primary.hit_line, url: url.href });
    } else {
      await downloadShareCard();
      await navigator.clipboard.writeText(url.href);
      toast('结果卡已下载，分享链接也已复制。');
    }
    event('share_success');
  } catch (error) {
    if (error.name === 'AbortError') { button.disabled = false; return; }
    toast('分享未完成，请稍后再试。');
  }
  button.disabled = false;
}

async function renderShared(shareId) {
  state.route = 'shared';
  try {
    const shared = await api(`/api/share/${encodeURIComponent(shareId)}`, null, 'GET');
    state.shareView = shared;
    const artwork = shared.artwork;
    document.querySelector('#main').innerHTML = `${header()}<section class="shared-view container"><div class="shared-art">${artworkImage(artwork, '')}</div><div class="shared-copy"><p class="eyebrow">有人把人生分享成了一幅画</p><h1>${escapeHTML(artwork.name_cn)}</h1><p class="shared-artist">${escapeHTML(artwork.artist_en || artwork.artist_cn || '')}</p><blockquote>${escapeHTML(artwork.hit_line)}</blockquote><p class="shared-invite">你的选择、情绪和生活偏好，也许也藏在某幅画里。</p><button class="button button-primary" id="shared-start">开始寻找我的画 <span aria-hidden="true">↗</span></button></div></section>`;
    document.querySelector('#shared-start').addEventListener('click', () => { history.replaceState({}, '', APP_ROOT.pathname); renderHome(); document.querySelector('#start').click(); });
  } catch (error) {
    document.querySelector('#main').innerHTML = `${header()}<section class="shared-view container"><div class="shared-copy"><p class="eyebrow">分享卡片</p><h1>这幅画暂时找不到。</h1><p>${escapeHTML(error.message)}</p><a class="button button-primary" href="${appURL('')}">回到首页</a></div></section>`;
  }
}

async function resumeResult(saved) {
  state.sessionId = saved.sessionId;
  state.userId = saved.userId;
  state.result = saved.result;
  state.rating = saved.result?.result_rating || 0;
  if (!STATIC_MODE) {
    try {
      const fresh = await api(`/api/session/${state.sessionId}/complete`, {});
      state.result = fresh;
      saveLocal();
    } catch { /* Keep the locally saved result available if the service is temporarily offline. */ }
  } else if (state.result?.primary) {
    state.result.share_id = state.result.primary.artwork_id;
  }
  renderResult();
}

async function boot() {
  const params = new URLSearchParams(location.search);
  const restarting = params.has('restart');
  if (restarting) {
    localStorage.removeItem(STORAGE_KEY);
    if (STATIC_MODE) localStorage.removeItem(STATIC_STORAGE_KEY);
    history.replaceState({}, '', APP_ROOT.pathname);
  }
  const shareId = restarting ? null : params.get('share');
  if (shareId) return renderShared(shareId);
  const saved = getSaved();
  if (saved.result && saved.sessionId) { state.questions = (await api('/api/questions', null, 'GET')).questions; return resumeResult(saved); }
  if (saved.sessionId && saved.answers && Object.keys(saved.answers).length) {
    const qset = await api('/api/questions', null, 'GET');
    state.questions = qset.questions;
    state.sessionId = saved.sessionId; state.userId = saved.userId || crypto.randomUUID();
    state.answers = saved.answers; state.index = saved.index || 0;
  }
  renderHome();
}

if (!STATIC_MODE && 'serviceWorker' in navigator && location.protocol.startsWith('http')) {
  if (navigator.serviceWorker.controller) {
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      location.reload();
    });
  }
  navigator.serviceWorker.register(appURL('sw.js')).catch(() => {});
}
boot().catch(error => { document.querySelector('#main').innerHTML = `<section class="shared-view container"><div class="shared-copy"><h1>作品册尚未打开。</h1><p>${escapeHTML(error.message)}</p><p>请从项目中的本地启动脚本打开产品。</p></div></section>`; });
