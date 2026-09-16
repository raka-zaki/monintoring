const LINES = {
  A: { name: 'Moccacino & Moccafrio', mixers: ['MD 01', 'MD 02', 'ME 03', 'ME 04', 'MPD', 'MPE', 'MF'] },
  B: { name: 'Cappucino', mixers: ['MC 01', 'MC 02', 'MC 03', 'MPC 01', 'MPC 02'] },
};

const TUANG_MIKRO_MIXERS = ['MPD', 'MPE', 'MF', 'MPC 01', 'MPC 02'];
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

// ===== role =====
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

  // Chat cuma muncul buat operator
  const chatPanel = document.getElementById('chatPanel');
  if (chatPanel) {
    if (role === 'operator') {
      chatPanel.classList.remove('d-none');
    } else {
      chatPanel.classList.add('d-none');
    }
  }
}

// ===== SANDI =====
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

    // Init chat untuk operator
    const lineKey = getLineParam();
    initChat('operator', lineKey);
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

// ===== CACHE =====
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
const batchLogCache = {};
let shiftStartAt = null;

// ===== SUARA =====
const HURUF_SPOKEN = {
  'A': 'a', 'B': 'be', 'C': 'ce', 'D': 'de', 'E': 'e',
  'F': 'ef', 'G': 'ge', 'H': 'ha', 'I': 'i', 'J': 'je',
  'K': 'ka', 'L': 'el', 'M': 'em', 'N': 'en', 'O': 'o',
  'P': 'p', 'Q': 'ki', 'R': 'er', 'S': 'es', 'T': 'te',
  'U': 'u', 'V': 've', 'W': 'we', 'X': 'eks', 'Y': 'ye', 'Z': 'zet',
  '0': 'nol', '1': 'satu', '2': 'dua', '3': 'tiga', '4': 'empat',
  '5': 'lima', '6': 'enam', '7': 'tujuh', '8': 'delapan', '9': 'sembilan',
};

function formatSpokenMixer(mixerName) {
  return mixerName.split('').map((c) => {
    if (c === ' ') return ' ';
    return HURUF_SPOKEN[c.toUpperCase()] || c;
  }).join(' ');
}

