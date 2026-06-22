import { useState, useRef, useEffect } from "react";

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
  const inputRef = useRef<HTMLInputElement>(null);

  const [database, setDatabase] = useState<Record<string, ProductData>>({});
  const [totalDb, setTotalDb] = useState(0);
  const [lastUpdated, setLastUpdated] = useState('');
  const [syncing, setSyncing] = useState(false);

  const loadData = async () => {
    try {
      const res = await fetch('/rename/perhiasan.json?' + new Date().getTime());
      const data = await res.json();
      setDatabase(data.items || {});
      setTotalDb(data.total || 0);
      if (data.lastUpdated) {
        const d = new Date(data.lastUpdated);
        setLastUpdated(d.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }));
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
      const res = await fetch('/rename/api/sync', { method: 'POST' });
      if (res.ok) {
        await loadData();
      } else {
        alert('Sync failed! Cek Nginx atau script sync.');
      }
    } catch (e) {
      console.error(e);
      alert('Gagal panggil API sync.');
    }
    setSyncing(false);
  };

  const handleSearch = () => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    
    let found = database[trimmed];
    
    // Fallback: 4 digit suffix search
    if (!found && trimmed.length === 4) {
      const matchKey = Object.keys(database).find(key => key.endsWith(trimmed));
      if (matchKey) {
        found = database[matchKey];
      }
    }

    if (found) {
      setResult(found);
      setNotFound(false);
      copyToClipboard(found.generatedName);
      setCopied(true);
      setTimeout(() => setCopied(false), 2800);
    } else {
      setResult(null);
      setNotFound(true);
      setShake(true);
      setTimeout(() => setShake(false), 450);
      setCopied(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleSearch();
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
          maxWidth: 600,
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
          className="px-8 pt-7 pb-6"
          style={{ borderBottom: `1px solid ${P.pinkBorder}` }}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1
                className="text-xl font-bold tracking-tight leading-tight"
                style={{ color: P.pink, letterSpacing: "-0.015em" }}
              >
                Jewelry Photo Renamer Tool
              </h1>
              <p className="mt-1 text-sm flex items-center gap-3" style={{ color: P.textSub }}>
                <span>
                  Total Database:{" "}
                  <span style={{ color: P.text, fontWeight: 500 }}>
                    {totalDb.toLocaleString()} Items
                  </span>
                </span>
                {lastUpdated && (
                  <span className="text-xs">
                    (Update: {lastUpdated})
                  </span>
                )}
              </p>
            </div>
            
            <button
              onClick={handleSync}
              disabled={syncing}
              className="shrink-0 mt-0.5 rounded-full px-4 py-1.5 text-xs font-bold transition-all"
              style={{ 
                background: syncing ? P.textMuted : P.pinkPale, 
                color: syncing ? '#fff' : P.pink,
                cursor: syncing ? 'wait' : 'pointer'
              }}
            >
              {syncing ? 'Syncing...' : 'Sync Data'}
            </button>
          </div>
        </div>

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
                placeholder="Scan or type barcode here..."
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
                ((e.currentTarget as HTMLButtonElement).style.background = P.pinkLight)
              }
              onMouseLeave={(e) =>
                ((e.currentTarget as HTMLButtonElement).style.background = P.pink)
              }
            >
              Enter
            </button>
            {(result || notFound) && (
              <button
                onClick={handleClear}
                className="rounded-lg px-4 py-3 text-sm font-medium transition-all duration-150 shrink-0"
                style={{
                  background: P.pinkPale,
                  color: P.pink,
                  border: `1px solid ${P.pinkBorder}`,
                }}
                onMouseEnter={(e) =>
                  ((e.currentTarget as HTMLButtonElement).style.background = "#F9D0DC")
                }
                onMouseLeave={(e) =>
                  ((e.currentTarget as HTMLButtonElement).style.background = P.pinkPale)
                }
              >
                Clear
              </button>
            )}
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

          {!result && !notFound && (
            <p className="mt-3 text-xs" style={{ color: P.textMuted }}>
              Coba: 32429444 · 10847263 · 55912087 · 78340019
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
          <div className="px-8 pt-6 pb-8">
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
                Generated File Name
              </span>

              {/* Selectable file name + Copy button */}
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

              <div className="flex items-center gap-3">
                <button
                  onClick={handleCopy}
                  className="rounded-md px-5 py-2 text-sm font-semibold transition-all duration-150"
                  style={{
                    background: copied ? P.green : P.pink,
                    color: "#fff",
                    minWidth: 90,
                  }}
                  onMouseEnter={(e) => {
                    if (!copied)
                      (e.currentTarget as HTMLButtonElement).style.background =
                        P.pinkLight;
                  }}
                  onMouseLeave={(e) => {
                    if (!copied)
                      (e.currentTarget as HTMLButtonElement).style.background =
                        P.pink;
                  }}
                >
                  {copied ? "Copied!" : "Copy"}
                </button>

                {copied && (
                  <span
                    className="text-sm font-medium"
                    style={{ color: P.green }}
                  >
                    ✓ Tersalin ke clipboard
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {!result && <div className="pb-8" />}
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
      `}</style>
    </div>
  );
}
