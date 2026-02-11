// === 页面切换 ===
const navBtns = document.querySelectorAll('.nav-btn');
const pages = document.querySelectorAll('.page');

function switchPage(name) {
  pages.forEach(p => p.classList.remove('active'));
  navBtns.forEach(b => b.classList.remove('active'));

  const page = document.getElementById(`page-${name}`);
  const btn = document.querySelector(`.nav-btn[data-page="${name}"]`);
  if (page) page.classList.add('active');
  if (btn) btn.classList.add('active');

  // 触发页面切换事件
  window.dispatchEvent(new CustomEvent('page-change', { detail: name }));

  // 切回主页时刷新心情（梗会随机变化）
  if (name === 'home' && typeof updateChickMood === 'function') {
    updateChickMood();
  }
}

navBtns.forEach(btn => {
  btn.addEventListener('click', () => switchPage(btn.dataset.page));
});

// === 状态栏日期 ===
function updateStatusBarDate() {
  const el = document.getElementById('statusBarRight');
  if (el) el.textContent = new Date().toISOString().slice(0, 10);
}
updateStatusBarDate();

// === Tauri invoke 封装 ===
const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

// === 左侧导航栏折叠 ===
const navRail = document.getElementById('navRail');
const navLogo = navRail.querySelector('.nav-logo');

// 点击 logo 切换展开/折叠
navLogo.addEventListener('click', () => {
  navRail.classList.toggle('expanded');
});
navLogo.style.cursor = 'pointer';

// === 工具函数 ===
function fmtDuration(sec) {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return m ? `${h}h ${m}m` : `${h}h`;
}

// === 全局快捷键 ===
function getActivePage() {
  const active = document.querySelector('.page.active');
  return active ? active.id.replace('page-', '') : '';
}

document.addEventListener('keydown', (e) => {
  const tag = document.activeElement?.tagName;
  const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

  // Ctrl+S: 保存日记
  if (e.ctrlKey && e.key === 's') {
    e.preventDefault();
    if (getActivePage() === 'journal') {
      document.getElementById('saveBtn')?.click();
    }
    return;
  }

  // Escape: 关闭设置浮层 / 月历弹窗
  if (e.key === 'Escape') {
    const overlay = document.getElementById('settingsOverlay');
    if (overlay?.classList.contains('open')) {
      overlay.classList.remove('open');
      return;
    }
    const cal = document.getElementById('calendarPopup');
    if (cal?.classList.contains('open')) {
      cal.classList.remove('open');
      return;
    }
  }

  // 以下快捷键在输入框内不触发
  if (inInput) return;

  // Ctrl+1/2/3: 切换页面
  if (e.ctrlKey && e.key === '1') { e.preventDefault(); switchPage('home'); }
  if (e.ctrlKey && e.key === '2') { e.preventDefault(); switchPage('monitor'); }
  if (e.ctrlKey && e.key === '3') { e.preventDefault(); switchPage('journal'); }
});
