const LINES = {
  A: { name: 'Moccacino & Moccafrio', mixers: ['MD 01', 'MD 02', 'ME 03', 'ME 04', 'MPD', 'MPE', 'MF'] },
  B: { name: 'Cappucino', mixers: ['MC 01', 'MC 02', 'MC 03', 'MPC 01', 'MPC 02'] },
};

const OPERATOR_PIN = '1234';

function getLineParam() {
  const params = new URLSearchParams(window.location.search);
  const line = params.get('line');
  return LINES[line] ? line : 'A';
}

function startClock() {
  const el = document.getElementById('clockBadge');
  if (!el) return;
  function tick() {
    el.textContent = new Date().toLocaleTimeString('id-ID', { hour12: false });
  }
  tick();
  setInterval(tick, 1000);
}

// ===== role per device =====

function getRole() {
  return localStorage.getItem('deviceRole');
}

function setRole(role) {
  if (role === 'operator') {
    document.getElementById('roleOverlay').classList.add('d-none');
    document.getElementById('operatorPinOverlay').classList.remove('d-none');
    document.getElementById('operatorPinInput').value = '';
    document.getElementById('operatorPinError').classList.add('d-none');
    return;
  }
  localStorage.setItem('deviceRole', role);
  document.getElementById('roleOverlay').classList.add('d-none');
  applyRoleUI();
  showShiftOverlayIfNeeded();
}

function changeRole() {
  localStorage.removeItem('deviceRole');
  showRoleOverlayIfNeeded();
}

function showRoleOverlayIfNeeded() {
  const overlay = document.getElementById('roleOverlay');
  const operatorPin = document.getElementById('operatorPinOverlay');

  if (!getRole()) {
    overlay.classList.remove('d-none');
    if (operatorPin) operatorPin.classList.add('d-none');
  } else {
    overlay.classList.add('d-none');
    if (operatorPin) operatorPin.classList.add('d-none');
  }
  applyRoleUI();
  showShiftOverlayIfNeeded();
}

function applyRoleUI() {
  const role = getRole();
  const badge = document.getElementById('roleBadge');
  if (badge) badge.textContent = role === 'qc' ? 'Helper QC' : (role === 'operator' ? 'Operator' : '-');

  const grid = document.getElementById('mixerGrid');
  if (grid && grid.children.length > 0) {
    const lineKey = getLineParam();
    renderMixerGrid(lineKey);
  }
}

// ===== SANDI OPERATOR =====

function checkOperatorPin() {
  const input = document.getElementById('operatorPinInput').value.trim();
  const errEl = document.getElementById('operatorPinError');

  if (input === OPERATOR_PIN) {
    localStorage.setItem('deviceRole', 'operator');
    document.getElementById('operatorPinOverlay').classList.add('d-none');
    errEl.classList.add('d-none');
    document.getElementById('operatorPinInput').value = '';
    applyRoleUI();
    showShiftOverlayIfNeeded();
  } else {
    errEl.classList.remove('d-none');
  }
}

function cancelOperatorPin() {
  document.getElementById('operatorPinOverlay').classList.add('d-none');
  document.getElementById('operatorPinInput').value = '';
  document.getElementById('operatorPinError').classList.add('d-none');
  document.getElementById('roleOverlay').classList.remove('d-none');
}

// ===== shift =====

function getShift() {
  return localStorage.getItem('deviceShift');
}

function setShift(shift) {
  localStorage.setItem('deviceShift', shift);
  document.getElementById('shiftOverlay').classList.add('d-none');
  applyShiftUI();
}

function changeShift() {
  localStorage.removeItem('deviceShift');
  showShiftOverlayIfNeeded();
}

function showShiftOverlayIfNeeded() {
  const overlay = document.getElementById('shiftOverlay');
  if (!overlay) return;
  if (!getRole()) {
    overlay.classList.add('d-none');
  } else if (!getShift()) {
    overlay.classList.remove('d-none');
  } else {
    overlay.classList.add('d-none');
  }
  applyShiftUI();
}

function applyShiftUI() {
  const shift = getShift();
  const badge = document.getElementById('shiftBadge');
  if (badge) badge.textContent = shift ? `Shift ${shift}` : '-';
}

// ===== kartu mixer =====

