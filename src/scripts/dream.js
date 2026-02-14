/**
 * 梦境日志模块
 */
(function() {
  let dreams = [];
  let selectedMood = '';
  let selectedVividness = 3;

  const moodGradients = {
    '奇妙': 'linear-gradient(135deg, #667eea, #764ba2)',
    '惊恐': 'linear-gradient(135deg, #434343, #8b0000)',
    '伤感': 'linear-gradient(135deg, #89ABE3, #B0C4DE)',
    '困惑': 'linear-gradient(135deg, #F0C27F, #4B1248)',
    '美好': 'linear-gradient(135deg, #f5af19, #f12711)',
    '荒诞': 'linear-gradient(135deg, #11998e, #38ef7d)',
  };

  const moodEmojis = {
    '奇妙': '😊', '惊恐': '😨', '伤感': '😢',
    '困惑': '🤔', '美好': '😍', '荒诞': '🌀',
  };

  // === 初始化 ===
  function init() {
    bindEvents();
    loadDreams();
  }

  function bindEvents() {
    // 情绪选择
    document.getElementById('dreamMoods')?.addEventListener('click', e => {
      const tag = e.target.closest('.mood-tag');
      if (!tag) return;
      const mood = tag.dataset.mood;
      document.querySelectorAll('#dreamMoods .mood-tag').forEach(t => t.classList.remove('active'));
      if (selectedMood === mood) {
        selectedMood = '';
      } else {
        selectedMood = mood;
        tag.classList.add('active');
      }
    });

    // 鲜明度
    document.getElementById('dreamVividness')?.addEventListener('click', e => {
      const dot = e.target.closest('.vividness-dot');
      if (!dot) return;
      selectedVividness = parseInt(dot.dataset.level);
      updateVividnessDots();
    });

    // 保存
    document.getElementById('saveDreamBtn')?.addEventListener('click', saveDream);

    // AI 解梦
    document.getElementById('aiDreamBtn')?.addEventListener('click', aiAnalyze);
    document.getElementById('dreamAiCloseBtn')?.addEventListener('click', () => {
      document.getElementById('dreamAiResult').style.display = 'none';
    });

    // 页面切换时刷新
    document.addEventListener('page-change', e => {
      if (e.detail === 'dream') loadDreams();
    });
  }

  function updateVividnessDots() {
    document.querySelectorAll('#dreamVividness .vividness-dot').forEach(dot => {
      const level = parseInt(dot.dataset.level);
      dot.classList.toggle('active', level <= selectedVividness);
    });
  }

  // === 保存梦境 ===
  async function saveDream() {
    const title = document.getElementById('dreamTitle').value.trim();
    const content = document.getElementById('dreamContent').value.trim();
    if (!title && !content) return;

    const tags = document.getElementById('dreamTags').value
      .split(/[,，]/)
      .map(t => t.trim())
      .filter(Boolean);
    const lucid = document.getElementById('dreamLucid').checked;
    const now = new Date();

    const dream = {
      id: '',
      date: now.toISOString().slice(0, 10),
      time: now.toTimeString().slice(0, 5),
      title: title || '无题之梦',
      content,
      mood: selectedMood || '奇妙',
      tags,
      lucid,
      vividness: selectedVividness,
      ai_analysis: '',
      created_at: now.toISOString(),
    };

    try {
      await invoke('save_dream', { dream });
      clearForm();
      await loadDreams();
    } catch (e) {
      console.error('保存梦境失败:', e);
    }
  }

  function clearForm() {
    document.getElementById('dreamTitle').value = '';
    document.getElementById('dreamContent').value = '';
    document.getElementById('dreamTags').value = '';
    document.getElementById('dreamLucid').checked = false;
    selectedMood = '';
    selectedVividness = 3;
    document.querySelectorAll('#dreamMoods .mood-tag').forEach(t => t.classList.remove('active'));
    updateVividnessDots();
  }

  // === 加载梦境 ===
  async function loadDreams() {
    try {
      dreams = await invoke('load_dreams');
    } catch (e) {
      dreams = [];
    }
    renderList();
    renderGallery();
    renderStats();
    renderTagCloud();
  }

  // === 渲染列表 ===
  function renderList() {
    const container = document.getElementById('dreamList');
    if (!container) return;
    if (dreams.length === 0) {
      container.innerHTML = '<div class="empty-hint">还没有梦境记录，快来记录第一个梦吧</div>';
      return;
    }
    container.innerHTML = dreams.map(d => `
      <div class="dream-item" data-id="${d.id}">
        <div class="dream-item-header">
          <span class="dream-item-date">${d.date}</span>
          <span class="dream-item-title">${escHtml(d.title)}</span>
          <span class="dream-item-mood">${moodEmojis[d.mood] || ''}</span>
          ${d.tags.map(t => `<span class="dream-item-tag">${escHtml(t)}</span>`).join('')}
          <button class="dream-item-del" title="删除">✕</button>
        </div>
        <div class="dream-item-body" style="display:none">
          <p class="dream-item-content">${escHtml(d.content)}</p>
          ${d.lucid ? '<span class="dream-badge">清醒梦</span>' : ''}
          <span class="dream-badge">鲜明度 ${'★'.repeat(d.vividness)}${'☆'.repeat(5 - d.vividness)}</span>
          ${d.ai_analysis ? `<div class="dream-analysis"><strong>AI 解梦：</strong>${escHtml(d.ai_analysis)}</div>` : ''}
        </div>
      </div>
    `).join('');

    // 展开/折叠
    container.querySelectorAll('.dream-item-header').forEach(header => {
      header.addEventListener('click', e => {
        if (e.target.closest('.dream-item-del')) return;
        const body = header.nextElementSibling;
        body.style.display = body.style.display === 'none' ? 'block' : 'none';
      });
    });

    // 删除
    container.querySelectorAll('.dream-item-del').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const id = btn.closest('.dream-item').dataset.id;
        try {
          await invoke('delete_dream', { id });
          await loadDreams();
        } catch (err) {
          console.error('删除梦境失败:', err);
        }
      });
    });
  }

  // === 渲染图鉴卡片 ===
  function renderGallery() {
    const container = document.getElementById('dreamCards');
    if (!container) return;
    if (dreams.length === 0) {
      container.innerHTML = '<div class="empty-hint">记录梦境后这里会出现梦境卡片</div>';
      return;
    }
    container.innerHTML = dreams.map(d => {
      const bg = moodGradients[d.mood] || moodGradients['奇妙'];
      return `
        <div class="dream-card" style="background:${bg}">
          <div class="dream-card-title">${escHtml(d.title)}</div>
          <div class="dream-card-date">${d.date}</div>
          <div class="dream-card-stars">${'★'.repeat(d.vividness)}${'☆'.repeat(5 - d.vividness)}</div>
          <div class="dream-card-tags">${d.tags.map(t => `<span class="dream-card-tag">${escHtml(t)}</span>`).join('')}</div>
        </div>
      `;
    }).join('');
  }

  // === 渲染统计 ===
  function renderStats() {
    const container = document.getElementById('dreamStats');
    if (!container) return;

    const total = dreams.length;
    const now = new Date();
    const thisMonth = now.toISOString().slice(0, 7);
    const monthCount = dreams.filter(d => d.date.startsWith(thisMonth)).length;
    const lucidCount = dreams.filter(d => d.lucid).length;
    const lucidPct = total > 0 ? Math.round(lucidCount / total * 100) : 0;

    // Top3 标签
    const tagCount = {};
    dreams.forEach(d => d.tags.forEach(t => { tagCount[t] = (tagCount[t] || 0) + 1; }));
    const topTags = Object.entries(tagCount).sort((a, b) => b[1] - a[1]).slice(0, 3);

    container.innerHTML = `
      <div class="dream-stat"><span class="dream-stat-val">${total}</span><span class="dream-stat-label">总梦境</span></div>
      <div class="dream-stat"><span class="dream-stat-val">${monthCount}</span><span class="dream-stat-label">本月</span></div>
      <div class="dream-stat"><span class="dream-stat-val">${topTags.map(t => t[0]).join(' ') || '-'}</span><span class="dream-stat-label">热门标签</span></div>
      <div class="dream-stat"><span class="dream-stat-val">${lucidPct}%</span><span class="dream-stat-label">清醒梦</span></div>
    `;
  }

  // === 渲染标签云 ===
  function renderTagCloud() {
    const container = document.getElementById('dreamTagCloud');
    if (!container) return;

    const tagCount = {};
    dreams.forEach(d => d.tags.forEach(t => { tagCount[t] = (tagCount[t] || 0) + 1; }));
    const entries = Object.entries(tagCount);
    if (entries.length === 0) {
      container.innerHTML = '';
      return;
    }
    const maxCount = Math.max(...entries.map(e => e[1]));
    container.innerHTML = entries.map(([tag, count]) => {
      const size = 12 + Math.round((count / maxCount) * 12);
      return `<span class="dream-cloud-tag" style="font-size:${size}px">${escHtml(tag)}</span>`;
    }).join('');
  }

  // === AI 解梦 ===
  async function aiAnalyze() {
    const title = document.getElementById('dreamTitle').value.trim();
    const content = document.getElementById('dreamContent').value.trim();
    if (!content) return;

    const btn = document.getElementById('aiDreamBtn');
    const resultBox = document.getElementById('dreamAiResult');
    const resultText = document.getElementById('dreamAiResultText');
    btn.disabled = true;
    btn.textContent = '解梦中...';
    resultBox.style.display = 'block';
    resultText.textContent = '正在解读你的梦境…';

    let fullText = '';
    const chunkHandler = (e) => {
      fullText += e.payload;
      resultText.textContent = fullText;
    };
    const { listen } = window.__TAURI__.event;
    const unlisten = await listen('ai-chunk', chunkHandler);

    try {
      const result = await invoke('ai_dream_analysis', {
        title: title || '无题',
        content,
        mood: selectedMood || '奇妙',
        lucid: document.getElementById('dreamLucid').checked,
      });

      // 最终结果覆盖（防止 chunk 丢失）
      resultText.textContent = result || fullText;

      // 如果已经保存了梦境，更新最新一条的 analysis
      if (dreams.length > 0) {
        const latest = dreams[0];
        try {
          await invoke('update_dream_analysis', { id: latest.id, analysis: result || fullText });
          await loadDreams();
        } catch (_) {}
      }
    } catch (e) {
      console.error('AI 解梦失败:', e);
      resultText.textContent = '解梦失败：' + (e || '未知错误');
    } finally {
      unlisten();
      btn.disabled = false;
      btn.textContent = '✨ AI 解梦';
    }
  }

  function escHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  // === 启动 ===
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
