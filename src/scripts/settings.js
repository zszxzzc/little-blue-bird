// === 设置页 ===
const apiKeyInput = document.getElementById('apiKeyInput');
const langSelect = document.getElementById('langSelect');
const dataDirInput = document.getElementById('dataDirInput');
const browseDirBtn = document.getElementById('browseDirBtn');
const intervalInput = document.getElementById('intervalInput');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const settingsStatus = document.getElementById('settingsStatus');

// 加载配置
async function loadSettings() {
  try {
    const cfg = await invoke('get_config');
    apiKeyInput.value = cfg.api_key || '';
    langSelect.value = cfg.language || 'bilingual';
    dataDirInput.value = cfg.data_dir || '';
    intervalInput.value = cfg.interval || 30;
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
  };
  try {
    await invoke('save_config', { cfg });
    settingsStatus.textContent = '设置已保存 ✓';
  } catch (e) {
    settingsStatus.textContent = '保存失败';
    console.error('save config:', e);
  }
});

// 初始化
loadSettings();
