const STORAGE_KEY = 'huajian-static-sessions-v1';
const ANSWER_KEY = 'huajian-assessment-v1';
const DIMENSIONS = ['connection', 'structure', 'affect', 'exploration', 'imagination'];

const round1 = value => Math.round((value + Number.EPSILON) * 10) / 10;
const readSessions = () => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
  catch { return {}; }
};

export async function createStaticApi() {
  const [questionSet, artworks] = await Promise.all([
    fetch(new URL('../database/questions.json', import.meta.url)).then(response => response.json()),
    fetch(new URL('../database/artworks.json', import.meta.url)).then(response => response.json()),
  ]);
  const sessions = readSessions();
  const saveSessions = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));

  return async function request(url, body = {}, method = 'POST') {
    const path = String(url).split('?')[0];
    if (method === 'GET' && path === '/api/questions') return questionSet;
    if (method === 'GET' && path === '/api/catalog') return { artworks, version: 'A_V0.6' };
    if (path === '/api/event') return { saved: false };
    if (path === '/api/session' && method === 'POST') {
      const saved = JSON.parse(localStorage.getItem(ANSWER_KEY) || '{}');
      const sessionId = body.session_id || crypto.randomUUID();
      sessions[sessionId] ||= {
        answers: saved.sessionId === sessionId ? (saved.answers || {}) : {},
        result: saved.sessionId === sessionId ? (saved.result || null) : null,
        createdAt: Date.now(),
      };
      saveSessions();
      return { session_id: sessionId, user_id: body.user_id || '' };
    }
    if (method === 'GET' && path.startsWith('/api/share/')) {
      const shareId = decodeURIComponent(path.slice('/api/share/'.length));
      const artwork = artworks.find(item => item.artwork_id === shareId && item.status === 'active');
      if (!artwork) throw new Error('这幅画暂时找不到。');
      return { artwork };
    }
    const match = path.match(/^\/api\/session\/([a-zA-Z0-9-]+)\/(answer|complete|rating|share)$/);
    if (!match) throw new Error('静态版本不支持此操作。');
    const [, sessionId, action] = match;
    const session = sessions[sessionId];

    if (action === 'rating') return { saved: true };
    if (action === 'share') return { shared: true };
    if (!session) throw new Error('本机答题进度已失效，请重新开始。');

    if (action === 'answer') {
      const question = questionSet.questions.find(item => item.id === body.question_id);
      if (!question || !Object.hasOwn(question.score_map, body.option_id)) throw new Error('题目或答案无效。');
      session.answers[question.id] = body.option_id;
      saveSessions();
      return { saved: true };
    }

    if (session.result) return session.result;
    const answers = session.answers || {};
    const missing = questionSet.questions.filter(question => !answers[question.id]);
    if (missing.length) throw new Error(`还有 ${missing.length} 个选择未完成。`);

    const raw_scores = Object.fromEntries(DIMENSIONS.map(key => [key, 0]));
    for (const question of questionSet.questions) raw_scores[question.dimension] += question.score_map[answers[question.id]];
    const scores = Object.fromEntries(DIMENSIONS.map(key => [key, round1(raw_scores[key] / 15 * 100)]));
    const bits = DIMENSIONS.map(key => scores[key] >= 50 ? '1' : '0').join('');
    const calculation = { raw_scores, scores, type_id: `T${String(parseInt(bits, 2) + 1).padStart(2, '0')}` };
    const top3 = artworks.filter(item => item.status === 'active').map(artwork => {
      const distance = Math.sqrt(DIMENSIONS.reduce((sum, key) => sum + ((scores[key] - artwork.dimensions[key]) / 100) ** 2, 0) / DIMENSIONS.length);
      return { artwork, distance, similarity: round1((1 - distance) * 100) };
    }).sort((a, b) => a.distance - b.distance || a.artwork.artwork_id.localeCompare(b.artwork.artwork_id)).slice(0, 3);
    if (!top3.length) throw new Error('作品册中暂时没有可匹配的作品。');

    session.result = {
      session_id: sessionId,
      share_id: top3[0].artwork.artwork_id,
      calculation,
      primary: top3[0].artwork,
      top3,
      result_rating: null,
      feedback_text: '',
      artwork_set_version: top3[0].artwork.version || 'A_V0.6',
      completion_time_seconds: Math.max(1, Math.floor((Date.now() - session.createdAt) / 1000)),
    };
    saveSessions();
    return session.result;
  };
}
