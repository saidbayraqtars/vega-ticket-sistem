import { useEffect, useRef } from "react";

export default function Modal({ baslik, onKapat, genislik = 640, children }) {
  const kapat = useRef(onKapat);
  kapat.current = onKapat;

  useEffect(() => {
    const tus = (e) => e.key === "Escape" && kapat.current?.();
    document.addEventListener("keydown", tus);
    return () => document.removeEventListener("keydown", tus);
  }, []);

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-auto bg-black/35 p-6"
      onMouseDown={(e) => e.target === e.currentTarget && onKapat?.()}>
      <div className="w-full rounded-lg bg-[#f6f7f9] shadow-xl" style={{ maxWidth: genislik }}>
        <div className="flex items-center rounded-t-lg border-b bg-white px-4 py-2.5">
          <span className="text-[14px] font-semibold">{baslik}</span>
          {onKapat && (
            <button type="button" onClick={onKapat} title="Kapat"
              className="ml-auto px-2 text-[18px] leading-none text-gray-500 hover:text-black">×</button>
          )}
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
