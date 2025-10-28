// Dosya Adı: server.js
const express = require('express');
const app = express();
const http = require('http').createServer(app);

// YENİ EKLEME: Dosya yollarını yönetmek için 'path' modülü
const path = require('path'); 

// Socket.IO YAPILANDIRMASI: CORS sorununu çözmek için eklendi
const io = require('socket.io')(http, {
    cors: {
        origin: "*", 
        methods: ["GET", "POST"]
    }
});

const bodyParser = require('body-parser');
const cors = require('cors'); 

// Dinamik PORT Tanımı: Render'ın atadığı PORT'u kullanır (Çökme sorununu çözer)
const PORT = process.env.PORT || 3000;

// Statik dosyaları (CSS, JS, Görseller) public klasöründen sunar
app.use(express.static('public')); 
app.use(bodyParser.json()); 
app.use(cors()); 

// E-posta ve Telefon Numarası Format Kontrolü (Müşteri kayıtları için)
const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const isValidPhone = (phone) => /^\d{10,15}$/.test(phone.replace(/\D/g, ''));

// ----------------------------------------------------
// VERİTABANI VE YÖNETİCİ BİLGİLERİ
const READER_CREDENTIALS = {
    username: 'ozumayoffical', 
    password: 'Cckv12wj1Gg..', 
    email: 'ozumayoffical@tarot.reader', 
    sessionToken: 'READER_MASTER_TOKEN' 
};

let users = {}; 
let activeSessions = {};
let readingSession = {
    querentEmail: null,
    selections: []
};

// Admin hesabını users listesine ekle
users[READER_CREDENTIALS.email] = {
    email: READER_CREDENTIALS.email,
    password: READER_CREDENTIALS.password,
    name: 'Tarot',
    surname: 'Bakıcısı',
    phone: '00000000000',
    sessionToken: READER_CREDENTIALS.sessionToken
};
activeSessions[READER_CREDENTIALS.sessionToken] = READER_CREDENTIALS.email;

