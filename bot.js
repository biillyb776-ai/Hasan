const mineflayer = require("mineflayer");
const pathfinder = require('@miner-org/mineflayer-baritone').loader; // Baritone eklendi
const goals = require('@miner-org/mineflayer-baritone').goals;       // Baritone eklendi
const { Vec3 } = require('vec3');                                   // Baritone eklendi
const { randomInt } = require("crypto");
const color = require("colors");
const readline = require('readline'); // Konsol yönetimi eklendi

const sleep = (toMs) => {
  return new Promise((r) => {
    setTimeout(r, toMs);
  });
};

function getRandomBoolean() {
  return randomInt(-1, 1) < 0;
}

const state = {
  offline: "offline",
  online: "online",
  reconnecting: "reconnecting",
  dead: "dead",
};

// Konsol kirliliğini önlemek için log değişkenleri
let loggingMsgs = false;
let sentPlayercount = false;

class BotInstance {
  constructor(botOptions) {
    this.botOptions = botOptions;
    
    this.spawned = 0;
    this.currentState = state.offline;
    this.verifyRequired = false; // Doğrulama durumu takibi
    this.portalTimeout = null;   // Zamanlayıcı kontrolü

    this.startBot();
  }

  startBot() {
    this.verifyRequired = false;
    this.bot = mineflayer.createBot(this.botOptions);
    this.bot.loadPlugin(pathfinder); // Baritone bota yüklendi
    this.registerEvents();
  }

  registerEvents() {
    this.bot.on("error", async (error) => {
      console.log(color.yellow(`[${this.botOptions.username}] Hata: `) + error.message);
      await this.reconnect();
    });

    this.bot.on("end", async (reason) => {
      console.log(color.yellow(`[${this.botOptions.username}] Bağlantı sonlandı: `) + reason);
      await this.reconnect();
    });

    this.bot.on("kicked", async (reason) => {
      console.log(color.yellow(`[${this.botOptions.username}] Sunucudan Atıldı (Kick): `) + reason);
    });

    this.bot.on("death", () => {
      this.currentState = state.dead;
    });

    this.bot.on("spawn", async () => {
      this.spawned++;
      this.currentState = state.online;

      console.log(color.green(`[${this.botOptions.username}] Dünyaya giriş yaptı (Spawn: ${this.spawned})`));

      // ŞİFRE GİRİŞİ YAPMA (İlk Giriş)
      if (this.spawned == 1) {
        await sleep(1500);
        // Şifreyi doğrudan başlatma ayarlarından (options) güvenli bir şekilde çeker
        this.bot.chat(`/login ${this.botOptions.password}`);
        console.log(color.cyan(`[${this.botOptions.username}] Şifre otomatik olarak gönderildi.`));

        // Eğer 6 saniye içinde chatten verify uyarısı gelmezse portala yürü
        this.portalTimeout = setTimeout(() => this.walkToPortal(), 6000);
      }

      // Oyuncu sayısını konsola basma (İkinci Giriş / Ana Dünyaya Geçiş)
      if (this.spawned == 2) {
        if (!sentPlayercount && this.bot.players) {
          const players = Object.values(this.bot.players).filter(
            (p) => p.username !== this.botOptions.username
          );
          console.log(color.green(`${players.length} oyuncu çevrimiçi.`));
          sentPlayercount = true;
        }
      }

      // Sunucuya tamamen oturunca anti-afk hareketini başlat
      if (this.spawned >= 2) {
        this.movementLoop();
      }
    });

    this.bot.on("messagestr", (ansiMsg) => {
      const msg = ansiMsg.toString();

      // Sunucu mesajlarını konsola temiz bir şekilde basar
      if (!loggingMsgs) {
        console.log(ansiMsg);
      }

      // DOĞRULAMA (VERIFY) SİSTEMİ YAKALAYICI
      if (msg.includes('6b6t.org/verify') || msg.toLowerCase().includes('verify')) {
        this.verifyRequired = true;
        
        // Doğrulama istendiyse otomatik portala yürümeyi hemen iptal et
        if (this.portalTimeout) {
          clearTimeout(this.portalTimeout);
        }

        console.log(color.red("\n========================================"));
        console.log(`⚠️  [${this.botOptions.username}] DOĞRULAMA GEREKLİ! HAREKET DURDURULDU.`);
        console.log("Bot şu an lobide güvenle bekliyor. Siteden doğrulamayı tamamla.");
        console.log("========================================\n");
      }

      if (msg.includes("/register") && this.spawned == 1) {
        console.log(color.red(`[HATA] ${this.botOptions.username} hesabı sunucuya kayıtlı değil veya şifre yanlış!`));
        process.exit();
      }
    });
  }