function renderMixerGrid(lineKey) {
  const grid = document.getElementById('mixerGrid');
  const iconTpl = document.getElementById('mixerIconTpl').innerHTML;
  const mixers = LINES[lineKey].mixers;
  const role = getRole();
  grid.innerHTML = '';

  mixers.forEach((mixerName) => {
    const key = `${lineKey}-${mixerName}`;
    const col = document.createElement('div');
    col.className = 'col-6 col-md-3';

    let actionsHtml = '';
    let extraBtn = '';

    if (role === 'operator') {
      actionsHtml = `
        <div class="mixer-actions">
          <button type="button" class="btn-mini btn-sampling" onclick="handleSampling('${lineKey}', '${mixerName}')">Sampling</button>
          <button type="button" class="btn-mini btn-tuang" onclick="handleTuangMikro('${lineKey}', '${mixerName}')">Tuang Mikro</button>
        </div>`;
      extraBtn = `<button type="button" class="btn-mini btn-discard" onclick="handleDiscard('${lineKey}', '${mixerName}')">Discharge</button>`;
    } else if (role === 'qc') {
      actionsHtml = `
        <div class="mixer-actions">
          <button type="button" class="btn-mini btn-info-turun" data-info-turun="${key}" onclick="handleInfoTurun('${lineKey}', '${mixerName}')">Campuran Turun</button>
        </div>`;
    }

    col.innerHTML = `
      <div class="mixer-card-wrap">
        <span class="mixer-badge" data-mixer-badge="${key}"></span>
        <div class="mixer-card">
          <div class="mixer-card-link">
            <div class="mixer-icon-wrap">${iconTpl}</div>
            <p class="mixer-name">${mixerName}</p>
            <p class="mixer-batch-label">Batch</p>
            <p class="mixer-batch-value" data-mixer="${key}">-</p>
            <p class="mixer-note" data-mixer-note="${key}">-</p>
          </div>
          ${actionsHtml}
        </div>
        ${extraBtn}
      </div>
    `;
    grid.appendChild(col);
  });
}

function showActionModal(title, bodyText, onConfirm) {
  document.getElementById('actionModalTitle').textContent = title;
  document.getElementById('actionModalBody').textContent = bodyText;

  const confirmBtn = document.getElementById('actionModalConfirm');
  confirmBtn.textContent = 'Selesai';
  confirmBtn.onclick = () => {
    if (onConfirm) onConfirm();
    bootstrap.Modal.getOrCreateInstance(document.getElementById('actionModal')).hide();
  };

  bootstrap.Modal.getOrCreateInstance(document.getElementById('actionModal')).show();
}

// ===== suara =====

const HURUF_SPOKEN = {
  'A': 'a', 'B': 'be', 'C': 'ce', 'D': 'de', 'E': 'e',
  'F': 'ef', 'G': 'ge', 'H': 'ha', 'I': 'i', 'J': 'je',
  'K': 'ka', 'L': 'el', 'M': 'em', 'N': 'en', 'O': 'o',
  'P': 'pe', 'Q': 'ki', 'R': 'er', 'S': 'es', 'T': 'te',
  'U': 'u', 'V': 've', 'W': 'we', 'X': 'eks', 'Y': 'ye', 'Z': 'zet',
  '0': 'nol', '1': 'satu', '2': 'dua', '3': 'tiga', '4': 'empat',
  '5': 'lima', '6': 'enam', '7': 'tujuh', '8': 'delapan', '9': 'sembilan',
};

function formatSpokenMixer(mixerName) {
  return mixerName
    .split('')
    .map((c) => {
      if (c === ' ') return ' ';
      return HURUF_SPOKEN[c.toUpperCase()] || c;
    })
    .join(' ');
}

function speakAlert(text) {
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'id-ID';
  speechSynthesis.speak(utterance);
}

let spokenAlertInterval = null;

function startSpokenAlert(text) {
  const say = () => speakAlert(text);
  say();
  spokenAlertInterval = setInterval(say, 5000);
}

function stopSpokenAlert() {
  clearInterval(spokenAlertInterval);
  speechSynthesis.cancel();
}

// ===== cache lokal =====
const mixerStatus = {};
const mixerBatchNumber = {};
const mixerActiveBatchLog = {};
const mixerLastKnownStatus = {};
const mixerLastKnownQcApproved = {};
const mixerQcApproved = {};
const mixerNeedsResample = {};
const mixerInfoTurun = {};
const mixerDiterimaLab = {};
const mixerLastKnownDiterimaLab = {};

