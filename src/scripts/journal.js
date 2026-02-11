// === 日记编辑页 ===
const journalEditor = document.getElementById('journalEditor');
const journalStatus = document.getElementById('journalStatus');
const todayBtn = document.getElementById('todayBtn');
const prevWeekBtn = document.getElementById('prevWeek');
const nextWeekBtn = document.getElementById('nextWeek');
const stripMonthEl = document.getElementById('stripMonth');
const dateStripDaysEl = document.getElementById('dateStripDays');
const aiGenBtn = document.getElementById('aiGenBtn');
const organizeBtn = document.getElementById('organizeBtn');
const saveBtn = document.getElementById('saveBtn');
const deleteBtn = document.getElementById('deleteBtn');
const importBtn = document.getElementById('importBtn');
const journalDateListEl = document.getElementById('journalDateList');
const calendarPopup = document.getElementById('calendarPopup');
const calTitle = document.getElementById('calTitle');
const calDays = document.getElementById('calDays');
const calPrevMonth = document.getElementById('calPrevMonth');
const calNextMonth = document.getElementById('calNextMonth');
const previewBtn = document.getElementById('previewBtn');
const journalPreview = document.getElementById('journalPreview');
let calYear, calMonth; // 月历当前显示的年月
let previewMode = false;

// 本地日期格式化（避免 toISOString 的 UTC 时区偏移）
function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getRelativeLabel(dateStr) {
  const today = formatDate(new Date());
  const t = new Date(today);
  const d = new Date(dateStr);
  const diff = Math.round((d - t) / 86400000);
  if (diff === 0) return '今天';
  if (diff === -1) return '昨天';
  if (diff === -2) return '前天';
  if (diff === 1) return '明天';
  return dateStr;
}

let journalDate = formatDate(new Date());
let weekOffset = 0;
let journalDatesSet = new Set();

function getWeekStart(offset) {
  const now = new Date();
  const day = now.getDay();
  const start = new Date(now);
  start.setDate(now.getDate() - day + offset * 7);
  start.setHours(0, 0, 0, 0);
  return start;
}

// 渲染周日历条
function renderDateStrip() {
  const weekStart = getWeekStart(weekOffset);
  const today = formatDate(new Date());

  // 更新月份标题
  const mid = new Date(weekStart);
  mid.setDate(mid.getDate() + 3);
  stripMonthEl.textContent = `${mid.getFullYear()}年${mid.getMonth() + 1}月`;

  // 渲染7天
  let html = '';
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    const ds = formatDate(d);
    const isToday = ds === today;
    const isSelected = ds === journalDate;
    const hasJournal = journalDatesSet.has(ds);

    let cls = 'date-strip-day';
    if (isToday) cls += ' today';
    if (isSelected) cls += ' selected';
    if (hasJournal) cls += ' has-journal';

    html += `<div class="${cls}" data-date="${ds}">
      <span class="day-num">${d.getDate()}</span>
      <span class="day-dot"></span>
    </div>`;
  }
  dateStripDaysEl.innerHTML = html;

  // 绑定点击
  dateStripDaysEl.querySelectorAll('.date-strip-day').forEach(el => {
    el.addEventListener('click', () => {
      journalDate = el.dataset.date;
      renderDateStrip();
      loadJournal();
      updateArchiveActive();
    });
  });
}

// 周导航
prevWeekBtn.addEventListener('click', () => {
  weekOffset--;
  renderDateStrip();
});

nextWeekBtn.addEventListener('click', () => {
  weekOffset++;
  renderDateStrip();
});

todayBtn.addEventListener('click', () => {
  journalDate = formatDate(new Date());
  weekOffset = 0;
  renderDateStrip();
  loadJournal();
  updateArchiveActive();
  todayBtn.textContent = '今天';
});

