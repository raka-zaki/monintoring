const LINES = {
  A: { name: 'Moccacino', short: 'Mocca', mixers: ['MD 01', 'MD 02', 'ME 03', 'ME 04', 'MPD', 'MPE', 'MF'] },
  B: { name: 'Cappucino', short: 'Cappu', mixers: ['MC 01', 'MC 02', 'MC 03', 'MPC 01', 'MPC 02'] },
};

// Label khusus per mixer (override `short` di header grup)
const MIXER_LABEL_OVERRIDE = {
  'A-MF': 'Moccafrio',
};

// Ganti PIN ini sesuka lo. INGET: ini cuma proteksi level tampilan doang,
// bukan keamanan beneran (kode ini kebaca semua orang yang buka "View Source").
const SPV_PIN = '1234';

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

// ===== status real-time semua mixer, 2 line sekaligus =====

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
        <div class="mixer-card">
          <div class="mixer-card-link">
            <div class="mixer-icon-wrap">${iconTpl}</div>
            <p class="mixer-name">${mixerName}</p>
            <p class="mixer-batch-label mt-2">Batch</p>
            <p class="mixer-batch-value" data-mixer="${key}">-</p>
          </div>
        </div>
      `;
      row.appendChild(col);
    });
  });
}

function subscribeAllMixers() {
  db.collection('mixers').onSnapshot((snapshot) => {
    snapshot.docChanges().forEach((change) => {
      const key = change.doc.id;
      const data = change.doc.data();
      const status = data.status || 'idle';

      const badge = document.getElementById(`status-${key}`);
      if (badge) {
        badge.textContent = status === 'menunggu' ? 'Menunggu QC' : 'Idle';
        badge.className = `status-pill ${status === 'menunggu' ? 'status-tidak' : 'status-belum-qc'}`;
      }

      const valueEl = document.querySelector(`[data-mixer="${key}"]`);
      if (valueEl) valueEl.textContent = data.batchNumberToday || '-';
    });
  }, (err) => console.error('Gagal dengerin status mixer:', err));
}

// ===== riwayat batch gabungan + filter tanggal / produk / shift =====

const allBatchLogCache = {};

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

// Cek apakah 1 row lolos filter produk
// produkFilter nilainya: '' | 'A' | 'A-MF' | 'B'
function matchProdukFilter(row, produkFilter) {
  if (!produkFilter) return true;
  if (produkFilter === 'A') {
    // Mocca = line A, tapi MF dikecualikan
    return row.line === 'A' && row.mixerName !== 'MF';
  }
  if (produkFilter === 'A-MF') {
    return row.line === 'A' && row.mixerName === 'MF';
  }
  if (produkFilter === 'B') {
    return row.line === 'B';
  }
  return true;
}

// Cek apakah 1 row lolos filter shift
function matchShiftFilter(row, shiftFilter) {
  if (!shiftFilter) return true;
  return String(row.shift || '') === String(shiftFilter);
}

// Ambil semua row yang lolos semua filter
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

  // Tentukan line mana aja yang perlu ditampilkan (biar grup kosong gak muncul kalau gak relevan)
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

      // Header grup — pakai override kalau ada
      const label = MIXER_LABEL_OVERRIDE[`${lineKey}-${mixerName}`] || lineInfo.short;
      html.push(`
        <tr class="group-header">
          <td colspan="7">${label} · ${mixerName}</td>
        </tr>
      `);

      if (groupRows.length === 0) {
        html.push(`
          <tr>
            <td colspan="7" class="text-center empty-note">Belum ada batch</td>
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
            <td>${r.batchNumber}</td>
          </tr>
        `);
      });
    });
  });

  if (totalRowsRendered === 0 && html.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center empty-note">Belum ada data buat filter ini</td></tr>';
    return;
  }

  tbody.innerHTML = html.join('');
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
    renderSpvRekap();
  }, (err) => console.error('Gagal dengerin batchLog:', err));
}

function downloadSpvSpreadsheet() {
  const selectedDate = document.getElementById('dateFilter').value;
  const filtered = getFilteredRows();

  if (filtered.length === 0) {
    alert('Belum ada data buat filter ini.');
    return;
  }

  // Susun urut: Line -> Mixer -> Batch (flat, tanpa header grup)
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
            r.batchNumber,
          ]);
        });
    });
  });

  const header = ['Produk', 'Mixer', 'Tanggal', 'Shift', 'Jam Tuang Mikro', 'Jam Sampling', 'Batch'];
  const aoa = [header, ...rows];

  const worksheet = XLSX.utils.aoa_to_sheet(aoa);
  worksheet['!cols'] = [
    { wch: 22 }, { wch: 12 }, { wch: 14 }, { wch: 10 }, { wch: 16 }, { wch: 14 }, { wch: 8 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Rekap SPV');

  const produkVal = document.getElementById('produkFilter').value || 'semua';
  const shiftVal = document.getElementById('shiftFilter').value || 'semua';
  XLSX.writeFile(workbook, `rekap-spv-${selectedDate || 'semua-tanggal'}-${produkVal}-${shiftVal}.xlsx`);
}

function initSpvPage() {
  const dateInput = document.getElementById('dateFilter');
  dateInput.value = new Date().toISOString().slice(0, 10);
  dateInput.addEventListener('change', renderSpvRekap);

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