function joinNames(names) {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} dan ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, dan ${names[names.length - 1]}`;
}

function speakAlert(text) {
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'id-ID';
  speechSynthesis.speak(utterance);
}

let spokenAlertInterval = null;

function startSpokenAlert(text) {
  stopSpokenAlert();
  const say = () => speakAlert(text);
  say();
  spokenAlertInterval = setInterval(say, 5000);
}

function stopSpokenAlert() {
  clearInterval(spokenAlertInterval);
  spokenAlertInterval = null;
  speechSynthesis.cancel();
}

// ===== HELPERS =====
function formatJam(date) {
  return date.toLocaleTimeString('id-ID', { hour12: false, hour: '2-digit', minute: '2-digit' });
}

function formatTanggal(date) {
  return date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

function mixerDocRef(key) {
  return db.collection('mixers').doc(key);
}

function showOperatorToast(message) {
  document.getElementById('opToastBody').textContent = message;
  bootstrap.Toast.getOrCreateInstance(document.getElementById('opToast'), { delay: 5000 }).show();
}

// ===== MULTI SELECT =====
const selectedMixers = new Set();

function toggleMixerSelect(key) {
  const card = document.querySelector(`[data-mixer-select="${key}"]`);
  if (!card) return;

  if (selectedMixers.has(key)) {
    selectedMixers.delete(key);
    card.classList.remove('selected');
  } else {
    selectedMixers.add(key);
    card.classList.add('selected');
  }
  updateActionButtonsState();
}

function clearAllSelected() {
  selectedMixers.clear();
  document.querySelectorAll('.mixer-card-select.selected').forEach((el) => {
    el.classList.remove('selected');
  });
  updateActionButtonsState();
}

function updateActionButtonsState() {
  const role = getRole();
  if (role !== 'operator') return;

  // Cek apakah ada mixer yang bisa tuang mikro
  const canTuang = Array.from(selectedMixers).some((key) => {
    const mixerName = key.split('-').slice(1).join('-');
    if (!TUANG_MIKRO_MIXERS.includes(mixerName)) return false;

    const result = validateBulkAction(key, mixerName, 'tuang-mikro');
    return result.valid;
  });

  const tuangBtn = document.querySelector('.btn-action-tuang');
  if (tuangBtn) {
    if (selectedMixers.size === 0 || !canTuang) {
      tuangBtn.disabled = true;
      tuangBtn.style.opacity = '0.4';
      tuangBtn.style.cursor = 'not-allowed';
    } else {
      tuangBtn.disabled = false;
      tuangBtn.style.opacity = '1';
      tuangBtn.style.cursor = 'pointer';
    }
  }

  const dischargeBtn = document.querySelector('.btn-action-discharge');
  if (dischargeBtn) {
    const validDischarge = getValidDischargeMixers();
    if (validDischarge.length === 0) {
      dischargeBtn.disabled = true;
      dischargeBtn.style.opacity = '0.4';
      dischargeBtn.style.cursor = 'not-allowed';
    } else {
      dischargeBtn.disabled = false;
      dischargeBtn.style.opacity = '1';
      dischargeBtn.style.cursor = 'pointer';
    }
  }
}

// ===== AUTO-DETECT DISCHARGE =====
function getValidDischargeMixers() {
  const lineKey = getLineParam();
  const mixers = LINES[lineKey].mixers;
  const valid = [];

  mixers.forEach((mixerName) => {
    const key = `${lineKey}-${mixerName}`;
    const result = validateBulkAction(key, mixerName, 'discharge');
    if (result.valid) {
      valid.push({ key, lineKey, mixerName });
    }
  });

  return valid;
}

// ===== RENDER CARD =====
function renderMixerGrid(lineKey) {
  const grid = document.getElementById('mixerGrid');
  const iconTpl = document.getElementById('mixerIconTpl').innerHTML;
  const mixers = LINES[lineKey].mixers;
  const role = getRole();
  grid.innerHTML = '';

  mixers.forEach((mixerName) => {
    const key = `${lineKey}-${mixerName}`;
    const col = document.createElement('div');
    col.className = 'col-4 col-md-3 col-lg-2';

    col.innerHTML = `
      <div class="mixer-card-wrap">
        <div class="mixer-card-select" data-mixer-select="${key}" onclick="toggleMixerSelect('${key}')">
          <span class="mixer-badge" data-mixer-badge="${key}"></span>
          <div class="mixer-icon-wrap">${iconTpl}</div>
          <p class="mixer-name">${mixerName}</p>
          <div class="mixer-divider"></div>
          <p class="mixer-batch-label">Batch</p>
          <p class="mixer-batch-value" data-mixer="${key}">-</p>
          <div class="mixer-divider"></div>
          <p class="mixer-note" data-mixer-note="${key}">-</p>
        </div>
      </div>
    `;
    grid.appendChild(col);
  });

  renderActionButtons(role);

  selectedMixers.forEach((key) => {
    const card = document.querySelector(`[data-mixer-select="${key}"]`);
    if (card) card.classList.add('selected');
  });

  mixers.forEach((mixerName) => {
    const k = `${lineKey}-${mixerName}`;
    refreshMixerBadge(k);
    refreshMixerNote(k);
  });

  updateActionButtonsState();
}

function renderActionButtons(role) {
  const container = document.getElementById('actionButtons');
  if (!container) return;
  container.innerHTML = '';

  if (role === 'operator') {
    container.innerHTML = `
      <button type="button" class="btn-action btn-action-sampling" onclick="handleBulkAction('sampling')">Sampling</button>
      <button type="button" class="btn-action btn-action-tuang" onclick="handleBulkAction('tuang-mikro')">Tuang Mikro</button>
      <button type="button" class="btn-action btn-action-discharge" onclick="handleBulkAction('discharge')">Discharge</button>
    `;
  } else if (role === 'qc') {
    container.innerHTML = `
      <button type="button" class="btn-action btn-action-info-turun" onclick="handleBulkAction('info-turun')">Campuran Turun</button>
    `;
  }
}

// ===== BULK ACTION =====
function handleBulkAction(actionType) {
  if (actionType === 'discharge') {
    let validItems = [];

    if (selectedMixers.size > 0) {
      const selectedArr = Array.from(selectedMixers);
      selectedArr.forEach((key) => {
        const lineKey = key.split('-')[0];
        const mixerName = key.split('-').slice(1).join('-');
        const result = validateBulkAction(key, mixerName, 'discharge');
        if (result.valid) validItems.push({ key, lineKey, mixerName });
      });
    } else {
      validItems = getValidDischargeMixers();
    }

    if (validItems.length === 0) {
      showOperatorToast('❌ Tidak ada mixer yang siap discharge.');
      return;
    }

    executeBulkAction('discharge', validItems);
    return;
  }

  if (selectedMixers.size === 0) {
    showOperatorToast('Pilih mixer dulu.');
    return;
  }

  const selectedArr = Array.from(selectedMixers);
  const valid = [];
  const invalid = [];

  selectedArr.forEach((key) => {
    const lineKey = key.split('-')[0];
    const mixerName = key.split('-').slice(1).join('-');
    const result = validateBulkAction(key, mixerName, actionType);
    if (result.valid) {
      valid.push({ key, lineKey, mixerName });
    } else {
      invalid.push({ key, mixerName, reason: result.reason });
    }
  });

 if (valid.length === 0) {
  const firstReason = invalid.length > 0 ? invalid[0].reason : 'tidak valid';
  const labelMap = {
    'sampling': 'sampling',
    'tuang-mikro': 'tuang mikro',
    'discharge': 'discharge',
    'info-turun': 'menurunkan campuran',
  };
  const label = labelMap[actionType] || actionType;
  showOperatorToast(`❌ Tidak bisa ${label}: ${firstReason}`);
  return;
}

  executeBulkAction(actionType, valid);
}

function validateBulkAction(key, mixerName, actionType) {
  const activeId = mixerActiveBatchLog[key];
  const batchLog = activeId ? batchLogCache[activeId] : null;
  const isTuangMixer = TUANG_MIKRO_MIXERS.includes(mixerName);

  if (actionType === 'sampling') {
    if (mixerStatus[key] === 'menunggu') return { valid: false, reason: 'lagi nunggu konfirmasi' };
    const isResample = mixerNeedsResample[key] === true;

    if (isTuangMixer && !isResample && !activeId) {
      return { valid: false, reason: 'belum tuang mikro' };
    }
    if (batchLog && batchLog.jamSampling && !isResample) {
      return { valid: false, reason: 'sudah sampling' };
    }
    return { valid: true };
  }

  if (actionType === 'tuang-mikro') {
    if (!isTuangMixer) return { valid: false, reason: 'tidak butuh tuang mikro' };
    if (mixerStatus[key] === 'menunggu') return { valid: false, reason: 'lagi nunggu konfirmasi' };

    // ===== FIX: kalau masih ada batch jalan → block =====
    if (activeId) {
      return { valid: false, reason: 'masih ada batch jalan, discharge dulu' };
    }
    // ===== /FIX =====

    return { valid: true };
  }

  if (actionType === 'discharge') {
    if (!activeId) return { valid: false, reason: 'belum ada batch' };
    if (!batchLog) return { valid: false, reason: 'batch tidak ditemukan' };
    if (isTuangMixer && !batchLog.jamTuangMikro) return { valid: false, reason: 'belum tuang mikro' };
    if (!batchLog.jamSampling) return { valid: false, reason: 'belum sampling' };
    if (!mixerQcApproved[key]) return { valid: false, reason: 'belum QC OK' };
    return { valid: true };
  }

  if (actionType === 'info-turun') {
    if (!activeId) return { valid: false, reason: 'belum ada batch' };
    if (!batchLog || !batchLog.jamSampling) return { valid: false, reason: 'belum sampling' };
    if (mixerNeedsResample[key]) return { valid: false, reason: 'sampling ulang belum selesai' };
    if (mixerQcApproved[key]) return { valid: false, reason: 'sudah QC OK' };
    if (mixerDiterimaLab[key]) return { valid: false, reason: 'sudah diterima lab' };
    return { valid: true };
  }

  return { valid: false, reason: 'aksi tidak dikenal' };
}

function executeBulkAction(actionType, validItems) {
  if (actionType === 'sampling' || actionType === 'tuang-mikro') {
    const promises = validItems.map(({ key }) =>
      mixerDocRef(key).set({
        status: 'menunggu',
        alertType: actionType,
      }, { merge: true })
    );

    Promise.all(promises).then(() => {
      const spokenNames = validItems.map((v) => formatSpokenMixer(v.mixerName));
      const text = actionType === 'sampling' ? 'Sampling' : 'Tuang mikro';

      if (getRole() === 'qc') {
        startSpokenAlert(`${text}, ${joinNames(spokenNames)}`);
      } else {
        showOperatorToast(`✅ Sinyal ${text} terkirim. Menunggu konfirmasi Helper QC.`);
      }
      clearAllSelected();
    }).catch((err) => {
      console.error('Gagal bulk action:', err);
      showOperatorToast(`❌ Gagal kirim sinyal. Coba lagi.`);
    });
    return;
  }

  const now = new Date();
  const tanggal = formatTanggal(now);
  const jam = formatJam(now);
  const shift = getShift() || '-';

  const promises = validItems.map(({ key, lineKey, mixerName }) => {
    if (actionType === 'discharge') {
      const activeId = mixerActiveBatchLog[key];
      const batchLog = batchLogCache[activeId];
      if (!batchLog) return Promise.resolve();
      const newBatchNumber = (batchLog.batchNumber || 0) + 1;

      return db.collection('batchLog').doc(activeId).update({
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
      });
    }

    if (actionType === 'info-turun') {
      return mixerDocRef(key).set({
        infoTurunRequested: true,
        diterimaLab: false,
      }, { merge: true });
    }

    return Promise.resolve();
  });

  Promise.all(promises).then(() => {
    const spokenNames = validItems.map((v) => formatSpokenMixer(v.mixerName));
    const text = actionType === 'discharge' ? 'Discharge' : 'Campuran turun';

    speakAlert(`${text}, ${joinNames(spokenNames)}`);
    showOperatorToast(`✅ ${text} untuk ${validItems.length} mixer terkirim.`);
    clearAllSelected();
  }).catch((err) => {
    console.error('Gagal bulk action:', err);
    showOperatorToast(`❌ Gagal sebagian. Cek console.`);
  });
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
  const spokenText = alertType === 'sampling'
    ? `Sampling, ${formatSpokenMixer(mixerName)}`
    : `Tuang mikro, ${formatSpokenMixer(mixerName)}`;

  startSpokenAlert(spokenText);

  const sisaAntrian = alertQueue.length;
  const infoAntrian = sisaAntrian > 0 ? `\n\n(${sisaAntrian} penuangan lain masih menunggu di antrian.)` : '';

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
      const isTuangMixer = TUANG_MIKRO_MIXERS.includes(mixerName);

      if (alertType === 'tuang-mikro') {
        const activeId = mixerActiveBatchLog[key];
        const batchLog = activeId ? batchLogCache[activeId] : null;

        // Kalau masih ada batch jalan → block
        if (activeId && batchLog) {
          showOperatorToast(`⚠️ ${mixerName} masih ada batch jalan. Discharge dulu.`);
          mixerDocRef(key).set({
            status: 'idle',
            alertType: firebase.firestore.FieldValue.delete(),
          }, { merge: true });

          currentAlert = null;
          isProcessingNext = true;
          bootstrap.Modal.getOrCreateInstance(document.getElementById('actionModal')).hide();
          setTimeout(() => {
            isProcessingNext = false;
            processNextAlert();
          }, 400);
          return;
        }

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

        if (isResample && activeId) {
          db.collection('batchLog').doc(activeId).update({
            jamSamplingUlang: firebase.firestore.FieldValue.arrayUnion(jam),
          }).then(() => {
            return mixerDocRef(key).set({
              status: 'idle',
              needsResample: false,
              infoTurunRequested: false,
              diterimaLab: false,
            }, { merge: true });
          }).catch((err) => console.error('Gagal update sampling ulang:', err));
        } else if (isTuangMixer && activeId) {
          db.collection('batchLog').doc(activeId).update({
            jamSampling: jam,
          }).then(() => {
            return mixerDocRef(key).set({
              status: 'idle',
            }, { merge: true });
          }).catch((err) => console.error('Gagal update sampling:', err));
        } else if (!isTuangMixer && !activeId) {
          const currentBatch = mixerBatchNumber[key] || 1;
          const newBatchRef = db.collection('batchLog').doc();

          newBatchRef.set({
            line: lineKey,
            mixerName,
            batchNumber: currentBatch,
            tanggal,
            jamTuangMikro: null,
            jamSampling: jam,
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
          }).catch((err) => console.error('Gagal simpan sampling:', err));
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

// ===== SUBSCRIBE =====
function notifyOperatorDone(mixerName, alertType) {
  const label = alertType === 'sampling' ? 'Sampling' : 'Tuang mikro';
  speakAlert(`${label} mixer ${formatSpokenMixer(mixerName)} sudah selesai.`);
  showOperatorToast(`${label} ${mixerName} sudah selesai dikonfirmasi QC.`);
}

function notifyOperatorQcOk(mixerName) {
  speakAlert(`campuran ${formatSpokenMixer(mixerName)} sudah oke`);
  showOperatorToast(`✅ Campuran ${mixerName} sudah di-OK Lab QC.`);
}

function notifyHelperDiterimaLab(mixerName) {
  speakAlert(`Campuran ${formatSpokenMixer(mixerName)} sudah diterima lab`);
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
    });

    updateActionButtonsState();

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

      if (prevDiterimaLab === false && newDiterimaLab === true && getRole() === 'qc') {
        notifyHelperDiterimaLab(mixerName);
      }

      mixerLastKnownStatus[key] = newStatus;
      mixerLastKnownQcApproved[key] = newQcApproved;
      mixerLastKnownDiterimaLab[key] = newDiterimaLab;
    });
  }, (err) => console.error('Gagal dengerin data mixer:', err));
}

// ===== NOTE & BADGE =====
function getMixerNote(key) {
  const activeId = mixerActiveBatchLog[key];
  const batchLog = activeId ? batchLogCache[activeId] : null;
  const role = getRole();
  const mixerName = key.split('-').slice(1).join('-');
  const isTuangMixer = TUANG_MIKRO_MIXERS.includes(mixerName);

  if (!activeId) return '-';

  const sudahTuang = batchLog && batchLog.jamTuangMikro;
  const sudahSampling = batchLog && batchLog.jamSampling;
  const sudahQcOk = mixerQcApproved[key];

  if (role === 'qc' || role === 'operator') {
    if (mixerDiterimaLab[key]) return 'Campuran diterima lab';
    if (mixerInfoTurun[key]) return 'Campuran turun ke lab';
  }

  if (sudahQcOk) {
    if (isTuangMixer) return 'Tuang ✓ · Sampling ✓ · QC ✓';
    return 'Sampling ✓ · QC ✓';
  }
  if (sudahTuang && sudahSampling) return 'Tuang ✓ · Sampling ✓';
  if (sudahTuang) return 'Tuang ✓ · belum Sampling';
  if (sudahSampling) return 'Sampling ✓';
  return '-';
}

function refreshMixerNote(key) {
  const el = document.querySelector(`[data-mixer-note="${key}"]`);
  if (!el) return;
  const note = getMixerNote(key);
  el.textContent = note;

  if (note.includes('diterima lab')) el.style.color = '#16a34a';
  else if (note.includes('turun')) el.style.color = '#0ea5e9';
  else if (note.includes('QC ✓')) el.style.color = '#16a34a';
  else if (note.includes('Sampling ✓')) el.style.color = '#0ea5e9';
  else if (note.includes('Tuang ✓')) el.style.color = '#f59e0b';
  else el.style.color = '#64748b';
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

// ===== TABEL DATA BATCH =====
function renderBatchLogRows() {
  const tbody = document.getElementById('rekapBody');
  if (!tbody) return;

  const lineKey = getLineParam();
  const mixerOrder = LINES[lineKey] ? LINES[lineKey].mixers : [];

  const html = [];

  mixerOrder.forEach((mixerName) => {
    const mixerBatches = Object.values(batchLogCache)
      .filter((r) => r.mixerName === mixerName)
      .filter((r) => !!r.jamDiscard)
      .filter((r) => !shiftStartAt || r.createdAt >= shiftStartAt)
      .sort((a, b) => b.createdAt - a.createdAt);

    const r = mixerBatches[0];

    if (!r) return;

    html.push(`
      <tr>
        <td>${r.batchNumber}</td>
        <td>${r.mixerName}</td>
        <td>${r.jamTuangMikro || '-'}</td>
        <td>${r.jamSampling || '-'}</td>
        <td>${r.jamQcOk || '-'}</td>
        <td>${r.jamDiscard || '-'}</td>
      </tr>
    `);
  });

  if (html.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center empty-note">Belum ada data batch</td></tr>';
    return;
  }

  tbody.innerHTML = html.join('');
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

    updateActionButtonsState();
  }, (err) => console.error('Gagal dengerin batchLog:', err));
}

function subscribeLineMeta(lineKey) {
  db.collection('lineMeta').doc(lineKey).onSnapshot((doc) => {
    const data = doc.data();
    shiftStartAt = data && data.shiftStartAt ? data.shiftStartAt.toDate() : null;
    renderBatchLogRows();
  }, (err) => console.error('Gagal dengerin lineMeta:', err));
}

function setLineTitle(lineKey) {
  const title = document.getElementById('lineTitle');
  if (title) title.textContent = LINES[lineKey].name;
}

// ===== RESET =====
function resetShift() {
  const confirmed = confirm('Yakin reset batch? Nomor batch berjalan balik ke awal. Riwayat batch sebelumnya tetap tersimpan.');
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

// ===== INIT =====
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

  // Chat cuma buat operator
  if (getRole() === 'operator') {
    initChat('operator', lineKey);
  }
});