function formatJam(date) {
  return date.toLocaleTimeString('id-ID', { hour12: false, hour: '2-digit', minute: '2-digit' });
}

function formatTanggal(date) {
  return date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

function mixerDocRef(key) {
  return db.collection('mixers').doc(key);
}

// ===== ANTRIAN SINYAL QC =====
const alertQueue = [];
let currentAlert = null;
let isProcessingNext = false;

function enqueueAlert(lineKey, mixerName, alertType) {
  const key = `${lineKey}-${mixerName}`;
  if (alertQueue.some((a) => a.key === key)) return;
  if (currentAlert && currentAlert.key === key) return;
  alertQueue.push({ lineKey, mixerName, alertType, key });
  if (!currentAlert) processNextAlert();
}

function processNextAlert() {
  if (currentAlert) return;
  if (alertQueue.length === 0) {
    currentAlert = null;
    return;
  }

  currentAlert = alertQueue.shift();
  const { lineKey, mixerName, alertType } = currentAlert;

  const label = alertType === 'sampling' ? 'Sampling' : 'Tuang Mikro';
  const spokenMixerName = formatSpokenMixer(mixerName);
  const spokenText = alertType === 'sampling'
    ? `Sampling, ${spokenMixerName}`
    : `Tuang mikro, ${spokenMixerName}`;

  startSpokenAlert(spokenText);

  const sisaAntrian = alertQueue.length;
  const infoAntrian = sisaAntrian > 0
    ? `\n\n(${sisaAntrian} penuangan lain masih menunggu di antrian.)`
    : '';

  document.getElementById('actionModalTitle').textContent = `${label} — ${mixerName}`;
  document.getElementById('actionModalBody').textContent =
    `Sinyal "${label}" dari ${mixerName} (${LINES[lineKey].name}).${infoAntrian}`;

  const confirmBtn = document.getElementById('actionModalConfirm');
  confirmBtn.textContent = 'Oke, proses';

  confirmBtn.onclick = () => {
    stopSpokenAlert();
    document.getElementById('actionModalBody').textContent =
      `Sedang diproses untuk ${mixerName}. Klik "Selesai" jika sudah melakukan penuangan.`;
    confirmBtn.textContent = 'Selesai';

    confirmBtn.onclick = () => {
      const now = new Date();
      const tanggal = formatTanggal(now);
      const jam = formatJam(now);
      const key = `${lineKey}-${mixerName}`;

      if (alertType === 'tuang-mikro') {
        const currentBatch = mixerBatchNumber[key] || 1;
        const newBatchRef = db.collection('batchLog').doc();

        newBatchRef.set({
          line: lineKey,
          mixerName,
          batchNumber: currentBatch,
          tanggal,
          jamTuangMikro: jam,
          jamSampling: null,
          shift: getShift() || '-',
          qcApproved: false,
          needsResample: false,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        }).then(() => {
          return mixerDocRef(key).set({
            status: 'idle',
            activeBatchLogId: newBatchRef.id,
            qcApproved: false,
            needsResample: false,
            infoTurunRequested: false,
            diterimaLab: false,
          }, { merge: true });
        }).catch((err) => console.error('Gagal simpan tuang mikro:', err));

      } else {
        const activeId = mixerActiveBatchLog[key];
        const isResample = mixerNeedsResample[key] === true;

        if (!activeId) {
          showOperatorToast(`Sampling ${mixerName} diabaikan: belum ada Tuang Mikro untuk batch ini.`);
        } else {
          if (isResample) {
            db.collection('batchLog').doc(activeId).update({
              jamSamplingUlang: firebase.firestore.FieldValue.arrayUnion(jam),
            }).then(() => {
              return mixerDocRef(key).set({
                status: 'idle',
                needsResample: false,
              }, { merge: true });
            }).catch((err) => console.error('Gagal update sampling ulang:', err));
          } else {
            db.collection('batchLog').doc(activeId).update({
              jamSampling: jam,
            }).then(() => {
              return mixerDocRef(key).set({
                status: 'idle',
              }, { merge: true });
            }).catch((err) => console.error('Gagal update sampling:', err));
          }
        }
      }

      currentAlert = null;
      isProcessingNext = true;
      bootstrap.Modal.getOrCreateInstance(document.getElementById('actionModal')).hide();

      setTimeout(() => {
        isProcessingNext = false;
        processNextAlert();
      }, 400);
    };
  };

  bootstrap.Modal.getOrCreateInstance(document.getElementById('actionModal')).show();
}

function playAlertSound(frequency = 880, durationMs = 200) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.value = frequency;
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  gain.gain.setValueAtTime(0.3, ctx.currentTime);
  oscillator.start();
  oscillator.stop(ctx.currentTime + durationMs / 1000);
}

