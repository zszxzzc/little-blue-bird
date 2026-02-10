"""
小蓝鸟 - Daily Journal
活动监测 + 日记编写 + AI 生成，三合一桌面应用。
"""

import os
os.environ.setdefault("PYTHONIOENCODING", "utf-8")

import ctypes
ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID("dailyjournal.app")

import json
import threading
import time
from datetime import datetime, date, timedelta
from pathlib import Path

import customtkinter as ctk
from PIL import Image, ImageDraw
import pystray
from tkinter import ttk
from tkinter import filedialog
from tkcalendar import DateEntry

try:
    import win32gui
    import win32process
    import psutil
except ImportError:
    import subprocess
    subprocess.run(["pip", "install", "pywin32", "psutil"], check=True)
    import win32gui
    import win32process
    import psutil

# === 路径配置 ===
APP_DIR = Path(__file__).parent
CONFIG_PATH = APP_DIR / "config.json"
ICO_PATH = APP_DIR / "bird.ico"

# 默认数据目录（可通过设置修改）
DATA_DIR = APP_DIR / "data"
ACTIVITY_DIR = DATA_DIR / "activity"
JOURNAL_DIR = DATA_DIR / "journal"

IDLE_INDICATORS = ["lockapp", "windows default lock screen", ""]


def apply_data_dir(data_dir_str):
    """根据配置更新数据目录路径。"""
    global DATA_DIR, ACTIVITY_DIR, JOURNAL_DIR
    DATA_DIR = Path(data_dir_str)
    ACTIVITY_DIR = DATA_DIR / "activity"
    JOURNAL_DIR = DATA_DIR / "journal"
    ACTIVITY_DIR.mkdir(parents=True, exist_ok=True)
    JOURNAL_DIR.mkdir(parents=True, exist_ok=True)


# === 配置管理 ===

def load_config():
    """加载配置文件。"""
    defaults = {
        "api_key": "",
        "model": "claude-sonnet-4-5-20250929",
        "language": "bilingual",
        "interval": 30,
        "data_dir": str(APP_DIR / "data"),
    }
    if CONFIG_PATH.exists():
        try:
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                saved = json.load(f)
            defaults.update(saved)
        except Exception:
            pass
    return defaults


def save_config(cfg):
    """保存配置到文件。"""
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)


# === 图标生成 ===

def make_tray_icon(color="#888888"):
    """生成小鸟形状的托盘图标。"""
    img = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.ellipse([14, 20, 48, 48], fill=color)
    d.ellipse([30, 10, 52, 32], fill=color)
    d.ellipse([39, 16, 44, 21], fill="white")
    d.polygon([(52, 22), (62, 20), (52, 26)], fill="#FF8C00")
    d.ellipse([8, 22, 34, 40], fill=color)
    d.ellipse([10, 24, 30, 36], fill=_lighten(color))
    d.polygon([(14, 30), (2, 18), (6, 38)], fill=color)
    return img


def _lighten(hex_color):
    """把颜色调亮一点。"""
    hex_color = hex_color.lstrip("#")
    r, g, b = int(hex_color[:2], 16), int(hex_color[2:4], 16), int(hex_color[4:6], 16)
    return f"#{min(255,r+50):02x}{min(255,g+50):02x}{min(255,b+50):02x}"


def fmt_duration(sec):
    """格式化秒数为可读字符串。"""
    if sec < 60:
        return f"{sec}s"
    if sec < 3600:
        return f"{sec // 60}m"
    h, m = divmod(sec, 3600)
    m //= 60
    return f"{h}h {m}m" if m else f"{h}h"


def ensure_ico():
    """生成 bird.ico 文件（如果不存在）。"""
    if ICO_PATH.exists():
        return
    icon_img = make_tray_icon("#4A9EE0")
    sizes = [(16, 16), (32, 32), (48, 48), (64, 64)]
    imgs = [icon_img.resize(s, Image.LANCZOS) for s in sizes]
    imgs[0].save(str(ICO_PATH), format="ICO", sizes=sizes, append_images=imgs[1:])


# === ActivityTracker 核心逻辑 ===

