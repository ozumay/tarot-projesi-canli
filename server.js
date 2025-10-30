// Dosya Adı: server.js
const express = require('express');
const app = express();
const http = require('http').createServer(app);

// KRİTİK EKLEME: Dosya yollarını (HTML dosyaları için) yönetmek için 'path' modülü
const path = require('path'); 

// Socket.IO YAPILANDIRMASI: CORS sorununu çözmek için eklendi
const io = require('socket.io')(http, {
    cors: {
        // Render gibi farklı alan adlarından gelen bağlantılara izin verir
        origin: "*", 
        methods: ["GET", "POST"]
    }
});

const bodyParser = require('body-parser');
const cors = require('cors'); 

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
// 78 TAROT KARTININ YENİ DETAYLI (10 KATEGORİLİ) ANLAMLARI
// (TAM 78 KART VERİSİ BURADADIR)
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
    { name: "Aşıklar", upright: { positive: "Sevgi, Uyum, Doğru Seçimler, İş Birliği", negative: "Kararsızlık, Yanlış Seçimler, Bağımlılık, Çatışmalar", role: "Arabulucu, Ortak, Eş, Partner", emotion: "Sevgi, Uyum, Bağlılık", situation: "İkili İlişkiler, Önemli Seçimler, Uyum Arayışı", number_rep: "VI (6) / Seçim, Birlik", archetype: "Bilinçli Seçim", energy: "Verici (Yang), Etkileşim", person_rep: "Partner, Sevgili, Yakın Arkadaş, İş Ortağı", astrology: "İkizler ve Terazi (İletişim, Denge)" }, reversed: { positive: "Hatalardan Ders Alma, Bilinçli Seçim Yapma", negative: "Yanlış Kararlar, İlişki Sorunları, Bağlılık Eksikliği", role: "Çatışan, Kararsız", emotion: "Kararsızlık, Kayıp, Uyumsuzluk", situation: "İlişkilerde Kriz, Uyumsuzluk, Bağımlılık", number_rep: "VI (6) / Yanlış Seçim", archetype: "Bağlılık Sorunları", energy: "Dengesiz Yang", person_rep: "Kararsız Kuzen, Sorumluluk Almayan Partner", astrology: "İkizler ve Terazi Gölgesi" } },
    // ID 8: SAVAŞ ARABASI (The Chariot)
    { name: "Savaş Arabası", upright: { positive: "Başarı, Disiplin, Engelleri Aşma", negative: "Kontrolsüzlük, Hırs, Acelecilik, Yön Kaybı", role: "Zafer Kazanıcı, Yol Gösterici", emotion: "Kararlılık, Kontrol, Zafer Hissi", situation: "Hedefe Ulaşma, Disiplinli İlerleme", number_rep: "VII (7) / İrade, Kontrol", archetype: "Kararlılık", energy: "Verici (Yang), Hedef Odaklı", person_rep: "Kararlı Lider, Disiplinli Çalışan, Başarılı Sporcu", astrology: "Yengeç burcu (Duygusal Kontrol)" }, reversed: { positive: "Kontrolü Yeniden Kazanma, Yön Belirleme", negative: "Başarısız Girişimler, Hedef Kaybı", role: "Kararsız, Disiplinsiz", emotion: "Kontrol Kaybı, Hüsran, Dağınıklık", situation: "Yönsüzlük, Başarısızlık Riski", number_rep: "VII (7) / Kontrol Kaybı", archetype: "Dağınıklık", energy: "Dengesiz Yang", person_rep: "Kararsız Erkek Kardeş, Engellere Yenik Düşen Kişi", astrology: "Yengeç burcunun Gölgesi" } },
    // ID 9: GÜÇ (Strength)
    { name: "Güç", upright: { positive: "Sabır, Cesaret, İçsel Denge, Şefkatli Güç", negative: "Korkulara Yenilme, Öfke Kontrolsüzlüğü, Sabırsızlık", role: "Cesur Lider, Şefkatli Güç", emotion: "Cesaret, Şefkat, İçsel Denge", situation: "İçsel Güçle Engelleri Aşma, Cesaret Gerektiren Durumlar", number_rep: "VIII (8) / Cesaret, Denge", archetype: "Kişisel Güç", energy: "Verici (Yang)", person_rep: "Merhametli Patron, İradesi Güçlü Birey, Cesur Yakın Arkadaş", astrology: "Aslan burcu (Güç, Liderlik)" }, reversed: { positive: "Korkuları Fark Edip Dönüştürme, Sabrı Kazanma", negative: "Öfke, Sabırsızlık, Kontrolsüz Güç Kullanımı", role: "Kararsız, Güçsüz", emotion: "Korku, Öfke, Sabırsızlık", situation: "Korkularla Yüzleşememe, Güç Kaybı", number_rep: "VIII (8) / Güçsüzlük", archetype: "Korku, Sabırsızlık", energy: "Dengesiz Yang", person_rep: "Kararsız, Öfkeli Ebeveyn, Gücünü Kötüye Kullanan Amir", astrology: "Aslan burcunun Gölgesi" } },
    // ID 10: MÜNZEVİ (The Hermit)
    { name: "Münzevi", upright: { positive: "İçsel Bilgelik, Rehberlik, Derin Düşünce", negative: "İzolasyon, Yalnızlık Hissi, Sosyal Kopukluk", role: "Bilge, Rehber, Yalnız Keşifçi", emotion: "Huzur, Bilgelik, Düşüncelilik", situation: "Ruhsal Arayış, İç Sesle İletişim, Yalnız Düşünme", number_rep: "IX (9) / Bilgelik, Yalnızlık", archetype: "İç Gözlem", energy: "Alıcı (Yin)", person_rep: "Filozof, Düşünceli Amca, Ruhani Rehber", astrology: "Başak burcu (Analiz, Akıl)" }, reversed: { positive: "Yalnızlığın Bilgelik Yoluna Dönüştürülmesi", negative: "Sosyal Kopukluk, Aşırı İçe Kapanma", role: "İzole, Karamsar", emotion: "Yalnızlık, İzolasyon, Karamsarlık", situation: "Yalnızlık Krizleri, Rehbersiz İlerleme", number_rep: "IX (9) / İzolasyon", archetype: "İçe Kapanma", energy: "Dengesiz Yin", person_rep: "İzole Edilmiş Akraba, Karamsar İş Arkadaşı, Rehberlikten Yoksun Kişi", astrology: "Başak burcunun Gölgesi" } },
    // ID 11: KADER ÇARKI (The Wheel of Fortune)
    { name: "Kader Çarkı", upright: { positive: "Şans, Fırsatlar, Dönüşüm, Akışa Uyum", negative: "Kontrolsüz Değişim, Beklenmedik Kayıplar", role: "Değişim Yaratıcısı, Fırsatları Değerlendiren", emotion: "Umut, Heyecan, Esneklik", situation: "Döngü Değişimleri, Kadersel Dönüşüm", number_rep: "X (10) / Döngü, Değişim", archetype: "Kader", energy: "Verici (Yang)", person_rep: "Şanslı Birey, Esnek Arkadaş, Fırsatları Kovalayan Ortak", astrology: "Jüpiter (Şans, Fırsat)" }, reversed: { positive: "Değişimden Ders Alma, Esneklik Kazanma", negative: "Kaybedilen Fırsatlar, Ters Giden Planlar, Beklenmedik Krizler", role: "Kontrolsüz, Akışa Direnç Gösteren", emotion: "Kontrolsüzlük, Şanssızlık, Hayal Kırıklığı", situation: "Şanssızlık, Kontrol Edilemeyen Olaylar", number_rep: "X (10) / Olumsuzluk", archetype: "Kaderin Gölgesi", energy: "Dengesiz Yang", person_rep: "Esnek Olmayan Patron, Değişimle Başa Çıkamayan Akraba", astrology: "Jüpiter’in Gölgesi" } },
    // ID 12: ADALET (Justice)
    { name: "Adalet", upright: { positive: "Objektiflik, Doğruluk, Adaletin Sağlanması", negative: "Tarafsızlığı Kaybetme, Haksız Kararlar, Adaletin Gecikmesi", role: "Hakem, Yargıç, Adil Lider", emotion: "Objektiflik, Sorumluluk, Denge", situation: "Karar Alma, Sorumluluk Alma, Adil Çözüm Arayışı", number_rep: "XI (11) / Denge, Karar", archetype: "Ahlaki Farkındalık", energy: "Verici (Yang)", person_rep: "Avukat, Hukukçu, Yargıç, Adil Arkadaş", astrology: "Terazi burcu (Denge, Adalet)" }, reversed: { positive: "Hataları Fark Etme, Sorumluluk Alma", negative: "Adaletsizlik, Yanlış Kararlar, Taraflılık", role: "Taraflı, Haksız, Sorumsuz", emotion: "Öfke, Haksızlık Hissi, Pişmanlık", situation: "Haksızlık, Adalet Arayışında Zorluk", number_rep: "XI (11) / Adaletsizlik", archetype: "Taraflılık", energy: "Dengesiz Yang", person_rep: "Taraflı Patron, Sorumsuz Amca, Rüşvetçi Yetkili", astrology: "Terazi burcunun Gölgesi" } },
    // ID 13: ASILAN ADAM (The Hanged Man)
    { name: "Asılan Adam", upright: { positive: "Sabır, Farkındalık, Yeni Perspektif", negative: "Durumu Kabullenememe, Pasiflik, Hareketsizlik", role: "Gözlemci, Fedakar, Ruhsal Yolcu", emotion: "Teslimiyet, Sabır, Huzur", situation: "Bekleme, Duraklama, İçsel Dönüşüm", number_rep: "XII (12) / Teslimiyet", archetype: "Farkındalık", energy: "Alıcı (Yin)", person_rep: "Fedakar Aile Üyesi, Düşünceli Danışman, Bekleyen Kurban", astrology: "Balık burcu (Teslimiyet)" }, reversed: { positive: "Sabrı Öğrenme, Durumu Yeniden Değerlendirme", negative: "Aceleci Davranış, Direnç, Hatalı Kararlar", role: "Sabırsız, Dirençli", emotion: "Sabırsızlık, Direnç, Acele", situation: "Sabırsızlık, Yanlış Değerlendirme", number_rep: "XII (12) / Direnç", archetype: "Sabırsızlık", energy: "Dengesiz Yin", person_rep: "Sabırsız Erkek Kardeş, Dirençli Patron", astrology: "Balık burcunun Gölgesi" } },
    // ID 14: ÖLÜM (Death)
    { name: "Ölüm", upright: { positive: "Yenilenme, Arınma, Eskiye Bırakıp Yeniye Geçiş", negative: "Direnç, Kayıp Korkusu, Bitişleri Kabullenememe", role: "Dönüşüm Ajanı, Değişim Rehberi", emotion: "Kabul, Özgürleşme, Huzur", situation: "Hayat Döngüsünde Değişim, Sonlar ve Yeni Başlangıçlar", number_rep: "XIII (13) / Dönüşüm", archetype: "Yeniden Doğuş", energy: "Alıcı (Yin)", person_rep: "Değişimi Kabul Eden, Hayat Döngüsünü Bitiren Birey", astrology: "Akrep burcu (Plüton Etkisi)" }, reversed: { positive: "Direnç Farkındalığı, Kurtulma Fırsatı", negative: "Değişime Direnç, Kayıpları Kabullenememe", role: "Değişime Direnç Gösteren", emotion: "Korku, Direnç, Tıkanıklık", situation: "Dirençli Değişimler, Dönüşümü Geciktirme", number_rep: "XIII (13) / Direnç", archetype: "Dönüşüm Korkusu", energy: "Dengesiz Yin", person_rep: "Eski Alışkanlıklara Bağlı Ebeveyn, Değişime Kapalı İş Arkadaşı", astrology: "Akrep burcunun Gölgesi" } },
    // ID 15: DENGE (Temperance)
    { name: "Denge", upright: { positive: "Sabır, Uyum, Ölçülülük, İş Birliği", negative: "Aşırılıklar, Sabırsızlık, Dengesizlik", role: "Arabulucu, Denge Getiren", emotion: "Huzur, Ölçülülük, Uyum", situation: "Denge Arayışı, Sabır Gerektiren Süreçler", number_rep: "XIV (14) / Uyum, Ölçülülük", archetype: "Bütünleşme", energy: "Alıcı-Verici (Yin-Yang)", person_rep: "Arabulucu, Sabırlı Arkadaş, Ölçülü Yönetici", astrology: "Yay burcu (Genişleme, Optimizm)" }, reversed: { positive: "Dengesizliği Fark Etme, Uyum Sağlama Fırsatı", negative: "Aşırılıklar, Sabırsızlık, Çatışmalar", role: "Uyum Sağlayamayan, Aşırı Tepki Veren", emotion: "Sabırsızlık, Aşırılık, Çatışma", situation: "Dengesiz İlişkiler, Uyumsuz Süreçler", number_rep: "XIV (14) / Dengesizlik", archetype: "Aşırılık", energy: "Dengesiz Yin-Yang", person_rep: "Uyum Sağlayamayan Partner, Sabırsız Patron", astrology: "Yay burcunun Gölgesi" } },
    // ID 16: ŞEYTAN (The Devil)
    { name: "Şeytan", upright: { positive: "Gölge Yönleri Fark Etme, Sınırları Belirleme", negative: "Bağımlılık, Aşırı Tutkular, Kontrol Kaybı", role: "Bağımlı, Sınırları Zorlayan", emotion: "Arzu, Kısıtlama, Utanç", situation: "Bağımlılık Krizleri, Arzuların Güçlenmesi", number_rep: "XV (15) / Bağımlılık, Arzu", archetype: "Gölge Benlik", energy: "Verici (Yang)", person_rep: "Bağımlı Akraba, Kontrolcü Partner, Saplantılı Düşman", astrology: "Oğlak burcu (Satürn Etkisi)" }, reversed: { positive: "Özgürleşme, Bilinçli Seçimler", negative: "Geçmiş Bağımlılıkların Etkisi, Yüzleşme Gerekliliği", role: "Özgürleşen, Kontrol Edebilen", emotion: "Özgürleşme, Bilinç, Güç", situation: "Özgürleşme Süreçleri, Kontrol Kazanma", number_rep: "XV (15) / Özgürleşme", archetype: "Bilinçli Seçim", energy: "Dengesiz Yang", person_rep: "Özgürleşmiş Birey, Kontrolü Kazanmış Akraba", astrology: "Oğlak burcunun Gölgesi" } },
    // ID 17: KULE (The Tower)
    { name: "Kule", upright: { positive: "Yenilenme, Farkındalık, Temiz Başlangıçlar", negative: "Ani Krizler, Kayıplar, Yıkım, Kontrol Kaybı", role: "Yıkıcı, Sarsıcı, Uyanış Getiren", emotion: "Şok, Korku, Farkındalık", situation: "Beklenmedik Değişimler, Eski Düzenin Çöküşü", number_rep: "XVI (16) / Yıkım, Kriz", archetype: "Ani Değişim", energy: "Verici (Yang)", person_rep: "Değişime Zorlanan, Uyanışa Açık Birey, Sarsıcı Olay Yaratıcısı", astrology: "Mars ve Kova (Devrim)" }, reversed: { positive: "Krizleri Önleme, Kontrollü Dönüşüm", negative: "Değişime Direnç, Eski Yapıları Bırakmama", role: "Önlem Alan, Kontrollü Yöneten", emotion: "Direnç, Tıkanıklık, Korku", situation: "Krizlerin Ertelenmesi, Engellenmiş Uyanış", number_rep: "XVI (16) / Önleme", archetype: "Direnç", energy: "Dengesiz Yang", person_rep: "Kontrollü, Değişimle Temkinli Başa Çıkan Akraba", astrology: "Kova burcunun Gölgesi" } },
    // ID 18: YILDIZ (The Star)
    { name: "Yıldız", upright: { positive: "Umut, Yenilenme, Ruhsal Şifa, Rehberlik", negative: "Umutsuzluk, İlham Eksikliği, Hedef Kaybı", role: "Rehber, İlham Veren", emotion: "Umut, İlham, Huzur", situation: "İyileşme, Umut, Yeni Fırsatlar", number_rep: "XVII (17) / Umut, İlham", archetype: "Ruhsal İyileşme", energy: "Alıcı (Yin)", person_rep: "Pozitif Arkadaş, İyileştirici, Ruhsal Öğretmen", astrology: "Kova burcu (Yenilik, İlham)" }, reversed: { positive: "Umutsuzluktan Ders Alma, İçsel Rehberlik Kazanma", negative: "Motivasyon Kaybı, Hedefleri Kaybetme", role: "Umutsuz, Rehbersiz", emotion: "Umutsuzluk, Karamsarlık, Motivasyon Kaybı", situation: "Karamsarlık, İlham Eksikliği", number_rep: "XVII (17) / Motivasyon Kaybı", archetype: "Umutsuzluk", energy: "Dengesiz Yin", person_rep: "Umutsuz, Rehbersiz, Karamsar İş Arkadaşı", astrology: "Kova burcunun Gölgesi" } },
    // ID 19: AY (The Moon)
    { name: "Ay", upright: { positive: "Sezgi, Hayal Gücü, Gizemleri Çözme", negative: "Yanılsamalar, Belirsizlik, Kafa Karışıklığı, Korkular", role: "Sezgisel Rehber", emotion: "Sezgi, Belirsizlik, Gizem", situation: "Sezgisel Deneyimler, Gizemli Durumlar", number_rep: "XVIII (18) / Bilinçaltı, Gizem", archetype: "İllüzyon", energy: "Alıcı (Yin)", person_rep: "Sezgisel Birey, Gizemli Arkadaş, Hayal Gücü Yüksek Çocuk", astrology: "Balık burcu (Neptün Etkisi)" }, reversed: { positive: "Yanılsamaları Fark Etme, Sezgiyi Yeniden Geliştirme", negative: "Yanılsamalar, Korkular, Yanlış Yönlendirmeler", role: "Sezgiden Kopuk, Yanılsamalara Kapılan", emotion: "Kafa Karışıklığı, Korku, Paranoya", situation: "Sezgisel Krizler, Belirsizlik", number_rep: "XVIII (18) / Yanılsamalar", archetype: "Kafa Karışıklığı", energy: "Dengesiz Yin", person_rep: "Yanılsamalara Kapılan, Paranoyak Düşman, Kararsız Akraba", astrology: "Balık burcunun Gölgesi" } },
    // ID 20: GÜNEŞ (The Sun)
    { name: "Güneş", upright: { positive: "Başarı, Mutluluk, Netlik, Pozitif Enerji", negative: "Aşırı İyimserlik, Gurur veya Rehavete Kapılma", role: "Lider, İlham Kaynağı", emotion: "Neşe, Canlılık, Güven", situation: "Başarı, Açıklık, Coşku", number_rep: "XIX (19) / Mutluluk, Enerji", archetype: "Canlılık", energy: "Verici (Yang)", person_rep: "Enerjik Patron, Başarılı Çocuk, Neşeli Arkadaş", astrology: "Güneş burcu (Liderlik)" }, reversed: { positive: "Eksik Yönleri Fark Etme, Netlik Kazanma", negative: "Motivasyon Kaybı, Başarısızlık, Rehavet", role: "Motive Olamayan", emotion: "Rehavet, Gecikme, Motivasyon Kaybı", situation: "Gecikmiş Başarılar, Enerji Düşüklüğü", number_rep: "XIX (19) / Gecikme", archetype: "Rehavet", energy: "Dengesiz Yang", person_rep: "Motivasyonu Düşük İş Arkadaşı, Rehavete Kapılmış Kuzen", astrology: "Güneş burcunun Gölgesi" } },
    // ID 21: HÜKÜM (Judgement)
    { name: "Hüküm", upright: { positive: "Yeniden Doğuş, Farkındalık, Hatalardan Ders Alma", negative: "Geçmişle Hesaplaşamama, Gecikmiş Kararlar", role: "Hesaplaşan, Yeniden Doğan", emotion: "Kabul, Muhasebe, Uyanış", situation: "Hesaplaşma, Karar Alma Süreçleri", number_rep: "XX (20) / Karar, Hesaplaşma", archetype: "Muhasebe", energy: "Verici (Yang)", person_rep: "Sorumluluk Alan, Yeniden Doğan Birey, Bilge Yaşlı", astrology: "Pluto ve Ateş elementi" }, reversed: { positive: "Ders Çıkarma, Yeniden Doğuş Fırsatı", negative: "Hesaplaşmama, Hatalardan Ders Alamama", role: "Hesaplaşmayı Reddeden", emotion: "Pişmanlık, Reddetme, Tıkanıklık", situation: "Kaçırılan Uyanışlar, Hesaplaşma Engeli", number_rep: "XX (20) / Reddetme", archetype: "Pişmanlık", energy: "Dengesiz Yang", person_rep: "Sorumluluktan Kaçan Akraba, Hatalarından Ders Almayan İş Arkadaşı", astrology: "Pluto’nun Gölgesi" } },
    // ID 22: DÜNYA (The World)
    { name: "Dünya", upright: { positive: "Başarı, Bütünleşme, Uyum, Hedeflerin Tamamlanması", negative: "Eksik Tamamlama, Bitmemiş İşler, Uyumsuzluk", role: "Başarılı, Tamamlayıcı", emotion: "Bütünlük, Huzur, Zafer", situation: "Tamamlanma, Hedeflere Ulaşma, Döngülerin Kapanması", number_rep: "XXI (21) / Tamamlama", archetype: "Bütünlük", energy: "Alıcı-Verici (Yin-Yang)", person_rep: "Başarılı Partner, Dünyayı Dolaşan Akraba, Uyumlu Birey", astrology: "Dünya elementi ve Satürn" }, reversed: { positive: "Eksik Yönleri Fark Edip Tamamlama Fırsatı", negative: "Hedefleri Bitirememe, Uyumsuzluk, Gecikmiş Başarı", role: "Tamamlanmamış, Uyumsuz", emotion: "Eksiklik, Gecikme, Hüsran", situation: "Gecikmiş Başarı, Tamamlanmamış İşler", number_rep: "XXI (21) / Gecikme", archetype: "Eksiklik", energy: "Dengesiz Yin-Yang", person_rep: "Hedeflerini Tamamlayamayan, Uyumsuz İş Arkadaşı", astrology: "Satürn'ün Gölgesi" } },
    // ID 23: KUPA ASI
    { name: "Kupa Ası", upright: { positive: "Yeni İlişkiler, Duygusal Yenilenme, Sevgi Artışı", negative: "Duygusal Açlık, Aşırı İdealizasyon", role: "Sevgiyi Başlatan, İlham Veren", emotion: "Sevgi, Sezgi, Huzur", situation: "Yeni Duygusal Başlangıçlar, Kalpten Bağ Kurma", number_rep: "As / Duygusal Başlangıç", archetype: "Sezgi", energy: "Alıcı (Yin)", person_rep: "Yeni Sevgili/Partner, Sevecen Birey, Empatik Arkadaş", astrology: "Yengeç burcu" }, reversed: { positive: "Duygusal Blokajları Çözme Fırsatı", negative: "Duygusal Kopukluk, Sevgiyi Reddetme", role: "Duygularını Açamayan", emotion: "Duygusal Açlık, Engellenmişlik, Hayal Kırıklığı", situation: "Duygusal Engeller, Sevgi Eksikliği", number_rep: "As / Blokaj", archetype: "Duygusal Engeller", energy: "Blokaj", person_rep: "İçe Kapanık Ebeveyn, Duygusal Bağ Kuramayan Kişi", astrology: "Yengeç burcunun Gölgesi" } },
    // ID 24: KUPA İKİLİSİ (Two of Cups)
    { name: "Kupa İkilisi", upright: { positive: "Sağlıklı İlişkiler, Sevgi ve Uyum", negative: "Dengesizlik, Bağımlılık, Yanlış Anlaşılmalar", role: "Partner, Uyum Sağlayıcı", emotion: "Uyum, Karşılıklı Sevgi, Bağlılık", situation: "Ortaklıklar, Romantik/İş İlişkilerinde Uyum", number_rep: "İki / Birlik, Ortaklık", archetype: "Denge, Uyum", energy: "Alıcı-Verici (Yin-Yang)", person_rep: "Anlayışlı Partner, Destekleyici Yakın Arkadaş, İş Ortağı", astrology: "Yengeç/Boğa Etkisi" }, reversed: { positive: "Dengesizliği Fark Edip Güçlendirme", negative: "Uyumsuz İlişkiler, Kopukluk, Çatışma", role: "Partneriyle Uyumsuz", emotion: "Dengesizlik, Kopukluk, Çatışma", situation: "Çatışmalı İlişkiler, Kopukluk", number_rep: "İki / Uyumsuzluk", archetype: "Dengesizlik", energy: "Dengesiz Yin-Yang", person_rep: "Uyumsuz Partner, Bağımlı Ebeveyn", astrology: "Yengeç/Boğa Gölgesi" } },
    // ID 25: KUPA ÜÇLÜSÜ (Three of Cups)
    { name: "Kupa Üçlüsü", upright: { positive: "Arkadaşlık, Sosyal Bağlar, Kutlama, Mutluluk Paylaşımı", negative: "Aşırı Eğlence, Sorumluluk Eksikliği, Dedikodu", role: "Arkadaş, Kutlamacı", emotion: "Neşe, Dostluk, Kutlama", situation: "Sosyal Etkinlikler, Kutlamalar", number_rep: "Üç / Kutlama, Topluluk", archetype: "Sosyal Bağ", energy: "Verici (Yang)", person_rep: "Neşeli Arkadaş Grubu, Sosyal Akraba, Düğün Organizatörü", astrology: "Yengeç/Boğa Etkisi" }, reversed: { positive: "Sosyal Bağlantıları Yeniden İnşa Etme Fırsatı", negative: "Yalnızlık, Grup Uyumsuzluğu", role: "Sosyal İzolasyon Yaşayan", emotion: "Yalnızlık, İzolasyon, Uyumsuzluk", situation: "Sosyal Kopukluk, Uyumsuz İlişkiler", number_rep: "Üç / Yalnızlık", archetype: "İzolasyon", energy: "Dengesiz Yang", person_rep: "Sosyal Bağlardan Kopuk Birey, Dedikoducu İş Arkadaşı", astrology: "Yengeç/Boğa Gölgesi" } },
    // ID 26: KUPA DÖRTLÜSÜ (Four of Cups)
    { name: "Kupa Dörtlüsü", upright: { positive: "İç Gözlem, Duygusal Yeniden Değerlendirme", negative: "Duygusal Tatminsizlik, Fırsatları Görmeme", role: "Düşünen, Durgun", emotion: "Bıkkınlık, Durgunluk, Memnuniyetsizlik", situation: "Duygusal Durgunluk, Fırsatları Kaçırma", number_rep: "Dört / Durağanlık", archetype: "İçe Dönüş", energy: "Alıcı (Yin)", person_rep: "Düşünceli, Pasif Birey, Fırsatları Görmeyen Akraba", astrology: "Yengeç burcu" }, reversed: { positive: "Yeni Duygusal Fırsatlar, Motivasyon", negative: "Durağanlığı Bırakma Zorunluluğu", role: "Fırsatları Gören", emotion: "Canlanma, Farkındalık, Motivasyon", situation: "Duygusal Açılım, Harekete Geçme", number_rep: "Dört / Farkındalık", archetype: "Duygusal Açılım", energy: "Dengesiz Yin", person_rep: "Farkındalığı Artmış Kişi, Harekete Geçen Arkadaş", astrology: "Yengeç burcunun Gölgesi" } },
    // ID 27: KUPA BEŞLİSİ (Five of Cups)
    { name: "Kupa Beşlisi", upright: { positive: "Duygusal Olgunlaşma, Kayıplardan Öğrenme", negative: "Geçmişe Takılma, Hayal Kırıklığı", role: "Yas Tutan, Ders Çıkaran", emotion: "Hüzün, Kayıp, Pişmanlık", situation: "Duygusal Kayıplar, Hüzün, Ders Çıkarma Süreci", number_rep: "Beş / Kayıp, Üzüntü", archetype: "Kayıplardan Ders Çıkarma", energy: "Alıcı (Yin)", person_rep: "Duygusal Olarak Hassas Birey, Yas Tutan Arkadaş", astrology: "Akrep burcu" }, reversed: { positive: "İyileşme, Fırsatları Fark Etme, İlerleme", negative: "Geçmişe Dönme Eğilimi", role: "Duygusal Olarak Toparlanan", emotion: "İyileşme, Kabul, Umut", situation: "Duygusal Toparlanma, Geçmişle Yüzleşme", number_rep: "Beş / İyileşme", archetype: "Geçmişten Kurtulma", energy: "Dengesiz Yin", person_rep: "Duygusal İyileşme Sürecindeki Ebeveyn, İlerleme Kaydeden Kişi", astrology: "Akrep burcunun Gölgesi" } },
    // ID 28: KUPA ALTILISI (Six of Cups)
    { name: "Kupa Altılısı", upright: { positive: "Masumiyet, Eski Arkadaşlıklar, Nostalji", negative: "Geçmişe Takılma, Duygusal Saplantı, İlerlemeyi Engelleme", role: "Hatırlayan, Paylaşan", emotion: "Nostalji, Huzur, Bağlılık", situation: "Eski Anılar, Geçmiş İlişkiler, Duygusal Bağlar", number_rep: "Altı / Nostalji", archetype: "Geçmişi Hatırlama", energy: "Alıcı-Verici (Yin-Yang)", person_rep: "Çocukluk Arkadaşı, Nostaljik Akraba, Geçmişten Gelen Sevgili/Dost", astrology: "Boğa burcu (Venüs Etkisi)" }, reversed: { positive: "Geçmişi Fark Edip Ders Alma", negative: "Geçmiş Bağımlılığı, Nostaljiye Aşırı Saplanma", role: "Geçmişe Saplanan", emotion: "Saplantı, Tıkanıklık, Kararsızlık", situation: "Duygusal Takılmalar, İlerleyememe", number_rep: "Altı / Bağımlılık", archetype: "Geçmişe Takılma", energy: "Dengesiz Yin-Yang", person_rep: "Geçmişe Bağlı Ebeveyn, İlerlemeyi Reddeden İş Arkadaşı", astrology: "Boğa burcunun Gölgesi" } },
    // ID 29: KUPA YEDİLİSİ (Seven of Cups)
    { name: "Kupa Yedilisi", upright: { positive: "İlham, Hayal Gücü, Yaratıcılık", negative: "Kararsızlık, Yanılsamalar, Gerçeklikten Kopma", role: "Hayal Eden, Seçenek Değerlendiren", emotion: "Hayal Gücü, Kafa Karışıklığı, Belirsizlik", situation: "Farklı Seçenekler, Karar Verme Süreçleri", number_rep: "Yedi / Hayaller, Seçenekler", archetype: "Vizyon", energy: "Alıcı (Yin)", person_rep: "Yaratıcı Arkadaş, Kararsız Birey, Hayalperest", astrology: "Akrep burcu (Plüton Etkisi)" }, reversed: { positive: "Yanılsamaları Fark Edip Gerçek Seçenekleri Değerlendirme", negative: "Kararsızlık, Yanlış Seçimler, Yanılsamalara Kapılma", role: "Kararsız, Hayal Kırıklığı Yaşayan", emotion: "Kararsızlık, Hayal Kırıklığı, Pişmanlık", situation: "Yanılsamalar, Karar Alma Zorluğu", number_rep: "Yedi / Belirsizlik", archetype: "Kafa Karışıklığı", energy: "Dengesiz Yin", person_rep: "Kararsız Partner, Hayal Kırıklığına Uğramış Akraba", astrology: "Akrep burcunun Gölgesi" } },
    // ID 30: KUPA SEKİZLİSİ (Eight of Cups)
    { name: "Kupa Sekizlisi", upright: { positive: "Duygusal Olgunlaşma, İçsel Farkındalık, Arayış", negative: "Kaçış, Sorumluluklardan Kaçma, Boşluk Hissi", role: "Ayrılan, Arayışta Olan", emotion: "Arayış, Kopuş, Boşluk Hissi", situation: "Duygusal Kopuş, Arayış Yolculuğu", number_rep: "Sekiz / Ayrılma, Arayış", archetype: "İçsel Farkındalık", energy: "Alıcı (Yin)", person_rep: "Münzevi, Duygusal Olarak Olgunlaşan Birey, İlişkiden Ayrılan Partner", astrology: "Balık burcu (Neptün Etkisi)" }, reversed: { positive: "Yeni Yollar Keşfetme Fırsatı", negative: "Duygusal Tıkanıklık, Eski Bağlara Bağlılık", role: "Ayrılamayan, Bağlı Kalan", emotion: "Tıkanıklık, Bağlılık, Durağanlık", situation: "Kopuşu Reddetme, Duygusal Durgunluk", number_rep: "Sekiz / Tıkanıklık", archetype: "Duygusal Blok", energy: "Dengesiz Yin", person_rep: "Bağlı Kalan Ebeveyn, Arayışını Engelleyen İş Arkadaşı", astrology: "Balık burcunun Gölgesi" } },
    // ID 31: KUPA DOKUZLUSU (Nine of Cups)
    { name: "Kupa Dokuzlusu", upright: { positive: "Duygusal ve Maddi Tatmin, Mutluluk, Başarı", negative: "Aşırı Hazcılık, Memnuniyetsizlik", role: "Tatmin Olmuş, Mutlu Yaşayan", emotion: "Doyum, Mutluluk, Kendine Güven", situation: "Başarı, Keyifli Deneyimler, Duygusal Doyum", number_rep: "Dokuz / Tatmin, Doyum", archetype: "Memnuniyet", energy: "Verici (Yang)", person_rep: "Tatmin Olmuş Patron, Mutlu Ebeveyn, Keyif Ehli Arkadaş", astrology: "Balık / Venüs (Duygusal Haz)" }, reversed: { positive: "Gerçek Doyumu Bulma Fırsatı", negative: "Hayal Kırıklığı, Tatminsizlik, Aşırı Beklenti", role: "Tatmin Olamayan", emotion: "Tatminsizlik, Hayal Kırıklığı, Boşluk", situation: "Duygusal Eksiklik, Başarıyı Fark Edememe", number_rep: "Dokuz / Tatminsizlik", archetype: "Doyumsuzluk", energy: "Dengesiz Yang", person_rep: "Duygusal Boşluk Taşıyan Partner, Aşırı Beklentili Kişi", astrology: "Balık / Venüs Gölgesi" } },
    // ID 32: KUPA ONLUSU (Ten of Cups)
    { name: "Kupa Onlusu", upright: { positive: "Aile Mutluluğu, Duygusal Bütünlük, Uyum ve Huzur", negative: "İdealizasyon, Uyum Eksikliği", role: "Mutlu Aile Bireyi, Duygusal Lider", emotion: "Huzur, Aile Sevgisi, Bütünlük", situation: "Aile Mutluluğu, İlişkilerde Tatmin", number_rep: "On / Tamamlanma", archetype: "Duygusal Bütünlük", energy: "Alıcı-Verici (Yin-Yang)", person_rep: "Mutlu Aile Üyesi, Huzurlu Ebeveyn, Uyumlu Partner", astrology: "Yay / Balık Etkisi" }, reversed: { positive: "Eksiklikleri Fark Edip Uyum Sağlama", negative: "Ailede Çatışma, Duygusal Tatminsizlik", role: "Tatminsiz, Uyumsuz", emotion: "Uyumsuzluk, Ailevi Hüsran, Huzursuzluk", situation: "Duygusal Boşluk, Aile Uyumsuzluğu", number_rep: "On / Eksiklik", archetype: "Uyumsuzluk", energy: "Dengesiz Yin-Yang", person_rep: "Duygusal Eksiklik Yaşayan Akraba, Uyumsuz Partner", astrology: "Yay / Balık Gölgesi" } },
    // ID 33: KUPA UŞAĞI (Page of Cups)
    { name: "Kupa Uşağı", upright: { positive: "Yeni Duygusal Haber, Yaratıcı İlham", negative: "Duygusal Olgunlaşmama, Yüzeysellik", role: "Haberci", emotion: "Merak, Duygusallık, Heyecan", situation: "Yeni Duygusal Başlangıç, Yaratıcı Fırsat", number_rep: "Uşak / Yeni Haber", archetype: "Duygu", energy: "Pasif", person_rep: "Küçük Kız/Oğlan Kardeş, Duygusal Gelişim Gösteren Genç, Yaratıcı Arkadaş", astrology: "Su Elementi" }, reversed: { positive: "İçsel Tıkanıklığı Fark Etme", negative: "Kötü Haber, Hayal Kırıklığı, Kararsızlık", role: "Olgunlaşmamış", emotion: "Hayal Kırıklığı, Kararsızlık, Olgunlaşmamışlık", situation: "Duygusal Blokaj, Yüzeysellik", number_rep: "Uşak / Tıkanıklık", archetype: "Tıkanıklık", energy: "Blokaj", person_rep: "Kararsız Genç, Olgunlaşmamış Akraba", astrology: "Su Elementinin Gölgesi" } },
    // ID 34: KUPA ŞÖVALYESİ (Knight of Cups)
    { name: "Kupa Şövalyesi", upright: { positive: "Romantizm, Duygusal Girişim, İlham", negative: "Duygusal Kararsızlık, Yüzeysellik", role: "Romantik, Teklif Eden", emotion: "Aşk, Coşku, Romantizm", situation: "Romantik Teklif, Duygusal Yolculuk", number_rep: "Şövalye / Duygusal Hareket", archetype: "Romantik Girişim", energy: "Verici (Yang)", person_rep: "Romantik Partner, Teklif Eden Erkek Arkadaş, İlham Veren İş Arkadaşı", astrology: "Akrep / Balık Etkisi" }, reversed: { positive: "Farkındalık Kazanma ve Fırsatları Değerlendirme", negative: "Hareketsizlik, Duygusal Blokaj, Fırsat Kaçırma", role: "Hareketsiz, Romantik Fırsatları Kaçıran", emotion: "Duygusal Tıkanıklık, Hayal Kırıklığı, Hareketsizlik", situation: "Duygusal Durgunluk", number_rep: "Şövalye / Durağanlık", archetype: "Fırsat Kaçırma", energy: "Dengesiz Yang", person_rep: "Hareketsiz veya Fırsatları Değerlendiremeyen Partner", astrology: "Akrep / Balık Gölgesi" } },
    // ID 35: KUPA KRALİÇESİ (Queen of Cups)
    { name: "Kupa Kraliçesi", upright: { positive: "Duygusal Olgunluk, Sezgi, Empati ve Şefkat", negative: "Aşırı Duygusallık, Bağımlılık, Savunmasızlık", role: "Şefkatli, Empatik Lider", emotion: "Empati, Şefkat, Sezgisellik", situation: "Empatik İlişkiler, Sezgisel Farkındalık", number_rep: "Kraliçe / Sezgi, Şefkat", archetype: "Duygusal Denge", energy: "Alıcı (Yin)", person_rep: "Anne, Kız Kardeş, Sezgisi Güçlü Kadın, Empatik Yönetici", astrology: "Yengeç burcu" }, reversed: { positive: "Dengesizlik Fark Edilip Olgunluk Kazanma", negative: "Duygusal Blokaj, Aşırı Savunmasızlık, Sezgi Kaybı", role: "Duygusal Olarak Dengesiz", emotion: "Dengesizlik, Aşırı Duygusallık, Savunmasızlık", situation: "Duygusal Dengesizlik, Çatışmalar", number_rep: "Kraliçe / Dengesizlik", archetype: "Sezgi Kaybı", energy: "Dengesiz Yin", person_rep: "Duygusal Olarak Dengesiz Ebeveyn, Bağımlı Partner", astrology: "Yengeç burcunun Gölgesi" } },
    // ID 36: KUPA KRALI (King of Cups)
    { name: "Kupa Kralı", upright: { positive: "Duygusal Liderlik, Bilgelik, Destek", negative: "Duygusal Dengesizlik, Sertlik", role: "Olgun Lider", emotion: "Bilgelik, Destek, Sakinlik", situation: "Empatik Rehberlik", number_rep: "Kral / Liderlik", archetype: "Denge", energy: "Yin-Yang", person_rep: "Baba, Olgun Lider, Empatik Patron, Akıl Hocası", astrology: "Yengeç / Balık Etkisi" }, reversed: { positive: "Dengesizliği Fark Etme", negative: "Duygusal Blokaj, Soğukluk, Kontrolcülük", role: "Dengesiz, Soğuk", emotion: "Soğukluk, Kontrolcülük, Tıkanıklık", situation: "Duygusal Tıkanıklık", number_rep: "Kral / Blokaj", archetype: "Kontrol", energy: "Blokaj", person_rep: "Kontrolcü Baba, Soğuk Patron, Duygusal Bağ Kuramayan Kişi", astrology: "Yengeç / Balık Gölgesi" } },
    // ID 37-50: KILIÇLAR SİLSİLESİ
    { name: "Kılıç Ası", upright: { positive: "Zihinsel Açıklık, Yeni Fikirler", negative: "Kafa Karışıklığı, Sert Sözler", role: "Analitik Lider", emotion: "Netlik, Güç, Odaklanma", situation: "Zihinsel Netlik, Çözüm Arayışı", number_rep: "As", archetype: "Mantık", energy: "Verici (Yang)", person_rep: "Mantıklı Öğretmen, Zihinsel Güçlü Arkadaş, Fikir Lideri", astrology: "Terazi / Kova" }, reversed: { positive: "Yanlış Düşünceleri Fark Etme", negative: "Kararsızlık, Mantık Eksikliği, Yanlış Kararlar", role: "Kararsız, Fikirleri Dağınık", emotion: "Karmaşa, Kararsızlık, Şüphe", situation: "Zihinsel Tıkanıklık, Çözüm Bulamama", number_rep: "As", archetype: "Karmaşa", energy: "Dengesiz Yang", person_rep: "Kafa Karışıklığı Yaşayan İş Arkadaşı, Dikkatsiz Birey", astrology: "Terazi / Kova Gölgesi" } },
    { name: "Kılıç İkilisi", upright: { positive: "Denge Sağlama, Mantıklı Kararlar", negative: "Kararsızlık, Erteleme, İçsel Çatışma", role: "Karar Vermeye Çalışan", emotion: "Denge, Huzur, İçsel Çatışma", situation: "Seçimler, İçsel Denge Arayışı", number_rep: "İki", archetype: "Denge Arayışı", energy: "Alıcı-Verici", person_rep: "Mantıklı Karar Veren Arkadaş, Kararsız Danışman", astrology: "Terazi burcu" }, reversed: { positive: "Karar Verme Becerisi Kazanma", negative: "Tıkanıklık, Erteleme, İçsel Çatışmalar", role: "Kararsız, Seçim Yapamayan", emotion: "Tıkanıklık, Erteleme, Çaresizlik", situation: "Seçim Tıkanıklığı, İçsel Çatışma", number_rep: "İki", archetype: "Blokaj", energy: "Dengesiz Yin-Yang", person_rep: "Seçim Yapamayan Patron/Akraba", astrology: "Terazi burcunun Gölgesi" } },
    { name: "Kılıç Üçlüsü", upright: { positive: "Duygusal Farkındalık, İyileşme Fırsatı", negative: "Kalp Kırıklığı, Üzüntü, İhanet", role: "Kalp Kırıklığı Yaşayan", emotion: "Acı, Hüzün, İhanet", situation: "Ayrılık, İhanet, Duygusal Sarsıntı", number_rep: "Üç", archetype: "Acı", energy: "Alıcı (Yin)", person_rep: "Duygusal Olarak Kırılmış Partner, İhanete Uğrayan Arkadaş", astrology: "İkizler / Kova" }, reversed: { positive: "İyileşme, Affetme, Ders Alma", negative: "Geçmişi Tam Bırakmama, Duygusal Blokaj", role: "İyileşen, Affeden", emotion: "İyileşme, Affetme, Huzur", situation: "İyileşme Süreci, Affetme", number_rep: "Üç", archetype: "Toparlanma", energy: "Dengesiz Yin", person_rep: "Affeden, Toparlanan Birey", astrology: "İkizler / Kova Gölgesi" } },
    { name: "Kılıç Dörtlüsü", upright: { positive: "Yenilenme, İç Gözlem, Toparlanma", negative: "Hareketsizlik, Durağanlık, Sorumluluklardan Kaçış", role: "Düşünen, Dinlenen", emotion: "Huzur, Dinlenme, İç Gözlem", situation: "Dinlenme, Geri Çekilme, İyileşme", number_rep: "Dört", archetype: "Yenilenme", energy: "Alıcı (Yin)", person_rep: "Dinlenmeye İhtiyaç Duyan İş Arkadaşı, Geri Çekilen Dost", astrology: "Terazi burcu" }, reversed: { positive: "Durgunluğu Fark Etme, Mola Alma", negative: "Acele, Tıkanıklık, Zihinsel Yorgunluk", role: "Dinlenmeyen, Zorunlu Harekete Geçen", emotion: "Acele, Yorgunluk, Tıkanıklık", situation: "Zorunlu Hareket, Dinlenmeme", number_rep: "Dört", archetype: "Acele", energy: "Dengesiz Yin", person_rep: "Aceleci, Yorgun Birey", astrology: "Terazi burcunun Gölgesi" } },
    { name: "Kılıç Beşlisi", upright: { positive: "Kayıplardan Ders Çıkarma", negative: "Çatışma, Yenilgi, Kazanma Pahasına Kaybetme", role: "Kayıp Yaşayan", emotion: "Yenilgi, Utanç, Çatışma", situation: "Çatışmalar, Ağır Kayıplar", number_rep: "Beş", archetype: "Yenilgi", energy: "Verici (Yang)", person_rep: "Çatışmacı Düşman, Kayıp Yaşayan Rakip", astrology: "Kova burcu" }, reversed: { positive: "Uzlaşma, Affetme Fırsatı", negative: "Geçmişe Takılma, Telafi Etmekten Kaçınma", role: "Uzlaşan", emotion: "Uzlaşma, Telafi, Pişmanlık", situation: "Uzlaşma Süreci, Affetme", number_rep: "Beş", archetype: "Telafi", energy: "Dengesiz Yang", person_rep: "Telafi Etmekten Kaçınan İş Arkadaşı, Uzlaşan Akraba", astrology: "Kova burcunun Gölgesi" } },
    { name: "Kılıç Altılısı", upright: { positive: "İlerleme, Daha İyi Bir Gelecek", negative: "Durağanlık, Yolculuktan Kaçınma", role: "Yolcu, Rehber", emotion: "Umut, İlerleme, Geçiş", situation: "Harekete Geçme, İlerleme", number_rep: "Altı", archetype: "Geçiş", energy: "Alıcı-Verici", person_rep: "İlerleyen Birey, Değişimi Kabul Eden Arkadaş", astrology: "Kova burcu" }, reversed: { positive: "Zorunlu Değişimi Fark Etme", negative: "Durağanlık, Engellenme, Kaçış", role: "Dirençli", emotion: "Direnç, Tıkanıklık, Kaçış", situation: "Zorunlu Değişim, Engeller", number_rep: "Altı", archetype: "Direnç", energy: "Blokaj", person_rep: "Durağanlık Yaşayan Partner, Değişime Direnen Patron", astrology: "Kova burcunun Gölgesi" } },
    { name: "Kılıç Yedilisi", upright: { positive: "Yalnız Hareket Etme, Zeka Kullanımı", negative: "Hırsızlık, Hile, Aldatma, Gizlilik", role: "Hilekâr, Gizemli", emotion: "Kurnazlık, Gizlilik, Savunmacı", situation: "Gizli Planlar, Kaçınma, Yalnız Hareket", number_rep: "Yedi", archetype: "Hile", energy: "Verici (Yang)", person_rep: "Hilebaz, Gizli İşler Yapan Düşman, Kurnaz İş Arkadaşı", astrology: "Kova burcu" }, reversed: { positive: "Vicdan Azabını Giderme, İtiraf", negative: "Sahte Pişmanlık, Güven Kaybı", role: "Pişman", emotion: "Pişmanlık, Vicdan Azabı, Güven Kaybı", situation: "İtiraf, Dürüstlük", number_rep: "Yedi", archetype: "Vicdan", energy: "Dengesiz Yang", person_rep: "Pişmanlık Duyan Akraba, Güven Kaybı Yaşayan Kişi", astrology: "Kova burcunun Gölgesi" } },
    { name: "Kılıç Sekizlisi", upright: { positive: "Kısıtlamaları Fark Etme", negative: "Kurban Bilinci, Kendini Sınırlama, Hapsolma", role: "Kurban", emotion: "Kısıtlanma, Çaresizlik, Korku", situation: "Kısıtlanma, Hapsolma", number_rep: "Sekiz", archetype: "Sınırlama", energy: "Alıcı (Yin)", person_rep: "Kısıtlanmış Genç, Kararsız Ebeveyn, Kurban Bilincindeki Kişi", astrology: "İkizler burcu" }, reversed: { positive: "Serbest Kalma, Yeni Bakış Açısı", negative: "Engelleri Kaldırmama, Kararsızlık", role: "Özgürleşen", emotion: "Kurtuluş, Umut, Özgürleşme", situation: "Engelleri Kaldırma", number_rep: "Sekiz", archetype: "Kurtuluş", energy: "Dengesiz Yin", person_rep: "Serbest Kalmayı Reddeden Akraba, Özgürleşen Birey", astrology: "İkizler burcunun Gölgesi" } },
    { name: "Kılıç Dokuzlusu", upright: { positive: "Korkunun Farkındalığı", negative: "Kaygı, Kabuslar, Aşırı Endişe", role: "Endişeli", emotion: "Kaygı, Korku, Panik", situation: "Zihinsel Acı, Kaygı Krizi", number_rep: "Dokuz", archetype: "Kabus", energy: "Verici (Yang)", person_rep: "Aşırı Endişeli Ebeveyn/Arkadaş, Uykusuzluk Çeken Birey", astrology: "İkizler burcu" }, reversed: { positive: "Umut, Yardım Arayışı", negative: "Suçluluk, Korkuyu Bırakmama", role: "Yardım Arayan", emotion: "Umut, Rahatlama, İyileşme", situation: "İyileşme Başlangıcı", number_rep: "Dokuz", archetype: "Umut", energy: "Dengesiz Yang", person_rep: "Suçluluk Duyan Birey, Yardım Arayan Akraba", astrology: "İkizler burcunun Gölgesi" } },
    { name: "Kılıç Onlusu", upright: { positive: "Sonlanmayı Kabullenme", negative: "Yıkım, Tükenme, Ağır Kayıp", role: "Yıkılan", emotion: "Acı, Tükenmişlik, Sonlanma", situation: "Sonlanma, Ağır Kayıp", number_rep: "On", archetype: "Yıkım", energy: "Alıcı (Yin)", person_rep: "Tükenmiş İş Arkadaşı, Ağır Kayıp Yaşayan Kişi", astrology: "İkizler burcu" }, reversed: { positive: "İyileşme Başlangıcı", negative: "Kaçınılmaz Sonu Erteleme", role: "İyileşen", emotion: "İyileşme, Umut, Rahatlama", situation: "Sonun Ertelenmesi", number_rep: "On", archetype: "İyileşme", energy: "Blokaj", person_rep: "Ertelenmiş Karar Veren Patron, İyileşen Birey", astrology: "İkizler burcunun Gölgesi" } },
    { name: "Kılıç Uşağı", upright: { positive: "Yeni Fikirler, Merak", negative: "Aceleci, Düşüncesiz Konuşma", role: "Haberci, Öğrenci", emotion: "Merak, Zeka, Heyecan", situation: "İletişim, Yeni Zihinsel Başlangıç", number_rep: "Uşak", archetype: "Merak", energy: "Pasif", person_rep: "Yeni Fikirler Edinme Peşindeki Genç, Meraklı Kız/Oğlan Kardeş", astrology: "Hava Elementi" }, reversed: { positive: "Aceleciliği Fark Etme", negative: "Dikkatsizlik, Dedikodu, Aldatma", role: "Aceleci, Tembel", emotion: "Dikkatsizlik, Dedikodu, Yalancılık", situation: "Zihinsel Dağınıklık", number_rep: "Uşak", archetype: "Aldatma", energy: "Blokaj", person_rep: "Dikkatsiz, Yalancı Akraba, Dedikoducu İş Arkadaşı", astrology: "Hava Elementi Gölgesi" } },
    { name: "Kılıç Şövalyesi", upright: { positive: "Hırslı Eylem, Kararlılık", negative: "Öfke, Düşüncesizlik, Acele", role: "Hırslı, Hızlı Hareket Eden", emotion: "Hırs, Cesaret, Acelecilik", situation: "Hızlı Eylem, Mücadele", number_rep: "Şövalye", archetype: "Saldırgan", energy: "Aktif", person_rep: "Kararlı Çalışan, Hızlı Karar Veren Patron, Hırslı Rakip", astrology: "Hava Elementi" }, reversed: { positive: "Düşünerek Harekete Geçme", negative: "Kontrolsüz Eylem, Acelecilik", role: "Kontrolsüz, Düşüncesiz", emotion: "Kontrolsüzlük, Öfke, Pişmanlık", situation: "Aceleci Girişimler", number_rep: "Şövalye", archetype: "Kontrolsüzlük", energy: "Dengesiz Yang", person_rep: "Öfkeli, Kontrolsüz Erkek Kardeş/Partner", astrology: "Hava Elementi Gölgesi" } },
    { name: "Kılıç Kraliçesi", upright: { positive: "Zeka, Keskin Zihin, Bağımsızlık", negative: "Soğukluk, Katılık, Duygusal Mesafe", role: "Bağımsız, Zeki Kadın", emotion: "Bağımsızlık, Zeka, Soğukkanlılık", situation: "Tarafsız Düşünce", number_rep: "Kraliçe", archetype: "Mantık", energy: "Pasif", person_rep: "Zeki Avukat, Bağımsız Patron, Mantıklı Kız Kardeş", astrology: "Hava Elementi" }, reversed: { positive: "Duygusal Açıklık", negative: "Kötü Niyet, Zalimlik, Aşırı Eleştiri", role: "Zalim, Soğuk", emotion: "Soğukluk, Zalimlik, Aşırı Eleştirel", situation: "Duygusal Mesafe", number_rep: "Kraliçe", archetype: "Zalimlik", energy: "Blokaj", person_rep: "Soğuk, Katı Patron, Aşırı Eleştirel Ebeveyn", astrology: "Hava Elementi Gölgesi" } },
    { name: "Kılıç Kralı", upright: { positive: "Zihinsel Ustalık, Otorite, Adalet", negative: "Aşırı Eleştirel, Zorbaca", role: "Otoriter, Entelektüel", emotion: "Otorite, Adalet, Zihinsel Netlik", situation: "Tarafsız Karar", number_rep: "Kral", archetype: "Adalet", energy: "Aktif", person_rep: "Mantıklı Yönetici, Otoriter Baba, Hukukçu", astrology: "Hava Elementi" }, reversed: { positive: "Esneklik Kazanma", negative: "Zalim, Mantıksız Karar, Güç Kötüye Kullanımı", role: "Zorbaca, Mantıksız", emotion: "Zorbalık, Mantıksızlık, Güçsüzlük", situation: "Haksız Kararlar", number_rep: "Kral", archetype: "Tiran", energy: "Dengesiz Yang", person_rep: "Zalim Patron, Mantıksız Baba Figürü", astrology: "Hava Elementi Gölgesi" } },
    // ID 51-64: DEĞNEKLER SİLSİLESİ
    { name: "Değnek Ası", upright: { positive: "İlham, Yeni Başlangıç, Yaratıcılık", negative: "Gecikme, Enerji Eksikliği", role: "Başlatıcı", emotion: "İlham, Coşku, Yeni Umut", situation: "Yeni Fırsatlar, Enerji Akışı", number_rep: "As", archetype: "Yaratıcılık", energy: "Aktif", person_rep: "Enerjik Girişimci, İlham Dolu Arkadaş, Yeni İş Arkadaşı", astrology: "Ateş Elementi" }, reversed: { positive: "Engeli Aşma, Harekete Geçme", negative: "Hayal Kırıklığı, İlham Kaybı, Gecikme", role: "Tıkanmış", emotion: "Hayal Kırıklığı, Gecikme, Blokaj", situation: "Blokaj, Durağanlık", number_rep: "As", archetype: "Blokaj", energy: "Blokaj", person_rep: "İlham Kaybı Yaşayan, Kararsız Akraba", astrology: "Ateş Elementi Gölgesi" } },
    { name: "Değnek İkilisi", upright: { positive: "Planlama, İlerleme, Karar Verme", negative: "Korku, Kararsızlık", role: "Planlayıcı, Kaşif", emotion: "Kararlılık, Vizyon, Güven", situation: "Geleceğe Bakış, İşbirliği", number_rep: "İki", archetype: "İlerleme", energy: "Aktif", person_rep: "Kararlı Ortak, Planlama Yapan Yönetici, Kaşif", astrology: "Koç burcu" }, reversed: { positive: "Harekete Geçme, Risk Alma", negative: "Tanıdık Olana Bağlı Kalma, Gecikme", role: "Kararsız", emotion: "Korku, Kararsızlık, Gecikme", situation: "Kararsızlık, Korku", number_rep: "İki", archetype: "Korku", energy: "Blokaj", person_rep: "Kararsız Partner, Risk Almaktan Kaçınan İş Arkadaşı", astrology: "Koç burcunun Gölgesi" } },
    { name: "Değnek Üçlüsü", upright: { positive: "Genişleme, İşbirliği, Büyüme", negative: "Engeller, Hayal Kırıklığı", role: "Vizyoner, İşbirlikçi", emotion: "Umut, Genişleme, Vizyon", situation: "İşbirliği, İlerleme", number_rep: "Üç", archetype: "Genişleme", energy: "Aktif", person_rep: "Büyümeye Odaklı Patron, Vizyoner Arkadaş, İşbirlikçi", astrology: "Koç burcu" }, reversed: { positive: "Gecikmeleri Aşma", negative: "Yavaş Büyüme, Hayal Kırıklığı", role: "Engelleyici", emotion: "Hayal Kırıklığı, Engel, Gecikme", situation: "Engeller, Hayal Kırıklığı", number_rep: "Üç", archetype: "Engel", energy: "Blokaj", person_rep: "Hayal Kırıklığı Yaşayan Ortak, Engelleyici Akraba", astrology: "Koç burcunun Gölgesi" } },
    { name: "Değnek Dörtlüsü", upright: { positive: "Kutlama, Uyum, İstikrar", negative: "İstikrarsızlık, Uyumsuzluk", role: "Kutlayan", emotion: "Huzur, İstikrar, Mutluluk", situation: "Yuva, Başarı", number_rep: "Dört", archetype: "İstikrar", energy: "Pasif", person_rep: "Mutlu Aile Üyesi, Huzurlu Partner, Kutlamayı Seven Arkadaş", astrology: "Koç burcu" }, reversed: { positive: "Uyumsuzluğu Çözme", negative: "Bitmemiş Kutlama, İstikrarsızlık", role: "Uyumsuz", emotion: "Uyumsuzluk, Huzursuzluk, İstikrarsızlık", situation: "Uyumsuzluk", number_rep: "Dört", archetype: "Uyumsuzluk", energy: "Blokaj", person_rep: "İstikrarsız Ebeveyn, Uyumsuz Partner", astrology: "Koç burcunun Gölgesi" } },
    { name: "Değnek Beşlisi", upright: { positive: "Rekabet, Enerjik Tartışma", negative: "Çatışma, Anlaşmazlık", role: "Tartışmacı", emotion: "Rekabet, Enerji, Gerilim", situation: "Rekabet, Çatışma", number_rep: "Beş", archetype: "Çatışma", energy: "Verici (Yang)", person_rep: "Rekabetçi İş Arkadaşı, Tartışmacı Arkadaş, Rakip", astrology: "Aslan burcu" }, reversed: { positive: "Çatışmayı Çözme, Uzlaşma", negative: "Anlaşmazlık", role: "Uzlaşan", emotion: "Uzlaşma, Huzur, Anlaşma", situation: "Anlaşma", number_rep: "Beş", archetype: "Uzlaşma", energy: "Alıcı (Yin)", person_rep: "Uzlaşmacı Partner, Anlaşmazlık Çıkaran Düşman", astrology: "Aslan burcunun Gölgesi" } },
    { name: "Değnek Altılısı", upright: { positive: "Zafer, Tanınma, Başarı", negative: "Başarısızlık, Kibirlilik", role: "Zafer Kazanıcı", emotion: "Zafer, Gurur, Özgüven", situation: "Halk Önünde Tanınma", number_rep: "Altı", archetype: "Tanınma", energy: "Aktif", person_rep: "Başarılı Yönetici, Tanınmış Lider, Zafer Kazanmış Rakip", astrology: "Aslan burcu" }, reversed: { positive: "Haksız Tanınmayı Düzeltme", negative: "Haksız Tanınma, Başarısızlık", role: "Diktatör", emotion: "Kibir, Başarısızlık, Utanç", situation: "Başarısızlık", number_rep: "Altı", archetype: "Kibir", energy: "Blokaj", person_rep: "Kibirli Patron, Başarısız Hükümet Yetkilisi", astrology: "Aslan burcunun Gölgesi" } },
    { name: "Değnek Yedilisi", upright: { positive: "Azim, Savunma, Avantaj", negative: "Pes Etme, Bunalmış Hissetme", role: "Savunan", emotion: "Azim, Cesaret, Savunmacı", situation: "Meydan Okuma", number_rep: "Yedi", archetype: "Savunma", energy: "Aktif", person_rep: "Azimli Çalışan, Cesur Arkadaş, Kendini Savunan Birey", astrology: "Aslan burcu" }, reversed: { positive: "Güvenliği Yeniden Kazanma", negative: "Korkaklık, Güvensizlik", role: "Güvensiz", emotion: "Korkaklık, Güvensizlik, Bunalmışlık", situation: "Pes Etme", number_rep: "Yedi", archetype: "Korkaklık", energy: "Blokaj", person_rep: "Bunalmış, Güvensiz İş Arkadaşı", astrology: "Aslan burcunun Gölgesi" } },
    { name: "Değnek Sekizlisi", upright: { positive: "Hız, Haber, Hızlı Eylem", negative: "Gecikme, Engeller", role: "Haberci", emotion: "Heyecan, Hız, Enerji", situation: "Hızlı Hareket", number_rep: "Sekiz", archetype: "Hız", energy: "Aktif", person_rep: "Hızlı Karar Veren, Enerjik Arkadaş, Haber Getiren Kişi", astrology: "Yay burcu" }, reversed: { positive: "Engelleri Aşma", negative: "Gecikme, Kaçırılmış Fırsatlar", role: "Geciken", emotion: "Gecikme, Hayal Kırıklığı, Engel", situation: "Engel", number_rep: "Sekiz", archetype: "Gecikme", energy: "Blokaj", person_rep: "Engellenmiş Çalışan, Geciken Akraba", astrology: "Yay burcunun Gölgesi" } },
    { name: "Değnek Dokuzlusu", upright: { positive: "Direniş, Cesaret, Kararlılık", negative: "Paranoya, Şüphe, Güvensizlik", role: "Kararlı", emotion: "Kararlılık, İhtiyat, Cesaret", situation: "Direniş", number_rep: "Dokuz", archetype: "Direniş", energy: "Aktif", person_rep: "Kararlı Lider, Cesur Arkadaş, Kendini Savunan Birey", astrology: "Yay burcu" }, reversed: { positive: "İhtiyat, Güven", negative: "Paranoya, Güvensizlik", role: "Şüpheci", emotion: "Paranoya, Şüphe, Güvensizlik", situation: "Paranoya", number_rep: "Dokuz", archetype: "Paranoya", energy: "Blokaj", person_rep: "Güvensiz Partner, Paranoyak Düşman", astrology: "Yay burcunun Gölgesi" } },
    { name: "Değnek Onlusu", upright: { positive: "Sorumluluğu Alma", negative: "Yük, Ağır İş, Bitkinlik", role: "Sorumlu", emotion: "Yorgunluk, Sorumluluk, Baskı", situation: "Yük", number_rep: "On", archetype: "Yük", energy: "Pasif", person_rep: "Sorumluluk Alan Ebeveyn/Patron, Yorgun Çalışan", astrology: "Yay burcu" }, reversed: { positive: "Yükü Bırakma, Yeni Çözümler", negative: "Başarısızlık, Yükü Reddetme", role: "Yorgun", emotion: "Rahatlama, Bitkinlik, Başarısızlık", situation: "Yükü Bırakma", number_rep: "On", archetype: "Rahatlama", energy: "Blokaj", person_rep: "Bitkin Düşmüş Arkadaş, Yükü Reddeden Kişi", astrology: "Yay burcunun Gölgesi" } },
    { name: "Değnek Uşağı", upright: { positive: "Coşku, Yeni Fikirler, Haber", negative: "Kararsızlık, Erteleme", role: "Haberci", emotion: "Coşku, Heyecan, İlham", situation: "Yeni Fikirler, Heyecan", number_rep: "Uşak", archetype: "Coşku", energy: "Aktif", person_rep: "Hevesli Genç, Haber Getiren Akraba, Yeni Çalışan", astrology: "Ateş Elementi" }, reversed: { positive: "Gecikmeleri Fark Etme", negative: "Kötü Haber, Hayal Kırıklığı", role: "Aceleci", emotion: "Kararsızlık, Gecikme, Hayal Kırıklığı", situation: "Kararsızlık", number_rep: "Uşak", archetype: "Gecikme", energy: "Blokaj", person_rep: "Kararsız, Aceleci Birey", astrology: "Ateş Elementi Gölgesi" } },
    { name: "Değnek Şövalyesi", upright: { positive: "Macera, Cesur Eylem", negative: "Öfke, Düşüncesizlik, Acele", role: "Maceracı", emotion: "Cesaret, Macera, Hırs", situation: "Hızlı Eylem, Yolculuk", number_rep: "Şövalye", archetype: "Acele", energy: "Aktif", person_rep: "Cesur Maceracı, Hırslı Partner, Hızlı Hareket Eden İş Arkadaşı", astrology: "Ateş Elementi" }, reversed: { positive: "Düşünerek Harekete Geçme", negative: "Kontrolsüz Eylem, Gecikme", role: "Kontrolsüz", emotion: "Kontrolsüzlük, Gecikme, Öfke", situation: "Gecikme", number_rep: "Şövalye", archetype: "Gecikme", energy: "Blokaj", person_rep: "Geciken, Kontrolsüz Akraba/Partner", astrology: "Ateş Elementi Gölgesi" } },
    { name: "Değnek Kraliçesi", upright: { positive: "Canlılık, Güven, Bağımsızlık", negative: "Bencillik, Aşırı Talepkâr", role: "Bağımsız Kraliçe", emotion: "Güven, Canlılık, Bağımsızlık", situation: "Özgürlük", number_rep: "Kraliçe", archetype: "Güven", energy: "Pasif", person_rep: "Canlı, Bağımsız Kadın, Kendine Güvenen Patron", astrology: "Ateş Elementi" }, reversed: { positive: "Kıskançlığı Fark Etme", negative: "Kıskançlık, Güven Eksikliği", role: "Kıskanç", emotion: "Kıskançlık, Bencillik, Güvensizlik", situation: "Bencillik", number_rep: "Kraliçe", archetype: "Bencillik", energy: "Blokaj", person_rep: "Kıskanç Partner, Aşırı Talepkâr Ebeveyn", astrology: "Ateş Elementi Gölgesi" } },
    { name: "Değnek Kralı", upright: { positive: "Vizyon, Liderlik, Karizma", negative: "Despotluk, Acımasızlık", role: "Lider, Yönetici", emotion: "Vizyon, Karizma, Hırs", situation: "Hırs", number_rep: "Kral", archetype: "Vizyoner", energy: "Aktif", person_rep: "Karizmatik Patron, Vizyoner Baba Figürü, Başarılı Lider", astrology: "Ateş Elementi" }, reversed: { positive: "Gücü Paylaşma", negative: "Acımasızlık, Güçsüzlük", role: "Zorbaca", emotion: "Zorbalık, Acımasızlık, Güçsüzlük", situation: "Güç Kötüye Kullanımı", number_rep: "Kral", archetype: "Zorba", energy: "Blokaj", person_rep: "Zorbaca Davranan Amir, Acımasız Yönetici", astrology: "Ateş Elementi Gölgesi" } },
    // ID 65-78: TILSIMLAR SİLSİLESİ
    { name: "Tılsım Ası", upright: { positive: "Bolluk, Güvenlik, Yeni Finansal Başlangıç", negative: "Kaybedilen Fırsat, Kıtlık", role: "Başlatıcı", emotion: "Güvenlik, Bolluk, Umut", situation: "Yeni Finansal Fırsat", number_rep: "As", archetype: "Fırsat", energy: "Pasif", person_rep: "Maddi İstikrar Arayan Birey, Yeni İş Ortağı, Girişimci", astrology: "Toprak Elementi" }, reversed: { positive: "Mali Güvenlik", negative: "Savurganlık, Mali Kayıp", role: "Savurgan", emotion: "Kıtlık, Kayıp Korkusu, Savurganlık", situation: "Mali Kayıp", number_rep: "As", archetype: "Kıtlık", energy: "Blokaj", person_rep: "Parayı Kötü Kullanan Akraba, Savurgan Partner", astrology: "Toprak Elementi Gölgesi" } },
    { name: "Tılsım İkilisi", upright: { positive: "Denge, Uyum, Esneklik", negative: "Dengesizlik, Karmaşa, Kararsızlık", role: "Dengeleyici", emotion: "Esneklik, Uyum, Neşe", situation: "Öncelik Belirleme", number_rep: "İki", archetype: "Denge", energy: "Alıcı-Verici", person_rep: "Esnek Partner, Uyumlu İş Arkadaşı, Denge Arayan Birey", astrology: "Oğlak burcu" }, reversed: { positive: "Karmaşayı Çözme", negative: "Kararsızlık, Aşırı Meşguliyet", role: "Kararsız", emotion: "Karmaşa, Stres, Kararsızlık", situation: "Dengesizlik", number_rep: "İki", archetype: "Karmaşa", energy: "Dengesiz Yin-Yang", person_rep: "Kararsız Patron, Aşırı Meşgul Ebeveyn", astrology: "Oğlak burcunun Gölgesi" } },
    { name: "Tılsım Üçlüsü", upright: { positive: "Takım Çalışması, Ortaklık, Başarı", negative: "Uyumsuzluk, Beceriksizlik", role: "İşbirlikçi", emotion: "Başarı, Takım Ruhu, Beceri", situation: "Takım Başarısı", number_rep: "Üç", archetype: "Ortaklık", energy: "Aktif", person_rep: "Yetenekli İş Arkadaşı, İşbirlikçi Partner, Çırak/Usta", astrology: "Oğlak burcu" }, reversed: { positive: "Uyumsuzluğu Fark Etme", negative: "Rekabet, Yalnız Çalışma", role: "Rekabetçi", emotion: "Rekabet, Uyumsuzluk, Beceriksizlik", situation: "Uyumsuzluk", number_rep: "Üç", archetype: "Rekabet", energy: "Blokaj", person_rep: "Uyumsuz İş Arkadaşı, Beceriksiz Yönetici", astrology: "Oğlak burcunun Gölgesi" } },
    { name: "Tılsım Dörtlüsü", upright: { positive: "Güvenlik, İstikrar, Kontrol", negative: "Sahiplenme, Açgözlülük", role: "Kontrolcü", emotion: "Güvenlik, Kontrol, Endişe", situation: "Maddi Güvenlik", number_rep: "Dört", archetype: "İstikrar", energy: "Pasif", person_rep: "Maddi Güvenliğe Önem Veren Ebeveyn, Kontrolcü Patron", astrology: "Oğlak burcu" }, reversed: { positive: "Cömertlik, Kontrolü Bırakma", negative: "Açgözlülük, Kayıp Korkusu", role: "Açgözlü", emotion: "Açgözlülük, Kayıp Korkusu, Sahiplenme", situation: "Sahiplenme", number_rep: "Dört", archetype: "Açgözlülük", energy: "Blokaj", person_rep: "Aşırı Sahiplenici Akraba, Açgözlü Partner", astrology: "Oğlak burcunun Gölgesi" } },
    { name: "Tılsım Beşlisi", upright: { positive: "Zorlukların Farkındalığı", negative: "Yoksulluk, Kayıp, Dışlanma", role: "Dışlanmış", emotion: "Kaygı, Yoksulluk, Dışlanma", situation: "Zorluklar, Kayıp", number_rep: "Beş", archetype: "Kayıp", energy: "Pasif", person_rep: "Yardıma İhtiyaç Duyan Akraba/Arkadaş, Dışlanmış Kişi", astrology: "Boğa burcu" }, reversed: { positive: "İyileşme, Yardım Kabul Etme", negative: "Zorluklara Direnç", role: "İyileşen", emotion: "Umut, İyileşme, Kabul", situation: "Umut", number_rep: "Beş", archetype: "İyileşme", energy: "Blokaj", person_rep: "Zorluklara Direnen, Yardım Kabul Eden Birey", astrology: "Boğa burcunun Gölgesi" } },
    { name: "Tılsım Altılısı", upright: { positive: "Cömertlik, Zenginlik, Hayırseverlik", negative: "Borç, Adaletsizlik", role: "Cömert", emotion: "Cömertlik, Hayırseverlik, Adalet", situation: "Verme ve Alma", number_rep: "Altı", archetype: "Cömertlik", energy: "Verici (Yang)", person_rep: "Zengin Akraba/Patron, Cömert Arkadaş, Hayırsever", astrology: "Boğa burcu" }, reversed: { positive: "Adaleti Sağlama", negative: "Adaletsizlik, Bencil Olma", role: "Bencil", emotion: "Bencillik, Adaletsizlik, Borç", situation: "Adaletsizlik", number_rep: "Altı", archetype: "Adaletsizlik", energy: "Dengesiz Yang", person_rep: "Bencil Partner, Adaletsiz Yönetici", astrology: "Boğa burcunun Gölgesi" } },
    { name: "Tılsım Yedilisi", upright: { positive: "Sabır, Yatırım, Bekleme", negative: "Hayal Kırıklığı, Acele Etme", role: "Sabırlı", emotion: "Sabır, Beklenti, Endişe", situation: "Bekleme", number_rep: "Yedi", archetype: "Sabır", energy: "Pasif", person_rep: "Sabırlı Yatırımcı, Beklemeyi Kabul Eden Akraba", astrology: "Boğa burcu" }, reversed: { positive: "Eyleme Geçme", negative: "Kötü Yatırım, İşi Bırakma", role: "Aceleci", emotion: "Acele, Hayal Kırıklığı, Endişe", situation: "Acele", number_rep: "Yedi", archetype: "Acele", energy: "Blokaj", person_rep: "Endişeli Yatırımcı, Aceleci Çalışan", astrology: "Boğa burcunun Gölgesi" } },
    { name: "Tılsım Sekizlisi", upright: { positive: "Çalışkanlık, Beceri, Odaklanma", negative: "Mükemmeliyetçilik, Sıkıcılık", role: "Çırak", emotion: "Odaklanma, Çalışkanlık, Gurur", situation: "Çalışkanlık", number_rep: "Sekiz", archetype: "Beceri", energy: "Aktif", person_rep: "Çalışkan İş Arkadaşı, Yetenekli Zanaatkar, Kendini Geliştiren Birey", astrology: "Başak burcu" }, reversed: { positive: "Sıkıcılığı Aşma", negative: "Tembellik, Çaba Eksikliği, Vasatlık", role: "Tembel", emotion: "Tembellik, Çaba Eksikliği, Bıkkınlık", situation: "Çaba Eksikliği", number_rep: "Sekiz", archetype: "Tembellik", energy: "Blokaj", person_rep: "Tembel İş Arkadaşı, Vasat Yönetici", astrology: "Başak burcunun Gölgesi" } },
    { name: "Tılsım Dokuzlusu", upright: { positive: "Lüks, Bağımsızlık, Başarı", negative: "Güven Kaybı, Hırsızlık", role: "Bağımsız", emotion: "Lüks, Bağımsızlık, Kendine Güven", situation: "Lüks", number_rep: "Dokuz", archetype: "Lüks", energy: "Pasif", person_rep: "Başarılı İş Kadını, Bağımsız Akraba, Lüks Seven Kişi", astrology: "Başak burcu" }, reversed: { positive: "Güven Kazanma", negative: "Mali Başarısızlık, Tuzak", role: "Bağımlı", emotion: "Bağımlılık, Mali Kayıp, Güvensizlik", situation: "Mali Başarısızlık", number_rep: "Dokuz", archetype: "Bağımlılık", energy: "Blokaj", person_rep: "Mali Kayıp Yaşayan, Bağımlı Partner", astrology: "Başak burcunun Gölgesi" } },
    { name: "Tılsım Onlusu", upright: { positive: "Aile, Miraz, Güvenlik", negative: "Aile Sorunları, Mali Kayıp", role: "Aile", emotion: "Aile Güvenliği, Miras, Huzur", situation: "Kalıcı Başarı", number_rep: "On", archetype: "Aile", energy: "Pasif", person_rep: "Aile Büyüğü, Miras Bırakan Kişi, Güvenliğe Önem Veren Ebeveyn", astrology: "Başak burcu" }, reversed: { positive: "Güvenliği Kazanma", negative: "Uyumsuzluk, Tartışmalar", role: "Sorunlu", emotion: "Uyumsuzluk, Aile Sorunları, Mali Kayıp", situation: "Aile Sorunları", number_rep: "On", archetype: "Uyumsuzluk", energy: "Blokaj", person_rep: "Mali Kayıp Yaşayan Akraba, Uyumsuz Partner", astrology: "Başak burcunun Gölgesi" } },
    { name: "Tılsım Uşağı", upright: { positive: "Yeni Fırsatlar, İlham", negative: "Savurganlık, Tembellik", role: "Haberci", emotion: "Merak, Yeni Umut, Coşku", situation: "Maddi Haber", number_rep: "Uşak", archetype: "Fırsat", energy: "Pasif", person_rep: "Maddi Gelişim Arayan Genç, Yeni Fırsat Sunan İş Arkadaşı", astrology: "Toprak Elementi" }, reversed: { positive: "Kararlılık Kazanma", negative: "Kötü Haber, Kararsızlık", role: "Savurgan", emotion: "Kararsızlık, Savurganlık, Hayal Kırıklığı", situation: "Kararsızlık", number_rep: "Uşak", archetype: "Blokaj", energy: "Blokaj", person_rep: "Kararsız Genç, Savurgan Akraba", astrology: "Toprak Elementi Gölgesi" } },
    { name: "Tılsım Şövalyesi", upright: { positive: "Güvenilirlik, Sabır, Sorumluluk", negative: "Durağanlık, Tembellik", role: "Güvenilir", emotion: "Güvenilirlik, Sabır, Sorumluluk", situation: "Verimlilik", number_rep: "Şövalye", archetype: "Sorumluluk", energy: "Pasif", person_rep: "Güvenilir Çalışan, Sorumlu Partner, Sabırlı Birey", astrology: "Toprak Elementi" }, reversed: { positive: "Eyleme Geçme", negative: "İşi Erteleme, Sıkıcılık", role: "Sıkıcı", emotion: "Gecikme, Tembellik, Sıkıcılık", situation: "Gecikme", number_rep: "Şövalye", archetype: "Gecikme", energy: "Blokaj", person_rep: "Tembel İş Arkadaşı, Geciken Ebeveyn", astrology: "Toprak Elementi Gölgesi" } },
    { name: "Tılsım Kraliçesi", upright: { positive: "Bakım, Konfor, Pratiklik", negative: "Bağımlılık, Bencil Olma", role: "Anne Figürü", emotion: "Konfor, Bakım, Pratik Zeka", situation: "Konfor", number_rep: "Kraliçe", archetype: "Bakım", energy: "Pasif", person_rep: "Anne, Pratik Zekalı Kadın, Destekleyici Partner", astrology: "Toprak Elementi" }, reversed: { positive: "Bağımsızlık", negative: "Dengesizlik, Kıskançlık", role: "Bencil", emotion: "Dengesizlik, Kıskançlık, Bağımlılık", situation: "Bağımlılık", number_rep: "Kraliçe", archetype: "Dengesizlik", energy: "Blokaj", person_rep: "Kıskanç Partner, Bencil Ebeveyn", astrology: "Toprak Elementi Gölgesi" } },
    { name: "Tılsım Kralı", upright: { positive: "Başarı, Pratiklik", negative: "Açgözlülük, Otoriterlik", role: "Zengin Adam", emotion: "Başarı, İstikrar, Lüks", situation: "Maddi İstikbar, Bolluk", number_rep: "Kral", archetype: "İş Adamı", energy: "Durağan", person_rep: "Başarılı İş Adamı/Patron, Zengin Akraba, Lüks Seven Kişi", astrology: "Toprak Burçları" }, reversed: { positive: "Mali Yapılanma, Pratik Zeka", negative: "Mali Kayıp, Yolsuzluk", role: "Kötü Yönetici", emotion: "Açgözlülük, Kontrol Kaybı, Yolsuzluk", situation: "Maddiyatçılık, Kontrol Kaybı", number_rep: "Kral", archetype: "Yolsuz", energy: "Blokaj", person_rep: "Parayı Kötü Kullanan Kişi, Yolsuz Patron", astrology: "Toprak Burçları" } }
];
// ----------------------------------------------------