function showOperatorToast(message) {
  document.getElementById('opToastBody').textContent = message;
  bootstrap.Toast.getOrCreateInstance(document.getElementById('opToast'), { delay: 5000 }).show();
}

function notifyOperatorDone(mixerName, alertType) {
  const label = alertType === 'sampling' ? 'Sampling' : 'Tuang mikro';
  const spokenMixerName = formatSpokenMixer(mixerName);
  speakAlert(`${label} mixer ${spokenMixerName} sudah selesai.`);
  showOperatorToast(`${label} ${mixerName} sudah selesai dikonfirmasi QC.`);
}

function notifyOperatorQcOk(mixerName) {
  const spokenMixerName = formatSpokenMixer(mixerName);
  speakAlert(`campuran ${spokenMixerName} sudah oke`);
  showOperatorToast(`✅ Campuran ${mixerName} sudah di-OK oleh Lab QC.`);
}

// ===== TAMBAHAN: Helper QC dapet notif pas diterima lab =====
function notifyHelperDiterimaLab(mixerName) {
  const spokenMixerName = formatSpokenMixer(mixerName);
  speakAlert(`Campuran ${spokenMixerName} sudah diterima lab`);
  showOperatorToast(`✅ Campuran ${mixerName} sudah diterima Lab QC.`);
}

function subscribeToLine(lineKey) {
  db.collection('mixers').where('line', '==', lineKey).onSnapshot((snapshot) => {
    snapshot.docs.forEach((doc) => {
      const key = doc.id;
      const data = doc.data();
      mixerStatus[key] = data.status || 'idle';
      mixerBatchNumber[key] = data.batchNumberToday || 1;
      mixerActiveBatchLog[key] = data.activeBatchLogId || null;
      mixerQcApproved[key] = data.qcApproved || false;
      mixerNeedsResample[key] = data.needsResample || false;
      mixerInfoTurun[key] = data.infoTurunRequested || false;
      mixerDiterimaLab[key] = data.diterimaLab || false;

      const valueEl = document.querySelector(`[data-mixer="${key}"]`);
      if (valueEl) valueEl.textContent = mixerBatchNumber[key] || 1;

      refreshMixerNote(key);
      refreshMixerBadge(key);
      refreshInfoTurunButton(key);
    });

    snapshot.docChanges().forEach((change) => {
      const key = change.doc.id;
      const data = change.doc.data();
      const mixerName = data.mixerName;
      const newStatus = data.status || 'idle';
      const newQcApproved = data.qcApproved || false;
      const newDiterimaLab = data.diterimaLab || false;

      const prevStatus = mixerLastKnownStatus[key];
      const prevQcApproved = mixerLastKnownQcApproved[key];
      const prevDiterimaLab = mixerLastKnownDiterimaLab[key];

      if (prevStatus !== 'menunggu' && newStatus === 'menunggu' && data.alertType && getRole() === 'qc') {
        enqueueAlert(lineKey, mixerName, data.alertType);
      }

      if (prevStatus === 'menunggu' && newStatus === 'idle' && getRole() === 'operator') {
        notifyOperatorDone(mixerName, data.alertType);
      }

      if (prevQcApproved === false && newQcApproved === true && getRole() === 'operator') {
        notifyOperatorQcOk(mixerName);
      }

      // ===== TAMBAHAN: Helper QC dapet notif pas diterima lab =====
      if (prevDiterimaLab === false && newDiterimaLab === true && getRole() === 'qc') {
        notifyHelperDiterimaLab(mixerName);
      }
      // ===== /TAMBAHAN =====

      mixerLastKnownStatus[key] = newStatus;
      mixerLastKnownQcApproved[key] = newQcApproved;
      mixerLastKnownDiterimaLab[key] = newDiterimaLab;
    });
  }, (err) => console.error('Gagal dengerin data mixer:', err));
}

