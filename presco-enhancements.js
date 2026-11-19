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
  const GROUPS = Object.keys(PANELS).concat(['p-marketing', 'p-mkexec', 'p-mkrec']);
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
        ${card('Bill type details', 'Counts and amounts by the bill type recorded in the register.',
          available
            ? table(['Bill type', 'Bills', 'Patients', 'Net billed', 'Collected', 'Outstanding'], detailRows)
            : integration('Load the Bill Type register to show date-filtered billing totals.'),
          true)}
      </div>
      <p class="mgmt-footnote">${esc(note)} Net billed and receipt totals preserve signed values from the source register. Refund rows are included only when their bill type maps to this category, and canceled/inactive rows are excluded.</p>`;
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
const MK = {month: '', loc: '', exec: '', src: '', kind: '', gran: 'day', sort: 'ach', sel: '', q: '', st: 'all', more: false, go: 0};
const MKS = (() => { try { const j = JSON.parse(localStorage.getItem('presco-mk') || 'null'); if (j && j.execs) return j; } catch (e) {} return {execs: {}, hist: []}; })();
const mkSave = () => { try { localStorage.setItem('presco-mk', JSON.stringify(MKS)); } catch (e) {} };
function drawMk(pn){
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
 const agg = rows => { const m = {}; rows.forEach(r => { const c = ec(r), o = m[c] = m[c] || {code: c, locs: {}, pts: new Set(), opd: new Set(), adm: new Set(), conv: new Set(), net: 0, opdNet: 0, ipNet: 0, n: 0}; o.locs[r.loc] = (o.locs[r.loc] || 0) + 1; o.pts.add(r.umr); if (kd(r) === 'OPD'){ o.opd.add(r.umr); o.opdNet += r.net || 0; } else { if (r.admn) o.adm.add(r.admn); o.ipNet += r.net || 0; } if ((r.net || 0) > 0) o.conv.add(r.umr); o.net += r.net || 0; o.n++; }); return m; };
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
 const kp = (l, v, n) => `<div class="card"><p class="note" style="margin:0">${l}</p><p class="kpi">${v}</p><p class="note" style="margin:0">${n || '&nbsp;'}</p></div>`;
 const need = (l, w) => `<div class="card" style="border-style:dashed"><p class="note" style="margin:0">${l}</p><p class="kpi" style="font-size:16px">Data integration required</p><p class="note" style="margin:0">${w}</p></div>`;
 const opt = (l, k, vals, all2) => `<div class="field"><label>${l}</label><select data-mk="${k}"><option value="">${all2}</option>${vals.map(v => `<option value="${q(v[0])}"${MK[k] === v[0] ? ' selected' : ''}>${q(v[1])}</option>`).join('')}</select></div>`;
 const mOpt = months.map(m => [m, m]).concat([['all', 'All loaded days']]);
 const filt = (extra) => `<div class="controls"><div class="field"><label>Period</label><select data-mk="month">${mOpt.map(v => `<option value="${v[0]}"${MK.month === v[0] ? ' selected' : ''}>${v[1]}</option>`).join('')}</select></div>${opt('Branch', 'loc', [...new Set(mrows.map(r => r.loc))].sort().map(v => [v, tc(v)]), 'All branches')}${opt('Executive', 'exec', [...new Set(mrows.map(ec))].sort().map(v => [v, v]), 'All executives')}${opt('OPD / IPD', 'kind', [['OPD', 'OPD'], ['IPD', 'IPD']], 'Both')}${extra || ''}<span style="margin-left:auto;display:flex;gap:8px"><button type="button" class="btn ghost sm" id="mkcsv">Export (Excel / CSV)</button><button type="button" class="btn ghost sm" onclick="window.print()">Print / PDF</button></span></div>`;
 const banner = demoOn ? '<div class="sharedbar"><b>Demonstration data is on.</b> Targets and lead counts are sample values that show how the dashboard works. Patients, OPD / IPD and revenue are real billing data. <button type="button" class="btn ghost sm" id="mkdemo" style="margin-left:8px">Turn off demonstration data</button></div>' : '<div class="pnote">Demonstration data is off. <button type="button" class="btn ghost sm" id="mkdemo" style="margin-left:8px">Use demonstration data</button></div>';
 const codes = Object.keys(A);
 const rowsE = roster.filter(c => A[c] || ex(c).monthly).map(c => { const a = A[c] || {pts: new Set(), opd: new Set(), adm: new Set(), conv: new Set(), net: 0}, t = tgt(c), acq = a.pts.size; return {c, a, t, acq, lead: leadOf(c, acq), appt: apptOf(c, acq), ach: t ? 100 * acq / t : null, st: stat(c, acq)}; });
 let html = '';
 if (!mrows.length){ host.innerHTML = '<div class="card"><h2>No marketing referrals loaded</h2><p class="note" style="margin:0">Marketing executives come from the bill register export (referral type MARKETING).</p></div>'; return; }
 if (pn === 'p-mk'){
  const tA = rowsE.filter(r => r.t && active(r.c)), tTot = tA.reduce((a, r) => a + r.t, 0), aTot = tA.reduce((a, r) => a + r.acq, 0), allPts = new Set(cur.map(r => r.umr)).size;
  const opdP = new Set(cur.filter(r => kd(r) === 'OPD').map(r => r.umr)).size, adm = new Set(cur.filter(r => kd(r) === 'IPD' && r.admn).map(r => r.admn)).size, rev = cur.reduce((a, r) => a + (r.net || 0), 0);
  const pct = tTot ? 100 * aTot / tTot : null, exp = 100 * frac;
  const leadTot = rowsE.filter(r => active(r.c)).reduce((a, r) => a + (r.lead || 0), 0), apptTot = rowsE.filter(r => active(r.c)).reduce((a, r) => a + (r.appt || 0), 0);
  const withT = rowsE.filter(r => r.t && active(r.c)).sort((a, b) => b.ach - a.ach), top = withT[0], low = withT[withT.length - 1];
  const cnt = k => rowsE.filter(r => active(r.c) && r.st[0] === k).length;
  const ranked = withT.slice(), shown = ranked.filter(r => MK.st === 'all' || (MK.st === 'pending' ? r.ach < 100 : r.st[0] === MK.st));
  const mixed = (() => { const C = shown.filter(r => r.ach >= 100).slice(0, 4), P = shown.filter(r => r.ach < 100), pk = P.length <= 8 ? P : Array.from({length: 8}, (_, i) => P[Math.round(i * (P.length - 1) / 7)]); return [...C, ...pk].sort((a, b) => b.ach - a.ach); })();
  const scList = MK.more ? shown : (MK.st === 'all' && shown.length > 12 ? mixed : shown.slice(0, 12));
  const SC = {'Target achieved': ['#14B8A6', '#047857'], 'On track': ['#38BDF8', '#0369A1'], 'Needs attention': ['#F59E0B', '#92400E'], 'Target at risk': ['#F87171', '#B91C1C']};
  const pcard = (t, r) => r ? `<div class="card"><h2>${t}</h2><div class="pf-who"><span class="pf-av">${q(r.c.slice(0, 2))}</span><div><b>${q(r.c)}</b><span>${tc(branch(r.c))}</span></div></div><div class="pf-mini"><div><b>${N(r.t)}</b>Target${dm}</div><div><b>${N(r.acq)}</b>Acquired</div><div><b>${r.ach.toFixed(0)}%</b>Achieved</div><div><b>${N(Math.max(r.t - r.acq, 0))}</b>Remaining</div><div>${sb(r.c)}</div></div></div>` : '';
  const sorters = {ach: (a, b) => (b.ach == null ? -1 : b.ach) - (a.ach == null ? -1 : a.ach), pts: (a, b) => b.acq - a.acq, ipd: (a, b) => b.a.adm.size - a.a.adm.size, rev: (a, b) => b.a.net - a.a.net};
  const team = rowsE.slice().sort(sorters[MK.sort]);
  const sel = MK.sel && A[MK.sel] ? MK.sel : (team[0] || {}).c; MK.sel = sel;
  const sa = A[sel] || {pts: new Set(), opd: new Set(), adm: new Set(), net: 0, n: 0}, sp = AP[sel] || {pts: new Set(), adm: new Set(), net: 0}, st3 = stat(sel, sa.pts.size), tS = tgt(sel);
  const dlt = (c2, p2) => p2 ? `${c2 >= p2 ? '+' : ''}${(100 * (c2 - p2) / p2).toFixed(0)}% vs ${pm}` : 'no earlier month';
  const per = (rows, key) => { const m = {}; rows.forEach(r => { const k = key(r); (m[k] = m[k] || new Set()).add(r.umr); }); return m; };
  const wk = d => { const t = new Date(d + 'T00:00:00Z'), w = (t.getUTCDay() + 6) % 7; t.setUTCDate(t.getUTCDate() - w); return t.toISOString().slice(0, 10); };
  const key = MK.gran === 'month' ? r => r.bdate.slice(0, 7) : MK.gran === 'week' ? r => wk(r.bdate) : r => r.bdate;
  const trRows = mrows.filter(fl), tm = per(trRows, key), ks = Object.keys(tm).sort();
  const W = 860, H = 220, PL = 46, PB = 36, PT = 12, mx = Math.max(...ks.map(k => tm[k].size), 1) * 1.15, bw = (W - PL - 10) / Math.max(ks.length, 1), y = v => PT + (H - PT - PB) * (1 - v / mx), st2 = Math.ceil(ks.length / 12), lab = k => MK.gran === 'month' ? k : mkDay(k);
  let g = ''; for (let i = 0; i <= 4; i++){ const v = mx * i / 4; g += `<line x1="${PL}" x2="${W}" y1="${y(v)}" y2="${y(v)}" stroke="#E2E8F0"/><text x="${PL - 8}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="#64748B" font-family="Inter">${N(v)}</text>`; }
  ks.forEach((k, i) => { const x = PL + i * bw + bw * .14; g += `<rect class="hitbar" x="${x}" y="${y(tm[k].size)}" width="${bw * .72}" height="${Math.max(1, H - PB - y(tm[k].size))}" rx="2" fill="#14B8A6" data-tip="${q('<span class="t">' + lab(k) + '</span>' + N(tm[k].size) + ' patients')}"/>`; if (i % st2 === 0) g += `<text x="${x + bw * .36}" y="${H - PB + 16}" text-anchor="middle" font-size="10.5" fill="#64748B" font-family="Inter">${lab(k)}</text>`; });
  const srcRows = all.filter(r => r.r1t && r.r1t !== 'Walk-in' && inM(r, MK.month) && (!MK.loc || r.loc === MK.loc) && (!MK.kind || kd(r) === MK.kind)), sm = {};
  srcRows.forEach(r => { const o = sm[r.r1t] = sm[r.r1t] || {k: r.r1t, pts: new Set(), opd: new Set(), adm: new Set(), net: 0, n: 0}; o.pts.add(r.umr); if (kd(r) === 'OPD') o.opd.add(r.umr); else if (r.admn) o.adm.add(r.admn); o.net += r.net || 0; o.n++; });
  const sl = Object.values(sm).sort((a, b) => b.pts.size - a.pts.size), sTot = sl.reduce((a, o) => a + o.pts.size, 0) || 1;
  const monthsTbl = months.slice().reverse().map(m => { const rr = mrows.filter(r => inM(r, m) && fl(r)); return {m, p: new Set(rr.map(r => r.umr)).size, o: rr.filter(r => kd(r) === 'OPD').reduce((a, r) => a + (r.net || 0), 0), i: rr.filter(r => kd(r) === 'IPD').reduce((a, r) => a + (r.net || 0), 0)}; });
  const fun = [['Referrals received' + dm, demoOn ? leadTot : null], ['Appointments scheduled' + dm, demoOn ? apptTot : null], ['Patients visited (billed)', allPts], ['OPD patients', opdP], ['IPD admissions', adm], ['Converted (with revenue)', new Set(cur.filter(r => (r.net || 0) > 0).map(r => r.umr)).size]];
  const fmx = Math.max(allPts, leadTot, 1);
  html = filt() + banner + `<div class="grid3">${kp('Marketing executives', rowsE.filter(r => active(r.c)).length, N(codes.length) + ' with patients this period')}${kp('Patients acquired', N(allPts), N(opdP) + ' OPD · ' + N(adm) + ' IPD admissions')}${demoOn ? kp('Referrals received (demo)', N(leadTot), leadTot ? (100 * allPts / leadTot).toFixed(0) + '% became patients' : '') : need('Referrals received', 'Patients are counted from billing. Referral entries are not in the loaded reports.')}${kp('Revenue through marketing', RS(rev), 'billed revenue of these patients')}${kp('Overall target achievement', pct == null ? '—' : pct.toFixed(0) + '%', tTot ? N(aTot) + ' of ' + N(tTot) + ' patients' + dm : 'no targets assigned yet')}${kp('Target still to go', tTot ? N(Math.max(tTot - aTot, 0)) : '—', tTot && aTot > tTot ? N(aTot - tTot) + ' above target' : 'for the whole team')}</div>
  <div class="card" style="margin-top:16px"><h2>Who has completed their target</h2>
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
  </div></details>
  <div class="card" id="mkind" style="margin-top:16px"><h2>Individual performance: ${q(sel)}</h2><p class="note">Click a name in the table above to change executive.</p>
  <div class="grid3" style="margin-top:0">${kp('Personal target', tS ? N(tS) : '—', sb(sel))}${kp('Actual achievement', N(sa.pts.size), tS ? (100 * sa.pts.size / tS).toFixed(0) + '% achieved' : 'no target set')}${kp('Leads received' + dm, demoOn ? N(leadOf(sel, sa.pts.size)) : '—', demoOn && leadOf(sel, sa.pts.size) ? (100 * sa.pts.size / leadOf(sel, sa.pts.size)).toFixed(0) + '% converted' : 'needs referral records')}${kp('Remaining target', tS ? N(Math.max(tS - sa.pts.size, 0)) : '—', tS && sa.pts.size > tS ? N(sa.pts.size - tS) + ' above target' : '')}${kp('OPD patients / IPD admissions', N(sa.opd.size) + ' / ' + N(sa.adm.size), '')}${kp('Revenue generated', RS(sa.net), dlt(sa.net, sp.net))}${kp('Previous month', pm ? N(sp.pts.size) + ' patients' : '—', pm ? dlt(sa.pts.size, sp.pts.size) : '')}</div></div>
  <div class="grid2"><div class="card"><h2>Referral conversion funnel</h2><table class="btx"><tbody>${fun.map((f, i) => `<tr><td class="l">${f[0]}</td><td style="width:60%">${f[1] == null ? `<span class="note">Data integration required</span>` : `<b>${N(f[1])}</b>${i < 3 ? '' : ` <span class="note">(${allPts ? (100 * f[1] / allPts).toFixed(0) : 0}% of visited)</span>`}<span class="bar" style="width:${Math.max(3, 100 * f[1] / fmx)}%"></span>`}</td></tr>`).join('')}</tbody></table></div>
  <div class="card"><h2>Marketing revenue</h2><table class="btx"><thead><tr><th class="l">Month</th><th>Patients</th><th>OPD revenue</th><th>IPD revenue</th><th>Total</th></tr></thead><tbody>${monthsTbl.map(m => `<tr><td class="l">${m.m}</td><td>${N(m.p)}</td><td>${RS(m.o)}</td><td>${RS(m.i)}</td><td><b>${RS(m.o + m.i)}</b></td></tr>`).join('')}</tbody></table></div></div>
  <div class="card" style="margin-top:16px"><h2>Referral source analysis</h2><div style="overflow-x:auto"><table class="btx"><thead><tr><th class="l">Referral source</th><th>Referral bills</th><th>Patients</th><th>OPD patients</th><th>IPD admissions</th><th>Share of patients</th><th>Revenue</th></tr></thead><tbody>${sl.map(o => `<tr><td class="l">${tc(o.k)}</td><td>${N(o.n)}</td><td><b>${N(o.pts.size)}</b></td><td>${N(o.opd.size)}</td><td>${N(o.adm.size)}</td><td>${(100 * o.pts.size / sTot).toFixed(1)}%<span class="bar" style="width:${Math.max(3, 100 * o.pts.size / (sl[0].pts.size || 1))}%"></span></td><td>${RS(o.net)}</td></tr>`).join('')}</tbody></table></div><p class="note" style="margin:8px 0 0">Walk-ins excluded. Clinic and camp / health-event sources are not recorded separately in the data.</p></div>
  <div class="card" style="margin-top:16px"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px"><h2 style="margin:0">Patients acquired over time</h2><div class="field" style="flex-direction:row;align-items:center;gap:8px"><label>View</label><select data-mk="gran">${[['day', 'Daily'], ['week', 'Weekly'], ['month', 'Monthly']].map(v => `<option value="${v[0]}"${MK.gran === v[0] ? ' selected' : ''}>${v[1]}</option>`).join('')}</select></div></div><svg viewBox="0 0 ${W} ${H}">${g}</svg></div>`;
 }
 if (pn === 'p-me'){
  const hist = MKS.hist.slice(-25).reverse(), all2 = [...new Set([...mrows.map(ec), ...Object.keys(MKS.execs)])].sort();
  const inp = (c, f, t, w) => `<input data-mkf="${q(c)}|${f}" type="${t || 'text'}" value="${q(ex(c)[f] || '')}" style="min-width:0;width:${w || 90}px;padding:5px 7px;font-size:12px"${t === 'number' ? ` placeholder="${f === 'monthly' ? (demoOn && !ex(c).monthly ? 'demo ' + demoTgt(c) : '') : 'auto'}"` : ''}>`;
  const locs = [...new Set(mrows.map(r => r.loc))].sort();
  html = banner + `<div class="card" style="margin-top:14px"><h2>Add a marketing executive</h2><div class="controls" style="border:0;padding:0;margin:0;box-shadow:none"><div class="field"><label>Name or code</label><input id="mkn" placeholder="e.g. BODUPPAL-SR"></div><div class="field"><label>Employee ID</label><input id="mki" style="min-width:110px"></div><div class="field"><label>Branch</label><select id="mkb"><option value="">—</option>${locs.map(l => `<option>${tc(l)}</option>`).join('')}</select></div><div class="field"><label>Territory</label><input id="mkt" style="min-width:120px"></div><div class="field"><label>Monthly patient target</label><input id="mkm" type="number" style="min-width:110px"></div><button type="button" class="btn" id="mkadd">Add</button></div></div>
  <div class="card" style="margin-top:16px"><h2>Executives and targets</h2><p class="note">Targets are monthly patient counts. Weekly, daily, quarterly and yearly targets are worked out from the monthly figure unless you type one. Changes are logged below.</p>
  <div class="lgscroll"><table><thead><tr><th class="l">Executive</th><th class="l">Branch</th><th class="l">Employee ID</th><th class="l">Territory</th><th class="l">Contact</th><th class="l">Joined</th><th class="l">Status</th><th>Monthly</th><th>OPD</th><th>IPD</th><th>Weekly</th><th>Daily</th><th>Quarterly</th><th>Yearly</th></tr></thead><tbody>${all2.map(c => `<tr><td class="l"><b>${q(c)}</b></td><td class="l">${tc(branch(c))}</td><td class="l">${inp(c, 'id')}</td><td class="l">${inp(c, 'territory', 'text', 110)}</td><td class="l">${inp(c, 'contact', 'text', 110)}</td><td class="l">${inp(c, 'joined', 'date', 130)}</td><td class="l"><select data-mkf="${q(c)}|status" style="min-width:0;padding:5px 7px;font-size:12px"><option${active(c) ? ' selected' : ''}>Active</option><option${active(c) ? '' : ' selected'}>Inactive</option></select></td><td>${inp(c, 'monthly', 'number', 80)}</td><td>${inp(c, 'opd', 'number', 70)}</td><td>${inp(c, 'ipd', 'number', 70)}</td><td>${inp(c, 'weekly', 'number', 70)}</td><td>${inp(c, 'daily', 'number', 70)}</td><td>${inp(c, 'quarterly', 'number', 80)}</td><td>${inp(c, 'yearly', 'number', 80)}</td></tr>`).join('')}</tbody></table></div></div>
  <div class="card" style="margin-top:16px"><h2>Target and detail change history</h2>${hist.length ? `<table class="btx"><thead><tr><th class="l">When</th><th class="l">Executive</th><th class="l">Field</th><th>Old</th><th>New</th></tr></thead><tbody>${hist.map(h => `<tr><td class="l">${q(h.t)}</td><td class="l">${q(h.c)}</td><td class="l">${q(h.f)}</td><td>${q(h.o) || '—'}</td><td><b>${q(h.n) || '—'}</b></td></tr>`).join('')}</tbody></table>` : '<p class="note" style="margin:0">No changes yet.</p>'}</div>
  <p class="note" style="margin-top:10px">Saved in this browser only. Role-based access needs a login system, which this file does not have.</p>`;
 }
 if (pn === 'p-mr'){
  const srcs = [...new Set(all.map(r => r.r1t).filter(x => x && x !== 'Walk-in'))].sort(), SR = MK.src || 'MARKETING';
  const rr = all.filter(r => r.r1t === SR && inM(r, MK.month) && (!MK.loc || r.loc === MK.loc) && (!MK.exec || ec(r) === MK.exec) && (!MK.kind || kd(r) === MK.kind) && (!MK.q || (r.umr + ' ' + r.r1 + ' ' + r.r2 + ' ' + r.dept).toLowerCase().includes(MK.q.toLowerCase()))).sort((a, b) => a.bdate < b.bdate ? 1 : -1);
  html = filt(`<div class="field"><label>Referral source</label><select data-mk="src">${srcs.map(v => `<option value="${q(v)}"${SR === v ? ' selected' : ''}>${tc(v)}</option>`).join('')}</select></div><div class="field"><label>Search</label><input type="search" id="mkq" value="${q(MK.q)}" placeholder="UHID, executive, department"></div>`) + `<div class="card" style="margin-top:16px"><h2>Referral records</h2><p class="note">${N(rr.length)} bills · ${N(new Set(rr.map(r => r.umr)).size)} unique patients${rr.length > 300 ? ' · showing the latest 300' : ''}. Patient names are not stored; UHID identifies the patient.</p>
  <div class="lgscroll"><table><thead><tr><th class="l">Date</th><th class="l">Executive</th><th class="l">Referral source</th><th class="l">Referring doctor / organisation</th><th class="l">UHID</th><th class="l">Department</th><th>OPD / IPD</th><th class="l">Bill</th><th>Revenue</th></tr></thead><tbody>${rr.slice(0, 300).map(r => `<tr><td class="l">${r.bdate}</td><td class="l">${SR === 'MARKETING' ? q(ec(r)) : '—'}</td><td class="l">${tc(r.r1t)}</td><td class="l">${q(SR === 'MARKETING' ? r.r2 : r.r1) || '—'}</td><td class="l">${q(r.umr)}</td><td class="l">${tc(r.dept)}</td><td>${kd(r)}</td><td class="l">${q(r.bill)}</td><td><b>${N(r.net)}</b></td></tr>`).join('')}</tbody></table></div></div>`;
 }
 host.innerHTML = html;
 host.querySelectorAll('[data-mk]').forEach(s2 => { s2.onchange = () => { MK[s2.dataset.mk] = s2.value; drawMk(pn); }; });
 host.querySelectorAll('[data-ex]').forEach(t => { t.onclick = () => { MK.sel = t.dataset.ex; MK.go = 1; drawMk(pn); }; });
 host.querySelectorAll('[data-mkst]').forEach(b => { b.onclick = () => { MK.st = b.dataset.mkst; MK.more = false; drawMk(pn); }; });
 const mm2 = host.querySelector('#mkmore'); if (mm2) mm2.onclick = () => { MK.more = !MK.more; drawMk(pn); };
 if (MK.go){ const e2 = host.querySelector('#mkind'); if (e2) e2.scrollIntoView({behavior: 'smooth', block: 'start'}); MK.go = 0; }
 const dmb = host.querySelector('#mkdemo'); if (dmb) dmb.onclick = () => { MKS.demo = !demoOn; mkSave(); drawMk(pn); };
 const cv = host.querySelector('#mkcsv'); if (cv) cv.onclick = () => { const b = document.getElementById('hcsv'); if (b) b.click(); };
 const mq = host.querySelector('#mkq'); if (mq) mq.oninput = () => { MK.q = mq.value; MK.fq = 1; drawMk(pn); }; if (mq && MK.fq){ mq.focus(); mq.setSelectionRange(mq.value.length, mq.value.length); MK.fq = 0; }
 host.querySelectorAll('[data-mkf]').forEach(i2 => { i2.onchange = () => { const [c, f] = i2.dataset.mkf.split('|'), e = MKS.execs[c] = MKS.execs[c] || {}, o = e[f] == null ? '' : String(e[f]); let v = i2.value; if (f === 'status') v = v; else if (i2.type === 'number') v = v === '' ? '' : +v; e[f] = v; if (String(v) !== o) MKS.hist.push({t: new Date().toLocaleString('en-IN'), c, f, o, n: String(v)}); mkSave(); drawMk(pn); }; });
 const ad = host.querySelector('#mkadd'); if (ad) ad.onclick = () => { const c = host.querySelector('#mkn').value.trim().toUpperCase(); if (!c) return; MKS.execs[c] = Object.assign(MKS.execs[c] || {}, {id: host.querySelector('#mki').value, branch: host.querySelector('#mkb').value, territory: host.querySelector('#mkt').value, monthly: +host.querySelector('#mkm').value || ''}); MKS.hist.push({t: new Date().toLocaleString('en-IN'), c, f: 'added', o: '', n: 'executive added'}); mkSave(); drawMk(pn); };
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
  document.addEventListener('click', e => {
    const b = e.target.closest('button[role="tab"]');
    if (b && MKTAB[b.id] && MKRT.store) setTimeout(() => drawMk(MKTAB[b.id]), 0);
  });
})();