class ActivityTracker:
    def __init__(self, interval=30, on_entry=None):
        self.interval = interval
        self.running = False
        self.last_entry = None
        self.last_timestamp = None
        self.current_file = None
        self.current_date = None
        self.on_entry = on_entry
        self._stop_event = threading.Event()

    def get_active_window(self):
        try:
            hwnd = win32gui.GetForegroundWindow()
            title = win32gui.GetWindowText(hwnd)
            _, pid = win32process.GetWindowThreadProcessId(hwnd)
            proc = psutil.Process(pid)
            return title, proc.name()
        except Exception:
            return None, None

    def is_idle(self, title, exe):
        if not title and not exe:
            return True
        if "lockapp" in (exe or "").lower():
            return True
        return any(ind == (title or "").lower() for ind in IDLE_INDICATORS if ind)

    def should_dedup(self, title, exe):
        if self.last_entry is None:
            return False
        return (self.last_entry["title"] == (title or "")
                and self.last_entry["exe"] == (exe or ""))

    def flush_last_entry(self):
        if self.last_entry is None:
            return
        self.last_entry["duration"] = int(
            (datetime.now() - self.last_timestamp).total_seconds()
        )
        self._write_line(self.last_entry)
        self.last_entry = None
        self.last_timestamp = None

    def _get_file(self):
        today = date.today()
        if self.current_date != today:
            if self.current_file:
                self.current_file.close()
            ACTIVITY_DIR.mkdir(parents=True, exist_ok=True)
            self.current_file = open(
                ACTIVITY_DIR / f"{today.isoformat()}.jsonl", "a", encoding="utf-8"
            )
            self.current_date = today
        return self.current_file

    def _write_line(self, entry):
        try:
            f = self._get_file()
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
            f.flush()
            if self.on_entry:
                self.on_entry(entry)
        except Exception:
            pass

    def tick(self):
        title, exe = self.get_active_window()
        if self.is_idle(title, exe):
            self.flush_last_entry()
            return
        if self.should_dedup(title, exe):
            return
        self.flush_last_entry()
        now = datetime.now()
        self.last_entry = {
            "ts": now.isoformat(timespec="seconds"),
            "title": title or "",
            "exe": exe or "",
        }
        self.last_timestamp = now

    def run(self):
        self.running = True
        self._stop_event.clear()
        try:
            while self.running:
                self.tick()
                self._stop_event.wait(timeout=self.interval)
        finally:
            self.flush_last_entry()
            if self.current_file:
                self.current_file.close()
                self.current_file = None
                self.current_date = None

    def stop(self):
        self.running = False
        self._stop_event.set()


# === 活动数据辅助函数 ===

