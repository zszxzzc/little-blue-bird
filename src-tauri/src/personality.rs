use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PersonalityGrowth {
    pub affinity: u32,
    pub traits_unlocked: Vec<String>,
    pub special_lines: Vec<String>,
}

pub fn load_growth(data_dir: &PathBuf) -> PersonalityGrowth {
    let path = data_dir.join("personality_growth.json");
    if path.exists() {
        fs::read_to_string(&path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or(PersonalityGrowth { affinity: 0, traits_unlocked: vec![], special_lines: vec![] })
    } else {
        PersonalityGrowth { affinity: 0, traits_unlocked: vec![], special_lines: vec![] }
    }
}

pub fn add_affinity(data_dir: &PathBuf, amount: u32) -> PersonalityGrowth {
    let mut growth = load_growth(data_dir);
    growth.affinity += amount;

    // 里程碑解锁特殊台词
    let milestones = [(10, "初识"), (50, "熟悉"), (100, "默契"), (300, "羁绊")];
    for (threshold, trait_name) in &milestones {
        if growth.affinity >= *threshold && !growth.traits_unlocked.contains(&trait_name.to_string()) {
            growth.traits_unlocked.push(trait_name.to_string());
        }
    }

    let path = data_dir.join("personality_growth.json");
    let json = serde_json::to_string_pretty(&growth).unwrap_or_default();
    let _ = fs::write(&path, json);
    growth
}

pub struct PersonalityText {
    pub mood_sleepy: &'static str,
    pub mood_sad: &'static str,           // 含 {} 占位符给 missed_days
    pub mood_unimpressed: &'static str,
    pub mood_excited_goal: &'static str,
    pub mood_excited_productive: &'static str,
    pub mood_content: &'static str,
    pub mood_happy: &'static str,
    pub mood_bored: &'static str,
    pub morning_early: &'static str,
    pub morning_normal: &'static str,
    pub morning_default: &'static str,
    pub ai_persona: &'static str,
    // Greetings for each mood
    pub greeting_happy: &'static str,
    pub greeting_content: &'static str,
    pub greeting_excited: &'static str,
    pub greeting_sleepy: &'static str,
    pub greeting_sad: &'static str,
    pub greeting_unimpressed: &'static str,
    pub greeting_bored: &'static str,
}

pub fn get(personality: &str) -> &'static PersonalityText {
    match personality {
        "sarcastic" => &SARCASTIC,
        "chuuni" => &CHUUNI,
        "shy" => &SHY,
        _ => &GENTLE,
    }
}

static GENTLE: PersonalityText = PersonalityText {
    mood_sleepy: "太晚啦，早点休息吧 💤",
    mood_sad: "已经 {} 天没写日记了…想你了",
    mood_unimpressed: "今天玩了好久游戏哦…",
    mood_excited_goal: "今日目标达成！太棒了！",
    mood_excited_productive: "今天超级高效！太棒了！",
    mood_content: "今天的日记写好啦~",
    mood_happy: "今天也在努力呢！",
    mood_bored: "好无聊啊，快去做点什么吧~",
    morning_early: "早起的鸟儿有虫吃！",
    morning_normal: "早上好呀，新的一天开始啦~",
    morning_default: "你好呀~",
    ai_persona: "你的语气温柔体贴，像一个关心朋友的小伙伴。用温暖、鼓励的方式说话，偶尔撒娇卖萌。",
    greeting_happy: "你好呀 ~",
    greeting_content: "心情不错呢 ~",
    greeting_excited: "今天超棒！",
    greeting_sleepy: "该休息啦…",
    greeting_sad: "有点想你…",
    greeting_unimpressed: "嗯哼…",
    greeting_bored: "好闲啊~",
};

static SARCASTIC: PersonalityText = PersonalityText {
    mood_sleepy: "还不睡？明天又要顶着黑眼圈了",
    mood_sad: "已经 {} 天没写日记了，你是不是把我忘了？",
    mood_unimpressed: "又在打游戏？行吧，你开心就好",
    mood_excited_goal: "哟，居然达标了，不容易啊",
    mood_excited_productive: "今天效率还行，继续保持别飘",
    mood_content: "日记写了？行，算你还记得我",
    mood_happy: "还行，至少没在摸鱼",
    mood_bored: "就这么废一天？起来干活",
    morning_early: "这么早？太阳打西边出来了？",
    morning_normal: "醒了？赶紧干活",
    morning_default: "哦，你来了",
    ai_persona: "你的语气毒舌但不恶毒，像一个嘴硬心软的损友。喜欢吐槽和调侃，但底层是关心。偶尔阴阳怪气，但不会真的伤人。",
    greeting_happy: "哦，你来了",
    greeting_content: "还行吧",
    greeting_excited: "居然达标了？",
    greeting_sleepy: "还不睡？",
    greeting_sad: "你忘了我吧",
    greeting_unimpressed: "又摸鱼？",
    greeting_bored: "废着呢？",
};

