const sql = require("mssql");

/**
 * İki ayrı havuz:
 *   vega   → VEGADB* — SADECE OKUMA. Hiçbir yerde INSERT/UPDATE/DELETE yok.
 *   ticket → VEGATICKETDB — uygulamanın kendi verisi (ticket, kullanıcı, log).
 * Vega'nın kendi tablolarına yazmıyoruz; Vega güncellemesi verimizi bozamaz.
 */
let vegaPool = null;
let ticketPool = null;
let aktifConfig = null;
// Açılışta bağlantı arka planda kurulur; arayüz "bağlantı yok" ile
// "henüz bağlanıyor" durumunu ayırt edebilsin diye izlenir.
let baglaniyor = false;

function sqlConfig(config, database) {
  const out = {
    user: config.username,
    password: config.password,
    database,
    server: config.server,
    options: {
      encrypt: false, // yerel ağ
      trustServerCertificate: true,
      enableArithAbort: true,
    },
    connectionTimeout: 15000,
    requestTimeout: 60000,
    pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
  };
  // Named instance verildiyse port VERİLMEZ — tedious ikisini birden kabul etmez.
  if (config.instanceName) out.options.instanceName = config.instanceName;
  else out.port = parseInt(config.port, 10) || 1433;
  return out;
}

/** Servis ve cihaz durumlarının tek kaynağı; kısıtlar ve route bundan üretilir. */
const SERVIS_DURUMLARI = ["KABUL", "ISLEMDE", "HAZIR", "ARIZADA", "KARGODA", "TESLIM", "IPTAL"];
const durumListesiSql = SERVIS_DURUMLARI.map((d) => `'${d}'`).join(",");

/**
 * Durum kısıtı listede olmayan bir durumu içermiyorsa düşürülüp güncel listeyle
 * yeniden kurulur. Her yeni durumda eski kurulumlar kendiliğinden yükselir.
 */
function durumKisitiYukselt(tablo, kisit) {
  const eksik = SERVIS_DURUMLARI.map((d) => `definition NOT LIKE '%''${d}''%'`).join(" OR ");
  return `IF OBJECT_ID('dbo.${tablo}','U') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM sys.check_constraints
       WHERE parent_object_id = OBJECT_ID('dbo.${tablo}')
         AND name = '${kisit}'
         AND NOT (${eksik})
     )
   BEGIN
     IF EXISTS (
       SELECT 1 FROM sys.check_constraints
       WHERE parent_object_id = OBJECT_ID('dbo.${tablo}')
         AND name = '${kisit}'
     )
       ALTER TABLE dbo.${tablo} DROP CONSTRAINT ${kisit};
     ALTER TABLE dbo.${tablo} WITH CHECK ADD CONSTRAINT ${kisit}
       CHECK (DURUM IN (${durumListesiSql}));
   END`;
}

