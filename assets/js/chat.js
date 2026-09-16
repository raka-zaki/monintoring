// ============================================================
// CHAT OPERATOR ↔ LAB QC
// ============================================================

const CHAT_COLLECTION = 'chatLog';
const CHAT_MAX_MESSAGES = 50;
const CHAT_CLEANUP_HOURS = 24;
const CHAT_CLEANUP_INTERVAL = 24 * 60 * 60 * 1000;

let chatCurrentLine = null;
let chatCurrentRole = null;
let chatUnsubscribe = null;
let chatCleanupInterval = null;
let chatHasInitialLoaded = false;

// ===== INIT =====
function initChat(role, defaultLine) {
  // Helper QC gak butuh chat
  if (role === 'helper-qc') return;

  chatCurrentRole = role;

  if (role === 'operator') {
    chatCurrentLine = defaultLine || 'A';
    setupChatPanel(chatCurrentLine);
    subscribeChat(chatCurrentLine);
  } else if (role === 'lab-qc') {
    setupChatTabs();
    switchChatLine('A');
  }

  maybeCleanupChats();
  if (chatCleanupInterval) clearInterval(chatCleanupInterval);
  chatCleanupInterval = setInterval(cleanupOldChats, CHAT_CLEANUP_INTERVAL);
}

// ===== SETUP PANEL =====
function setupChatPanel(lineKey) {
  const inputEl = document.getElementById('chatInput');
  const sendBtn = document.getElementById('chatSendBtn');

  if (inputEl && sendBtn) {
    sendBtn.onclick = () => sendChatMessage();
    inputEl.onkeypress = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        sendChatMessage();
      }
    };
  }
}

// ===== SETUP TABS (Lab QC) =====
function setupChatTabs() {
  const tabA = document.getElementById('chatTabA');
  const tabB = document.getElementById('chatTabB');
  if (tabA) tabA.onclick = () => switchChatLine('A');
  if (tabB) tabB.onclick = () => switchChatLine('B');
}

function switchChatLine(lineKey) {
  chatCurrentLine = lineKey;

  document.querySelectorAll('.chat-tab').forEach((el) => el.classList.remove('active'));
  const activeTab = document.getElementById(`chatTab${lineKey}`);
  if (activeTab) activeTab.classList.add('active');

  if (chatUnsubscribe) {
    chatUnsubscribe();
    chatUnsubscribe = null;
  }

  chatHasInitialLoaded = false;
  subscribeChat(lineKey);
  setupChatPanel(lineKey);
}

// ===== SUBSCRIBE CHAT =====
function subscribeChat(lineKey) {
  const today = getTodayString();

  chatUnsubscribe = db.collection(CHAT_COLLECTION)
    .where('line', '==', lineKey)
    .where('date', '==', today)
    .orderBy('createdAt', 'asc')
    .limit(CHAT_MAX_MESSAGES)
    .onSnapshot((snapshot) => {
      const messages = snapshot.docs.map((d) => d.data());

      if (chatHasInitialLoaded && messages.length > 0) {
        const lastMsg = messages[messages.length - 1];
        if (lastMsg.sender !== getSenderName() && !snapshot.metadata.hasPendingWrites) {
          playChatBeep();
        }
      }

      renderChatMessages(lineKey, messages);
      chatHasInitialLoaded = true;
    }, (err) => {
      console.error('Gagal dengerin chat:', err);
    });
}

// ===== RENDER CHAT =====
function renderChatMessages(lineKey, messages) {
  const container = document.getElementById('chatMessages');
  if (!container) return;

  if (messages.length === 0) {
    container.innerHTML = '<p class="chat-empty">Belum ada chat hari ini.</p>';
    return;
  }

  const currentSender = getSenderName();

  container.innerHTML = messages.map((m) => {
    const isOwn = m.sender === currentSender;
    const time = m.createdAt ? formatChatTime(m.createdAt.toDate()) : '';
    return `
      <div class="chat-msg ${isOwn ? 'chat-msg-own' : 'chat-msg-other'}">
        <div class="chat-msg-header">
          <span class="chat-msg-sender">${m.sender}</span>
          <span class="chat-msg-time">${time}</span>
        </div>
        <div class="chat-msg-body">${escapeHtml(m.message)}</div>
      </div>
    `;
  }).join('');

  container.scrollTop = container.scrollHeight;
}

// ===== SEND MESSAGE =====
async function sendChatMessage() {
  const inputEl = document.getElementById('chatInput');
  if (!inputEl) return;

  const message = inputEl.value.trim();
  if (!message) return;

  const today = getTodayString();
  const sender = getSenderName();

  try {
    await db.collection(CHAT_COLLECTION).add({
      line: chatCurrentLine,
      sender,
      message,
      date: today,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });

    inputEl.value = '';
    inputEl.focus();
  } catch (err) {
    console.error('Gagal kirim chat:', err);
  }
}

// ===== HELPERS =====
function getSenderName() {
  if (chatCurrentRole === 'operator') return 'Operator';
  if (chatCurrentRole === 'lab-qc') return 'Lab QC';
  return 'Unknown';
}

function getTodayString() {
  return new Date().toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatChatTime(date) {
  return date.toLocaleTimeString('id-ID', { hour12: false, hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ===== BEEP =====
function playChatBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();

    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.value = 880;
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.2, ctx.currentTime);

    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.15);
  } catch (e) {
    console.warn('Beep gagal:', e);
  }
}

// ===== CLEANUP =====
async function cleanupOldChats() {
  const cutoff = new Date(Date.now() - CHAT_CLEANUP_HOURS * 60 * 60 * 1000);

  try {
    while (true) {
      const snapshot = await db.collection(CHAT_COLLECTION)
        .where('createdAt', '<', cutoff)
        .limit(400)
        .get();

      if (snapshot.empty) break;

      const batch = db.batch();
      snapshot.docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();

      if (snapshot.size < 400) break;
    }
  } catch (err) {
    console.error('Gagal cleanup chat:', err);
  }
}

function maybeCleanupChats() {
  const lastCleanup = localStorage.getItem('lastChatCleanup')
    ? parseInt(localStorage.getItem('lastChatCleanup'))
    : 0;

  const now = Date.now();
  if (now - lastCleanup < CHAT_CLEANUP_INTERVAL) return;

  localStorage.setItem('lastChatCleanup', now);
  cleanupOldChats();
}