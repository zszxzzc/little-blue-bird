use futures_util::StreamExt;
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

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
        let auth = HeaderValue::from_str(&format!("Bearer {}", self.api_key))
            .map_err(|e| format!("invalid API key header: {}", e))?;
        headers.insert(AUTHORIZATION, auth);
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));

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
            .map_err(|e| format!("request failed: {}", e))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(format!("API returned {}: {}", status, text));
        }

        let mut full_text = String::new();
        let mut stream = resp.bytes_stream();
        let mut pending = String::new();
        let mut done = false;

        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| format!("stream read failed: {}", e))?;
            pending.push_str(&String::from_utf8_lossy(&chunk));

            while let Some(pos) = pending.find('\n') {
                let line = pending[..pos].trim().to_string();
                pending.drain(..=pos);
                if !line.starts_with("data: ") {
                    continue;
                }
                let data = &line[6..];
                if data == "[DONE]" {
                    done = true;
                    break;
                }

                if let Ok(parsed) = serde_json::from_str::<StreamChunk>(data) {
                    if let Some(choice) = parsed.choices.first() {
                        if let Some(ref content) = choice.delta.content {
                            full_text.push_str(content);
                            let _ = app.emit("ai-chunk", content.clone());
                        }
                    }
                }
            }

            if done {
                break;
            }
        }

        let tail = pending.trim();
        if !done && tail.starts_with("data: ") {
            let data = &tail[6..];
            if data != "[DONE]" {
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

    pub async fn test_connection(&self) -> Result<bool, String> {
        if self.api_key.is_empty() {
            return Err("API Key 未配置".to_string());
        }
        let url = format!("{}/chat/completions", self.base_url.trim_end_matches('/'));

        let mut headers = HeaderMap::new();
        let auth = HeaderValue::from_str(&format!("Bearer {}", self.api_key))
            .map_err(|e| format!("invalid API key header: {}", e))?;
        headers.insert(AUTHORIZATION, auth);
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));

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
            .map_err(|e| format!("connection failed: {}", e))?;

        if resp.status().is_success() {
            Ok(true)
        } else {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            Err(format!("API returned {}: {}", status, text))
        }
    }
}

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

    if let Some(providers) = raw.get("ai_providers").and_then(|v| v.as_array()) {
        if let Some(p) = providers.iter().find(|p| {
            p.get("id").and_then(|v| v.as_str()) == Some(writing_provider_id)
        }) {
            let provider: AIProvider = serde_json::from_value(p.clone())
                .map_err(|e| format!("parse provider failed: {}", e))?;
            return Ok(provider);
        }
    }

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