const TICKET_SEMA = [
  `IF OBJECT_ID('dbo.KULLANICILAR','U') IS NULL
   CREATE TABLE dbo.KULLANICILAR (
     ID              INT IDENTITY(1,1) PRIMARY KEY,
     KULLANICIADI    NVARCHAR(60)  NOT NULL UNIQUE,
     ADSOYAD         NVARCHAR(100) NULL,
     PAROLAHASH      NVARCHAR(200) NULL,
     ROL             NVARCHAR(20)  NOT NULL DEFAULT 'KULLANICI',
     AKTIF           BIT           NOT NULL DEFAULT 1,
     OLUSTURMATARIHI DATETIME      NOT NULL DEFAULT GETDATE()
   )`,

  `IF OBJECT_ID('dbo.TICKETLER','U') IS NULL
   CREATE TABLE dbo.TICKETLER (
     ID               INT IDENTITY(1,1) PRIMARY KEY,
     FIRMANO          NVARCHAR(4)   NOT NULL,
     DONEMNO          NVARCHAR(4)   NOT NULL,
     CARIIND          INT           NOT NULL,
     CARIKODU         NVARCHAR(50)  NULL,
     CARIADI          NVARCHAR(255) NULL,
     BASLIK           NVARCHAR(200) NOT NULL,
     ACIKLAMA         NVARCHAR(MAX) NULL,
     DURUM            NVARCHAR(20)  NOT NULL DEFAULT 'ONAY_BEKLIYOR',
     ONCELIK          NVARCHAR(20)  NOT NULL DEFAULT 'NORMAL',
     KATEGORI         NVARCHAR(50)  NULL,
     ATANAN           NVARCHAR(60)  NULL,
     ACILISTARIHI     DATETIME      NOT NULL DEFAULT GETDATE(),
     PLANLANANTARIH   DATETIME      NULL,
     KAPANISTARIHI    DATETIME      NULL,
     OLUSTURAN        NVARCHAR(60)  NOT NULL,
     GUNCELLEYEN      NVARCHAR(60)  NULL,
     GUNCELLEMETARIHI DATETIME      NULL,
     SILINDI          BIT           NOT NULL DEFAULT 0,
     RV               ROWVERSION
   )`,

  `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_TICKETLER_CARI')
   CREATE INDEX IX_TICKETLER_CARI ON dbo.TICKETLER (FIRMANO, CARIIND) INCLUDE (DURUM)`,

  `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_TICKETLER_DURUM')
   CREATE INDEX IX_TICKETLER_DURUM ON dbo.TICKETLER (SILINDI, DURUM, ACILISTARIHI)`,

  `IF OBJECT_ID('dbo.TICKETLOG','U') IS NULL
   CREATE TABLE dbo.TICKETLOG (
     ID         INT IDENTITY(1,1) PRIMARY KEY,
     TICKETID   INT           NOT NULL,
     TARIH      DATETIME      NOT NULL DEFAULT GETDATE(),
     KULLANICI  NVARCHAR(60)  NULL,
     ALAN       NVARCHAR(40)  NULL,
     ESKIDEGER  NVARCHAR(MAX) NULL,
     YENIDEGER  NVARCHAR(MAX) NULL,
     NOTU       NVARCHAR(MAX) NULL
   )`,

  `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_TICKETLOG_TICKET')
   CREATE INDEX IX_TICKETLOG_TICKET ON dbo.TICKETLOG (TICKETID, TARIH)`,

  // --- Ücretlendirme (v1.1) ---------------------------------------------
  // Sözleşmesiz / süresi dolmuş müşteriye yapılan işlem ücretlendirilir.
  // Sözleşmesi yürürlükte olan müşteride işlem kapsam içindedir (ücretsiz).
  `IF COL_LENGTH('dbo.TICKETLER','UCRET') IS NULL
   ALTER TABLE dbo.TICKETLER ADD UCRET DECIMAL(18,2) NOT NULL
     CONSTRAINT DF_TICKETLER_UCRET DEFAULT 0`,

  `IF COL_LENGTH('dbo.TICKETLER','UCRETDURUMU') IS NULL
   ALTER TABLE dbo.TICKETLER ADD UCRETDURUMU NVARCHAR(20) NOT NULL
     CONSTRAINT DF_TICKETLER_UCRETDURUMU DEFAULT 'TAHSIL_EDILECEK'`,

  `IF COL_LENGTH('dbo.TICKETLER','TAHSILATTARIHI') IS NULL
   ALTER TABLE dbo.TICKETLER ADD TAHSILATTARIHI DATETIME NULL`,

  // Sözleşme durumunun anlık görüntüsü — Vega'daki KOD1/FAKS sonradan
  // değişirse geçmiş ticketın neden ücretli/ücretsiz olduğu kaybolmasın.
  `IF COL_LENGTH('dbo.TICKETLER','SOZLESMEDURUMU') IS NULL
   ALTER TABLE dbo.TICKETLER ADD SOZLESMEDURUMU NVARCHAR(20) NULL`,

  // --- İşlem onayı ve gönderilecek WhatsApp taslağı -------------------
  // Yeni kayıt patron takibi için onay kuyruğuna düşer; WhatsApp ise kayıt
  // anında gönderilir. Taslağı ticketta saklamak tekrar gönderimi güvenli kılar.
  `IF COL_LENGTH('dbo.TICKETLER','WHATSAPPMETNI') IS NULL
   ALTER TABLE dbo.TICKETLER ADD WHATSAPPMETNI NVARCHAR(1000) NULL`,

  `IF COL_LENGTH('dbo.TICKETLER','ONAYLAYAN') IS NULL
   ALTER TABLE dbo.TICKETLER ADD ONAYLAYAN NVARCHAR(60) NULL`,

  `IF COL_LENGTH('dbo.TICKETLER','ONAYTARIHI') IS NULL
   ALTER TABLE dbo.TICKETLER ADD ONAYTARIHI DATETIME NULL`,

  `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_TICKETLER_ONAYLI_AY')
   CREATE INDEX IX_TICKETLER_ONAYLI_AY
     ON dbo.TICKETLER (FIRMANO, SILINDI, DURUM, KAPANISTARIHI DESC)
     INCLUDE (CARIIND, CARIADI, BASLIK, UCRET)`,

  `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_TICKETLER_UCRET')
   CREATE INDEX IX_TICKETLER_UCRET ON dbo.TICKETLER (SILINDI, UCRETDURUMU)
     INCLUDE (UCRET)`,

  // Müşteri bazında 1-12 aylık özel destek süresi. Vega kartına yazılmaz.
  `IF OBJECT_ID('dbo.CARISURELERI','U') IS NULL
   CREATE TABLE dbo.CARISURELERI (
     ID                INT IDENTITY(1,1) PRIMARY KEY,
     FIRMANO           NVARCHAR(4)  NOT NULL,
     CARIIND           INT          NOT NULL,
     BASLANGICTARIHI   DATE         NOT NULL,
     SUREAY            TINYINT      NOT NULL,
     OLUSTURAN         NVARCHAR(60) NULL,
     GUNCELLEYEN       NVARCHAR(60) NULL,
     GUNCELLEMETARIHI  DATETIME     NOT NULL DEFAULT GETDATE(),
     RV                ROWVERSION,
     CONSTRAINT CK_CARISURELERI_SUREAY CHECK (SUREAY BETWEEN 1 AND 12),
     CONSTRAINT UQ_CARISURELERI_CARI UNIQUE (FIRMANO, CARIIND)
   )`,

  `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_CARISURELERI_FIRMA')
   CREATE INDEX IX_CARISURELERI_FIRMA ON dbo.CARISURELERI (FIRMANO, CARIIND)
     INCLUDE (BASLANGICTARIHI, SUREAY)`,

  // Merkezi WhatsApp: QR yalnız seçilen ana makinede tutulur. İstemciler mesajı
  // ortak ticket DB kuyruğuna bırakır; ana makine buradan gönderir.
  `IF OBJECT_ID('dbo.WHATSAPPAYARLARI','U') IS NULL
   CREATE TABLE dbo.WHATSAPPAYARLARI (
     ID                TINYINT       NOT NULL PRIMARY KEY,
     ANAMAKINE         NVARCHAR(128) NOT NULL,
     BAGLI             BIT           NOT NULL DEFAULT 0,
     HESAP             NVARCHAR(40)  NULL,
     SONHATA           NVARCHAR(500) NULL,
     SONYOKLAMA        DATETIME      NULL,
     GUNCELLEYEN       NVARCHAR(60)  NULL,
     GUNCELLEMETARIHI  DATETIME      NOT NULL DEFAULT GETDATE(),
     RV                ROWVERSION,
     CONSTRAINT CK_WHATSAPPAYARLARI_TEK CHECK (ID = 1)
   )`,

  `IF OBJECT_ID('dbo.WHATSAPPMESAJLARI','U') IS NULL
   CREATE TABLE dbo.WHATSAPPMESAJLARI (
     ID                BIGINT IDENTITY(1,1) PRIMARY KEY,
     TICKETID          INT            NOT NULL,
     FIRMANO           NVARCHAR(4)    NOT NULL,
     DONEMNO           NVARCHAR(4)    NOT NULL,
     CARIIND           INT            NOT NULL,
     TELEFON           NVARCHAR(20)   NULL,
     METIN             NVARCHAR(1000) NOT NULL,
     KAYITTARIHI       DATETIME       NOT NULL,
     DURUM             NVARCHAR(20)   NOT NULL DEFAULT 'BEKLIYOR',
     DENEME            INT            NOT NULL DEFAULT 0,
     MESAJID           NVARCHAR(120)  NULL,
     SONHATA           NVARCHAR(1000) NULL,
     OLUSTURMATARIHI   DATETIME       NOT NULL DEFAULT GETDATE(),
     GUNCELLEMETARIHI  DATETIME       NOT NULL DEFAULT GETDATE(),
     GONDERIMTARIHI    DATETIME       NULL,
     RV                ROWVERSION,
     CONSTRAINT UQ_WHATSAPPMESAJLARI_TICKET UNIQUE (TICKETID),
     CONSTRAINT CK_WHATSAPPMESAJLARI_DURUM CHECK
       (DURUM IN ('BEKLIYOR','GONDERILIYOR','GONDERILDI','HATA','IPTAL'))
   )`,

  `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_WHATSAPPMESAJLARI_KUYRUK')
   CREATE INDEX IX_WHATSAPPMESAJLARI_KUYRUK
     ON dbo.WHATSAPPMESAJLARI (DURUM, KAYITTARIHI, ID)
     INCLUDE (TICKETID, FIRMANO, DONEMNO, CARIIND, TELEFON)`,

  // Tüm istemcilerin kullandığı ortak, değişkenli gönderim şablonu.
  `IF OBJECT_ID('dbo.WHATSAPPMESAJAYARLARI','U') IS NULL
   CREATE TABLE dbo.WHATSAPPMESAJAYARLARI (
     ID                TINYINT        NOT NULL PRIMARY KEY,
     WHATSAPPSABLONU   NVARCHAR(1000) NOT NULL,
     GUNCELLEYEN       NVARCHAR(60)   NULL,
     GUNCELLEMETARIHI  DATETIME       NOT NULL DEFAULT GETDATE(),
     RV                ROWVERSION,
     CONSTRAINT CK_WHATSAPPMESAJAYARLARI_TEK CHECK (ID = 1)
   )`,

  // --- Servis kabulü (v1.3) ---------------------------------------------
  // Müşteri cihazıyla geldiğinde açılan kabul kaydı. TICKETLER uzaktan yapılan
  // işlerin onay/tamamlanma takibidir; açık servis akışı burada tutulur.
  // SERVISNO etikete basılan görünen numaradır; IDENTITY'den türetildiği için
  // ayrı sayaç ve yarış koşulu yok.
  `IF OBJECT_ID('dbo.SERVISKAYITLARI','U') IS NULL
   CREATE TABLE dbo.SERVISKAYITLARI (
     ID               INT IDENTITY(1,1) PRIMARY KEY,
     SERVISNO         AS ('SRV-' + RIGHT('000000' + CAST(ID AS VARCHAR(10)), 6)) PERSISTED,
     FIRMANO          NVARCHAR(4)   NOT NULL,
     DONEMNO          NVARCHAR(4)   NOT NULL,
     CARIIND          INT           NOT NULL,
     CARIKODU         NVARCHAR(50)  NULL,
     CARIADI          NVARCHAR(255) NULL,
     TELEFON          NVARCHAR(40)  NULL,
     YETKILI          NVARCHAR(100) NULL,
     DURUM            NVARCHAR(20)  NOT NULL DEFAULT 'KABUL',
     NOTU             NVARCHAR(MAX) NULL,
     KABULTARIHI      DATETIME      NOT NULL DEFAULT GETDATE(),
     TESLIMTARIHI     DATETIME      NULL,
     TESLIMALAN       NVARCHAR(60)  NOT NULL,
     GUNCELLEYEN      NVARCHAR(60)  NULL,
     GUNCELLEMETARIHI DATETIME      NULL,
     SILINDI          BIT           NOT NULL DEFAULT 0,
     RV               ROWVERSION,
     CONSTRAINT CK_SERVISKAYITLARI_DURUM CHECK
       (DURUM IN (${durumListesiSql}))
   )`,

  // Eski kurulumlardaki durum kısıtını genişlet: KARGODA (müşteriye kargoya
  // verildi) ve ARIZADA (üretici/yetkili servise arızaya gönderildi).
  durumKisitiYukselt("SERVISKAYITLARI", "CK_SERVISKAYITLARI_DURUM"),

  `IF OBJECT_ID('dbo.CIHAZLAR','U') IS NULL
   CREATE TABLE dbo.CIHAZLAR (
     ID               INT IDENTITY(1,1) PRIMARY KEY,
     SERVISID         INT           NOT NULL,
     SIRA             INT           NOT NULL DEFAULT 1,
     CINS             NVARCHAR(40)  NULL,
     MARKA            NVARCHAR(60)  NULL,
     MODEL            NVARCHAR(60)  NULL,
     SERINO           NVARCHAR(60)  NULL,
     ARIZA            NVARCHAR(400) NULL,
     AKSESUAR         NVARCHAR(200) NULL,
     DURUM            NVARCHAR(20)  NOT NULL DEFAULT 'KABUL',
     YAPILANISLEM     NVARCHAR(400) NULL,
     ETIKETBASILDI    DATETIME      NULL,
     ETIKETADEDI      INT           NOT NULL DEFAULT 0,
     RV               ROWVERSION,
     CONSTRAINT FK_CIHAZLAR_SERVIS FOREIGN KEY (SERVISID)
       REFERENCES dbo.SERVISKAYITLARI (ID),
     CONSTRAINT CK_CIHAZLAR_DURUM CHECK
       (DURUM IN (${durumListesiSql}))
   )`,

  durumKisitiYukselt("CIHAZLAR", "CK_CIHAZLAR_DURUM"),

  // Arızaya gönderim / kargoya verme geçmişi. Durum SERVISKAYITLARI'nda anlık
  // tutulur; cihaz servise gidip dönüp müşteriye kargolanınca ilk gönderimin
  // alıcı ve takip bilgisi kaybolmasın diye her gönderim ayrı satırdır.
  `IF OBJECT_ID('dbo.SERVISGONDERIMLERI','U') IS NULL
   CREATE TABLE dbo.SERVISGONDERIMLERI (
     ID               INT IDENTITY(1,1) PRIMARY KEY,
     SERVISID         INT            NOT NULL,
     TUR              NVARCHAR(10)   NOT NULL,
     ALICIADI         NVARCHAR(200)  NOT NULL,
     ALICIYETKILI     NVARCHAR(100)  NULL,
     ALICITELEFON     NVARCHAR(40)   NULL,
     ALICIADRES       NVARCHAR(600)  NULL,
     ALICIIL          NVARCHAR(100)  NULL,
     KARGOFIRMASI     NVARCHAR(60)   NULL,
     TAKIPNO          NVARCHAR(60)   NULL,
     NOTU             NVARCHAR(400)  NULL,
     GONDEREN         NVARCHAR(60)   NOT NULL,
     TARIH            DATETIME       NOT NULL DEFAULT GETDATE(),
     CONSTRAINT FK_SERVISGONDERIMLERI_SERVIS FOREIGN KEY (SERVISID)
       REFERENCES dbo.SERVISKAYITLARI (ID),
     CONSTRAINT CK_SERVISGONDERIMLERI_TUR CHECK (TUR IN ('ARIZA','KARGO'))
   )`,

  `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_SERVISGONDERIMLERI_SERVIS')
   CREATE INDEX IX_SERVISGONDERIMLERI_SERVIS ON dbo.SERVISGONDERIMLERI (SERVISID, TARIH DESC)`,

  `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_SERVISGONDERIMLERI_TUR')
   CREATE INDEX IX_SERVISGONDERIMLERI_TUR ON dbo.SERVISGONDERIMLERI (TUR, TARIH DESC)
     INCLUDE (ALICIADI, ALICIYETKILI, ALICITELEFON, ALICIADRES, ALICIIL)`,

  // Tüm bilgisayarların paylaştığı ayarlar (ör. adres etiketindeki gönderen).
  `IF OBJECT_ID('dbo.ORTAKAYARLAR','U') IS NULL
   CREATE TABLE dbo.ORTAKAYARLAR (
     ANAHTAR           NVARCHAR(60)   NOT NULL PRIMARY KEY,
     DEGER             NVARCHAR(MAX)  NULL,
     GUNCELLEYEN       NVARCHAR(60)   NULL,
     GUNCELLEMETARIHI  DATETIME       NOT NULL DEFAULT GETDATE()
   )`,

  // WhatsApp oturumunun hangi kullanıcıda açık olduğu: ana bilgisayarda
  // uygulamayı kullanan kişi kalp atışıyla yazılır.
  `IF COL_LENGTH('dbo.WHATSAPPAYARLARI','ANAKULLANICI') IS NULL
   ALTER TABLE dbo.WHATSAPPAYARLARI ADD ANAKULLANICI NVARCHAR(60) NULL`,

  // Şablonu en son kimin değiştirdiği zaten GUNCELLEYEN'de; PIN girişi için
  // KULLANICILAR.PAROLAHASH kullanılır (scrypt, bkz. lib/pin.js).
  `IF COL_LENGTH('dbo.KULLANICILAR','PINGUNCELLEMETARIHI') IS NULL
   ALTER TABLE dbo.KULLANICILAR ADD PINGUNCELLEMETARIHI DATETIME NULL`,

  // Bildirim carinin en çok üç cep numarasına gider. TELEFON ilk numara olarak
  // kalır (eski sürüm ana makine yalnız onu gönderir). GONDERILENLER, yarıda
  // kalan gönderim tekrarlanınca aynı kişiye ikinci mesaj gitmesin diye tutulur.
  `IF COL_LENGTH('dbo.WHATSAPPMESAJLARI','TELEFONLAR') IS NULL
   ALTER TABLE dbo.WHATSAPPMESAJLARI ADD TELEFONLAR NVARCHAR(100) NULL`,

  `IF COL_LENGTH('dbo.WHATSAPPMESAJLARI','GONDERILENLER') IS NULL
   ALTER TABLE dbo.WHATSAPPMESAJLARI ADD GONDERILENLER NVARCHAR(100) NULL`,

  `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_CIHAZLAR_SERVIS')
   CREATE INDEX IX_CIHAZLAR_SERVIS ON dbo.CIHAZLAR (SERVISID, SIRA)`,

  `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_SERVISKAYITLARI_DURUM')
   CREATE INDEX IX_SERVISKAYITLARI_DURUM
     ON dbo.SERVISKAYITLARI (SILINDI, DURUM, KABULTARIHI DESC)
     INCLUDE (FIRMANO, CARIIND, CARIADI)`,

  `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_SERVISKAYITLARI_CARI')
   CREATE INDEX IX_SERVISKAYITLARI_CARI ON dbo.SERVISKAYITLARI (FIRMANO, CARIIND)
     INCLUDE (DURUM, KABULTARIHI)`,

  // --- Servis kaydından WhatsApp mesajı (v1.7) ---------------------------
  // Servis mesajları aynı kuyruğu kullanır; bir servis kaydına birden çok
  // mesaj gidebildiği için TICKETID boş kalır ve tekillik yalnız dolu
  // TICKETID'ler için aranır. Eski sürüm ana bilgisayar satırı TICKETID'ye
  // bakmadan TELEFONLAR/METIN ile gönderdiği için bu değişiklikle uyumludur.
  `IF COL_LENGTH('dbo.WHATSAPPMESAJLARI','SERVISID') IS NULL
   ALTER TABLE dbo.WHATSAPPMESAJLARI ADD SERVISID INT NULL`,

  `IF COL_LENGTH('dbo.WHATSAPPMESAJLARI','MESAJTURU') IS NULL
   ALTER TABLE dbo.WHATSAPPMESAJLARI ADD MESAJTURU NVARCHAR(20) NULL`,

  `IF COL_LENGTH('dbo.WHATSAPPMESAJLARI','GONDEREN') IS NULL
   ALTER TABLE dbo.WHATSAPPMESAJLARI ADD GONDEREN NVARCHAR(60) NULL`,

  // Kolonu kullanan tekillik kısıtı ve kuyruk indeksi önce kaldırılır; eski
  // SQL Server sürümleri indeksteki kolonun boş olabilirliğini değiştirmez.
  // Tek işlemde yapılır ki yarıda kalırsa tablo kısıtsız kalmasın.
  // Filtreli indeks yüzünden tabloya QUOTED_IDENTIFIER OFF oturumdan yazılamaz;
  // uygulamanın sürücüsü (tedious) açık bağlanır, elle sqlcmd için -I gerekir.
  `IF EXISTS (SELECT 1 FROM sys.columns
             WHERE object_id = OBJECT_ID('dbo.WHATSAPPMESAJLARI') AND name = 'TICKETID' AND is_nullable = 0)
   BEGIN
     SET XACT_ABORT ON;
     BEGIN TRAN;
     IF OBJECT_ID('dbo.UQ_WHATSAPPMESAJLARI_TICKET', 'UQ') IS NOT NULL
       ALTER TABLE dbo.WHATSAPPMESAJLARI DROP CONSTRAINT UQ_WHATSAPPMESAJLARI_TICKET;
     IF EXISTS (SELECT 1 FROM sys.indexes
                WHERE object_id = OBJECT_ID('dbo.WHATSAPPMESAJLARI') AND name = 'IX_WHATSAPPMESAJLARI_KUYRUK')
       DROP INDEX IX_WHATSAPPMESAJLARI_KUYRUK ON dbo.WHATSAPPMESAJLARI;
     ALTER TABLE dbo.WHATSAPPMESAJLARI ALTER COLUMN TICKETID INT NULL;
     CREATE UNIQUE INDEX UX_WHATSAPPMESAJLARI_TICKET
       ON dbo.WHATSAPPMESAJLARI (TICKETID) WHERE TICKETID IS NOT NULL;
     CREATE INDEX IX_WHATSAPPMESAJLARI_KUYRUK
       ON dbo.WHATSAPPMESAJLARI (DURUM, KAYITTARIHI, ID)
       INCLUDE (TICKETID, FIRMANO, DONEMNO, CARIIND, TELEFON);
     COMMIT;
   END`,

  // --- Başka bilgisayardaki etiket yazıcısı (v1.7) ------------------------
  // Yazıcısını paylaşan bilgisayar burada kalp atışı yazar ve istemcilerin
  // önizlemesi için etiket düzenini yayımlar.
  `IF OBJECT_ID('dbo.ETIKETYAZICILARI','U') IS NULL
   CREATE TABLE dbo.ETIKETYAZICILARI (
     MAKINE            NVARCHAR(128)  NOT NULL PRIMARY KEY,
     YAZICI            NVARCHAR(200)  NULL,
     KULLANICI         NVARCHAR(60)   NULL,
     AYAR              NVARCHAR(MAX)  NULL,
     AKTIF             BIT            NOT NULL DEFAULT 1,
     SONHATA           NVARCHAR(500)  NULL,
     SONYOKLAMA        DATETIME       NOT NULL DEFAULT GETDATE(),
     GUNCELLEMETARIHI  DATETIME       NOT NULL DEFAULT GETDATE()
   )`,

  // İstemcilerin etiket bilgisayarına bıraktığı baskı işleri. Etiket metni
  // saklanmaz; etiket bilgisayarı cihazları basarken veritabanından okur.
  `IF OBJECT_ID('dbo.ETIKETISLERI','U') IS NULL
   CREATE TABLE dbo.ETIKETISLERI (
     ID                BIGINT IDENTITY(1,1) PRIMARY KEY,
     HEDEFMAKINE       NVARCHAR(128)  NOT NULL,
     TUR               NVARCHAR(10)   NOT NULL DEFAULT 'SERVIS',
     SERVISID          INT            NULL,
     CIHAZIDLER        NVARCHAR(600)  NULL,
     ADET              INT            NOT NULL DEFAULT 0,
     DURUM             NVARCHAR(20)   NOT NULL DEFAULT 'BEKLIYOR',
     DENEME            INT            NOT NULL DEFAULT 0,
     SONHATA           NVARCHAR(1000) NULL,
     GONDEREN          NVARCHAR(60)   NOT NULL,
     GONDERENMAKINE    NVARCHAR(128)  NULL,
     YAZICI            NVARCHAR(200)  NULL,
     OLUSTURMATARIHI   DATETIME       NOT NULL DEFAULT GETDATE(),
     GUNCELLEMETARIHI  DATETIME       NOT NULL DEFAULT GETDATE(),
     BASIMTARIHI       DATETIME       NULL,
     CONSTRAINT CK_ETIKETISLERI_DURUM CHECK (DURUM IN ('BEKLIYOR','BASILIYOR','BASILDI','HATA','IPTAL')),
     CONSTRAINT CK_ETIKETISLERI_TUR CHECK (TUR IN ('SERVIS','DENEME'))
   )`,

  `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_ETIKETISLERI_KUYRUK')
   CREATE INDEX IX_ETIKETISLERI_KUYRUK ON dbo.ETIKETISLERI (HEDEFMAKINE, DURUM, ID)`,

  `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_WHATSAPPMESAJLARI_SERVIS')
   CREATE INDEX IX_WHATSAPPMESAJLARI_SERVIS ON dbo.WHATSAPPMESAJLARI (SERVISID, ID)`,
];