// ===== VALIDASI =====
function isBatchSudahSampling(key) {
  const activeId = mixerActiveBatchLog[key];
  if (!activeId) return true;
  const batchLog = batchLogCache[activeId];
  if (!batchLog) return false;
  return !!batchLog.jamSampling;
}

function requestMixerAlert(lineKey, mixerName, alertType) {
  const key = `${lineKey}-${mixerName}`;
  const label = alertType === 'sampling' ? 'Sampling' : 'Tuang Mikro';

  if (mixerStatus[key] === 'menunggu') {
    showActionModal(label, `${mixerName} masih menunggu respon dari sinyal sebelumnya.`);
    return;
  }

  const isResample = mixerNeedsResample[key] === true;

  if (alertType === 'sampling' && !isResample && !mixerActiveBatchLog[key]) {
    showActionModal(
      'Sampling',
      `${mixerName} belum ada Penuangan Mikro untuk batch ini. Lakukan Penuangan Mikro dulu sebelum Sampling.`
    );
    return;
  }

  if (alertType === 'tuang-mikro' && !isBatchSudahSampling(key)) {
    showActionModal(
      'Tuang Mikro',
      `${mixerName} masih ada batch yang belum di-sampling. Lakukan Sampling dulu sebelum Tuang Mikro batch berikutnya.`
    );
    return;
  }

  mixerDocRef(key).set({ line: lineKey, mixerName, status: 'menunggu', alertType }, { merge: true })
    .then(() => showOperatorToast(`Pesan ${label} ${mixerName} terkirim. Menunggu QC.`))
    .catch((err) => {
      console.error('Gagal kirim sinyal:', err);
      showOperatorToast(`❌ Gagal kirim sinyal ${label} ${mixerName}. Coba lagi.`);
    });
}

function handleSampling(lineKey, mixerName) {
  requestMixerAlert(lineKey, mixerName, 'sampling');
}

function handleTuangMikro(lineKey, mixerName) {
  requestMixerAlert(lineKey, mixerName, 'tuang-mikro');
}

// ===== INFO TURUN (Helper QC) =====
function handleInfoTurun(lineKey, mixerName) {
  const key = `${lineKey}-${mixerName}`;

  // Validasi 1: kalau udah QC OK, tolak
  if (mixerQcApproved[key]) {
    showActionModal('Campuran Turun', `${mixerName} sudah di-OK oleh Lab QC. Tidak perlu info campuran turun lagi.`);
    return;
  }

  // Validasi 2: kalau udah diterima lab, stop
  if (mixerDiterimaLab[key]) {
    showActionModal('Campuran Turun', `${mixerName} sudah diterima Lab QC. Tidak perlu info campuran turun lagi.`);
    return;
  }

  mixerDocRef(key).set({
    infoTurunRequested: true,
    diterimaLab: false,
  }, { merge: true }).then(() => {
    // Toast aja di Helper QC (gak ada suara — suara di Lab QC)
    showOperatorToast(`✅ Info campuran turun ${mixerName} terkirim ke Lab QC.`);
  }).catch((err) => {
    console.error('Gagal kirim info campuran turun:', err);
    showOperatorToast(`❌ Gagal kirim info campuran turun ${mixerName}. Coba lagi.`);
  });
}

function refreshInfoTurunButton(key) {
  const btn = document.querySelector(`[data-info-turun="${key}"]`);
  if (!btn) return;

  // Kalau udah diterima lab, tombol disabled
  if (mixerDiterimaLab[key]) {
    btn.textContent = 'Diterima Lab';
    btn.disabled = true;
    btn.classList.add('btn-info-turun-sent');
    btn.style.opacity = '0.5';
    btn.style.cursor = 'not-allowed';
    return;
  }

  // Kalau udah QC OK, tombol disabled juga
  if (mixerQcApproved[key]) {
    btn.textContent = 'Sudah OK';
    btn.disabled = true;
    btn.classList.add('btn-info-turun-sent');
    btn.style.opacity = '0.5';
    btn.style.cursor = 'not-allowed';
    return;
  }

  btn.disabled = false;
  btn.style.opacity = '1';
  btn.style.cursor = 'pointer';

  if (mixerInfoTurun[key]) {
    btn.textContent = 'Info Ulang';
    btn.classList.add('btn-info-turun-sent');
  } else {
    btn.textContent = 'Campuran Turun';
    btn.classList.remove('btn-info-turun-sent');
  }
}

