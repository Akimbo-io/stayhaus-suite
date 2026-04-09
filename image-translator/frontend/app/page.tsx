"use client";

import { useState, useCallback, useEffect } from "react";

const LANGUAGES: Record<string, string> = {
  bg: "Bulgarian",
  ro: "Romanian",
  pl: "Polish",
  cs: "Czech",
  sk: "Slovak",
  hu: "Hungarian",
  el: "Greek",
  it: "Italian",
  fr: "French",
  pt: "Portuguese",
  es: "Spanish",
  de: "German",
};

type JobStatus = {
  job_id: string;
  status: string;
  current_step: string;
  current_language: string;
  languages_done: string[];
  languages_total: string[];
  error: string | null;
};

const API = "http://localhost:8001";

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [selectedLangs, setSelectedLangs] = useState<string[]>(Object.keys(LANGUAGES));
  const [uploading, setUploading] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [previewLang, setPreviewLang] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API}/api/status/${jobId}`);
        if (res.ok) {
          const data = await res.json();
          setJobStatus(data);
          if (data.languages_done.length > 0 && !previewLang) {
            setPreviewLang(data.languages_done[0]);
          }
          if (data.status === "completed" || data.status === "error") {
            clearInterval(interval);
          }
        }
      } catch { /* ignore */ }
    }, 2000);
    return () => clearInterval(interval);
  }, [jobId, previewLang]);

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

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f && (f.type.startsWith("image/") || f.name.match(/\.(png|jpg|jpeg|webp)$/i))) {
      setFile(f);
      setPreview(URL.createObjectURL(f));
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      setPreview(URL.createObjectURL(f));
    }
  };

  const handleSubmit = async () => {
    if (!file || selectedLangs.length === 0) return;
    setUploading(true);
    setError(null);
    setPreviewLang(null);

    const formData = new FormData();
    formData.append("image", file);
    formData.append("languages", selectedLangs.join(","));

    try {
      const res = await fetch(`${API}/api/translate-image`, { method: "POST", body: formData });
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
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const reset = () => {
    setFile(null);
    setPreview(null);
    setJobId(null);
    setJobStatus(null);
    setError(null);
    setSelectedLangs(Object.keys(LANGUAGES));
    setPreviewLang(null);
  };

  // --- Processing ---
  if (jobStatus?.status === "processing") {
    const progress = (jobStatus.languages_done.length / (jobStatus.languages_total.length || 1)) * 100;
    return (
      <main className="min-h-screen px-6 py-14">
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="animate-in">
            <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: "'Space Grotesk', sans-serif", color: "var(--text-primary)" }}>
              Image Translator
            </h1>
          </div>

          <div
            className="animate-in rounded-xl p-6 space-y-5 pulse-glow"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "var(--accent-dim)" }}>
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
              <div className="progress-shimmer h-full rounded-full transition-all duration-500" style={{ width: `${Math.max(progress, 4)}%` }} />
            </div>

            {/* Preview completed translations */}
            {jobStatus.languages_done.length > 0 && (
              <div className="space-y-3 pt-3" style={{ borderTop: "1px solid var(--border)" }}>
                <p className="text-[11px] font-medium uppercase tracking-wider" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-muted)" }}>
                  Click to preview
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {jobStatus.languages_done.map((lang) => (
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
                {previewLang && (
                  <div className="relative mt-3">
                    <img
                      src={`${API}/api/download/${jobStatus.job_id}/${previewLang}?t=${Date.now()}`}
                      alt={`Translated to ${LANGUAGES[previewLang]}`}
                      className="w-full rounded-lg"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    );
  }

  // --- Error ---
  if (jobStatus?.status === "error") {
    return (
      <main className="min-h-screen px-6 py-14">
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="animate-in">
            <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: "'Space Grotesk', sans-serif", color: "var(--text-primary)" }}>
              Image Translator
            </h1>
          </div>
          <div className="animate-in rounded-xl p-6 text-center" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <p className="text-sm mb-4" style={{ color: "var(--error)" }}>{jobStatus.error || error || "An error occurred"}</p>
            <button
              onClick={reset}
              className="btn-3d px-5 py-2.5 rounded-lg text-sm font-medium"
              style={{ background: "var(--accent)", color: "var(--bg)" }}
            >
              Try Again
            </button>
          </div>
        </div>
      </main>
    );
  }

  // --- Completed ---
  if (jobStatus?.status === "completed") {
    return (
      <main className="min-h-screen px-6 py-14">
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="animate-in">
            <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: "'Space Grotesk', sans-serif", color: "var(--text-primary)" }}>
              Image Translator
            </h1>
          </div>

          <div className="animate-in rounded-xl p-6" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(34, 197, 94, 0.15)" }}>
                <svg className="w-4 h-4" style={{ color: "var(--success)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-sm font-medium" style={{ color: "var(--success)" }}>
                {jobStatus.languages_total.length} translations complete
              </p>
            </div>

            {/* Language preview tabs */}
            <div className="flex flex-wrap gap-1.5 mb-4">
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

            {/* Image preview */}
            {previewLang && (
              <div className="relative">
                <img
                  src={`${API}/api/download/${jobStatus.job_id}/${previewLang}?t=${Date.now()}`}
                  alt={`Translated to ${LANGUAGES[previewLang]}`}
                  className="w-full rounded-lg"
                />
                <a
                  href={`${API}/api/download/${jobStatus.job_id}/${previewLang}`}
                  download={`translated_${LANGUAGES[previewLang]}.png`}
                  className="btn-3d absolute top-3 right-3 p-2 rounded-lg"
                  style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" style={{ color: "var(--accent)" }}>
                    <path stroke="currentColor" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                </a>
              </div>
            )}

            <div className="mt-5 pt-4 flex justify-center" style={{ borderTop: "1px solid var(--border)" }}>
              <button
                onClick={reset}
                className="btn-3d px-5 py-2.5 rounded-lg text-sm font-medium"
                style={{ background: "var(--surface-2)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
              >
                Translate Another
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  // --- Upload Screen ---
  return (
    <main className="min-h-screen px-6 py-14">
      <div className="max-w-2xl mx-auto space-y-8">
        {/* Header */}
        <div className="animate-in">
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
            Image Translator
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
            Translate marketing text while preserving product labels
          </p>
        </div>

        {/* Upload area */}
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
              id="file-input" type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
              onChange={handleFileSelect}
            />
            {preview ? (
              <div className="space-y-3">
                <img src={preview} alt="Preview" className="max-h-48 mx-auto rounded-lg" />
                <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{file?.name}</p>
                <p className="text-xs" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-muted)" }}>
                  {file && (file.size / 1024 / 1024).toFixed(1)} MB
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div
                  className="inline-flex items-center justify-center w-12 h-12 rounded-lg mx-auto"
                  style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" style={{ color: "var(--text-muted)" }}>
                    <path d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                  </svg>
                </div>
                <p className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
                  Drop image here or click to browse
                </p>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>PNG, JPEG, or WEBP</p>
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
    </main>
  );
}
