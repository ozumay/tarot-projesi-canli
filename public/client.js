// Dosya Adı: client.js (Müşteri Uygulaması Mantığı)

const socket = io();

// --- DOM Elementleri ---
const authScreen = document.getElementById('auth-screen');
const selectionScreen = document.getElementById('selection-screen');
const waitingScreen = document.getElementById('waiting-screen');
const authMessage = document.getElementById('auth-message');
const selectionMessage = document.getElementById('selection-message');
const welcomeMessage = document.getElementById('welcome-message');
const cardDeck = document.getElementById('card-deck');
const requiredSelectionsEl = document.getElementById('required-selections');

let userToken = null;
let selectionsAllowed = false;
let selectedCards = []; // Müşterinin seçtiği ID'leri tutar
const MAX_SELECTIONS = 3; // Seçilmesi gereken kart sayısı

// ------------------------------------------------------------------
// --- GİRİŞ / KAYIT İŞLEMLERİ (HTTP API İLE) ---
// ------------------------------------------------------------------

async function handleAuth(url, body) {
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await response.json();
        
        authMessage.textContent = data.message;
        
        if (data.success) {
            userToken = data.token;
            localStorage.setItem('userToken', userToken);
            welcomeMessage.textContent = `Merhaba, ${data.name} ${data.surname}`;
            
            // Başarılı giriş/kayıt sonrası Socket.IO ile kimlik doğrulaması yap
            socket.emit('authenticate', userToken);
            
            // Geçiş: Auth -> Waiting (Socket onayı bekleniyor)
            authScreen.classList.add('hidden');
            waitingScreen.classList.remove('hidden');

        } else {
            authMessage.style.color = 'red';
        }
    } catch (e) {
        authMessage.textContent = 'Sunucu hatası: Bağlantı kurulamadı.';
        authMessage.style.color = 'red';
    }
}

document.getElementById('login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    handleAuth('/login', { email, password });
});

document.getElementById('logout-button').addEventListener('click', () => {
    userToken = null;
    localStorage.removeItem('userToken');
    selectionsAllowed = false;
    selectedCards = [];
    
    authScreen.classList.remove('hidden');
    selectionScreen.classList.add('hidden');
    waitingScreen.classList.add('hidden');
    authMessage.textContent = 'Başarıyla çıkış yapıldı.';
    authMessage.style.color = 'green';
});


// ------------------------------------------------------------------
// --- KART SEÇİM MANTIĞI ---
// ------------------------------------------------------------------

function setupDeck() {
    cardDeck.innerHTML = '';
    
    // 78 kart için yer tutucu görseller oluştur
    for (let i = 1; i <= 78; i++) {
        const card = document.createElement('div');
        card.className = 'card-back';
        card.dataset.cardId = i;
        card.addEventListener('click', handleCardSelection);
        cardDeck.appendChild(card);
    }
    requiredSelectionsEl.textContent = MAX_SELECTIONS;
}

function handleCardSelection(event) {
    if (!selectionsAllowed) {
        selectionMessage.textContent = 'Kart Bakıcınızın oturumu başlatması bekleniyor.';
        selectionMessage.style.color = 'orange';
        return;
    }

    if (selectedCards.length >= MAX_SELECTIONS) {
        selectionMessage.textContent = `Maksimum ${MAX_SELECTIONS} kart seçtiniz. Okumanız bekleniyor.`;
        return;
    }

    const cardElement = event.currentTarget;
    const cardId = parseInt(cardElement.dataset.cardId);

    if (cardElement.classList.contains('selected')) {
        selectionMessage.textContent = 'Bu kart zaten seçildi.';
        return;
    }

    // Kartı seçildi olarak işaretle
    cardElement.classList.add('selected');
    cardElement.removeEventListener('click', handleCardSelection); // Tekrar seçilmesini engelle

    // Sunucuya seçimi gönder
    socket.emit('card_selected', { cardId: cardId });
    selectedCards.push(cardId);
    
    selectionMessage.textContent = `${selectedCards.length} / ${MAX_SELECTIONS} kart seçildi.`;

    if (selectedCards.length >= MAX_SELECTIONS) {
        selectionsAllowed = false; // Seçimi bitir
        selectionMessage.textContent = `Tüm kartlar seçildi. Okumanız hazırlanıyor...`;
    }
}

// ------------------------------------------------------------------
// --- SOCKET.IO OLAY DİNLEYİCİLERİ ---
// ------------------------------------------------------------------

socket.on('auth_success', (data) => {
    if (data.role === 'querent') {
        // Ekranı değiştir: Waiting -> Selection
        waitingScreen.classList.add('hidden');
        authScreen.classList.add('hidden');
        selectionScreen.classList.remove('hidden');

        setupDeck();
        selectedCards = [];
    }
});

socket.on('auth_fail', (message) => {
    userToken = null;
    localStorage.removeItem('userToken');
    
    selectionScreen.classList.add('hidden');
    waitingScreen.classList.add('hidden');
    authScreen.classList.remove('hidden');
    authMessage.textContent = `Oturum hatası: ${message}`;
    authMessage.style.color = 'red';
});

socket.on('start_selection', () => {
    selectionsAllowed = true;
    selectionMessage.textContent = `Lütfen ${MAX_SELECTIONS} adet kart seçin.`;
    selectionMessage.style.color = 'green';
});

socket.on('deck_shuffled', () => {
    // Okuyucu desteyi karıştırdığında oturum sıfırlanır
    selectedCards = [];
    selectionsAllowed = false;
    
    // Tüm kartların 'selected' sınıfını kaldır
    document.querySelectorAll('.card-back').forEach(card => {
        card.classList.remove('selected');
        card.addEventListener('click', handleCardSelection); // Dinleyiciyi geri ekle
    });

    selectionScreen.classList.add('hidden');
    waitingScreen.classList.remove('hidden');
    document.getElementById('waiting-message').textContent = "Tarot Bakıcınız desteyi yeniden hazırladı. Yeni oturumun başlaması bekleniyor...";

    // Sunucuya tekrar authenticate gönder (yeni oturum isteği için)
    const token = localStorage.getItem('userToken');
    if (token) {
         socket.emit('authenticate', token);
    }
});

// ------------------------------------------------------------------
// --- SAYFA YÜKLEME VE BAŞLATMA ---
// ------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
    const storedToken = localStorage.getItem('userToken');
    if (storedToken) {
        userToken = storedToken;
        // Eğer token varsa, doğrudan waiting ekranını göster ve kimlik doğrulaması yap
        authScreen.classList.add('hidden');
        waitingScreen.classList.remove('hidden');
        socket.emit('authenticate', userToken);
    }
    requiredSelectionsEl.textContent = MAX_SELECTIONS;
});