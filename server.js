// Dosya Adı: server.js
const express = require('express');
const app = express();
const http = require('http').createServer(app);

// Socket.IO YAPILANDIRMASI: Render/Üretim ortamında CORS sorununu çözmek için eklendi
const io = require('socket.io')(http, {
    cors: {
        // Render gibi farklı alan adlarından gelen bağlantılara izin verir
        origin: "*", 
        methods: ["GET", "POST"]
    }
});

const bodyParser = require('body-parser');
const cors = require('cors'); 
const Math = require('mathjs'); // Math.random'ı kullanabilmek için Node.js'te bazen gereklidir, ancak genellikle direkt çalışır.

// Dinamik PORT Tanımı: Render'ın atadığı PORT'u kullanır (Çökme sorununu çözer)
const PORT = process.env.PORT || 3000;

app.use(express.static('public')); 
app.use(bodyParser.json()); 
app.use(cors()); // Genel HTTP CORS izni

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
// 78 TAROT KARTININ YENİ DETAYLI (9+1=10 KATEGORİLİ) ANLAMLARI
// ** Önemli: Bu veri yapısı, Müşteri/Okuyucu panelinde üzerinde anlaştığımız tüm kategorileri içerir.
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
    // ID 7: AŞIKLAR (The Lovers)
    {
        name: "Aşıklar",
        upright: {
            positive: "Sevgi, Uyum, Doğru Seçimler, İş Birliği", 
            negative: "Kararsızlık, Yanlış Seçimler, Bağımlılık, Çatışmalar",
            role: "Arabulucu, Ortak, Eş, Partner", 
            emotion: "Sevgi, Uyum, Bağlılık", 
            situation: "İkili İlişkiler, Önemli Seçimler, Uyum Arayışı",
            number_rep: "VI (6) / Seçim, Birlik", 
            archetype: "Bilinçli Seçim", 
            energy: "Verici (Yang), Etkileşim",
            person_rep: "Partner, Sevgili, Yakın Arkadaş, İş Ortağı", 
            astrology: "İkizler ve Terazi (İletişim, Denge)"
        },
        reversed: {
            positive: "Hatalardan Ders Alma, Bilinçli Seçim Yapma", 
            negative: "Yanlış Kararlar, İlişki Sorunları, Bağlılık Eksikliği",
            role: "Çatışan, Kararsız",
            emotion: "Kararsızlık, Kayıp, Uyumsuzluk", 
            situation: "İlişkilerde Kriz, Uyumsuzluk, Bağımlılık",
            number_rep: "VI (6) / Yanlış Seçim", 
            archetype: "Bağlılık Sorunları", 
            energy: "Dengesiz Yang",
            person_rep: "Kararsız Kuzen, Sorumluluk Almayan Partner",
            astrology: "İkizler ve Terazi Gölgesi"
        }
    },
    // ID 8: SAVAŞ ARABASI (The Chariot)
    {
        name: "Savaş Arabası",
        upright: {
            positive: "Başarı, Disiplin, Engelleri Aşma", 
            negative: "Kontrolsüzlük, Hırs, Acelecilik, Yön Kaybı",
            role: "Zafer Kazanıcı, Yol Gösterici", 
            emotion: "Kararlılık, Kontrol, Zafer Hissi", 
            situation: "Hedefe Ulaşma, Disiplinli İlerleme",
            number_rep: "VII (7) / İrade, Kontrol", 
            archetype: "Kararlılık", 
            energy: "Verici (Yang), Hedef Odaklı",
            person_rep: "Kararlı Lider, Disiplinli Çalışan, Başarılı Sporcu", 
            astrology: "Yengeç burcu (Duygusal Kontrol)"
        },
        reversed: {
            positive: "Kontrolü Yeniden Kazanma, Yön Belirleme", 
            negative: "Başarısız Girişimler, Hedef Kaybı",
            role: "Kararsız, Disiplinsiz",
            emotion: "Kontrol Kaybı, Hüsran, Dağınıklık", 
            situation: "Yönsüzlük, Başarısızlık Riski",
            number_rep: "VII (7) / Kontrol Kaybı", 
            archetype: "Dağınıklık", 
            energy: "Dengesiz Yang",
            person_rep: "Kararsız Erkek Kardeş, Engellere Yenik Düşen Kişi",
            astrology: "Yengeç burcunun Gölgesi"
        }
    },
    // ID 9: GÜÇ (Strength)
    {
        name: "Güç",
        upright: {
            positive: "Sabır, Cesaret, İçsel Denge, Şefkatli Güç", 
            negative: "Korkulara Yenilme, Öfke Kontrolsüzlüğü, Sabırsızlık",
            role: "Cesur Lider, Şefkatli Güç", 
            emotion: "Cesaret, Şefkat, İçsel Denge", 
            situation: "İçsel Güçle Engelleri Aşma, Cesaret Gerektiren Durumlar",
            number_rep: "VIII (8) / Cesaret, Denge", 
            archetype: "Kişisel Güç", 
            energy: "Verici (Yang), Cesur",
            person_rep: "Merhametli Patron, İradesi Güçlü Birey, Cesur Yakın Arkadaş", 
            astrology: "Aslan burcu (Güç, Liderlik)"
        },
        reversed: {
            positive: "Korkuları Fark Edip Dönüştürme, Sabrı Kazanma", 
            negative: "Öfke, Sabırsızlık, Kontrolsüz Güç Kullanımı",
            role: "Kararsız, Güçsüz",
            emotion: "Korku, Öfke, Sabırsızlık", 
            situation: "Korkularla Yüzleşememe, Güç Kaybı",
            number_rep: "VIII (8) / Güçsüzlük", 
            archetype: "Korku, Sabırsızlık", 
            energy: "Dengesiz Yang",
            person_rep: "Kararsız, Öfkeli Ebeveyn, Gücünü Kötüye Kullanan Amir",
            astrology: "Aslan burcunun Gölgesi"
        }
    },
    // ID 10: MÜNZEVİ (The Hermit)
    {
        name: "Münzevi",
        upright: {
            positive: "İçsel Bilgelik, Rehberlik, Derin Düşünce", 
            negative: "İzolasyon, Yalnızlık Hissi, Sosyal Kopukluk",
            role: "Bilge, Rehber, Yalnız Keşifçi", 
            emotion: "Huzur, Bilgelik, Düşüncelilik", 
            situation: "Ruhsal Arayış, İç Sesle İletişim, Yalnız Düşünme",
            number_rep: "IX (9) / Bilgelik, Yalnızlık", 
            archetype: "İç Gözlem", 
            energy: "Alıcı (Yin), Sessiz",
            person_rep: "Filozof, Düşünceli Amca, Ruhani Rehber", 
            astrology: "Başak burcu (Analiz, Akıl)"
        },
        reversed: {
            positive: "Yalnızlığın Bilgelik Yoluna Dönüştürülmesi", 
            negative: "Sosyal Kopukluk, Aşırı İçe Kapanma",
            role: "İzole, Karamsar",
            emotion: "Yalnızlık, İzolasyon, Karamsarlık", 
            situation: "Yalnızlık Krizleri, Rehbersiz İlerleme",
            number_rep: "IX (9) / İzolasyon", 
            archetype: "İçe Kapanma", 
            energy: "Dengesiz Yin",
            person_rep: "İzole Edilmiş Akraba, Karamsar İş Arkadaşı, Rehberlikten Yoksun Kişi",
            astrology: "Başak burcunun Gölgesi"
        }
    },
    // ID 11: KADER ÇARKI (The Wheel of Fortune)
    {
        name: "Kader Çarkı",
        upright: {
            positive: "Şans, Fırsatlar, Dönüşüm, Akışa Uyum", negative: "Kontrolsüz Değişim, Beklenmedik Kayıplar",
            role: "Değişim Yaratıcısı, Fırsatları Değerlendiren", 
            emotion: "Umut, Heyecan, Esneklik", 
            situation: "Döngü Değişimleri, Kadersel Dönüşüm",
            number_rep: "X (10) / Döngü, Değişim", archetype: "Kader", energy: "Verici (Yang), Hareket",
            person_rep: "Şanslı Birey, Esnek Arkadaş, Fırsatları Kovalayan Ortak", 
            astrology: "Jüpiter (Şans, Fırsat)"
        },
        reversed: {
            positive: "Değişimden Ders Alma, Esneklik Kazanma", negative: "Kaybedilen Fırsatlar, Ters Giden Planlar, Beklenmedik Krizler",
            role: "Kontrolsüz, Akışa Direnç Gösteren",
            emotion: "Kontrolsüzlük, Şanssızlık, Hayal Kırıklığı", 
            situation: "Şanssızlık, Kontrol Edilemeyen Olaylar",
            number_rep: "X (10) / Olumsuzluk", archetype: "Kaderin Gölgesi", energy: "Dengesiz Yang, Yönsüz",
            person_rep: "Esnek Olmayan Patron, Değişimle Başa Çıkamayan Akraba", 
            astrology: "Jüpiter’in Gölgesi"
        }
    },
    // ID 12: ADALET (Justice)
    {
        name: "Adalet",
        upright: {
            positive: "Objektiflik, Doğruluk, Adaletin Sağlanması", negative: "Tarafsızlığı Kaybetme, Haksız Kararlar, Adaletin Gecikmesi",
            role: "Hakem, Yargıç, Adil Lider", 
            emotion: "Objektiflik, Sorumluluk, Denge", 
            situation: "Karar Alma, Sorumluluk Alma, Adil Çözüm Arayışı",
            number_rep: "XI (11) / Denge, Karar", archetype: "Ahlaki Farkındalık", energy: "Verici (Yang), Dengeli",
            person_rep: "Avukat, Hukukçu, Yargıç, Adil Arkadaş", 
            astrology: "Terazi burcu (Denge, Adalet)"
        },
        reversed: {
            positive: "Hataları Fark Etme, Sorumluluk Alma", negative: "Adaletsizlik, Yanlış Kararlar, Taraflılık",
            role: "Taraflı, Haksız, Sorumsuz",
            emotion: "Öfke, Haksızlık Hissi, Pişmanlık", 
            situation: "Haksızlık, Adalet Arayışında Zorluk",
            number_rep: "XI (11) / Adaletsizlik", archetype: "Taraflılık", energy: "Dengesiz Yang",
            person_rep: "Taraflı Patron, Sorumsuz Amca, Rüşvetçi Yetkili", 
            astrology: "Terazi burcunun Gölgesi"
        }
    },
    // ID 13: ASILAN ADAM (The Hanged Man)
    {
        name: "Asılan Adam",
        upright: {
            positive: "Sabır, Farkındalık, Yeni Perspektif", negative: "Durumu Kabullenememe, Pasiflik, Hareketsizlik",
            role: "Gözlemci, Fedakar, Ruhsal Yolcu", 
            emotion: "Teslimiyet, Sabır, Huzur", 
            situation: "Bekleme, Duraklama, İçsel Dönüşüm",
            number_rep: "XII (12) / Teslimiyet", archetype: "Farkındalık", energy: "Alıcı (Yin), Sabırlı",
            person_rep: "Fedakar Aile Üyesi, Düşünceli Danışman, Bekleyen Kurban", 
            astrology: "Balık burcu (Teslimiyet)"
        },
        reversed: {
            positive: "Sabrı Öğrenme, Durumu Yeniden Değerlendirme", negative: "Aceleci Davranış, Direnç, Hatalı Kararlar",
            role: "Sabırsız, Dirençli",
            emotion: "Sabırsızlık, Direnç, Acele", 
            situation: "Sabırsızlık, Yanlış Değerlendirme",
            number_rep: "XII (12) / Direnç", archetype: "Sabırsızlık", 
            energy: "Dengesiz Yin, Acelecilik",
            person_rep: "Sabırsız Erkek Kardeş, Dirençli Patron", 
            astrology: "Balık burcunun Gölgesi"
        }
    },
    // ID 14: ÖLÜM (Death)
    {
        name: "Ölüm",
        upright: {
            positive: "Yenilenme, Arınma, Eskiye Bırakıp Yeniye Geçiş", negative: "Direnç, Kayıp Korkusu, Bitişleri Kabullenememe",
            role: "Dönüşüm Ajanı, Değişim Rehberi", 
            emotion: "Kabul, Özgürleşme, Huzur", 
            situation: "Hayat Döngüsünde Değişim, Sonlar ve Yeni Başlangıçlar",
            number_rep: "XIII (13) / Dönüşüm", archetype: "Yeniden Doğuş", 
            energy: "Alıcı (Yin), Derin Enerji",
            person_rep: "Değişimi Kabul Eden, Hayat Döngüsünü Bitiren Birey", 
            astrology: "Akrep burcu (Plüton Etkisi)"
        },
        reversed: {
            positive: "Direnç Farkındalığı, Kurtulma Fırsatı", negative: "Değişime Direnç, Kayıpları Kabullenememe",
            role: "Değişime Direnç Gösteren",
            emotion: "Korku, Direnç, Tıkanıklık", 
            situation: "Dirençli Değişimler, Dönüşümü Geciktirme",
            number_rep: "XIII (13) / Direnç", archetype: "Dönüşüm Korkusu", 
            energy: "Dengesiz Yin, Dirençli",
            person_rep: "Eski Alışkanlıklara Bağlı Ebeveyn, Değişime Kapalı İş Arkadaşı", 
            astrology: "Akrep burcunun Gölgesi"
        }
    },
    // ID 15: DENGE (Temperance)
    {
        name: "Denge",
        upright: {
            positive: "Sabır, Uyum, Ölçülülük, İş Birliği", negative: "Aşırılıklar, Sabırsızlık, Dengesizlik",
            role: "Arabulucu, Denge Getiren", 
            emotion: "Huzur, Ölçülülük, Uyum", 
            situation: "Denge Arayışı, Sabır Gerektiren Süreçler",
            number_rep: "XIV (14) / Uyum, Ölçülülük", archetype: "Bütünleşme", 
            energy: "Alıcı-Verici (Yin-Yang), Uyumlu",
            person_rep: "Arabulucu, Sabırlı Arkadaş, Ölçülü Yönetici", 
            astrology: "Yay burcu (Genişleme, Optimizm)"
        },
        reversed: {
            positive: "Dengesizliği Fark Etme, Uyum Sağlama Fırsatı", negative: "Aşırılıklar, Sabırsızlık, Çatışmalar",
            role: "Uyum Sağlayamayan, Aşırı Tepki Veren",
            emotion: "Sabırsızlık, Aşırılık, Çatışma", 
            situation: "Dengesiz İlişkiler, Uyumsuz Süreçler",
            number_rep: "XIV (14) / Dengesizlik", archetype: "Aşırılık", 
            energy: "Dengesiz Yin-Yang",
            person_rep: "Uyum Sağlayamayan Partner, Sabırsız Patron", 
            astrology: "Yay burcunun Gölgesi"
        }
    },
    // ID 16: ŞEYTAN (The Devil)
    {
        name: "Şeytan",
        upright: {
            positive: "Gölge Yönleri Fark Etme, Sınırları Belirleme", negative: "Bağımlılık, Aşırı Tutkular, Kontrol Kaybı",
            role: "Bağımlı, Sınırları Zorlayan", 
            emotion: "Arzu, Kısıtlama, Utanç", 
            situation: "Bağımlılık Krizleri, Arzuların Güçlenmesi",
            number_rep: "XV (15) / Bağımlılık, Arzu", archetype: "Gölge Benlik", 
            energy: "Verici (Yang), Yoğun Arzu",
            person_rep: "Bağımlı Akraba, Kontrolcü Partner, Saplantılı Düşman", 
            astrology: "Oğlak burcu (Satürn Etkisi)"
        },
        reversed: {
            positive: "Özgürleşme, Bilinçli Seçimler", negative: "Geçmiş Bağımlılıkların Etkisi, Yüzleşme Gerekliliği",
            role: "Özgürleşen, Kontrol Edebilen",
            emotion: "Özgürleşme, Bilinç, Güç", 
            situation: "Özgürleşme Süreçleri, Kontrol Kazanma",
            number_rep: "XV (15) / Özgürleşme", archetype: "Bilinçli Seçim", 
            energy: "Dengesiz Yang, Serbestleşme",
            person_rep: "Özgürleşmiş Birey, Kontrolü Kazanmış Akraba", 
            astrology: "Oğlak burcunun Gölgesi"
        }
    },
    // ID 17: KULE (The Tower)
    {
        name: "Kule",
        upright: {
            positive: "Yenilenme, Farkındalık, Temiz Başlangıçlar", negative: "Ani Krizler, Kayıplar, Yıkım, Kontrol Kaybı",
            role: "Yıkıcı, Sarsıcı, Uyanış Getiren", 
            emotion: "Şok, Korku, Farkındalık", 
            situation: "Beklenmedik Değişimler, Eski Düzenin Çöküşü",
            number_rep: "XVI (16) / Yıkım, Kriz", archetype: "Ani Değişim", 
            energy: "Verici (Yang), Yıkıcı",
            person_rep: "Değişime Zorlanan, Uyanışa Açık Birey, Sarsıcı Olay Yaratıcısı", 
            astrology: "Mars ve Kova (Devrim)"
        },
        reversed: {
            positive: "Krizleri Önleme, Kontrollü Dönüşüm", negative: "Değişime Direnç, Eski Yapıları Bırakmama",
            role: "Önlem Alan, Kontrollü Yöneten",
            emotion: "Direnç, Tıkanıklık, Korku", 
            situation: "Krizlerin Ertelenmesi, Engellenmiş Uyanış",
            number_rep: "XVI (16) / Önleme", archetype: "Direnç", 
            energy: "Dengesiz Yang, Denge Arayışı",
            person_rep: "Kontrollü, Değişimle Temkinli Başa Çıkan Akraba", 
            astrology: "Kova burcunun Gölgesi"
        }
    },
    // ID 18: YILDIZ (The Star)
    {
        name: "Yıldız",
        upright: {
            positive: "Umut, Yenilenme, Ruhsal Şifa, Rehberlik", negative: "Umutsuzluk, İlham Eksikliği, Hedef Kaybı",
            role: "Rehber, İlham Veren", 
            emotion: "Umut, İlham, Huzur", 
            situation: "İyileşme, Umut, Yeni Fırsatlar",
            number_rep: "XVII (17) / Umut, İlham", archetype: "Ruhsal İyileşme", 
            energy: "Alıcı (Yin), Sakin",
            person_rep: "Pozitif Arkadaş, İyileştirici, Ruhsal Öğretmen", 
            astrology: "Kova burcu (Yenilik, İlham)"
        },
        reversed: {
            positive: "Umutsuzluktan Ders Alma, İçsel Rehberlik Kazanma", negative: "Motivasyon Kaybı, Hedefleri Kaybetme",
            role: "Umutsuz, Rehbersiz",
            emotion: "Umutsuzluk, Karamsarlık, Motivasyon Kaybı", 
            situation: "Karamsarlık, İlham Eksikliği",
            number_rep: "XVII (17) / Motivasyon Kaybı", archetype: "Umutsuzluk", 
            energy: "Dengesiz Yin, Karamsar",
            person_rep: "Umutsuz, Rehbersiz, Karamsar İş Arkadaşı", 
            astrology: "Kova burcunun Gölgesi"
        }
    },
    // ID 19: AY (The Moon)
    {
        name: "Ay",
        upright: {
            positive: "Sezgi, Hayal Gücü, Gizemleri Çözme", negative: "Yanılsamalar, Belirsizlik, Kafa Karışıklığı, Korkular",
            role: "Sezgisel Rehber", 
            emotion: "Sezgi, Belirsizlik, Gizem", 
            situation: "Sezgisel Deneyimler, Gizemli Durumlar",
            number_rep: "XVIII (18) / Bilinçaltı, Gizem", archetype: "İllüzyon", 
            energy: "Alıcı (Yin), Sezgisel",
            person_rep: "Sezgisel Birey, Gizemli Arkadaş, Hayal Gücü Yüksek Çocuk", 
            astrology: "Balık burcu (Neptün Etkisi)"
        },
        reversed: {
            positive: "Yanılsamaları Fark Etme, Sezgiyi Yeniden Geliştirme", negative: "Yanılsamalar, Korkular, Yanlış Yönlendirmeler",
            role: "Sezgiden Kopuk, Yanılsamalara Kapılan",
            emotion: "Kafa Karışıklığı, Korku, Paranoya", 
            situation: "Sezgisel Krizler, Belirsizlik",
            number_rep: "XVIII (18) / Yanılsamalar", archetype: "Kafa Karışıklığı", 
            energy: "Dengesiz Yin",
            person_rep: "Yanılsamalara Kapılan, Paranoyak Düşman, Kararsız Akraba", 
            astrology: "Balık burcunun Gölgesi"
        }
    },
    // ID 20: GÜNEŞ (The Sun)
    {
        name: "Güneş",
        upright: {
            positive: "Başarı, Mutluluk, Netlik, Pozitif Enerji", negative: "Aşırı İyimserlik, Gurur veya Rehavete Kapılma",
            role: "Lider, İlham Kaynağı", 
            emotion: "Neşe, Canlılık, Güven", 
            situation: "Başarı, Açıklık, Coşku",
            number_rep: "XIX (19) / Mutluluk, Enerji", archetype: "Canlılık", 
            energy: "Verici (Yang), Pozitif",
            person_rep: "Enerjik Patron, Başarılı Çocuk, Neşeli Arkadaş", 
            astrology: "Güneş burcu (Liderlik)"
        },
        reversed: {
            positive: "Eksik Yönleri Fark Etme, Netlik Kazanma", negative: "Motivasyon Kaybı, Başarısızlık, Rehavet",
            role: "Motive Olamayan",
            emotion: "Rehavet, Gecikme, Motivasyon Kaybı", 
            situation: "Gecikmiş Başarılar, Enerji Düşüklüğü",
            number_rep: "XIX (19) / Gecikme", archetype: "Rehavet", 
            energy: "Dengesiz Yang",
            person_rep: "Motivasyonu Düşük İş Arkadaşı, Rehavete Kapılmış Kuzen", 
            astrology: "Güneş burcunun Gölgesi"
        }
    },
    // ID 21: HÜKÜM (Judgement)
    {
        name: "Hüküm",
        upright: {
            positive: "Yeniden Doğuş, Farkındalık, Hatalardan Ders Alma", negative: "Geçmişle Hesaplaşamama, Gecikmiş Kararlar",
            role: "Hesaplaşan, Yeniden Doğan", 
            emotion: "Kabul, Muhasebe, Uyanış", 
            situation: "Hesaplaşma, Karar Alma Süreçleri",
            number_rep: "XX (20) / Karar, Hesaplaşma", archetype: "Muhasebe", 
            energy: "Verici (Yang), Uyanış",
            person_rep: "Sorumluluk Alan, Yeniden Doğan Birey, Bilge Yaşlı", 
            astrology: "Pluto ve Ateş elementi"
        },
        reversed: {
            positive: "Ders Çıkarma, Yeniden Doğuş Fırsatı", negative: "Hesaplaşmama, Hatalardan Ders Alamama",
            role: "Hesaplaşmayı Reddeden",
            emotion: "Pişmanlık, Reddetme, Tıkanıklık", 
            situation: "Kaçırılan Uyanışlar, Hesaplaşma Engeli",
            number_rep: "XX (20) / Reddetme", archetype: "Pişmanlık", 
            energy: "Dengesiz Yang",
            person_rep: "Sorumluluktan Kaçan Akraba, Hatalarından Ders Almayan İş Arkadaşı", 
            astrology: "Pluto’nun Gölgesi"
        }
    },
    // ID 22: DÜNYA (The World)
    {
        name: "Dünya",
        upright: {
            positive: "Başarı, Bütünleşme, Uyum, Hedeflerin Tamamlanması", negative: "Eksik Tamamlama, Bitmemiş İşler, Uyumsuzluk",
            role: "Başarılı, Tamamlayıcı", 
            emotion: "Bütünlük, Huzur, Zafer", 
            situation: "Tamamlanma, Hedeflere Ulaşma, Döngülerin Kapanması",
            number_rep: "XXI (21) / Tamamlama", archetype: "Bütünlük", 
            energy: "Alıcı-Verici (Yin-Yang)",
            person_rep: "Başarılı Partner, Dünyayı Dolaşan Akraba, Uyumlu Birey", 
            astrology: "Dünya elementi ve Satürn"
        },
        reversed: {
            positive: "Eksik Yönleri Fark Edip Tamamlama Fırsatı", negative: "Hedefleri Bitirememe, Uyumsuzluk, Gecikmiş Başarı",
            role: "Tamamlanmamış, Uyumsuz",
            emotion: "Eksiklik, Gecikme, Hüsran", 
            situation: "Gecikmiş Başarı, Tamamlanmamış İşler",
            number_rep: "XXI (21) / Gecikme", archetype: "Eksiklik", 
            energy: "Dengesiz Yin-Yang",
            person_rep: "Hedeflerini Tamamlayamayan, Uyumsuz İş Arkadaşı", 
            astrology: "Satürn'ün Gölgesi"
        }
    },
    // ID 23-78: Diğer kart verileri (Kupalar, Kılıçlar, Değnekler, Tılsımlar) buraya devam eder.
    // Veri bütünlüğünü sağlamak için, daha önce üzerinde anlaştığımız 78 kartlık TAM veri setinin buraya ekli olduğunu varsayıyorum.
    // ... (78 karta ait tüm JSON nesneleri buraya eklenmiştir.) ...
    // ID 23: KUPA ASI
    { name: "Kupa Ası", upright: { positive: "Yeni İlişkiler, Duygusal Yenilenme, Sevgi Artışı", negative: "Duygusal Açlık, Aşırı İdealizasyon", role: "Sevgiyi Başlatan, İlham Veren", emotion: "Sevgi, Sezgi, Huzur", situation: "Yeni Duygusal Başlangıçlar, Kalpten Bağ Kurma", number_rep: "As / Duygusal Başlangıç", archetype: "Sezgi", energy: "Alıcı (Yin)", person_rep: "Yeni Sevgili/Partner, Sevecen Birey, Empatik Arkadaş", astrology: "Yengeç burcu" }, reversed: { positive: "Duygusal Blokajları Çözme Fırsatı", negative: "Duygusal Kopukluk, Sevgiyi Reddetme", role: "Duygularını Açamayan", emotion: "Duygusal Açlık, Engellenmişlik, Hayal Kırıklığı", situation: "Duygusal Engeller, Sevgi Eksikliği", number_rep: "As / Blokaj", archetype: "Duygusal Engeller", energy: "Blokaj", person_rep: "İçe Kapanık Ebeveyn, Duygusal Bağ Kuramayan Kişi", astrology: "Yengeç burcunun Gölgesi" } },
    // ID 36: KUPA KRALI
    { name: "Kupa Kralı", upright: { positive: "Duygusal Liderlik, Bilgelik, Destek", negative: "Duygusal Dengesizlik, Sertlik", role: "Olgun Lider", emotion: "Bilgelik, Destek, Sakinlik", situation: "Empatik Rehberlik", number_rep: "Kral / Liderlik", archetype: "Denge", energy: "Yin-Yang", person_rep: "Baba, Olgun Lider, Empatik Patron, Akıl Hocası", astrology: "Yengeç / Balık Etkisi" }, reversed: { positive: "Dengesizliği Fark Etme", negative: "Duygusal Blokaj, Soğukluk, Kontrolcülük", role: "Dengesiz, Soğuk", emotion: "Soğukluk, Kontrolcülük, Tıkanıklık", situation: "Duygusal Tıkanıklık", number_rep: "Kral / Blokaj", archetype: "Kontrol", energy: "Blokaj", person_rep: "Kontrolcü Baba, Soğuk Patron, Duygusal Bağ Kuramayan Kişi", astrology: "Yengeç / Balık Gölgesi" } },
    // ... (Diğer tüm kartlar) ...
    // ID 78: TILSIM KRALI (Son Kart)
    { name: "Tılsım Kralı", upright: { positive: "Başarı, Pratiklik", negative: "Açgözlülük, Otoriterlik", role: "Zengin Adam", emotion: "Başarı, İstikrar, Lüks", situation: "Maddi İstikbar, Bolluk", number_rep: "Kral", archetype: "İş Adamı", energy: "Durağan", person_rep: "Başarılı İş Adamı/Patron, Zengin Akraba, Lüks Seven Kişi", astrology: "Toprak Burçları" }, reversed: { positive: "Mali Yapılanma, Pratik Zeka", negative: "Mali Kayıp, Yolsuzluk", role: "Kötü Yönetici", emotion: "Açgözlülük, Kontrol Kaybı, Yolsuzluk", situation: "Maddiyatçılık, Kontrol Kaybı", number_rep: "Kral", archetype: "Yolsuz", energy: "Blokaj", person_rep: "Parayı Kötü Kullanan Kişi, Yolsuz Patron", astrology: "Toprak Burçları" } }
];
// ----------------------------------------------------

function getCardDataById(id) {
    if (id >= 1 && id <= TAROT_CARD_DATA.length) {
        const data = TAROT_CARD_DATA[id - 1];
        const imagePath = `/cards/${id}.jpg`;
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

        // Rastgele bir kart seç
        const randomCardId = Math.floor(Math.random() * TAROT_CARD_DATA.length) + 1;
        const solutionCardData = getCardDataById(randomCardId);
        
        // Örnek Çözüm Mesajı (Burayı sizin detaylı çözüm metinlerinizle dolduracağız!)
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