const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const os = require("os");

// Electron VEGA_TICKET_BASE_DIR=userData verir; dev'de server klasörü.
const baseDir = process.env.VEGA_TICKET_BASE_DIR || path.join(__dirname, "..");
const CONFIG_PATH = path.join(baseDir, "config.json");

// Parola config.json içinde sabit anahtarla obfuske edilir. Gerçek güvenlik
// değil — parolayı düz metin bırakmamak için. vega_sorgu ile aynı desen; oradaki
// v3 anahtarı da okunabilsin diye legacy olarak tutuluyor (aynı SQL kullanıcısı).
const APP_SECRET = "vega-ticket-static-key-v1-stable-2026";
const LEGACY_SECRETS = [
  "vega-sorgu-static-key-v3-stable-2026",
  "vega-sorgu-static-key-v2::" + (os.hostname() || "local"),
];

const keyOf = (secret) => crypto.createHash("sha256").update(secret).digest();

function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", keyOf(APP_SECRET), iv);
  return iv.toString("hex") + ":" + cipher.update(text, "utf8", "hex") + cipher.final("hex");
}

function decryptWith(secret, text) {
  const parts = text.split(":");
  const iv = Buffer.from(parts.shift(), "hex");
  const decipher = crypto.createDecipheriv("aes-256-cbc", keyOf(secret), iv);
  return decipher.update(Buffer.from(parts.join(":"), "hex"), "hex", "utf8") + decipher.final("utf8");
}

function decrypt(text) {
  for (const secret of [APP_SECRET, ...LEGACY_SECRETS]) {
    try {
      return decryptWith(secret, text);
    } catch {
      /* sıradaki anahtarı dene */
    }
  }
  throw new Error("Kayıtlı parola çözülemedi. Ayarlardan yeniden girin.");
}

const DEFAULTS = {
  server: "localhost",
  port: 1433,
  database: "VEGADBozdemirkaya",
  ticketDatabase: "VEGATICKETDB",
  instanceName: "",
  username: "sa",
  password: "",
  firmaNo: "",
  donemNo: "",
  kullanici: "",
};

function readConfig() {
  if (!fs.existsSync(CONFIG_PATH)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
    if (raw.password) raw.password = decrypt(raw.password);
    return { ...DEFAULTS, ...raw };
  } catch (err) {
    console.error("config.json okunamadı:", err.message);
    return null;
  }
}

function writeConfig(config) {
  const out = { ...DEFAULTS, ...config };
  if (out.password) out.password = encrypt(out.password);
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(out, null, 2), "utf8");
}

/**
 * Kurulumu kolaylaştırmak için vega_sorgu / vega-whatsapp masaüstü
 * uygulamalarının kayıtlı bağlantı ayarını içe aktarır. Parola aynı AES
 * desenini kullandığı için decrypt() çözebiliyor — böylece kullanıcı sa
 * parolasını yeniden yazmak zorunda kalmaz.
 * @returns {{kaynak:string,server:string,port:number,database:string,username:string,password:string}|null}
 */
function digerUygulamadanIceAktar() {
  const appData = process.env.APPDATA;
  if (!appData) return null;
  for (const klasor of ["vega-sorgu-desktop", "vega-whatsapp-desktop"]) {
    const p = path.join(appData, klasor, "config.json");
    if (!fs.existsSync(p)) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(p, "utf8"));
      if (!raw.server || !raw.username || !raw.password) continue;
      return {
        kaynak: klasor,
        server: raw.server,
        port: parseInt(raw.port, 10) || 1433,
        database: raw.database || DEFAULTS.database,
        username: raw.username,
        password: decrypt(raw.password),
      };
    } catch {
      /* sıradaki adaya geç */
    }
  }
  return null;
}

module.exports = {
  CONFIG_PATH,
  DEFAULTS,
  readConfig,
  writeConfig,
  encrypt,
  decrypt,
  digerUygulamadanIceAktar,
};
