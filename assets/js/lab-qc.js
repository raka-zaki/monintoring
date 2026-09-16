const LINES = {
  A: { name: 'Moccacino & Moccafrio', short: 'Mocca', mixers: ['MD 01', 'MD 02', 'ME 03', 'ME 04', 'MPD', 'MPE', 'MF'] },
  B: { name: 'Cappucino', short: 'Cappu', mixers: ['MC 01', 'MC 02', 'MC 03', 'MPC 01', 'MPC 02'] },
};

const MIXER_LABEL_OVERRIDE = { 'A-MF': 'Moccafrio' };
const LAB_QC_PIN = '1234';

const allMixerCache = {};
const allBatchLogCache = {};
const selectedMixers = new Set();

const lastKnownInfoTurun = {};

// ===== PIN =====
function checkPin() {
  const input = document.getElementById('pinInput').value.trim();
  const errEl = document.getElementById('pinError');

  if (input === LAB_QC_PIN) {
    localStorage.setItem('labQcUnlocked', 'true');
    document.getElementById('pinOverlay').classList.add('d-none');
    document.getElementById('labQcContent').classList.remove('d-none');
    errEl.classList.add('d-none');
    initLabQcPage();
  } else {
    errEl.classList.remove('d-none');
  }
}

function lockAgain() {
  localStorage.removeItem('labQcUnlocked');
  location.reload();
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

function formatJam(date) {
  return date.toLocaleTimeString('id-ID', { hour12: false, hour: '2-digit', minute: '2-digit' });
}

function formatTanggal(date) {
  return date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

function mixerDocRef(key) {
  return db.collection('mixers').doc(key);
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
  return mixerName.split('').map((c) => {
    if (c === ' ') return ' ';
    return HURUF_SPOKEN[c.toUpperCase()] || c;
  }).join(' ');
}
function speakAlert(text) {
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'id-ID';
  speechSynthesis.speak(u);
}

// ===== toast =====
function showLabToast(message) {
  document.getElementById('labToastBody').textContent = message;
  bootstrap.Toast.getOrCreateInstance(document.getElementById('labToast'), { delay: 5000 }).show();
}

// ===== notif pas info turun masuk =====
function notifyLabInfoTurun(mixerName) {
  const spokenMixerName = formatSpokenMixer(mixerName);
  speakAlert(`Campuran turun, ${spokenMixerName}`);
  showLabToast(`⚠️ Campuran turun, ${mixerName}. Klik "Terima" kalau sudah sampai.`);
}

// ===== render grid card =====
function renderAllMixerGrid() {
  const wrap = document.getElementById('allMixerGrid');
  const iconTpl = document.getElementById('mixerIconTpl').innerHTML;
  wrap.innerHTML = '';

  Object.keys(LINES).forEach((lineKey) => {
    const section = document.createElement('div');
    section.className = 'mb-3';
    section.innerHTML = `<p class="form-label-sm mb-2">${LINES[lineKey].name}</p><div class="row g-2" id="mixerGroup-${lineKey}"></div>`;
    wrap.appendChild(section);

    const row = section.querySelector(`#mixerGroup-${lineKey}`);
    LINES[lineKey].mixers.forEach((mixerName) => {
      const key = `${lineKey}-${mixerName}`;
      const col = document.createElement('div');
      col.className = 'col-4 col-md-3 col-lg-2';

      col.innerHTML = `
        <div class="mixer-card-wrap">
          <span class="mixer-badge" data-mixer-badge="${key}"></span>
          <div class="mixer-card-select" data-mixer-select="${key}" onclick="toggleMixerSelect('${key}')">
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
      row.appendChild(col);
    });
  });
}

// ===== update card =====
function updateMixerCard(key, data) {
  const batchNumber = data.batchNumberToday || 1;
  const activeId = data.activeBatchLogId;
  const qcApproved = data.qcApproved || false;
  const needsResample = data.needsResample || false;
  const infoTurun = data.infoTurunRequested || false;
  const diterimaLab = data.diterimaLab || false;

  const valueEl = document.querySelector(`[data-mixer="${key}"]`);
  if (valueEl) valueEl.textContent = batchNumber;

  let noteText = '-';
  if (activeId) {
    const batchLog = allBatchLogCache[activeId];
    if (batchLog) {
      const sudahTuang = batchLog.jamTuangMikro;
      const sudahSampling = batchLog.jamSampling;

      if (diterimaLab) {
        noteText = 'Campuran diterima';
      } else if (infoTurun) {
        noteText = 'Campuran turun';
      } else if (sudahTuang && sudahSampling) {
        noteText = qcApproved ? 'Tuang ✓ · Sampling ✓ · QC ✓' : 'Tuang ✓ · Sampling ✓';
      } else if (sudahTuang) {
        noteText = 'Tuang ✓ · belum Sampling';
      } else if (sudahSampling) {
        noteText = 'Sampling ✓';
      }
    }
  }

  const noteEl = document.querySelector(`[data-mixer-note="${key}"]`);
  if (noteEl) {
    noteEl.textContent = noteText;
    if (noteText.includes('Campuran diterima')) noteEl.style.color = '#16a34a';
    else if (noteText.includes('Campuran turun')) noteEl.style.color = '#0ea5e9';
    else if (noteText.includes('QC ✓')) noteEl.style.color = '#16a34a';
    else if (noteText.includes('Sampling ✓')) noteEl.style.color = '#0ea5e9';
    else if (noteText.includes('Tuang ✓')) noteEl.style.color = '#f59e0b';
    else noteEl.style.color = '#64748b';
  }

  const badge = document.querySelector(`[data-mixer-badge="${key}"]`);
  if (badge) {
    if (qcApproved) {
      badge.textContent = '✓';
      badge.className = 'mixer-badge mixer-badge-ok';
    } else if (needsResample) {
      badge.textContent = '✗';
      badge.className = 'mixer-badge mixer-badge-ulang';
    } else {
      badge.textContent = '';
      badge.className = 'mixer-badge';
    }
  }
}

// ===== MULTI SELECT =====
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

// ===== RENDER TOMBOL ACTION =====
function renderActionButtons() {
  const container = document.getElementById('actionButtons');
  if (!container) return;

  container.innerHTML = `
    <button type="button" class="btn-action btn-action-terima" onclick="handleBulkTerima()">Terima</button>
    <button type="button" class="btn-action btn-action-ok" onclick="handleBulkOk()">OK</button>
    <button type="button" class="btn-action btn-action-ulang" onclick="handleBulkUlang()">Ulang</button>
  `;

  updateActionButtonsState();
}

function updateActionButtonsState() {
  const hasSelected = selectedMixers.size > 0;

  document.querySelectorAll('.btn-action').forEach((btn) => {
    if (!hasSelected) {
      btn.disabled = true;
      btn.style.opacity = '0.4';
      btn.style.cursor = 'not-allowed';
    } else {
      btn.disabled = false;
      btn.style.opacity = '1';
      btn.style.cursor = 'pointer';
    }
  });
}

// ===== BULK TERIMA =====
function handleBulkTerima() {
  if (selectedMixers.size === 0) {
    showLabToast('Pilih mixer dulu.');
    return;
  }

  const selectedArr = Array.from(selectedMixers);
  const valid = [];
  const invalid = [];

  selectedArr.forEach((key) => {
    const data = allMixerCache[key];
    if (!data) { invalid.push(key); return; }

    if (!data.infoTurunRequested) {
      invalid.push(key);
      return;
    }
    if (data.diterimaLab) {
      invalid.push(key);
      return;
    }
    valid.push(key);
  });

  if (valid.length === 0) {
    showLabToast(`⚠️ Tidak ada mixer yang bisa diterima.`);
    return;
  }

  const confirmed = confirm(`Terima ${valid.length} mixer?`);
  if (!confirmed) return;

  const promises = valid.map((key) =>
    mixerDocRef(key).set({ diterimaLab: true }, { merge: true })
  );

  Promise.all(promises).then(() => {
    let msg = `✅ ${valid.length} mixer campuran diterima.`;
    if (invalid.length > 0) msg += ` (${invalid.length} di-skip)`;
    showLabToast(msg);
    clearAllSelected();
  }).catch((err) => {
    console.error('Gagal bulk terima:', err);
    showLabToast('❌ Sebagian gagal. Cek console.');
  });
}

// ===== BULK OK =====
function handleBulkOk() {
  if (selectedMixers.size === 0) {
    showLabToast('Pilih mixer dulu.');
    return;
  }

  const selectedArr = Array.from(selectedMixers);
  const valid = [];
  const invalid = [];

  selectedArr.forEach((key) => {
    const data = allMixerCache[key];
    if (!data) { invalid.push(key); return; }

    const activeId = data.activeBatchLogId;
    const batchLog = activeId ? allBatchLogCache[activeId] : null;

    if (!activeId || !batchLog || !batchLog.jamSampling || !data.diterimaLab) {
      invalid.push(key);
      return;
    }

    valid.push({ key, activeId });
  });

  if (valid.length === 0) {
    showLabToast(`⚠️ Tidak ada mixer yang bisa di-OK.`);
    return;
  }

  const confirmed = confirm(`OK ${valid.length} mixer?`);
  if (!confirmed) return;

  const promises = valid.map(({ key, activeId }) => doQcOk(key, activeId));

  Promise.all(promises).then(() => {
    let msg = `✅ ${valid.length} mixer sudah di-OK.`;
    if (invalid.length > 0) msg += ` (${invalid.length} di-skip)`;
    showLabToast(msg);
    clearAllSelected();
  }).catch((err) => {
    console.error('Gagal bulk OK:', err);
    showLabToast('❌ Sebagian gagal. Cek console.');
  });
}

// ===== BULK ULANG =====
function handleBulkUlang() {
  if (selectedMixers.size === 0) {
    showLabToast('Pilih mixer dulu.');
    return;
  }

  const selectedArr = Array.from(selectedMixers);
  const valid = [];
  const invalid = [];

  selectedArr.forEach((key) => {
    const data = allMixerCache[key];
    if (!data) { invalid.push(key); return; }

    const activeId = data.activeBatchLogId;
    const batchLog = activeId ? allBatchLogCache[activeId] : null;

    if (!activeId || !batchLog || !batchLog.jamSampling || !data.diterimaLab) {
      invalid.push(key);
      return;
    }

    valid.push({ key, activeId });
  });

  if (valid.length === 0) {
    showLabToast(`⚠️ Tidak ada mixer yang bisa di-Ulang.`);
    return;
  }

  const confirmed = confirm(`Ulang ${valid.length} mixer? Campuran dianggap tidak OK.`);
  if (!confirmed) return;

  const promises = valid.map(({ key, activeId }) => doQcUlang(key, activeId));

  Promise.all(promises).then(() => {
    let msg = `⚠️ ${valid.length} mixer minta sampling ulang.`;
    if (invalid.length > 0) msg += ` (${invalid.length} di-skip)`;
    showLabToast(msg);
    clearAllSelected();
  }).catch((err) => {
    console.error('Gagal bulk Ulang:', err);
    showLabToast('❌ Sebagian gagal. Cek console.');
  });
}

// ===== AKSI OK =====
function doQcOk(key, activeId) {
  const now = new Date();
  const jam = formatJam(now);

  return db.collection('batchLog').doc(activeId).update({
    jamQcOk: jam,
    qcApproved: true,
    needsResample: false,
  }).then(() => {
    return mixerDocRef(key).set({
      qcApproved: true,
      needsResample: false,
    }, { merge: true });
  });
}

// ===== AKSI ULANG =====
function doQcUlang(key, activeId) {
  const now = new Date();
  const jam = formatJam(now);

  return db.collection('batchLog').doc(activeId).update({
    qcApproved: false,
    needsResample: true,
    jamQcUlang: firebase.firestore.FieldValue.arrayUnion(jam),
  }).then(() => {
    return mixerDocRef(key).set({
      qcApproved: false,
      needsResample: true,
      infoTurunRequested: false,
      diterimaLab: false,
    }, { merge: true });
  });
}

// ===== RIWAYAT + FILTER (buat download Excel) =====
function isSameDate(date, isoDateStr) {
  if (!isoDateStr) return true;
  const [y, m, d] = isoDateStr.split('-').map(Number);
  return date.getFullYear() === y && date.getMonth() + 1 === m && date.getDate() === d;
}
function sortByBatchNumber(a, b) { return (a.batchNumber || 0) - (b.batchNumber || 0); }
function getMixerOrder(lineKey) { return LINES[lineKey] ? LINES[lineKey].mixers : []; }
function matchProdukFilter(row, f) {
  if (!f) return true;
  if (f === 'A') return row.line === 'A' && row.mixerName !== 'MF';
  if (f === 'A-MF') return row.line === 'A' && row.mixerName === 'MF';
  if (f === 'B') return row.line === 'B';
  return true;
}
function matchShiftFilter(row, f) {
  if (!f) return true;
  return String(row.shift || '') === String(f);
}
function getFilteredRows() {
  const d = document.getElementById('dateFilter').value;
  const p = document.getElementById('produkFilter').value;
  const s = document.getElementById('shiftFilter').value;
  return Object.values(allBatchLogCache)
    .filter((r) => isSameDate(r.createdAt, d))
    .filter((r) => matchProdukFilter(r, p))
    .filter((r) => matchShiftFilter(r, s));
}

function downloadLabQcSpreadsheet() {
  const selectedDate = document.getElementById('dateFilter').value;
  const filtered = getFilteredRows();
  if (filtered.length === 0) { showLabToast('Belum ada data.'); return; }

  const rows = [];
  Object.keys(LINES).forEach((lineKey) => {
    const lineInfo = LINES[lineKey];
    getMixerOrder(lineKey).forEach((mixerName) => {
      filtered.filter((r) => r.line === lineKey && r.mixerName === mixerName)
        .sort(sortByBatchNumber)
        .forEach((r) => {
          rows.push([lineInfo.name, r.mixerName, r.tanggal || '-', r.shift ? 'Shift ' + r.shift : '-', r.jamTuangMikro || '-', r.jamSampling || '-', r.jamQcOk || '-', r.jamDiscard || '-', r.batchNumber]);
        });
    });
  });

  const header = ['Produk', 'Mixer', 'Tanggal', 'Shift', 'Jam Tuang Mikro', 'Jam Sampling', 'Jam QC OK', 'Jam Discharge', 'Batch'];
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  ws['!cols'] = [{ wch: 22 }, { wch: 12 }, { wch: 14 }, { wch: 10 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 8 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Lab QC');
  const tanggalFormatted = selectedDate
    ? new Date(selectedDate).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
    : 'semua tanggal';
  XLSX.writeFile(wb, `Data Riwayat Batch - ${tanggalFormatted}.xlsx`);
}

// ===== subscribe =====
function subscribeAllMixers() {
  db.collection('mixers').onSnapshot((snapshot) => {
    snapshot.docs.forEach((doc) => {
      const key = doc.id;
      const data = doc.data();
      allMixerCache[key] = data;
      updateMixerCard(key, data);
    });

    // Detect infoTurunRequested false → true
    snapshot.docChanges().forEach((change) => {
      const key = change.doc.id;
      const data = change.doc.data();
      const mixerName = data.mixerName;
      const newInfoTurun = data.infoTurunRequested || false;
      const prevInfoTurun = lastKnownInfoTurun[key];

      if (prevInfoTurun === false && newInfoTurun === true) {
        notifyLabInfoTurun(mixerName);
      }

      lastKnownInfoTurun[key] = newInfoTurun;
    });
  }, (err) => console.error('Gagal dengerin mixers:', err));
}

function subscribeAllBatchLog() {
  db.collection('batchLog').onSnapshot((snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'removed') {
        delete allBatchLogCache[change.doc.id];
        return;
      }
      const data = change.doc.data();
      allBatchLogCache[change.doc.id] = {
        ...data,
        createdAt: data.createdAt ? data.createdAt.toDate() : new Date(),
      };
    });

    Object.keys(allMixerCache).forEach((key) => {
      updateMixerCard(key, allMixerCache[key]);
    });
  }, (err) => console.error('Gagal dengerin batchLog:', err));
}

function initLabQcPage() {
  const dateInput = document.getElementById('dateFilter');
  dateInput.value = new Date().toISOString().slice(0, 10);

  renderAllMixerGrid();
  renderActionButtons();
  startClock();
  subscribeAllMixers();
  subscribeAllBatchLog();
}

document.addEventListener('DOMContentLoaded', () => {
  if (localStorage.getItem('labQcUnlocked') === 'true') {
    document.getElementById('pinOverlay').classList.add('d-none');
    document.getElementById('labQcContent').classList.remove('d-none');
    initLabQcPage();
    initChat('lab-qc');
  }
});