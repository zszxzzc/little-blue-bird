# 小蓝鸟 (XiaoLanNiao)

一只住在你桌面的小鸡，默默观察你的电脑使用习惯，用 AI 帮你写日记、吐槽你的摸鱼、记录你的成长。

## 功能

- **活动监测** — 自动记录窗口使用时长，按类别统计（编程/浏览器/游戏/社交等）
- **AI 日记** — 基于当天活动数据，AI 自动生成或整理日记
- **心情系统** — 小鸡根据你的行为表现不同心情和台词
- **人格系统** — 4种性格可选（温柔/毒舌/中二/社恐），影响所有文案风格
- **番茄钟** — 内置专注计时器
- **反派系统** — 识别你的分心源，拟人化成反派角色，支持封印/谈判
- **梗库** — 自动检测行为模式生成专属梗，也可手动添加
- **社交能量条** — 基于聊天软件使用时长，过载时提醒休息
- **桌面世界观** — 活动数据映射成可视化小世界地图，区域随使用成长升级
- **记忆小剧场** — AI 生成轻小说风格的"一日番外"，带平行世界分支
- **英语词汇拾取** — 从窗口标题提取英文单词，AI 生成风格化例句
- **灵感炼金术** — 灵感速记 + AI 聚类合成，零散想法变成可用素材
- **收藏馆** — 长期数据可视化展示：工具展柜、关键词云、梗库精选

## 技术栈

- **框架**: Tauri 2 (Rust 后端 + WebView 前端)
- **前端**: 原生 HTML/CSS/JS，无框架无构建工具
- **后端**: Rust，每个功能独立模块
- **AI**: DeepSeek API (OpenAI 兼容协议)，流式输出
- **数据**: 本地 JSON/JSONL/Markdown 文件存储

## 项目结构

```
src/                    # 前端
  index.html            # 单页应用，所有页面
  styles/main.css       # 全局样式（支持浅色/深色主题）
  scripts/
    app.js              # 页面切换、主题切换
    home.js             # 主页（心情、反派、小剧场、词汇）
    monitor.js          # 活动监测页
    journal.js          # 日记页
    settings.js         # 设置、梗库弹窗
    world.js            # 桌面世界观
    inspiration.js      # 灵感炼金术
    museum.js           # 收藏馆
    personality.js      # 人格选择

src-tauri/src/          # Rust 后端
  main.rs               # 入口，命令注册
  commands.rs            # Tauri 命令层
  tracker.rs             # 窗口活动追踪器
  activity.rs            # 活动数据读写与统计
  journal.rs             # 日记 CRUD
  claude_api.rs          # AI API 调用（流式）
  config.rs              # 配置管理
  mood.rs                # 小鸡心情评估
  personality.rs         # 人格系统（4种性格 + 好感度成长）
  social.rs              # 社交能量评估
  villain.rs             # 反派检测与封印
  memes.rs               # 梗库（自动检测 + 手动管理）
  world.rs               # 桌面世界观（区域经验值与升级）
  theater.rs             # 记忆小剧场
  vocab.rs               # 英语词汇拾取
  inspiration.rs         # 灵感炼金术
  tray_icon.rs           # 系统托盘图标
```

## 开发

```bash
# 安装依赖
cd src-tauri && cargo build

# 开发运行
cargo tauri dev

# 构建发布
cargo tauri build
```

## 配置

首次运行后在设置页填写：
- **API Key**: DeepSeek API 密钥
- **数据目录**: 活动数据存放路径（默认 `data/`）
- **每日目标**: 每日活动时长目标（分钟）

## 版本记录

### v0 — 初代版本 (2026-02-11)

基础框架 + 全部核心功能实现：
- 活动监测、AI 日记、心情系统、番茄钟
- 人格系统（4种性格）、反派系统、梗库、社交能量条
- 桌面世界观、记忆小剧场
- 英语词汇拾取、灵感炼金术、收藏馆
- 人格好感度成长、反派进化机制