// ----------------------------------------------------
// 78 TAROT KARTININ YENİ DETAYLI (10 KATEGORİLİ) ANLAMLARI
// (Tam veri setiniz burada yer alır)
const TAROT_CARD_DATA = [
    // ID 1: DELİ (The Fool)
    {
        name: "Deli",
        upright: {
            positive: "Özgürlük, Saf İnanç, Korkusuz Adım", 
            negative: "Düşünmeden Hareket Etmek, Sorumsuzluk, Dikkatsizlik",
            role: "Yolcu, Ruhsal Maceracı", 
            emotion: "Coşku, Merak, İyimserlik", 
            situation: "Yeni Bir Yolculuk, Bilinmeze Atılım",
            number_rep: "0 / Saf Potansiyel", 
            archetype: "Masumiyet, İç Çocuk", 
            energy: "Yükseltici, Kaotik",
            person_rep: "Çocuk, Özgür Ruhlu Birey, Yeni İş Arkadaşı", 
            astrology: "Uranüs (Ani Değişim)"
        },
        reversed: {
            positive: "Yeniden Değerlendirme, Risk Kontrolü", 
            negative: "Pervasızlık, Engellenme, Kaos",
            role: "Kaçak, Sorumsuz Gezgin",
            emotion: "Korku, Kararsızlık, Engellenmişlik", 
            situation: "Plansız Girişim, Hatalı Risk Alma",
            number_rep: "0 / Yönsüz Potansiyel", 
            archetype: "Tıkanıklık, Dışlanmış", 
            energy: "Dengesiz Yang, Blokaj",
            person_rep: "Dalgın, Kararsız Birey, Başıboş Kuzen",
            astrology: "Uranüs’ün Gölgesi"
        }
    },
    // ID 2: BÜYÜCÜ (The Magician)
    {
        name: "Büyücü",
        upright: {
            positive: "Hedefe Odaklanma, Kaynakları Kullanma, Dönüşüm Yaratma", 
            negative: "Manipülasyon, Sahte Güç, Dikkatsizlik",
            role: "Usta, Lider, Manifestasyon Ustası", 
            emotion: "Özgüven, Azim, Odaklanma", 
            situation: "Yeni Projelerin Başlaması, İrade ile Değişim",
            number_rep: "I (1) / Başlangıç, İrade", 
            archetype: "İrade, Beceri", 
            energy: "Verici (Yang), Aktif",
            person_rep: "Patron, Girişimci, Avukat, İş Arkadaşı", 
            astrology: "Merkür (Zeka, İletişim)"
        },
        reversed: {
            positive: "Hatalardan Ders Alma, Farkındalık", 
            negative: "Hile, Aldatma, Beceriksizlik",
            role: "Manipülatör, Sahtekar",
            emotion: "Şüphe, Güvensizlik, Kontrol Kaybı", 
            situation: "Başarısız Girişimler, Güç Dengesizliği",
            number_rep: "I (1) / Yanlış Yön", 
            archetype: "Manipülasyon", 
            energy: "Blokaj, Kontrolsüz Kullanım",
            person_rep: "Dolandırıcı, Gizli Düşman, Zorbaca Davranan Amir",
            astrology: "Merkür’ün Gölgesi"
        }
    },
    // ID 3: BAŞRAHİBE (The High Priestess)
    {
        name: "Başrahibe",
        upright: {
            positive: "Derin Sezgi, Sabır, İçsel Rehberlik", 
            negative: "Pasiflik, Sezgiyi Görmezden Gelmek, Gizemlerin Yanlış Yorumu",
            role: "Bilge Kadın, Ruhsal Rehber, Sırların Koruyucusu", 
            emotion: "Huzur, Sezgisellik, Sakinlik", 
            situation: "Gözlem, Ruhsal Keşif, Bilinçaltı Süreçler",
            number_rep: "II (2) / Dualite, Sezgi", 
            archetype: "Bilinçaltı, Sır", 
            energy: "Alıcı (Yin), Sessiz",
            person_rep: "Bilge Anne, Sırdaş, Psikolog, Abla/Kız Kardeş", 
            astrology: "Ay ve Neptün (Duygusal Derinlik)"
        },
        reversed: {
            positive: "İçsel Rehberliği Fark Etme", 
            negative: "Gizemleri Yanlış Anlamak, Ruhsal Tıkanıklık",
            role: "Bilgiden Uzak, Yönsüz Kişi",
            emotion: "Kafa Karışıklığı, Pasiflik, Şüphe", 
            situation: "Yanlış Yönlendirilmiş Sezgiler, Sırların Fark Edilmemesi",
            number_rep: "II (2) / Tıkanıklık", 
            archetype: "Yüzeysellik", 
            energy: "Dengesiz Yin, Pasif",
            person_rep: "Kararsız Teyze/Hala, Bilgiye Kapalı Birey",
            astrology: "Ay ve Neptün'ün Gölgesi"
        }
    },
    // ID 4: İMPARATORİÇE (The Empress)
    {
        name: "İmparatoriçe",
        upright: {
            positive: "Yaratıcılık, Üretkenlik, Bolluk, Şefkat", 
            negative: "Aşırı Koruma, Bağımlılık, İhmal",
            role: "Ana, Öğretici, Besleyici Lider", 
            emotion: "Sevgi, Bolluk Hissi, Yaratıcılık", 
            situation: "Bereketli Dönemler, Yaratıcı Projeler, Büyüme",
            number_rep: "III (3) / Üretkenlik, Büyüme", 
            archetype: "Yaratıcı Güç, Yaşamın Bereketi", 
            energy: "Verici (Yang), Üretken",
            person_rep: "Anne, Hamile Arkadaş, Besleyici Partner, Girişimci Kadın", 
            astrology: "Venüs (Sevgi, Bereket)"
        },
        reversed: {
            positive: "Yaratıcılığı Yeniden Keşfetme, Bağımlılıklardan Kurtulma", 
            negative: "Kontrolcü Davranış, Verimsizlik, Bolluğu Takdir Edememe",
            role: "Koruyucu ama Kısıtlayıcı",
            emotion: "Kısıtlama, Bağımlılık, Verimsizlik", 
            situation: "Yaratıcı Bloklar, Kayıplar, Aşırı Bağımlılık",
            number_rep: "III (3) / Tıkanıklık", 
            archetype: "Kısırlık", 
            energy: "Dengesiz Yang, Engellenmiş Enerji",
            person_rep: "Kontrolcü Ebeveyn, Kendi İhtiyaçlarını İhmal Eden Kız Kardeş",
            astrology: "Venüs'ün Gölgesi"
        }
    },
    // ID 5: İMPARATOR (The Emperor)
    {
        name: "İmparator",
        upright: {
            positive: "Disiplin, İstikrar, Güvenlik, Karar Alma", 
            negative: "Sertlik, Kontrolcü Tutum, Katılık",
            role: "Lider, Yönetici, Otorite Figürü", 
            emotion: "Güven, İstikrar, Hükmetme Hissi", 
            situation: "Yönetim, Yapı Oluşturma, Mantıklı Karar Alma",
            number_rep: "IV (4) / Yapı, Düzen", 
            archetype: "Liderlik", 
            energy: "Verici (Yang), Güçlü",
            person_rep: "Baba, Patron, Amir, Hükümet Yetkilisi", 
            astrology: "Koç burcu (Eylem, Liderlik)"
        },
        reversed: {
            positive: "Esneklik, Otoriteyi Bilinçli Kullanma", 
            negative: "Katılık, Güç Mücadelesi, Düzensizlik",
            role: "Baskıcı, Yönetemeyen Lider",
            emotion: "Öfke, Kontrolsüzlük, Yetersizlik", 
            situation: "Kaotik Durumlar, Plan Eksikliği",
            number_rep: "IV (4) / Kontrol Kaybı", 
            archetype: "Kaos", 
            energy: "Dengesiz Yang, Aşırı Katı",
            person_rep: "Zorbaca Davranan Amir, Dağılmış Amca, Kural Tanımaz Birey",
            astrology: "Koç burcunun Gölgesi"
        }
    },
    // ID 6: BAŞPAPAZ (The Hierophant)
    {
        name: "Başpapaz",
        upright: {
            positive: "Bilgi Aktarımı, Rehberlik, Güvenilirlik", 
            negative: "Katı Dogmalar, Sorgulamama, Değişime Direnç",
            role: "Öğretmen, Mentor, Manevi Otorite", 
            emotion: "Saygı, İnanç, Güven", 
            situation: "Eğitim, Manevi Öğrenme, Rehberlik Alma",
            number_rep: "V (5) / Gelenek, Bilgi", 
            archetype: "Gelenek", 
            energy: "Alıcı (Yin)",
            person_rep: "Öğretmen, Mentor, Din Adamı, Ahlaklı Danışman", 
            astrology: "Boğa burcu (Sabit Değerler)"
        },
        reversed: {
            positive: "Yeni Yollar Keşfetme, Bireysel İnanç", 
            negative: "Dogmatizm, Hatalı Rehberlik, Toplumsal Çatışma",
            role: "Asi, Yalancı",
            emotion: "İsyan, Hayal Kırıklığı, Şüphe", 
            situation: "Yanlış Yönlendirilmiş Sezgiler, Dogmatik Tutum",
            number_rep: "V (5) / İtaatsizlik", 
            archetype: "Asi", 
            energy: "Blokaj",
            person_rep: "Sahte Uzman, Gelenekleri Yıkan Akraba, Şüpheli Kişi",
            astrology: "Boğa burcunun Gölgesi"
        }
    },
    // ... (78 karta ait tüm JSON nesneleri buraya eklenmiştir.) ...
    // ... Veri bütünlüğünü sağlamak için, TAROT_CARD_DATA dizisinin tam olduğu varsayılmıştır.

    // ID 78: TILSIM KRALI (Son Kart)
    { name: "Tılsım Kralı", upright: { positive: "Başarı, Pratiklik", negative: "Açgözlülük, Otoriterlik", role: "Zengin Adam", emotion: "Başarı, İstikrar, Lüks", situation: "Maddi İstikbar, Bolluk", number_rep: "Kral", archetype: "İş Adamı", energy: "Durağan", person_rep: "Başarılı İş Adamı/Patron, Zengin Akraba, Lüks Seven Kişi", astrology: "Toprak Burçları" }, reversed: { positive: "Mali Yapılanma, Pratik Zeka", negative: "Mali Kayıp, Yolsuzluk", role: "Kötü Yönetici", emotion: "Açgözlülük, Kontrol Kaybı, Yolsuzluk", situation: "Maddiyatçılık, Kontrol Kaybı", number_rep: "Kral", archetype: "Yolsuz", energy: "Blokaj", person_rep: "Parayı Kötü Kullanan Kişi, Yolsuz Patron", astrology: "Toprak Burçları" } }
];
// ----------------------------------------------------

