// world.js - 桌面世界观
(function() {
  const { invoke } = window.__TAURI__.core;

  // 区域名称映射
  const ZONE_NAMES = {
    library:     ['小书摊', '阅览室', '图书馆', '魔法塔'],
    theater:     ['露天台', '小剧场', '大剧院', '星空剧场'],
    park:        ['草地', '花园', '公园', '森林'],
    cafe:        ['路边摊', '小店', '咖啡馆', '会所'],
    playground:  ['秋千', '滑梯', '游乐场', '主题乐园'],
    diary_house: ['帐篷', '木屋', '小楼', '城堡'],
    dark_cloud:  ['无', '小乌云', '大乌云', '暴风雨']
  };

  const ZONE_ICONS = {
    library: ['📖','📚','🏛️','🏰'],
    theater: ['🎪','🎭','🎬','✨'],
    park: ['🌱','🌷','🌳','🌲'],
    cafe: ['🧋','☕','🍰','🏛️'],
    playground: ['🎮','🕹️','🎠','🎡'],
    diary_house: ['⛺','🏠','🏢','🏰'],
    dark_cloud: ['','🌥️','🌧️','⛈️']
  };

  const LEVEL_THRESHOLDS = [0, 300, 1500, 5000];

  // 页面激活时加载
  window.addEventListener('page-change', (e) => {
    if (e.detail === 'world') loadWorld();
  });

  async function loadWorld() {
    try {
      const state = await invoke('get_world_state');
      renderZones(state);
      renderHistory(state.history);
      document.getElementById('worldDays').textContent = `第 ${state.total_days} 天`;
    } catch (err) {
      console.error('加载世界状态失败:', err);
    }
  }

  function renderZones(state) {
    for (const [zone, data] of Object.entries(state.zones)) {
      const level = data.level;
      const names = ZONE_NAMES[zone];
      const icons = ZONE_ICONS[zone];
      if (!names) continue;

      const levelEl = document.getElementById('zoneLevel' + capitalize(zone));
      const iconEl = document.getElementById('zoneIcon' + capitalize(zone));
      const xpEl = document.getElementById('zoneXp' + capitalize(zone));

      if (levelEl) levelEl.textContent = `Lv.${level} ${names[level - 1]}`;
      if (iconEl) iconEl.textContent = icons[level - 1] || icons[0];

      // XP 进度条：当前等级到下一等级的进度
      if (xpEl) {
        const currentThreshold = LEVEL_THRESHOLDS[level - 1] || 0;
        const nextThreshold = LEVEL_THRESHOLDS[level] || LEVEL_THRESHOLDS[3];
        const progress = level >= 4 ? 100 :
          ((data.xp - currentThreshold) / (nextThreshold - currentThreshold)) * 100;
        xpEl.style.width = Math.min(100, Math.max(0, progress)) + '%';
      }

      // 乌云特殊处理
      if (zone === 'dark_cloud') {
        const el = document.getElementById('darkCloudZone');
        if (el) el.style.display = data.xp > 0 ? '' : 'none';
      }
    }
  }

  function renderHistory(history) {
    const list = document.getElementById('worldHistoryList');
    if (!history || history.length === 0) {
      list.innerHTML = '<div class="empty-hint">暂无数据，开始使用后会自动记录</div>';
      return;
    }
    const zoneLabels = { library:'图书馆', theater:'剧场', park:'公园',
      cafe:'咖啡馆', playground:'游乐场', diary_house:'日记小屋', dark_cloud:'乌云' };

    list.innerHTML = history.slice(-7).reverse().map(day => {
      const parts = Object.entries(day.changes)
        .map(([z, xp]) => `${zoneLabels[z] || z} +${xp}XP`).join('、');
      return `<div class="world-history-item">
        <span class="world-history-date">${day.date}</span>
        <span class="world-history-changes">${parts}</span>
      </div>`;
    }).join('');
  }

  function capitalize(s) {
    // dark_cloud → DarkCloud, library → Library
    return s.split('_').map(w => w[0].toUpperCase() + w.slice(1)).join('');
  }
})();
