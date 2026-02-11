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
  statusLabel.textContent = running ? P().monitor.running : P().monitor.stopped;
  toggleBtn.textContent = running ? P().monitor.stop : P().monitor.start;
  navStatusDot.classList.toggle('running', running);
  updateStatusBar();
}

function updateStatusBar() {
  statusBarLeft.textContent = monitoring
    ? P().monitor.status_running(entries.length)
    : P().monitor.status_stopped;
}

function updateStats() {
  entryCountEl.textContent = entries.length;
  const total = entries.reduce((s, e) => s + (e.duration || 0), 0);
  totalDurationEl.textContent = fmtDuration(total);
}

function renderActivityList() {
  if (entries.length === 0) {
    activityListEl.innerHTML = `<div class="empty-hint">${P().monitor.empty}</div>`;
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

// === 数据统计 ===
const dailyChartEl = document.getElementById('dailyChart');
const categoryBarsEl = document.getElementById('categoryBars');
const statsTabs = document.querySelectorAll('.stats-tab');
let statsRange = 7;

const CAT_COLORS = {
  '编程': '#007AFF', '浏览器': '#FF9500', '游戏': '#FF3B30',
  '视频': '#AF52DE', '社交': '#34C759', '文档': '#5AC8FA',
  '音乐': '#FF2D55', '其他': '#8E8E93',
};

statsTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    statsTabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    statsRange = parseInt(tab.dataset.range);
    loadStats();
  });
});

async function loadStats() {
  try {
    const [daily, cats] = await Promise.all([
      invoke('get_daily_totals', { days: statsRange }),
      invoke('get_range_summary', { days: statsRange }),
    ]);
    renderDailyChart(daily);
    renderCategoryBars(cats);
  } catch (e) {
    console.error('load stats:', e);
  }
}

function renderDailyChart(data) {
  if (!data || data.length === 0) {
    dailyChartEl.innerHTML = '<div class="empty-hint">暂无数据</div>';
    return;
  }
  const max = Math.max(...data.map(d => d[1]), 1);
  const today = new Date().toISOString().slice(0, 10);
  dailyChartEl.innerHTML = data.map(([date, sec]) => {
    const h = Math.max(2, (sec / max) * 65);
    const label = date.slice(5); // MM-DD
    const isToday = date === today ? ' today' : '';
    return `<div class="daily-bar-wrap">
      <div class="daily-bar${isToday}" style="height:${h}px" title="${date}: ${fmtDuration(sec)}"></div>
      <span class="daily-bar-label">${label}</span>
    </div>`;
  }).join('');
}

function renderCategoryBars(data) {
  if (!data || data.length === 0) {
    categoryBarsEl.innerHTML = '<div class="empty-hint">暂无分类数据</div>';
    return;
  }
  const max = data[0][1] || 1;
  categoryBarsEl.innerHTML = data.map(([cat, sec]) => {
    const pct = (sec / max) * 100;
    const color = CAT_COLORS[cat] || '#8E8E93';
    return `<div class="cat-row">
      <span class="cat-name">${cat}</span>
      <div class="cat-bar-track"><div class="cat-bar-fill" style="width:${pct}%;background:${color}"></div></div>
      <span class="cat-dur">${fmtDuration(sec)}</span>
    </div>`;
  }).join('');
}

// 初始加载统计
loadStats();

// === AI 周报/月报 ===
const reportOverlay = document.getElementById('reportOverlay');
const reportTitle = document.getElementById('reportTitle');
const reportContent = document.getElementById('reportContent');
const reportCloseBtn = document.getElementById('reportCloseBtn');
const weekReportBtn = document.getElementById('weekReportBtn');
const monthReportBtn = document.getElementById('monthReportBtn');

let reportText = '';

weekReportBtn.addEventListener('click', () => generateReport(7));
monthReportBtn.addEventListener('click', () => generateReport(30));

reportCloseBtn.addEventListener('click', () => {
  reportOverlay.classList.remove('open');
});

reportOverlay.addEventListener('click', (e) => {
  if (e.target === reportOverlay) reportOverlay.classList.remove('open');
});

async function generateReport(days) {
  reportTitle.textContent = days <= 7 ? 'AI 周报' : 'AI 月报';
  reportContent.innerHTML = '<div class="empty-hint">生成中…</div>';
  reportOverlay.classList.add('open');
  reportText = '';

  // 监听流式输出
  const unlisten = await listen('ai-chunk', (event) => {
    reportText += event.payload;
    reportContent.innerHTML = simpleMarkdownReport(reportText);
  });

  try {
    await invoke('ai_report', { days });
  } catch (e) {
    reportContent.innerHTML = `<div class="empty-hint">生成失败: ${e}</div>`;
  }

  unlisten();
}

function simpleMarkdownReport(text) {
  return text
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');
}