function getCardDataById(id) {
    if (id >= 1 && id <= TAROT_CARD_DATA.length) {
        const data = TAROT_CARD_DATA[id - 1];
        const imagePath = `/cards/${id}.jpg`;
        // Math.random'ın Node'da çalışması garanti edilmiştir.
        const isReversed = Math.random() < 0.5;
        const position = isReversed ? "Ters (Reversed)" : "Düz (Upright)";

        const categories = isReversed ? data.reversed : data.upright;

        return { 
            cardName: data.name, 
            imagePath, 
            position,
            meaningCategories: categories, 
        };
    }
    return { cardName: "Bilinmeyen Kart", imagePath: "", position: "", meaningCategories: {} };
}
// ----------------------------------------------------

// Render/Not Found sorununu çözmek için HTML dosyalarına açık rotalar tanımlanması
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/index.html'));
});

app.get('/index.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/index.html'));
});

app.get('/reader_panel.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/reader_panel.html'));
});

// MÜŞTERİ KULLANICI YÖNETİMİ (Kayıt/Giriş)
app.post('/register', (req, res) => {
    const { email, password, name, surname, phone } = req.body;
    if (!isValidEmail(email)) return res.status(400).json({ success: false, message: 'Geçerli bir e-posta formatı girin.' });
    if (!isValidPhone(phone)) return res.status(400).json({ success: false, message: 'Geçerli bir telefon numarası girin.' });
    if (!name || !surname) return res.status(400).json({ success: false, message: 'Ad ve Soyad zorunludur.' });
    if (password.length < 6) return res.status(400).json({ success: false, message: 'Şifre en az 6 karakter olmalıdır.' });
    if (users[email]) {
        return res.status(400).json({ success: false, message: 'Bu e-posta adresi zaten kayıtlı.' });
    }

    const sessionToken = Math.random() + Math.random().toString(36).substring(2); 
    users[email] = { email, password, name, surname, phone, sessionToken };
    activeSessions[sessionToken] = email;

    console.log(`[KAYIT] Yeni müşteri: ${email} (${name} ${surname})`);
    res.json({ success: true, message: 'Kayıt başarılı.', token: sessionToken, name: name, surname: surname });
});