// 加载日记
async function loadJournal() {
  try {
    const content = await invoke('load_journal', { date: journalDate });
    journalEditor.value = content || '';
    journalStatus.textContent = content ? P().journal.loaded : P().journal.empty;
  } catch (e) {
    journalStatus.textContent = '加载失败';
    console.error('load journal:', e);
  }
}

// 更新归档列表的选中状态
function updateArchiveActive() {
  journalDateListEl.querySelectorAll('.journal-date-item').forEach(el => {
    el.classList.toggle('active', el.dataset.date === journalDate);
  });
}

// 加载日记归档列表
async function loadJournalDates() {
  try {
    const dates = await invoke('list_journal_dates');
    journalDatesSet = new Set(dates || []);

    if (!dates || dates.length === 0) {
      journalDateListEl.innerHTML = '<div class="empty-hint">暂无日记</div>';
      renderDateStrip();
      return;
    }
    journalDateListEl.innerHTML = dates.map(d => {
      const active = d === journalDate ? ' active' : '';
      return `<div class="journal-date-item${active}" data-date="${d}">${d}</div>`;
    }).join('');

    journalDateListEl.querySelectorAll('.journal-date-item').forEach(el => {
      el.addEventListener('click', () => {
        journalDate = el.dataset.date;
        const target = new Date(journalDate);
        const now = new Date();
        const diffDays = Math.floor((target - now) / 86400000);
        const nowDay = now.getDay();
        weekOffset = Math.floor((diffDays + nowDay) / 7);
        renderDateStrip();
        loadJournal();
        updateArchiveActive();
      });
    });

    renderDateStrip();
  } catch (e) {
    journalDateListEl.innerHTML = '<div class="empty-hint">加载失败</div>';
  }
}

function refreshJournal() {
  loadJournal();
  loadJournalDates();
}

// 保存日记
saveBtn.addEventListener('click', async () => {
  const content = journalEditor.value.trim();
  if (!content) {
    journalStatus.textContent = '内容为空，未保存';
    return;
  }
  try {
    await invoke('save_journal', { date: journalDate, content });
    journalStatus.textContent = `已保存 ${journalDate}.md`;
    loadJournalDates();
    if (typeof updateChickMood === 'function') updateChickMood();
  } catch (e) {
    journalStatus.textContent = '保存失败';
    console.error('save journal:', e);
  }
});

// 删除日记
deleteBtn.addEventListener('click', async () => {
  if (!confirm(`确定要删除 ${journalDate} 的日记吗？`)) return;
  try {
    await invoke('delete_journal', { date: journalDate });
    journalEditor.value = '';
    journalStatus.textContent = `已删除 ${journalDate}.md`;
    loadJournalDates();
    if (typeof updateChickMood === 'function') updateChickMood();
  } catch (e) {
    journalStatus.textContent = '删除失败';
    console.error('delete journal:', e);
  }
});