  // Güvenli Lobi Hareketi (Portala Giriş)
  walkToPortal() {
    if (this.verifyRequired || this.currentState !== state.online) {
      console.log(color.yellow(`[PORTAL] Doğrulama beklendiği için yürünmedi, lobide bekleniyor.`));
      return;
    }
    console.log(color.cyan(`[PORTAL] Giriş başarılı. Portala doğru düz yürüme başlatıldı...`));
    this.bot.setControlState("forward", true);
    this.bot.setControlState("jump", true);

    setTimeout(() => {
      this.bot.setControlState("forward", false);
      this.bot.setControlState("jump", false);
      console.log(color.cyan(`[PORTAL] Lobi hareket süresi doldu.`));
    }, 5000);
  }

  // Temiz Anti-AFK ve Rastgele Etrafa Bakma Döngüsü (Sadece Ana Dünyada Çalışır)
  async movementLoop() {
    const maxMotionDelay = 2000;
    while (this.currentState === state.online && !this.verifyRequired) {
      if (getRandomBoolean()) {
        this.bot.setControlState("jump", true);
        await sleep(randomInt(10, maxMotionDelay));
        this.bot.setControlState("jump", false);
      }
      if (getRandomBoolean()) {
        this.bot.setControlState("forward", true);
        await sleep(randomInt(10, maxMotionDelay));
        this.bot.setControlState("forward", false);
      }
      this.bot.look(randomInt(-180, 180), randomInt(-360, 360));
      await sleep(1000); // Sunucuyu yormayacak stabil döngü aralığı
    }
  }

  // Güvenli Yeniden Bağlanma (Auto-Reconnect) Fonksiyonu
  async reconnect() {
    if (this.currentState === state.reconnecting) return;
    this.currentState = state.reconnecting;
    
    if (this.bot) {
      try { this.bot.end(); } catch (e) {}
    }

    this.spawned = 0;
    // Eğer botOptions içinde reconnectDelay yoksa otomatik 1 dakika (60000 ms) bekler
    const delay = this.botOptions.reconnectDelay || 60000; 
    console.log(color.yellow(`[YENİDEN BAĞLANTI] Bot ${delay / 1000} saniye sonra tekrar bağlanacak...`));
    
    await sleep(delay);
    this.startBot();
  }
}

// KONSOLDAN EL İLE BARITONE VE SOHBET YÖNETİMİ
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

let activeBotInstance = null; 

rl.on('line', async (line) => {
    const input = line.trim();
    if (!input || !activeBotInstance || !activeBotInstance.bot) return;

    // Konsola # yazarak Baritone'u yönetebilirsin
    if (input.startsWith('#')) {
        const args = input.substring(1).split(' ');
        const cmd = args[0].toLowerCase();
        console.log(color.cyan(`[BARITONE] Komut algılandı: ${input}`));

        try {
            if (cmd === 'goto' && args.length >= 4) {
                // Konsola şunu yazabilirsin: #goto 150 64 -200
                const x = parseInt(args[1]);
                const y = parseInt(args[2]);
                const z = parseInt(args[3]);
                const goal = new goals.GoalExact(new Vec3(x, y, z));
                await activeBotInstance.bot.ashfinder.goto(goal);
            } else if (cmd === 'stop') {
                activeBotInstance.bot.ashfinder.stop();
                console.log(color.cyan('[BARITONE] Hareket durduruldu.'));
            } else {
                console.log(color.red('[BARITONE] Geçersiz konsol komutu. Örnek kullanım: #goto X Y Z veya #stop'));
            }
        } catch (err) {
            console.log(color.red('[BARITONE HATA]'), err);
        }
    } else {
        // Konsola direkt bir şey yazarsan oyundaki chatte paylaşır
        activeBotInstance.bot.chat(input);
    }
});

// Projenin ana index.js yapısına uyum sağlaması için dışa aktarma fonksiyonu
module.exports = function(options) {
    const instance = new BotInstance(options);
    activeBotInstance = instance;
    return instance;
};
