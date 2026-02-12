// === 设置浮层 ===
const settingsOverlay = document.getElementById('settingsOverlay');
const navSettingsBtn = document.getElementById('navSettingsBtn');
const settingsCloseBtn = document.getElementById('settingsCloseBtn');

navSettingsBtn.addEventListener('click', () => {
  settingsOverlay.classList.add('open');
});

settingsCloseBtn.addEventListener('click', () => {
  settingsOverlay.classList.remove('open');
});

settingsOverlay.addEventListener('click', (e) => {
  if (e.target === settingsOverlay) {
    settingsOverlay.classList.remove('open');
  }
});

// === 设置表单 ===
const apiKeyInput = document.getElementById('apiKeyInput');
const langSelect = document.getElementById('langSelect');
const dataDirInput = document.getElementById('dataDirInput');
const browseDirBtn = document.getElementById('browseDirBtn');
const intervalInput = document.getElementById('intervalInput');
const goalInput = document.getElementById('goalInput');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const settingsStatus = document.getElementById('settingsStatus');
const personalityGrid = document.getElementById('personalityGrid');
const personalityCards = personalityGrid.querySelectorAll('.personality-card');
let selectedPersonality = 'gentle';

// 性格卡片点击
personalityCards.forEach(card => {
  card.addEventListener('click', () => {
    personalityCards.forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    selectedPersonality = card.dataset.personality;
    // 显示/隐藏自定义性格编辑区
    const customEl = document.getElementById('customPersonality');
    if (customEl) customEl.style.display = selectedPersonality === 'custom' ? 'block' : 'none';
  });
});

// === 小鸟尺寸选择 ===
let selectedBirdSize = 'large';
const birdSizeGrid = document.getElementById('birdSizeGrid');
if (birdSizeGrid) {
  birdSizeGrid.querySelectorAll('.bird-size-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      birdSizeGrid.querySelectorAll('.bird-size-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedBirdSize = btn.dataset.size;
    });
  });
}

// === AI 引擎管理 ===
let aiProviders = [];
let activeProviderId = '';
let writingProviderId = '';

function renderProviderList() {
  const list = document.getElementById('providerList');
  if (!list) return;
  if (aiProviders.length === 0) {
    list.innerHTML = '<div class="empty-hint">暂无 AI 接口</div>';
  } else {
    list.innerHTML = aiProviders.map((p, i) => `
      <div class="provider-card ${p.enabled ? 'active-provider' : ''}" data-idx="${i}">
        <div class="provider-card-header">
          <span class="provider-card-name">${p.name || p.id}</span>
          <div class="provider-card-actions">
            <button class="provider-test-btn" data-idx="${i}">测试</button>
            <button class="provider-delete-btn" data-idx="${i}">×</button>
          </div>
        </div>
        <div class="provider-card-row">
          <label>API Key</label>
          <input type="password" class="field-input provider-apikey" data-idx="${i}" value="${p.api_key || ''}" placeholder="sk-...">
        </div>
        <div class="provider-card-row">
          <label>Base URL</label>
          <input type="text" class="field-input provider-baseurl" data-idx="${i}" value="${p.base_url || ''}" placeholder="https://api.deepseek.com/v1">
        </div>
        <div class="provider-card-row">
          <label>Model</label>
          <input type="text" class="field-input provider-model" data-idx="${i}" value="${p.model || ''}" placeholder="deepseek-chat">
        </div>
      </div>
    `).join('');

    // 绑定测试按钮
    list.querySelectorAll('.provider-test-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const idx = parseInt(btn.dataset.idx);
        syncProviderFromUI(idx);
        btn.textContent = '测试中...';
        btn.className = 'provider-test-btn';
        try {
          await invoke('test_ai_provider', { provider: aiProviders[idx] });
          btn.textContent = '成功';
          btn.classList.add('success');
        } catch(e) {
          btn.textContent = '失败';
          btn.classList.add('fail');
        }
        setTimeout(() => { btn.textContent = '测试'; btn.className = 'provider-test-btn'; }, 3000);
      });
    });

    // 绑定删除按钮
    list.querySelectorAll('.provider-delete-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx);
        if (confirm('确定删除此接口？')) {
          aiProviders.splice(idx, 1);
          renderProviderList();
          renderProviderSelects();
        }
      });
    });

    // 输入变化时同步
    list.querySelectorAll('.field-input').forEach(input => {
      input.addEventListener('change', () => {
        const idx = parseInt(input.dataset.idx);
        syncProviderFromUI(idx);
      });
    });
  }
}