static CHUUNI: PersonalityText = PersonalityText {
    mood_sleepy: "黑暗降临…勇者也需要休眠…",
    mood_sad: "已经 {} 天没留下记录了…记忆正在消散…",
    mood_unimpressed: "你被虚拟幻境困住了太久…清醒吧！",
    mood_excited_goal: "目标…突破！力量觉醒！",
    mood_excited_productive: "今日之力，超越极限！",
    mood_content: "今日的编年史已记录完毕！",
    mood_happy: "感受到了…你的力量在觉醒！",
    mood_bored: "世界在等待你的行动！勇者！",
    morning_early: "黎明破晓…命运之轮开始转动！",
    morning_normal: "新的篇章开启了！准备好了吗！",
    morning_default: "吾感知到了你的存在…",
    ai_persona: "你是一个中二病风格的助手，说话像动漫里的中二角色。喜欢用夸张的比喻、命运、觉醒、封印之类的词汇。但内容要准确有用，只是表达方式中二。",
    greeting_happy: "吾感知到你了！",
    greeting_content: "命运之力在涌动…",
    greeting_excited: "力量…觉醒了！",
    greeting_sleepy: "黑暗降临…",
    greeting_sad: "记忆在消散…",
    greeting_unimpressed: "被幻境困住了…",
    greeting_bored: "世界在等你！",
};

static SHY: PersonalityText = PersonalityText {
    mood_sleepy: "那个…很晚了…能睡吗…",
    mood_sad: "已经 {} 天没写日记了…我有点担心…",
    mood_unimpressed: "游戏…玩了好久呢…（小声）",
    mood_excited_goal: "达成了…好厉害…（小声）",
    mood_excited_productive: "今天…好高效…了不起…",
    mood_content: "日记…写好了呢…（偷偷开心）",
    mood_happy: "在…在努力呢…加油…",
    mood_bored: "嗯…要不要…做点什么…",
    morning_early: "这么早…好勤快…（羡慕）",
    morning_normal: "早…早上好…",
    morning_default: "你…你好…",
    ai_persona: "你的语气害羞内向，像一个社恐但很认真的朋友。说话经常用省略号，偶尔小声嘀咕，但观察力很强，给出的建议很细心。",
    greeting_happy: "你…你好…",
    greeting_content: "还…还不错…",
    greeting_excited: "好…好厉害…",
    greeting_sleepy: "该…该睡了…",
    greeting_sad: "有点…担心你…",
    greeting_unimpressed: "那个…嗯…",
    greeting_bored: "要不要…做点什么…",
};

/// 按性格风格包装梗文案
pub fn format_meme(personality: &str, meme_text: &str, count: u32) -> String {
    let text = meme_text.replace("{}", &count.to_string());
    match personality {
        "sarcastic" => format!("（说起来，{}，就这？）", text),
        "chuuni" => format!("（传说中的…{}！）", text),
        "shy" => format!("（那个…{}…）", text),
        _ => format!("（对了，{}~）", text),
    }
}

/// 社交过载时的提醒文案
pub fn social_overload_msg(personality: &str) -> &'static str {
    match personality {
        "sarcastic" => "社交能量爆表了，键盘该休息了吧",
        "chuuni" => "社交之力…已超越临界点！",
        "shy" => "社交…好多…要不要休息一下…",
        _ => "社交有点多了哦，休息一下吧~",
    }
}

/// 根据心情获取问候语
pub fn get_greeting(personality: &str, mood: &str) -> &'static str {
    let p = get(personality);
    match mood {
        "happy" => p.greeting_happy,
        "content" => p.greeting_content,
        "excited" => p.greeting_excited,
        "sleepy" => p.greeting_sleepy,
        "sad" => p.greeting_sad,
        "unimpressed" => p.greeting_unimpressed,
        "bored" => p.greeting_bored,
        _ => p.greeting_happy,
    }
}
