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

// === 工具函数 ===
function fmtDuration(sec) {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return m ? `${h}h ${m}m` : `${h}h`;
}