// 导入日记
function showImportDialog(importedContent, existing) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'import-dialog-overlay';
    overlay.innerHTML = `
      <div class="import-dialog">
        <h3>当天已有日记</h3>
        <p>选择 ${journalDate} 的导入方式：</p>
        <div class="import-dialog-actions">
          <button class="import-btn-merge" data-action="merge">智能整合（AI 合并）</button>
          <button class="import-btn-append" data-action="append">追加到末尾</button>
          <button class="import-btn-overwrite" data-action="overwrite">覆盖原内容</button>
          <button class="import-btn-cancel" data-action="cancel">取消</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        document.body.removeChild(overlay);
        resolve(btn.dataset.action);
      });
    });
  });
}

// 从文本中识别日期
function detectDateFromContent(text) {
  // 优先匹配前几行（标题区域）
  const head = text.slice(0, 500);
  // 2026-02-10 或 2026/02/10
  let m = head.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) {
    return `${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`;
  }
  // 2026年2月10日
  m = head.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (m) {
    return `${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`;
  }
  // 2月10日（默认当年）
  m = head.match(/(\d{1,2})月(\d{1,2})日/);
  if (m) {
    const y = new Date().getFullYear();
    return `${y}-${String(m[1]).padStart(2,'0')}-${String(m[2]).padStart(2,'0')}`;
  }
  return null;
}

importBtn.addEventListener('click', async () => {
  const content = await invoke('pick_and_read_file');
  if (!content) return;

  // 识别文件中的日期
  const detected = detectDateFromContent(content);
  if (detected && detected !== journalDate) {
    journalDate = detected;
    const target = new Date(journalDate);
    const now = new Date();
    const diffDays = Math.floor((target - now) / 86400000);
    const nowDay = now.getDay();
    weekOffset = Math.floor((diffDays + nowDay) / 7);
    renderDateStrip();
    // 先加载目标日期已有内容
    await loadJournal();
    journalStatus.textContent = `识别到日期 ${detected}，已切换`;
  }

  const existing = journalEditor.value.trim();

  if (!existing) {
    // 当天没有日记，直接写入
    journalEditor.value = content;
    journalStatus.textContent = '已导入，请检查后保存';
    return;
  }

  // 当天有日记，弹冲突选择
  const action = await showImportDialog(content, existing);

  if (action === 'overwrite') {
    journalEditor.value = content;
    journalStatus.textContent = '已覆盖导入，请检查后保存';
  } else if (action === 'append') {
    journalEditor.value = existing + '\n\n---\n\n' + content;
    journalStatus.textContent = '已追加导入，请检查后保存';
  } else if (action === 'merge') {
    // 调用 AI 整理合并
    const merged = existing + '\n\n---\n\n' + content;
    organizeBtn.disabled = true;
    aiGenBtn.disabled = true;
    importBtn.disabled = true;
    journalStatus.textContent = P().journal.merging;
    journalEditor.value = '';

    const unlisten = await listen('ai-chunk', (event) => {
      journalEditor.value += event.payload;
      journalEditor.scrollTop = journalEditor.scrollHeight;
    });

    try {
      await invoke('ai_organize', { date: journalDate, raw_content: merged });
      journalStatus.textContent = P().journal.merge_done;
    } catch (e) {
      journalStatus.textContent = `整合失败：${String(e).slice(0, 50)}`;
      journalEditor.value = merged;
    } finally {
      unlisten();
      organizeBtn.disabled = false;
      aiGenBtn.disabled = false;
      importBtn.disabled = false;
    }
  }
  // cancel: do nothing
});

// AI 生成（流式）
aiGenBtn.addEventListener('click', async () => {
  aiGenBtn.disabled = true;
  organizeBtn.disabled = true;
  aiGenBtn.textContent = '生成中...';
  journalStatus.textContent = P().journal.generating;

  const existing = journalEditor.value.trim();
  const prefix = existing ? existing + '\n\n---\n\n' : '';
  journalEditor.value = prefix;

  const unlisten = await listen('ai-chunk', (event) => {
    journalEditor.value += event.payload;
    journalEditor.scrollTop = journalEditor.scrollHeight;
  });

  try {
    await invoke('ai_generate', { date: journalDate, existing_text: existing });
    journalStatus.textContent = P().journal.gen_done;
  } catch (e) {
    journalStatus.textContent = `生成失败：${String(e).slice(0, 50)}`;
  } finally {
    unlisten();
    aiGenBtn.disabled = false;
    organizeBtn.disabled = false;
    aiGenBtn.textContent = 'AI 生成';
  }
});

// AI 整理（流式）
organizeBtn.addEventListener('click', async () => {
  const content = journalEditor.value.trim();
  if (!content) {
    journalStatus.textContent = '没有内容可以整理';
    return;
  }
  organizeBtn.disabled = true;
  aiGenBtn.disabled = true;
  organizeBtn.textContent = '整理中...';
  journalStatus.textContent = P().journal.organizing;

  journalEditor.value = '';

  const unlisten = await listen('ai-chunk', (event) => {
    journalEditor.value += event.payload;
    journalEditor.scrollTop = journalEditor.scrollHeight;
  });

  try {
    await invoke('ai_organize', { date: journalDate, raw_content: content });
    journalStatus.textContent = P().journal.org_done;
  } catch (e) {
    journalStatus.textContent = `整理失败：${String(e).slice(0, 50)}`;
    journalEditor.value = content;
  } finally {
    unlisten();
    organizeBtn.disabled = false;
    aiGenBtn.disabled = false;
    organizeBtn.textContent = '整理';
  }
});

// 侧边栏拖拽缩放 & 折叠
const resizeHandle = document.getElementById('resizeHandle');
const sidebar = document.getElementById('journalSidebar');
const sidebarToggle = document.getElementById('sidebarToggle');
let isDragging = false;
let sidebarWidth = 170;

resizeHandle.addEventListener('mousedown', (e) => {
  isDragging = true;
  resizeHandle.classList.add('dragging');
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
  e.preventDefault();
});

document.addEventListener('mousemove', (e) => {
  if (!isDragging) return;
  const container = sidebar.parentElement;
  const rect = container.getBoundingClientRect();
  const newWidth = rect.right - e.clientX - 3;
  if (newWidth >= 100 && newWidth <= 400) {
    sidebarWidth = newWidth;
    sidebar.style.width = newWidth + 'px';
    sidebar.classList.remove('collapsed');
    sidebarToggle.textContent = '›';
  }
});

document.addEventListener('mouseup', () => {
  if (isDragging) {
    isDragging = false;
    resizeHandle.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }
});

sidebarToggle.addEventListener('click', () => {
  if (sidebar.classList.contains('collapsed')) {
    sidebar.classList.remove('collapsed');
    sidebar.style.width = sidebarWidth + 'px';
    sidebarToggle.textContent = '›';
  } else {
    sidebar.classList.add('collapsed');
    sidebar.style.width = '';
    sidebarToggle.textContent = '‹';
  }
});

// 初始化
refreshJournal();

// === 月历弹窗 ===
function renderCalendar() {
  calTitle.textContent = `${calYear}年${calMonth + 1}月`;
  const today = formatDate(new Date());
  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const prevDays = new Date(calYear, calMonth, 0).getDate();

  let html = '';
  // 上月补位
  for (let i = firstDay - 1; i >= 0; i--) {
    const d = prevDays - i;
    const dt = new Date(calYear, calMonth - 1, d);
    const ds = formatDate(dt);
    const hasJ = journalDatesSet.has(ds) ? ' has-journal' : '';
    html += `<div class="cal-day other-month${hasJ}" data-date="${ds}"><span class="day-num">${d}</span><span class="day-dot"></span></div>`;
  }
  // 本月
  for (let d = 1; d <= daysInMonth; d++) {
    const dt = new Date(calYear, calMonth, d);
    const ds = formatDate(dt);
    let cls = 'cal-day';
    if (ds === today) cls += ' today';
    if (ds === journalDate) cls += ' selected';
    if (journalDatesSet.has(ds)) cls += ' has-journal';
    html += `<div class="${cls}" data-date="${ds}"><span class="day-num">${d}</span><span class="day-dot"></span></div>`;
  }
  // 下月补位
  const total = firstDay + daysInMonth;
  const remain = (7 - total % 7) % 7;
  for (let d = 1; d <= remain; d++) {
    const dt = new Date(calYear, calMonth + 1, d);
    const ds = formatDate(dt);
    const hasJ = journalDatesSet.has(ds) ? ' has-journal' : '';
    html += `<div class="cal-day other-month${hasJ}" data-date="${ds}"><span class="day-num">${d}</span><span class="day-dot"></span></div>`;
  }
  calDays.innerHTML = html;

  calDays.querySelectorAll('.cal-day').forEach(el => {
    el.addEventListener('click', () => {
      journalDate = el.dataset.date;
      const target = new Date(journalDate);
      const now = new Date();
      const diffDays = Math.floor((target - now) / 86400000);
      weekOffset = Math.floor((diffDays + now.getDay()) / 7);
      renderDateStrip();
      loadJournal();
      updateArchiveActive();
      calendarPopup.classList.remove('open');
    });
  });
}

// 点击月份标题打开/关闭月历
stripMonthEl.addEventListener('click', () => {
  if (calendarPopup.classList.contains('open')) {
    calendarPopup.classList.remove('open');
    return;
  }
  const sel = new Date(journalDate);
  calYear = sel.getFullYear();
  calMonth = sel.getMonth();
  renderCalendar();
  calendarPopup.classList.add('open');
});

// 月历前后月导航
calPrevMonth.addEventListener('click', () => {
  calMonth--;
  if (calMonth < 0) { calMonth = 11; calYear--; }
  renderCalendar();
});

calNextMonth.addEventListener('click', () => {
  calMonth++;
  if (calMonth > 11) { calMonth = 0; calYear++; }
  renderCalendar();
});

// 点击外部关闭月历
document.addEventListener('click', (e) => {
  if (!calendarPopup.contains(e.target) && e.target !== stripMonthEl && !stripMonthEl.contains(e.target)) {
    calendarPopup.classList.remove('open');
  }
});

// === 日记搜索 ===
const journalSearchInput = document.getElementById('journalSearchInput');
let searchTimer = null;

journalSearchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  const kw = journalSearchInput.value.trim();
  if (!kw) {
    // 清空搜索，恢复归档列表
    loadJournalDates();
    return;
  }
  searchTimer = setTimeout(() => doSearch(kw), 300);
});

async function doSearch(keyword) {
  try {
    const results = await invoke('search_journals', { keyword });
    if (results.length === 0) {
      journalDateListEl.innerHTML = '<div class="empty-hint">未找到匹配</div>';
      return;
    }
    journalDateListEl.innerHTML = results.map(([date, snippet]) => {
      const active = date === journalDate ? ' active' : '';
      return `<div class="search-result-item${active}" data-date="${date}">
        <div class="search-result-date">${date}</div>
        <div class="search-result-snippet">${escapeHtml(snippet)}</div>
      </div>`;
    }).join('');

    journalDateListEl.querySelectorAll('.search-result-item').forEach(el => {
      el.addEventListener('click', () => {
        journalDate = el.dataset.date;
        const target = new Date(journalDate);
        const now = new Date();
        const diffDays = Math.floor((target - now) / 86400000);
        weekOffset = Math.floor((diffDays + now.getDay()) / 7);
        renderDateStrip();
        loadJournal();
      });
    });
  } catch (e) {
    console.error('search journals:', e);
  }
}

// 搜索用的 escapeHtml（复用 monitor 的或自定义）
function escapeHtmlJ(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
if (typeof escapeHtml === 'undefined') {
  window.escapeHtml = escapeHtmlJ;
}

// === Markdown 预览 ===
function simpleMarkdown(text) {
  let html = text;
  // 转义 HTML
  html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // 代码块
  html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
  // 行内代码
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  // 标题
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  // 粗体 & 斜体
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // 引用
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');
  // 分割线
  html = html.replace(/^---$/gm, '<hr>');
  // 无序列表
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
  // 链接
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
  // 段落（连续非空行）
  html = html.replace(/\n\n/g, '</p><p>');
  html = html.replace(/\n/g, '<br>');
  html = '<p>' + html + '</p>';
  // 清理空段落
  html = html.replace(/<p>\s*<\/p>/g, '');
  return html;
}

previewBtn.addEventListener('click', () => {
  previewMode = !previewMode;
  previewBtn.classList.toggle('active', previewMode);
  if (previewMode) {
    journalPreview.innerHTML = simpleMarkdown(journalEditor.value);
    journalPreview.style.display = 'block';
    journalEditor.style.display = 'none';
  } else {
    journalPreview.style.display = 'none';
    journalEditor.style.display = 'block';
  }
});
