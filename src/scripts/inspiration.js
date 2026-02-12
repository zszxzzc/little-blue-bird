// inspiration.js - 灵感炼金术
(function() {
  const { invoke } = window.__TAURI__.core;
  const { listen } = window.__TAURI__.event;

  let selectedTags = [];
  let selectedNoteIds = new Set();
  let allNotes = [];

  // 页面激活时加载 + 重置炼金结果
  window.addEventListener('page-change', (e) => {
    if (e.detail === 'inspiration') {
      loadNotes();
      resetAlchemyResult();
    }
  });

  function resetAlchemyResult() {
    const resultDiv = document.getElementById('alchemyResult');
    if (resultDiv) resultDiv.style.display = 'none';
  }

  // 标签切换
  document.querySelectorAll('.tag-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.classList.toggle('active');
      const tag = btn.dataset.tag;
      if (selectedTags.includes(tag)) {
        selectedTags = selectedTags.filter(t => t !== tag);
      } else {
        selectedTags.push(tag);
      }
    });
  });

  // 添加灵感
  document.getElementById('addInspirationBtn')?.addEventListener('click', async () => {
    const input = document.getElementById('inspirationInput');
    const text = input.value.trim();
    if (!text) return;
    try {
      await invoke('add_inspiration', { text, tags: [...selectedTags], mood: '默认' });
      input.value = '';
      selectedTags = [];
      document.querySelectorAll('.tag-btn').forEach(b => b.classList.remove('active'));
      loadNotes();
    } catch(e) { console.error(e); }
  });

  async function loadNotes() {
    try {
      allNotes = await invoke('get_inspiration_notes');
      renderNotes();
      document.getElementById('inspirationCount').textContent = `${allNotes.length} 条灵感`;

      const recipes = await invoke('get_alchemy_recipes');
      renderRecipes(recipes);
    } catch(e) { console.error(e); }
  }

  function renderNotes() {
    const list = document.getElementById('inspirationList');
    if (allNotes.length === 0) {
      list.innerHTML = '<div class="empty-hint">还没有灵感，随时记录你的想法</div>';
      return;
    }
    list.innerHTML = allNotes.slice().reverse().map(n => `
      <div class="inspiration-item ${selectedNoteIds.has(n.id) ? 'selected' : ''}"
           data-id="${n.id}" onclick="window._toggleNote(${n.id})">
        <div>
          <div class="inspiration-item-text">${escapeHtml(n.text)}</div>
          <div class="inspiration-item-meta">
            ${n.tags.map(t => `<span class="tag-btn">${t}</span>`).join(' ')}
            · ${n.created_at.slice(0, 16)}
            ${n.used ? ' · 已使用' : ''}
          </div>
        </div>
        <span class="inspiration-item-delete" onclick="event.stopPropagation();window._deleteNote(${n.id})">×</span>
      </div>
    `).join('');
    updateAlchemyBtn();
  }

  window._toggleNote = function(id) {
    if (selectedNoteIds.has(id)) selectedNoteIds.delete(id);
    else if (selectedNoteIds.size < 5) selectedNoteIds.add(id);
    renderNotes();
  };

  window._deleteNote = async function(id) {
    try {
      await invoke('delete_inspiration', { id });
      selectedNoteIds.delete(id);
      loadNotes();
    } catch(e) { console.error(e); }
  };

  function updateAlchemyBtn() {
    const btn = document.getElementById('alchemyBtn');
    btn.disabled = selectedNoteIds.size < 2;
    btn.textContent = selectedNoteIds.size > 0
      ? `开始炼金（已选 ${selectedNoteIds.size} 条）`
      : '开始炼金';
  }

  // 关闭炼金结果
  document.getElementById('alchemyCloseBtn')?.addEventListener('click', resetAlchemyResult);
  document.getElementById('alchemyBtn')?.addEventListener('click', async () => {
    const ids = [...selectedNoteIds];
    const resultDiv = document.getElementById('alchemyResult');
    const titleEl = document.getElementById('alchemyTitle');
    const textEl = document.getElementById('alchemyText');
    resultDiv.style.display = '';
    titleEl.textContent = '炼金中…';
    textEl.textContent = '';

    let fullText = '';
    const unlisten = await listen('ai-chunk', (e) => {
      fullText += e.payload;
      textEl.textContent = fullText;
    });
    const unlistenDone = await listen('ai-done', () => {
      unlisten(); unlistenDone();
      // 解析标题（第一行）
      const lines = fullText.split('\n');
      const title = lines[0].replace(/^#+\s*/, '').trim();
      const body = lines.slice(1).join('\n').trim();
      titleEl.textContent = title || '炼金结果';
      textEl.textContent = body || fullText;
      selectedNoteIds.clear();
      renderNotes();
    });

    try {
      await invoke('alchemy_synthesize', { note_ids: ids });
    } catch(err) {
      titleEl.textContent = '炼金失败';
      textEl.textContent = err;
      unlisten(); unlistenDone();
    }
  });

  function renderRecipes(recipes) {
    const section = document.getElementById('recipeSection');
    const list = document.getElementById('recipeList');
    if (!recipes || recipes.length === 0) { section.style.display = 'none'; return; }
    section.style.display = '';
    list.innerHTML = recipes.slice().reverse().map(r => `
      <div class="recipe-item" onclick="this.querySelector('.recipe-item-body').style.display=this.querySelector('.recipe-item-body').style.display==='none'?'':'none'">
        <div class="recipe-item-title">${escapeHtml(r.title)}</div>
        <div class="recipe-item-date">${r.created_at.slice(0, 16)}</div>
        <div class="recipe-item-body" style="display:none;margin-top:8px;font-size:13px;line-height:1.6;white-space:pre-wrap">${escapeHtml(r.result)}</div>
      </div>
    `).join('');
  }

  function escapeHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
})();
