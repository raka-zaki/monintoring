const LINES = {
  A: { name: 'Moccacino', short: 'Mocca', mixers: ['MD 01', 'MD 02', 'ME 03', 'ME 04', 'MPD', 'MPE', 'MF'] },
  B: { name: 'Cappucino', short: 'Cappu', mixers: ['MC 01', 'MC 02', 'MC 03', 'MPC 01', 'MPC 02'] },
};

const MIXER_LABEL_OVERRIDE = { 'A-MF': 'Moccafrio' };
const SPV_PIN = '1234';

const allBatchLogCache = {};
let realtimeUnsubscribe = null;
let isRealtimeMode = true;

// ===== PIN =====
function checkPin() {
  const input = document.getElementById('pinInput').value.trim();
  const errEl = document.getElementById('pinError');

  if (input === SPV_PIN) {
    localStorage.setItem('spvUnlocked', 'true');
    document.getElementById('pinOverlay').classList.add('d-none');
    document.getElementById('spvContent').classList.remove('d-none');
    errEl.classList.add('d-none');
    initSpvPage();
  } else {
    errEl.classList.remove('d-none');
  }
}

function lockAgain() {
  localStorage.removeItem('spvUnlocked');
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

// ===== toast =====
function showSpvToast(message) {
  document.getElementById('spvToastBody').textContent = message;
  bootstrap.Toast.getOrCreateInstance(document.getElementById('spvToast'), { delay: 5000 }).show();
}

// ===== status real-time semua mixer =====
function renderAllMixerGrid() {
  const wrap = document.getElementById('allMixerGrid');
  const iconTpl = document.getElementById('mixerIconTpl').innerHTML;
  wrap.innerHTML = '';

  Object.keys(LINES).forEach((lineKey) => {
    const section = document.createElement('div');
    section.className = 'mb-3';
    section.innerHTML = `<p class="form-label-sm mb-2">${LINES[lineKey].name}</p><div class="row g-3" id="mixerGroup-${lineKey}"></div>`;
    wrap.appendChild(section);

    const row = section.querySelector(`#mixerGroup-${lineKey}`);
    LINES[lineKey].mixers.forEach((mixerName) => {
      const key = `${lineKey}-${mixerName}`;
      const col = document.createElement('div');
      col.className = 'col-6 col-md-3 col-lg-2';
      col.innerHTML = `
        <div class="mixer-card-wrap">
          <span class="mixer-badge" data-mixer-badge="${key}"></span>
          <div class="mixer-card">
            <div class="mixer-card-link">
              <div class="mixer-icon-wrap">${iconTpl}</div>
              <p class="mixer-name">${mixerName}</p>
              <p class="mixer-batch-label mt-2">Batch</p>
              <p class="mixer-batch-value" data-mixer="${key}">-</p>
              <p class="mixer-note" data-mixer-note="${key}">-</p>
            </div>
          </div>
        </div>
      `;
      row.appendChild(col);
    });
  });
}

function subscribeAllMixers() {
  db.collection('mixers').onSnapshot((snapshot) => {
    snapshot.docs.forEach((doc) => {
      const key = doc.id;
      const data = doc.data();
      const batchNumber = data.batchNumberToday || 1;
      const qcApproved = data.qcApproved || false;
      const needsResample = data.needsResample || false;
      const activeId = data.activeBatchLogId;

      const valueEl = document.querySelector(`[data-mixer="${key}"]`);
      if (valueEl) valueEl.textContent = batchNumber;

      let noteText = '-';
      if (activeId) {
        const batchLog = allBatchLogCache[activeId];
        if (batchLog) {
          const sudahTuang = batchLog.jamTuangMikro;
          const sudahSampling = batchLog.jamSampling;
          if (sudahTuang && sudahSampling) {
            noteText = qcApproved ? 'Tuang ✓ · Sampling ✓ · QC ✓' : 'Tuang ✓ · Sampling ✓';
          } else if (sudahTuang) {
            noteText = 'Tuang ✓ · Nunggu Sampling';
          } else if (sudahSampling) {
            noteText = 'Sampling ✓';
          }
        }
      }
      const noteEl = document.querySelector(`[data-mixer-note="${key}"]`);
      if (noteEl) {
        noteEl.textContent = noteText;
        if (noteText.includes('QC ✓')) noteEl.style.color = '#16a34a';
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
    });
  }, (err) => console.error('Gagal dengerin status mixer:', err));
}

// ===== SUBSCRIBE REAL-TIME (limit 200) =====
function subscribeAllBatchLog() {
  if (realtimeUnsubscribe) {
    realtimeUnsubscribe();
    realtimeUnsubscribe = null;
  }

  realtimeUnsubscribe = db.collection('batchLog')
    .orderBy('createdAt', 'desc')
    .limit(200)
    .onSnapshot((snapshot) => {
      if (!isRealtimeMode) return;

      snapshot.docChanges().forEach((change) => {
        if (change.type === 'removed') {
          delete allBatchLogCache[change.doc.id];
          return;
        }
        const data = change.doc.data();
        allBatchLogCache[change.doc.id] = {
          ...data,
          _id: change.doc.id,
          createdAt: data.createdAt ? data.createdAt.toDate() : new Date(),
        };
      });
      renderSpvRekap();
    }, (err) => console.error('Gagal dengerin batchLog:', err));
}

// ===== FETCH BY DATE (histori) =====
async function fetchBatchByDate(isoDate) {
  if (!isoDate) return {};

  const [y, m, d] = isoDate.split('-').map(Number);
  const dateStr = new Date(y, m - 1, d).toLocaleDateString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
  });

  try {
    const snapshot = await db.collection('batchLog')
      .where('tanggal', '==', dateStr)
      .get();

    const data = {};
    snapshot.docs.forEach((doc) => {
      data[doc.id] = {
        ...doc.data(),
        _id: doc.id,
        createdAt: doc.data().createdAt ? doc.data().createdAt.toDate() : new Date(),
      };
    });
    return data;
  } catch (err) {
    console.error('Gagal fetch by date:', err);
    return {};
  }
}

