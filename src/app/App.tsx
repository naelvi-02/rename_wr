import { useState, useRef, useEffect } from "react";
import { useFileSystem } from "../hooks/useFileSystem";

interface ProductData {
  namaBarang: string;
  barcode: string;
  kadar: string;
  nampan: string;
  berat?: string;
  ukuran?: string;
  generatedName: string;
}

// Robust copy that works in sandboxed iframes without clipboard API access
function copyToClipboard(text: string): boolean {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
  } catch (_) {}

  // Fallback: textarea + execCommand
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none;";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch (_) {
    return false;
  }
}

// Palette
const P = {
  bg: "#FDF2F5",
  pageBg: "#F9E6EC",
  card: "#FFFFFF",
  pink: "#E8688A",
  pinkLight: "#F48FB1",
  pinkPale: "#FCE4EC",
  pinkBorder: "rgba(232,104,138,0.22)",
  pinkRing: "rgba(232,104,138,0.18)",
  pinkDash: "rgba(232,104,138,0.38)",
  text: "#1E1B20",
  textSub: "#9E8B93",
  textMuted: "#C4AEBB",
  green: "#16A34A",
  greenBg: "rgba(22,163,74,0.08)",
  red: "#DC2626",
};

export default function App() {
  const [inputValue, setInputValue] = useState("");
  const [result, setResult] = useState<ProductData | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shake, setShake] = useState(false);
  const [renameSuccess, setRenameSuccess] = useState(false);
  const [autoZoom, setAutoZoom] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastScanRef = useRef<{ barcode: string; timestamp: number; count: number }>({
    barcode: "",
    timestamp: 0,
    count: 0
  });

  const [database, setDatabase] = useState<Record<string, ProductData>>({});
  const [totalDb, setTotalDb] = useState(0);
  const [lastUpdated, setLastUpdated] = useState("");
  const [syncing, setSyncing] = useState(false);

  const {
    directoryHandle,
    files,
    currentIndex,
    setCurrentIndex,
    openDirectory,
    renameCurrentFile,
    isRenaming,
    currentFile,
  } = useFileSystem();

  const loadData = async () => {
    try {
      const res = await fetch("/rename/perhiasan.json?" + new Date().getTime());
      const data = await res.json();
      setDatabase(data.items || {});
      setTotalDb(data.total || 0);
      if (data.lastUpdated) {
        const d = new Date(data.lastUpdated);
        setLastUpdated(
          d.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })
        );
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadData();
    inputRef.current?.focus();
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/rename/api/sync", { method: "POST" });
      if (!res.ok) {
        alert("Sync API returned an error.");
        return;
      }
      // Poll until lastUpdated changes (or timeout ~90s)
      const prevUpdated = lastUpdated;
      let ok = false;
      for (let i = 0; i < 18; i++) {
        await new Promise((r) => setTimeout(r, 5000));
        await loadData();
        // loadData updates state async; re-fetch to compare timestamp
        const check = await fetch("/rename/perhiasan.json?" + Date.now());
        const data = await check.json();
        if (data.lastUpdated) {
          const label = new Date(data.lastUpdated).toLocaleString("id-ID", {
            dateStyle: "medium",
            timeStyle: "short",
          });
          if (label !== prevUpdated || i >= 2) {
            setDatabase(data.items || {});
            setTotalDb(data.total || 0);
            setLastUpdated(label);
            ok = true;
            break;
          }
        }
      }
      alert(
        ok
          ? "Sync selesai. Database diperbarui tanpa refresh halaman."
          : "Sync dipicu. Kalau data masih lama, tunggu sebentar lalu klik Sync lagi."
      );
    } catch (e) {
      console.error(e);
      alert("Gagal panggil API sync.");
    } finally {
      setSyncing(false);
    }
  };

  const handleSearch = async () => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;

    const now = Date.now();
    let scanCount = 0;

    // Jika barcode sama dan di-scan dalam waktu kurang dari 1.5 detik (1500ms), 
    // anggap itu glitch dari hardware scanner (double scan otomatis)
    if (lastScanRef.current.barcode === trimmed && (now - lastScanRef.current.timestamp) < 1500) {
      setInputValue(""); // bersihkan input biar nggak nyangkut
      return; 
    }

    if (lastScanRef.current.barcode === trimmed) {
      lastScanRef.current.timestamp = now;
    } else {
      lastScanRef.current = { barcode: trimmed, timestamp: now, count: 0 };
    }

    let found = database[trimmed];

    // Fallback: 4 digit suffix search
    if (!found && trimmed.length === 4) {
      const matchKey = Object.keys(database).find((key) =>
        key.endsWith(trimmed)
      );
      if (matchKey) {
        found = database[matchKey];
        // update the stored barcode to the actual full barcode so next scan works correctly
        lastScanRef.current.barcode = matchKey;
      }
    }

    if (found) {
      setResult(found);
      setNotFound(false);

      if (currentFile) {
        // Auto rename logic
        const renameRes = await renameCurrentFile(found.generatedName);
        if (renameRes.success) {
          setRenameSuccess(true);
          setTimeout(() => setRenameSuccess(false), 2000);
          setInputValue(""); // Auto clear for next scan
          // Refocus input
          setTimeout(() => inputRef.current?.focus(), 100);
        } else {
          alert(`Gagal me-rename file: ${renameRes.error}\nPastikan file tidak sedang dibuka di aplikasi lain.`);
        }
      } else {
        // Classic mode: just copy to clipboard
        copyToClipboard(found.generatedName);
        setCopied(true);
        setTimeout(() => setCopied(false), 2800);
      }
    } else {
      setResult(null);
      setNotFound(true);
      setShake(true);
      setTimeout(() => setShake(false), 450);
      setCopied(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSearch();
    }
  };

  const handleCopy = () => {
    if (!result) return;
    copyToClipboard(result.generatedName);
    setCopied(true);
    setTimeout(() => setCopied(false), 2800);
  };

  const handleClear = () => {
    setInputValue("");
    setResult(null);
    setNotFound(false);
    setCopied(false);
    inputRef.current?.focus();
  };

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center px-4 py-10"
      style={{ background: P.pageBg, fontFamily: "'Inter', sans-serif" }}
    >
      <div
        className="w-full flex flex-col rounded-[10px] overflow-hidden"
        style={{
          maxWidth: 1280,
          background: P.card,
          boxShadow:
            "0 4px 6px -1px rgba(232,104,138,0.08), 0 12px 40px -4px rgba(232,104,138,0.14), 0 0 0 1px rgba(232,104,138,0.1)",
        }}
      >
        {/* Pink top stripe */}
        <div
          style={{
            height: 4,
            background:
              "linear-gradient(90deg, #F48FB1 0%, #E8688A 50%, #F48FB1 100%)",
          }}
        />

        {/* Header */}
        <div
          className="px-8 pt-7 pb-6 flex items-start justify-between gap-4"
          style={{ borderBottom: `1px solid ${P.pinkBorder}` }}
        >
          <div>
            <h1
              className="text-xl font-bold tracking-tight leading-tight flex items-center gap-4"
              style={{ color: P.pink, letterSpacing: "-0.015em" }}
            >
              Jewelry Photo Renamer Tool
            </h1>
            <p
              className="mt-1 text-sm flex items-center gap-3"
              style={{ color: P.textSub }}
            >
              <span>
                Total Database:{" "}
                <span style={{ color: P.text, fontWeight: 500 }}>
                  {totalDb.toLocaleString()} Items
                </span>
              </span>
              {lastUpdated && (
                <span className="text-xs">(Update: {lastUpdated})</span>
              )}
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={openDirectory}
              className="shrink-0 mt-0.5 rounded-full px-5 py-2 text-sm font-bold transition-all shadow-sm flex items-center gap-2"
              style={{
                background: P.pink,
                color: "#fff",
              }}
              onMouseEnter={(e) =>
                ((e.currentTarget as HTMLButtonElement).style.background =
                  P.pinkLight)
              }
              onMouseLeave={(e) =>
                ((e.currentTarget as HTMLButtonElement).style.background = P.pink)
              }
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                <path d="M9.828 3h3.982a2 2 0 0 1 1.992 2.181l-.637 7A2 2 0 0 1 13.174 14H2.825a2 2 0 0 1-1.991-1.819l-.637-7a1.99 1.99 0 0 1 .342-1.31L.5 3a2 2 0 0 1 2-2h3.672a2 2 0 0 1 1.414.586l.828.828A2 2 0 0 0 9.828 3zm-8.322.12C1.72 3.042 1.95 3 2.19 3h5.396l-.707-.707A1 1 0 0 0 6.172 2H2.5a1 1 0 0 0-1 .981l.006.139z"/>
              </svg>
              Buka Folder
            </button>
            <button
              onClick={handleSync}
              disabled={syncing}
              className="shrink-0 mt-0.5 rounded-full px-4 py-2 text-sm font-bold transition-all"
              style={{
                background: syncing ? P.textMuted : P.pinkPale,
                color: syncing ? "#fff" : P.pink,
                cursor: syncing ? "wait" : "pointer",
              }}
            >
              {syncing ? "Syncing..." : "Sync Data"}
            </button>
          </div>
        </div>

        {/* 2-Column Main Layout */}
        <div className="flex flex-col md:flex-row min-h-[600px]">
          {/* Left Column: Photo Preview */}
          <div
            className="w-full md:w-[55%] p-6 flex flex-col"
            style={{
              borderRight: `1px solid ${P.pinkBorder}`,
              background: P.bg,
            }}
          >
            <label
              className="block text-[11px] font-semibold uppercase tracking-widest mb-3"
              style={{ color: P.textMuted, letterSpacing: "0.12em" }}
            >
              {directoryHandle ? "Foto Saat Ini" : "Preview Foto"}
            </label>

            <div
              className="flex-1 w-full rounded-xl flex items-center justify-center relative overflow-hidden"
              style={{
                background: "#fff",
                border: `1.5px dashed ${P.pinkDash}`,
                minHeight: 500,
              }}
            >
              {currentFile ? (
                <div className="w-full h-full p-2 flex items-center justify-center overflow-hidden">
                  <img
                    src={currentFile.url}
                    alt={currentFile.name}
                    className={`max-w-full max-h-[480px] object-contain rounded-md shadow-sm transition-transform duration-300 ${autoZoom ? 'scale-[1.8]' : 'scale-100'}`}
                  />
                  
                  {/* Zoom Toggle */}
                  <button
                    onClick={() => setAutoZoom(!autoZoom)}
                    className="absolute top-4 right-4 bg-white/80 backdrop-blur-md rounded-full px-3 py-1.5 flex items-center gap-1.5 text-xs font-bold shadow-sm border border-gray-100 hover:bg-white transition-all z-10"
                    style={{ color: autoZoom ? P.pink : P.textSub }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="currentColor" viewBox="0 0 16 16">
                      <path d="M6.5 13a6.5 6.5 0 1 1 0-13 6.5 6.5 0 0 1 0 13zM1 6.5a5.5 5.5 0 1 0 11 0 5.5 5.5 0 0 0-11 0z"/>
                      <path d="M10.344 10.344a.5.5 0 0 1 .707 0l3.879 3.879a.5.5 0 0 1-.707.707l-3.879-3.879a.5.5 0 0 1 0-.707z"/>
                      {autoZoom ? (
                        <path d="M4 6.5a.5.5 0 0 1 .5-.5h4a.5.5 0 0 1 0 1h-4a.5.5 0 0 1-.5-.5z"/>
                      ) : (
                        <path d="M6.5 4a.5.5 0 0 1 .5.5v2h2a.5.5 0 0 1 0 1h-2v2a.5.5 0 0 1-1 0v-2h-2a.5.5 0 0 1 0-1h2v-2a.5.5 0 0 1 .5-.5z"/>
                      )}
                    </svg>
                    {autoZoom ? 'Zoom On' : 'Zoom Off'}
                  </button>

                  {isRenaming && (
                    <div className="absolute inset-0 bg-white/70 flex items-center justify-center backdrop-blur-sm transition-all">
                      <div className="text-sm font-bold animate-pulse px-4 py-2 bg-white rounded-full shadow-sm" style={{color: P.pink}}>
                        Menyimpan...
                      </div>
                    </div>
                  )}
                  {renameSuccess && (
                    <div className="absolute inset-0 bg-white/70 flex items-center justify-center backdrop-blur-sm transition-all">
                      <div className="bg-green-500 text-white px-5 py-2.5 rounded-full font-bold shadow-lg flex items-center gap-2 transform scale-110">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 16 16">
                          <path d="M10.97 4.97a.75.75 0 0 1 1.07 1.05l-3.99 4.99a.75.75 0 0 1-1.08.02L4.324 8.384a.75.75 0 1 1 1.06-1.06l2.094 2.093 3.473-4.425a.267.267 0 0 1 .02-.022z"/>
                        </svg>
                        Tersimpan & Lanjut!
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center p-6">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="48"
                    height="48"
                    fill={P.pinkRing}
                    className="mx-auto mb-3"
                    viewBox="0 0 16 16"
                  >
                    <path d="M4.502 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z" />
                    <path d="M14.002 13a2 2 0 0 1-2 2h-10a2 2 0 0 1-2-2V5A2 2 0 0 1 2 3a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8a2 2 0 0 1-1.998 2zM14 2H4a1 1 0 0 0-1 1h9.002a2 2 0 0 1 2 2v7A1 1 0 0 0 15 11V3a1 1 0 0 0-1-1zM2.002 4a1 1 0 0 0-1 1v8l2.646-2.354a.5.5 0 0 1 .63-.062l2.66 1.773 3.71-3.71a.5.5 0 0 1 .577-.094l1.777 1.947V5a1 1 0 0 0-1-1h-10z" />
                  </svg>
                  <p
                    className="text-sm font-medium"
                    style={{ color: P.textMuted }}
                  >
                    Klik "Buka Folder" untuk meload foto
                  </p>
                </div>
              )}
            </div>

            {currentFile && (
              <div className="mt-3 text-center">
                <span
                  className="inline-block bg-white px-3 py-1 rounded-full text-xs font-semibold shadow-sm"
                  style={{ color: P.textSub, border: `1px solid ${P.pinkBorder}` }}
                >
                  {currentFile.name}
                </span>
              </div>
            )}

            {/* Thumbnail Queue */}
            {files.length > 0 && (
              <div className="mt-6">
                <div className="flex justify-between items-end mb-2">
                  <label
                    className="block text-[11px] font-semibold uppercase tracking-widest"
                    style={{ color: P.textMuted, letterSpacing: "0.12em" }}
                  >
                    Antrean Foto
                  </label>
                  <span className="text-xs font-bold" style={{ color: P.pink }}>
                    {files.length} tersisa
                  </span>
                </div>
                
                <div 
                  className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar"
                  style={{ 
                    scrollbarWidth: 'thin',
                    scrollbarColor: `${P.pinkRing} transparent`
                  }}
                >
                  {files.map((file, idx) => (
                    <button
                      key={file.name}
                      onClick={() => setCurrentIndex(idx)}
                      className="shrink-0 rounded-lg overflow-hidden transition-all relative"
                      style={{
                        width: 60,
                        height: 60,
                        border: idx === currentIndex ? `2px solid ${P.pink}` : `1px solid ${P.pinkBorder}`,
                        opacity: idx === currentIndex ? 1 : 0.6
                      }}
                    >
                      <img src={file.url} alt="thumb" className="w-full h-full object-cover" />
                      {idx === currentIndex && (
                        <div className="absolute bottom-0 inset-x-0 h-1 bg-pink-500"></div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Scanner & Results */}
          <div className="w-full md:w-[45%] flex flex-col">
            {/* Input Section */}
            <div
              className="px-8 pt-6 pb-6"
              style={{ borderBottom: `1px solid ${P.pinkBorder}` }}
            >
              <label
                className="block text-[11px] font-semibold uppercase tracking-widest mb-3"
                style={{ color: P.textMuted, letterSpacing: "0.12em" }}
              >
                Barcode Scanner
              </label>
              <div className="flex gap-2.5">
                <div className="relative flex-1">
                  <input
                    ref={inputRef}
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Scan barcode..."
                    className="w-full rounded-lg px-4 py-3 text-sm transition-all duration-150 outline-none"
                    style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      background: P.bg,
                      color: P.text,
                      border: `1.5px solid ${P.pink}`,
                      boxShadow: `0 0 0 3px ${P.pinkRing}`,
                      caretColor: P.pink,
                      animation: shake ? "shake 0.4s ease" : undefined,
                    }}
                    autoFocus
                  />
                </div>
                <button
                  onClick={handleSearch}
                  className="rounded-lg px-5 py-3 text-sm font-semibold transition-all duration-150 shrink-0"
                  style={{ background: P.pink, color: "#fff" }}
                  onMouseEnter={(e) =>
                    ((e.currentTarget as HTMLButtonElement).style.background =
                      P.pinkLight)
                  }
                  onMouseLeave={(e) =>
                    ((e.currentTarget as HTMLButtonElement).style.background =
                      P.pink)
                  }
                >
                  Enter
                </button>
              </div>

              {notFound && (
                <p
                  className="mt-3 text-[13px]"
                  style={{
                    color: P.red,
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  ✗ Barcode &ldquo;{inputValue}&rdquo; tidak ditemukan.
                </p>
              )}
            </div>

            {/* Data Result Panel */}
            {result && (
              <div
                className="px-8 pt-6 pb-6"
                style={{ borderBottom: `1px solid ${P.pinkBorder}` }}
              >
                <label
                  className="block text-[11px] font-semibold uppercase tracking-widest mb-4"
                  style={{ color: P.textMuted, letterSpacing: "0.12em" }}
                >
                  Detail Produk
                </label>

                <div
                  className="rounded-lg p-5 flex flex-col gap-0"
                  style={{
                    background: P.bg,
                    border: `1px solid ${P.pinkBorder}`,
                  }}
                >
                  {/* Nama Barang */}
                  <div
                    className="pb-4"
                    style={{ borderBottom: `1px solid ${P.pinkBorder}` }}
                  >
                    <span
                      className="text-[11px] font-medium block mb-1"
                      style={{ color: P.textSub }}
                    >
                      Nama Barang
                    </span>
                    <span
                      className="text-base font-semibold"
                      style={{ color: P.text, letterSpacing: "-0.01em" }}
                    >
                      {result.namaBarang}
                    </span>
                  </div>

                  {/* Barcode */}
                  <div
                    className="py-4"
                    style={{ borderBottom: `1px solid ${P.pinkBorder}` }}
                  >
                    <span
                      className="text-[11px] font-medium block mb-1"
                      style={{ color: P.textSub }}
                    >
                      Barcode
                    </span>
                    <span
                      className="inline-block text-sm font-semibold px-2.5 py-1 rounded-md"
                      style={{
                        fontFamily: "'JetBrains Mono', monospace",
                        color: P.pink,
                        background: P.pinkPale,
                        border: `1px solid ${P.pinkBorder}`,
                      }}
                    >
                      {result.barcode}
                    </span>
                  </div>

                  {/* Kadar & Nampan */}
                  <div className="pt-4 grid grid-cols-2 gap-4">
                    <div>
                      <span
                        className="text-[11px] font-medium block mb-1"
                        style={{ color: P.textSub }}
                      >
                        Kadar
                      </span>
                      <span
                        className="text-sm font-semibold"
                        style={{ color: P.text }}
                      >
                        {result.kadar}
                      </span>
                    </div>
                    <div>
                      <span
                        className="text-[11px] font-medium block mb-1"
                        style={{ color: P.textSub }}
                      >
                        Nampan
                      </span>
                      <span
                        className="text-sm font-semibold"
                        style={{ color: P.text }}
                      >
                        {result.nampan}
                      </span>
                    </div>
                  </div>

                  {/* Berat & Ukuran */}
                  {(result.berat || result.ukuran) && (
                    <div className="pt-4 grid grid-cols-2 gap-4">
                      {result.berat && (
                        <div>
                          <span
                            className="text-[11px] font-medium block mb-1"
                            style={{ color: P.textSub }}
                          >
                            Berat (Gramasi)
                          </span>
                          <span
                            className="text-sm font-semibold"
                            style={{ color: P.text }}
                          >
                            {result.berat}
                          </span>
                        </div>
                      )}
                      {result.ukuran && (
                        <div>
                          <span
                            className="text-[11px] font-medium block mb-1"
                            style={{ color: P.textSub }}
                          >
                            Ukuran (Size)
                          </span>
                          <span
                            className="text-sm font-semibold"
                            style={{ color: P.text }}
                          >
                            {result.ukuran}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Generated File Name — Action Section */}
            {result && (
              <div className="px-8 pt-6 pb-8 flex-1">
                <div
                  className="rounded-lg p-5"
                  style={{
                    background: P.pinkPale,
                    border: `1.5px dashed ${P.pinkDash}`,
                  }}
                >
                  <span
                    className="text-[11px] font-semibold uppercase tracking-widest block mb-3"
                    style={{ color: P.pink, letterSpacing: "0.12em" }}
                  >
                    {directoryHandle ? "Auto-Renamed As" : "Generated File Name"}
                  </span>

                  {/* Selectable file name */}
                  <div
                    className="rounded-md px-3 py-2.5 mb-3 cursor-text"
                    style={{
                      background: "#fff",
                      border: `1px solid ${P.pinkBorder}`,
                      userSelect: "text",
                      WebkitUserSelect: "text",
                    }}
                  >
                    <span
                      className="text-sm font-medium break-all leading-relaxed select-all"
                      style={{
                        fontFamily: "'JetBrains Mono', monospace",
                        color: P.text,
                        display: "block",
                      }}
                    >
                      {result.generatedName}
                    </span>
                  </div>

                  {!directoryHandle && (
                    <div className="flex items-center gap-3">
                      <button
                        onClick={handleCopy}
                        className="rounded-md px-5 py-2 text-sm font-semibold transition-all duration-150"
                        style={{
                          background: copied ? P.green : P.pink,
                          color: "#fff",
                          minWidth: 90,
                        }}
                      >
                        {copied ? "Copied!" : "Copy"}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {!result && (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" fill={P.pinkPale} viewBox="0 0 16 16" className="mb-4">
                  <path d="M14.5 3a.5.5 0 0 1 .5.5v9a.5.5 0 0 1-.5.5h-13a.5.5 0 0 1-.5-.5v-9a.5.5 0 0 1 .5-.5h13zm-13-1A1.5 1.5 0 0 0 0 3.5v9A1.5 1.5 0 0 0 1.5 14h13a1.5 1.5 0 0 0 1.5-1.5v-9A1.5 1.5 0 0 0 14.5 2h-13z"/>
                  <path d="M3 5.5a.5.5 0 0 1 .5-.5h9a.5.5 0 0 1 0 1h-9a.5.5 0 0 1-.5-.5zM3 7.5a.5.5 0 0 1 .5-.5h9a.5.5 0 0 1 0 1h-9a.5.5 0 0 1-.5-.5zM3 9.5a.5.5 0 0 1 .5-.5h6a.5.5 0 0 1 0 1h-6a.5.5 0 0 1-.5-.5z"/>
                </svg>
                <p className="text-sm font-medium" style={{ color: P.textMuted }}>
                  {directoryHandle 
                    ? "Scan barcode untuk rename foto saat ini secara otomatis"
                    : "Silakan scan barcode untuk mencari data perhiasan"}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes shake {
          0%   { transform: translateX(0); }
          20%  { transform: translateX(-5px); }
          40%  { transform: translateX(5px); }
          60%  { transform: translateX(-3px); }
          80%  { transform: translateX(3px); }
          100% { transform: translateX(0); }
        }
        
        .custom-scrollbar::-webkit-scrollbar {
          height: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background-color: rgba(232,104,138,0.2);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background-color: rgba(232,104,138,0.4);
        }
      `}</style>
    </div>
  );
}