function getCardDataById(id) {
    if (id >= 1 && id <= TAROT_CARD_DATA.length) {
        // Diziden veriyi doğru indeksle çekiyoruz
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
    // Veri bulunamazsa Bilinmeyen Kart verisi döndürülür
    return { 
        cardName: "BİLİNMEYEN KART", 
        imagePath: "/images/cardback.jpg", 
        position: "HATA", 
        meaningCategories: {
            positive: "Veri Dizisinde Eksiklik", 
            negative: "Kart ID Sunucuda Tanımlı Değil",
            emotion: "HATA", 
            person_rep: "Tanımlanamayan Kaynak",
            number_rep: "??",
            archetype: "HATA",
            energy: "Blokaj",
            role: "Hata Kaynağı",
            situation: "Kritik Sistem Hatası",
            astrology: "Yok"
        } 
    };
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
        
        const solutionMessage = `
            ${solutionCardData.cardName} kartı, danışanın şu anki duruma karşı alması gereken net eylemi gösteriyor. 
            Kartın Düz veya Ters gelmesine bağlı olarak odaklanılması gereken: 
            **${solutionCardData.position.includes('Düz') ? solutionCardData.meaningCategories.positive : solutionCardData.meaningCategories.negative}**
        `;

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
    console.log(`Sunucu dinamik PORT ${PORT} adresinde çalışıyor.`);
    console.log(`Uygulama yayında: Render URL'niz...`);
});