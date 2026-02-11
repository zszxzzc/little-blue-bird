// === 主页 - 小鸡心情系统 ===
const chickMascot = document.getElementById('chickMascot');
const homeGreeting = document.getElementById('homeGreeting');
const homeSubtitle = document.getElementById('homeSubtitle');
const goalProgressEl = document.getElementById('goalProgress');
const goalPctEl = document.getElementById('goalPct');
const goalBarFill = document.getElementById('goalBarFill');

async function updateChickMood() {
  try {
    const mood = await invoke('get_chick_mood');
    chickMascot.setAttribute('data-mood', mood.mood);
    homeGreeting.textContent = mood.greeting || '你好呀 ~';
    homeSubtitle.textContent = mood.message;

    // 更新目标进度
    if (mood.goal_pct > 0 || goalProgressEl.style.display !== 'none') {
      goalProgressEl.style.display = '';
      goalPctEl.textContent = mood.goal_pct + '%';
      goalBarFill.style.width = Math.min(100, mood.goal_pct) + '%';
      if (mood.goal_pct >= 100) {
        goalBarFill.classList.add('complete');
      } else {
        goalBarFill.classList.remove('complete');
      }
    }
  } catch (e) {
    console.error('mood:', e);
  }
}

// 初始加载 + 每 2 分钟刷新
updateChickMood();
setInterval(updateChickMood, 120_000);

// === 社交能量条 ===
const socialEnergyEl = document.getElementById('socialEnergy');
const socialPctEl = document.getElementById('socialPct');
const socialBarFill = document.getElementById('socialBarFill');

async function updateSocialEnergy() {
  try {
    const s = await invoke('get_social_status');
    if (s.social_min > 0 || socialEnergyEl.style.display !== 'none') {
      socialEnergyEl.style.display = '';
      socialPctEl.textContent = s.energy_pct + '%';
      socialBarFill.style.width = Math.min(100, s.energy_pct) + '%';
      socialBarFill.className = 'social-bar-fill';
      if (s.overloaded) {
        socialBarFill.classList.add('overloaded');
      } else if (s.energy_pct > 90) {
        socialBarFill.classList.add('danger');
      } else if (s.energy_pct > 60) {
        socialBarFill.classList.add('warn');
      }
    }
  } catch (e) {
    console.error('social:', e);
  }
}

updateSocialEnergy();
setInterval(updateSocialEnergy, 120_000);

// === 番茄钟 ===
const pomoEl = document.getElementById('pomodoro');
const pomoTime = document.getElementById('pomoTime');
const pomoProgress = document.getElementById('pomoProgress');
const pomoLabel = document.getElementById('pomoLabel');
const pomoStartBtn = document.getElementById('pomoStartBtn');
const pomoResetBtn = document.getElementById('pomoResetBtn');
const pomoCountEl = document.getElementById('pomoCount');
const pomoMinus = document.getElementById('pomoMinus');
const pomoPlus = document.getElementById('pomoPlus');

const CIRCUM = 2 * Math.PI * 52; // 326.73

let focusMin = parseInt(localStorage.getItem('pomoFocusMin') || '25');
if (focusMin < 5) focusMin = 5;
if (focusMin > 60) focusMin = 60;
let focusSec = focusMin * 60;
let breakSec = Math.max(60, Math.round(focusMin / 5) * 60);

let pomoState = 'idle'; // idle | focus | break
let pomoRemain = focusSec;
let pomoTimer = null;
let pomoTodayCount = parseInt(localStorage.getItem('pomoToday') || '0');
let pomoTodayDate = localStorage.getItem('pomoDate') || '';

// 如果日期变了，重置计数
const todayStr = new Date().toISOString().slice(0, 10);
if (pomoTodayDate !== todayStr) {
  pomoTodayCount = 0;
  localStorage.setItem('pomoDate', todayStr);
  localStorage.setItem('pomoToday', '0');
}
updatePomoUI();
updateAdjBtns();

// +/- 调整专注时长（idle 状态下）
pomoMinus.addEventListener('click', () => {
  if (pomoState !== 'idle') return;
  focusMin = Math.max(5, focusMin - 5);
  applyFocusMin();
});
pomoPlus.addEventListener('click', () => {
  if (pomoState !== 'idle') return;
  focusMin = Math.min(60, focusMin + 5);
  applyFocusMin();
});

function applyFocusMin() {
  focusSec = focusMin * 60;
  breakSec = Math.max(60, Math.round(focusMin / 5) * 60);
  pomoRemain = focusSec;
  localStorage.setItem('pomoFocusMin', String(focusMin));
  updatePomoUI();
  updateRing(focusSec);
}

function updateAdjBtns() {
  const show = pomoState === 'idle';
  pomoMinus.style.visibility = show ? 'visible' : 'hidden';
  pomoPlus.style.visibility = show ? 'visible' : 'hidden';
}

