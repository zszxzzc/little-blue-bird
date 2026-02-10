// === 活动监测页 ===
const toggleBtn = document.getElementById('toggleBtn');
const statusDot = document.getElementById('statusDot');
const statusLabel = document.getElementById('statusLabel');
const navStatusDot = document.getElementById('navStatusDot');
const entryCountEl = document.getElementById('entryCount');
const totalDurationEl = document.getElementById('totalDuration');
const activityListEl = document.getElementById('activityList');
const statusBarLeft = document.getElementById('statusBarLeft');

let monitoring = false;
let entries = [];

toggleBtn.addEventListener('click', async () => {
  if (monitoring) {
    await invoke('stop_monitor');
    setMonitorUI(false);
  } else {
    await invoke('start_monitor');
    setMonitorUI(true);
  }
});

function setMonitorUI(running) {
  monitoring = running;
  statusDot.classList.toggle('running', running);
  statusLabel.classList.toggle('running', running);
  statusLabel.textContent = running ? '监测中' : '未运行';
  toggleBtn.textContent = running ? '停止监测' : '开始监测';
  navStatusDot.classList.toggle('running', running);
  updateStatusBar();
}

function updateStatusBar() {
  statusBarLeft.textContent = monitoring
    ? `监测中 · ${entries.length} 条记录`
    : '未启动监测';
}

function updateStats() {
  entryCountEl.textContent = entries.length;
  const total = entries.reduce((s, e) => s + (e.duration || 0), 0);
  totalDurationEl.textContent = fmtDuration(total);
}

function renderActivityList() {
  if (entries.length === 0) {
    activityListEl.innerHTML = '<div class="empty-hint">暂无活动记录</div>';
    return;
  }
  const recent = entries.slice(-20).reverse();
  activityListEl.innerHTML = recent.map(e => {
    const ts = (e.ts || '').slice(-8, -3);
    let title = e.title || '';
    if (title.length > 35) title = title.slice(0, 33) + '…';
    const dur = fmtDuration(e.duration || 0);
    return `<div class="activity-item">
      <span class="activity-time">${ts}</span>
      <span class="activity-title">${escapeHtml(title)}</span>
      <span class="activity-dur">${dur}</span>
    </div>`;
  }).join('');
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// 加载今日活动
async function loadTodayActivity() {
  try {
    entries = await invoke('get_today_activity');
    updateStats();
    renderActivityList();
    updateStatusBar();
  } catch (e) {
    console.error('load activity:', e);
  }
}

// 监听实时活动事件
listen('new-activity-entry', (event) => {
  entries.push(event.payload);
  updateStats();
  renderActivityList();
  updateStatusBar();
});

// 初始化
loadTodayActivity();
