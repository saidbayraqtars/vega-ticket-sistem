# Şema Doğrulama Sonuçları — VEGADBozdemirkaya

Tarih: 2026-08-27. Tümü canlı SQL ile doğrulandı (`Invoke-Sqlcmd`, localhost, Windows auth).

---

## 1. İki isim düzeltmesi (kritik)

| Senin dediğin | Gerçek kolon | Not |
|---|---|---|
| `ÖZELKOD1` | **`KOD1`** | `TBLCARI`'de `OZELKOD*` kolonu **YOK**. `KOD1`…`KOD7` var. `OZELKOD1` sadece belge başlık tablolarında (şube/kasa) |
| `FAX` | **`FAKS`** | `nvarchar(20)`. Ayrıca `YFAKS` (yetkili faksı) var — onu kullanma |

## 2. Örnek girişler NEREDE — firma 0101 değil, **firma 0103**

`F0103TBLCARI`:

| IND | FIRMAKODU | FIRMAADI | KOD1 | FAKS |
|---|---|---|---|---|
| 111 | (cari kodu) | (anlaşmalı örnek müşteri) | `ANLAŞMALI` | `11.12.2024` |
| 126 | (cari kodu) | (yeni müşteri örneği) | `YENİ MÜŞTERİ` | `29.11.2025` |

⚠ **`K2` carisi boş.** `F0103TBLCARI` IND=60150 (bireysel cari) → KOD1 boş, FAKS boş.
`F0101TBLCARI` IND=125253 → aynı, boş. Yani örnek giriş K2'ye değil, yukarıdaki 111 ve 126'ya yapılmış.

## 3. KOD1 bir açılır liste — tanımı tabloda duruyor ✔

`F0103TBLCARIKODTAN` (CATEGORY = kaçıncı KOD alanı):

| IND | KOD | CATEGORY |
|---|---|---|
| 101 | `120` | 1 |
| 103 | `YENİ MÜŞTERİ` | 1 |
| 104 | `ANLAŞMALI` | 1 |
| 100 | `POS` | 5 |
| 102 | `MUVER` | 5 |

→ **KOD1 seçenekleri: `120`, `YENİ MÜŞTERİ`, `ANLAŞMALI`.** `SÖZLEŞMELİ` diye bir seçenek **tanımlı değil**.

`F0103TBLCARIKARTKODLABEL` — Vega ekranındaki başlıklar:

| Kolon | Ekrandaki adı |
|---|---|
| KOD1 | **Tür** |
| KOD2 | Sınıf |
| KOD3 | Grup |
| KOD4 | 4-ÖK (P) |
| KOD5 | 5-ÖK (P) |
| KOD6 | 6-ÖK |
| KOD7 | 7-ÖK |

→ Yeni bir tür (`SÖZLEŞMELİ`) eklemek = `F0103TBLCARIKODTAN`'a CATEGORY=1 satırı eklemek.

## 4. Firma / dönem tablosu

`TBLFIRMA`:

| IND | KOD | KISAAD | Cari adedi | FAKS dolu | KOD1 dolu |
|---|---|---|---|---|---|
| 100 | DEMO | DEMO | 4 | 0 | 0 |
| 101 | ÖZDEMİRKAYA | ÖZDEMİRKAYA | ~79.500 | 92 | ~16.500 |
| **103** | **RESMİ** | **ÖZDEMİRKAYA LTD.ŞTİ** | **39.196** | **204** | **7** |
| 106 | 56 LAR | 56 LAR | 3.621 | 4 | 7 |
| 121 | — | — | 0 | 0 | 0 |

Firma 103 dönemleri: IND 1→2012 … **IND 15 → 2026 (güncel)**.
Hareket tablosu: `F0103D0015TBLCARIHAREKETLERI` — 14.359 satır, 31.12.2025 → 12.06.2026.

⚠ Firma 101'de KOD1 = `RESMİ`/`G.RESMİ`/`1721`/`MOBİL`… (tamamen başka anlam).
Firma 103'te FAKS'ın 204 dolusundan **202'si gerçek faks numarası**, sadece 2'si tarih (senin örneklerin).

## 5. IZAHAT dağılımı — canlı doğrulama (F0103D0015)

| Kod | Adet | Anlam |
|---|---|---|
| 83 | 3918 | Havale (banka tahsilat) |
| 104 | 3130 | Cari devir |
| 103 | 2582 | Cari devir |
| 21 | 2294 | Satış faturası |
| 13 | 843 | Cari giriş / tahsilat |
| 20 | 773 | Alış faturası |
| 84 | 422 | Banka ödeme |
| 11 | 240 | Cari çıkış / tediye |
| 19 | 68 | Verilen çek bordrosu |
| 22 | 36 | Alış iade |
| 23 | 25 | Satış iade |
| 18 | 18 | *(sözlükte yok — açılacak)* |
| 27 | 7 | Satış irsaliyesi |
| 32 | 2 | Stok giriş fişi |
| 33 | 1 | Stok çıkış fişi |

## 6. Kural motoru — verinin söylediği

```
FAKS boş/tarih değil        → sözleşme YOK      (etiket: "Sözleşmesiz")
FAKS = gg.aa.yyyy + KOD1='YENİ MÜŞTERİ' → bitiş = FAKS + 6 ay
FAKS = gg.aa.yyyy + KOD1='ANLAŞMALI'    → bitiş = FAKS + 1 yıl
```
Örnek kontrol: 11.12.2024 + 1 yıl = 11.12.2025 (süresi dolmuş).
29.11.2025 + 6 ay = 29.05.2026 (süresi dolmuş). Bugün 27.08.2026.

FAKS formatı: **`gg.aa.yyyy`** (nokta ayraçlı, sıfır dolgulu). `nvarchar(20)` olduğu için
parse ederken `TRY_CONVERT` **kullanma** (eski SQL Server riski) — Node tarafında ayrıştır.

## 7. Referans mimari — `projeler/proje teknik`

"Bayraktar Yazılım Suite" v1.16.0 — bu projeye en yakın şablon, aynen kopyalanabilir:

```
server/   Express 4 + mssql 10 + jsonwebtoken + bcryptjs + helmet +
          express-rate-limit + node-cron    (routes/ services/ middleware/ config/ utils/)
client/   React 19 + Vite 8 + Tailwind 4 + react-router 7 + axios +
          react-hot-toast + xlsx           (pages/ components/ context/ api/)
desktop/  Electron launcher + electron-builder
```
`vega_sorgu/server/server.js` → connection pool, config şifreleme, `validateTableName()` deseni.