function syncProviderFromUI(idx) {
  const list = document.getElementById('providerList');
  if (!list || !aiProviders[idx]) return;
  const card = list.querySelector(`.provider-card[data-idx="${idx}"]`);
  if (!card) return;
  const apikey = card.querySelector('.provider-apikey');
  const baseurl = card.querySelector('.provider-baseurl');
  const model = card.querySelector('.provider-model');
  if (apikey) aiProviders[idx].api_key = apikey.value;
  if (baseurl) aiProviders[idx].base_url = baseurl.value;
  if (model) aiProviders[idx].model = model.value;
}

function renderProviderSelects() {
  const activeSelect = document.getElementById('activeProviderSelect');
  const writingSelect = document.getElementById('writingProviderSelect');
  const options = aiProviders.map(p => `<option value="${p.id}">${p.name || p.id}</option>`).join('');
  if (activeSelect) { activeSelect.innerHTML = options; activeSelect.value = activeProviderId; }
  if (writingSelect) { writingSelect.innerHTML = options; writingSelect.value = writingProviderId; }
}

const addProviderBtn = document.getElementById('addProviderBtn');
if (addProviderBtn) {
  addProviderBtn.addEventListener('click', () => {
    const name = prompt('接口名称：');
    if (!name || !name.trim()) return;
    const id = 'custom-' + Date.now();
    aiProviders.push({
      id, name: name.trim(), api_key: '', base_url: '', model: '',
      temperature: 0.7, enabled: true,
    });
    renderProviderList();
    renderProviderSelects();
  });
}

// 加载配置
async function loadSettings() {
  try {
    const cfg = await invoke('get_config');
    apiKeyInput.value = cfg.api_key || '';
    langSelect.value = cfg.language || 'bilingual';
    dataDirInput.value = cfg.data_dir || '';
    intervalInput.value = cfg.interval || 30;
    goalInput.value = cfg.daily_goal_minutes || 0;
    // 加载性格
    selectedPersonality = cfg.personality || 'gentle';
    personalityCards.forEach(c => {
      c.classList.toggle('selected', c.dataset.personality === selectedPersonality);
    });
    // 自定义性格编辑区
    const customEl = document.getElementById('customPersonality');
    if (customEl) customEl.style.display = selectedPersonality === 'custom' ? 'block' : 'none';
    if (cfg.custom_personality) {
      const cp = cfg.custom_personality;
      const nameEl = document.getElementById('customPersonalityName');
      const descEl = document.getElementById('customPersonalityDesc');
      const catchEl = document.getElementById('customPersonalityCatchphrase');
      const freqEl = document.getElementById('customSpeechFreq');
      const toneEl = document.getElementById('customTone');
      if (nameEl) nameEl.value = cp.name || '';
      if (descEl) descEl.value = cp.description || '';
      if (catchEl) catchEl.value = cp.catchphrase || '';
      if (freqEl) freqEl.value = cp.speech_frequency || 3;
      if (toneEl) toneEl.value = cp.tone || 3;
    }
    // 小鸟尺寸
    selectedBirdSize = cfg.bird_size || 'large';
    if (birdSizeGrid) {
      birdSizeGrid.querySelectorAll('.bird-size-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.size === selectedBirdSize);
      });
    }
    // AI 引擎
    aiProviders = cfg.ai_providers || [];
    activeProviderId = cfg.active_provider || '';
    writingProviderId = cfg.writing_provider || '';
    renderProviderList();
    renderProviderSelects();
  } catch (e) {
    console.error('load config:', e);
  }
}

// 浏览目录
browseDirBtn.addEventListener('click', async () => {
  try {
    const selected = await invoke('browse_directory');
    if (selected) dataDirInput.value = selected;
  } catch (e) {
    console.error('browse dir:', e);
  }
});

