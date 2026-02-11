// museum.js - 小蓝鸟收藏馆
(function() {
  const { invoke } = window.__TAURI__.core;

  window.addEventListener('page-change', (e) => {
    if (e.detail === 'museum') loadMuseum();
  });

  async function loadMuseum() {
    try {
      // 并行加载所有数据
      const [journals, memes, totals, summary] = await Promise.all([
        invoke('list_journal_dates'),
        invoke('get_memes'),
        invoke('get_daily_totals', { days: 365 }),
        invoke('get_range_summary', { days: 365 }),
      ]);

      // 总览统计
      const activeDays = totals.filter(([_, sec]) => sec > 0);
      document.getElementById('msTotalDays').textContent = activeDays.length;
      const totalSec = totals.reduce((s, [_, sec]) => s + sec, 0);
      document.getElementById('msTotalHours').textContent = Math.round(totalSec / 3600);
      document.getElementById('msJournalCount').textContent = journals.length;
      document.getElementById('msMemeCount').textContent = memes.length;

      // 常用工具展柜（按时长排序前 8）
      renderTools(summary);
      // 梗库精选
      renderMemes(memes);
      // 关键词云（从日记标题/内容提取）
      renderWordcloud(journals);
    } catch(e) { console.error('收藏馆加载失败:', e); }
  }

  function renderTools(summary) {
    const el = document.getElementById('museumTools');
    if (!summary || summary.length === 0) {
      el.innerHTML = '<div class="empty-hint">暂无数据</div>';
      return;
    }
    // summary 是 [(category, seconds)] 数组
    const sorted = summary.sort((a, b) => b[1] - a[1]).slice(0, 8);
    const icons = {
      '编程': '💻', '浏览器': '🌐', '游戏': '🎮', '视频': '📺',
      '社交': '💬', '文档': '📄', '音乐': '🎵', '其他': '📦'
    };
    el.innerHTML = sorted.map(([cat, sec]) => `
      <div class="museum-tool-card">
        <div class="museum-tool-icon">${icons[cat] || '📦'}</div>
        <div class="museum-tool-name">${cat}</div>
        <div class="museum-tool-hours">${Math.round(sec / 3600)}h</div>
      </div>
    `).join('');
  }

  function renderMemes(memes) {
    const el = document.getElementById('museumMemes');
    if (!memes || memes.length === 0) {
      el.innerHTML = '<div class="empty-hint">暂无梗</div>';
      return;
    }
    el.innerHTML = memes.slice(0, 6).map(m => `
      <div class="museum-meme-card">${escapeHtml(m.meme_text)}</div>
    `).join('');
  }

  async function renderWordcloud(journalDates) {
    const el = document.getElementById('museumWordcloud');
    if (!journalDates || journalDates.length === 0) {
      el.innerHTML = '<div class="empty-hint">需要积累更多日记</div>';
      return;
    }
    // 简单词频统计：加载最近 30 篇日记，提取中文词汇
    const recent = journalDates.slice(0, 30);
    const wordCount = {};
    for (const date of recent) {
      try {
        const content = await invoke('load_journal', { date });
        // 简单分词：按标点和空格切分，取 2-6 字的片段
        const words = content.match(/[\u4e00-\u9fa5]{2,6}/g) || [];
        for (const w of words) {
          wordCount[w] = (wordCount[w] || 0) + 1;
        }
      } catch(e) {}
    }
    // 取频率前 20 的词
    const sorted = Object.entries(wordCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20);
    if (sorted.length === 0) {
      el.innerHTML = '<div class="empty-hint">需要积累更多日记</div>';
      return;
    }
    const maxCount = sorted[0][1];
    el.innerHTML = sorted.map(([word, count]) => {
      const size = 12 + Math.round((count / maxCount) * 16);
      return `<span class="museum-word" style="font-size:${size}px">${word}</span>`;
    }).join('');
  }

  function escapeHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
})();