// ===== RIWAYAT + FILTER =====
function isSameDate(date, isoDateStr) {
  if (!isoDateStr) return true;
  const [y, m, d] = isoDateStr.split('-').map(Number);
  return date.getFullYear() === y && date.getMonth() + 1 === m && date.getDate() === d;
}

function sortByBatchNumber(a, b) {
  return (a.batchNumber || 0) - (b.batchNumber || 0);
}

function getMixerOrder(lineKey) {
  return LINES[lineKey] ? LINES[lineKey].mixers : [];
}

function matchProdukFilter(row, produkFilter) {
  if (!produkFilter) return true;
  if (produkFilter === 'A') return row.line === 'A' && row.mixerName !== 'MF';
  if (produkFilter === 'A-MF') return row.line === 'A' && row.mixerName === 'MF';
  if (produkFilter === 'B') return row.line === 'B';
  return true;
}

function matchShiftFilter(row, shiftFilter) {
  if (!shiftFilter) return true;
  return String(row.shift || '') === String(shiftFilter);
}

function getFilteredRows() {
  const selectedDate = document.getElementById('dateFilter').value;
  const produkFilter = document.getElementById('produkFilter').value;
  const shiftFilter = document.getElementById('shiftFilter').value;

  return Object.values(allBatchLogCache)
    .filter((r) => isSameDate(r.createdAt, selectedDate))
    .filter((r) => matchProdukFilter(r, produkFilter))
    .filter((r) => matchShiftFilter(r, shiftFilter));
}

