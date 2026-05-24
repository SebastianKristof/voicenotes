"use client";

import { useEffect, useState } from "react";
import AppNav from "./AppNav";
import { listStyles, removeStyle, saveStyle } from "../lib/client-api";

const THEME_KEY = "voicenotes_theme";

export default function SettingsScreen() {
  const [styles, setStyles] = useState([]);
  const [selectedStyleId, setSelectedStyleId] = useState("");
  const [name, setName] = useState("");
  const [instructions, setInstructions] = useState("");
  const [theme, setTheme] = useState("dark");
  const [error, setError] = useState("");

  useEffect(() => {
    const savedTheme = localStorage.getItem(THEME_KEY);
    if (savedTheme) setTheme(savedTheme);
    void loadStyles();
  }, []);

  useEffect(() => {
    localStorage.setItem(THEME_KEY, theme);
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  async function loadStyles() {
    try {
      setStyles(await listStyles());
    } catch (e) {
      setError(e.message);
    }
  }

  function pickStyle(id) {
    setSelectedStyleId(id);
    const style = styles.find((s) => s.id === id);
    if (!style) return;
    setName(style.name);
    setInstructions(style.instructions);
  }

  async function onSave() {
    if (!name.trim() || !instructions.trim()) return;
    setError("");
    try {
      const saved = await saveStyle({
        id: selectedStyleId || null,
        name: name.trim(),
        instructions: instructions.trim(),
      });
      await loadStyles();
      setSelectedStyleId(saved.id);
    } catch (e) {
      setError(e.message);
    }
  }

  async function onDelete() {
    if (!selectedStyleId) return;
    setError("");
    try {
      await removeStyle(selectedStyleId);
      setSelectedStyleId("");
      setName("");
      setInstructions("");
      await loadStyles();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <>
      <header>
        <h1>Settings</h1>
        <span className="subtitle">общие настройки и стили</span>
      </header>
      <AppNav />

      <div className="container">
        <div>
          <div className="block-label">Тема</div>
          <div className="style-block">
            <div className="length-row">
              <button className={`tone-chip ${theme === "dark" ? "active" : ""}`} type="button" onClick={() => setTheme("dark")}>темная</button>
              <button className={`tone-chip ${theme === "light" ? "active" : ""}`} type="button" onClick={() => setTheme("light")}>светлая</button>
            </div>
          </div>
        </div>

        <div>
          <div className="block-label">Стили</div>
          <div className="style-block">
            <div className="style-controls">
              <select className="style-select" value={selectedStyleId} onChange={(e) => pickStyle(e.target.value)}>
                <option value="">новый стиль</option>
                {styles.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            <div className="style-controls">
              <input className="style-name-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="название стиля" />
            </div>

            <textarea className="style-area" value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="инструкции стиля" />

            <div className="style-controls">
              <button className="btn btn-primary" type="button" onClick={onSave} disabled={!name.trim() || !instructions.trim()}>
                сохранить
              </button>
              <button className="btn" type="button" onClick={onDelete} disabled={!selectedStyleId}>
                удалить
              </button>
            </div>
          </div>
        </div>

        {error ? <div className="error-box">{error}</div> : null}
      </div>
    </>
  );
}
