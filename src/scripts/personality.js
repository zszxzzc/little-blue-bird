// === 人格系统 - 前端文案 ===
const PERSONALITY = {
  gentle: {
    greetings: {
      happy: '你好呀 ~',
      content: '心情不错呢 ~',
      excited: '今天超棒！',
      sleepy: '该休息啦…',
      sad: '有点想你…',
      unimpressed: '嗯哼…',
      bored: '好闲啊~',
    },
    pomo: {
      focus: '专注中…',
      break_time: '休息一下~',
      idle: '专注时间',
      start: '开始专注',
      stop: '停止',
      skip: '跳过休息',
      count: (n) => `今日 ${n} 个番茄`,
    },
    monitor: {
      running: '监测中',
      stopped: '未运行',
      start: '开始监测',
      stop: '停止监测',
      status_running: (n) => `监测中 · ${n} 条记录`,
      status_stopped: '未启动监测',
      empty: '暂无活动记录',
    },
    journal: {
      loaded: '已加载',
      empty: '暂无日记',
      generating: '正在生成...',
      gen_done: '生成完成，请检查后保存',
      organizing: '正在整理...',
      org_done: '整理完成，请检查后保存',
      merging: '正在智能整合...',
      merge_done: '整合完成，请检查后保存',
    },
  },
  sarcastic: {
    greetings: {
      happy: '哦，你来了',
      content: '还行吧',
      excited: '居然达标了？',
      sleepy: '还不睡？',
      sad: '你忘了我吧',
      unimpressed: '又摸鱼？',
      bored: '废着呢？',
    },
    pomo: {
      focus: '别走神',
      break_time: '行，歇会儿',
      idle: '专注时间',
      start: '开始干活',
      stop: '摸了',
      skip: '不歇了',
      count: (n) => `今日 ${n} 个番茄（就这？）`,
    },
    monitor: {
      running: '监测中',
      stopped: '没开',
      start: '开始监测',
      stop: '关了吧',
      status_running: (n) => `盯着呢 · ${n} 条`,
      status_stopped: '没开监测，摸鱼呢？',
      empty: '啥也没干',
    },
    journal: {
      loaded: '已加载',
      empty: '空的，你猜为什么',
      generating: '在写了在写了...',
      gen_done: '写完了，看看行不行',
      organizing: '整理中...',
      org_done: '整好了，别嫌弃',
      merging: '合并中...',
      merge_done: '合完了，自己检查',
    },
  },
  chuuni: {
    greetings: {
      happy: '吾感知到你了！',
      content: '命运之力在涌动…',
      excited: '力量…觉醒了！',
      sleepy: '黑暗降临…',
      sad: '记忆在消散…',
      unimpressed: '被幻境困住了…',
      bored: '世界在等你！',
    },
    pomo: {
      focus: '封印解除中…',
      break_time: '蓄力阶段…',
      idle: '觉醒之刻',
      start: '开始觉醒',
      stop: '封印',
      skip: '跳过蓄力',
      count: (n) => `今日觉醒 ${n} 次`,
    },
    monitor: {
      running: '观测中',
      stopped: '休眠中',
      start: '开启观测',
      stop: '关闭观测',
      status_running: (n) => `观测中 · ${n} 条记录`,
      status_stopped: '观测系统休眠中',
      empty: '未检测到能量波动',
    },
    journal: {
      loaded: '编年史已载入',
      empty: '此页空白…尚无记录',
      generating: '编年史生成中…',
      gen_done: '编年史完成！请检阅',
      organizing: '重组记忆碎片中…',
      org_done: '记忆重组完毕',
      merging: '融合记忆中…',
      merge_done: '记忆融合完成',
    },
  },
  shy: {
    greetings: {
      happy: '你…你好…',
      content: '还…还不错…',
      excited: '好…好厉害…',
      sleepy: '该…该睡了…',
      sad: '有点…担心你…',
      unimpressed: '那个…嗯…',
      bored: '要不要…做点什么…',
    },
    pomo: {
      focus: '在…在专注…',
      break_time: '休…休息一下…',
      idle: '专注时间',
      start: '开…开始吧',
      stop: '停下来',
      skip: '不…不休了',
      count: (n) => `今日 ${n} 个番茄…（好厉害）`,
    },
    monitor: {
      running: '在…在监测',
      stopped: '没…没开',
      start: '开始监测',
      stop: '停止监测',
      status_running: (n) => `监测中… ${n} 条记录`,
      status_stopped: '还没开始监测…',
      empty: '还…还没有记录…',
    },
    journal: {
      loaded: '加载好了…',
      empty: '还没有日记…',
      generating: '在…在写了…',
      gen_done: '写…写好了，请看看…',
      organizing: '整理中…',
      org_done: '整…整理好了…',
      merging: '在…在合并…',
      merge_done: '合…合好了…',
    },
  },
};

// 当前性格
let currentPersonality = 'gentle';

// 访问器
function P() {
  return PERSONALITY[currentPersonality] || PERSONALITY.gentle;
}

// 从配置加载性格
async function loadPersonality() {
  try {
    const cfg = await invoke('get_config');
    if (cfg.personality && PERSONALITY[cfg.personality]) {
      currentPersonality = cfg.personality;
    }
  } catch (e) {
    console.error('load personality:', e);
  }
}

loadPersonality();