function renderSpvRekap() {
  const tbody = document.getElementById('spvRekapBody');
  const produkFilter = document.getElementById('produkFilter').value;

  const filtered = getFilteredRows();

  const linesToShow = produkFilter === 'A-MF'
    ? [{ lineKey: 'A', mixerOnly: 'MF' }]
    : produkFilter === 'A'
      ? [{ lineKey: 'A', mixerOnly: null, exclude: ['MF'] }]
      : produkFilter === 'B'
        ? [{ lineKey: 'B', mixerOnly: null }]
        : [
            { lineKey: 'A', mixerOnly: null },
            { lineKey: 'B', mixerOnly: null },
          ];

  const html = [];
  let totalRowsRendered = 0;

  linesToShow.forEach(({ lineKey, mixerOnly, exclude }) => {
    const lineInfo = LINES[lineKey];
    let mixerOrder = getMixerOrder(lineKey);

    if (mixerOnly) {
      mixerOrder = mixerOrder.filter((m) => m === mixerOnly);
    }
    if (exclude) {
      mixerOrder = mixerOrder.filter((m) => !exclude.includes(m));
    }

    mixerOrder.forEach((mixerName) => {
      const groupRows = filtered
        .filter((r) => r.line === lineKey && r.mixerName === mixerName)
        .sort(sortByBatchNumber);

      const label = MIXER_LABEL_OVERRIDE[`${lineKey}-${mixerName}`] || lineInfo.short;
      html.push(`
        <tr class="group-header">
          <td colspan="10">${label} · ${mixerName}</td>
        </tr>
      `);

      if (groupRows.length === 0) {
        html.push(`
          <tr>
            <td colspan="10" class="text-center empty-note">Belum ada batch</td>
          </tr>
        `);
        return;
      }

      groupRows.forEach((r) => {
        totalRowsRendered++;
        html.push(`
          <tr>
            <td>${lineInfo.name}</td>
            <td>${r.mixerName}</td>
            <td>${r.tanggal || '-'}</td>
            <td>${r.shift ? 'Shift ' + r.shift : '-'}</td>
            <td>${r.jamTuangMikro || '-'}</td>
            <td>${r.jamSampling || '-'}</td>
            <td>${r.jamQcOk || '-'}</td>
            <td>${r.jamDiscard || '-'}</td>
            <td>${r.batchNumber}</td>
            <td><button type="button" class="btn-edit" onclick="openEditBatchModal('${r._id}')">✏️ Edit</button></td>
          </tr>
        `);
      });
    });
  });

  if (totalRowsRendered === 0 && html.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" class="text-center empty-note">Belum ada data buat filter ini</td></tr>';
    return;
  }

  tbody.innerHTML = html.join('');
}

