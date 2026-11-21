(function () {
  'use strict';

  const PANELS = {
    'p-revenue': { root: 'revenueDashboard', title: 'Revenue dashboard' },
    'p-payers': { root: 'payerDashboard', title: 'Payer dashboard' },
    'p-consultants': { root: 'consultantDashboard', title: 'Consultant dashboard' },
    'p-mkacq': { root: 'mkAcqDashboard', title: 'Patient acquisition' },
    'p-ipbill': { root: 'ipBillingDashboard', title: 'IP billing' },
    'p-erbill': { root: 'erBillingDashboard', title: 'ER module billing' },
    'p-pharmbill': { root: 'pharmacyBillingDashboard', title: 'Pharmacy billing' }
  };
  const GROUPS = Object.keys(PANELS).concat(['p-marketing', 'p-mkexec', 'p-mkrec', 'p-clov', 'p-clar', 'p-clpy', 'p-clrec', 'p-brc', 'p-newdoc', 'p-bdov', 'p-bdfc', 'p-bddp', 'p-bdwd']);
  const logoSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 210 56"><circle cx="27" cy="28" r="17" fill="#22c7c9"/><path d="M27 18v20M17 28h20" fill="none" stroke="#fff" stroke-linecap="round" stroke-width="4"/><text x="50" y="30" fill="#0f1731" font-family="Arial,sans-serif" font-size="25" font-weight="700">Presco</text><text x="51" y="42" fill="#0f766e" font-family="Arial,sans-serif" font-size="7" font-weight="700" letter-spacing="1">HOSPITAL OPERATING SYSTEM</text></svg>';
  const logoSrc = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(logoSvg);
  document.querySelectorAll('img[alt="Srikara Hospitals"]').forEach(img => {
    img.src = logoSrc;
    img.alt = 'Presco - Hospital Operating System';
  });
  const FILTERS = {};
  const GRAINS = { 'p-revenue': 'day' };
  let runtime = { data: null, store: null, getBillRows: null };
  const money = n => Number.isFinite(n)
    ? '₹' + Math.round(n).toLocaleString('en-IN')
    : '—';
  const integer = n => Number.isFinite(n) ? Math.round(n).toLocaleString('en-IN') : '—';
  const number = n => {
    const v = Number(n);
    return Number.isFinite(v) ? v : 0;
  };
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[ch]);
  const text = value => String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  const norm = value => text(value).toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const unique = values => Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));
  const uniqueLabels = values => {
    const labels = new Map();
    values.map(text).filter(Boolean).forEach(value => {
      const key = norm(value);
      if (key && !labels.has(key)) labels.set(key, value);
    });
    return Array.from(labels.values()).sort((a, b) => a.localeCompare(b));
  };
  const iso = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value) : '';
  const addDays = (date, amount) => {
    const d = new Date(date + 'T00:00:00');
    d.setDate(d.getDate() + amount);
    return d.toISOString().slice(0, 10);
  };

  function allBillRows() {
    return typeof runtime.getBillRows === 'function' ? runtime.getBillRows() : [];
  }

  function latestDate() {
    const store = runtime.store || {};
    const dates = [runtime.data && runtime.data.asOf];
    ['opBills', 'adm', 'disc', 'opdDays'].forEach(key => {
      (store[key] || []).forEach(row => dates.push(row.date, row.ddate));
    });
    ((store.btReg && store.btReg.loads) || []).forEach(load => dates.push(load.to));
    return dates.map(iso).filter(Boolean).sort().pop() || new Date().toISOString().slice(0, 10);
  }

  function defaultFilters(panel) {
    const end = latestDate();
    return {
      from: addDays(end, -29),
      to: end,
      branch: '',
      department: '',
      consultant: '',
      type: '',
      payer: '',
      grain: GRAINS[panel] || 'month'
    };
  }

  function optionList(values, selected, allLabel) {
    return `<option value="">${esc(allLabel)}</option>` + values.map(value =>
      `<option value="${esc(value)}"${value === selected ? ' selected' : ''}>${esc(value)}</option>`
    ).join('');
  }

  function branchOptions() {
    const store = runtime.store || {};
    const values = [];
    (store.opBills || []).forEach(row => values.push(row.loc));
    (store.adm || []).forEach(row => values.push(row.loc));
    (store.disc || []).forEach(row => values.push(row.loc));
    (store.opdDays || []).forEach(day => values.push(...Object.keys(day.locs || {})));
    allBillRows().forEach(row => values.push(row.loc));
    return uniqueLabels(values);
  }

  function departmentOptions() {
    const departments = (runtime.data && runtime.data.depts) || [];
    if (departments.length) return uniqueLabels(departments.map(row => row.name));
    const values = [];
    ((runtime.data && runtime.data.doctors) || []).forEach(row => values.push(row.dept));
    allBillRows().forEach(row => values.push(row.dept));
    (runtime.store && runtime.store.opdDays || []).forEach(day =>
      Object.keys(day.depts || {}).forEach(value => values.push(value))
    );
    return uniqueLabels(values);
  }

  function sourceConsultants() {
    const values = [];
    allBillRows().forEach(row => values.push(row.doc));
    (runtime.store && runtime.store.adm || []).forEach(row => values.push(row.cons));
    return uniqueLabels(values);
  }

  function filtersFor(panel) {
    const root = document.getElementById(PANELS[panel].root);
    const previous = FILTERS[panel] || defaultFilters(panel);
    if (!root) return previous;
    const next = Object.assign({}, previous);
    root.querySelectorAll('[data-filter]').forEach(control => {
      next[control.dataset.filter] = control.value;
    });
    return next;
  }

  function field(label, key, value, type) {
    return `<div class="mgmt-field"><label>${esc(label)}</label>
      <input type="${type || 'text'}" data-filter="${key}" aria-label="${esc(label)}" value="${esc(value)}"></div>`;
  }

  function selectField(label, key, value, values, allLabel) {
    return `<div class="mgmt-field"><label>${esc(label)}</label>
      <select data-filter="${key}" aria-label="${esc(label)}">${optionList(values, value, allLabel)}</select></div>`;
  }

  function controls(panel, filters, options) {
    const departments = options.departments || [];
    const branches = options.branches || [];
    const consultants = options.consultants || [];
    const payers = options.payers || [];
    const types = options.types || [];
    return `<div class="mgmt-controls">
      ${field('From', 'from', filters.from, 'date')}
      ${field('To', 'to', filters.to, 'date')}
      ${selectField('Branch', 'branch', filters.branch, branches, 'All branches')}
      ${departments.length ? selectField('Department', 'department', filters.department, departments, 'All departments') : ''}
      ${options.consultant !== false ? `<div class="mgmt-field"><label for="${panel}-consultant">Consultant</label>
        <input id="${panel}-consultant" type="search" data-filter="consultant" list="${panel}-consultants"
          value="${esc(filters.consultant)}" placeholder="All consultants" autocomplete="off">
        <datalist id="${panel}-consultants">${consultants.map(value => `<option value="${esc(value)}">`).join('')}</datalist></div>` : ''}
      ${types.length ? selectField('Type', 'type', filters.type, types, 'All types') : ''}
      ${options.payer !== false ? selectField('Payer type', 'payer', filters.payer, payers, 'All payer types') : ''}
      ${options.trend ? `<div class="mgmt-field"><label>Trend by</label>
        <select data-filter="grain" aria-label="Trend by">
          ${[['day', 'Day'], ['week', 'Week'], ['month', 'Month']].map(([value, label]) =>
      `<option value="${value}"${filters.grain === value ? ' selected' : ''}>${label}</option>`).join('')}
        </select></div>` : ''}
      <div class="mgmt-actions"><button type="button" class="btn sm" data-action="apply">Apply filters</button>
        <button type="button" class="btn ghost sm" data-action="reset">Reset</button></div>
    </div>`;
  }

  const PAYER_TYPES = ['Cash', 'TPA', 'Insurance', 'Government schemes', 'PMJAY', 'Corporate', 'Other'];
  const REVENUE_TYPES = ['OPD / IPD / ER', 'IPD', 'OPD', 'ER', 'Pharmacy'];
  function payerType(name, companyType) {
    const label = `${text(companyType)} ${text(name)}`.toLowerCase();
    if (!text(name) && !text(companyType)) return 'Cash';
    if (/pmjay|pradhan mantri jan|ayushman/.test(label)) return 'PMJAY';
    if (/aarogya|arogyasri|government|govt|e\.?h\.?s|cghs|esi|scheme/.test(label)) return 'Government schemes';
    if (/\btpa\b|medi.?assist|health.?insurance.?tpa|third.?party/.test(label)) return 'TPA';
    if (/insurance|health plan|healthcare/.test(label)) return 'Insurance';
    if (/corporate|company|industry|employer/.test(label)) return 'Corporate';
    if (/cash|self.?pay|general|walk.?in/.test(label)) return 'Cash';
    return 'Other';
  }

  function normalizedFilters(filters) {
    return Object.assign({}, filters, {
      from: iso(filters.from),
      to: iso(filters.to),
      consultant: norm(filters.consultant),
      department: norm(filters.department)
    });
  }

  function inScope(row, filters, dimensions) {
    const f = normalizedFilters(filters);
    const date = iso(row[dimensions.date]);
    if (!date || (f.from && date < f.from) || (f.to && date > f.to)) return false;
    if (filters.branch && dimensions.branch && norm(row[dimensions.branch]) !== norm(filters.branch)) return false;
    if (f.consultant && dimensions.consultant && norm(row[dimensions.consultant]) !== f.consultant) return false;
    if (f.department && dimensions.department) {
      const department = text(row[dimensions.department]) ||
        (dimensions.consultant && docDepartment(row[dimensions.consultant]));
      if (norm(department) !== f.department) return false;
    }
    if (filters.payer && dimensions.payer &&
      payerType(row[dimensions.payer], dimensions.companyType && row[dimensions.companyType]) !== filters.payer) return false;
    return true;
  }

  function category(type) {
    const raw = text(type);
    const normalized = raw.replace(/^refund[-\s]*/i, '').replace(/[-\s](cancel|deleted)$/i, '');
    if (/^ER IP FINAL BILLS$/i.test(normalized)) return 'ER';
    if (/pharmacy/i.test(normalized)) return 'Pharmacy';
    if (/^IP .*?(final bill|general bill|package bill)$/i.test(normalized)) return 'IPD';
    if (/^(OP Bill|OP Corporate|Consultation|Corporate OP Consultation|Registration)$/i.test(normalized)) return 'OPD';
    return '';
  }

  function pharmacyService(type) {
    const value = norm(type);
    if (/\bcasual(?:ty|ity)\b|\bemergency\b/.test(value)) return 'casualty';
    if (/\bip\b|\binpatient\b/.test(value)) return 'ip';
    if (/\bop\b|\boutpatient\b/.test(value)) return 'op';
    return 'other';
  }

  function activeBillRow(row) {
    const status = text(row.st);
    return (!status || status === 'A') && !/[-\s](cancel|deleted)$/i.test(text(row.type));
  }

  function finalRevenueRows(filters) {
    return allBillRows().filter(row => {
      const billCategory = category(row.type);
      const matchesType = !filters.type ||
        (filters.type === 'OPD / IPD / ER'
          ? ['OPD', 'IPD', 'ER'].includes(billCategory)
          : billCategory === filters.type);
      return billCategory && activeBillRow(row) && matchesType && inScope(row, filters, {
        date: 'bdate', branch: 'loc', consultant: 'doc', department: 'dept',
        payer: 'cmp', companyType: 'ctype'
      });
    });
  }

  function renderBillingCategory(root, filters, config) {
    const store = runtime.store || {};
    const sourceCount = ((store.btReg && store.btReg.rows) || []).length;
    const categoryRows = allBillRows().filter(row =>
      category(row.type) === config.category && activeBillRow(row));
    const rows = categoryRows.filter(row => inScope(row, filters, { date: 'bdate', branch: 'loc' }));
    const available = sourceCount > 0;
    const totalPatients = uniquePatients(rows);
    const byType = groups(rows, row => row.type, row => row.net);
    const detailRows = byType.map(item => {
      const subset = rows.filter(row => row.type === item.label);
      const patients = uniquePatients(subset);
      return [
        item.label,
        integer(item.count),
        patients == null ? '—' : integer(patients),
        money(item.value),
        money(sum(subset, 'trcpt')),
        money(sum(subset, 'tout'))
      ];
    });
    const trend = trendRows(rows, filters.grain).map(item => ({
      label: filters.grain === 'month' ? item.label : item.label.slice(5),
      value: item.value
    }));
    const pharmacyCategories = [
      { key: 'op', label: 'OP Pharmacy' },
      { key: 'casualty', label: 'Casualty Pharmacy' },
      { key: 'ip', label: 'IP Pharmacy' }
    ];
    const pharmacySummary = config.category === 'Pharmacy' ? pharmacyCategories.map(item => {
      const sourceRows = categoryRows.filter(row => pharmacyService(row.type) === item.key);
      const subset = rows.filter(row => pharmacyService(row.type) === item.key);
      const patients = uniquePatients(subset);
      return [
        item.label,
        sourceRows.length ? integer(subset.length) : 'Not in register',
        sourceRows.length ? (patients == null ? '—' : integer(patients)) : '—',
        sourceRows.length ? money(sum(subset, 'net')) : '—',
        sourceRows.length ? money(sum(subset, 'trcpt')) : '—',
        sourceRows.length ? money(sum(subset, 'tout')) : '—'
      ];
    }) : [];
    if (config.category === 'Pharmacy' && categoryRows.some(row => pharmacyService(row.type) === 'other')) {
      const subset = rows.filter(row => pharmacyService(row.type) === 'other');
      const patients = uniquePatients(subset);
      pharmacySummary.push([
        'Other pharmacy',
        integer(subset.length),
        patients == null ? '—' : integer(patients),
        money(sum(subset, 'net')),
        money(sum(subset, 'trcpt')),
        money(sum(subset, 'tout'))
      ]);
    }
    const missingPharmacyCategories = config.category === 'Pharmacy'
      ? pharmacyCategories.filter(item => !categoryRows.some(row => pharmacyService(row.type) === item.key))
        .map(item => item.label)
      : [];
    const note = missingPharmacyCategories.length
      ? `${missingPharmacyCategories.join(' and ')} bill rows are not present in the loaded Bill Type register; load those bill types to report their amounts.`
      : config.note;
    root.innerHTML = `${sectionHeader(config.panel, config.title,
      'Billing amounts from the loaded Bill Type register, filtered by date range and branch.',
      available ? 'Loaded register' : 'Data integration required')}
      ${controls(config.panel, filters, {
        branches: branchOptions(), departments: [], consultant: false, payer: false
      })}
      <div class="mgmt-kpis">
        ${metric('Net billed', available ? money(sum(rows, 'net')) : 'Needs data integration',
        'Sum of net amounts recorded for this billing category.', available ? '' : 'missing')}
        ${metric('Collected', available ? money(sum(rows, 'trcpt')) : 'Needs data integration',
          'Total receipt amount recorded in the register.', available ? '' : 'missing')}
        ${metric('Outstanding', available ? money(sum(rows, 'tout')) : 'Needs data integration',
            'Total outstanding due amount recorded in the register.', available ? '' : 'missing')}
        ${metric('Bill records', available ? integer(rows.length) : 'Needs data integration',
              'Active matching bill rows after filters.', available ? '' : 'missing')}
        ${metric('Unique patients', totalPatients == null ? 'Needs patient IDs' : integer(totalPatients),
                'Distinct UMRs among matching bill rows.', totalPatients == null ? 'missing' : '')}
      </div>
      <div class="mgmt-grid">
        ${card('Billing trend', 'Net billed amounts by day or month.', chart(trend, money, 14), true,
                  grainButtons(config.panel, filters.grain))}
        ${config.category === 'Pharmacy'
        ? card('Pharmacy category summary', 'OP, Casualty, and IP pharmacy amounts shown separately.',
          table(['Category', 'Bills', 'Patients', 'Net billed', 'Collected', 'Outstanding'], pharmacySummary),
          true)
        : ''}
        ${available ? card('Department-wise', 'Click a department to see its doctors.', table(['Department', 'Patients', 'Bills', 'Revenue', 'Share', 'Collected', 'Outstanding'], revenueBreakdown(rows, row => row.dept, sum(rows, 'net')).slice(0, 25)), true) : ''}
        ${card('Bill type details', 'Counts and amounts by the bill type recorded in the register.',
          available
            ? table(['Bill type', 'Bills', 'Patients', 'Net billed', 'Collected', 'Outstanding'], detailRows)
            : integration('Load the Bill Type register to show date-filtered billing totals.'),
          true)}
      </div>
      <p class="mgmt-footnote">${esc(note)} Net billed and receipt totals preserve signed values from the source register. Refund rows are included only when their bill type maps to this category, and canceled/inactive rows are excluded.</p>`;
    attachDeptDrill(root, rows);
  }

  function sum(rows, key) {
    return rows.reduce((total, row) => total + number(row[key]), 0);
  }

  function uniquePatients(rows) {
    const patients = rows.map(row => text(row.umr)).filter(value => value && value !== '-');
    return patients.length ? new Set(patients).size : null;
  }

  function groups(rows, keyFn, valueFn) {
    const map = new Map();
    rows.forEach(row => {
      const label = text(keyFn(row)) || 'Not recorded';
      let item = map.get(label);
      if (!item) {
        item = { label, value: 0, count: 0, patients: new Set(), rows: [] };
        map.set(label, item);
      }
      item.value += number(valueFn(row));
      item.count++;
      const umr = text(row.umr);
      if (umr && umr !== '-') item.patients.add(umr);
      item.rows.push(row);
    });
    return Array.from(map.values()).map(item => Object.assign(item, { patients: item.patients.size }))
      .sort((a, b) => b.value - a.value);
  }

  function metric(label, value, note, state) {
    return `<article class="mgmt-kpi ${state || ''}"><p class="mgmt-kpi-label">${esc(label)}</p>
      <strong class="mgmt-kpi-value">${esc(value)}</strong><p class="mgmt-kpi-note">${esc(note)}</p></article>`;
  }

  function integration(note) {
    return `<div class="mgmt-integration">${esc(note)}</div>`;
  }

  function chart(items, formatter, limit) {
    const visible = items.slice(0, limit || 8);
    if (!visible.length) return '<div class="mgmt-empty">No data is available for this selection.</div>';
    const max = Math.max(...visible.map(item => Math.abs(item.value)), 1);
    return `<div class="mgmt-chart">${visible.map(item => {
      const width = Math.max(2, Math.min(100, Math.abs(item.value) / max * 100));
      return `<div class="mgmt-bar-row"><span class="mgmt-bar-label" title="${esc(item.label)}">${esc(item.label)}</span>
        <span class="mgmt-bar-track"><span class="mgmt-bar-fill" style="width:${width}%"></span></span>
        <span class="mgmt-bar-value">${esc(formatter(item.value))}</span></div>`;
    }).join('')}</div>`;
  }

  function table(headers, rows, empty) {
    if (!rows.length) return `<div class="mgmt-empty">${esc(empty || 'No data is available for this selection.')}</div>`;
    return `<div class="mgmt-table-wrap"><table class="mgmt-table"><thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(row => `<tr>${row.map((cell, index) => `<td>${index === 0 ? esc(cell) : esc(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }

  function card(title, description, body, wide, extra) {
    return `<article class="mgmt-card${wide ? ' wide' : ''}"><h3>${esc(title)}</h3>
      ${extra || ''}${description ? `<p>${esc(description)}</p>` : ''}${body}</article>`;
  }

  function trendRows(rows, grain) {
    const grouped = groups(rows, row => {
      const date = iso(row.bdate);
      return grain === 'day' ? date : date.slice(0, 7);
    }, row => row.net);
    return grouped.sort((a, b) => a.label.localeCompare(b.label));
  }

  const REVENUE_SERIES = [
    { key: 'IPD', label: 'IPD', color: '#0F9488' },
    { key: 'OPD', label: 'OPD', color: '#38BDF8' },
    { key: 'ER', label: 'ER', color: '#F59E0B' },
    { key: 'Pharmacy', label: 'Pharmacy', color: '#8B5CF6' }
  ];

  function compactMoney(value) {
    const absolute = Math.abs(value);
    if (absolute >= 1e7) return '₹' + (value / 1e7).toFixed(2) + ' Cr';
    if (absolute >= 1e5) return '₹' + (value / 1e5).toFixed(2) + ' L';
    if (absolute >= 1e3) return '₹' + (value / 1e3).toFixed(0) + ' K';
    return '₹' + Math.round(value).toLocaleString('en-IN');
  }

  function revenuePeriodKey(date, grain) {
    if (grain === 'month') return date.slice(0, 7);
    if (grain !== 'week') return date;
    const monday = new Date(date + 'T00:00:00Z');
    monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
    return monday.toISOString().slice(0, 10);
  }

  function revenuePeriodLabel(key, grain) {
    if (grain === 'month') return key;
    const date = new Date(key + 'T00:00:00Z');
    const label = date.toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', timeZone: 'UTC'
    });
    return grain === 'week' ? 'Week of ' + label : label;
  }

  function stackedRevenueChart(rows, grain) {
    const buckets = new Map();
    rows.forEach(row => {
      const date = iso(row.bdate);
      const key = revenuePeriodKey(date, grain);
      const series = category(row.type);
      if (!key || !REVENUE_SERIES.some(item => item.key === series)) return;
      const bucket = buckets.get(key) || { label: key, IPD: 0, OPD: 0, ER: 0, Pharmacy: 0 };
      bucket[series] += number(row.net);
      buckets.set(key, bucket);
    });
    const points = Array.from(buckets.values()).sort((a, b) => a.label.localeCompare(b.label));
    if (!points.length) return '<div class="mgmt-empty">No revenue is available for this selection.</div>';

    const width = 1000, height = 340, left = 78, right = 18, top = 20, bottom = 54;
    const plotHeight = height - top - bottom, plotWidth = width - left - right;
    const positiveMax = Math.max(0, ...points.map(point =>
      REVENUE_SERIES.reduce((sum0, item) => sum0 + Math.max(0, point[item.key]), 0)));
    const negativeMax = Math.max(0, ...points.map(point =>
      REVENUE_SERIES.reduce((sum0, item) => sum0 + Math.abs(Math.min(0, point[item.key])), 0)));
    const range = Math.max(positiveMax + negativeMax, 1);
    const scale = plotHeight / range;
    const zeroY = top + positiveMax * scale;
    const slot = plotWidth / points.length;
    const barWidth = Math.max(3, Math.min(64, slot * 0.62));
    let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Stacked revenue by ${esc(grain)}">
      <title>Revenue by ${esc(grain)}</title>`;
    for (let index = 0; index <= 4; index++) {
      const value = positiveMax - range * index / 4;
      const y = zeroY - value * scale;
      svg += `<line x1="${left}" x2="${width - right}" y1="${y}" y2="${y}" stroke="#E2E8F0"/>
        <text x="${left - 9}" y="${y + 4}" text-anchor="end" fill="#64748B" font-size="12">${esc(compactMoney(value))}</text>`;
    }
    svg += `<line x1="${left}" x2="${width - right}" y1="${zeroY}" y2="${zeroY}" stroke="#94A3B8"/>`;
    points.forEach((point, index) => {
      const x = left + index * slot + (slot - barWidth) / 2;
      let positive = 0, negative = 0;
      REVENUE_SERIES.forEach(item => {
        const value = point[item.key];
        if (!value) return;
        const segmentHeight = Math.abs(value) * scale;
        const y = value > 0 ? zeroY - (positive + value) * scale : zeroY + negative * scale;
        if (value > 0) positive += value;
        else negative += Math.abs(value);
        const title = `${revenuePeriodLabel(point.label, grain)} · ${item.label}: ${money(value)}`;
        svg += `<rect x="${x}" y="${y}" width="${barWidth}" height="${Math.max(1, segmentHeight)}" fill="${item.color}">
          <title>${esc(title)}</title></rect>`;
      });
      if (points.length <= 10 || index % Math.ceil(points.length / 10) === 0 || index === points.length - 1) {
        svg += `<text x="${x + barWidth / 2}" y="${height - bottom + 22}" text-anchor="middle" fill="#64748B" font-size="11">${esc(revenuePeriodLabel(point.label, grain))}</text>`;
      }
    });
    svg += '</svg>';
    const legend = REVENUE_SERIES.map(item =>
      `<span><i style="background:${item.color}"></i>${item.label}</span>`
    ).join('');
    return `<div class="mgmt-revenue-chart">${svg}</div><div class="mgmt-revenue-legend">${legend}</div>`;
  }

  function revenueBreakdown(rows, keyFn, total) {
    return groups(rows, row => text(keyFn(row)) || 'Not recorded', row => row.net).map(item => {
      const subset = rows.filter(row => (text(keyFn(row)) || 'Not recorded') === item.label);
      const patients = uniquePatients(subset);
      return [
        item.label,
        patients == null ? '—' : integer(patients),
        integer(subset.length),
        money(item.value),
        total ? (100 * item.value / total).toFixed(1) + '%' : '—',
        money(sum(subset, 'trcpt')),
        money(sum(subset, 'tout'))
      ];
    });
  }

  function grainButtons(panel, grain) {
    return `<span class="mgmt-grain" aria-label="Trend interval">
      <button type="button" data-grain="day" class="${grain === 'day' ? 'on' : ''}">Daily</button>
      <button type="button" data-grain="month" class="${grain === 'month' ? 'on' : ''}">Monthly</button></span>`;
  }

  function sectionHeader(panel, title, description, source) {
    return `<div class="mgmt-intro"><div><h2>${esc(title)}</h2><p>${esc(description)}</p></div>
      <span class="mgmt-source">${esc(source)}</span></div>`;
  }


  /* click a department row to open a drop-down of its doctors */
  function attachDeptDrill(root, rows) {
    return; /* department rows now open the department report card (see the end of this file) */
    const dt = [...root.querySelectorAll('table')].find(t => t.tHead && t.tHead.rows[0] && t.tHead.rows[0].cells[0].textContent.trim() === 'Department');
    if (!dt || !dt.tBodies[0]) return;
    const nice = t => String(t || '—').toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase());
    [...dt.tBodies[0].rows].forEach(tr => {
      tr.style.cursor = 'pointer';
      tr.title = 'Click to see the doctors in this department';
      tr.addEventListener('click', () => {
        const nx = tr.nextElementSibling;
        if (nx && nx.classList.contains('xp-docs')) { nx.remove(); tr.classList.remove('open'); return; }
        const dn = tr.cells[0].textContent.trim().toLowerCase(), sub = rows.filter(r => String(r.dept || '').toLowerCase() === dn), m = {};
        sub.forEach(r => { const o = m[r.doc || '—'] = m[r.doc || '—'] || { net: 0, pts: new Set() }; o.net += r.net || 0; o.pts.add(r.umr); });
        const total = sum(sub, 'net') || 1, list = Object.entries(m).sort((a, b) => b[1].net - a[1].net).slice(0, 15);
        const x = document.createElement('tr');
        x.className = 'xp-docs';
        x.innerHTML = `<td colspan="${tr.cells.length}"><div class="xp-list">${list.map(([n, o]) => `<span><b>${nice(n)}</b>${compactMoney(o.net)} · ${(100 * o.net / total).toFixed(0)}% · ${o.pts.size} patients</span>`).join('') || '<span>No doctor detail in this selection</span>'}</div></td>`;
        tr.after(x);
        tr.classList.add('open');
      });
    });
  }

  function renderRevenue(root, filters) {
    const store = runtime.store || {};
    const rows = finalRevenueRows(filters);
    const total = sum(rows, 'net');
    const ipd = rows.filter(row => category(row.type) === 'IPD');
    const opd = rows.filter(row => category(row.type) === 'OPD');
    const er = rows.filter(row => category(row.type) === 'ER');
    const pharmacy = rows.filter(row => category(row.type) === 'Pharmacy');
    const opdPharmacy = pharmacy.filter(row => pharmacyService(row.type) === 'op');
    const sourceRows = allBillRows();
    const hasIpPharmacy = sourceRows.some(row =>
      category(row.type) === 'Pharmacy' && activeBillRow(row) && pharmacyService(row.type) === 'ip');
    const hasCasualtyPharmacy = sourceRows.some(row =>
      category(row.type) === 'Pharmacy' && activeBillRow(row) && pharmacyService(row.type) === 'casualty');
    const missingPharmacy = [
      !hasCasualtyPharmacy ? 'Casualty' : '',
      !hasIpPharmacy ? 'IP' : ''
    ].filter(Boolean);
    const patients = uniquePatients(rows);
    const discharges = (store.disc || []).filter(row =>
      inScope(row, filters, { date: 'ddate', branch: 'loc' }));
    const alos = discharges.length
      ? sum(discharges, 'stay') / discharges.length
      : null;
    const departmentRows = revenueBreakdown(rows, row => row.dept, total).slice(0, 20);
    const payerRows = revenueBreakdown(rows, row => payerType(row.cmp, row.ctype), total);
    const sourceCount = ((store.btReg && store.btReg.rows) || []).length;
    const share = value => total ? (100 * value / total).toFixed(1) + '% of total' : 'No revenue in selection';
    const snapAll = ((store.snapshots || []).filter(s => s.data && s.data.kpi).sort((a, b) => a.asOf < b.asOf ? -1 : 1));
    const kp0 = snapAll.length ? snapAll[snapAll.length - 1].data.kpi : {};
    const consult = opd.filter(row => /consult/i.test(row.type));
    const opdConsult = sourceCount ? metric('OP consultation revenue', compactMoney(sum(consult, 'net')), share(sum(consult, 'net'))) : metric('OP consultation revenue', 'Needs data integration', 'Load OP bill-type records.', 'missing');
    const arpobMetric = kp0.arpob ? metric('ARPOB', money(kp0.arpob.mtd), 'Average revenue per occupied bed per day, month to date, from the management report.') : metric('ARPOB', 'Needs data integration', 'Load the management dashboard report.', 'missing');
    const occMetric = kp0.occPct ? metric('Bed occupancy', kp0.occPct.today + '%', `${integer(kp0.occBeds.today)} of ${integer(kp0.beds.today)} beds occupied.`) : '';
    root.innerHTML = `${sectionHeader('p-revenue', 'Revenue dashboard',
      'Revenue by billing category, department, payer, and trend interval.',
      sourceCount ? 'Loaded register' : 'Data integration required')}
      ${controls('p-revenue', filters, {
        branches: branchOptions(), departments: departmentOptions(), consultant: false,
        types: REVENUE_TYPES, payers: PAYER_TYPES, trend: true
      })}
      <div class="mgmt-kpis mgmt-revenue-kpis">
        ${sourceCount ? metric('Total hospital revenue', compactMoney(total), 'Net amount across matched bill-type rows; reconcile to the finance ledger.') : metric('Total hospital revenue', 'Needs data integration', 'Load the bill-type register to report date-filtered revenue.', 'missing')}
        ${sourceCount ? metric('IP revenue', compactMoney(sum(ipd, 'net')), share(sum(ipd, 'net'))) : metric('IP revenue', 'Needs data integration', 'Load IP bill-type records.', 'missing')}
        ${sourceCount ? metric('OPD billing revenue', compactMoney(sum(opd, 'net')), share(sum(opd, 'net'))) : metric('OPD billing revenue', 'Needs data integration', 'Load OP bill-type records.', 'missing')}
        ${sourceCount ? metric('ER revenue', compactMoney(sum(er, 'net')), share(sum(er, 'net'))) : metric('ER revenue', 'Needs data integration', 'Load ER bill-type records.', 'missing')}
        ${sourceCount ? metric('OP pharmacy revenue', compactMoney(sum(opdPharmacy, 'net')), share(sum(opdPharmacy, 'net'))) : metric('OP pharmacy revenue', 'Needs data integration', 'Load OP pharmacy bill types.', 'missing')}
        ${sourceCount ? metric('Total pharmacy revenue', compactMoney(sum(pharmacy, 'net')),
        missingPharmacy.length ? `Missing ${missingPharmacy.join(' and ')} pharmacy records.` : share(sum(pharmacy, 'net')),
        missingPharmacy.length ? 'partial' : '') : metric('Total pharmacy revenue', 'Needs data integration', 'Load OP, Casualty, and IP pharmacy bill types.', 'missing')}
        ${patients == null ? metric('ARPP', sourceCount ? 'Needs patient IDs' : 'Needs data integration', 'Average revenue per distinct patient.', 'missing')
        : metric('ARPP', patients ? money(total / patients) : '—', `${integer(patients)} unique patients in this selection.`)}
        ${alos == null ? metric('ALOS', 'Needs discharge data', 'Average length of stay for filtered discharges.', 'missing')
        : metric('ALOS', alos.toFixed(1) + ' days', `${integer(discharges.length)} discharges in the selected date range and branch.`)}
        ${opdConsult}
        ${arpobMetric}
        ${occMetric}
      </div>
      <div class="mgmt-grid">
        ${card('Revenue trend', 'Daily, weekly, or monthly net billings, stacked by category.',
          stackedRevenueChart(rows, filters.grain), true)}
        ${card('Department-wise revenue', 'Patients, bills, revenue share, receipts, and outstanding by department.',
            table(['Department', 'Patients', 'Bills', 'Revenue', 'Share', 'Collected', 'Outstanding'], departmentRows))}
        ${card('Payer-wise revenue', 'Patients, bills, revenue share, receipts, and outstanding by payer type.',
              table(['Payer', 'Patients', 'Bills', 'Revenue', 'Share', 'Collected', 'Outstanding'], payerRows))}
      </div>
      <p class="mgmt-footnote">Revenue includes recognized active bill types and preserves signed refund values; canceled/inactive bills are excluded. ARPP is net revenue divided by distinct UMRs. ALOS is calculated from discharge stay days for the selected date range and branch. Pharmacy figures are partial when Casualty or IP pharmacy bill types are absent from the register.</p>`;
    attachDeptDrill(root, rows);
  }

  function renderPayers(root, filters) {
    const rows = finalRevenueRows(filters);
    const byType = groups(rows, row => payerType(row.cmp, row.ctype), row => row.net)
      .sort((a, b) => PAYER_TYPES.indexOf(a.label) - PAYER_TYPES.indexOf(b.label));
    const byCompany = groups(rows, row => text(row.cmp) || payerType(row.cmp, row.ctype), row => row.net).slice(0, 15);
    const payerRows = byType.map(item => {
      const subset = rows.filter(row => payerType(row.cmp, row.ctype) === item.label);
      return [item.label, integer(uniquePatients(subset)), money(item.value), money(sum(subset, 'paid')), money(sum(subset, 'due'))];
    });
    const trend = trendRows(rows, filters.grain).map(item => ({
      label: filters.grain === 'month' ? item.label : item.label.slice(5),
      value: item.value
    }));
    const sourceCount = ((runtime.store && runtime.store.btReg && runtime.store.btReg.rows) || []).length;
    root.innerHTML = `${sectionHeader('p-payers', 'Payer dashboard',
      'Patient distribution, billed revenue, collections, and outstanding balances by payer type.',
      sourceCount ? 'Loaded register' : 'Data integration required')}
      ${controls('p-payers', filters, { branches: branchOptions(), departments: departmentOptions(), consultants: sourceConsultants(), types: REVENUE_TYPES, payers: PAYER_TYPES })}
      <div class="mgmt-kpis">
        ${metric('Billed revenue', sourceCount ? money(sum(rows, 'net')) : 'Needs data integration', 'Net amount from bill-type rows in the selected scope.', sourceCount ? '' : 'missing')}
        ${metric('Unique patients', uniquePatients(rows) == null ? 'Needs patient IDs' : integer(uniquePatients(rows)), 'Distinct UMRs represented in matched bill-type rows.', uniquePatients(rows) == null ? 'missing' : '')}
        ${metric('Collections', sourceCount ? money(sum(rows, 'paid')) : 'Needs data integration', 'Paid amount recorded in the bill-type register.', sourceCount ? '' : 'missing')}
        ${metric('Outstanding', sourceCount ? money(sum(rows, 'due')) : 'Needs data integration', 'Due amount recorded in the bill-type register.', sourceCount ? '' : 'missing')}
      </div>
      <div class="mgmt-grid">
        ${card('Revenue by payer type', 'Cash, TPA, insurance, government schemes, PMJAY, corporate, and other.', chart(byType, money, 7))}
        ${card('Payer revenue trend', 'Net registered billings for the selected payer filters.', chart(trend, money, 14), false, grainButtons('p-payers', filters.grain))}
        ${card('Payer billing and collection', 'Patients are distinct UMRs within each payer type.', table(['Payer type', 'Patients', 'Billed', 'Collected', 'Outstanding'], payerRows))}
        ${card('Top payer entities', 'Company names are shown as supplied by the loaded register.', chart(byCompany, money, 12), true)}
        ${sourceCount ? '' : integration('Load the bill-type register with company type, company name, UMR, net amount, paid amount, and due amount to enable payer reporting.')}
      </div>
      <p class="mgmt-footnote">Payer type mapping uses the source company name/type text and is intended for operational grouping; review category mappings before publishing official payer reports.</p>`;
  }

  function docDepartment(name) {
    const key = norm(name);
    const rows = (runtime.data && runtime.data.doctors) || [];
    const match = rows.find(row => norm(row.name) === key);
    return match ? text(match.dept) : '';
  }

  function opdConsultations(filters) {
    const result = new Map();
    const store = runtime.store || {};
    (store.opdDays || []).forEach(day => {
      if (!inScope(day, filters, { date: 'date' })) return;
      Object.entries(day.docs || {}).forEach(([name, entry]) => {
        const consultant = text(name);
        const department = text(entry.dept) || docDepartment(consultant);
        if (filters.consultant && norm(consultant) !== norm(filters.consultant)) return;
        if (filters.department && norm(department) !== norm(filters.department)) return;
        const branch = Object.keys(entry.locs || {}).find(value => norm(value) === norm(filters.branch));
        if (filters.branch && !branch) return;
        let visits = number(entry.v);
        if (filters.branch) {
          const locs = entry.locs || {};
          visits = number(locs[branch]);
        }
        if (!visits) return;
        result.set(consultant, (result.get(consultant) || 0) + visits);
      });
    });
    return result;
  }

  function renderConsultants(root, filters) {
    const rows = finalRevenueRows(filters);
    const rev = groups(rows, row => row.doc || 'Not assigned', row => row.net);
    const opd = opdConsultations(filters);
    const adm = (runtime.store && runtime.store.adm || []).filter(row => inScope(row, filters, {
      date: 'date', branch: 'loc', consultant: 'cons', department: 'dept',
      payer: 'payer'
    }));
    const admissionsByConsultant = groups(adm, row => row.cons || 'Not assigned', row => 1);
    const revenueByConsultant = new Map(rev.map(item => [norm(item.label), item]));
    const admissionsByName = new Map(admissionsByConsultant.map(item => [norm(item.label), item]));
    const opdByConsultant = new Map(Array.from(opd.entries()).map(([name, visits]) => [norm(name), visits]));
    const names = uniqueLabels([...rev.map(item => item.label), ...opd.keys(), ...admissionsByConsultant.map(item => item.label)]);
    const rowsByConsultant = names.map(name => {
      const revenue = revenueByConsultant.get(norm(name));
      const admission = admissionsByName.get(norm(name));
      const visitCount = opdByConsultant.get(norm(name));
      const sourceRows = revenue ? revenue.rows : [];
      return {
        revenueValue: revenue ? revenue.value : 0,
        cells: [
          name,
          integer(visitCount || 0),
          integer(admission ? admission.count : 0),
          integer(uniquePatients(sourceRows) || 0),
          money(revenue ? revenue.value : 0),
          text((sourceRows[0] && sourceRows[0].dept) || docDepartment(name) || '—')
        ]
      };
    }).sort((a, b) => b.revenueValue - a.revenueValue).slice(0, 25).map(item => item.cells);
    const revenueSum = sum(rows, 'net');
    const activeConsultants = new Set(rows.map(row => norm(row.doc)).filter(Boolean)).size;
    const periods = trendRows(rows, filters.grain).map(item => ({
      label: filters.grain === 'month' ? item.label : item.label.slice(5),
      value: item.value
    }));
    const sourceCount = ((runtime.store && runtime.store.btReg && runtime.store.btReg.rows) || []).length;
    root.innerHTML = `${sectionHeader('p-consultants', 'Consultant dashboard',
      'Consultations, admissions, bill-register revenue, and department performance by consultant.',
      sourceCount ? 'Loaded register' : 'Data integration required')}
      ${controls('p-consultants', filters, { branches: branchOptions(), departments: departmentOptions(), consultants: sourceConsultants(), types: REVENUE_TYPES, payers: PAYER_TYPES })}
      <div class="mgmt-kpis">
        ${metric('Consultants with billings', sourceCount ? integer(activeConsultants) : 'Needs data integration', 'Distinct consultants with matched registered bill rows.', sourceCount ? '' : 'missing')}
        ${metric('OPD consultations', integer(Array.from(opd.values()).reduce((a, b) => a + b, 0)), 'From date-wise OPD statistics; branch-filtered where consultant location counts are available.')}
        ${metric('IP admissions', integer(adm.length), 'Admission rows matching the selected scope.')}
        ${metric('Available registered revenue', sourceCount ? money(revenueSum) : 'Needs data integration', 'Net bill-register revenue; see the report table for the included records.', sourceCount ? '' : 'missing')}
        ${metric('Average revenue / consultant', activeConsultants ? money(revenueSum / activeConsultants) : '—', 'Available registered revenue divided by consultants with billing rows.')}
        ${metric('Revenue per unique patient', uniquePatients(rows) ? money(revenueSum / uniquePatients(rows)) : '—', 'Calculated from net billings and distinct UMRs in the selection.')}
      </div>
      <div class="mgmt-grid">
        ${card('Consultant performance', 'Top 25 by registered revenue; use the consultant filter to focus on an individual.', table(['Consultant', 'OPD visits', 'IP admissions', 'Patients', 'Net revenue', 'Department'], rowsByConsultant))}
        ${card('Consultant revenue trend', 'Net bill-register values by date or month.', chart(periods, money, 14), false, grainButtons('p-consultants', filters.grain))}
        ${card('Department-wise performance', 'Revenue grouped by department in the bill-type register.', chart(groups(rows, row => row.dept || 'Not recorded', row => row.net), money, 12))}
      </div>
      <p class="mgmt-footnote">OPD consultation totals come from daily OPD statistics. Revenue and patient counts come from bill-register rows; they may not match consultant-wise compensation or audited financial reports.</p>`;
  }

  function acquisition(rows, filters) {
    const result = { visits: 0, newReg: 0, oldReg: 0, branches: new Map(), days: [] };
    (rows || []).forEach(day => {
      if (!inScope(day, filters, { date: 'date' })) return;
      let visits = number(day.visits), newReg = number(day.newReg), oldReg = number(day.oldReg);
      if (filters.branch) {
        const locationKey = Object.keys(day.locs || {}).find(value => norm(value) === norm(filters.branch));
        const location = locationKey ? day.locs[locationKey] : null;
        visits = number(location && location.visits);
        newReg = number(location && location.newReg);
        oldReg = number(location && location.oldReg);
      }
      result.visits += visits;
      result.newReg += newReg;
      result.oldReg += oldReg;
      result.days.push({ label: day.date, value: newReg });
      if (!filters.branch) {
        Object.entries(day.locs || {}).forEach(([name, value]) => {
          const item = result.branches.get(name) || { label: name, value: 0, count: 0, patients: 0, rows: [] };
          item.value += number(value.newReg);
          result.branches.set(name, item);
        });
      } else {
        const item = result.branches.get(filters.branch) || { label: filters.branch, value: 0, count: 0, patients: 0, rows: [] };
        item.value += newReg;
        result.branches.set(filters.branch, item);
      }
    });
    return result;
  }

  function referrals(rows, filters) {
    const bySource = new Map();
    const byDoctor = new Map();
    rows.forEach(row => {
      if (!inScope(row, filters, { date: 'bdate', branch: 'loc', consultant: 'doc', department: 'dept' })) return;
      const refs = [
        [row.r1t, row.r1],
        [row.r2t, row.r2]
      ];
      refs.forEach(([kind, source]) => {
        const label = text(source);
        if (!label || /^[.\s\-_\/]+$/.test(label)) return;
        const sourceName = `${text(kind) ? text(kind) + ': ' : ''}${label}`;
        const entry = bySource.get(sourceName) || { label: sourceName, value: 0, count: 0, patients: new Set(), rows: [] };
        entry.value += number(row.net);
        entry.count++;
        if (text(row.umr)) entry.patients.add(text(row.umr));
        bySource.set(sourceName, entry);
        const doctor = text(row.doc) || 'Not assigned';
        const docEntry = byDoctor.get(doctor) || { label: doctor, value: 0, count: 0, patients: new Set(), rows: [] };
        docEntry.value++;
        if (text(row.umr)) docEntry.patients.add(text(row.umr));
        byDoctor.set(doctor, docEntry);
      });
    });
    const finish = map => Array.from(map.values()).map(item =>
      Object.assign(item, { patients: item.patients.size })
    ).sort((a, b) => b.value - a.value);
    return { sources: finish(bySource), doctors: finish(byDoctor) };
  }

  function renderMarketing(root, filters) {
    const store = runtime.store || {};
    const acquisitionData = acquisition(store.opdDays || [], filters);
    const newShare = acquisitionData.visits ? acquisitionData.newReg / acquisitionData.visits * 100 : null;
    const ref = referrals(allBillRows(), filters);
    const referralRevenue = ref.sources;
    const groupedDays = groups(acquisitionData.days, item =>
      filters.grain === 'month' ? item.label.slice(0, 7) : item.label, item => item.value)
      .sort((a, b) => a.label.localeCompare(b.label));
    const branches = Array.from(acquisitionData.branches.values()).sort((a, b) => b.value - a.value);
    const referralAvailable = referralRevenue.length > 0;
    root.innerHTML = `${sectionHeader('p-mkacq', 'Patient acquisition',
      'Patient acquisition, new versus returning registrations, referral activity, and source-linked revenue.',
      (store.opdDays || []).length ? 'Loaded OPD statistics' : 'Data integration required')}
      ${controls('p-mkacq', filters, { branches: branchOptions(), departments: [], consultant: false, payers: false })}
      <div class="mgmt-kpis">
        ${metric('OPD visits', integer(acquisitionData.visits), 'Visits in the selected dates and branch.')}
        ${metric('New registrations', integer(acquisitionData.newReg), 'New registrations reported in daily OPD statistics.')}
        ${metric('Returning registrations', integer(acquisitionData.oldReg), 'Old registrations reported in daily OPD statistics.')}
        ${metric('New-registration share', newShare == null ? '\u2014' : newShare.toFixed(1) + '%', 'New registrations divided by reported visits.')}
      </div>
      <div class="mgmt-grid">
        ${card('Patient acquisition trend', 'New registrations by date or month.', chart(groupedDays, integer, 14), true, grainButtons('p-mkacq', filters.grain))}
        ${card('Branch-wise acquisition', 'New registrations by branch.', chart(branches, integer, 12))}
        ${card('Referral source performance', 'Unique patients and net billings attributed to loaded referral fields.',
        referralAvailable ? table(['Referral source', 'Patients', 'Net revenue'], referralRevenue.slice(0, 12).map(item => [item.label, integer(item.patients), money(item.value)]))
          : integration('Referral source fields are not populated in the loaded bill-type register. Load referral type/source and patient identifiers to enable this report.'))}
        ${card('Doctor-wise referrals', 'Referral activity grouped by the consultant recorded on the bill.',
            ref.doctors.length ? table(['Consultant', 'Referral records', 'Patients'], ref.doctors.slice(0, 12).map(item => [item.label, integer(item.value), integer(item.patients)]))
              : integration('No consultant-linked referral records are available in this date range.'))}
        ${card('Campaign performance', 'Campaign-attributed patients, revenue, and return on spend.',
                integration('Requires campaign IDs, campaign spend, leads, and appointment/arrival attribution. No campaign figures are inferred from the current reports.'))}
        ${card('Patient conversion', 'Lead-to-appointment and appointment-to-visit trends.',
                  integration('Requires lead, appointment, and visit event records with a shared patient or campaign key.'))}
      </div>
      <p class="mgmt-footnote">New and returning totals use the definitions supplied by the OPD statistics report. Referral counts and revenue are available only when the bill register carries referral source and UMR fields. A bill linked to both referral fields can appear under both sources, so source totals are not additive.</p>`;
  }

  function render(panel) {
    const config = PANELS[panel];
    if (!config) return;
    const root = document.getElementById(config.root);
    if (!root) return;
    const filters = Object.assign(defaultFilters(panel), FILTERS[panel] || {});
    filters.grain = GRAINS[panel] || filters.grain || 'month';
    FILTERS[panel] = filters;
    if (!runtime.store) {
      root.innerHTML = `${sectionHeader(panel, config.title, 'Management analytics from reports loaded into this dashboard.', 'Waiting for reports')}
        ${integration('Dashboard data has not finished loading. Refresh this tab after the report is available.')}`;
      return;
    }
    if (panel === 'p-revenue') renderRevenue(root, filters);
    if (panel === 'p-payers') renderPayers(root, filters);
    if (panel === 'p-consultants') renderConsultants(root, filters);
    if (panel === 'p-mkacq') renderMarketing(root, filters);
    if (panel === 'p-ipbill') renderBillingCategory(root, filters, {
      panel, title: 'IP billing', category: 'IPD',
      note: 'Includes IP final, general, and package bill types; ER final bills are shown separately.'
    });
    if (panel === 'p-erbill') renderBillingCategory(root, filters, {
      panel, title: 'ER module billing', category: 'ER',
      note: 'Includes ER IP final bills recorded in the Bill Type register.'
    });
    if (panel === 'p-pharmbill') renderBillingCategory(root, filters, {
      panel, title: 'Pharmacy billing', category: 'Pharmacy',
      note: 'Includes pharmacy bill types found in the Bill Type register.'
    });
  }

  function applyFilters(panel) {
    const root = document.getElementById(PANELS[panel].root);
    const next = filtersFor(panel);
    if (root) {
      const grain = root.querySelector('[data-grain].on');
      if (grain) next.grain = grain.dataset.grain;
    }
    FILTERS[panel] = next;
    GRAINS[panel] = next.grain;
    render(panel);
  }

  Object.entries(PANELS).forEach(([panel, config]) => {
    const root = document.getElementById(config.root);
    if (!root) return;
    root.addEventListener('change', () => applyFilters(panel));
    root.addEventListener('click', event => {
      const action = event.target.closest('[data-action]');
      if (action && action.dataset.action === 'reset') {
        GRAINS[panel] = panel === 'p-revenue' ? 'day' : 'month';
        FILTERS[panel] = defaultFilters(panel);
        render(panel);
        return;
      }
      const grain = event.target.closest('[data-grain]');
      if (grain) {
        const next = filtersFor(panel);
        next.grain = grain.dataset.grain;
        FILTERS[panel] = next;
        GRAINS[panel] = next.grain;
        render(panel);
        return;
      }
      if (action && action.dataset.action === 'apply') applyFilters(panel);
    });
  });

  const tablist = document.querySelector('nav.tabs[role="tablist"]');
  if (tablist) {
    const activeTab = tablist.querySelector('button[aria-selected="true"]');
    document.body.classList.toggle('management-tab-active',
      !!activeTab && GROUPS.includes(activeTab.getAttribute('aria-controls')));
    tablist.addEventListener('click', event => {
      const tab = event.target.closest('button[role="tab"]');
      if (tab) document.body.classList.toggle('management-tab-active', GROUPS.includes(tab.getAttribute('aria-controls')));
    }, true);
  }

  window.__PRESCO_ENHANCER_READY = payload => {
    runtime = payload || { data: null, store: null, getBillRows: null };
    GROUPS.forEach(render);
  };
  window.__PRESCO_RENDER_MANAGEMENT = render;
})();


