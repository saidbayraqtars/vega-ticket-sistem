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
     DURUM            NVARCHAR(20)  NOT NULL DEFAULT 'ACIK',
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

  // --- Servis kabulü (v1.3) ---------------------------------------------
  // Müşteri cihazıyla geldiğinde açılan kabul kaydı. TICKETLER "bitmiş işlem"
  // arşivi olarak kalır; açık servis akışı buraya yazılır, ikisi karışmaz.
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
       (DURUM IN ('KABUL','ISLEMDE','HAZIR','TESLIM','IPTAL'))
   )`,

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
       (DURUM IN ('KABUL','ISLEMDE','HAZIR','TESLIM','IPTAL'))
   )`,

  `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_CIHAZLAR_SERVIS')
   CREATE INDEX IX_CIHAZLAR_SERVIS ON dbo.CIHAZLAR (SERVISID, SIRA)`,

  `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_SERVISKAYITLARI_DURUM')
   CREATE INDEX IX_SERVISKAYITLARI_DURUM
     ON dbo.SERVISKAYITLARI (SILINDI, DURUM, KABULTARIHI DESC)
     INCLUDE (FIRMANO, CARIIND, CARIADI)`,

  `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_SERVISKAYITLARI_CARI')
   CREATE INDEX IX_SERVISKAYITLARI_CARI ON dbo.SERVISKAYITLARI (FIRMANO, CARIIND)
     INCLUDE (DURUM, KABULTARIHI)`,
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

module.exports = { baglan, kapat, vega, ticket, config, bagliMi, baglaniyorMu, sqlConfig, ticketDbHazirla };