// ===== DOWNLOAD EXCEL (cuma hari itu, warna per mixer) =====
async function downloadSpvSpreadsheet() {
  const selectedDate = document.getElementById('dateFilter').value;

  if (!selectedDate) {
    showSpvToast('Pilih tanggal dulu.');
    return;
  }

  const [y, m, d] = selectedDate.split('-').map(Number);
  const dateStr = new Date(y, m - 1, d).toLocaleDateString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
  });

  try {
    const snapshot = await db.collection('batchLog')
      .where('tanggal', '==', dateStr)
      .get();

    if (snapshot.empty) {
      showSpvToast('Belum ada data buat tanggal ini.');
      return;
    }

    const data = snapshot.docs.map((doc) => ({ ...doc.data(), _id: doc.id }));

    const produkFilter = document.getElementById('produkFilter').value;
    const shiftFilter = document.getElementById('shiftFilter').value;

    const filtered = data.filter((r) => {
      if (produkFilter === 'A' && !(r.line === 'A' && r.mixerName !== 'MF')) return false;
      if (produkFilter === 'A-MF' && !(r.line === 'A' && r.mixerName === 'MF')) return false;
      if (produkFilter === 'B' && r.line !== 'B') return false;
      if (shiftFilter && String(r.shift) !== String(shiftFilter)) return false;
      return true;
    });

    if (filtered.length === 0) {
      showSpvToast('Belum ada data buat filter ini.');
      return;
    }

    const rows = [];
    Object.keys(LINES).forEach((lineKey) => {
      const lineInfo = LINES[lineKey];
      getMixerOrder(lineKey).forEach((mixerName) => {
        filtered
          .filter((r) => r.line === lineKey && r.mixerName === mixerName)
          .sort(sortByBatchNumber)
          .forEach((r) => {
            rows.push([
              lineInfo.name,
              r.mixerName,
              r.tanggal || '-',
              r.shift ? 'Shift ' + r.shift : '-',
              r.jamTuangMikro || '-',
              r.jamSampling || '-',
              r.jamQcOk || '-',
              r.jamDiscard || '-',
              r.batchNumber,
            ]);
          });
      });
    });

    const header = ['Produk', 'Mixer', 'Tanggal', 'Shift', 'Jam Tuang Mikro', 'Jam Sampling', 'Jam QC OK', 'Jam Discharge', 'Batch'];
    const aoa = [header, ...rows];

    const worksheet = XLSX.utils.aoa_to_sheet(aoa);
    worksheet['!cols'] = [
      { wch: 22 }, { wch: 12 }, { wch: 14 }, { wch: 10 },
      { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 8 },
    ];

    // ===== WARNA PER MIXER =====
    const MIXER_COLORS = {
      'MD 01':  'D6E4F0', // biru muda
      'MD 02':  'D6F0D6', // hijau muda
      'ME 03':  'FFF2CC', // kuning muda
      'ME 04':  'FCE4D6', // oranye muda
      'MPD':    'E4D6F0', // ungu muda
      'MPE':    'D6F0F0', // cyan muda
      'MF':     'F0D6E4', // pink muda
      'MC 01':  'F0E4D6', // coklat muda
      'MC 02':  'D6F0E4', // hijau tosca
      'MC 03':  'E0E0F0', // lavender
      'MPC 01': 'F0E0D6', // peach
      'MPC 02': 'F0D6D6', // salmon
    };

    const range = XLSX.utils.decode_range(worksheet['!ref']);

    // Header style
    for (let C = range.s.c; C <= range.e.c; C++) {
      const cell = worksheet[XLSX.utils.encode_cell({ r: 0, c: C })];
      if (!cell) continue;
      cell.s = {
        font: { bold: true, color: { rgb: 'FFFFFF' } },
        fill: { fgColor: { rgb: '5C4433' } },
        alignment: { horizontal: 'center', vertical: 'center' },
        border: {
          top: { style: 'thin', color: { rgb: '3B2A20' } },
          bottom: { style: 'thin', color: { rgb: '3B2A20' } },
          left: { style: 'thin', color: { rgb: '3B2A20' } },
          right: { style: 'thin', color: { rgb: '3B2A20' } },
        },
      };
    }

    // Data rows — warna per mixer
    for (let R = range.s.r + 1; R <= range.e.r; R++) {
      const mixerCell = worksheet[XLSX.utils.encode_cell({ r: R, c: 1 })];
      if (!mixerCell) continue;

      const fillColor = MIXER_COLORS[mixerCell.v] || 'FFFFFF';

      for (let C = range.s.c; C <= range.e.c; C++) {
        const cell = worksheet[XLSX.utils.encode_cell({ r: R, c: C })];
        if (!cell) continue;

        cell.s = {
          fill: { fgColor: { rgb: fillColor } },
          alignment: { vertical: 'center' },
          border: {
            top: { style: 'thin', color: { rgb: 'CCCCCC' } },
            bottom: { style: 'thin', color: { rgb: 'CCCCCC' } },
            left: { style: 'thin', color: { rgb: 'CCCCCC' } },
            right: { style: 'thin', color: { rgb: 'CCCCCC' } },
          },
        };
      }
    }

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Rekap SPV');

    const tanggalFormatted = new Date(selectedDate).toLocaleDateString('id-ID', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
    XLSX.writeFile(workbook, `Data Riwayat Batch - ${tanggalFormatted}.xlsx`);
  } catch (err) {
    console.error('Gagal download:', err);
    showSpvToast('❌ Gagal download. Coba lagi.');
  }
}

