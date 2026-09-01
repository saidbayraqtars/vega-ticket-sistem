const METIN = {
  aktif: "Aktif",
  bitiyor: "Bitiyor",
  doldu: "Süresi doldu",
  yok: "Sözleşmesiz",
};

export default function Rozet({ sozlesme }) {
  if (!sozlesme) return null;
  const { rozet, kalanGun } = sozlesme;
  let etiket = METIN[rozet] ?? rozet;
  if (rozet === "bitiyor") etiket = `${kalanGun} gün kaldı`;
  else if (rozet === "doldu") etiket = `${Math.abs(kalanGun)} gün geçti`;
  return (
    <span className={`rozet rozet-${rozet}`} title={sozlesme.etiket}>
      {etiket}
    </span>
  );
}
