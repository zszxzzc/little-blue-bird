use reqwest::header::{HeaderMap, AUTHORIZATION, CONTENT_TYPE};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use futures_util::StreamExt;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AIProvider {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub api_key: String,
    #[serde(default)]
    pub base_url: String,
    #[serde(default)]
    pub model: String,
    #[serde(default = "default_temperature")]
    pub temperature: f64,
    #[serde(default = "default_enabled")]
    pub enabled: bool,
}

fn default_temperature() -> f64 { 0.7 }
fn default_enabled() -> bool { true }

#[derive(Serialize)]
struct ChatRequest {
    model: String,
    messages: Vec<ChatMessage>,
    temperature: f64,
    stream: bool,
}

#[derive(Serialize)]
struct ChatMessage {
    role: String,
    content: String,
}

#[derive(Deserialize)]
struct StreamChunk {
    choices: Vec<StreamChoice>,
}

#[derive(Deserialize)]
struct StreamChoice {
    delta: Delta,
}

#[derive(Deserialize)]
struct Delta {
    #[serde(default)]
    content: Option<String>,
}

impl AIProvider {
    /// 流式调用 OpenAI 兼容 API
    pub async fn chat_stream(
        &self,
        app: &AppHandle,
        system: &str,
        user_msg: &str,
    ) -> Result<String, String> {
        if self.api_key.is_empty() {
            return Err("API Key 未配置".to_string());
        }
        let url = format!("{}/chat/completions", self.base_url.trim_end_matches('/'));

        let mut headers = HeaderMap::new();
        headers.insert(AUTHORIZATION, format!("Bearer {}", self.api_key).parse().unwrap());
        headers.insert(CONTENT_TYPE, "application/json".parse().unwrap());

        let body = ChatRequest {
            model: self.model.clone(),
            messages: vec![
                ChatMessage { role: "system".to_string(), content: system.to_string() },
                ChatMessage { role: "user".to_string(), content: user_msg.to_string() },
            ],
            temperature: self.temperature,
            stream: true,
        };

        let client = reqwest::Client::new();
        let resp = client.post(&url)
            .headers(headers)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("请求失败: {}", e))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(format!("API 返回 {}: {}", status, text));
        }

        let mut full_text = String::new();
        let mut stream = resp.bytes_stream();

        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| format!("读取流失败: {}", e))?;
            let text = String::from_utf8_lossy(&chunk);

            for line in text.lines() {
                let line = line.trim();
                if !line.starts_with("data: ") { continue; }
                let data = &line[6..];
                if data == "[DONE]" { break; }

                if let Ok(parsed) = serde_json::from_str::<StreamChunk>(data) {
                    if let Some(choice) = parsed.choices.first() {
                        if let Some(ref content) = choice.delta.content {
                            full_text.push_str(content);
                            let _ = app.emit("ai-chunk", content.clone());
                        }
                    }
                }
            }
        }

        let _ = app.emit("ai-done", ());

        if full_text.trim().is_empty() {
            return Err("API 返回空内容".to_string());
        }
        Ok(full_text.trim().to_string())
    }

    /// 测试连接：发一条简单消息
    pub async fn test_connection(&self) -> Result<bool, String> {
        if self.api_key.is_empty() {
            return Err("API Key 未配置".to_string());
        }
        let url = format!("{}/chat/completions", self.base_url.trim_end_matches('/'));

        let mut headers = HeaderMap::new();
        headers.insert(AUTHORIZATION, format!("Bearer {}", self.api_key).parse().unwrap());
        headers.insert(CONTENT_TYPE, "application/json".parse().unwrap());

        let body = ChatRequest {
            model: self.model.clone(),
            messages: vec![
                ChatMessage { role: "user".to_string(), content: "Hi".to_string() },
            ],
            temperature: 0.1,
            stream: false,
        };

        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(15))
            .build()
            .map_err(|e| e.to_string())?;

        let resp = client.post(&url)
            .headers(headers)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("连接失败: {}", e))?;

        if resp.status().is_success() {
            Ok(true)
        } else {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            Err(format!("API 返回 {}: {}", status, text))
        }
    }
}

/// 从配置中获取写作模块使用的 AI Provider
pub fn get_writing_provider() -> Result<AIProvider, String> {
    let cfg_path = crate::config::config_path();
    let raw: serde_json::Value = if cfg_path.exists() {
        let content = std::fs::read_to_string(&cfg_path).map_err(|e| e.to_string())?;
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        serde_json::Value::default()
    };

    let writing_provider_id = raw.get("writing_provider")
        .and_then(|v| v.as_str())
        .or_else(|| raw.get("active_provider").and_then(|v| v.as_str()))
        .unwrap_or("");

    // 从 ai_providers 数组中查找
    if let Some(providers) = raw.get("ai_providers").and_then(|v| v.as_array()) {
        if let Some(p) = providers.iter().find(|p| {
            p.get("id").and_then(|v| v.as_str()) == Some(writing_provider_id)
        }) {
            let provider: AIProvider = serde_json::from_value(p.clone())
                .map_err(|e| format!("解析 provider 失败: {}", e))?;
            return Ok(provider);
        }
    }

    // 回退：使用旧的 api_key + model 字段
    let api_key = raw.get("api_key").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let model = raw.get("model").and_then(|v| v.as_str()).unwrap_or("deepseek-chat").to_string();

    if api_key.is_empty() {
        return Err("请先在设置中配置 AI 接口".to_string());
    }

    Ok(AIProvider {
        id: "legacy".to_string(),
        name: "默认".to_string(),
        api_key,
        base_url: "https://api.deepseek.com/v1".to_string(),
        model,
        temperature: 0.7,
        enabled: true,
    })
}