// ===== EDIT BATCH =====
let editBatchTargetId = null;

function openEditBatchModal(batchLogId) {
  const batchLog = allBatchLogCache[batchLogId];
  if (!batchLog) {
    showSpvToast('Data batch tidak ditemukan.');
    return;
  }

  editBatchTargetId = batchLogId;

  document.getElementById('editBatchTitle').textContent = `${batchLog.mixerName} · Batch ${batchLog.batchNumber}`;
  document.getElementById('editTanggal').value = batchLog.tanggal || '';
  document.getElementById('editShift').value = batchLog.shift || '1';
  document.getElementById('editJamTuang').value = batchLog.jamTuangMikro || '';
  document.getElementById('editJamSampling').value = batchLog.jamSampling || '';
  document.getElementById('editJamQcOk').value = batchLog.jamQcOk || '';
  document.getElementById('editJamDiscard').value = batchLog.jamDiscard || '';

  bootstrap.Modal.getOrCreateInstance(document.getElementById('editBatchModal')).show();
}

function confirmEditBatch() {
  if (!editBatchTargetId) return;

  const confirmed = confirm('Yakin simpan perubahan ini?');
  if (!confirmed) return;

  const newTanggal = document.getElementById('editTanggal').value.trim();
  const newShift = document.getElementById('editShift').value;
  const newJamTuang = document.getElementById('editJamTuang').value.trim();
  const newJamSampling = document.getElementById('editJamSampling').value.trim();
  const newJamQcOk = document.getElementById('editJamQcOk').value.trim();
  const newJamDiscard = document.getElementById('editJamDiscard').value.trim();

  db.collection('batchLog').doc(editBatchTargetId).update({
    tanggal: newTanggal || null,
    shift: newShift || null,
    jamTuangMikro: newJamTuang || null,
    jamSampling: newJamSampling || null,
    jamQcOk: newJamQcOk || null,
    jamDiscard: newJamDiscard || null,
  }).then(() => {
    bootstrap.Modal.getOrCreateInstance(document.getElementById('editBatchModal')).hide();
    showSpvToast('✅ Perubahan berhasil disimpan.');
  }).catch((err) => {
    console.error('Gagal edit batch:', err);
    showSpvToast('❌ Gagal simpan. Coba lagi.');
  });
}

// ===== INIT =====
function initSpvPage() {
  const dateInput = document.getElementById('dateFilter');
  const today = new Date().toISOString().slice(0, 10);
  dateInput.value = today;

  dateInput.addEventListener('change', async () => {
    const isoDate = dateInput.value;

    if (isoDate === today) {
      // Balik ke mode real-time
      isRealtimeMode = true;
      Object.keys(allBatchLogCache).forEach((k) => delete allBatchLogCache[k]);
      subscribeAllBatchLog();
    } else {
      // Mode histori
      isRealtimeMode = false;
      if (realtimeUnsubscribe) {
        realtimeUnsubscribe();
        realtimeUnsubscribe = null;
      }

      const data = await fetchBatchByDate(isoDate);
      Object.keys(allBatchLogCache).forEach((k) => delete allBatchLogCache[k]);
      Object.assign(allBatchLogCache, data);
      renderSpvRekap();
    }
  });

  document.getElementById('produkFilter').addEventListener('change', renderSpvRekap);
  document.getElementById('shiftFilter').addEventListener('change', renderSpvRekap);

  renderAllMixerGrid();
  startClock();
  subscribeAllMixers();
  subscribeAllBatchLog();
}

document.addEventListener('DOMContentLoaded', () => {
  if (localStorage.getItem('spvUnlocked') === 'true') {
    document.getElementById('pinOverlay').classList.add('d-none');
    document.getElementById('spvContent').classList.remove('d-none');
    initSpvPage();
  }
});