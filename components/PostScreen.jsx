"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getNote, patchNotePost, removeNotePost } from "../lib/client-api";
import { SCREEN_STATUS, useScreenState } from "../lib/use-screen-state";

function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleString();
}

export default function PostScreen({ noteId, postId }) {
  const router = useRouter();
  const screen = useScreenState();
  const [note, setNote] = useState(null);
  const [postText, setPostText] = useState("");

  const post = useMemo(
    () => note?.posts?.find((item) => item.id === postId) || null,
    [note, postId],
  );

  useEffect(() => {
    void loadPost();
  }, [noteId, postId]);

  async function loadPost() {
    await screen.runAction(
      "load",
      async () => {
        const loadedNote = await getNote(noteId);
        setNote(loadedNote);
        const loadedPost = loadedNote.posts?.find((item) => item.id === postId) || null;
        setPostText(loadedPost?.post_text || "");
      },
      { phase: SCREEN_STATUS.LOADING, rethrow: false },
    );
  }

  async function copyPost() {
    if (!postText.trim() || typeof navigator === "undefined") return;
    await navigator.clipboard.writeText(postText);
  }

  async function savePost() {
    if (!postText.trim()) return;
    await screen.runAction(
      "save",
      async () => {
        await patchNotePost(noteId, postId, { postText: postText.trim() });
        await loadPost();
      },
      { rethrow: false },
    );
  }

  async function deletePost() {
    if (typeof window !== "undefined") {
      const accepted = window.confirm("Удалить пост без возможности восстановления?");
      if (!accepted) return;
    }

    await screen.runAction(
      "delete",
      async () => {
        await removeNotePost(noteId, postId);
        router.push(`/notes/${noteId}`);
      },
      { rethrow: false },
    );
  }

  const statusTextByAction = {
    load: "загружаю пост...",
    save: "сохраняю пост...",
    delete: "удаляю пост...",
  };
  const statusText = screen.isBusy ? statusTextByAction[screen.activeAction] || "выполняю действие..." : "";

  return (
    <>
      <header className="app-header">
        <div>
          <h1>Post</h1>
          <span className="subtitle">редактирование генерации</span>
        </div>
        <Link className="icon-btn text-icon-btn" href={`/notes/${noteId}`} aria-label="Назад к заметке">
          ←
        </Link>
      </header>

      <div className="container post-screen">
        {statusText ? (
          <div className="status-strip" aria-live="polite">
            {statusText}
          </div>
        ) : null}

        <section className="reader-block">
          <div className="artifact-meta wrap-meta">
            <span>{post?.style_name || "без стиля"}</span>
            <span>{post?.length || ""}</span>
            <span>{formatDate(post?.created_at)}</span>
          </div>
          <textarea
            className="post-edit-area"
            value={postText}
            onChange={(event) => setPostText(event.target.value)}
            placeholder="пост"
          />
          <div className="reader-actions">
            <button className="btn btn-primary" type="button" onClick={savePost} disabled={!postText.trim() || screen.isBusy}>
              сохранить
            </button>
            <button className="btn" type="button" onClick={copyPost} disabled={!postText.trim()}>
              копировать
            </button>
            <button className="btn btn-danger" type="button" onClick={deletePost} disabled={screen.isBusy || !post}>
              удалить
            </button>
          </div>
        </section>

        {screen.error ? (
          <div className="error-box">
            {screen.error}
            <div className="style-controls">
              <button className="btn" type="button" onClick={screen.clearError}>
                скрыть
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}