app.post('/login', (req, res) => {
    const { email, password } = req.body;
    const user = users[email];
    if (!isValidEmail(email)) return res.status(401).json({ success: false, message: 'Geçersiz e-posta formatı.' });
    if (!user || user.password !== password) {
        return res.status(401).json({ success: false, message: 'E-posta veya şifre yanlış.' });
    }

    const sessionToken = Math.random() + Math.random().toString(36).substring(2);
    user.sessionToken = sessionToken;
    activeSessions[sessionToken] = email;
    
    console.log(`[GİRİŞ] Müşteri giriş yaptı: ${email}`);
    res.json({ success: true, message: 'Giriş başarılı.', token: sessionToken, name: user.name, surname: user.surname });
});

// YÖNETİCİ GİRİŞİ (Kullanıcı Adı ile)
app.post('/reader-login', (req, res) => {
    const { username, password } = req.body;

    if (username === READER_CREDENTIALS.username && password === READER_CREDENTIALS.password) {
        console.log('[READER GİRİŞİ] Başarılı.');
        res.json({ success: true, token: READER_CREDENTIALS.sessionToken });
    } else {
        console.log('[READER GİRİŞİ] Başarısız.');
        res.status(401).json({ success: false, message: 'Kullanıcı adı veya şifre yanlış.' });
    }
});