pomoStartBtn.addEventListener('click', () => {
  if (pomoState === 'idle') {
    startFocus();
  } else {
    stopPomo();
  }
});

pomoResetBtn.addEventListener('click', () => {
  stopPomo();
  pomoRemain = focusSec;
  updatePomoUI();
});

function startFocus() {
  pomoState = 'focus';
  pomoRemain = focusSec;
  pomoEl.classList.remove('break');
  pomoStartBtn.textContent = P().pomo.stop;
  pomoLabel.textContent = P().pomo.focus;
  updateAdjBtns();
  runTimer(focusSec);
}

function startBreak() {
  pomoState = 'break';
  pomoRemain = breakSec;
  pomoEl.classList.add('break');
  pomoStartBtn.textContent = P().pomo.skip;
  pomoLabel.textContent = P().pomo.break_time;
  updateAdjBtns();
  runTimer(breakSec);
}

function runTimer(total) {
  clearInterval(pomoTimer);
  pomoTimer = setInterval(() => {
    pomoRemain--;
    updatePomoUI();
    updateRing(total);
    if (pomoRemain <= 0) {
      clearInterval(pomoTimer);
      if (pomoState === 'focus') {
        pomoTodayCount++;
        localStorage.setItem('pomoToday', String(pomoTodayCount));
        updateChickMood();
        startBreak();
      } else {
        stopPomo();
      }
    }
  }, 1000);
}

function stopPomo() {
  clearInterval(pomoTimer);
  pomoState = 'idle';
  pomoRemain = focusSec;
  pomoEl.classList.remove('break');
  pomoStartBtn.textContent = P().pomo.start;
  pomoLabel.textContent = P().pomo.idle;
  updateAdjBtns();
  updatePomoUI();
  updateRing(focusSec);
}

function updatePomoUI() {
  const m = Math.floor(pomoRemain / 60);
  const s = pomoRemain % 60;
  pomoTime.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  pomoCountEl.textContent = P().pomo.count(pomoTodayCount);
}

function updateRing(total) {
  const pct = pomoRemain / total;
  const offset = CIRCUM * (1 - pct);
  pomoProgress.setAttribute('stroke-dashoffset', offset);
}

// === 今日反派系统 ===
const villainCard = document.getElementById('villainCard');
const villainEmoji = document.getElementById('villainEmoji');
const villainName = document.getElementById('villainName');
const villainTime = document.getElementById('villainTime');
const villainTaunt = document.getElementById('villainTaunt');
const villainSealBtn = document.getElementById('villainSealBtn');
const villainLetBtn = document.getElementById('villainLetBtn');
const villainSealInput = document.getElementById('villainSealInput');
const sealCondition = document.getElementById('sealCondition');
const sealConfirmBtn = document.getElementById('sealConfirmBtn');

let currentVillainCat = null;

async function updateVillain() {
  try {
    const v = await invoke('get_today_villain');
    if (v) {
      villainCard.style.display = '';
      villainEmoji.textContent = v.emoji;
      villainName.textContent = v.name;

      // 根据成长等级显示不同状态
      villainCard.classList.remove('villain-boss');
      if (v.growth >= 5) {
        villainName.textContent += ' [BOSS]';
        villainCard.classList.add('villain-boss');
      } else if (v.growth >= 3) {
        villainName.textContent += ' [进化]';
      }

      villainTime.textContent = `已消耗 ${v.minutes} 分钟`;
      villainTaunt.textContent = v.taunt;
      currentVillainCat = v.category;
      villainSealInput.style.display = 'none';
    } else {
      villainCard.style.display = 'none';
      currentVillainCat = null;
    }
  } catch (e) {
    console.error('villain:', e);
  }
}

villainSealBtn.addEventListener('click', () => {
  villainSealInput.style.display = '';
  sealCondition.focus();
});

villainLetBtn.addEventListener('click', async () => {
  if (!currentVillainCat) return;
  await invoke('seal_villain', { category: currentVillainCat, condition: null });
  updateVillain();
});

sealConfirmBtn.addEventListener('click', async () => {
  if (!currentVillainCat) return;
  const cond = sealCondition.value.trim() || '自律约定';
  await invoke('seal_villain', { category: currentVillainCat, condition: cond });
  sealCondition.value = '';
  updateVillain();
});

updateVillain();

// === 小剧场 ===
const theaterBtn = document.getElementById('theaterBtn');
const theaterOverlay = document.getElementById('theaterOverlay');
const theaterContent = document.getElementById('theaterContent');
const theaterBranches = document.getElementById('theaterBranches');

// 有活动数据或日记时显示按钮
async function checkTheaterAvailable() {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const activity = await invoke('get_today_activity');
    const journal = await invoke('load_journal', { date: today });
    if (activity.length > 0 || journal.trim()) {
      theaterBtn.style.display = '';
    }
  } catch(e) {}
}

