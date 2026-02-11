use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NoteStore {
    pub notes: Vec<InspirationNote>,
    pub next_id: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InspirationNote {
    pub id: u32,
    pub text: String,
    pub tags: Vec<String>,
    pub mood: String,
    pub created_at: String,
    pub used: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecipeStore {
    pub recipes: Vec<Recipe>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Recipe {
    pub id: u32,
    pub title: String,
    pub ingredients: Vec<u32>,  // note ids
    pub result: String,
    pub created_at: String,
}

fn notes_path(data_dir: &PathBuf) -> PathBuf {
    data_dir.join("inspiration").join("notes.json")
}

fn recipes_path(data_dir: &PathBuf) -> PathBuf {
    data_dir.join("inspiration").join("recipes.json")
}

pub fn load_notes(data_dir: &PathBuf) -> NoteStore {
    let path = notes_path(data_dir);
    if path.exists() {
        fs::read_to_string(&path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or(NoteStore { notes: vec![], next_id: 1 })
    } else {
        NoteStore { notes: vec![], next_id: 1 }
    }
}

pub fn save_notes(data_dir: &PathBuf, store: &NoteStore) -> Result<(), String> {
    let dir = data_dir.join("inspiration");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let json = serde_json::to_string_pretty(store).map_err(|e| e.to_string())?;
    fs::write(notes_path(data_dir), json).map_err(|e| e.to_string())
}

pub fn add_note(data_dir: &PathBuf, text: String, tags: Vec<String>, mood: String) -> Result<InspirationNote, String> {
    let mut store = load_notes(data_dir);
    let note = InspirationNote {
        id: store.next_id,
        text, tags, mood,
        created_at: chrono::Local::now().format("%Y-%m-%dT%H:%M:%S").to_string(),
        used: false,
    };
    store.next_id += 1;
    store.notes.push(note.clone());
    save_notes(data_dir, &store)?;
    Ok(note)
}

pub fn delete_note(data_dir: &PathBuf, id: u32) -> Result<(), String> {
    let mut store = load_notes(data_dir);
    store.notes.retain(|n| n.id != id);
    save_notes(data_dir, &store)
}

pub fn load_recipes(data_dir: &PathBuf) -> Vec<Recipe> {
    let path = recipes_path(data_dir);
    if !path.exists() { return vec![]; }
    fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str::<RecipeStore>(&s).ok())
        .map(|s| s.recipes)
        .unwrap_or_default()
}

pub fn save_recipe(data_dir: &PathBuf, recipe: &Recipe) -> Result<(), String> {
    let dir = data_dir.join("inspiration");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let mut recipes = load_recipes(data_dir);
    recipes.push(recipe.clone());
    let store = RecipeStore { recipes };
    let json = serde_json::to_string_pretty(&store).map_err(|e| e.to_string())?;
    fs::write(recipes_path(data_dir), json).map_err(|e| e.to_string())
}

/// 标记灵感为已使用
pub fn mark_used(data_dir: &PathBuf, ids: &[u32]) -> Result<(), String> {
    let mut store = load_notes(data_dir);
    for note in &mut store.notes {
        if ids.contains(&note.id) { note.used = true; }
    }
    save_notes(data_dir, &store)
}