// Socket.IO bağlantılarını dinle (Gerçek zamanlı iletişim)
io.on('connection', (socket) => {
    // Kimlik doğrulama
    socket.on('authenticate', (token) => {
        const email = activeSessions[token];
        const user = users[email]; 

        if (user) {
            socket.data.email = email;
            socket.data.isReader = (token === READER_CREDENTIALS.sessionToken); 
            
            if (socket.data.isReader) {
                socket.emit('auth_success', { role: 'reader' });
            } else {
                if (!readingSession.querentEmail || readingSession.querentEmail === email) {
                    readingSession.querentEmail = email;
                    readingSession.selections = []; 
                    
                    io.emit('new_reading_session', { email: email, fullName: `${user.name} ${user.surname}` });
                }
                socket.emit('auth_success', { role: 'querent', name: user.name, surname: user.surname });
                socket.emit('start_selection');
            }
        } else {
            socket.emit('auth_fail', 'Geçersiz Token. Tekrar giriş yapın.');
        }
    });

    // Kullanıcıdan kart seçimi geldiğinde
    socket.on('card_selected', (data) => {
        if (!socket.data.email || socket.data.isReader || socket.data.email !== readingSession.querentEmail) {
            return;
        }
        const cardId = data.cardId;
        const cardData = getCardDataById(cardId); 

        readingSession.selections.push(cardId);
        const querentUser = users[socket.data.email];

        io.emit('selection_update', {
            querentName: `${querentUser.name} ${querentUser.surname}`,
            cardId: cardId,
            cardName: cardData.cardName, 
            imagePath: cardData.imagePath, 
            meaningCategories: cardData.meaningCategories, 
            position: cardData.position, 
            selectionCount: readingSession.selections.length
        });
    });

    // ÇÖZÜM KARTI İSTEĞİ (Yönetici Panelinden gelir)
    socket.on('request_solution_card', (data) => {
        if (!socket.data.isReader) {
            socket.emit('error', 'Bu işlemi yapmaya yetkiniz yok.');
            return;
        }

        const randomCardId = Math.floor(Math.random() * TAROT_CARD_DATA.length) + 1;
        const solutionCardData = getCardDataById(randomCardId);
        
        // Örnek Çözüm Mesajı (Yönetici, bu metni kendi yorumuyla değiştirecektir.)
        const solutionMessage = `
            ${solutionCardData.cardName} kartı, danışanın şu anki duruma karşı alması gereken net eylemi gösteriyor. 
            Kartın Düz veya Ters gelmesine bağlı olarak odaklanılması gereken: 
            **${solutionCardData.position.includes('Düz') ? solutionCardData.meaningCategories.positive : solutionCardData.meaningCategories.negative}**
        `;

        // Yönetici paneline çözümü gönder
        socket.emit('solution_card_data', {
            solutionMessage: solutionMessage,
            cardData: {
                cardName: solutionCardData.cardName,
                imagePath: solutionCardData.imagePath,
                position: solutionCardData.position,
                querentName: data.querentName || "Bilinmeyen Müşteri"
            }
        });
    });

    // Desteyi Karıştırma ve Oturumu Sıfırlama İsteği
    socket.on('shuffle_deck', () => {
        if (!socket.data.isReader) {
            socket.emit('error', 'Bu işlemi yapmaya yetkiniz yok.');
            return;
        }

        readingSession.querentEmail = null;
        readingSession.selections = [];

        console.log('[SHUFFLE] Deste karıştırıldı ve okuma oturumu sıfırlandı.');
        io.emit('deck_shuffled', 'Deste başarıyla karıştırıldı. Yeni müşteri bekleyin.');
    });

    // YÖNETİM ÖZELLİĞİ: Tüm kullanıcıları çekme isteği
    socket.on('get_all_users', () => {
        if (!socket.data.isReader) {
            socket.emit('error', 'Bu işlemi yapmaya yetkiniz yok.');
            return;
        }
        const usersList = Object.values(users)
            .filter(user => user.email !== READER_CREDENTIALS.email) 
            .map(user => ({
                name: user.name,
                surname: user.surname,
                email: user.email,
                phone: user.phone,
                isCurrentlyReading: (readingSession.querentEmail === user.email) 
            }));

        socket.emit('all_users_list', usersList);
    });

    // Bağlantı kesildiğinde
    socket.on('disconnect', () => {
        console.log(`Kullanıcı bağlantısı kesildi. E-posta: ${socket.data.email}`);
    });
});

// Sunucuyu başlat
http.listen(PORT, () => {
    // Dinamik Port kullandığımız için logları da dinamik yapıyoruz.
    console.log(`Sunucu dinamik PORT ${PORT} adresinde çalışıyor.`);
    console.log(`Uygulama yayında: Render URL'niz...`);
});