theaterBtn?.addEventListener('click', async () => {
  theaterOverlay.classList.add('active');
  theaterContent.innerHTML = '<div class="empty-hint">生成中…</div>';
  theaterBranches.innerHTML = '';

  const today = new Date().toISOString().slice(0, 10);

  // 先检查是否已有
  try {
    const existing = await invoke('get_theater', { date: today });
    if (existing) {
      renderTheater(existing);
      return;
    }
  } catch(e) {}

  // 流式生成
  let fullText = '';
  const unlisten = await listen('ai-chunk', (e) => {
    fullText += e.payload;
    theaterContent.textContent = fullText;
  });
  const unlistenDone = await listen('ai-done', () => {
    unlisten(); unlistenDone();
    parseAndRenderTheater(today, fullText);
  });

  try {
    await invoke('generate_theater', { date: today });
  } catch(err) {
    theaterContent.innerHTML = `<div class="empty-hint">生成失败: ${err}</div>`;
    unlisten(); unlistenDone();
  }
});

function parseAndRenderTheater(date, text) {
  // 解析 AI 返回：正文 + --- + 分支
  const parts = text.split('---');
  const story = parts[0].trim();
  const branches = [];

  // 解析 ## 如果xxx 格式的分支
  if (parts.length > 1) {
    const branchText = parts.slice(1).join('---');
    const branchRegex = /##\s*(.+)\n([\s\S]*?)(?=##|$)/g;
    let match;
    while ((match = branchRegex.exec(branchText)) !== null) {
      branches.push({ label: match[1].trim(), text: match[2].trim() });
    }
  }

  const entry = { date, generated_at: new Date().toISOString(), story, branches };
  // 保存（fire and forget）
  invoke('save_theater', { entry }).catch(() => {});
  renderTheater(entry);
}

function renderTheater(entry) {
  theaterContent.textContent = entry.story;
  theaterBranches.innerHTML = entry.branches.map((b, i) =>
    `<div class="theater-branch" onclick="this.classList.toggle('expanded')">
      <div class="theater-branch-label">${b.label}</div>
      <div class="theater-branch-text">${b.text}</div>
    </div>`
  ).join('');
}

document.getElementById('theaterCloseBtn')?.addEventListener('click', () => {
  theaterOverlay.classList.remove('active');
});

checkTheaterAvailable();
setInterval(updateVillain, 120_000);

// === 英语词汇拾取 ===
const vocabCard = document.getElementById('vocabCard');
const vocabList = document.getElementById('vocabList');
const vocabGenBtn = document.getElementById('vocabGenBtn');

let todayWords = [];

async function updateVocab() {
  try {
    // 先检查是否已有生成的例句
    const existing = await invoke('get_today_vocab');
    if (existing) {
      renderVocab(existing.words);
      return;
    }
    // 提取今日单词
    todayWords = await invoke('extract_today_words');
    if (todayWords.length > 0) {
      vocabCard.style.display = '';
      vocabList.innerHTML = `<div class="empty-hint">发现 ${todayWords.length} 个单词，点击生成例句</div>`;
    }
  } catch(e) {
    console.error('vocab:', e);
  }
}

vocabGenBtn?.addEventListener('click', async () => {
  if (todayWords.length === 0) return;
  vocabGenBtn.disabled = true;
  vocabGenBtn.textContent = '生成中…';
  vocabList.innerHTML = '<div class="empty-hint">AI 生成中…</div>';

  const today = new Date().toISOString().slice(0, 10);
  let fullText = '';
  const unlisten = await listen('ai-chunk', (e) => {
    fullText += e.payload;
  });
  const unlistenDone = await listen('ai-done', () => {
    unlisten(); unlistenDone();
    try {
      // 解析 JSON
      const parsed = JSON.parse(fullText);
      renderVocab(parsed);
    } catch(err) {
      vocabList.innerHTML = `<div class="empty-hint">解析失败: ${err}</div>`;
    }
    vocabGenBtn.disabled = false;
    vocabGenBtn.textContent = '生成例句';
  });

  try {
    await invoke('generate_vocab_examples', { date: today, words: todayWords });
  } catch(err) {
    vocabList.innerHTML = `<div class="empty-hint">生成失败: ${err}</div>`;
    unlisten(); unlistenDone();
    vocabGenBtn.disabled = false;
    vocabGenBtn.textContent = '生成例句';
  }
});

function renderVocab(words) {
  if (!words || words.length === 0) {
    vocabList.innerHTML = '<div class="empty-hint">暂无词汇</div>';
    return;
  }
  vocabList.innerHTML = words.map(w => `
    <div class="vocab-item">
      <div class="vocab-word">${w.word}</div>
      <div class="vocab-examples">
        ${w.examples.map(ex => `<div><span class="vocab-style">${ex.style}:</span>${ex.text}</div>`).join('')}
      </div>
    </div>
  `).join('');
}

updateVocab();