/** Ticket veritabanı yoksa oluşturur, tabloları idempotent şekilde kurar. */
async function ticketDbHazirla(config) {
  const dbAdi = config.ticketDatabase || "VEGATICKETDB";
  if (!/^[A-Za-z][A-Za-z0-9_]{0,60}$/.test(dbAdi)) {
    throw new Error(`Geçersiz ticket veritabanı adı: ${dbAdi}`);
  }

  const master = await new sql.ConnectionPool(sqlConfig(config, "master")).connect();
  try {
    const varMi = await master
      .request()
      .input("db", sql.NVarChar, dbAdi)
      .query(`SELECT COUNT(*) AS cnt FROM sys.databases WHERE name = @db`);
    if (varMi.recordset[0].cnt === 0) {
      await master.request().batch(`CREATE DATABASE [${dbAdi}]`);
    }
  } finally {
    await master.close();
  }

  const pool = await new sql.ConnectionPool(sqlConfig(config, dbAdi)).connect();
  for (const ifade of TICKET_SEMA) {
    await pool.request().batch(ifade);
  }
  return pool;
}

async function baglan(config) {
  await kapat();
  baglaniyor = true;
  try {
    vegaPool = await new sql.ConnectionPool(sqlConfig(config, config.database)).connect();
    ticketPool = await ticketDbHazirla(config);
    aktifConfig = config;
    return { vegaPool, ticketPool };
  } finally {
    baglaniyor = false;
  }
}

async function kapat() {
  for (const p of [vegaPool, ticketPool]) {
    if (p) {
      try {
        await p.close();
      } catch {
        /* zaten kapalı */
      }
    }
  }
  vegaPool = null;
  ticketPool = null;
  aktifConfig = null;
}

const vega = () => vegaPool;
const ticket = () => ticketPool;
const config = () => aktifConfig;
const bagliMi = () => Boolean(vegaPool?.connected && ticketPool?.connected);
const baglaniyorMu = () => baglaniyor;

module.exports = { SERVIS_DURUMLARI, baglan, kapat, vega, ticket, config, bagliMi, baglaniyorMu, sqlConfig, ticketDbHazirla };