// 保存设置
saveSettingsBtn.addEventListener('click', async () => {
  // 同步所有 provider 输入
  aiProviders.forEach((_, i) => syncProviderFromUI(i));

  // 收集自定义性格
  let customPersonality = null;
  if (selectedPersonality === 'custom') {
    customPersonality = {
      name: (document.getElementById('customPersonalityName')?.value || '').trim(),
      description: (document.getElementById('customPersonalityDesc')?.value || '').trim(),
      catchphrase: (document.getElementById('customPersonalityCatchphrase')?.value || '').trim(),
      speech_frequency: parseInt(document.getElementById('customSpeechFreq')?.value) || 3,
      tone: parseInt(document.getElementById('customTone')?.value) || 3,
    };
  }

  const activeSelect = document.getElementById('activeProviderSelect');
  const writingSelect = document.getElementById('writingProviderSelect');

  const cfg = {
    api_key: apiKeyInput.value.trim(),
    language: langSelect.value,
    data_dir: dataDirInput.value.trim(),
    interval: Math.max(5, parseInt(intervalInput.value) || 30),
    daily_goal_minutes: Math.max(0, parseInt(goalInput.value) || 0),
    personality: selectedPersonality,
    bird_size: selectedBirdSize,
    ai_providers: aiProviders,
    active_provider: activeSelect ? activeSelect.value : '',
    writing_provider: writingSelect ? writingSelect.value : '',
  };
  if (customPersonality) cfg.custom_personality = customPersonality;

  try {
    await invoke('save_config', { cfg });
    settingsStatus.textContent = '设置已保存 ✓';
    // 刷新前端性格
    currentPersonality = selectedPersonality;
    if (typeof updateChickMood === 'function') updateChickMood();
  } catch (e) {
    settingsStatus.textContent = '保存失败';
    console.error('save config:', e);
  }
});

// === 深色模式 ===
const themeToggle = document.getElementById('themeToggle');
const themeSwitchLabel = document.getElementById('themeSwitchLabel');

function applyTheme(dark) {
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  themeSwitchLabel.textContent = dark ? '深色' : '浅色';
  themeToggle.checked = dark;
  localStorage.setItem('theme', dark ? 'dark' : 'light');
}

// 初始化主题
applyTheme(localStorage.getItem('theme') === 'dark');

themeToggle.addEventListener('change', () => {
  applyTheme(themeToggle.checked);
});

// 初始化
loadSettings();

// === 梗库弹窗 ===
const memesOverlay = document.getElementById('memesOverlay');
const memesCloseBtn = document.getElementById('memesCloseBtn');
const viewMemesBtn = document.getElementById('viewMemesBtn');
const refreshMemesBtn = document.getElementById('refreshMemesBtn');
const memesList = document.getElementById('memesList');
const memeAddInput = document.getElementById('memeAddInput');
const memeAddBtn = document.getElementById('memeAddBtn');

viewMemesBtn.addEventListener('click', async () => {
  memesOverlay.classList.add('open');
  await renderMemes();
});

memesCloseBtn.addEventListener('click', () => {
  memesOverlay.classList.remove('open');
});

memesOverlay.addEventListener('click', (e) => {
  if (e.target === memesOverlay) memesOverlay.classList.remove('open');
});

// 手动添加梗
memeAddBtn.addEventListener('click', async () => {
  const text = memeAddInput.value.trim();
  if (!text) return;
  try {
    await invoke('add_meme', { memeText: text });
    memeAddInput.value = '';
    await renderMemes();
  } catch (e) {
    console.error('add meme:', e);
  }
});

memeAddInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') memeAddBtn.click();
});

refreshMemesBtn.addEventListener('click', async () => {
  refreshMemesBtn.disabled = true;
  refreshMemesBtn.textContent = '刷新中…';
  try {
    await invoke('refresh_memes');
    await renderMemes();
  } catch (e) {
    console.error('refresh memes:', e);
  }
  refreshMemesBtn.disabled = false;
  refreshMemesBtn.textContent = '刷新梗库';
});

async function renderMemes() {
  try {
    const memes = await invoke('get_memes');
    if (!memes.length) {
      memesList.innerHTML = '<div class="empty-hint">暂无梗，积累几天数据后刷新试试</div>';
      return;
    }
    memesList.innerHTML = memes.map((m, i) => {
      const text = m.meme_text.replace('{}', m.count);
      return `<div class="meme-item">
        <div class="meme-item-content">
          <div class="meme-item-text">${text}</div>
          <div class="meme-item-meta">最后出现: ${m.last_seen}</div>
        </div>
        <button class="meme-item-del" data-index="${i}" title="删除">✕</button>
      </div>`;
    }).join('');
    // 绑定删除按钮
    memesList.querySelectorAll('.meme-item-del').forEach(btn => {
      btn.addEventListener('click', async () => {
        const idx = parseInt(btn.dataset.index);
        try {
          await invoke('delete_meme', { index: idx });
          await renderMemes();
        } catch (e) {
          console.error('delete meme:', e);
        }
      });
    });
  } catch (e) {
    console.error('load memes:', e);
  }
}
