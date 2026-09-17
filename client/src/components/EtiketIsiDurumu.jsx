import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";

const YOKLAMA_MS = 2000;

/**
 * Başka bilgisayarın kuyruğuna bırakılan etiket işinin durumunu izler.
 * İş sıradayken yoklanır; basılınca veya hata verince `onBitti` bir kez çağrılır.
 */
export function useEtiketIsi(onBitti) {
  const [is, setIs] = useState(null);
  const bitti = useRef(onBitti);
  bitti.current = onBitti;

  useEffect(() => {
    if (!is?.id || !is.sirada) return undefined;
    let iptal = false;
    const zamanlayici = setInterval(async () => {
      try {
        const r = await api.etiketIsDurumu(is.id);
        if (iptal) return;
        setIs(r.is);
        if (!r.is.sirada) bitti.current?.(r.is);
      } catch {
        /* geçici bağlantı sorunu; sonraki turda yeniden denenir */
      }
    }, YOKLAMA_MS);
    return () => { iptal = true; clearInterval(zamanlayici); };
  }, [is?.id, is?.sirada]);

  return [is, setIs];
}

/** İşin durum çubuğu: sırada / basıldı / hata ve "Tekrar gönder". */
export function EtiketIsiCubugu({ is, onDegisti, onKapat, className = "" }) {
  const [mesgul, setMesgul] = useState(false);
  const [hata, setHata] = useState(null);
  if (!is) return null;

  const renk = is.basildi
    ? "bg-emerald-50 text-emerald-900"
    : is.sirada ? "bg-blue-50 text-blue-900" : "bg-red-50 text-red-800";

  async function tekrar() {
    setMesgul(true);
    setHata(null);
    try {
      onDegisti((await api.etiketIsTekrar(is.id)).is);
    } catch (err) {
      if (err.govde?.is) onDegisti(err.govde.is);
      setHata(err.message);
    } finally {
      setMesgul(false);
    }
  }

  return (
    <div className={`flex items-center gap-3 px-3 py-1.5 text-[12px] ${renk} ${className}`}>
      {is.sirada && <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-blue-500" />}
      <span>{is.mesaj}{hata ? ` — ${hata}` : ""}</span>
      {(is.hata || is.iptal) && (
        <button type="button" onClick={tekrar} disabled={mesgul}
          className="shrink-0 rounded border border-current px-2 py-0.5 text-[11px] disabled:opacity-40">
          Tekrar gönder
        </button>
      )}
      {onKapat && !is.sirada && (
        <button type="button" onClick={onKapat} className="ml-auto px-1 text-[14px] leading-none opacity-60 hover:opacity-100" title="Kapat">×</button>
      )}
    </div>
  );
}