// ===== DISCARD =====
function handleDiscard(lineKey, mixerName) {
  const key = `${lineKey}-${mixerName}`;
  const activeId = mixerActiveBatchLog[key];
  const batchLog = activeId ? batchLogCache[activeId] : null;

  if (!activeId || !batchLog || !batchLog.jamTuangMikro) {
    showActionModal('Discharge', `${mixerName} belum ada Penuangan Mikro untuk batch ini. Lakukan Penuangan Mikro dulu.`);
    return;
  }

  if (!batchLog.jamSampling) {
    showActionModal('Discharge', `${mixerName} belum di-sampling. Lakukan Sampling dulu sebelum Discharge.`);
    return;
  }

  if (!mixerQcApproved[key]) {
    showActionModal('Discharge', `${mixerName} belum di-OK oleh QC. Tunggu QC konfirmasi dulu sebelum Discharge.`);
    return;
  }

  

  const now = new Date();
  const jam = formatJam(now);
  const newBatchNumber = (batchLog.batchNumber || 0) + 1;

  db.collection('batchLog').doc(activeId).update({
    jamDiscard: jam,
    discarded: true,
  }).then(() => {
    return mixerDocRef(key).set({
      status: 'idle',
      batchNumberToday: newBatchNumber,
      alertType: firebase.firestore.FieldValue.delete(),
      activeBatchLogId: firebase.firestore.FieldValue.delete(),
      qcApproved: false,
      needsResample: false,
      infoTurunRequested: false,
      diterimaLab: false,
    }, { merge: true });
  }).then(() => {
    showOperatorToast(`✅ ${mixerName} sudah discharge. Batch naik ke ${newBatchNumber}.`);
  }).catch((err) => {
    console.error('Gagal discard:', err);
    showOperatorToast(`❌ Gagal discharge ${mixerName}. Coba lagi.`);
  });
}

function setLineTitle(lineKey) {
  const title = document.getElementById('lineTitle');
  if (title) title.textContent = LINES[lineKey].name;
}

// ===== riwayat batch =====

let shiftStartAt = null;
const batchLogCache = {};

function getMixerNote(key) {
  const activeId = mixerActiveBatchLog[key];
  const batchLog = activeId ? batchLogCache[activeId] : null;
  const role = getRole();

  if (!activeId) return '-';

  const sudahTuang = batchLog && batchLog.jamTuangMikro;
  const sudahSampling = batchLog && batchLog.jamSampling;
  const sudahQcOk = mixerQcApproved[key];

  if (role === 'qc' || role === 'operator') {
    if (mixerDiterimaLab[key]) return 'Campuran diterima lab';
    if (mixerInfoTurun[key]) return 'Campuran turun ke lab';
  }

  if (sudahQcOk) return 'Tuang ✓ · Sampling ✓ · QC ✓';
  if (sudahTuang && sudahSampling) return 'Tuang ✓ · Sampling ✓';
  if (sudahTuang) return 'Tuang ✓ · belum Sampling';
  return '-';
}

function refreshMixerNote(key) {
  const el = document.querySelector(`[data-mixer-note="${key}"]`);
  if (!el) return;
  const note = getMixerNote(key);
  el.textContent = note;

  if (note.includes('diterima lab')) {
    el.style.color = '#16a34a';
  } else if (note.includes('turun')) {
    el.style.color = '#0ea5e9';
  } else if (note.includes('QC ✓')) {
    el.style.color = '#16a34a';
  } else if (note.includes('Sampling ✓')) {
    el.style.color = '#0ea5e9';
  } else if (note.includes('Tuang ✓')) {
    el.style.color = '#f59e0b';
  } else {
    el.style.color = '#64748b';
  }
}

function refreshMixerBadge(key) {
  const badge = document.querySelector(`[data-mixer-badge="${key}"]`);
  if (!badge) return;

  if (mixerQcApproved[key]) {
    badge.textContent = '✓';
    badge.className = 'mixer-badge mixer-badge-ok';
  } else if (mixerNeedsResample[key]) {
    badge.textContent = '✗';
    badge.className = 'mixer-badge mixer-badge-ulang';
  } else {
    badge.textContent = '';
    badge.className = 'mixer-badge';
  }
}

