const TOKEN_KEY = 'huajian-admin-token';
const dims = [
  ['connection', '联结', '独处', '联结'], ['structure', '结构', '自发', '秩序'],
  ['affect', '情感', '克制', '强烈'], ['exploration', '探索', '熟悉', '探索'], ['imagination', '想象', '现实', '想象'],
];
const ui = { token: sessionStorage.getItem(TOKEN_KEY) || 'local-art-admin', artworks: [], selected: null, query: '', currentVersion: '', analytics: null, versions: null };
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const request = async (url, body, method = 'GET') => {
  const response = await fetch(url, { method, headers: { 'X-Admin-Token': ui.token, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '请求失败');
  return data;
};
function message(text) {
  const target = document.querySelector('#admin-toast');
  target.textContent = text; target.classList.add('visible'); clearTimeout(message.timer);
  message.timer = setTimeout(() => target.classList.remove('visible'), 2600);
}
function stats() {
  const pending = ui.artworks.filter(a => a.review_status === 'pending_human_review').length;
  return `<div class="stats-strip"><div><span>当前版本</span><strong>${esc(ui.currentVersion)}</strong></div><div><span>作品锚点</span><strong>${ui.artworks.filter(a => a.status === 'active').length}<i> / 32</i></strong></div><div><span>待人工复核</span><strong>${pending}</strong></div><div><span>已完成测试</span><strong>${ui.analytics?.completed ?? '—'}</strong></div></div>`;
}
function visibleArtworks() {
  const q = ui.query.trim().toLowerCase();
  return ui.artworks.filter(a => !q || `${a.type_id} ${a.name_cn} ${a.artist_cn} ${a.artist_en} ${a.archetype_name}`.toLowerCase().includes(q));
}
function sidebar() {
  return `<aside class="catalog-sidebar"><div class="sidebar-title"><span>V0.6 · 锚点目录</span><button id="export-json" class="quiet-button">导出 JSON ↗</button></div><label class="search"><span aria-hidden="true">⌕</span><input id="search-artworks" type="search" value="${esc(ui.query)}" placeholder="搜索作品、作者或类型" aria-label="搜索作品、作者或类型"></label><div class="catalog-list">${visibleArtworks().map(a => `<button class="catalog-row ${ui.selected === a.artwork_id ? 'active' : ''}" data-artwork="${esc(a.artwork_id)}"><span class="catalog-id">${esc(a.type_id)}</span><span class="catalog-row-copy"><strong>${esc(a.name_cn)}</strong><small>${esc(a.archetype_name)}</small></span><span class="review-dot ${a.review_status === 'reviewed' ? 'approved' : ''}" aria-label="${a.review_status === 'reviewed' ? '已复核' : '待复核'}"></span></button>`).join('')}</div><div class="sidebar-import"><span>替换或补充内容</span><label class="button-quiet" for="json-file">导入标准化 JSON <b>↗</b></label><input id="json-file" type="file" accept=".json,application/json" hidden><small>字段结构见 database/artworks.json</small></div></aside>`;
}
function editor(artwork) {
  if (!artwork) return `<div class="empty-editor"><span class="empty-seal">32</span><p class="eyebrow">作品资料</p><h2>选择一幅画，<br>查看它的标注。</h2><p>每个类型有一幅锚点作品。发布前可补全图片来源并复核五维标注。</p></div>`;
  return `<form id="artwork-form" data-id="${esc(artwork.artwork_id)}">
    <div class="editor-head"><div><p class="eyebrow">${esc(artwork.type_id)} · ${esc(artwork.type_code || '')}</p><h2>${esc(artwork.archetype_name)}</h2></div><label class="status-select"><span>发布状态</span><select name="status"><option value="active" ${artwork.status === 'active' ? 'selected' : ''}>可匹配</option><option value="draft" ${artwork.status === 'draft' ? 'selected' : ''}>草稿</option><option value="archived" ${artwork.status === 'archived' ? 'selected' : ''}>归档</option></select></label></div>
    <div class="review-banner ${artwork.review_status === 'reviewed' ? 'reviewed' : ''}"><span class="review-symbol">${artwork.review_status === 'reviewed' ? '✓' : '!'}</span><div><strong>${artwork.review_status === 'reviewed' ? '已完成人工复核' : '这条作品标注还未完成人工复核'}</strong><small>来自 JSON 的复核状态：${esc(artwork.review_status || 'pending_human_review')}</small></div><select name="review_status" aria-label="设置人工复核状态"><option value="pending_human_review" ${artwork.review_status === 'pending_human_review' ? 'selected' : ''}>待复核</option><option value="reviewed" ${artwork.review_status === 'reviewed' ? 'selected' : ''}>已复核</option><option value="needs_revision" ${artwork.review_status === 'needs_revision' ? 'selected' : ''}>需要修改</option></select></div>
    <div class="form-grid"><label class="wide"><span>作品名</span><input name="name_cn" value="${esc(artwork.name_cn)}" required></label><label><span>艺术家（中文）</span><input name="artist_cn" value="${esc(artwork.artist_cn)}"></label><label><span>艺术家（原文）</span><input name="artist_en" value="${esc(artwork.artist_en)}"></label><label><span>年代</span><input name="year" value="${esc(artwork.year)}"></label><label><span>文化 / 流派</span><input name="culture_and_style" value="${esc(artwork.culture_and_style)}"></label>
      <label class="wide"><span>图像 URL</span><input name="image_url" type="url" value="${esc(artwork.image_url)}" placeholder="补入获准使用的作品图地址"></label><label class="wide"><span>图像来源页面</span><input name="image_source" type="url" value="${esc(artwork.image_source)}" placeholder="作品馆藏或 Wikimedia Commons 文件页"></label><label class="wide"><span>版权状态</span><input name="copyright_status" value="${esc(artwork.copyright_status)}"></label>
      <label class="wide"><span>Hit Line</span><textarea name="hit_line" rows="2" required>${esc(artwork.hit_line)}</textarea></label><label class="wide"><span>人生叙事</span><textarea name="life_narrative" rows="4" required>${esc(artwork.life_narrative)}</textarea></label><label class="wide"><span>为什么是这幅画</span><textarea name="why_this_artwork" rows="4" required>${esc(artwork.why_this_artwork)}</textarea></label><label class="wide"><span>作品背景</span><textarea name="art_context" rows="3">${esc(artwork.art_context)}</textarea></label><label class="wide"><span>关键词 · 用逗号分隔</span><input name="keywords" value="${esc((artwork.keywords || []).join('，'))}"></label></div>
    <div class="vector-heading"><div><p class="eyebrow">ARTWORK VECTOR</p><h3>五维连续评分</h3></div><p>0–100 · 解释性标注</p></div><div class="vector-grid">${dims.map(([key, name, low, high]) => `<label class="vector-field"><span>${name}<small>${low} — ${high}</small></span><input type="number" name="dim_${key}" min="0" max="100" step="1" value="${Number(artwork.dimensions[key])}" required></label>`).join('')}</div>
    <div class="form-actions"><span>内容版本 ${esc(artwork.version)}</span><button class="save-button" type="submit">保存本条修改 ↗</button></div>
  </form>`;
}
function render() {
  const active = ui.artworks.find(a => a.artwork_id === ui.selected);
  document.querySelector('#admin-app').innerHTML = `<header class="admin-header"><a href="/" class="back-home"><span>画见</span><i>ART & LIFE</i></a><div class="admin-title"><span>管理工具 / 内容工作台</span><h1>作品与结果叙事</h1></div><div class="token-box"><label for="admin-token">管理口令</label><input id="admin-token" type="password" value="${esc(ui.token)}" autocomplete="current-password"><button id="reload-data" aria-label="重新载入作品管理数据">↻</button></div></header><section class="admin-main">${stats()}<div class="version-bar"><span>已发布作品集快照 <strong>${esc(ui.currentVersion)}</strong></span><span>修改在保存后生效为草稿，发布时生成新版本</span><button id="view-questions" class="question-button">查看冻结题库 <i>25 题</i></button><button id="publish-version">发布新版本 <i>↗</i></button></div><div class="workspace">${sidebar()}<section class="editor-area">${active ? editor(active) : `<div class="editor-notice"><span>V0.6 / 32</span><p>评分与结果叙事来自配套 JSON；锚点与年代来自 V0.6 工作簿。</p><p>所有作品目前标为待人工复核。正式发布前请补齐图像和版权信息，并完成人工审阅。</p><div class="admin-charts">${dims.map(([key,name]) => `<div><span>${name}</span><i>${ui.artworks.filter(a => Number(a.dimensions[key]) >= 50).length} 高 / ${ui.artworks.filter(a => Number(a.dimensions[key]) < 50).length} 低</i></div>`).join('')}</div></div>`}</section></div><section class="metrics-panel"><div><p class="eyebrow">EARLY SIGNALS</p><h2>测试反馈</h2></div><div class="metrics-list"><div><span>完成测试</span><strong>${ui.analytics?.completed ?? '—'}</strong></div><div><span>结果平均分</span><strong>${ui.analytics?.rating_average ?? '—'}<small> / 5</small></strong></div><div><span>已提交反馈</span><strong>${ui.analytics?.rating_count ?? '—'}</strong></div><div><span>结果分享</span><strong>${ui.analytics?.events?.share_click ?? '—'}</strong></div></div><div class="version-list"><span>版本记录</span>${(ui.versions?.artwork_sets || []).slice(0,4).map(v => `<small>${esc(v.version)} · ${new Date(v.created_at).toLocaleString('zh-CN')}</small>`).join('')}</div></section></section>`;
  document.querySelector('#admin-token').addEventListener('change', e => { ui.token = e.target.value; sessionStorage.setItem(TOKEN_KEY, ui.token); });
  document.querySelector('#reload-data').addEventListener('click', () => loadData());
  document.querySelector('#search-artworks').addEventListener('input', e => { ui.query = e.target.value; const pos = e.target.selectionStart; render(); const next = document.querySelector('#search-artworks'); next.focus(); next.setSelectionRange(pos,pos); });
  document.querySelectorAll('[data-artwork]').forEach(button => button.addEventListener('click', () => { ui.selected = button.dataset.artwork; render(); }));
  document.querySelector('#export-json').addEventListener('click', exportJSON);
  document.querySelector('#json-file').addEventListener('change', importJSON);
  document.querySelector('#publish-version').addEventListener('click', publish);
  document.querySelector('#view-questions').addEventListener('click', viewQuestions);
  const form = document.querySelector('#artwork-form');
  if (form) form.addEventListener('submit', saveArtwork);
}
async function viewQuestions() {
  try {
    const set = await request('/api/admin/questions');
    const dialog = document.createElement('dialog');
    dialog.className = 'questions-dialog';
    dialog.innerHTML = `<div class="dialog-head"><div><p class="eyebrow">${esc(set.version)} · ${esc(set.order_version)}</p><h2>已冻结的 25 道正式题</h2></div><button class="dialog-close" aria-label="关闭题库">×</button></div><p class="dialog-note">当前题目与选项由产品需求固定；管理页以只读方式展示题干、选项和计分映射。</p><div class="question-admin-list">${set.questions.map(q => `<article><div><span>${esc(q.id)}</span><strong>${esc(q.dimension)}</strong></div><h3>${esc(q.stem)}</h3><ol type="A">${q.options.map(option => `<li><span>${esc(option.text)}</span><small>${q.score_map[option.id]}</small></li>`).join('')}</ol></article>`).join('')}</div>`;
    document.body.append(dialog);
    dialog.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => dialog.remove());
    dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
    dialog.showModal();
  } catch (error) { message(`无法载入题库：${error.message}`); }
}
async function loadData() {
  try {
    const [data, analytics, versions] = await Promise.all([request('/api/admin/artworks'), request('/api/admin/analytics'), request('/api/admin/versions')]);
    ui.artworks = data.artworks; ui.currentVersion = data.current_version; ui.analytics = analytics; ui.versions = versions;
    if (!ui.selected || !ui.artworks.some(a => a.artwork_id === ui.selected)) ui.selected = ui.artworks[0]?.artwork_id || null;
    render();
  } catch (error) {
    document.querySelector('#admin-app').innerHTML = `<section class="access-error"><a href="/" class="back-home"><span>画见</span><i>ART & LIFE</i></a><p class="eyebrow">管理工具</p><h1>连接作品目录</h1><p>${esc(error.message)}</p><label for="admin-token-retry">管理口令</label><div class="access-row"><input id="admin-token-retry" type="password" value="${esc(ui.token)}" autocomplete="current-password"><button id="retry-load">载入作品</button></div><small>本地默认口令为 local-art-admin；部署环境请设置 ART_ADMIN_TOKEN。</small></section>`;
    document.querySelector('#retry-load').addEventListener('click', () => { ui.token = document.querySelector('#admin-token-retry').value; sessionStorage.setItem(TOKEN_KEY, ui.token); loadData(); });
  }
}
function exportJSON() {
  const contents = JSON.stringify(ui.artworks, null, 2);
  const blob = new Blob([contents], { type: 'application/json' });
  const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'artworks.json' });
  link.click(); URL.revokeObjectURL(link.href);
}
async function importJSON(event) {
  const file = event.target.files?.[0]; if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    const artworks = Array.isArray(parsed) ? parsed : parsed.artworks;
    if (!Array.isArray(artworks) || !artworks.length) throw new Error('文件里没有作品数组。');
    const result = await request('/api/admin/artworks/import', { artworks }, 'POST');
    message(`已导入 ${result.imported} 条作品，请检查后发布新版本。`);
    await loadData();
  } catch (error) { message(`导入失败：${error.message}`); }
  event.target.value = '';
}
async function saveArtwork(event) {
  event.preventDefault();
  const form = event.currentTarget; const original = ui.artworks.find(a => a.artwork_id === form.dataset.id);
  const data = Object.fromEntries(new FormData(form).entries());
  const artwork = { ...original, ...data, keywords: data.keywords.split(/[，,]/).map(s => s.trim()).filter(Boolean), dimensions: Object.fromEntries(dims.map(([key]) => [key, Number(data[`dim_${key}`])])), version: 'A_V0.6+draft' };
  delete artwork.dim_connection; delete artwork.dim_structure; delete artwork.dim_affect; delete artwork.dim_exploration; delete artwork.dim_imagination;
  try {
    await request('/api/admin/artworks/save', artwork, 'POST');
    message('本条内容已保存；完成复核后发布新版本。');
    await loadData();
  } catch (error) { message(`保存失败：${error.message}`); }
}
async function publish() {
  if (!confirm('将当前所有“可匹配”作品发布为新版本？历史测试仍会保留旧版作品快照。')) return;
  try {
    const result = await request('/api/admin/publish', {}, 'POST');
    message(`已发布 ${result.published}，共 ${result.active_count} 幅作品。`);
    await loadData();
  } catch (error) { message(`发布失败：${error.message}`); }
}
loadData();