/* =====================================================================
   MARKETING MANAGEMENT DASHBOARD
   Tabs: Marketing overview, Executives & targets, Referral records.
   Executives come from the bill register (referral type MARKETING, referral name = executive code).
   Targets and executive details are kept in this browser (localStorage key presco-mk).
   Demonstration targets / leads are labelled "(demo)" and can be switched off.
   ===================================================================== */
(function () {
  'use strict';
  let MKRT = { store: null, getBillRows: null };
  const MKROOT = { 'p-mk': 'marketingDashboard', 'p-me': 'mkExecDashboard', 'p-mr': 'mkRecDashboard' };
  const MKTAB = { 't-marketing': 'p-mk', 't-mkexec': 'p-me', 't-mkrec': 'p-mr' };
  const mkActive = r => !r.st || r.st === 'A';
  const mkDay = iso => new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  const mkTitle = t => String(t || '').toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase());
  const mkTips = host => {
    if (host.__mkTips) return;
    host.__mkTips = true;
    const tip = () => document.getElementById('tip');
    host.addEventListener('mousemove', e => {
      const t = e.target.closest('[data-tip]'), el = tip();
      if (!el) return;
      if (!t) { el.classList.remove('on'); return; }
      el.innerHTML = t.dataset.tip;
      el.classList.add('on');
      el.style.left = Math.min(e.clientX + 14, window.innerWidth - 290) + 'px';
      el.style.top = (e.clientY + 16) + 'px';
    });
    host.addEventListener('mouseleave', () => { const el = tip(); if (el) el.classList.remove('on'); });
  };

  /* ================= MARKETING MANAGEMENT =================
     Marketing executives come from the bill register: referral type MARKETING, referral name = executive code.
     Targets, employee details and status are entered here and kept in this browser (key presco-mk). */
  const MK = { month: '', loc: '', exec: '', src: '', kind: '', gran: 'day', sort: 'ach', sel: '', q: '', st: 'all', more: false, go: 0, view: 'targets', open: 0 };
  const MKS = (() => { try { const j = JSON.parse(localStorage.getItem('presco-mk') || 'null'); if (j && j.execs) return j; } catch (e) { } return { execs: {}, hist: [] }; })();
  const mkSave = () => { try { localStorage.setItem('presco-mk', JSON.stringify(MKS)); } catch (e) { } };
  function drawMk(pn) {
    const host = document.getElementById(MKROOT[pn]); if (!host) return;
    try {
      const store = MKRT.store || {};
      const N = n => Math.round(n || 0).toLocaleString('en-IN');
      const S = n => { const a = Math.abs(n || 0); return a >= 1e7 ? (n / 1e7).toFixed(2) + ' Cr' : a >= 1e5 ? (n / 1e5).toFixed(2) + ' L' : N(n); };
      const RS = n => '₹' + S(n), q = t => String(t == null ? '' : t).replace(/"/g, '&quot;').replace(/</g, '&lt;');
      const tc = mkTitle;
      const all = (MKRT.getBillRows ? MKRT.getBillRows() : []).filter(r => mkActive(r) && !/-CANCEL|-DELETED/i.test(r.type));
      const months = [...new Set(all.map(r => r.bdate.slice(0, 7)))].sort().reverse();
      if (MK.month !== 'all' && !months.includes(MK.month)) MK.month = months[0] || 'all';
      const inM = (r, m) => m === 'all' || r.bdate.slice(0, 7) === m;
      const kd = r => r.tran === 'IP' ? 'IPD' : 'OPD', ec = r => String(r.r1 || '').trim().toUpperCase();
      const mrows = all.filter(r => r.r1t === 'MARKETING' && ec(r));
      const fl = r => (!MK.loc || r.loc === MK.loc) && (!MK.exec || ec(r) === MK.exec) && (!MK.kind || kd(r) === MK.kind);
      const cur = mrows.filter(r => inM(r, MK.month) && fl(r));
      const pm = MK.month === 'all' ? null : months[months.indexOf(MK.month) + 1] || null;
      const prev = pm ? mrows.filter(r => inM(r, pm) && fl(r)) : [];
      const dim = MK.month === 'all' ? 30 : new Date(+MK.month.slice(0, 4), +MK.month.slice(5), 0).getDate();
      const last = Math.max(0, ...all.filter(r => inM(r, MK.month)).map(r => +r.bdate.slice(8)));
      const days = new Set(all.filter(r => inM(r, MK.month)).map(r => r.bdate)).size;
      const frac = MK.month === 'all' ? 1 : Math.min(1, last / dim), scale = MK.month === 'all' ? days / 30.4 : 1;
      const agg = rows => { const m = {}; rows.forEach(r => { const c = ec(r), o = m[c] = m[c] || { code: c, locs: {}, pts: new Set(), opd: new Set(), adm: new Set(), conv: new Set(), net: 0, opdNet: 0, ipNet: 0, n: 0 }; o.locs[r.loc] = (o.locs[r.loc] || 0) + 1; o.pts.add(r.umr); if (kd(r) === 'OPD') { o.opd.add(r.umr); o.opdNet += r.net || 0; } else { if (r.admn) o.adm.add(r.admn); o.ipNet += r.net || 0; } if ((r.net || 0) > 0) o.conv.add(r.umr); o.net += r.net || 0; o.n++; }); return m; };
      const A = agg(cur), AP = agg(prev);
      const ex = c => MKS.execs[c] || {}, active = c => ex(c).status !== 'Inactive';
      const roster = [...new Set([...mrows.map(ec), ...Object.keys(MKS.execs)])].filter(c => !MK.exec || c === MK.exec);
      const branch = c => ex(c).branch || (A[c] ? Object.entries(A[c].locs).sort((a, b) => b[1] - a[1])[0][0] : (mrows.find(r => ec(r) === c) || {}).loc) || '—';
      const demoOn = MKS.demo !== false, hh = c => { let h = 7; for (const ch of c) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };
      const nDays = Math.max(new Set(all.map(r => r.bdate)).size, 1), FAC = [0.35, 0.55, 0.8, 0.95, 1.1, 1.3, 1.6, 2.0];
      const HH = [1.4, 1.05, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2];
      const demoTgt = c => { if (!demoOn) return 0; const acq = A[c] ? A[c].pts.size : 0; if (!acq) return Math.max(2, Math.round(new Set(mrows.filter(r => ec(r) === c).map(r => r.umr)).size / nDays * 30)); return Math.max(2, Math.round(acq / (HH[hh(c) % HH.length] * scale))); };
      const monthly = c => +ex(c).monthly || demoTgt(c);
      const leadOf = (c, acq) => demoOn ? Math.max(acq, Math.round(acq / (0.45 + (hh(c + 'L') % 41) / 100))) : null;
      const apptOf = (c, acq) => demoOn ? Math.max(acq, Math.round(leadOf(c, acq) * (0.7 + (hh(c + 'A') % 21) / 100))) : null;
      const dm = demoOn ? ' (demo)' : '';
      const tgt = c => monthly(c) * scale;
      const stat = (c, acq) => { const t = tgt(c); if (!t) return ['No target', 'nv']; const a = 100 * acq / t; if (a >= 100) return ['Target achieved', 'ok']; const e = 100 * frac, r = e ? a / e : 0; return r >= .9 ? ['On track', 'ok2'] : r >= .6 ? ['Needs attention', 'wl'] : ['Target at risk', 'rn']; };
      const sb = c => { const s2 = stat(c, A[c] ? A[c].pts.size : 0); return `<span class="pf-v ${s2[1]}">${s2[0]}</span>`; };
      const pbar = (p, e, c) => `<div class="mkbar"><i style="width:${Math.min(100, p)}%${c ? ';background:' + c : ''}"></i>${e ? `<b style="left:${Math.min(100, e)}%"></b>` : ''}</div>`;
      const kk = (l, v, n) => `<div class="mkk"><span>${l}</span><b>${v}</b><small>${n || '&nbsp;'}</small></div>`;
      const kp = (l, v, n) => `<div class="card"><p class="note" style="margin:0">${l}</p><p class="kpi">${v}</p><p class="note" style="margin:0">${n || '&nbsp;'}</p></div>`;
      const need = (l, w) => `<div class="card" style="border-style:dashed"><p class="note" style="margin:0">${l}</p><p class="kpi" style="font-size:16px">Data integration required</p><p class="note" style="margin:0">${w}</p></div>`;
      const opt = (l, k, vals, all2) => `<div class="field"><label>${l}</label><select data-mk="${k}"><option value="">${all2}</option>${vals.map(v => `<option value="${q(v[0])}"${MK[k] === v[0] ? ' selected' : ''}>${q(v[1])}</option>`).join('')}</select></div>`;
      const mOpt = months.map(m => [m, m]).concat([['all', 'All loaded days']]);
      const filt = (extra, noExec) => `<div class="controls"><div class="field"><label>Period</label><select data-mk="month">${mOpt.map(v => `<option value="${v[0]}"${MK.month === v[0] ? ' selected' : ''}>${v[1]}</option>`).join('')}</select></div>${opt('Branch', 'loc', [...new Set(mrows.map(r => r.loc))].sort().map(v => [v, tc(v)]), 'All branches')}${noExec ? '' : opt('Executive', 'exec', [...new Set(mrows.map(ec))].sort().map(v => [v, v]), 'All executives')}${opt('OPD / IPD', 'kind', [['OPD', 'OPD'], ['IPD', 'IPD']], 'Both')}${extra || ''}<span style="margin-left:auto;display:flex;gap:8px"><button type="button" class="btn ghost sm" id="mkcsv">Export (Excel / CSV)</button><button type="button" class="btn ghost sm" onclick="window.print()">Print / PDF</button></span></div>`;
      const banner = demoOn ? '<div class="mkdemo"><span><b>Demo data on.</b> Targets and leads are samples. Patients, OPD / IPD and revenue are real billing data.</span><button type="button" class="btn ghost sm" id="mkdemo">Turn off</button></div>' : '<div class="mkdemo off"><span>Demo data is off.</span><button type="button" class="btn ghost sm" id="mkdemo">Use demo data</button></div>';
      const codes = Object.keys(A);
      const rowsE = roster.filter(c => A[c] || ex(c).monthly).map(c => { const a = A[c] || { pts: new Set(), opd: new Set(), adm: new Set(), conv: new Set(), net: 0 }, t = tgt(c), acq = a.pts.size; return { c, a, t, acq, lead: leadOf(c, acq), appt: apptOf(c, acq), ach: t ? 100 * acq / t : null, st: stat(c, acq) }; });
      let html = '';
      if (!mrows.length) { host.innerHTML = '<div class="card"><h2>No marketing referrals loaded</h2><p class="note" style="margin:0">Marketing executives come from the bill register export (referral type MARKETING).</p></div>'; return; }
      if (pn === 'p-mk') {
        const tA = rowsE.filter(r => r.t && active(r.c)), tTot = tA.reduce((a, r) => a + r.t, 0), aTot = tA.reduce((a, r) => a + r.acq, 0), allPts = new Set(cur.map(r => r.umr)).size;
        const opdP = new Set(cur.filter(r => kd(r) === 'OPD').map(r => r.umr)).size, adm = new Set(cur.filter(r => kd(r) === 'IPD' && r.admn).map(r => r.admn)).size, rev = cur.reduce((a, r) => a + (r.net || 0), 0);
        const pct = tTot ? 100 * aTot / tTot : null, exp = 100 * frac;
        const leadTot = rowsE.filter(r => active(r.c)).reduce((a, r) => a + (r.lead || 0), 0), apptTot = rowsE.filter(r => active(r.c)).reduce((a, r) => a + (r.appt || 0), 0);
        const withT = rowsE.filter(r => r.t && active(r.c)).sort((a, b) => b.ach - a.ach), top = withT[0], low = withT[withT.length - 1];
        const cnt = k => rowsE.filter(r => active(r.c) && r.st[0] === k).length;
        const ranked = withT.slice(), shown = ranked.filter(r => MK.st === 'all' || (MK.st === 'pending' ? r.ach < 100 : r.st[0] === MK.st));
        const mixed = (() => { const C = shown.filter(r => r.ach >= 100).slice(0, 4), P = shown.filter(r => r.ach < 100), pk = P.length <= 8 ? P : Array.from({ length: 8 }, (_, i) => P[Math.round(i * (P.length - 1) / 7)]); return [...C, ...pk].sort((a, b) => b.ach - a.ach); })();
        const scList = MK.more ? shown : (MK.st === 'all' && shown.length > 12 ? mixed : shown.slice(0, 12));
        const SC = { 'Target achieved': ['#14B8A6', '#047857'], 'On track': ['#38BDF8', '#0369A1'], 'Needs attention': ['#F59E0B', '#92400E'], 'Target at risk': ['#F87171', '#B91C1C'] };
        const pcard = (t, r) => r ? `<div class="card"><h2>${t}</h2><div class="pf-who"><span class="pf-av">${q(r.c.slice(0, 2))}</span><div><b>${q(r.c)}</b><span>${tc(branch(r.c))}</span></div></div><div class="pf-mini"><div><b>${N(r.t)}</b>Target${dm}</div><div><b>${N(r.acq)}</b>Acquired</div><div><b>${r.ach.toFixed(0)}%</b>Achieved</div><div><b>${N(Math.max(r.t - r.acq, 0))}</b>Remaining</div><div>${sb(r.c)}</div></div></div>` : '';
        const sorters = { ach: (a, b) => (b.ach == null ? -1 : b.ach) - (a.ach == null ? -1 : a.ach), pts: (a, b) => b.acq - a.acq, ipd: (a, b) => b.a.adm.size - a.a.adm.size, rev: (a, b) => b.a.net - a.a.net };
        const team = rowsE.slice().sort(sorters[MK.sort]);
        const sel = MK.sel && A[MK.sel] ? MK.sel : (team[0] || {}).c; MK.sel = sel;
        const sa = A[sel] || { pts: new Set(), opd: new Set(), adm: new Set(), net: 0, n: 0 }, sp = AP[sel] || { pts: new Set(), adm: new Set(), net: 0 }, st3 = stat(sel, sa.pts.size), tS = tgt(sel);
        const dlt = (c2, p2) => p2 ? `${c2 >= p2 ? '+' : ''}${(100 * (c2 - p2) / p2).toFixed(0)}% vs ${pm}` : 'no earlier month';
        const per = (rows, key) => { const m = {}; rows.forEach(r => { const k = key(r); (m[k] = m[k] || new Set()).add(r.umr); }); return m; };
        const wk = d => { const t = new Date(d + 'T00:00:00Z'), w = (t.getUTCDay() + 6) % 7; t.setUTCDate(t.getUTCDate() - w); return t.toISOString().slice(0, 10); };
        const key = MK.gran === 'month' ? r => r.bdate.slice(0, 7) : MK.gran === 'week' ? r => wk(r.bdate) : r => r.bdate;
        const trRows = mrows.filter(fl), tm = per(trRows, key), ks = Object.keys(tm).sort();
        const W = 860, H = 220, PL = 46, PB = 36, PT = 12, mx = Math.max(...ks.map(k => tm[k].size), 1) * 1.15, bw = (W - PL - 10) / Math.max(ks.length, 1), y = v => PT + (H - PT - PB) * (1 - v / mx), st2 = Math.ceil(ks.length / 12), lab = k => MK.gran === 'month' ? k : mkDay(k);
        let g = ''; for (let i = 0; i <= 4; i++) { const v = mx * i / 4; g += `<line x1="${PL}" x2="${W}" y1="${y(v)}" y2="${y(v)}" stroke="#E2E8F0"/><text x="${PL - 8}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="#64748B" font-family="Inter">${N(v)}</text>`; }
        ks.forEach((k, i) => { const x = PL + i * bw + bw * .14; g += `<rect class="hitbar" x="${x}" y="${y(tm[k].size)}" width="${bw * .72}" height="${Math.max(1, H - PB - y(tm[k].size))}" rx="2" fill="#14B8A6" data-tip="${q('<span class="t">' + lab(k) + '</span>' + N(tm[k].size) + ' patients')}"/>`; if (i % st2 === 0) g += `<text x="${x + bw * .36}" y="${H - PB + 16}" text-anchor="middle" font-size="10.5" fill="#64748B" font-family="Inter">${lab(k)}</text>`; });
        const srcRows = all.filter(r => r.r1t && r.r1t !== 'Walk-in' && inM(r, MK.month) && (!MK.loc || r.loc === MK.loc) && (!MK.kind || kd(r) === MK.kind)), sm = {};
        srcRows.forEach(r => { const o = sm[r.r1t] = sm[r.r1t] || { k: r.r1t, pts: new Set(), opd: new Set(), adm: new Set(), net: 0, n: 0 }; o.pts.add(r.umr); if (kd(r) === 'OPD') o.opd.add(r.umr); else if (r.admn) o.adm.add(r.admn); o.net += r.net || 0; o.n++; });
        const sl = Object.values(sm).sort((a, b) => b.pts.size - a.pts.size), sTot = sl.reduce((a, o) => a + o.pts.size, 0) || 1;
        const monthsTbl = months.slice().reverse().map(m => { const rr = mrows.filter(r => inM(r, m) && fl(r)); return { m, p: new Set(rr.map(r => r.umr)).size, o: rr.filter(r => kd(r) === 'OPD').reduce((a, r) => a + (r.net || 0), 0), i: rr.filter(r => kd(r) === 'IPD').reduce((a, r) => a + (r.net || 0), 0) }; });
        const recent = (() => { const rr = cur.filter(r => ec(r) === sel).sort((a, b) => a.bdate < b.bdate ? 1 : -1).slice(0, 8); return rr.length ? `<h3 style="margin:18px 0 6px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#64748B">Recent referrals</h3><table class="btx"><thead><tr><th class="l">Date</th><th class="l">UHID</th><th>OPD / IPD</th><th>Revenue</th></tr></thead><tbody>${rr.map(r => `<tr><td class="l">${r.bdate}</td><td class="l">${q(r.umr)}</td><td>${kd(r)}</td><td><b>${N(r.net)}</b></td></tr>`).join('')}</tbody></table>` : ''; })();
        const fun = [['Referrals received' + dm, demoOn ? leadTot : null], ['Appointments scheduled' + dm, demoOn ? apptTot : null], ['Patients visited (billed)', allPts], ['OPD patients', opdP], ['IPD admissions', adm], ['Converted (with revenue)', new Set(cur.filter(r => (r.net || 0) > 0).map(r => r.umr)).size]];
        const fmx = Math.max(allPts, leadTot, 1);
        html = filt('', true) + banner + `<div class="mkkpis">${kk('Marketing executives', rowsE.filter(r => active(r.c)).length, N(codes.length) + ' with patients this period')}${kk('Patients acquired', N(allPts), N(opdP) + ' OPD · ' + N(adm) + ' IPD admissions')}${demoOn ? kp('Referrals received (demo)', N(leadTot), leadTot ? (100 * allPts / leadTot).toFixed(0) + '% became patients' : '') : kk('Referrals received', '—', 'needs referral records')}${kk('Revenue through marketing', RS(rev), 'billed revenue of these patients')}${kk('Overall target achievement', pct == null ? '—' : pct.toFixed(0) + '%', tTot ? N(aTot) + ' of ' + N(tTot) + ' patients' + dm : 'no targets assigned yet')}${kk('Target still to go', tTot ? N(Math.max(tTot - aTot, 0)) : '—', tTot && aTot > tTot ? N(aTot - tTot) + ' above target' : 'for the whole team')}</div>
  <div class="mkseg">${[['targets', 'Targets and performance'], ['funnel', 'Funnel and revenue'], ['sources', 'Sources and trends']].map(v => `<button type="button" class="${MK.view === v[0] ? 'on' : ''}" data-mkview="${v[0]}">${v[1]}</button>`).join('')}</div>
  ${MK.view === 'targets' ? `<div class="card" style="margin-top:16px"><h2>Who has completed their target</h2>
  <p class="note" style="margin:0 0 10px">${tTot ? 'Coloured bar = patients acquired. Black line = where an executive should be by now (' + exp.toFixed(0) + '% of the period gone).' + (demoOn ? ' Targets are demonstration values.' : '') : 'No targets assigned. Add monthly targets in Executives &amp; targets.'}</p>
  ${tTot ? `<div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:2px"><span><b>Whole team: ${N(aTot)}</b> of ${N(tTot)} patients</span><span>${pct.toFixed(0)}% achieved</span></div>${pbar(pct, exp)}` : ''}
  ${ranked.length ? `<div class="mkhl"><span>Top performer: <b>${q(ranked[0].c)}</b> (${ranked[0].ach.toFixed(0)}%)</span><span>Lowest: <b>${q(ranked[ranked.length - 1].c)}</b> (${ranked[ranked.length - 1].ach.toFixed(0)}%)</span></div>` : ''}
  <div class="dchips" style="margin:12px 0 4px">${[['all', 'All', ranked.length], ['Target achieved', 'Completed', cnt('Target achieved')], ['pending', 'Pending', ranked.filter(r => r.ach < 100).length], ['On track', 'On track', cnt('On track')], ['Needs attention', 'Needs attention', cnt('Needs attention')], ['Target at risk', 'At risk', cnt('Target at risk')]].map(c2 => `<button type="button" class="dchip${MK.st === c2[0] ? ' on' : ''}" data-mkst="${c2[0]}">${c2[1]} <b>${c2[2]}</b></button>`).join('')}</div>
  ${!MK.more && MK.st === 'all' && shown.length > 12 ? '<p class="note" style="margin:8px 0 0">Showing 4 completed and 8 pending executives. Use the buttons above to see one group, or show all.</p>' : ''}
  <div class="mkhead"><span>#</span><span>Executive</span><span>Progress</span><span>Achieved</span><span>Status</span></div>
  ${scList.map(r => { const col = SC[r.st[0]] || ['#94A3B8', '#475569'], rk = ranked.indexOf(r), over = Math.max(r.acq - r.t, 0), left = Math.max(r.t - r.acq, 0); return `<div class="mkrow${r.ach >= 100 ? ' done' : ''}" data-ex="${q(r.c)}"><span class="rank">${rk + 1}</span><div><b class="docname">${q(r.c)}</b>${rk === 0 ? ' <span class="tag" style="background:#E3F7EF;color:#047857">Top performer</span>' : (rk === ranked.length - 1 && ranked.length > 1 ? ' <span class="tag" style="background:#FDE6EA;color:#9F1239">Lowest</span>' : '')}<span class="mkt">${tc(branch(r.c))}</span></div><div>${pbar(r.ach, 100 * frac, col[0])}<span class="mkt">${N(r.acq)} of ${N(r.t)} patients${dm}</span></div><b class="mkpct" style="color:${col[1]}">${r.ach.toFixed(0)}%</b><div>${sb(r.c)}<span class="mkt">${r.ach >= 100 ? 'Completed' + (over ? ', ' + N(over) + ' extra' : '') : N(left) + ' more to go'}</span></div></div>`; }).join('') || '<p class="note">No executives in this group.</p>'}
  ${shown.length > 12 ? `<div style="text-align:center;margin-top:10px"><button type="button" class="btn ghost sm" id="mkmore">${MK.more ? 'Show the summary view' : 'Show all ' + shown.length + ' executives'}</button></div>` : ''}</div>
  <details class="dept" style="margin-top:16px"><summary><span class="dname">Detailed team table: leads, conversion, OPD, IPD and revenue</span></summary><div class="inner" style="padding:0 16px 16px">
  <div class="card" style="margin-top:16px"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px"><h2 style="margin:0">Marketing team performance</h2><div class="field" style="flex-direction:row;align-items:center;gap:8px"><label>Sort by</label><select data-mk="sort">${[['ach', 'Highest achievement'], ['pts', 'Highest patient acquisition'], ['ipd', 'Highest IPD admissions'], ['rev', 'Highest revenue']].map(v => `<option value="${v[0]}"${MK.sort === v[0] ? ' selected' : ''}>${v[1]}</option>`).join('')}</select></div></div>
  <div class="lgscroll" style="margin-top:10px"><table><thead><tr><th class="l">Executive</th><th class="l">Branch</th><th>Target${dm}</th><th>Leads received${dm}</th><th>Patients acquired</th><th>Conversion${dm}</th><th>Achievement</th><th>OPD patients</th><th>IPD admissions</th><th>Revenue</th><th class="l">Status</th></tr></thead><tbody>${team.map(r => `<tr class="brrow${r.c === sel ? ' open' : ''}" data-ex="${q(r.c)}"><td class="l"><b class="docname">${q(r.c)}</b>${active(r.c) ? '' : ' <span class="tag">inactive</span>'}</td><td class="l">${tc(branch(r.c))}</td><td>${r.t ? N(r.t) : '—'}</td><td>${r.lead == null ? '—' : N(r.lead)}</td><td><b>${N(r.acq)}</b></td><td>${r.lead ? (100 * r.acq / r.lead).toFixed(0) + '%' : '—'}</td><td style="min-width:130px">${r.ach == null ? '—' : r.ach.toFixed(0) + '%' + pbar(r.ach, 100 * frac)}</td><td>${N(r.a.opd.size)}</td><td>${N(r.a.adm.size)}</td><td>${RS(r.a.net)}</td><td class="l">${sb(r.c)}</td></tr>`).join('')}</tbody></table></div></div>
  </div></details>` : ''}
  ${MK.view === 'funnel' ? `<div class="grid2"><div class="card"><h2>Referral conversion funnel</h2><table class="btx"><tbody>${fun.map((f, i) => `<tr><td class="l">${f[0]}</td><td style="width:60%">${f[1] == null ? `<span class="note">Data integration required</span>` : `<b>${N(f[1])}</b>${i < 3 ? '' : ` <span class="note">(${allPts ? (100 * f[1] / allPts).toFixed(0) : 0}% of visited)</span>`}<span class="bar" style="width:${Math.max(3, 100 * f[1] / fmx)}%"></span>`}</td></tr>`).join('')}</tbody></table></div>
  <div class="card"><h2>Marketing revenue</h2><table class="btx"><thead><tr><th class="l">Month</th><th>Patients</th><th>OPD revenue</th><th>IPD revenue</th><th>Total</th></tr></thead><tbody>${monthsTbl.map(m => `<tr><td class="l">${m.m}</td><td>${N(m.p)}</td><td>${RS(m.o)}</td><td>${RS(m.i)}</td><td><b>${RS(m.o + m.i)}</b></td></tr>`).join('')}</tbody></table></div></div>
  ` : ''}
  ${MK.view === 'sources' ? `<div class="card" style="margin-top:16px"><h2>Referral source analysis</h2><div style="overflow-x:auto"><table class="btx"><thead><tr><th class="l">Referral source</th><th>Referral bills</th><th>Patients</th><th>OPD patients</th><th>IPD admissions</th><th>Share of patients</th><th>Revenue</th></tr></thead><tbody>${sl.map(o => `<tr><td class="l">${tc(o.k)}</td><td>${N(o.n)}</td><td><b>${N(o.pts.size)}</b></td><td>${N(o.opd.size)}</td><td>${N(o.adm.size)}</td><td>${(100 * o.pts.size / sTot).toFixed(1)}%<span class="bar" style="width:${Math.max(3, 100 * o.pts.size / (sl[0].pts.size || 1))}%"></span></td><td>${RS(o.net)}</td></tr>`).join('')}</tbody></table></div><p class="note" style="margin:8px 0 0">Walk-ins excluded. Clinic and camp / health-event sources are not recorded separately in the data.</p></div>
  <div class="card" style="margin-top:16px"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px"><h2 style="margin:0">Patients acquired over time</h2><div class="field" style="flex-direction:row;align-items:center;gap:8px"><label>View</label><select data-mk="gran">${[['day', 'Daily'], ['week', 'Weekly'], ['month', 'Monthly']].map(v => `<option value="${v[0]}"${MK.gran === v[0] ? ' selected' : ''}>${v[1]}</option>`).join('')}</select></div></div><svg viewBox="0 0 ${W} ${H}">${g}</svg></div>` : ''}
  ${MK.open ? `<div class="mkdrawer-bg" data-mkclose></div><aside class="mkdrawer"><button type="button" class="mkx" data-mkclose aria-label="Close">&times;</button><div class="card" id="mkind" style="margin-top:16px"><h2>Individual performance: ${q(sel)}</h2><p class="note">Click a name in the table above to change executive.</p>
  <div class="grid3" style="margin-top:0">${kp('Personal target', tS ? N(tS) : '—', sb(sel))}${kp('Actual achievement', N(sa.pts.size), tS ? (100 * sa.pts.size / tS).toFixed(0) + '% achieved' : 'no target set')}${kp('Leads received' + dm, demoOn ? N(leadOf(sel, sa.pts.size)) : '—', demoOn && leadOf(sel, sa.pts.size) ? (100 * sa.pts.size / leadOf(sel, sa.pts.size)).toFixed(0) + '% converted' : 'needs referral records')}${kp('Remaining target', tS ? N(Math.max(tS - sa.pts.size, 0)) : '—', tS && sa.pts.size > tS ? N(sa.pts.size - tS) + ' above target' : '')}${kp('OPD patients / IPD admissions', N(sa.opd.size) + ' / ' + N(sa.adm.size), '')}${kp('Revenue generated', RS(sa.net), dlt(sa.net, sp.net))}${kp('Previous month', pm ? N(sp.pts.size) + ' patients' : '—', pm ? dlt(sa.pts.size, sp.pts.size) : '')}</div></div>${recent}</aside>` : ''}`;
      }
      if (pn === 'p-me') {
        const hist = MKS.hist.slice(-25).reverse(), all2 = [...new Set([...mrows.map(ec), ...Object.keys(MKS.execs)])].sort();
        const inp = (c, f, t, w) => `<input data-mkf="${q(c)}|${f}" type="${t || 'text'}" value="${q(ex(c)[f] || '')}" style="min-width:0;width:${w || 90}px;padding:5px 7px;font-size:12px"${t === 'number' ? ` placeholder="${f === 'monthly' ? (demoOn && !ex(c).monthly ? 'demo ' + demoTgt(c) : '') : 'auto'}"` : ''}>`;
        const locs = [...new Set(mrows.map(r => r.loc))].sort();
        html = banner + `<div class="card" style="margin-top:14px"><h2>Add a marketing executive</h2><div class="controls" style="border:0;padding:0;margin:0;box-shadow:none"><div class="field"><label>Name or code</label><input id="mkn" placeholder="e.g. BODUPPAL-SR"></div><div class="field"><label>Employee ID</label><input id="mki" style="min-width:110px"></div><div class="field"><label>Branch</label><select id="mkb"><option value="">—</option>${locs.map(l => `<option>${tc(l)}</option>`).join('')}</select></div><div class="field"><label>Territory</label><input id="mkt" style="min-width:120px"></div><div class="field"><label>Monthly patient target</label><input id="mkm" type="number" style="min-width:110px"></div><button type="button" class="btn" id="mkadd">Add</button></div></div>
  <div class="card" style="margin-top:16px"><h2>Executives and targets</h2><p class="note">Targets are monthly patient counts. Weekly, daily, quarterly and yearly targets are worked out from the monthly figure unless you type one. Changes are logged below.</p>
  <div class="lgscroll"><table><thead><tr><th class="l">Executive</th><th class="l">Branch</th><th class="l">Employee ID</th><th class="l">Territory</th><th class="l">Contact</th><th class="l">Joined</th><th class="l">Status</th><th>Monthly</th><th>OPD</th><th>IPD</th><th>Weekly</th><th>Daily</th><th>Quarterly</th><th>Yearly</th></tr></thead><tbody>${all2.map(c => `<tr><td class="l"><b>${q(c)}</b></td><td class="l">${tc(branch(c))}</td><td class="l">${inp(c, 'id')}</td><td class="l">${inp(c, 'territory', 'text', 110)}</td><td class="l">${inp(c, 'contact', 'text', 110)}</td><td class="l">${inp(c, 'joined', 'date', 130)}</td><td class="l"><select data-mkf="${q(c)}|status" style="min-width:0;padding:5px 7px;font-size:12px"><option${active(c) ? ' selected' : ''}>Active</option><option${active(c) ? '' : ' selected'}>Inactive</option></select></td><td>${inp(c, 'monthly', 'number', 80)}</td><td>${inp(c, 'opd', 'number', 70)}</td><td>${inp(c, 'ipd', 'number', 70)}</td><td>${inp(c, 'weekly', 'number', 70)}</td><td>${inp(c, 'daily', 'number', 70)}</td><td>${inp(c, 'quarterly', 'number', 80)}</td><td>${inp(c, 'yearly', 'number', 80)}</td></tr>`).join('')}</tbody></table></div></div>
  <div class="card" style="margin-top:16px"><h2>Target and detail change history</h2>${hist.length ? `<table class="btx"><thead><tr><th class="l">When</th><th class="l">Executive</th><th class="l">Field</th><th>Old</th><th>New</th></tr></thead><tbody>${hist.map(h => `<tr><td class="l">${q(h.t)}</td><td class="l">${q(h.c)}</td><td class="l">${q(h.f)}</td><td>${q(h.o) || '—'}</td><td><b>${q(h.n) || '—'}</b></td></tr>`).join('')}</tbody></table>` : '<p class="note" style="margin:0">No changes yet.</p>'}</div>
  <p class="note" style="margin-top:10px">Saved in this browser only. Role-based access needs a login system, which this file does not have.</p>`;
      }
      if (pn === 'p-mr') {
        const srcs = [...new Set(all.map(r => r.r1t).filter(x => x && x !== 'Walk-in'))].sort(), SR = MK.src || 'MARKETING';
        const rr = all.filter(r => r.r1t === SR && inM(r, MK.month) && (!MK.loc || r.loc === MK.loc) && (!MK.exec || ec(r) === MK.exec) && (!MK.kind || kd(r) === MK.kind) && (!MK.q || (r.umr + ' ' + r.r1 + ' ' + r.r2 + ' ' + r.dept).toLowerCase().includes(MK.q.toLowerCase()))).sort((a, b) => a.bdate < b.bdate ? 1 : -1);
        html = filt(`<div class="field"><label>Referral source</label><select data-mk="src">${srcs.map(v => `<option value="${q(v)}"${SR === v ? ' selected' : ''}>${tc(v)}</option>`).join('')}</select></div><div class="field"><label>Search</label><input type="search" id="mkq" value="${q(MK.q)}" placeholder="UHID, executive, department"></div>`) + `<div class="card" style="margin-top:16px"><h2>Referral records</h2><p class="note">${N(rr.length)} bills · ${N(new Set(rr.map(r => r.umr)).size)} unique patients${rr.length > 300 ? ' · showing the latest 300' : ''}. Patient names are not stored; UHID identifies the patient.</p>
  <div class="lgscroll"><table><thead><tr><th class="l">Date</th><th class="l">Executive</th><th class="l">Referral source</th><th class="l">Referring doctor / organisation</th><th class="l">UHID</th><th class="l">Department</th><th>OPD / IPD</th><th class="l">Bill</th><th>Revenue</th></tr></thead><tbody>${rr.slice(0, 300).map(r => `<tr><td class="l">${r.bdate}</td><td class="l">${SR === 'MARKETING' ? q(ec(r)) : '—'}</td><td class="l">${tc(r.r1t)}</td><td class="l">${q(SR === 'MARKETING' ? r.r2 : r.r1) || '—'}</td><td class="l">${q(r.umr)}</td><td class="l">${tc(r.dept)}</td><td>${kd(r)}</td><td class="l">${q(r.bill)}</td><td><b>${N(r.net)}</b></td></tr>`).join('')}</tbody></table></div></div>`;
      }
      host.innerHTML = html;
      host.querySelectorAll('[data-mk]').forEach(s2 => { s2.onchange = () => { MK[s2.dataset.mk] = s2.value; drawMk(pn); }; });
      host.querySelectorAll('[data-ex]').forEach(t => { t.onclick = () => { MK.sel = t.dataset.ex; MK.open = 1; drawMk(pn); }; });
      host.querySelectorAll('[data-mkst]').forEach(b => { b.onclick = () => { MK.st = b.dataset.mkst; MK.more = false; drawMk(pn); }; });
      host.querySelectorAll('[data-mkview]').forEach(b => { b.onclick = () => { MK.view = b.dataset.mkview; drawMk(pn); }; });
      host.querySelectorAll('[data-mkclose]').forEach(b => { b.onclick = () => { MK.open = 0; drawMk(pn); }; });
      const mm2 = host.querySelector('#mkmore'); if (mm2) mm2.onclick = () => { MK.more = !MK.more; drawMk(pn); };
      if (MK.go) { const e2 = host.querySelector('#mkind'); if (e2) e2.scrollIntoView({ behavior: 'smooth', block: 'start' }); MK.go = 0; }
      const dmb = host.querySelector('#mkdemo'); if (dmb) dmb.onclick = () => { MKS.demo = !demoOn; mkSave(); drawMk(pn); };
      const cv = host.querySelector('#mkcsv'); if (cv) cv.onclick = () => { const b = document.getElementById('hcsv'); if (b) b.click(); };
      const mq = host.querySelector('#mkq'); if (mq) mq.oninput = () => { MK.q = mq.value; MK.fq = 1; drawMk(pn); }; if (mq && MK.fq) { mq.focus(); mq.setSelectionRange(mq.value.length, mq.value.length); MK.fq = 0; }
      host.querySelectorAll('[data-mkf]').forEach(i2 => { i2.onchange = () => { const [c, f] = i2.dataset.mkf.split('|'), e = MKS.execs[c] = MKS.execs[c] || {}, o = e[f] == null ? '' : String(e[f]); let v = i2.value; if (f === 'status') v = v; else if (i2.type === 'number') v = v === '' ? '' : +v; e[f] = v; if (String(v) !== o) MKS.hist.push({ t: new Date().toLocaleString('en-IN'), c, f, o, n: String(v) }); mkSave(); drawMk(pn); }; });
      const ad = host.querySelector('#mkadd'); if (ad) ad.onclick = () => { const c = host.querySelector('#mkn').value.trim().toUpperCase(); if (!c) return; MKS.execs[c] = Object.assign(MKS.execs[c] || {}, { id: host.querySelector('#mki').value, branch: host.querySelector('#mkb').value, territory: host.querySelector('#mkt').value, monthly: +host.querySelector('#mkm').value || '' }); MKS.hist.push({ t: new Date().toLocaleString('en-IN'), c, f: 'added', o: '', n: 'executive added' }); mkSave(); drawMk(pn); };
      mkTips(host);
    } catch (e) { console.error(e); host.innerHTML = '<div class="card"><h2>This view could not be drawn</h2></div>'; }
  }

  const mkRenderAll = () => Object.keys(MKROOT).forEach(drawMk);
  const mkPrevReady = window.__PRESCO_ENHANCER_READY;
  window.__PRESCO_ENHANCER_READY = payload => {
    if (typeof mkPrevReady === 'function') mkPrevReady(payload);
    MKRT = payload || MKRT;
    mkRenderAll();
  };
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && MK.open) { MK.open = 0; drawMk('p-mk'); } });
  document.addEventListener('click', e => {
    const b = e.target.closest('button[role="tab"]');
    if (b && MKTAB[b.id] && MKRT.store) setTimeout(() => drawMk(MKTAB[b.id]), 0);
  });
})();

/* =====================================================================
   CLAIMS, BRANCH COMPARISON, NEW DOCTORS AND SIDEBAR "AT A GLANCE"
   Receivables, ageing, daily collections and bed occupancy come from the management dashboard report.
   Claim status is derived from bill receipts in the bill register (settled / part-received / pending);
   approval and rejection status is not recorded in the loaded reports.
   ===================================================================== */
(function () {
  'use strict';
  let XR = { store: null, getBillRows: null, data: null };
  const ROOT = { clov: 'clovDashboard', clar: 'clarDashboard', clpy: 'clpyDashboard', clrec: 'clrecDashboard', brc: 'brcDashboard', nd: 'ndDashboard', bdov: 'bdovDashboard', bdfc: 'bdfcDashboard', bddp: 'bddpDashboard', bdwd: 'bdwdDashboard' };
  const TABS = { 't-clov': 'clov', 't-clar': 'clar', 't-clpy': 'clpy', 't-clrec': 'clrec', 't-brc': 'brc', 't-newdoc': 'nd', 't-bdov': 'bdov', 't-bdfc': 'bdfc', 't-bddp': 'bddp', 't-bdwd': 'bdwd' };
  const XS = { loc: '', dept: '', pay: '', stat: '', q: '', month: '', a: '', b: '', from: '', to: '', ageMin: '', ageMax: '' };
  const N = n => Math.round(n || 0).toLocaleString('en-IN');
  const C = n => { const a = Math.abs(n || 0); return a >= 1e7 ? (n / 1e7).toFixed(2) + ' Cr' : a >= 1e5 ? (n / 1e5).toFixed(2) + ' L' : N(n); };
  const RS = n => '₹' + C(n), q = t => String(t == null ? '' : t).replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const tc = t => String(t || '').toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase());
  const active = r => !r.st || r.st === 'A';
  const dl = iso => new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  const addDays = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
  const payOf = r => {
    const c = String(r.cmp || '').toUpperCase(), t = r.ctype;
    if (/PMJAY|AYUSHMAN|PM-JAY/.test(c)) return 'PMJAY';
    if (/AAROGYASRI|\bEHS\b|EHS-|CGHS|ESIC|ECHS|CMCHIS/.test(c) || t === 'Govt/Psu') return 'Government schemes';
    if (/TPA/.test(c)) return 'TPA';
    if (t === 'Insurance' || /INSURANCE|ASSURANCE|LOMBARD/.test(c)) return 'Insurance';
    if (t === 'Corporate') return 'Corporate';
    if (!c || c === 'GENERAL' || /CASH/.test(c) || !t) return 'Cash / general';
    return 'Other';
  };
  const kindOf = r => r.tran === 'OPP' ? 'Pharmacy' : r.tran === 'OP' ? 'OPD' : /^ER IP FINAL|-ER$/i.test(r.type) ? 'ER' : 'IPD';
  const snaps = () => ((XR.store && XR.store.snapshots) || []).filter(s => s.data && s.data.kpi).slice().sort((a, b) => a.asOf < b.asOf ? -1 : 1);
  const kk = (l, v, n, tone) => `<div class="mkk"><span>${l}</span><b${tone ? ` style="color:${tone}"` : ''}>${v}</b><small>${n || '&nbsp;'}</small></div>`;
  const card = (t, body, note) => `<div class="card" style="margin-top:16px"><h2>${t}</h2>${note ? `<p class="note">${note}</p>` : ''}${body}</div>`;
  const empty = (t, w) => `<div class="card" style="margin-top:16px"><h2>${t}</h2><p class="note" style="margin:0">${w}</p></div>`;
  const opt = (l, k, vals, all) => `<div class="field"><label>${l}</label><select data-xs="${k}"><option value="">${all}</option>${vals.map(v => `<option value="${q(v[0])}"${XS[k] === v[0] ? ' selected' : ''}>${q(v[1])}</option>`).join('')}</select></div>`;
  const tips = host => {
    if (host.__xt) return; host.__xt = true; const el = () => document.getElementById('tip');
    host.addEventListener('mousemove', e => { const t = e.target.closest('[data-tip]'), x = el(); if (!x) return; if (!t) { x.classList.remove('on'); return; } x.innerHTML = t.dataset.tip; x.classList.add('on'); x.style.left = Math.min(e.clientX + 14, window.innerWidth - 290) + 'px'; x.style.top = (e.clientY + 16) + 'px'; });
    host.addEventListener('mouseleave', () => { const x = el(); if (x) x.classList.remove('on'); });
  };
  const bars = (items, o) => {
    o = o || {}; const W = 860, H = 220, PL = 56, PB = 34, PT = 12, mx = Math.max(...items.map(i => i.v), 1) * 1.15, bw = (W - PL - 10) / Math.max(items.length, 1), y = v => PT + (H - PT - PB) * (1 - v / mx), st = Math.ceil(items.length / 14);
    let g = ''; for (let i = 0; i <= 4; i++) { const v = mx * i / 4; g += `<line x1="${PL}" x2="${W}" y1="${y(v)}" y2="${y(v)}" stroke="#E2E8F0"/><text x="${PL - 8}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="#64748B" font-family="Inter">${C(v)}</text>`; }
    items.forEach((it, i) => { const x = PL + i * bw + bw * .14; g += `<rect class="hitbar" x="${x}" y="${y(it.v)}" width="${bw * .72}" height="${Math.max(1, H - PB - y(it.v))}" rx="2" fill="${it.c || '#14B8A6'}" data-tip="${q('<span class="t">' + it.l + '</span>' + (o.fmt ? o.fmt(it.v) : RS(it.v)))}"/>`; if (i % st === 0) g += `<text x="${x + bw * .36}" y="${H - PB + 16}" text-anchor="middle" font-size="10.5" fill="#64748B" font-family="Inter">${it.l}</text>`; });
    return `<svg viewBox="0 0 ${W} ${H}">${g}</svg>`;
  };
  const line = items => {
    const W = 860, H = 200, PL = 60, PB = 30, PT = 12, mn = Math.min(...items.map(i => i.v)), mx = Math.max(...items.map(i => i.v)), lo = mn - (mx - mn) * .3, hi = mx + (mx - mn) * .15 || 1, st = (W - PL - 14) / Math.max(items.length - 1, 1), y = v => PT + (H - PT - PB) * (1 - (v - lo) / ((hi - lo) || 1)), s2 = Math.ceil(items.length / 10);
    let g = ''; for (let i = 0; i <= 3; i++) { const v = lo + (hi - lo) * i / 3; g += `<line x1="${PL}" x2="${W}" y1="${y(v)}" y2="${y(v)}" stroke="#E2E8F0"/><text x="${PL - 8}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="#64748B" font-family="Inter">${C(v)}</text>`; }
    g += `<path d="${items.map((p, i) => (i ? 'L' : 'M') + (PL + i * st) + ' ' + y(p.v)).join(' ')}" fill="none" stroke="#0D9488" stroke-width="2.5"/>`;
    items.forEach((p, i) => { g += `<circle class="hitbar" cx="${PL + i * st}" cy="${y(p.v)}" r="3.5" fill="#fff" stroke="#0D9488" stroke-width="2" data-tip="${q('<span class="t">' + p.l + '</span>' + RS(p.v))}"/>`; if (i % s2 === 0) g += `<text x="${PL + i * st}" y="${H - 8}" text-anchor="middle" font-size="10.5" fill="#64748B" font-family="Inter">${p.l}</text>`; });
    return `<svg viewBox="0 0 ${W} ${H}">${g}</svg>`;
  };
  const tbl = (head, rows, o) => `<div style="overflow-x:auto"><table class="btx"><thead><tr>${head.map((h, i) => `<th${i === 0 ? ' class="l"' : ''}>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr${o && o.cls ? ` class="${o.cls}"` : ''}>${r.map((c, i) => `<td${i === 0 ? ' class="l"' : ''}>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  const stBadge = s => `<span class="pf-v ${s === 'Settled' ? 'ok' : s === 'Part-received' ? 'ok2' : 'wl'}">${s}</span>`;
  function claims() {
    const ss = snaps(), asOf = ss.length ? ss[ss.length - 1].asOf : '';
    const age = r => asOf ? Math.max(0, Math.round((Date.parse(asOf) - Date.parse(r.bdate)) / 864e5)) : 0;
    const rows = (XR.getBillRows ? XR.getBillRows() : []).filter(r => active(r) && !/-CANCEL|-DELETED/i.test(r.type) && (r.net || 0) > 0).map(r => Object.assign({}, r, { pay: payOf(r) })).filter(r => r.pay !== 'Cash / general')
      .map(r => Object.assign(r, { stat: (r.tout || 0) <= 0.5 ? 'Settled' : (r.trcpt || 0) > 0 ? 'Part-received' : 'Pending', age: age(r) }));
    return { rows, asOf, ss };
  }
  const BUCKETS = [['0-7 days', 0, 7], ['8-15 days', 8, 15], ['16-30 days', 16, 30], ['31-60 days', 31, 60], ['Over 60 days', 61, 99999]];
  const filt = (cl, withPay) => `<div class="controls">${opt('Branch', 'loc', [...new Set(cl.rows.map(r => r.loc))].sort().map(v => [v, tc(v)]), 'All branches')}${opt('Department', 'dept', [...new Set(cl.rows.map(r => r.dept))].filter(Boolean).sort().map(v => [v, tc(v)]), 'All departments')}${opt('TPA / payer type', 'pay', [...new Set(cl.rows.map(r => r.pay))].sort().map(v => [v, v]), 'All payers')}${withPay ? opt('Payment status', 'stat', [['Settled', 'Settled'], ['Part-received', 'Part-received'], ['Pending', 'Pending']], 'All statuses') : ''}<div class="field"><label>Bill date from</label><input type="date" data-xs="from" value="${q(XS.from)}" style="min-width:0"></div><div class="field"><label>to</label><input type="date" data-xs="to" value="${q(XS.to)}" style="min-width:0"></div><button type="button" class="btn ghost sm" id="xreset">Reset filters</button></div>`;
  const apply = cl => cl.rows.filter(r => (!XS.loc || r.loc === XS.loc) && (!XS.dept || r.dept === XS.dept) && (!XS.pay || r.pay === XS.pay) && (!XS.stat || r.stat === XS.stat) && (!XS.from || r.bdate >= XS.from) && (!XS.to || r.bdate <= XS.to) && (XS.ageMin === '' || (r.stat !== 'Settled' && r.age >= XS.ageMin && r.age <= XS.ageMax)));
  const drawer = html => {
    let d = document.getElementById('xDrawer'); if (!d) { d = document.createElement('div'); d.id = 'xDrawer'; document.body.appendChild(d); }
    d.innerHTML = html ? `<div class="mkdrawer-bg" data-xc></div><aside class="mkdrawer"><button type="button" class="mkx" data-xc aria-label="Close">&times;</button>${html}</aside>` : '';
    d.querySelectorAll('[data-xc]').forEach(b => { b.onclick = () => { d.innerHTML = ''; }; });
  };
  const kv = (rows) => `<table class="btx"><tbody>${rows.map(r => `<tr><td class="l" style="color:#64748B;width:42%">${r[0]}</td><td class="l"><b>${r[1]}</b></td></tr>`).join('')}</tbody></table>`;
  const claimDrawer = (r, all) => {
    const same = all.filter(x => x.umr === r.umr && x !== r).slice(0, 8);
    drawer(`<h2 style="margin:0 0 4px">Claim details</h2><p class="note">${stBadge(r.stat)} &nbsp; ${r.age} days since billing</p>` + kv([['UHID', q(r.umr)], ['Bill no.', q(r.bill)], ['Admission no.', q(r.admn) || '—'], ['Bill date', r.bdate], ['Admission date', r.adate || '—'], ['Discharge date', r.ddate || '—'], ['Branch', tc(r.loc)], ['Department', tc(r.dept) || '—'], ['Doctor', tc(r.doc) || '—'], ['Payer type', r.pay], ['Payer', tc(r.cmp) || '—'], ['Billed (gross)', '₹' + N(r.amt)], ['Concession', '₹' + N(r.conc)], ['Net claim amount', '₹' + N(r.net)], ['Received', '₹' + N(r.trcpt)], ['Outstanding', '₹' + N(r.tout)]]) + (same.length ? `<h3 style="margin:18px 0 6px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#64748B">Other claims of this patient</h3>` + tbl(['Bill date', 'Payer', 'Net', 'Outstanding', 'Status'], same.map(x => [x.bdate, tc(x.cmp) || x.pay, N(x.net), N(x.tout), stBadge(x.stat)])) : ''));
  };
  /* ---------------- BED MANAGEMENT AND FORECASTING ---------------- */
  const XB = { loc: '', ward: '', type: '', h: 7, win: 28 };
  const wd = d => new Date(d + 'T00:00:00Z').getUTCDay(), DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const mean = a => a.reduce((x, y) => x + y, 0) / (a.length || 1);
  const bedSeries = () => snaps().map(s => { const k = s.data.kpi; return { d: s.asOf, occ: (k.occBeds || {}).today || 0, beds: (k.beds || {}).today || 0, maint: (k.maintBeds || {}).today || 0, adm: (k.ipAdm || {}).today || 0, dis: (k.discharges || {}).today || 0 }; }).filter(x => x.occ > 0 && x.beds > 0);
  const fit = (S, end) => {
    const lo = Math.max(1, end - 27), A = [0, 1, 2, 3, 4, 5, 6].map(() => []), Rr = [0, 1, 2, 3, 4, 5, 6].map(() => []), aa = [], rr = [];
    for (let i = lo; i <= end; i++) { const w = wd(S[i].d), r = S[i].dis / (S[i - 1].occ || 1); A[w].push(S[i].adm); Rr[w].push(r); aa.push(S[i].adm); rr.push(r); }
    const mA = mean(aa), mR = mean(rr); return { A: A.map(a => a.length >= 2 ? mean(a) : mA), R: Rr.map(a => a.length >= 2 ? mean(a) : mR), mA, mR };
  };
  const project = (S, i, h, P) => { const out = []; let occ = S[i].occ, d = S[i].d; for (let k = 1; k <= h; k++) { d = addDays(d, 1); const w = wd(d), dis = P.R[w] * occ; occ = Math.max(0, occ + P.A[w] - dis); out.push({ d, occ, adm: P.A[w], dis }); } return out; };
  const backtest = S => { const err = {}, pct = {}; for (let i = 14; i < S.length - 1; i++) { const f = project(S, i, Math.min(28, S.length - 1 - i), fit(S, i)); f.forEach((p, k) => { const t = S[i + k + 1]; if (!t || t.d !== p.d) return; (err[k + 1] = err[k + 1] || []).push(p.occ - t.occ); (pct[k + 1] = pct[k + 1] || []).push(Math.abs(p.occ - t.occ) / (t.occ || 1)); }); } return { err, pct }; };
  const rmse = a => Math.sqrt(mean(a.map(x => x * x)));
  const model = () => {
    const S = bedSeries(); if (S.length < 20) return null; const P = fit(S, S.length - 1), bt = backtest(S), s1 = bt.err[1] && bt.err[1].length >= 5 ? rmse(bt.err[1]) : null; if (s1 == null) return null;
    const sig = h => bt.err[h] && bt.err[h].length >= 8 ? rmse(bt.err[h]) : s1 * Math.sqrt(h), pooled = [].concat(...[1, 2, 3, 4, 5, 6, 7].map(h => bt.pct[h] || []));
    const F = project(S, S.length - 1, 28, P).map((p, k) => ({ ...p, lo: Math.max(0, p.occ - 1.96 * sig(k + 1)), hi: p.occ + 1.96 * sig(k + 1) }));
    return { S, P, F, acc: pooled.length ? 100 * (1 - mean(pooled)) : null, n: pooled.length, s1 };
  };
  const wardOf = a => String(a.ward || '').split(' / ')[0].trim() || '—', subOf = a => String(a.ward || '').split(' / ')[1] || '', bedOf = a => String(a.ward || '').split(' / ')[2] || '';
  const bedRows = () => {
    const ss = snaps(), asOf = ss.length ? ss[ss.length - 1].asOf : '', from = asOf ? addDays(asOf, -(XB.win - 1)) : '';
    return { asOf, from, rows: ((XR.store && XR.store.adm) || []).filter(a => a.date >= from && a.date <= asOf), disc: ((XR.store && XR.store.disc) || []) };
  };
  const alosOf = (disc, kf) => { const m = {}; disc.forEach(d => { if (d.stay == null) return; const k = kf(d); (m[k] = m[k] || []).push(d.stay); }); return m; };
  const bedFilt = (br, wards) => `<div class="controls">${optB('Branch', 'loc', [...new Set(br.rows.map(a => a.loc))].filter(Boolean).sort().map(v => [v, tc(v)]), 'All branches')}${optB('Ward', 'ward', wards.map(v => [v, tc(v)]), 'All wards')}${optB('Admission type', 'type', [...new Set(br.rows.map(a => a.type))].filter(Boolean).sort().map(v => [v, v]), 'All types')}<div class="field"><label>Look-back</label><select data-xb="win">${[7, 14, 28].map(v => `<option value="${v}"${XB.win === v ? ' selected' : ''}>Last ${v} days</option>`).join('')}</select></div></div>`;
  const optB = (l, k, vals, all) => `<div class="field"><label>${l}</label><select data-xb="${k}"><option value="">${all}</option>${vals.map(v => `<option value="${q(v[0])}"${String(XB[k]) === v[0] ? ' selected' : ''}>${q(v[1])}</option>`).join('')}</select></div>`;
  const wardStats = (br) => {
    const rows = br.rows.filter(a => (!XB.loc || a.loc === XB.loc) && (!XB.type || a.type === XB.type)), m = {}; const AL = alosOf(br.disc, d => String(d.ward || '').split(' / ')[0].trim()), all = [].concat(...Object.values(AL)), g = mean(all) || 0;
    rows.forEach(a => { const w = wardOf(a), o = m[w] = m[w] || { w, n: 0, beds: new Set(), subs: {}, cons: {}, pay: {}, type: {}, days: {} }; o.n++; if (bedOf(a)) o.beds.add(subOf(a) + '/' + bedOf(a)); o.subs[subOf(a)] = (o.subs[subOf(a)] || 0) + 1; o.cons[a.ck] = (o.cons[a.ck] || 0) + 1; o.pay[a.payer || 'Not recorded'] = (o.pay[a.payer || 'Not recorded'] || 0) + 1; o.type[a.type] = (o.type[a.type] || 0) + 1; o.days[a.date] = (o.days[a.date] || 0) + 1; });
    return Object.values(m).map(o => { const al = AL[o.w] && AL[o.w].length >= 5 ? mean(AL[o.w]) : g, per = o.n / XB.win; return Object.assign(o, { per, alos: al, alosN: (AL[o.w] || []).length, demand: per * al }); }).sort((a, b) => b.n - a.n);
  };
  const wardDrawer = (o, br) => {
    const top = (x, n) => Object.entries(x).sort((a, b) => b[1] - a[1]).slice(0, n);
    drawer(`<h2 style="margin:0 0 4px">${tc(o.w)}</h2><p class="note">Last ${XB.win} days to ${br.asOf}</p>` + kv([['Admissions', N(o.n)], ['Per day', o.per.toFixed(1)], ['Average length of stay', o.alos.toFixed(1) + ' days' + (o.alosN < 5 ? ' (hospital average)' : ' (' + o.alosN + ' discharges)')], ['Beds that received a patient', N(o.beds.size)], ['Bed demand (admissions per day × stay)', o.demand.toFixed(1) + ' beds']])
      + `<h3 style="margin:16px 0 6px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#64748B">Wards inside</h3>` + tbl(['Ward', 'Admissions'], top(o.subs, 8).map(x => [tc(x[0]) || '—', N(x[1])]))
      + `<h3 style="margin:16px 0 6px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#64748B">Admission type</h3>` + tbl(['Type', 'Admissions'], top(o.type, 6).map(x => [x[0], N(x[1])]))
      + `<h3 style="margin:16px 0 6px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#64748B">Top consultants</h3>` + tbl(['Consultant', 'Admissions'], top(o.cons, 8).map(x => [tc(x[0]), N(x[1])])));
  };
  function drawBed(id) {
    const host = document.getElementById(ROOT[id]); if (!host || !XR.store) return;
    try {
      const M = model(), S = M ? M.S : bedSeries(), last = S[S.length - 1];
      if (!last) { host.innerHTML = empty('No management report loaded', 'Bed counts and occupancy come from the management dashboard report.'); return; }
      const br = bedRows(), ws = wardStats(br), wardNames = [...new Set(br.rows.map(wardOf))].sort(), ready = !!M;
      const avail = last.beds - last.occ - last.maint, occPct = 100 * last.occ / last.beds, discAll = [].concat(...Object.values(alosOf(br.disc, () => 'x'))), alosRec = mean(discAll);
      let html = '';
      if (id === 'bdov') {
        const f = ws.filter(o => !XB.ward || o.w === XB.ward), mx = Math.max(...f.map(o => o.n), 1);
        const trend = S.slice(-30).map(s => ({ l: dl(s.d), v: s.occ, c: '#0D9488' }));
        html = `<div class="mkkpis">${kk('Total beds', N(last.beds), 'as on ' + last.d)}${kk('Available', N(avail), 'total less occupied and maintenance', '#047857')}${kk('Occupied', N(last.occ), occPct.toFixed(1) + '% occupancy', '#0F766E')}${kk('Reserved', 'Not recorded', 'needs the bed master')}${kk('Under maintenance', N(last.maint), (100 * last.maint / last.beds).toFixed(0) + '% of beds', '#B45309')}${kk('Blocked', 'Not recorded', 'needs the bed master')}</div>
        <div class="card" style="margin-top:12px"><div style="display:flex;height:14px;border-radius:7px;overflow:hidden;background:#E2E8F0"><div title="Occupied" style="width:${occPct}%;background:#0D9488"></div><div title="Maintenance" style="width:${100 * last.maint / last.beds}%;background:#F59E0B"></div><div title="Available" style="width:${100 * avail / last.beds}%;background:#BFE9E4"></div></div><div class="legend"><span><i class="sw" style="background:#0D9488"></i>Occupied ${N(last.occ)}</span><span><i class="sw" style="background:#F59E0B"></i>Maintenance ${N(last.maint)}</span><span><i class="sw" style="background:#BFE9E4"></i>Available ${N(avail)}</span></div></div>
        ${card('Occupied beds, last 30 days', bars(trend, { fmt: v => N(v) + ' beds' }), 'Midnight census from the management report.')}
        ${bedFilt(br, wardNames)}
        <p class="note" style="margin:8px 2px 0">Ward-wise bed counts (total, available, reserved, blocked) need the bed master. Until it is connected, each ward card shows real admission activity and the bed demand it implies. Click a card for details.</p>
        <div class="bedgrid">${f.map(o => `<div class="bedcard" data-xward="${q(o.w)}"><div class="bc-h"><b>${tc(o.w)}</b><span>${N(o.n)} admissions</span></div><div class="mkbar"><i style="width:${100 * o.n / mx}%"></i></div><div class="bc-g"><div><b>${o.per.toFixed(1)}</b>per day</div><div><b>${o.alos.toFixed(1)}</b>days stay</div><div><b>${o.demand.toFixed(1)}</b>beds needed</div><div><b>${N(o.beds.size)}</b>beds used</div></div></div>`).join('') || '<p class="note">No admissions for these filters.</p>'}</div>`;
      }
      if (id === 'bdfc') {
        if (!ready) { host.innerHTML = empty('Not enough history to forecast', 'The forecast needs at least 20 daily management reports (occupancy, admissions and discharges).'); return; }
        const h = XB.h, F = M.F.slice(0, h), cap = last.beds - last.maint, hist = S.slice(-21), all = hist.map(s => s.occ).concat(F.map(p => p.hi)), mx = Math.max(...all, cap) * 1.05, mn = Math.min(...hist.map(s => s.occ).concat(F.map(p => p.lo))) * .85;
        const W = 860, H = 260, PL = 54, PB = 34, PT = 14, n = hist.length + F.length, st = (W - PL - 14) / (n - 1), y = v => PT + (H - PT - PB) * (1 - (v - mn) / ((mx - mn) || 1)), x = i => PL + i * st;
        let g = ''; for (let i = 0; i <= 4; i++) { const v = mn + (mx - mn) * i / 4; g += `<line x1="${PL}" x2="${W}" y1="${y(v)}" y2="${y(v)}" stroke="#E2E8F0"/><text x="${PL - 8}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="#64748B" font-family="Inter">${N(v)}</text>`; }
        g += `<line x1="${PL}" x2="${W}" y1="${y(cap)}" y2="${y(cap)}" stroke="#DC2626" stroke-dasharray="5 4"/><text x="${W - 4}" y="${y(cap) - 5}" text-anchor="end" font-size="10.5" fill="#DC2626" font-family="Inter">Usable beds ${N(cap)}</text>`;
        const bandTop = F.map((p, k) => (k ? 'L' : 'M') + x(hist.length + k) + ' ' + y(p.hi)).join(' '), bandBot = F.slice().reverse().map((p, k) => 'L' + x(hist.length + F.length - 1 - k) + ' ' + y(p.lo)).join(' ');
        g += `<path d="${bandTop} ${bandBot} Z" fill="#14B8A6" opacity=".18"/>`;
        g += `<path d="${hist.map((s, i) => (i ? 'L' : 'M') + x(i) + ' ' + y(s.occ)).join(' ')}" fill="none" stroke="#0F1731" stroke-width="2.4"/><path d="M${x(hist.length - 1)} ${y(hist[hist.length - 1].occ)} ${F.map((p, k) => 'L' + x(hist.length + k) + ' ' + y(p.occ)).join(' ')}" fill="none" stroke="#0D9488" stroke-width="2.4" stroke-dasharray="6 4"/>`;
        hist.forEach((s, i) => { g += `<circle class="hitbar" cx="${x(i)}" cy="${y(s.occ)}" r="3.5" fill="#fff" stroke="#0F1731" stroke-width="2" data-tip="${q('<span class="t">' + dl(s.d) + ' (actual)</span>' + N(s.occ) + ' beds occupied')}"/>`; });
        F.forEach((p, k) => { g += `<circle class="hitbar" cx="${x(hist.length + k)}" cy="${y(p.occ)}" r="3.5" fill="#fff" stroke="#0D9488" stroke-width="2" data-tip="${q('<span class="t">' + dl(p.d) + ' (forecast)</span>' + Math.round(p.occ) + ' beds · ' + (100 * p.occ / last.beds).toFixed(1) + '%<br>Range ' + Math.round(p.lo) + ' to ' + Math.round(p.hi))}"/>`; });
        const lab = (i, d) => `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" font-size="10.5" fill="#64748B" font-family="Inter">${dl(d)}</text>`; const ev = Math.ceil(n / 9);
        hist.forEach((s, i) => { if (i % ev === 0) g += lab(i, s.d); }); F.forEach((p, k) => { if ((hist.length + k) % ev === 0) g += lab(hist.length + k, p.d); });
        const end = F[F.length - 1], peak = F.reduce((a, p) => p.occ > a.occ ? p : a, F[0]);
        const flowH = S.slice(-14), mxf = Math.max(...flowH.map(s => Math.max(s.adm, s.dis)), ...F.slice(0, 7).map(p => Math.max(p.adm, p.dis)), 1) * 1.15, fw = (W - PL - 10) / (flowH.length + 7), fy = v => 150 * (1 - v / mxf) + 8;
        let fg = '';[...flowH.map(s => ({ d: s.d, a: s.adm, b: s.dis, f: 0 })), ...F.slice(0, 7).map(p => ({ d: p.d, a: p.adm, b: p.dis, f: 1 }))].forEach((s, i) => { const x0 = PL + i * fw + fw * .08, tip = q('<span class="t">' + dl(s.d) + (s.f ? ' (forecast)' : '') + '</span>Admissions ' + Math.round(s.a) + '<br>Discharges ' + Math.round(s.b) + '<br>Net ' + (s.a - s.b >= 0 ? '+' : '') + Math.round(s.a - s.b)); fg += `<rect class="hitbar" x="${x0}" y="${fy(s.a)}" width="${fw * .38}" height="${158 - fy(s.a)}" fill="#14B8A6" opacity="${s.f ? .55 : 1}" data-tip="${tip}"/><rect class="hitbar" x="${x0 + fw * .42}" y="${fy(s.b)}" width="${fw * .38}" height="${158 - fy(s.b)}" fill="#F59E0B" opacity="${s.f ? .55 : 1}" data-tip="${tip}"/>`; if (i % 3 === 0) fg += `<text x="${x0 + fw * .4}" y="176" text-anchor="middle" font-size="10" fill="#64748B" font-family="Inter">${dl(s.d)}</text>`; });
        html = `<div class="mkkpis">${kk('Occupancy rate', occPct.toFixed(1) + '%', N(last.occ) + ' of ' + N(last.beds) + ' beds')}${kk('Average LOS', alosRec ? alosRec.toFixed(1) + ' days' : '—', discAll.length ? N(discAll.length) + ' discharges on file' : 'needs discharge reports')}${kk('Available beds', N(avail), 'after maintenance', '#047857')}${kk('Current patients', N(last.occ), 'admitted as on ' + last.d)}${kk('Forecast accuracy', M.acc == null ? '—' : M.acc.toFixed(1) + '%', '7-day, tested on ' + N(M.n) + ' past forecasts')}</div>
        <div class="mkseg">${[7, 14, 28].map(v => `<button type="button" class="${XB.h === v ? 'on' : ''}" data-xh="${v}">${v}-day forecast</button>`).join('')}</div>
        ${card('Occupied beds: actual and forecast', `<svg viewBox="0 0 ${W} ${H}">${g}</svg><div class="legend"><span><i class="sw" style="background:#0F1731"></i>Actual</span><span><i class="sw" style="background:#0D9488"></i>Forecast</span><span><i class="sw" style="background:#14B8A6;opacity:.3"></i>95% range</span><span><i class="sw" style="background:#DC2626"></i>Usable beds</span></div>`, `In ${h} days: about <b>${Math.round(end.occ)}</b> beds (${(100 * end.occ / last.beds).toFixed(1)}%), 95% range ${Math.round(end.lo)} to ${Math.round(end.hi)}. Peak in this window: ${Math.round(peak.occ)} beds on ${dl(peak.d)}.`)}
        ${card('Admission vs discharge balance', `<svg viewBox="0 0 ${W} 186">${fg}</svg><div class="legend"><span><i class="sw" style="background:#14B8A6"></i>Admissions</span><span><i class="sw" style="background:#F59E0B"></i>Discharges</span><span>Faded bars = forecast</span></div>` + tbl(['Next 7 days', 'Expected admissions', 'Expected discharges', 'Net', 'Occupied beds'], F.slice(0, 7).map(p => [dl(p.d) + ' ' + DOW[wd(p.d)], Math.round(p.adm), Math.round(p.dis), `<span class="${p.adm - p.dis >= 0 ? 'down' : 'up'}">${p.adm - p.dis >= 0 ? '+' : ''}${Math.round(p.adm - p.dis)}</span>`, Math.round(p.occ)])), 'Admissions and discharges come from the daily management reports.')}
        <p class="note" style="margin-top:10px">Method: tomorrow's occupancy = today's occupancy + expected admissions − expected discharges, using the last 28 days by weekday. The range comes from how far past forecasts missed the actual occupancy.</p>`;
      }
      if (id === 'bddp') {
        if (!ready) { host.innerHTML = empty('Not enough history', 'The discharge pipeline needs at least 20 daily management reports.'); return; }
        const F = M.F.slice(0, 14), tot7 = F.slice(0, 7).reduce((a, p) => a + p.dis, 0), act7 = S.slice(-7).reduce((a, s) => a + s.dis, 0), mxd = Math.max(...F.map(p => p.dis), 1);
        const stays = br.disc.map(d => d.stay).filter(v => v != null), bk = [['Same day / 1 day', 0, 1], ['2 days', 2, 2], ['3 days', 3, 3], ['4 to 5 days', 4, 5], ['6 to 7 days', 6, 7], ['8 to 14 days', 8, 14], ['Over 14 days', 15, 999]].map(b => ({ b, n: stays.filter(v => v >= b[1] && v <= b[2]).length })), tn = stays.length || 1;
        const AL = alosOf(br.disc, d => d.wcls || '—'), cls = Object.entries(AL).filter(e => e[1].length >= 10).map(e => [e[0], e[1].length, mean(e[1])]).sort((a, b) => b[1] - a[1]).slice(0, 10);
        html = `<div class="mkkpis">${kk('Expected tomorrow', Math.round(F[0].dis), dl(F[0].d) + ' ' + DOW[wd(F[0].d)])}${kk('Expected next 7 days', Math.round(tot7), 'discharges (model)')}${kk('Discharged last 7 days', N(act7), 'from the management reports')}${kk('Discharges per occupied bed', M.P.mR.toFixed(2), 'per day, last 28 days')}${kk('Pending discharge orders', 'Not recorded', 'needs the bed management feed')}</div>
        ${card('Expected discharges, next 14 days', bars(F.map(p => ({ l: dl(p.d), v: p.dis, c: '#F59E0B' })), { fmt: v => Math.round(v) + ' discharges' }), 'Worked out from the discharge rate by weekday applied to the forecast occupancy.')}
        ${card('Length of stay of discharged patients', tbl(['Stay', 'Patients', 'Share'], bk.map(x => [x.b[0], N(x.n), (100 * x.n / tn).toFixed(1) + '%<span class="bar" style="width:' + Math.max(2, 100 * x.n / tn * 2) + '%"></span>'])), stays.length ? N(stays.length) + ' discharges from the IP discharge reports.' : 'Load the IP discharge reports.')}
        ${cls.length ? card('Average stay by ward class', tbl(['Ward class', 'Discharges', 'Average stay'], cls.map(c => [c[0], N(c[1]), c[2].toFixed(1) + ' days']))) : ''}`;
      }
      if (id === 'bdwd') {
        const f = ws.filter(o => !XB.ward || o.w === XB.ward), tot = f.reduce((a, o) => a + o.demand, 0), H2 = XB.h;
        html = bedFilt(br, wardNames) + `<div class="mkseg">${[7, 14, 28].map(v => `<button type="button" class="${XB.h === v ? 'on' : ''}" data-xh="${v}">${v}-day outlook</button>`).join('')}</div>
        <div class="mkkpis" style="margin-top:12px">${kk('Wards with admissions', N(f.length), 'last ' + XB.win + ' days')}${kk('Total bed demand', tot.toFixed(0) + ' beds', 'admissions per day × stay')}${kk('Occupied beds today', N(last.occ), 'management report')}${kk('Expected arrivals', N(f.reduce((a, o) => a + o.per * H2, 0)), 'next ' + H2 + ' days')}${ready ? kk('Hospital forecast', Math.round(M.F[H2 - 1].occ) + ' beds', 'in ' + H2 + ' days') : ''}</div>
        ${card('Ward-level forecast', `<div class="lgscroll"><table><thead><tr><th class="l">Ward</th><th>Admissions</th><th>Per day</th><th>Avg stay</th><th>Bed demand</th><th>Share of demand</th><th>Arrivals next ${H2} days</th><th>Beds used</th></tr></thead><tbody>${f.sort((a, b) => b.demand - a.demand).map(o => `<tr class="brrow" data-xward="${q(o.w)}"><td class="l"><b>${tc(o.w)}</b></td><td>${N(o.n)}</td><td>${o.per.toFixed(1)}</td><td>${o.alos.toFixed(1)} d</td><td><b>${o.demand.toFixed(1)}</b></td><td>${(100 * o.demand / (tot || 1)).toFixed(1)}%<span class="bar" style="width:${Math.max(3, 100 * o.demand / (f[0].demand || 1))}%"></span></td><td>${Math.round(o.per * H2)}</td><td>${N(o.beds.size)}</td></tr>`).join('')}</tbody></table></div>`, 'Bed demand = admissions per day × average length of stay of that ward class. Click a ward for details. Ward capacity (total beds per ward) needs the bed master.')}`;
      }
      host.innerHTML = html;
      host.querySelectorAll('[data-xb]').forEach(s2 => { s2.onchange = () => { XB[s2.dataset.xb] = s2.dataset.xb === 'win' ? +s2.value : s2.value; drawBed(id); }; });
      host.querySelectorAll('[data-xh]').forEach(b => { b.onclick = () => { XB.h = +b.dataset.xh; drawBed(id); }; });
      host.querySelectorAll('[data-xward]').forEach(c => { c.onclick = () => { const o = ws.find(x => x.w === c.dataset.xward); if (o) wardDrawer(o, br); }; });
      tips(host);
    } catch (e) { console.error(e); host.innerHTML = '<div class="card"><h2>This view could not be drawn</h2></div>'; }
  }
  function draw(id) {
    const host = document.getElementById(ROOT[id]); if (!host || !XR.store) return;
    if (id.indexOf('bd') === 0) { drawBed(id); return; }
    try {
      let html = '';
      const ss = snaps(), last = ss[ss.length - 1];
      if (id === 'clov' || id === 'clar') {
        if (!last) { host.innerHTML = empty('No management report loaded', 'Receivables and collections come from the management dashboard report.'); return; }
        const k = last.data.kpi, asOf = last.asOf, ser = f => ss.map(s => ({ l: dl(s.asOf), d: s.asOf, v: ((s.data.kpi[f] || {}).today) || 0 }));
        const got = n => ss.filter(s => s.asOf >= addDays(asOf, -(n - 1))).reduce((a, s) => a + (((s.data.kpi.collection || {}).today) || 0), 0), held = n => ss.filter(s => s.asOf >= addDays(asOf, -(n - 1))).length;
        const out = k.outstanding || {}, dOut = out.pmt ? 100 * (out.today - out.pmt) / out.pmt : null;
        const coll30 = ser('collection').filter(p => p.d >= addDays(asOf, -29)).map(p => ({ l: p.l, v: p.v, c: p.d >= addDays(asOf, -2) ? '#0D9488' : p.d >= addDays(asOf, -9) ? '#5EC9BD' : '#BFE9E4' }));
        const collTable = card('Date-wise collections', `<div class="lgscroll" style="max-height:340px"><table><thead><tr><th class="l">Date</th><th>Received</th><th>OP received</th><th>IP received</th><th>Receivables outstanding</th></tr></thead><tbody>${ss.slice().reverse().slice(0, 30).map(s => { const kk2 = s.data.kpi; return `<tr><td class="l">${s.asOf}</td><td><b>${RS((kk2.collection || {}).today)}</b></td><td>${RS((kk2.opColl || {}).today)}</td><td>${RS((kk2.ipColl || {}).today)}</td><td>${RS((kk2.outstanding || {}).today)}</td></tr>`; }).join('')}</tbody></table></div>`, 'From the management report, one row per report date. Click a bar above to see its amount.');
        if (id === 'clov') {
          const cl = claims(), rr = apply(cl), by = s => rr.filter(r => r.stat === s), sm = (a, f) => a.reduce((x, r) => x + (r[f] || 0), 0);
          const go = (l, v, n, tone, st) => `<div class="mkk" data-xgo="${st}" title="Open the list"><span>${l}</span><b${tone ? ` style="color:${tone}"` : ''}>${v}</b><small>${n || '&nbsp;'}</small></div>`;
          const bk = BUCKETS.map(b => { const a = rr.filter(r => r.stat !== 'Settled' && r.age >= b[1] && r.age <= b[2]); return { b, n: a.length, out: sm(a, 'tout') }; }), bmx = Math.max(...bk.map(x => x.out), 1);
          html = `<div class="mkkpis">${kk('Received last 3 days', RS(got(3)), held(3) + ' days on file')}${kk('Received last 10 days', RS(got(10)), held(10) + ' days on file')}${kk('Received last 30 days', RS(got(30)), held(30) + ' days on file')}${kk('Received this month', RS((k.collection || {}).mtd), 'month to date')}${kk('Receivables outstanding', RS(out.today), dOut == null ? '' : (dOut >= 0 ? '+' : '') + dOut.toFixed(1) + '% vs last month', '#B45309')}</div>
          <p class="note" style="margin:6px 2px 0">Money received is the hospital's daily collection from the management report (all payers). As on ${asOf}.</p>
          ${filt(cl, false)}
          <div class="mkkpis" style="margin-top:12px">${go('Total claims', N(rr.length), 'click to open the list', '', '')}${go('Settled', N(by('Settled').length), 'fully received', '#047857', 'Settled')}${go('Part-received', N(by('Part-received').length), 'partly received', '#0369A1', 'Part-received')}${go('Pending', N(by('Pending').length), 'nothing received yet', '#B45309', 'Pending')}${kk('Rejected', 'Not recorded', 'needs the claims / TPA module')}</div>
          <div class="mkkpis" style="margin-top:12px">${kk('Claim amount', RS(sm(rr, 'net')), 'net billed to payers')}${kk('Approved amount', 'Not recorded', 'needs the claims / TPA module')}${kk('Actual received', RS(sm(rr, 'trcpt')), (100 * sm(rr, 'trcpt') / (sm(rr, 'net') || 1)).toFixed(0) + '% of claim amount', '#047857')}${kk('Pending amount', RS(sm(rr, 'tout')), 'still to be received', '#B45309')}</div>
          <p class="note" style="margin:6px 2px 0">Payment status is worked out from receipts against each bill in the bill register${rr.length ? ' (' + rr.reduce((a, r) => r.bdate < a ? r.bdate : a, '9999') + ' to ' + rr.reduce((a, r) => r.bdate > a ? r.bdate : a, '') + ')' : ''}. Click a count to see the claims.</p>
          ${card('Pending claim ageing', tbl(['Age since billing', 'Claims', 'Outstanding', 'Share'], bk.map((x, i2) => ['<span data-xage="' + i2 + '" style="cursor:pointer;border-bottom:1px dotted #94A3B8">' + x.b[0] + '</span>', N(x.n), '<b>' + RS(x.out) + '</b>', '<span class="bar" style="width:' + Math.max(3, 100 * x.out / bmx) + '%;background:' + (x.b[1] > 30 ? '#F87171' : x.b[1] > 7 ? '#F59E0B' : '#14B8A6') + '"></span>'])), 'Pending and part-received claims by days since billing. Click an age band to open those claims.')}
          ${card('Money received per day', bars(coll30), 'Last 30 days. Dark bars = last 3 days, medium = days 4 to 10.')}
          ${collTable}`;
        } else {
          const ag = k.ageing || {}, keys = Object.keys(ag), tot = keys.reduce((a, b) => a + (ag[b].today || 0), 0) || 1, over90 = ['90-180Days', '180-270Days', '>270Days'].reduce((a, b) => a + ((ag[b] || {}).today || 0), 0);
          html = `<div class="mkkpis">${kk('Total receivables', RS(out.today), dOut == null ? '' : (dOut >= 0 ? '+' : '') + dOut.toFixed(1) + '% vs last month', '#B45309')}${kk('IP receivables', RS((k.outIP || {}).today), (100 * (k.outIP || {}).today / (out.today || 1)).toFixed(0) + '% of total')}${kk('OP receivables', RS((k.outOP || {}).today), (100 * (k.outOP || {}).today / (out.today || 1)).toFixed(0) + '% of total')}${kk('Older than 90 days', RS(over90), (100 * over90 / tot).toFixed(0) + '% of receivables', '#B91C1C')}${kk('Collected this month', RS((k.collection || {}).mtd), 'month to date')}</div>
          ${card('Receivables ageing', tbl(['Age of outstanding', 'Now', 'Share', 'Last month', 'Change'], keys.map(b => { const v = ag[b]; return [b.replace('Days', ' days'), '<b>' + RS(v.today) + '</b>', (100 * v.today / tot).toFixed(1) + '%<span class="bar" style="width:' + Math.max(3, 100 * v.today / tot) + '%;background:' + (/^(0-30)/.test(b) ? '#14B8A6' : /30-90/.test(b) ? '#F59E0B' : '#F87171') + '"></span>', RS(v.pmt), v.pmt ? ((v.today >= v.pmt ? '+' : '') + (100 * (v.today - v.pmt) / v.pmt).toFixed(0) + '%') : '—']; })), 'From the management report as on ' + asOf + '.')}
          ${card('Money received per day', bars(coll30), 'Last 30 days. Dark bars = last 3 days, medium = days 4 to 10.')}
          ${card('Receivables outstanding over time', line(ser('outstanding').map(p => ({ l: p.l, v: p.v }))))}
          ${collTable}`;
        }
      }
      if (id === 'clpy') {
        const cl = claims(), rr = apply(cl), g = (kf) => { const m = {}; rr.forEach(r => { const k2 = kf(r) || '—', o = m[k2] = m[k2] || { k: k2, n: 0, set: 0, part: 0, pend: 0, bill: 0, rec: 0, out: 0, ageSum: 0, ageN: 0 }; o.n++; o.bill += r.net || 0; o.rec += r.trcpt || 0; o.out += r.tout || 0; if (r.stat === 'Settled') o.set++; else if (r.stat === 'Part-received') o.part++; else o.pend++; if (r.stat !== 'Settled') { o.ageSum += r.age; o.ageN++; } }); return Object.values(m).sort((a, b) => b.out - a.out); };
        const row = (o, attr) => ['<span data-' + attr + '="' + q(o.k) + '" style="cursor:pointer;border-bottom:1px dotted #94A3B8">' + tc(o.k) + '</span>', N(o.n), N(o.set), N(o.part), N(o.pend), RS(o.bill), RS(o.rec), '<b>' + RS(o.out) + '</b>', (100 * o.set / o.n).toFixed(0) + '%', o.ageN ? Math.round(o.ageSum / o.ageN) + ' d' : '—'];
        const hd = n => [n, 'Claims', 'Settled', 'Part', 'Pending', 'Claim amount', 'Received', 'Outstanding', 'Settled %', 'Avg age pending'];
        const mp = last ? (last.data.kpi.payer || {}) : {};
        html = filt(cl, true) + (rr.length ? card('TPA / insurance type comparison', tbl(hd('Payer type'), g(r => r.pay).map(o => row(o, 'xpay'))), 'Click a payer type to open its claims.') + card('Branch-wise claims', tbl(hd('Branch'), g(r => r.loc).map(o => row(o, 'xloc'))), 'Click a branch to open its claims.') + card('Top payers by outstanding', tbl(hd('Payer'), g(r => r.cmp || 'General').slice(0, 20).map(o => row(o, 'xpayer')))) : empty('No claims for these filters', 'Claims come from the bill register (insurance, TPA, government scheme and corporate bills).'))
          + (last ? card('Payer revenue from the management report', tbl(['Payer', 'This month', 'Last month', 'Year to date', 'Same month last year'], Object.keys(mp).map(p => [p, '<b>' + RS(mp[p].mtd) + '</b>', RS(mp[p].pmt), RS(mp[p].ytd), RS(mp[p].lymtd)])), 'Hospital-wide, as on ' + last.asOf + '.') : '');
      }
      if (id === 'clrec') {
        const cl = claims(), rr = apply(cl).filter(r => !XS.q || (r.umr + ' ' + r.cmp + ' ' + r.dept + ' ' + r.bill).toLowerCase().includes(XS.q.toLowerCase())).sort((a, b) => b.tout - a.tout), shown = rr.slice(0, 300);
        host.__claimRows = shown; host.__claimAll = cl.rows;
        html = filt(cl, true).replace(/<button type="button" class="btn ghost sm" id="xreset">Reset filters<\/button>/, '<div class="field"><label>Search</label><input type="search" id="xq" value="' + q(XS.q) + '" placeholder="UHID, bill, payer, department"></div><button type="button" class="btn ghost sm" id="xreset">Reset filters</button>')
          + card('Claim records', `<p class="note">${N(rr.length)} claims · ${RS(rr.reduce((a, r) => a + (r.tout || 0), 0))} outstanding${XS.ageMin !== '' ? ' · age ' + XS.ageMin + (XS.ageMax > 9999 ? '+' : ' to ' + XS.ageMax) + ' days, unsettled only' : ''}${rr.length > 300 ? ' · showing the 300 with the highest outstanding' : ''}. Click a row for the full claim and patient details. Patient names are not stored; UHID identifies the patient.</p>` + `<div class="lgscroll"><table><thead><tr><th class="l">Bill date</th><th class="l">UHID</th><th class="l">Payer</th><th class="l">Type</th><th class="l">Department</th><th class="l">Branch</th><th>Claim amount</th><th>Received</th><th>Outstanding</th><th class="l">Status</th><th>Age</th></tr></thead><tbody>${shown.map((r, i) => `<tr class="brrow" data-xrow="${i}"><td class="l">${r.bdate}</td><td class="l">${q(r.umr)}</td><td class="l">${tc(r.cmp) || '—'}</td><td class="l">${r.pay}</td><td class="l">${tc(r.dept)}</td><td class="l">${tc(r.loc)}</td><td>${N(r.net)}</td><td>${N(r.trcpt)}</td><td><b>${N(r.tout)}</b></td><td class="l">${stBadge(r.stat)}</td><td>${r.age} d</td></tr>`).join('')}</tbody></table></div>`);
      }
      if (id === 'brc') {
        const all = (XR.getBillRows ? XR.getBillRows() : []).filter(r => active(r) && !/-CANCEL|-DELETED/i.test(r.type));
        const months = [...new Set(all.map(r => r.bdate.slice(0, 7)))].sort().reverse(); if (XS.month !== 'all' && !months.includes(XS.month)) XS.month = months[0] || 'all';
        const rr = all.filter(r => XS.month === 'all' || r.bdate.slice(0, 7) === XS.month), od = ((XR.store.opdDays) || []).filter(d => XS.month === 'all' || d.date.slice(0, 7) === XS.month);
        const m = {}; rr.forEach(r => { const o = m[r.loc] = m[r.loc] || { k: r.loc, tot: 0, IPD: 0, OPD: 0, ER: 0, Pharmacy: 0, pts: new Set(), rec: 0, out: 0, conc: 0, amt: 0 }; const kd = kindOf(r); o.tot += r.net || 0; o[kd] += r.net || 0; o.pts.add(r.umr); o.rec += r.trcpt || 0; o.out += r.tout || 0; o.conc += r.conc || 0; o.amt += r.amt || 0; });
        od.forEach(d => Object.entries(d.locs || {}).forEach(([l, v]) => { const o = m[l]; if (o) { o.vis = (o.vis || 0) + (v.visits || 0); o.nr = (o.nr || 0) + (v.newReg || 0); } }));
        const bl = Object.values(m).sort((a, b) => b.tot - a.tot); if (!bl.length) { host.innerHTML = empty('No branch data', 'Branch revenue comes from the bill register.'); return; }
        const cols = [['Revenue', o => o.tot, RS], ['IPD', o => o.IPD, RS], ['OPD', o => o.OPD, RS], ['ER', o => o.ER, RS], ['Pharmacy', o => o.Pharmacy, RS], ['Patients', o => o.pts.size, N], ['ARPP', o => o.pts.size ? o.tot / o.pts.size : 0, v => '₹' + N(v)], ['Collected', o => o.rec, RS], ['Outstanding', o => o.out, RS], ['Concession %', o => (o.amt ? 100 * o.conc / o.amt : 0), v => v.toFixed(1) + '%'], ['OPD visits', o => o.vis || 0, N], ['New registrations', o => o.nr || 0, N]];
        const best = cols.map(c => Math.max(...bl.map(o => c[1](o))));
        const W = 860, H = 230, PL = 56, PB = 40, PT = 12, mx = Math.max(...bl.map(o => o.tot), 1) * 1.12, bw = (W - PL - 10) / bl.length, y = v => PT + (H - PT - PB) * (1 - v / mx), COL = { IPD: '#0D9488', OPD: '#38BDF8', ER: '#F59E0B', Pharmacy: '#A78BFA' };
        let g = ''; for (let i = 0; i <= 4; i++) { const v = mx * i / 4; g += `<line x1="${PL}" x2="${W}" y1="${y(v)}" y2="${y(v)}" stroke="#E2E8F0"/><text x="${PL - 8}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="#64748B" font-family="Inter">${C(v)}</text>`; }
        bl.forEach((o, i) => { let acc = 0; const x = PL + i * bw + bw * .16, tip = '<span class="t">' + tc(o.k) + '</span>' + Object.keys(COL).map(c => c + ' ' + RS(o[c])).join('<br>'); Object.keys(COL).forEach(c => { const v = Math.max(o[c], 0); if (!v) return; g += `<rect class="hitbar" x="${x}" y="${y(acc + v)}" width="${bw * .68}" height="${Math.max(1, y(acc) - y(acc + v))}" fill="${COL[c]}" data-tip="${q(tip)}"/>`; acc += v; }); g += `<text x="${x + bw * .34}" y="${H - PB + 16}" text-anchor="middle" font-size="10.5" fill="#475569" font-family="Inter">${tc(o.k).slice(0, 12)}</text>`; });
        const A = m[XS.a] || bl[0], B = m[XS.b] || bl[1] || bl[0];
        html = `<div class="controls"><div class="field"><label>Period</label><select data-xs="month">${months.map(v => `<option value="${v}"${XS.month === v ? ' selected' : ''}>${v}</option>`).join('')}<option value="all"${XS.month === 'all' ? ' selected' : ''}>All loaded days</option></select></div></div>`
          + card('Branch-wise revenue', `<svg viewBox="0 0 ${W} ${H}">${g}</svg><div class="legend">${Object.keys(COL).map(c => `<span><i class="sw" style="background:${COL[c]}"></i>${c}</span>`).join('')}</div>`)
          + card('Branch comparison', `<div class="lgscroll"><table><thead><tr><th class="l">Branch</th>${cols.map(c => `<th>${c[0]}</th>`).join('')}</tr></thead><tbody>${bl.map(o => `<tr><td class="l"><b>${tc(o.k)}</b></td>${cols.map((c, i) => `<td${c[1](o) === best[i] && best[i] > 0 && c[0] !== 'Outstanding' && c[0] !== 'Concession %' ? ' class="up"' : ''}>${c[2](c[1](o))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`, 'Best figure in each column is in green.')
          + card('Compare two branches', `<div class="controls" style="border:0;padding:0;margin:0 0 10px;box-shadow:none">${opt('Branch A', 'a', bl.map(o => [o.k, tc(o.k)]), (tc(A.k)))}${opt('Branch B', 'b', bl.map(o => [o.k, tc(o.k)]), (tc(B.k)))}</div>` + tbl(['Metric', tc(A.k), tc(B.k), 'Difference'], cols.map(c => { const a = c[1](A), b2 = c[1](B); return [c[0], c[2](a), c[2](b2), b2 ? (a >= b2 ? '+' : '') + (100 * (a - b2) / b2).toFixed(0) + '%' : '—']; })));
      }
      if (id === 'nd') {
        const days = (XR.store.days || []).slice().sort((a, b) => a.date < b.date ? -1 : 1);
        if (days.length < 10) { host.innerHTML = empty('Not enough history', 'New doctors are found from daily closings. Load more daily reports.'); return; }
        const d0 = days[0].date, first = {}, tot = {}, cnt = {}, lastD = {}, byDate = {};
        days.forEach(d => Object.entries(d.docs || {}).forEach(([k, v]) => { const amt = typeof v === 'number' ? v : (v && v.v) || 0; if (!(amt > 0)) return; if (!first[k]) first[k] = d.date; tot[k] = (tot[k] || 0) + amt; cnt[k] = (cnt[k] || 0) + 1; lastD[k] = d.date; }));
        const cutoff = addDays(d0, 7), last = days[days.length - 1].date;
        const est = Object.keys(first).filter(k => first[k] <= cutoff), avgEst = est.length ? est.reduce((a, k) => a + tot[k] / (cnt[k] || 1), 0) / est.length : 0;
        let nl = Object.keys(first).filter(k => first[k] > cutoff).map(k => { const [dp, nm] = k.split('|'); return { k, nm: tc(nm || dp), dept: tc(nm ? dp : ''), f: first[k], tot: tot[k], n: cnt[k], avg: tot[k] / (cnt[k] || 1), since: Math.round((Date.parse(last) - Date.parse(first[k])) / 864e5), act: lastD[k] === last }; }).sort((a, b) => a.f < b.f ? 1 : -1);
        const sh = XS.q ? nl.filter(r => (r.nm + ' ' + r.dept).toLowerCase().includes(XS.q.toLowerCase())) : nl;
        html = `<div class="mkkpis">${kk('New doctors', N(nl.length), 'first billing after ' + dl(cutoff))}${kk('Revenue from new doctors', RS(nl.reduce((a, r) => a + r.tot, 0)), 'since they started')}${kk('Avg per working day', RS(nl.length ? nl.reduce((a, r) => a + r.avg, 0) / nl.length : 0), 'new doctors')}${kk('Established doctors', RS(avgEst), 'avg per working day')}${kk('Still billing today', N(nl.filter(r => r.act).length), 'of ' + N(nl.length))}</div>
        <div class="controls"><div class="field"><label>Search</label><input type="search" id="xq" value="${q(XS.q)}" placeholder="Doctor or department"></div></div>`
          + card('New doctors', `<div class="lgscroll"><table><thead><tr><th class="l">Doctor</th><th class="l">Department</th><th class="l">First billed</th><th>Days since</th><th>Working days</th><th>Revenue so far</th><th>Avg per working day</th><th>vs established</th></tr></thead><tbody>${sh.map(r => `<tr><td class="l"><b>${q(r.nm)}</b></td><td class="l">${q(r.dept)}</td><td class="l">${r.f}</td><td>${r.since}</td><td>${r.n}</td><td><b>${RS(r.tot)}</b></td><td>${RS(r.avg)}</td><td class="${r.avg >= avgEst ? 'up' : 'down'}">${avgEst ? (100 * r.avg / avgEst).toFixed(0) + '%' : '—'}</td></tr>`).join('')}</tbody></table></div>`, 'A doctor is "new" when the first billing in the loaded daily closings comes more than a week after the first day on file (' + d0 + ').');
      }
      host.innerHTML = html;
      host.querySelectorAll('[data-xs]').forEach(s2 => { s2.onchange = () => { XS[s2.dataset.xs] = s2.value; draw(id); }; });
      const xq = host.querySelector('#xq'); if (xq) { xq.oninput = () => { XS.q = xq.value; XS.fq = 1; draw(id); }; if (XS.fq) { xq.focus(); xq.setSelectionRange(xq.value.length, xq.value.length); XS.fq = 0; } }
      const jump = () => { const t = document.getElementById('t-clrec'); if (t) t.click(); };
      host.querySelectorAll('[data-xgo]').forEach(c => { c.onclick = () => { XS.stat = c.dataset.xgo; XS.ageMin = ''; jump(); }; });
      host.querySelectorAll('[data-xpay]').forEach(c => { c.onclick = () => { XS.pay = c.dataset.xpay; XS.stat = ''; jump(); }; });
      host.querySelectorAll('[data-xloc]').forEach(c => { c.onclick = () => { XS.loc = c.dataset.xloc; XS.stat = ''; jump(); }; });
      host.querySelectorAll('[data-xpayer]').forEach(c => { c.onclick = () => { XS.q = c.dataset.xpayer; XS.stat = ''; jump(); }; });
      host.querySelectorAll('[data-xage]').forEach(c => { c.onclick = () => { const b2 = BUCKETS[+c.dataset.xage]; XS.ageMin = b2[1]; XS.ageMax = b2[2]; XS.stat = ''; jump(); }; });
      host.querySelectorAll('tr[data-xrow]').forEach(t => { t.onclick = () => claimDrawer(host.__claimRows[+t.dataset.xrow], host.__claimAll); });
      const rs = host.querySelector('#xreset'); if (rs) rs.onclick = () => { Object.assign(XS, { loc: '', dept: '', pay: '', stat: '', from: '', to: '', q: '', ageMin: '', ageMax: '' }); draw(id); };
      tips(host);
    } catch (e) { console.error(e); host.innerHTML = '<div class="card"><h2>This view could not be drawn</h2></div>'; }
  }
  function glance() {
    const side = document.getElementById('side'), ss = snaps(); if (!side || !ss.length) return;
    const k = ss[ss.length - 1].data.kpi; let g = document.getElementById('sdGlance');
    if (!g) { g = document.createElement('div'); g.id = 'sdGlance'; const col = side.querySelector('.sd-col'); side.insertBefore(g, col || null); }
    const go = id => { const b = document.getElementById(id); if (b) b.click(); window.scrollTo({ top: 0 }); };
    g.innerHTML = `<div class="sd-lbl">At a glance</div>
      <button type="button" class="sd-g" data-go="t-ops"><span>Bed occupancy</span><b>${(k.occPct || {}).today || '—'}%</b><small>${N((k.occBeds || {}).today)} of ${N((k.beds || {}).today)} beds</small></button>
      <button type="button" class="sd-g" data-go="t-clar"><span>Receivables</span><b>${RS((k.outstanding || {}).today)}</b><small>claims and bills due</small></button>
      <button type="button" class="sd-g" data-go="t-roi"><span>Doctor ROI</span><b>View</b><small>payout against business</small></button>`;
    g.querySelectorAll('[data-go]').forEach(b => { b.onclick = () => go(b.dataset.go); });
  }
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { const d = document.getElementById('xDrawer'); if (d) d.innerHTML = ''; } });
  const renderAll = () => { Object.keys(ROOT).forEach(draw); glance(); };
  const prev = window.__PRESCO_ENHANCER_READY;
  window.__PRESCO_ENHANCER_READY = payload => { if (typeof prev === 'function') prev(payload); XR = payload || XR; renderAll(); };
  document.addEventListener('click', e => { const b = e.target.closest('button[role="tab"]'); if (b && TABS[b.id] && XR.store) setTimeout(() => draw(TABS[b.id]), 0); });
})();

/* =====================================================================
   DEPARTMENT REPORT CARD
   Click a department anywhere (tables, doctor lists, Departments tab) to open a report
   like the doctor report card: revenue, OPD, admissions, discharges, OP billing,
   bill register, doctors in the department and day by day.
   ===================================================================== */
(function () {
  'use strict';
  let RT = { store: null, getBillRows: null, data: null }, PD = 'all', CUR = '', docDept = {}, deptSet = new Set();
  const N = n => Math.round(n || 0).toLocaleString('en-IN');
  const C = n => { const a = Math.abs(n || 0); return a >= 1e7 ? (n / 1e7).toFixed(2) + ' Cr' : a >= 1e5 ? (n / 1e5).toFixed(2) + ' L' : N(n); };
  const RS = n => '₹' + C(n), q = t => String(t == null ? '' : t).replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const pct = (a, b) => b ? (100 * a / b).toFixed(1) + '%' : '—';
  const norm = s => String(s || '').toLowerCase().replace(/[^a-z]+/g, ' ').trim();
  const ALIAS = { 'arthroscopy orthopaedics': 'orthopaedics', 'clinical cardiology': 'cardiology', 'medical gastro enterology': 'gastroenterology', 'laparoscopic surgeon': 'general surgery', 'clinical immunology': 'rheumatology', 'dmo': 'casualty', 'casualty and emergency': 'casualty', 'casualty emergency': 'casualty', 'casualty': 'casualty' };
  const dk = s => { const n = norm(s).replace(/ & /g, ' and '); return ALIAS[n] || n; };
  const lastSnap = () => ((RT.store && RT.store.snapshots) || []).filter(s => s.data && s.data.doctors && s.data.depts).sort((a, b) => a.asOf < b.asOf ? -1 : 1).pop();
  const addDays = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
  const dl = iso => new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) + ' ' + new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short' });
  const kv = (l, v, n, tone) => `<div class="card"><p class="note" style="margin:0">${l}</p><p class="kpi" style="font-size:24px${tone ? ';color:' + tone : ''}">${v}</p><p class="note" style="margin:0">${n || '&nbsp;'}</p></div>`;
  const index = () => {
    const s = lastSnap(); docDept = {}; deptSet = new Set(); if (!s) return; s.data.depts.forEach(d => deptSet.add(dk(d.name)));
    s.data.doctors.slice().sort((a, b) => (b.ytd || 0) - (a.ytd || 0)).forEach(d => { const k = norm(d.name); if (k && !docDept[k]) docDept[k] = dk(d.dept); });
  };
  const isDept = n => deptSet.has(dk(n));
  const of = ck => docDept[norm(ck)];

  function report(name) {
    const s = lastSnap(); if (!s) return null; const key = dk(name), asOf = s.asOf, st = RT.store;
    const from = PD === 'all' ? '' : PD === 'month' ? asOf.slice(0, 8) + '01' : addDays(asOf, -(+PD - 1)), inP = d => (!from || d >= from) && d <= asOf;
    const drec = s.data.depts.find(d => dk(d.name) === key), docs = s.data.doctors.filter(d => dk(d.dept) === key);
    const opd = (st.opdDays || []).filter(d => inP(d.date)).map(d => { let v = 0, n = 0; Object.values(d.docs || {}).forEach(x => { if (dk(x.dept) === key) { v += x.v || 0; n += x.n || 0; } }); return { d: d.date, v, n }; }).filter(x => x.v > 0);
    const adm = (st.adm || []).filter(a => inP(a.date) && of(a.ck) === key), emg = a => /emerg|mlc/i.test(a.type || '');
    const disc = (st.disc || []).filter(d => inP(d.ddate) && of(d.ck) === key), opb = (st.opBills || []).filter(b => inP(b.date) && of(b.ck) === key);
    const reg = (RT.getBillRows ? RT.getBillRows() : []).filter(r => (!r.st || r.st === 'A') && dk(r.dept) === key && inP(r.bdate));
    const opdDates = new Set(opd.map(x => x.d)), opN = opd.reduce((a, x) => a + x.v, 0), newR = opd.reduce((a, x) => a + x.n, 0);
    const admShared = adm.filter(a => opdDates.has(a.date)), admDays = new Set(adm.map(a => a.date)).size;
    const stay = disc.map(d => +d.stay).filter(v => !isNaN(v)), alos = stay.length ? stay.reduce((a, b) => a + b, 0) / stay.length : null;
    const icu = disc.filter(d => /ICU/i.test((d.ward || '') + ' ' + (d.wcls || ''))), expired = disc.filter(d => /expir/i.test(d.dtype || '')), lama = disc.filter(d => /lama|dama/i.test(d.dtype || '')), noBill = disc.filter(d => !d.bill);
    const gross = opb.reduce((a, b) => a + (+b.gross || 0), 0), conc = opb.reduce((a, b) => a + (+b.conc || 0), 0), rcpt = opb.reduce((a, b) => a + (+b.rcpt || 0), 0);
    const bt = {}; reg.forEach(r => { bt[r.type] = (bt[r.type] || 0) + (r.net || 0); });
    const day = {}, put = (d, f, v) => { (day[d] = day[d] || { v: 0, n: 0, a: 0, e: 0, rev: null })[f] += v; };
    opd.forEach(x => { put(x.d, 'v', x.v); put(x.d, 'n', x.n); }); adm.forEach(a => { put(a.date, 'a', 1); if (emg(a)) put(a.date, 'e', 1); });
    (st.days || []).filter(d => inP(d.date)).forEach(d => { let t = null; Object.entries(d.depts || {}).forEach(([k, v]) => { if (dk(k) === key) t = (t || 0) + v; }); if (t != null) { day[d.date] = day[d.date] || { v: 0, n: 0, a: 0, e: 0 }; day[d.date].rev = t; } });
    const dates = Object.keys(day).sort().reverse().slice(0, 14);
    return { name: drec ? drec.name : name, asOf, from, drec, docs, opN, newR, opdDays: opd.length, adm, emgN: adm.filter(emg).length, admDays, admShared, opShared: opd.filter(x => true).reduce((a, x) => a + x.v, 0), disc, alos, stayN: stay.reduce((a, b) => a + b, 0), icu, expired, lama, noBill, dueSum: disc.reduce((a, d) => a + (+d.due || 0), 0), opb, gross, conc, rcpt, reg, bt, day, dates };
  }
  function html(R) {
    const d = R.drec || {}, mtdVs = d.ytdAvg ? 100 * (d.mtdAvg - d.ytdAvg) / d.ytdAvg : null, ytdVs = d.lyytd ? 100 * (d.ytd - d.lyytd) / d.lyytd : null;
    const per = [['all', 'All days on file'], ['7', 'Last 7 days'], ['14', 'Last 14 days'], ['30', 'Last 30 days'], ['month', 'This month']].map(p => `<option value="${p[0]}"${PD === p[0] ? ' selected' : ''}>${p[1]}</option>`).join('');
    const pnt = v => v == null ? '' : `<span class="${v >= 0 ? 'up' : 'down'}">${v >= 0 ? '+' : ''}${v.toFixed(1)}%</span>`;
    const opShared = R.opdDays ? R.admShared.length : 0, opOnShared = R.opN;
    const maxD = Math.max(...R.docs.map(x => x.mtd || 0), 1), totM = R.docs.reduce((a, x) => a + (x.mtd || 0), 0) || 1;
    return `<div class="drillhead"><div><h2>${q(R.name)}</h2><p class="note" style="margin:2px 0 0">Department · ${N(R.docs.length)} doctors on file · ${N(R.drec ? R.drec.activeCount : 0)} active</p></div><button type="button" class="btn ghost sm" data-dclose>Close</button></div>
    <div class="controls" style="margin-bottom:12px"><div class="field"><label>Period</label><select id="dprd">${per}</select></div><span class="note" style="align-self:end;margin:0 0 6px">${R.from ? 'showing ' + R.from + ' to ' + R.asOf : 'showing every day on file, as on ' + R.asOf}</span></div>
    <div class="grid3">${kv('Billed today, ' + R.asOf, d.today != null ? RS(d.today) : '—', d.today != null ? 'yesterday ' + RS(d.yest) : 'no daily closing')}${kv('Month to date', d.mtd != null ? RS(d.mtd) : '—', d.mtdAvg ? RS(d.mtdAvg) + ' a day · ' + (mtdVs == null ? '' : pnt(mtdVs) + ' vs the YTD average') : '')}${kv('Year to date', d.ytd != null ? RS(d.ytd) : '—', ytdVs == null ? '' : pnt(ytdVs) + ' against last year')}</div>
    <div class="grid3">${kv('OP consultations held', N(R.opN), N(R.opdDays) + ' days on file · ' + pct(R.newR, R.opN) + ' new registrations')}${kv('IP admissions held', N(R.adm.length), N(R.admDays) + ' days with an admission · ' + N(R.emgN) + ' emergency (' + pct(R.emgN, R.adm.length) + ')')}${kv('OP to IP conversion', R.opN ? (100 * R.admShared.length / R.opN).toFixed(1) + '%' : '—', N(R.admShared.length) + ' admissions from ' + N(R.opN) + ' consultations on shared days')}</div>
    <div class="grid3">${kv('IP discharges held', N(R.disc.length), R.alos == null ? 'no stay data' : 'ALOS ' + R.alos.toFixed(1) + ' days · ' + N(R.stayN) + ' patient-days')}${kv('Discharged from ICU', N(R.icu.length), pct(R.icu.length, R.disc.length) + ' of their discharges')}${kv('Expired / LAMA-DAMA', `<span style="color:${R.expired.length ? '#B91C1C' : 'inherit'}">${N(R.expired.length)}</span> / ${N(R.lama.length)}`, 'due at discharge ' + RS(R.dueSum) + ' · ' + N(R.noBill.length) + ' without a final bill')}</div>
    <div class="grid3">${kv('OP billing held', RS(R.gross), N(R.opb.length) + ' bills · average ' + (R.opb.length ? '₹' + N(R.gross / R.opb.length) : '—'))}${kv('Collected / concession', RS(R.rcpt), pct(R.rcpt, R.gross) + ' realised · concession ' + RS(R.conc) + ' (' + pct(R.conc, R.gross) + ')')}${kv('Gross per OP consultation', R.opN ? '₹' + N(R.gross / R.opN) : '—', RS(R.gross) + ' over ' + N(R.opN) + ' consultations')}</div>
    <div class="card" style="margin-top:12px"><h2>Bill register</h2><div class="grid3" style="margin:0 0 10px"><div><p class="note" style="margin:0">Net billing</p><p class="kpi" style="font-size:20px">${RS(R.reg.reduce((a, r) => a + (r.net || 0), 0))}</p></div><div><p class="note" style="margin:0">Consultations / registrations</p><p class="kpi" style="font-size:20px">${N(R.reg.filter(r => /consult/i.test(r.type)).length)} / ${N(R.reg.filter(r => /registration/i.test(r.type)).length)}</p></div><div><p class="note" style="margin:0">Receipts / due</p><p class="kpi" style="font-size:20px">${RS(R.reg.reduce((a, r) => a + (r.trcpt || 0), 0))} / ${RS(R.reg.reduce((a, r) => a + (r.tout || 0), 0))}</p></div></div>
    ${Object.keys(R.bt).length ? `<table class="btx"><thead><tr><th class="l">Bill type</th><th>Net</th></tr></thead><tbody>${Object.entries(R.bt).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([t, v]) => `<tr><td class="l">${q(t)}</td><td class="${v < 0 ? 'down' : ''}">${N(v)}</td></tr>`).join('')}</tbody></table>` : '<p class="note">No bill register rows for this department and period.</p>'}</div>
    <div class="card" style="margin-top:12px"><h2>Doctors in this department</h2><p class="note">Month to date from the management report. Click a doctor to open the doctor report.</p><div class="lgscroll" style="max-height:360px"><table><thead><tr><th class="l">Doctor</th><th>Month to date</th><th>Share</th><th>Year to date</th><th>vs last year</th><th>OPD visits</th></tr></thead><tbody>${R.docs.slice().sort((a, b) => (b.mtd || 0) - (a.mtd || 0)).map(x => `<tr><td class="l"><span class="docname" data-doc="${q(x.dept + '|' + x.name)}">${q(x.name)}</span></td><td><b>${N(x.mtd)}</b><span class="bar" style="width:${Math.max(2, 100 * (x.mtd || 0) / maxD)}%"></span></td><td>${pct(x.mtd, totM)}</td><td>${N(x.ytd)}</td><td>${x.lyytd ? pnt(100 * (x.ytd - x.lyytd) / x.lyytd) : '—'}</td><td>${N(x.visits)}</td></tr>`).join('')}</tbody></table></div></div>
    <div class="card" style="margin-top:12px"><h2>Day by day</h2><p class="note">OP consultations and admissions of this department, most recent 14 days on file. Revenue shows a dash where no daily closing is held.</p><div class="lgscroll" style="max-height:420px"><table><thead><tr><th class="l">Date</th><th>OP</th><th>New</th><th>Admissions</th><th>Emergency</th><th>Per 100 OP</th><th>Revenue</th></tr></thead><tbody>${R.dates.map(dt => { const x = R.day[dt]; return `<tr><td class="l">${dl(dt)}</td><td>${N(x.v)}</td><td>${N(x.n)}</td><td>${N(x.a)}</td><td>${N(x.e)}</td><td>${x.v ? Math.round(100 * x.a / x.v) + '%' : '—'}</td><td>${x.rev != null ? N(x.rev) : '—'}</td></tr>`; }).join('') || '<tr><td class="l" colspan="7">No daily data in this period.</td></tr>'}</tbody></table></div></div>`;
  }
  function overlay() {
    let o = document.getElementById('deptDrill'); if (!o) {
      o = document.createElement('div'); o.id = 'deptDrill'; o.className = 'hidden'; o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true'); o.setAttribute('aria-label', 'Department report'); o.innerHTML = '<div class="drillbox"><div id="deptDrillBody"></div></div>';
      o.addEventListener('click', e => { if (e.target === o || e.target.closest('[data-dclose]')) o.classList.add('hidden'); else if (e.target.closest('[data-doc]')) o.classList.add('hidden'); }); document.body.appendChild(o);
    } return o;
  }
  function open(name) {
    if (!RT.store) return; CUR = name; const R = report(name), o = overlay(); if (!R) return; document.getElementById('deptDrillBody').innerHTML = html(R); o.classList.remove('hidden'); o.scrollTop = 0;
    const sel = document.getElementById('dprd'); if (sel) sel.onchange = () => { PD = sel.value; const keep = o.scrollTop; document.getElementById('deptDrillBody').innerHTML = html(report(CUR)); o.scrollTop = keep; const s2 = document.getElementById('dprd'); if (s2) s2.onchange = sel.onchange; };
  }
  function mark() {
    if (!deptSet.size) return;
    document.querySelectorAll('table').forEach(t => {
      const h = t.tHead && t.tHead.rows[0] && t.tHead.rows[0].cells[0]; if (!h || h.textContent.trim() !== 'Department' || !t.tBodies[0]) return;
      [...t.tBodies[0].rows].forEach(tr => { if (tr.dataset.deptReport || tr.classList.contains('xp-docs') || !tr.cells.length) return; const n = tr.cells[0].textContent.trim(); if (isDept(n)) { tr.dataset.deptReport = n; tr.classList.add('dept-click'); tr.title = 'Click for the department report'; } });
    });
    document.querySelectorAll('.deptTag:not([data-dept-report]), .pf-who span:not([data-dept-report])').forEach(el => { const n = el.textContent.split(' · ')[0].trim(); if (n && isDept(n)) { el.dataset.deptReport = n; el.classList.add('dept-click'); el.title = 'Click for the department report'; } });
    document.querySelectorAll('details.dept > summary').forEach(sm => { if (sm.querySelector('.dept-rep')) return; const dn = sm.querySelector('.dname'), n = dn ? dn.textContent.trim() : ''; if (!isDept(n)) return; const b = document.createElement('button'); b.type = 'button'; b.className = 'dept-rep'; b.textContent = 'Department report'; b.dataset.deptReport = n; sm.appendChild(b); });
  }
  let raf = 0; const queue = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(mark); };
  document.addEventListener('click', e => { const t = e.target.closest('[data-dept-report]'); if (!t || e.target.closest('[data-doc]') || e.target.closest('#deptDrill')) return; e.preventDefault(); e.stopPropagation(); PD = 'all'; open(t.dataset.deptReport); }, true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { const o = document.getElementById('deptDrill'); if (o) o.classList.add('hidden'); } });
  const prev = window.__PRESCO_ENHANCER_READY;
  window.__PRESCO_ENHANCER_READY = payload => { if (typeof prev === 'function') prev(payload); RT = payload || RT; index(); mark(); new MutationObserver(queue).observe(document.body, { childList: true, subtree: true }); };
  window.__PRESCO_DEPT_REPORT = open;
})();
