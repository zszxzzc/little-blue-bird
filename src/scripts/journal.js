// === 日记编辑页 ===
const journalDateInput = document.getElementById('journalDate');
const journalEditor = document.getElementById('journalEditor');
const journalStatus = document.getElementById('journalStatus');
const prevDayBtn = document.getElementById('prevDay');
const nextDayBtn = document.getElementById('nextDay');
const todayBtn = document.getElementById('todayBtn');
const aiGenBtn = document.getElementById('aiGenBtn');
const organizeBtn = document.getElementById('organizeBtn');
const saveBtn = document.getElementById('saveBtn');
const journalDateListEl = document.getElementById('journalDateList');

let journalDate = new Date().toISOString().slice(0, 10);
journalDateInput.value = journalDate;

// 日期导航
prevDayBtn.addEventListener('click', () => {
  const d = new Date(journalDate);
  d.setDate(d.getDate() - 1);
  journalDate = d.toISOString().slice(0, 10);
  journalDateInput.value = journalDate;
  refreshJournal();
});

nextDayBtn.addEventListener('click', () => {
  const d = new Date(journalDate);
  d.setDate(d.getDate() + 1);
  journalDate = d.toISOString().slice(0, 10);
  journalDateInput.value = journalDate;
  refreshJournal();
});

todayBtn.addEventListener('click', () => {
  journalDate = new Date().toISOString().slice(0, 10);
  journalDateInput.value = journalDate;
  refreshJournal();
});

journalDateInput.addEventListener('change', () => {
  journalDate = journalDateInput.value;
  refreshJournal();
});

// 加载日记
async function loadJournal() {
  try {
    const content = await invoke('load_journal', { date: journalDate });
    journalEditor.value = content || '';
    journalStatus.textContent = content ? '已加载' : '暂无日记';
  } catch (e) {
    journalStatus.textContent = '加载失败';
    console.error('load journal:', e);
  }
}

// 加载日记归档列表
async function loadJournalDates() {
  try {
    const dates = await invoke('list_journal_dates');
    if (!dates || dates.length === 0) {
      journalDateListEl.innerHTML = '<div class="empty-hint">暂无日记</div>';
      return;
    }
    journalDateListEl.innerHTML = dates.map(d => {
      const active = d === journalDate ? ' active' : '';
      return `<div class="journal-date-item${active}" data-date="${d}">${d}</div>`;
    }).join('');
    // 点击切换日期
    journalDateListEl.querySelectorAll('.journal-date-item').forEach(el => {
      el.addEventListener('click', () => {
        journalDate = el.dataset.date;
        journalDateInput.value = journalDate;
        loadJournal();
        loadJournalDates();
      });
    });
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
  } catch (e) {
    journalStatus.textContent = '保存失败';
    console.error('save journal:', e);
  }
});

// AI 生成（流式）
aiGenBtn.addEventListener('click', async () => {
  aiGenBtn.disabled = true;
  organizeBtn.disabled = true;
  aiGenBtn.textContent = '生成中...';
  journalStatus.textContent = '正在生成...';

  const existing = journalEditor.value.trim();
  const prefix = existing ? existing + '\n\n---\n\n' : '';
  journalEditor.value = prefix;

  const unlisten = await listen('ai-chunk', (event) => {
    journalEditor.value += event.payload;
    journalEditor.scrollTop = journalEditor.scrollHeight;
  });

  try {
    await invoke('ai_generate', { date: journalDate, existing_text: existing });
    journalStatus.textContent = '生成完成，请检查后保存';
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
  journalStatus.textContent = '正在整理...';

  journalEditor.value = '';

  const unlisten = await listen('ai-chunk', (event) => {
    journalEditor.value += event.payload;
    journalEditor.scrollTop = journalEditor.scrollHeight;
  });

  try {
    await invoke('ai_organize', { date: journalDate, raw_content: content });
    journalStatus.textContent = '整理完成，请检查后保存';
  } catch (e) {
    journalStatus.textContent = `整理失败：${String(e).slice(0, 50)}`;
    journalEditor.value = content; // 失败时恢复原内容
  } finally {
    unlisten();
    organizeBtn.disabled = false;
    aiGenBtn.disabled = false;
    organizeBtn.textContent = '整理';
  }
});

// 初始化
refreshJournal();
