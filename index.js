const path = require('path');

// Bir önceki adımda hazırladığımız bot.js dosyasını çağırıyoruz
const startMyBot = require('./bot.js'); 

// Botun ayarlarını ve şifreni tam olarak buradan veriyorsun kanka:
startMyBot({
  host: '6b6t.org',
  port: 25565,
  username: 'VuadasTpaBot1',
  password: 'Ewdry3NgAF6h9', // Şifren güvenli şekilde buraya bağlandı
  reconnectDelay: 60000       // Bağlantı koparsa 1 dakika bekleyip otomatik bağlanır
});

console.log("[SYSTEM] Bot ayarları yüklendi, index.js tetiklendi.");