def load_activity_entries(target_date):
    """加载指定日期的活动记录。"""
    fp = ACTIVITY_DIR / f"{target_date.isoformat()}.jsonl"
    entries = []
    if not fp.exists():
        return entries
    with open(fp, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    entries.append(json.loads(line))
                except json.JSONDecodeError:
                    pass
    return entries


# 活动分类规则
CATEGORY_RULES = {
    "编程": ["code", "visual studio", "pycharm", "idea", "webstorm", "vim",
             "neovim", "sublime", "atom", "cursor", "windsurf", "devtools",
             "terminal", "powershell", "cmd.exe", "windowsterminal",
             "git", "node", "python", "java", "claude"],
    "浏览器": ["chrome", "firefox", "edge", "msedge", "brave", "opera", "safari"],
    "游戏": ["steam", "epicgames", "genshinimpact", "yuanshen", "game",
             "minecraft", "league", "valorant", "原神", "崩坏", "mhy"],
    "视频": ["youtube", "bilibili", "vlc", "mpv", "potplayer", "哔哩哔哩"],
    "社交": ["wechat", "weixin", "telegram", "discord", "qq", "slack", "teams"],
    "文档": ["word", "excel", "powerpoint", "wps", "notion", "obsidian",
             "typora", "notepad", "onenote"],
    "音乐": ["spotify", "netease", "cloudmusic", "qqmusic", "网易云"],
}


def categorize_activity(exe, title):
    """根据 exe 和 title 判断活动分类。"""
    text = f"{exe} {title}".lower()
    for cat, keywords in CATEGORY_RULES.items():
        if any(kw in text for kw in keywords):
            return cat
    return "其他"


def summarize_activities(entries):
    """将活动记录按分类汇总，返回 {分类: 总秒数} 字典。"""
    summary = {}
    for e in entries:
        dur = e.get("duration", 0)
        if dur < 30:
            continue
        cat = categorize_activity(e.get("exe", ""), e.get("title", ""))
        summary[cat] = summary.get(cat, 0) + dur
    # 按时长降序排列
    return dict(sorted(summary.items(), key=lambda x: x[1], reverse=True))


# === GUI 主界面 ===

ctk.set_appearance_mode("light")
ctk.set_default_color_theme("blue")

FONT_FAMILY = "Microsoft YaHei UI"
# Apple-style 配色
COLOR_BG = "#ffffff"
COLOR_CARD = "#f5f5f7"
COLOR_TEXT = "#1d1d1f"
COLOR_SECONDARY = "#86868b"
COLOR_ACCENT = "#007AFF"
COLOR_ACCENT_HOVER = "#0066DD"
COLOR_GREEN = "#34C759"
COLOR_GREEN_HOVER = "#2DB84D"
COLOR_BORDER = "#e5e5e7"
COLOR_BTN = "#1d1d1f"
COLOR_BTN_HOVER = "#333333"


class DailyJournalApp(ctk.CTk):
    def __init__(self):
        super().__init__()
        self.title("小蓝鸟")
        self.geometry("820x640")
        self.minsize(760, 580)
        self.configure(fg_color=COLOR_BG)
        self._center_window()

        self.config = load_config()
        apply_data_dir(self.config.get("data_dir", str(APP_DIR / "data")))
        ensure_ico()
        self.after(100, lambda: self.iconbitmap(str(ICO_PATH)))

        self.tracker = ActivityTracker(
            interval=self.config.get("interval", 30),
            on_entry=self._on_new_entry,
        )
        self.thread = None
        self.entry_count = 0
        self.total_duration = 0
        self.entries_data = []

        self.pages = {}
        self.current_page = None
        self.nav_buttons = {}

        self._build_layout()
        self._build_monitor_page()
        self._build_journal_page()
        self._build_settings_page()
        self._switch_page("monitor")
        self._load_today_activity()
        self._setup_tray()
        self.protocol("WM_DELETE_WINDOW", self._on_close)

    def _center_window(self):
        self.update_idletasks()
        w, h = 820, 640
        x = (self.winfo_screenwidth() - w) // 2
        y = (self.winfo_screenheight() - h) // 2
        self.geometry(f"{w}x{h}+{x}+{y}")

    def _build_layout(self):
        """Build the main layout: left nav rail + right content area + bottom status bar."""
        # --- Main container (nav + content) ---
        main = ctk.CTkFrame(self, fg_color="transparent")
        main.pack(fill="both", expand=True)

        # --- Left Nav Rail ---
        self.nav_rail = ctk.CTkFrame(main, width=56, fg_color=COLOR_CARD, corner_radius=0)
        self.nav_rail.pack(side="left", fill="y")
        self.nav_rail.pack_propagate(False)

        # Logo at top
        logo_img = make_tray_icon("#4A9EE0")
        self._logo_ctk = ctk.CTkImage(light_image=logo_img, size=(28, 28))
        logo_label = ctk.CTkLabel(self.nav_rail, image=self._logo_ctk, text="")
        logo_label.pack(pady=(14, 18))

        # Nav buttons
        nav_items = [
            ("monitor", "◉", "活动监测"),
            ("journal", "✎", "今日日记"),
            ("settings", "⚙", "设置"),
        ]
        for name, icon, tooltip in nav_items:
            btn = ctk.CTkButton(
                self.nav_rail, text=icon, width=40, height=40,
                corner_radius=10, font=ctk.CTkFont(size=16),
                fg_color="transparent", hover_color=COLOR_BORDER,
                text_color=COLOR_SECONDARY,
                command=lambda n=name: self._switch_page(n),
            )
            btn.pack(pady=2)
            self.nav_buttons[name] = btn

        # Spacer to push status dot to bottom
        spacer = ctk.CTkFrame(self.nav_rail, fg_color="transparent")
        spacer.pack(fill="both", expand=True)

        # Monitor status indicator dot at bottom of nav
        self.nav_status_dot = ctk.CTkLabel(
            self.nav_rail, text="●", font=("", 10),
            text_color=COLOR_SECONDARY,
        )
        self.nav_status_dot.pack(pady=(0, 14))

        # --- Right side: content + status bar ---
        right_side = ctk.CTkFrame(main, fg_color="transparent")
        right_side.pack(side="left", fill="both", expand=True)

        # Content area
        self.content_area = ctk.CTkFrame(right_side, fg_color=COLOR_BG, corner_radius=0)
        self.content_area.pack(fill="both", expand=True)

        # Page frames
        for name in ("monitor", "journal", "settings"):
            page = ctk.CTkFrame(self.content_area, fg_color=COLOR_BG)
            self.pages[name] = page

        # --- Bottom Status Bar ---
        self.status_bar = ctk.CTkFrame(right_side, height=28, fg_color=COLOR_CARD, corner_radius=0)
        self.status_bar.pack(fill="x", side="bottom")
        self.status_bar.pack_propagate(False)

        self.statusbar_left = ctk.CTkLabel(
            self.status_bar, text="未启动监测",
            font=ctk.CTkFont(family=FONT_FAMILY, size=11),
            text_color=COLOR_SECONDARY,
        )
        self.statusbar_left.pack(side="left", padx=12)

        self.statusbar_right = ctk.CTkLabel(
            self.status_bar, text=date.today().isoformat(),
            font=ctk.CTkFont(family=FONT_FAMILY, size=11),
            text_color=COLOR_SECONDARY,
        )
        self.statusbar_right.pack(side="right", padx=12)

    def _switch_page(self, name):
        """Switch visible page and update nav highlight."""
        if self.current_page == name:
            return
        # Hide current
        if self.current_page and self.current_page in self.pages:
            self.pages[self.current_page].pack_forget()
        # Show target
        self.pages[name].pack(fill="both", expand=True)
        # Update nav button styles
        for btn_name, btn in self.nav_buttons.items():
            if btn_name == name:
                btn.configure(fg_color=COLOR_BG, text_color=COLOR_TEXT)
            else:
                btn.configure(fg_color="transparent", text_color=COLOR_SECONDARY)
        self.current_page = name

    # =============================================
    # 标签页 1：活动监测
    # =============================================

    def _build_monitor_page(self):
        tab = self.pages["monitor"]

        # --- 状态区域 ---
        header = ctk.CTkFrame(tab, fg_color="transparent")
        header.pack(pady=(30, 0))

        row = ctk.CTkFrame(header, fg_color="transparent")
        row.pack()

        self.status_dot = ctk.CTkLabel(
            row, text="\u25cf", font=("", 16), text_color=COLOR_SECONDARY,
        )
        self.status_dot.pack(side="left", padx=(0, 8))

        self.status_label = ctk.CTkLabel(
            row, text="未运行",
            font=ctk.CTkFont(family=FONT_FAMILY, size=16, weight="bold"),
            text_color=COLOR_SECONDARY,
        )
        self.status_label.pack(side="left")

        self.toggle_btn = ctk.CTkButton(
            tab, text="开始监测", width=160, height=40,
            corner_radius=20,
            font=ctk.CTkFont(family=FONT_FAMILY, size=13, weight="bold"),
            fg_color=COLOR_BTN, hover_color=COLOR_BTN_HOVER,
            text_color="white",
            command=self._toggle_monitor,
        )
        self.toggle_btn.pack(pady=(18, 24))

        # --- 统计卡片 ---
        stats_frame = ctk.CTkFrame(tab, fg_color="transparent")
        stats_frame.pack(padx=36, fill="x")

        left = ctk.CTkFrame(stats_frame, corner_radius=12, fg_color=COLOR_CARD, border_width=0)
        left.pack(side="left", expand=True, fill="both", padx=(0, 8))
        self.count_val = ctk.CTkLabel(
            left, text="0",
            font=ctk.CTkFont(size=32, weight="bold"), text_color=COLOR_TEXT,
        )
        self.count_val.pack(pady=(18, 2))
        ctk.CTkLabel(
            left, text="记录数",
            font=ctk.CTkFont(family=FONT_FAMILY, size=11), text_color=COLOR_SECONDARY,
        ).pack(pady=(0, 16))

        right = ctk.CTkFrame(stats_frame, corner_radius=12, fg_color=COLOR_CARD, border_width=0)
        right.pack(side="right", expand=True, fill="both", padx=(8, 0))
        self.dur_val = ctk.CTkLabel(
            right, text="0m",
            font=ctk.CTkFont(size=32, weight="bold"), text_color=COLOR_TEXT,
        )
        self.dur_val.pack(pady=(18, 2))
        ctk.CTkLabel(
            right, text="总时长",
            font=ctk.CTkFont(family=FONT_FAMILY, size=11), text_color=COLOR_SECONDARY,
        ).pack(pady=(0, 16))

        # --- 最近活动 ---
        ctk.CTkLabel(
            tab, text="最近活动",
            font=ctk.CTkFont(family=FONT_FAMILY, size=12, weight="bold"),
            text_color=COLOR_SECONDARY, anchor="w",
        ).pack(padx=40, pady=(20, 6), anchor="w")

        self.activity_list = ctk.CTkScrollableFrame(
            tab, corner_radius=12, fg_color=COLOR_CARD, height=210,
        )
        self.activity_list.pack(padx=36, fill="x", pady=(0, 12))
        self.activity_list.columnconfigure(0, minsize=46)
        self.activity_list.columnconfigure(1, weight=1)
        self.activity_list.columnconfigure(2, minsize=46)

    # =============================================
    # 标签页 2：今日日记
    # =============================================

    def _build_journal_page(self):
        tab = self.pages["journal"]

        main_frame = ctk.CTkFrame(tab, fg_color="transparent")
        main_frame.pack(fill="both", expand=True, padx=12, pady=4)
        main_frame.columnconfigure(0, weight=3)
        main_frame.columnconfigure(1, weight=1)
        main_frame.rowconfigure(1, weight=1)

        # --- 日期选择器 ---
        date_frame = ctk.CTkFrame(main_frame, fg_color="transparent")
        date_frame.grid(row=0, column=0, columnspan=2, sticky="ew", pady=(0, 10))

        self.journal_date = date.today()

        ctk.CTkButton(
            date_frame, text="‹", width=32, height=32, corner_radius=16,
            font=ctk.CTkFont(size=16, weight="bold"),
            fg_color=COLOR_CARD, hover_color=COLOR_BORDER,
            text_color=COLOR_TEXT,
            command=self._journal_prev_day,
        ).pack(side="left")

        # --- 日历样式 ---
        style = ttk.Style(date_frame)
        style.theme_use("clam")
        style.configure("White.DateEntry",
                         fieldbackground="white", background="white",
                         foreground=COLOR_TEXT, arrowcolor=COLOR_SECONDARY,
                         bordercolor=COLOR_BORDER, lightcolor="white",
                         darkcolor=COLOR_BORDER)

        self.date_entry = DateEntry(
            date_frame, width=14, date_pattern="yyyy-mm-dd",
            font=(FONT_FAMILY, 11), justify="center",
            style="White.DateEntry",
            background="white", foreground=COLOR_TEXT,
            headersbackground="white", headersforeground=COLOR_TEXT,
            selectbackground=COLOR_BTN, selectforeground="white",
            normalbackground="white", normalforeground=COLOR_TEXT,
            weekendbackground="#fafafa", weekendforeground=COLOR_SECONDARY,
            othermonthbackground="#f5f5f5", othermonthforeground="#cccccc",
            othermonthwebackground="#f5f5f5", othermonthweforeground="#cccccc",
            bordercolor=COLOR_BORDER, borderwidth=1,
        )
        self.date_entry.set_date(self.journal_date)
        self.date_entry.pack(side="left", padx=6)
        self.date_entry.bind("<<DateEntrySelected>>", self._on_date_selected)

        ctk.CTkButton(
            date_frame, text="›", width=32, height=32, corner_radius=16,
            font=ctk.CTkFont(size=16, weight="bold"),
            fg_color=COLOR_CARD, hover_color=COLOR_BORDER,
            text_color=COLOR_TEXT,
            command=self._journal_next_day,
        ).pack(side="left")

        ctk.CTkButton(
            date_frame, text="今天", width=52, height=28, corner_radius=14,
            font=ctk.CTkFont(family=FONT_FAMILY, size=11),
            fg_color=COLOR_CARD, hover_color=COLOR_BORDER,
            text_color=COLOR_TEXT, border_width=0,
            command=self._journal_go_today,
        ).pack(side="left", padx=(12, 0))

        # --- 编辑区 ---
        editor_frame = ctk.CTkFrame(main_frame, corner_radius=12, fg_color=COLOR_CARD, border_width=0)
        editor_frame.grid(row=1, column=0, sticky="nsew", padx=(0, 8))
        editor_frame.rowconfigure(0, weight=1)
        editor_frame.columnconfigure(0, weight=1)

        self.journal_editor = ctk.CTkTextbox(
            editor_frame, font=ctk.CTkFont(family="Consolas", size=13),
            wrap="word", corner_radius=10,
            fg_color="white", text_color=COLOR_TEXT,
            border_width=0,
        )
        self.journal_editor.pack(fill="both", expand=True, padx=6, pady=6)

        # --- 活动摘要侧边栏 ---
        sidebar = ctk.CTkFrame(main_frame, corner_radius=12, fg_color=COLOR_CARD, width=170, border_width=0)
        sidebar.grid(row=1, column=1, sticky="nsew")
        sidebar.grid_propagate(False)

        ctk.CTkLabel(
            sidebar, text="活动摘要",
            font=ctk.CTkFont(family=FONT_FAMILY, size=12, weight="bold"),
            text_color=COLOR_SECONDARY,
        ).pack(pady=(14, 8))

        self.summary_frame = ctk.CTkScrollableFrame(
            sidebar, fg_color="transparent",
        )
        self.summary_frame.pack(fill="both", expand=True, padx=8, pady=(0, 8))

        # --- 底部按钮栏 ---
        btn_frame = ctk.CTkFrame(main_frame, fg_color="transparent")
        btn_frame.grid(row=2, column=0, columnspan=2, sticky="ew", pady=(10, 0))

        self.ai_btn = ctk.CTkButton(
            btn_frame, text="AI 生成", width=100, height=34,
            corner_radius=17,
            font=ctk.CTkFont(family=FONT_FAMILY, size=12, weight="bold"),
            fg_color=COLOR_BTN, hover_color=COLOR_BTN_HOVER,
            text_color="white",
            command=self._ai_generate,
        )
        self.ai_btn.pack(side="left", padx=(0, 8))

        self.save_btn = ctk.CTkButton(
            btn_frame, text="保存", width=80, height=34,
            corner_radius=17,
            font=ctk.CTkFont(family=FONT_FAMILY, size=12, weight="bold"),
            fg_color=COLOR_GREEN, hover_color=COLOR_GREEN_HOVER,
            text_color="white",
            command=self._save_journal,
        )
        self.save_btn.pack(side="left")

        self.journal_status = ctk.CTkLabel(
            btn_frame, text="",
            font=ctk.CTkFont(family=FONT_FAMILY, size=11),
            text_color=COLOR_SECONDARY,
        )
        self.journal_status.pack(side="left", padx=12)

        # 加载当天日记
        self._load_journal_for_date(self.journal_date)

    # =============================================
    # 标签页 3：设置
    # =============================================

    def _build_settings_page(self):
        tab = self.pages["settings"]

        container = ctk.CTkScrollableFrame(tab, fg_color="transparent")
        container.pack(fill="both", expand=True, padx=24, pady=8)

        font_label = ctk.CTkFont(family=FONT_FAMILY, size=12, weight="bold")
        font_val = ctk.CTkFont(family=FONT_FAMILY, size=12)

        # --- API Key ---
        ctk.CTkLabel(container, text="Claude API Key", font=font_label,
                      text_color=COLOR_SECONDARY).pack(anchor="w", pady=(20, 6))
        self.api_key_entry = ctk.CTkEntry(
            container, show="•", width=420, height=38, font=font_val,
            corner_radius=10, fg_color=COLOR_CARD, border_width=0,
            text_color=COLOR_TEXT,
        )
        self.api_key_entry.pack(anchor="w")
        self.api_key_entry.insert(0, self.config.get("api_key", ""))

        # --- Model ---
        ctk.CTkLabel(container, text="API Model", font=font_label,
                      text_color=COLOR_SECONDARY).pack(anchor="w", pady=(20, 6))
        self.model_var = ctk.StringVar(value=self.config.get("model", "claude-sonnet-4-5-20250929"))
        self.model_menu = ctk.CTkOptionMenu(
            container, variable=self.model_var, width=360, height=38,
            fg_color=COLOR_CARD, button_color=COLOR_BORDER,
            button_hover_color=COLOR_SECONDARY,
            text_color=COLOR_TEXT, corner_radius=10,
            values=[
                "claude-opus-4-6",
                "claude-opus-4-5-20251101",
                "claude-sonnet-4-5-20250929",
                "claude-haiku-4-5-20251001",
            ],
        )
        self.model_menu.pack(anchor="w")

        # --- 日记语言 ---
        ctk.CTkLabel(container, text="日记语言", font=font_label,
                      text_color=COLOR_SECONDARY).pack(anchor="w", pady=(20, 6))
        self.lang_var = ctk.StringVar(value=self.config.get("language", "bilingual"))
        self.lang_menu = ctk.CTkOptionMenu(
            container, variable=self.lang_var, width=200, height=38,
            fg_color=COLOR_CARD, button_color=COLOR_BORDER,
            button_hover_color=COLOR_SECONDARY,
            text_color=COLOR_TEXT, corner_radius=10,
            values=["中文", "English", "混合"],
        )
        # 显示当前值的中文映射
        lang_display = {"chinese": "中文", "english": "English", "bilingual": "混合"}
        self.lang_var.set(lang_display.get(self.config.get("language", "bilingual"), "混合"))
        self.lang_menu.pack(anchor="w")

        # --- 数据存放目录 ---
        ctk.CTkLabel(container, text="数据存放目录", font=font_label,
                      text_color=COLOR_SECONDARY).pack(anchor="w", pady=(20, 6))
        dir_frame = ctk.CTkFrame(container, fg_color="transparent")
        dir_frame.pack(anchor="w", fill="x")
        self.data_dir_entry = ctk.CTkEntry(
            dir_frame, width=340, height=38, font=font_val,
            corner_radius=10, fg_color=COLOR_CARD, border_width=0,
            text_color=COLOR_TEXT,
        )
        self.data_dir_entry.pack(side="left")
        self.data_dir_entry.insert(0, self.config.get("data_dir", str(APP_DIR / "data")))
        ctk.CTkButton(
            dir_frame, text="浏览", width=60, height=38,
            corner_radius=10,
            font=ctk.CTkFont(family=FONT_FAMILY, size=12),
            fg_color=COLOR_CARD, hover_color=COLOR_BORDER,
            text_color=COLOR_TEXT,
            command=self._browse_data_dir,
        ).pack(side="left", padx=(8, 0))

        # --- 监测间隔 ---
        ctk.CTkLabel(container, text="监测间隔（秒）", font=font_label,
                      text_color=COLOR_SECONDARY).pack(anchor="w", pady=(20, 6))
        self.interval_entry = ctk.CTkEntry(
            container, width=120, height=38, font=font_val,
            corner_radius=10, fg_color=COLOR_CARD, border_width=0,
            text_color=COLOR_TEXT,
        )
        self.interval_entry.pack(anchor="w")
        self.interval_entry.insert(0, str(self.config.get("interval", 30)))

        # --- 保存按钮 ---
        self.settings_save_btn = ctk.CTkButton(
            container, text="保存设置", width=120, height=38,
            corner_radius=19,
            font=ctk.CTkFont(family=FONT_FAMILY, size=12, weight="bold"),
            fg_color=COLOR_BTN, hover_color=COLOR_BTN_HOVER,
            text_color="white",
            command=self._save_settings,
        )
        self.settings_save_btn.pack(anchor="w", pady=(24, 6))

        self.settings_status = ctk.CTkLabel(
            container, text="", font=ctk.CTkFont(family=FONT_FAMILY, size=11),
            text_color=COLOR_SECONDARY,
        )
        self.settings_status.pack(anchor="w")

    # =============================================
    # 系统托盘
    # =============================================

    def _setup_tray(self):
        menu = pystray.Menu(
            pystray.MenuItem("显示窗口", self._show_window, default=True),
            pystray.MenuItem("退出", self._quit_app),
        )
        self.tray_icon = pystray.Icon(
            "小蓝鸟", make_tray_icon(), "小蓝鸟 - 已停止", menu,
        )
        threading.Thread(target=self.tray_icon.run, daemon=True).start()

    def _update_tray(self, running):
        if not hasattr(self, "tray_icon"):
            return
        if running:
            self.tray_icon.icon = make_tray_icon("#22c55e")
            self.tray_icon.title = "小蓝鸟 - 监测中"
        else:
            self.tray_icon.icon = make_tray_icon("#888888")
            self.tray_icon.title = "小蓝鸟 - 已停止"

    def _show_window(self, *args):
        self.after(0, lambda: (self.deiconify(), self.lift(), self.focus_force()))

    def _quit_app(self, *args):
        if self.tracker.running:
            self.tracker.stop()
        if hasattr(self, "tray_icon"):
            self.tray_icon.stop()
        self.after(0, self.destroy)

    def _on_close(self):
        self.withdraw()

    # =============================================
    # 活动监测 - 逻辑方法
    # =============================================

    def _toggle_monitor(self):
        if self.tracker.running:
            self.tracker.stop()
            self.status_dot.configure(text_color=COLOR_SECONDARY)
            self.status_label.configure(text="未运行", text_color=COLOR_SECONDARY)
            self.toggle_btn.configure(text="开始监测")
            self.nav_status_dot.configure(text_color=COLOR_SECONDARY)
            self._update_statusbar()
            self._update_tray(False)
        else:
            self.thread = threading.Thread(target=self.tracker.run, daemon=True)
            self.thread.start()
            self.status_dot.configure(text_color=COLOR_GREEN)
            self.status_label.configure(text="监测中", text_color=COLOR_GREEN)
            self.toggle_btn.configure(text="停止监测")
            self.nav_status_dot.configure(text_color=COLOR_GREEN)
            self._update_statusbar()
            self._update_tray(True)

    def _load_today_activity(self):
        try:
            self.entries_data = load_activity_entries(date.today())
            self.entry_count = len(self.entries_data)
            self.total_duration = sum(e.get("duration", 0) for e in self.entries_data)
            self._update_stats()
            self._rebuild_activity_list()
        except Exception:
            pass

    def _update_stats(self):
        self.count_val.configure(text=str(self.entry_count))
        self.dur_val.configure(text=fmt_duration(self.total_duration))

    def _update_statusbar(self):
        """Update the bottom status bar text."""
        if self.tracker.running:
            self.statusbar_left.configure(text=f"监测中 · {self.entry_count} 条记录")
        else:
            self.statusbar_left.configure(text="未启动监测")
        self.statusbar_right.configure(text=date.today().isoformat())

    def _rebuild_activity_list(self):
        for w in self.activity_list.winfo_children():
            w.destroy()
        font_small = ctk.CTkFont(family=FONT_FAMILY, size=12)
        recent = self.entries_data[-20:]
        for row, entry in enumerate(reversed(recent)):
            ts = entry.get("ts", "")[-8:-3]
            title = entry.get("title", "")
            if len(title) > 35:
                title = title[:33] + "…"
            dur = fmt_duration(entry.get("duration", 0))

            ctk.CTkLabel(
                self.activity_list, text=ts,
                font=font_small, text_color=COLOR_SECONDARY,
            ).grid(row=row, column=0, sticky="w", padx=(5, 8), pady=2)
            ctk.CTkLabel(
                self.activity_list, text=title,
                font=font_small, text_color=COLOR_TEXT, anchor="w",
            ).grid(row=row, column=1, sticky="w", pady=2)
            ctk.CTkLabel(
                self.activity_list, text=dur,
                font=font_small, text_color=COLOR_SECONDARY,
            ).grid(row=row, column=2, sticky="e", padx=(8, 5), pady=2)

    def _on_new_entry(self, entry):
        self.entry_count += 1
        self.total_duration += entry.get("duration", 0)
        self.entries_data.append(entry)
        self.after(0, lambda: (self._update_stats(), self._rebuild_activity_list(), self._update_statusbar()))

    # =============================================
    # 日记 - 日期导航
    # =============================================

    def _format_date(self, d):
        weekdays = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]
        return f"{d.isoformat()}  {weekdays[d.weekday()]}"

    def _journal_prev_day(self):
        self.journal_date -= timedelta(days=1)
        self._refresh_journal_view()

    def _journal_next_day(self):
        self.journal_date += timedelta(days=1)
        self._refresh_journal_view()

    def _journal_go_today(self):
        self.journal_date = date.today()
        self._refresh_journal_view()

    def _on_date_selected(self, event=None):
        """日历选择日期后触发。"""
        self.journal_date = self.date_entry.get_date()
        self._load_journal_for_date(self.journal_date)
        self._load_summary_for_date(self.journal_date)

    def _refresh_journal_view(self):
        self.date_entry.set_date(self.journal_date)
        self._load_journal_for_date(self.journal_date)
        self._load_summary_for_date(self.journal_date)

    # =============================================
    # 日记 - 加载 / 保存
    # =============================================

    def _load_journal_for_date(self, d):
        self.journal_editor.delete("1.0", "end")
        fp = JOURNAL_DIR / f"{d.isoformat()}.md"
        if fp.exists():
            with open(fp, "r", encoding="utf-8") as f:
                self.journal_editor.insert("1.0", f.read())
            self.journal_status.configure(text="已加载")
        else:
            self.journal_status.configure(text="暂无日记")
        self._load_summary_for_date(d)

    def _save_journal(self):
        content = self.journal_editor.get("1.0", "end").strip()
        if not content:
            self.journal_status.configure(text="内容为空，未保存")
            return
        fp = JOURNAL_DIR / f"{self.journal_date.isoformat()}.md"
        with open(fp, "w", encoding="utf-8") as f:
            f.write(content + "\n")
        self.journal_status.configure(text=f"已保存到 {fp.name}")

    # =============================================
    # 日记 - 活动摘要侧边栏
    # =============================================

    def _load_summary_for_date(self, d):
        for w in self.summary_frame.winfo_children():
            w.destroy()
        entries = load_activity_entries(d)
        if not entries:
            ctk.CTkLabel(
                self.summary_frame, text="暂无活动数据",
                font=ctk.CTkFont(family=FONT_FAMILY, size=11),
                text_color=COLOR_SECONDARY,
            ).pack(pady=10)
            return
        summary = summarize_activities(entries)
        font_cat = ctk.CTkFont(family=FONT_FAMILY, size=12)
        font_dur = ctk.CTkFont(family=FONT_FAMILY, size=11)
        for cat, secs in summary.items():
            row = ctk.CTkFrame(self.summary_frame, fg_color="transparent")
            row.pack(fill="x", pady=2)
            ctk.CTkLabel(row, text=cat, font=font_cat, text_color=COLOR_TEXT).pack(
                side="left", padx=(2, 0))
            ctk.CTkLabel(
                row, text=fmt_duration(secs), font=font_dur, text_color=COLOR_SECONDARY,
            ).pack(side="right", padx=(0, 2))

    # =============================================
    # 日记 - AI 生成
    # =============================================

    def _ai_generate(self):
        api_key = self.config.get("api_key", "")
        if not api_key:
            self.journal_status.configure(text="请先在设置中填写 API Key")
            self._switch_page("settings")
            return

        # 收集活动数据
        entries = load_activity_entries(self.journal_date)
        existing_text = self.journal_editor.get("1.0", "end").strip()

        self.ai_btn.configure(state="disabled", text="生成中...")
        self.journal_status.configure(text="正在调用 Claude API...")

        threading.Thread(
            target=self._ai_generate_thread,
            args=(api_key, entries, existing_text),
            daemon=True,
        ).start()

    def _ai_generate_thread(self, api_key, entries, existing_text):
        try:
            import anthropic
            client = anthropic.Anthropic(api_key=api_key)

            # 构建活动摘要
            activity_text = ""
            if entries:
                summary = summarize_activities(entries)
                lines = [f"- {cat}: {fmt_duration(secs)}" for cat, secs in summary.items()]
                activity_text = "今日活动统计：\n" + "\n".join(lines)

                # 添加详细活动列表（最近 30 条）
                detail_lines = []
                for e in entries[-30:]:
                    ts = e.get("ts", "")[-8:-3]
                    title = e.get("title", "")
                    exe = e.get("exe", "")
                    dur = fmt_duration(e.get("duration", 0))
                    detail_lines.append(f"  {ts} [{exe}] {title} ({dur})")
                activity_text += "\n\n详细活动记录：\n" + "\n".join(detail_lines)

            # 构建 prompt
            lang = self.config.get("language", "bilingual")
            weekdays = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]
            date_str = f"{self.journal_date.isoformat()} {weekdays[self.journal_date.weekday()]}"

            user_msg = f"请根据以下信息，为 {date_str} 写一篇日记。\n\n"
            if activity_text:
                user_msg += f"{activity_text}\n\n"
            if existing_text:
                user_msg += f"用户手动备注：\n{existing_text}\n\n"
            if not activity_text and not existing_text:
                user_msg += "（今天没有活动数据和备注，请写一篇简短的日记占位。）\n\n"

            if lang == "bilingual":
                user_msg += "请使用混合格式：先写中文正文，然后分隔线 ---，再写英文版本。"
            elif lang == "english":
                user_msg += "Please write the journal in English."
            else:
                user_msg += "请使用中文写日记。"

            system_prompt = (
                "你是一个日记助手。根据用户提供的电脑活动数据和备注，写一篇自然的日记。\n"
                "要求：\n"
                "- 第一人称\n"
                "- 按时间/事件顺序组织\n"
                "- 润色总结，不是流水账。提炼、归纳，合并同类事项\n"
                "- 技术细节适当简化，记录做了什么和结果如何\n"
                "- 保留情绪和感受\n"
                "- 语气自然口语化\n"
                "- 格式：# YYYY-MM-DD 星期X 开头\n"
                "- 如果是双语，中文在上，英文在下，用 --- 分隔\n"
                "- 末尾加 *记录时间：HH:MM*"
            )

            model = self.config.get("model", "claude-sonnet-4-20250514")
            response = client.messages.create(
                model=model,
                max_tokens=2000,
                system=system_prompt,
                messages=[{"role": "user", "content": user_msg}],
            )

            result = response.content[0].text
            self.after(0, lambda: self._ai_generate_done(result))

        except Exception as e:
            self.after(0, lambda: self._ai_generate_done(None, str(e)))

    def _ai_generate_done(self, result, error=None):
        self.ai_btn.configure(state="normal", text="AI 生成")
        if error:
            self.journal_status.configure(text=f"生成失败：{error[:50]}")
            return
        self.journal_editor.delete("1.0", "end")
        self.journal_editor.insert("1.0", result)
        self.journal_status.configure(text="AI 生成完成，请检查后保存")

    # =============================================
    # 设置 - 保存
    # =============================================

    def _browse_data_dir(self):
        """弹出文件夹选择对话框。"""
        path = filedialog.askdirectory(
            title="选择数据存放目录",
            initialdir=self.data_dir_entry.get(),
        )
        if path:
            self.data_dir_entry.delete(0, "end")
            self.data_dir_entry.insert(0, path)

    def _save_settings(self):
        self.config["api_key"] = self.api_key_entry.get().strip()
        self.config["model"] = self.model_var.get()
        # 中文显示值 → 英文存储值
        lang_map = {"中文": "chinese", "English": "english", "混合": "bilingual"}
        self.config["language"] = lang_map.get(self.lang_var.get(), "bilingual")
        try:
            interval = int(self.interval_entry.get().strip())
            if interval < 5:
                interval = 5
            self.config["interval"] = interval
            self.tracker.interval = interval
        except ValueError:
            pass
        # 数据目录
        new_dir = self.data_dir_entry.get().strip()
        if new_dir:
            self.config["data_dir"] = new_dir
            apply_data_dir(new_dir)
        save_config(self.config)
        self.settings_status.configure(text="设置已保存 ✓")


# === 启动入口 ===

if __name__ == "__main__":
    DailyJournalApp().mainloop()
