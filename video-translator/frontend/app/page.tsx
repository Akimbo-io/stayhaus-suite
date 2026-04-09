"use client";

import { useState, useEffect, useCallback } from "react";

type JobStatus = {
  job_id: string;
  status: string;
  current_step: string;
  current_language: string;
  languages_done: string[];
  languages_total: string[];
  error: string | null;
};

const LANGUAGES: Record<string, string> = {
  en: "English", es: "Spanish", fr: "French", de: "German",
  it: "Italian", pt: "Portuguese", nl: "Dutch", pl: "Polish",
  ru: "Russian", uk: "Ukrainian", ja: "Japanese", ko: "Korean",
  zh: "Chinese", ar: "Arabic", hi: "Hindi", tr: "Turkish",
  sv: "Swedish", da: "Danish", no: "Norwegian", fi: "Finnish",
  cs: "Czech", ro: "Romanian", bg: "Bulgarian", el: "Greek",
  he: "Hebrew",
};

const API = "http://localhost:8000";

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [selectedLangs, setSelectedLangs] = useState<string[]>(Object.keys(LANGUAGES));
  const [dragOver, setDragOver] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewLang, setPreviewLang] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API}/api/status/${jobId}`);
        if (res.ok) {
          const data = await res.json();
          setJobStatus(data);
          if (data.status === "completed" || data.status === "error") {
            clearInterval(interval);
          }
        }
      } catch { /* ignore */ }
    }, 2000);
    return () => clearInterval(interval);
  }, [jobId]);

  const toggleLang = (code: string) => {
    setSelectedLangs((prev) =>
      prev.includes(code) ? prev.filter((l) => l !== code) : [...prev, code]
    );
  };

  const selectAll = () => {
    setSelectedLangs(
      selectedLangs.length === Object.keys(LANGUAGES).length ? [] : Object.keys(LANGUAGES)
    );
  };

  const handleSubmit = async () => {
    if (!file || selectedLangs.length === 0) return;
    setUploading(true);
    setError(null);
    const formData = new FormData();
    formData.append("video", file);
    formData.append("languages", selectedLangs.join(","));
    try {
      const res = await fetch(`${API}/api/translate`, { method: "POST", body: formData });
      if (!res.ok) {
        let msg = "Upload failed";
        try { const data = await res.json(); msg = data.detail || msg; } catch { msg = `Server error (${res.status})`; }
        throw new Error(msg);
      }
      const data = await res.json();
      setJobId(data.job_id);
      setJobStatus({
        job_id: data.job_id, status: "processing", current_step: "Starting...",
        current_language: "", languages_done: [], languages_total: selectedLangs, error: null,
      });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f && f.type === "video/mp4") setFile(f);
  }, []);

  const reset = () => {
    setFile(null);
    setSelectedLangs(Object.keys(LANGUAGES));
    setJobId(null);
    setJobStatus(null);
    setError(null);
    setPreviewLang(null);
  };

  // --- Processing / Results ---
  if (jobStatus) {
    const progress = jobStatus.languages_total.length > 0
      ? (jobStatus.languages_done.length / jobStatus.languages_total.length) * 100 : 0;

    return (
      <div className="max-w-2xl mx-auto px-6 py-14 space-y-8">
        {/* Header */}
        <div className="animate-in">
          <div
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-medium uppercase tracking-[0.15em]"
            style={{ background: "var(--accent-dim)", color: "var(--accent)", border: "1px solid var(--border)" }}
          >
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--accent)" }} />
            Processing
          </div>
          <h1
            className="text-3xl font-bold tracking-tight mt-4"
            style={{ fontFamily: "'Space Grotesk', sans-serif", color: "var(--text-primary)" }}
          >
            Video Translator
          </h1>
        </div>

        {jobStatus.status === "processing" && (
          <div
            className="animate-in rounded-xl p-5 space-y-4 pulse-glow"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)", animationDelay: "80ms" }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: "var(--accent-dim)" }}
              >
                <svg className="w-4 h-4 animate-spin" style={{ color: "var(--accent)" }} fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{jobStatus.current_step}</p>
                <p className="text-xs" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-muted)" }}>
                  {jobStatus.languages_done.length} / {jobStatus.languages_total.length} languages
                </p>
              </div>
            </div>
            <div className="w-full rounded-full h-1.5 overflow-hidden" style={{ background: "var(--surface)" }}>
              <div
                className="progress-shimmer h-full rounded-full transition-all duration-700"
                style={{ width: `${Math.max(progress, 4)}%` }}
              />
            </div>
          </div>
        )}

        {jobStatus.status === "error" && (
          <div className="animate-in space-y-4" style={{ animationDelay: "80ms" }}>
            <div
              className="rounded-xl p-5 flex items-start gap-3"
              style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
            >
              <span className="text-lg" style={{ color: "var(--error)" }}>!</span>
              <p className="text-sm" style={{ color: "var(--error)" }}>{jobStatus.error}</p>
            </div>
            <button
              onClick={reset}
              className="btn-3d px-5 py-2.5 rounded-lg text-sm font-medium"
              style={{ background: "var(--surface-2)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
            >
              Try Again
            </button>
          </div>
        )}

        {jobStatus.status === "completed" && (
          <div className="animate-in space-y-5" style={{ animationDelay: "80ms" }}>
            <div
              className="rounded-xl p-5 flex items-center gap-3"
              style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
            >
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(34, 197, 94, 0.15)" }}>
                <svg className="w-4 h-4" style={{ color: "var(--success)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-sm font-medium" style={{ color: "var(--success)" }}>All translations complete</p>
            </div>

            {/* Language tabs */}
            <div className="flex flex-wrap gap-1.5">
              {jobStatus.languages_total.map((lang) => (
                <button
                  key={lang}
                  onClick={() => setPreviewLang(lang)}
                  className="px-3 py-1.5 text-[12px] rounded-md font-medium transition-all"
                  style={{
                    background: previewLang === lang ? "var(--accent)" : "var(--surface-2)",
                    color: previewLang === lang ? "var(--bg)" : "var(--text-secondary)",
                    border: `1px solid ${previewLang === lang ? "var(--accent)" : "var(--border)"}`,
                  }}
                >
                  {LANGUAGES[lang] || lang}
                </button>
              ))}
            </div>

            {/* Video preview */}
            {previewLang && (
              <div className="animate-in space-y-3">
                <video
                  key={previewLang}
                  controls
                  autoPlay
                  className="w-full rounded-xl"
                  style={{ border: "1px solid var(--border)" }}
                  src={`${API}/api/download/${jobStatus.job_id}/${previewLang}`}
                />
                <a
                  href={`${API}/api/download/${jobStatus.job_id}/${previewLang}`}
                  download
                  className="btn-3d inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium"
                  style={{ background: "var(--accent)", color: "var(--bg)", border: "1px solid var(--accent)" }}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download {LANGUAGES[previewLang]}
                </a>
              </div>
            )}

            {!previewLang && (
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                Select a language above to preview
              </p>
            )}

            <button
              onClick={reset}
              className="btn-3d px-5 py-2.5 rounded-lg text-sm font-medium"
              style={{ background: "var(--surface-2)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
            >
              Translate Another
            </button>
          </div>
        )}

        {/* Partial downloads while processing */}
        {jobStatus.status === "processing" && jobStatus.languages_done.length > 0 && (
          <div className="animate-in space-y-3" style={{ animationDelay: "160ms" }}>
            <p className="text-[11px] font-medium uppercase tracking-[0.15em]" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-muted)" }}>
              Ready for download
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {jobStatus.languages_done.map((lang, i) => (
                <a
                  key={lang}
                  href={`${API}/api/download/${jobStatus.job_id}/${lang}`}
                  download
                  className="btn-3d animate-in px-3 py-2.5 text-sm rounded-lg text-center font-medium"
                  style={{
                    background: "var(--surface-2)", color: "var(--text-primary)",
                    border: "1px solid var(--border)", animationDelay: `${i * 40}ms`,
                  }}
                >
                  {LANGUAGES[lang] || lang}
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // --- Upload Screen ---
  return (
    <div className="max-w-2xl mx-auto px-6 py-14 space-y-8">
      {/* Header */}
      <div className="animate-in" style={{ animationDelay: "0ms" }}>
        <div
          className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-medium uppercase tracking-[0.15em]"
          style={{ background: "var(--accent-dim)", color: "var(--accent)", border: "1px solid var(--border)" }}
        >
          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--accent)" }} />
          Ready
        </div>
        <h1
          className="text-3xl font-bold tracking-tight mt-4"
          style={{ fontFamily: "'Space Grotesk', sans-serif", color: "var(--text-primary)" }}
        >
          Video Translator
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
          Upload a video, select languages, translate with voice cloning
        </p>
      </div>

      {/* Drop zone */}
      <div className="animate-in" style={{ animationDelay: "80ms" }}>
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => document.getElementById("file-input")?.click()}
          className="rounded-xl p-10 text-center cursor-pointer transition-all duration-200"
          style={{
            background: dragOver ? "var(--accent-dim)" : "var(--bg-card)",
            border: `1px dashed ${dragOver ? "var(--accent)" : "var(--border)"}`,
          }}
        >
          <input
            id="file-input" type="file" accept="video/mp4" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) setFile(f); }}
          />
          {file ? (
            <div className="space-y-1">
              <div
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg mb-2"
                style={{ background: "var(--accent-dim)", border: "1px solid var(--border)" }}
              >
                <svg className="w-4 h-4" style={{ color: "var(--accent)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <span className="text-sm font-medium" style={{ color: "var(--accent)" }}>{file.name}</span>
              </div>
              <p className="text-xs" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-muted)" }}>
                {(file.size / 1024 / 1024).toFixed(1)} MB
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div
                className="inline-flex items-center justify-center w-12 h-12 rounded-lg mx-auto"
                style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
              >
                <svg className="w-5 h-5" style={{ color: "var(--text-muted)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
              </div>
              <p className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
                Drop MP4 here or click to browse
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Language selector */}
      <div className="animate-in space-y-3" style={{ animationDelay: "160ms" }}>
        <div className="flex items-center justify-between">
          <h2
            className="text-[11px] font-medium uppercase tracking-[0.15em]"
            style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-muted)" }}
          >
            Languages ({selectedLangs.length})
          </h2>
          <button
            onClick={selectAll}
            className="text-[11px] font-medium uppercase tracking-wider transition-colors"
            style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-muted)" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--accent)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
          >
            {selectedLangs.length === Object.keys(LANGUAGES).length ? "Deselect All" : "Select All"}
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(LANGUAGES).map(([code, name]) => (
            <button
              key={code}
              onClick={() => toggleLang(code)}
              className="px-3 py-1.5 text-[12px] rounded-md font-medium transition-all"
              style={{
                background: selectedLangs.includes(code) ? "var(--accent)" : "var(--surface-2)",
                color: selectedLangs.includes(code) ? "var(--bg)" : "var(--text-secondary)",
                border: `1px solid ${selectedLangs.includes(code) ? "var(--accent)" : "var(--border)"}`,
              }}
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="text-sm animate-in" style={{ color: "var(--error)" }}>{error}</p>
      )}

      {/* Submit */}
      <div className="animate-in" style={{ animationDelay: "240ms" }}>
        <button
          onClick={handleSubmit}
          disabled={!file || selectedLangs.length === 0 || uploading}
          className="btn-3d w-full py-3.5 rounded-lg font-semibold text-[14px] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            background: (!file || selectedLangs.length === 0) ? "var(--surface-2)" : "var(--accent)",
            color: (!file || selectedLangs.length === 0) ? "var(--text-muted)" : "var(--bg)",
            border: `1px solid ${(!file || selectedLangs.length === 0) ? "var(--border)" : "var(--accent)"}`,
          }}
        >
          {uploading ? "Uploading..." : `Translate → ${selectedLangs.length} languages`}
        </button>
      </div>
    </div>
  );
}
