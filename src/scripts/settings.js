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
  });
});

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
  const cfg = {
    api_key: apiKeyInput.value.trim(),
    language: langSelect.value,
    data_dir: dataDirInput.value.trim(),
    interval: Math.max(5, parseInt(intervalInput.value) || 30),
    daily_goal_minutes: Math.max(0, parseInt(goalInput.value) || 0),
    personality: selectedPersonality,
  };
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