function renderBatchLogRows() {
  const tbody = document.getElementById('rekapBody');
  const rows = Object.values(batchLogCache)
    .filter((r) => !shiftStartAt || r.createdAt >= shiftStartAt)
    .filter((r) => !!r.jamDiscard)
    .sort((a, b) => a.createdAt - b.createdAt);

  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center empty-note">Belum ada data batch</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map((r) => `
    <tr>
      <td>${r.mixerName}</td>
      <td>${r.tanggal || '-'}</td>
      <td>${r.jamTuangMikro || '-'}</td>
      <td>${r.jamSampling || '-'}</td>
      <td>${r.jamQcOk || '-'}</td>
      <td>${r.jamDiscard || '-'}</td>
      <td>${r.batchNumber}</td>
      <td>${r.shift || '-'}</td>
    </tr>
  `).join('');
}

function subscribeBatchLog(lineKey) {
  db.collection('batchLog').where('line', '==', lineKey).onSnapshot((snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'removed') {
        delete batchLogCache[change.doc.id];
        return;
      }
      const data = change.doc.data();
      batchLogCache[change.doc.id] = {
        ...data,
        createdAt: data.createdAt ? data.createdAt.toDate() : new Date(),
      };
    });
    renderBatchLogRows();

    LINES[lineKey].mixers.forEach((mixerName) => {
      refreshMixerNote(`${lineKey}-${mixerName}`);
    });
  }, (err) => console.error('Gagal dengerin batchLog:', err));
}

function subscribeLineMeta(lineKey) {
  db.collection('lineMeta').doc(lineKey).onSnapshot((doc) => {
    const data = doc.data();
    shiftStartAt = data && data.shiftStartAt ? data.shiftStartAt.toDate() : null;
    renderBatchLogRows();
  }, (err) => console.error('Gagal dengerin lineMeta:', err));
}

function resetShift() {
  const confirmed = confirm('Yakin  reset batch? Nomor batch berjalan balik ke awal. Riwayat batch sebelumnya tetap ter simpan');
  if (!confirmed) return;

  const lineKey = getLineParam();
  const batch = db.batch();

  LINES[lineKey].mixers.forEach((mixerName) => {
    const key = `${lineKey}-${mixerName}`;
    batch.set(mixerDocRef(key), {
      line: lineKey,
      mixerName,
      status: 'idle',
      batchNumberToday: 1,
      alertType: firebase.firestore.FieldValue.delete(),
      activeBatchLogId: firebase.firestore.FieldValue.delete(),
      qcApproved: false,
      needsResample: false,
      infoTurunRequested: false,
      diterimaLab: false,
    }, { merge: true });
  });

  batch.set(db.collection('lineMeta').doc(lineKey), {
    shiftStartAt: firebase.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  batch.commit().catch((err) => console.error('Gagal reset shift:', err));
}

function downloadSpreadsheet() {
  const table = document.querySelector('.rekap-table');
  const rows = table.querySelectorAll('tbody tr');
  const isEmpty = rows.length === 1 && rows[0].querySelector('.empty-note');

  if (isEmpty) {
    showOperatorToast('Belum ada data batch buat di-unduh.');
    return;
  }

  const workbook = XLSX.utils.table_to_book(table, { sheet: 'Rekap Batch', raw: true });
  const sheet = workbook.Sheets['Rekap Batch'];
  sheet['!cols'] = [
    { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 8 }, { wch: 8 },
  ];

  const lineKey = getLineParam();
  const fileName = `rekap-batch-${LINES[lineKey].name.replace(/[^a-z0-9]+/gi, '-')}-${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(workbook, fileName);
}

document.addEventListener('DOMContentLoaded', () => {
  const actionModalEl = document.getElementById('actionModal');
  actionModalEl.addEventListener('hide.bs.modal', () => {
    if (document.activeElement) document.activeElement.blur();
    stopSpokenAlert();

    if (!isProcessingNext && currentAlert) {
      currentAlert = null;
      setTimeout(() => processNextAlert(), 400);
    }
  });

  const lineKey = getLineParam();
  setLineTitle(lineKey);
  renderMixerGrid(lineKey);
  startClock();
  showRoleOverlayIfNeeded();
  subscribeToLine(lineKey);
  subscribeBatchLog(lineKey);
  subscribeLineMeta(lineKey);
});