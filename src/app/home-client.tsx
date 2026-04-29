"use client";

import { useCallback, useEffect, useState } from "react";

type FileRow = {
  id: string;
  originalName: string;
  sizeBytes: number;
  mimeType: string | null;
  source: string;
  createdAt: string;
};

const CHUNK_SIZE_OPTIONS = [
  { label: "256 KB", value: 256 * 1024 },
  { label: "1 MB", value: 1024 * 1024 },
  { label: "2 MB", value: 2 * 1024 * 1024 },
];

export default function HomeClient() {
  const [files, setFiles] = useState<FileRow[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [directBusy, setDirectBusy] = useState(false);
  const [chunkBusy, setChunkBusy] = useState(false);
  const [chunkSize, setChunkSize] = useState(CHUNK_SIZE_OPTIONS[1].value);
  const [chunkLog, setChunkLog] = useState<string[]>([]);
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  const loadFiles = useCallback(async () => {
    const res = await fetch("/api/files");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr(data.error ?? `列表加载失败 (${res.status})`);
      return;
    }
    setErr(null);
    setFiles(data.files ?? []);
  }, []);

  useEffect(() => {
    void loadFiles();
  }, [loadFiles]);

  async function downloadFile(f: FileRow) {
    setErr(null);
    setMsg(null);
    setRowBusy(f.id);
    try {
      const res = await fetch(`/api/files/${f.id}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErr(data.error ?? `下载失败 (${res.status})`);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = f.originalName;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setMsg(`已开始下载：${f.originalName}`);
    } finally {
      setRowBusy(null);
    }
  }

  async function deleteFile(f: FileRow) {
    if (!window.confirm(`确定删除「${f.originalName}」？此操作不可恢复。`)) return;
    setErr(null);
    setMsg(null);
    setRowBusy(f.id);
    try {
      const res = await fetch(`/api/files/${f.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data.error ?? `删除失败 (${res.status})`);
        return;
      }
      setMsg(`已删除：${f.originalName}`);
      await loadFiles();
    } finally {
      setRowBusy(null);
    }
  }

  async function onDirectUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    setErr(null);
    const fd = new FormData(e.currentTarget);
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setErr("请选择非空文件");
      return;
    }
    setDirectBusy(true);
    try {
      const up = new FormData();
      up.append("file", file);
      const res = await fetch("/api/files/upload", {
        method: "POST",
        body: up,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data.error ?? `上传失败 (${res.status})`);
        return;
      }
      setMsg(`整文件上传成功：${data.file?.originalName ?? ""}（${data.file?.id ?? ""}）`);
      e.currentTarget.reset();
      await loadFiles();
    } finally {
      setDirectBusy(false);
    }
  }

  async function onChunkedUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    setErr(null);
    setChunkLog([]);
    const form = e.currentTarget;
    const input = form.querySelector<HTMLInputElement>('input[name="bigfile"]');
    const file = input?.files?.[0];
    if (!file || file.size === 0) {
      setErr("请选择非空文件");
      return;
    }

    const totalChunks = Math.max(1, Math.ceil(file.size / chunkSize));
    setChunkBusy(true);
    try {
      const sessionRes = await fetch("/api/files/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originalName: file.name,
          mimeType: file.type || null,
          totalSize: file.size,
          totalChunks,
        }),
      });
      const sessionJson = await sessionRes.json().catch(() => ({}));
      if (!sessionRes.ok) {
        setErr(sessionJson.error ?? `创建会话失败 (${sessionRes.status})`);
        return;
      }
      const uploadId = sessionJson.session?.id as string;
      if (!uploadId) {
        setErr("未返回 uploadId");
        return;
      }
      setChunkLog((l) => [...l, `会话 ${uploadId}，共 ${totalChunks} 片`]);

      for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkSize;
        const blob = file.slice(start, start + chunkSize);
        const fd = new FormData();
        fd.append("uploadId", uploadId);
        fd.append("index", String(i));
        fd.append("chunk", blob, `part-${i}`);
        const r = await fetch("/api/files/chunk", {
          method: "POST",
          body: fd,
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) {
          setErr(j.error ?? `分片 ${i} 失败 (${r.status})`);
          return;
        }
        if (i % 8 === 0 || i === totalChunks - 1) {
          setChunkLog((l) => [...l, `已传 ${j.receivedChunks}/${j.totalChunks}`]);
        }
      }

      const mergeRes = await fetch("/api/files/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploadId }),
      });
      const mergeJson = await mergeRes.json().catch(() => ({}));
      if (!mergeRes.ok) {
        setErr(mergeJson.error ?? `合并失败 (${mergeRes.status})`);
        return;
      }
      setMsg(
        mergeJson.idempotent
          ? `合并已完成（幂等）：${mergeJson.file?.id}`
          : `分片上传并合并成功：${mergeJson.file?.originalName ?? ""}（${mergeJson.file?.id ?? ""}）`
      );
      form.reset();
      await loadFiles();
    } finally {
      setChunkBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <header className="mb-10">
          <h1 className="text-2xl font-semibold tracking-tight">文件服务（Next.js）</h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            公开访问，无需登录。数据：本地 Postgres；文件：本地目录。支持整文件上传、分片合并、下载与删除。
          </p>
        </header>

        {err && (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
            {err}
          </p>
        )}
        {msg && (
          <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
            {msg}
          </p>
        )}

        <div className="grid gap-8 md:grid-cols-1">
          <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-lg font-medium">流程一：整文件上传</h2>
            <p className="mt-1 text-sm text-zinc-500">
              POST /api/files/upload，字段名 file。
            </p>
            <form className="mt-4 flex flex-col gap-3" onSubmit={onDirectUpload}>
              <input
                name="file"
                type="file"
                required
                className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-zinc-100 file:px-3 file:py-2 dark:file:bg-zinc-800"
              />
              <button
                type="submit"
                disabled={directBusy}
                className="w-fit rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {directBusy ? "上传中…" : "上传"}
              </button>
            </form>
          </section>

          <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-lg font-medium">流程二：分片上传 + 合并</h2>
            <p className="mt-1 text-sm text-zinc-500">
              依次：POST /api/files/session → 多次 POST /api/files/chunk → POST
              /api/files/merge。下方一键跑通。
            </p>
            <form className="mt-4 flex flex-col gap-3" onSubmit={onChunkedUpload}>
              <div className="flex flex-wrap items-center gap-3">
                <label className="text-sm text-zinc-600 dark:text-zinc-400">
                  分片大小
                  <select
                    value={chunkSize}
                    onChange={(e) => setChunkSize(Number(e.target.value))}
                    className="ml-2 rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                  >
                    {CHUNK_SIZE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <input
                name="bigfile"
                type="file"
                required
                className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-zinc-100 file:px-3 file:py-2 dark:file:bg-zinc-800"
              />
              <button
                type="submit"
                disabled={chunkBusy}
                className="w-fit rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {chunkBusy ? "分片上传并合并中…" : "开始分片并合并"}
              </button>
            </form>
            {chunkLog.length > 0 && (
              <pre className="mt-4 max-h-40 overflow-auto rounded-lg bg-zinc-100 p-3 text-xs text-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
                {chunkLog.join("\n")}
              </pre>
            )}
          </section>
        </div>

        <section className="mt-10">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-medium">已存文件（最近 100 条）</h2>
            <button
              type="button"
              onClick={() => void loadFiles()}
              className="text-sm text-blue-600 underline dark:text-blue-400"
            >
              刷新
            </button>
          </div>
          <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
            {files.length === 0 ? (
              <li className="px-4 py-6 text-sm text-zinc-500">暂无记录</li>
            ) : (
              files.map((f) => (
                <li
                  key={f.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 text-sm"
                >
                  <span className="font-mono text-xs text-zinc-400">{f.id.slice(0, 8)}…</span>
                  <span className="min-w-0 flex-1 font-medium break-all">{f.originalName}</span>
                  <span className="text-zinc-500">
                    {(f.sizeBytes / 1024).toFixed(1)} KB
                  </span>
                  <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                    {f.source}
                  </span>
                  <span className="ml-auto flex shrink-0 gap-2">
                    <button
                      type="button"
                      disabled={rowBusy === f.id}
                      onClick={() => void downloadFile(f)}
                      className="rounded-md border border-zinc-300 px-2 py-1 text-xs text-blue-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:text-blue-300 dark:hover:bg-zinc-800"
                    >
                      {rowBusy === f.id ? "…" : "下载"}
                    </button>
                    <button
                      type="button"
                      disabled={rowBusy === f.id}
                      onClick={() => void deleteFile(f)}
                      className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40"
                    >
                      删除
                    </button>
                  </span>
                </li>
              ))
            )}
          </ul>
        </section>
      </div>
    </main>
  );
}
