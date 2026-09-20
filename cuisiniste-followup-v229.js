(function(root){
  'use strict';

  /* Store Runner V1 — suivi commercial des contrats expo cuisinistes (V229).
   *
   * Couche utilisateur POSÉE AU-DESSUS de V193, jamais à sa place :
   *   - même stockage (store-runner-cuisiniste-contracts-v193), via readStore/writeStore
   *     de V193 : aucune seconde base contrats, aucune clé localStorage parallèle ;
   *   - même identité : la clé canonique de site de V193 (le libellé HIT « SCH-… »/
   *     « CUI-… »), celle qui sert déjà de clé à `mapping`. Elle survit au remapping
   *     vers un autre magasin, à la suppression d'un magasin et à un import où le
   *     contrat n'apparaît plus — un storeId, non ;
   *   - statut de workflow DISTINCT du statut importé du contrat. Le premier décrit où
   *     en est la démarche commerciale, le second ce que dit le fichier. On ne confond
   *     pas les deux et on n'écrase jamais le second.
   */

  const STATUSES = [
    { id: 'aucun-contrat', label: 'Aucun contrat' },
    { id: 'a-proposer', label: 'À proposer' },
    { id: 'proposition-presentee', label: 'Proposition présentée' },
    { id: 'contrat-envoye', label: 'Contrat envoyé' },
    { id: 'attente-signature', label: 'En attente de signature' },
    { id: 'signe-en-cours', label: 'Signé / en cours' },
    { id: 'termine', label: 'Terminé' },
    { id: 'a-renouveler', label: 'À renouveler' },
  ];
  const STATUS_IDS = STATUSES.map(s => s.id);

  /* Une action peut SUGGÉRER un statut. Elle ne l'impose jamais : c'est l'utilisateur
     qui décide, l'interface propose. */
  const ACTIONS = [
    { id: 'proposition', label: 'Proposition présentée', suggests: 'proposition-presentee' },
    { id: 'envoi', label: 'Contrat envoyé', suggests: 'contrat-envoye' },
    { id: 'relance', label: 'Relance effectuée', suggests: null },
    { id: 'signature', label: 'Signature reçue', suggests: 'signe-en-cours' },
    { id: 'fin', label: 'Contrat terminé', suggests: 'termine' },
    { id: 'renouvellement', label: 'Renouvellement lancé', suggests: 'a-renouveler' },
    { id: 'appel', label: 'Appel', suggests: null },
    { id: 'mail', label: 'Mail', suggests: null },
    { id: 'rdv', label: 'Rendez-vous', suggests: null },
    { id: 'note', label: 'Note libre', suggests: null },
  ];
  const ACTION_IDS = ACTIONS.map(a => a.id);

  const HISTORY_LIMIT = 60;

  function text(value) { return String(value == null ? '' : value).trim(); }
  function isoDay(value) { return /^\d{4}-\d{2}-\d{2}$/.test(text(value)) ? text(value) : null; }
  function today(now) { return (now instanceof Date ? now : new Date()).toISOString().slice(0, 10); }
  function statusLabel(id) { const row = STATUSES.find(s => s.id === id); return row ? row.label : ''; }
  function actionLabel(id) { const row = ACTIONS.find(a => a.id === id); return row ? row.label : ''; }
  function suggestedStatus(actionType) { const row = ACTIONS.find(a => a.id === actionType); return row ? row.suggests : null; }

  function v193() { return root.StoreRunnerCuisinisteV193 || null; }

  /* Lecture et écriture passent par V193 : une seule porte vers le stockage. */
  function readAll(storage) {
    const api = v193();
    if (!api || typeof api.readStore !== 'function') return { followups: {} };
    const data = api.readStore(storage) || {};
    if (!data.followups || typeof data.followups !== 'object' || Array.isArray(data.followups)) data.followups = {};
    return data;
  }

  function writeAll(storage, data) {
    const api = v193();
    if (!api || typeof api.writeStore !== 'function') return data;
    return api.writeStore(storage, data);
  }

  function emptyFollowup() {
    return { workflowStatus: null, lastAction: null, nextAction: null, reminderDate: null, history: [], updatedAt: null };
  }

  function normalize(row) {
    if (!row || typeof row !== 'object') return emptyFollowup();
    const out = emptyFollowup();
    if (STATUS_IDS.indexOf(row.workflowStatus) >= 0) out.workflowStatus = row.workflowStatus;
    if (row.lastAction && typeof row.lastAction === 'object') out.lastAction = row.lastAction;
    if (row.nextAction && typeof row.nextAction === 'object') out.nextAction = row.nextAction;
    out.reminderDate = isoDay(row.reminderDate);
    out.history = Array.isArray(row.history) ? row.history.filter(x => x && typeof x === 'object') : [];
    out.updatedAt = text(row.updatedAt) || null;
    return out;
  }

  /* Création paresseuse : tant que rien n'a été saisi, rien n'est écrit. */
  function followupFor(storage, siteKey) {
    const key = text(siteKey);
    if (!key) return emptyFollowup();
    return normalize(readAll(storage).followups[key]);
  }

  function mutate(storage, siteKey, change) {
    const key = text(siteKey);
    if (!key) throw Error('Clé de site cuisiniste manquante.');
    const data = readAll(storage);
    const current = normalize(data.followups[key]);
    const next = change(current) || current;
    next.updatedAt = new Date().toISOString();
    if (next.history.length > HISTORY_LIMIT) next.history = next.history.slice(-HISTORY_LIMIT);
    data.followups[key] = next;
    writeAll(storage, data);
    return next;
  }

  function entry(options) {
    return {
      id: 'fu' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      type: options.type,
      label: options.label,
      date: options.date,
      note: options.note,
      previousStatus: options.previousStatus,
      nextStatus: options.nextStatus,
    };
  }

  /* Une action entre toujours dans l'historique. Le statut ne change que si on le
     demande explicitement. */
  function addAction(storage, siteKey, options = {}) {
    const type = ACTION_IDS.indexOf(options.type) >= 0 ? options.type : 'note';
    const label = text(options.label) || actionLabel(type);
    const note = text(options.note);
    const at = text(options.date) || new Date().toISOString();
    const wanted = STATUS_IDS.indexOf(options.status) >= 0 ? options.status : null;
    return mutate(storage, siteKey, current => {
      const previousStatus = current.workflowStatus;
      const nextStatus = wanted || previousStatus;
      const row = entry({ type, label, date: at, note, previousStatus: previousStatus || null, nextStatus: nextStatus || null });
      current.history = current.history.concat([row]);
      current.lastAction = { type, label, date: at, note };
      if (wanted) current.workflowStatus = wanted;
      return current;
    });
  }

  function setStatus(storage, siteKey, status, note) {
    if (STATUS_IDS.indexOf(status) < 0) throw Error('Statut de suivi inconnu.');
    return mutate(storage, siteKey, current => {
      const previousStatus = current.workflowStatus;
      if (previousStatus === status) return current;
      current.history = current.history.concat([entry({ type: 'statut', label: 'Statut : ' + statusLabel(status),
        date: new Date().toISOString(), note: text(note), previousStatus: previousStatus || null, nextStatus: status })]);
      current.workflowStatus = status;
      return current;
    });
  }

  function setNextAction(storage, siteKey, options = {}) {
    const label = text(options.label);
    if (!label) throw Error('Donne un libellé à la prochaine action.');
    const dueDate = isoDay(options.dueDate);
    if (options.dueDate && !dueDate) throw Error('Date de relance invalide.');
    return mutate(storage, siteKey, current => {
      current.nextAction = { type: ACTION_IDS.indexOf(options.type) >= 0 ? options.type : 'relance',
        label, dueDate, note: text(options.note) };
      current.reminderDate = dueDate;
      return current;
    });
  }

  function clearNextAction(storage, siteKey) {
    return mutate(storage, siteKey, current => { current.nextAction = null; current.reminderDate = null; return current; });
  }

  /* Une action planifiée terminée devient une entrée d'historique, et la prochaine
     action est vidée — pas laissée en place à faire croire qu'elle reste due. */
  function completeNextAction(storage, siteKey, options = {}) {
    const planned = followupFor(storage, siteKey).nextAction;
    if (!planned) return followupFor(storage, siteKey);
    addAction(storage, siteKey, { type: planned.type || 'relance', label: planned.label,
      note: text(options.note) || text(planned.note), status: options.status });
    return clearNextAction(storage, siteKey);
  }

  /* Le statut affiché : celui choisi par l'utilisateur, sinon « aucun contrat » déduit
     quand V193 ne connaît aucun contrat pour ce site. Rien n'est écrit pour autant. */
  /* Clé de repli : tant qu'aucun contrat importé ne désigne le magasin, le suivi vit sous
     « store:<id> ». Dès qu'un import ou un rapprochement manuel révèle la vraie clé de
     site, on fusionne — l'utilisateur ne doit jamais perdre son historique parce que le
     fichier est arrivé après ses notes. */
  const FALLBACK_PREFIX = 'store:';
  function fallbackKey(storeId) { return FALLBACK_PREFIX + String(storeId); }

  function sameEntry(a, b) {
    if (!a || !b) return false;
    if (a.id && b.id && a.id === b.id) return true;
    return a.type === b.type && text(a.label) === text(b.label)
      && String(a.date || '') === String(b.date || '') && text(a.note) === text(b.note);
  }

  function mergeHistory(target, source) {
    const out = target.slice();
    for (const row of source) if (!out.some(x => sameEntry(x, row))) out.push(row);
    return out.sort((a, b) => String(a.date || '').localeCompare(String(b.date || ''))).slice(-HISTORY_LIMIT);
  }

  function newer(a, b) {
    const da = a && (a.date || a.dueDate), db2 = b && (b.date || b.dueDate);
    if (!a) return b; if (!b) return a;
    return String(db2 || '') > String(da || '') ? b : a;
  }

  /* Fusion non destructive : le statut déjà posé par l'utilisateur sur la vraie clé gagne,
     l'historique est réuni sans doublon, la prochaine action la plus récente est gardée. */
  function mergeFollowups(into, from) {
    const out = normalize(into);
    const old = normalize(from);
    out.workflowStatus = out.workflowStatus || old.workflowStatus;
    out.history = mergeHistory(out.history, old.history);
    out.lastAction = newer(out.lastAction, old.lastAction);
    out.nextAction = newer(out.nextAction, old.nextAction);
    out.reminderDate = out.reminderDate || old.reminderDate;
    out.updatedAt = String(old.updatedAt || '') > String(out.updatedAt || '') ? old.updatedAt : out.updatedAt;
    return out;
  }

  function migrateKey(storage, fromKey, toKey) {
    const from = text(fromKey), to = text(toKey);
    if (!from || !to || from === to) return false;
    const data = readAll(storage);
    if (!Object.prototype.hasOwnProperty.call(data.followups, from)) return false;
    data.followups[to] = mergeFollowups(data.followups[to], data.followups[from]);
    /* La clé de repli ne disparaît qu'une fois la fusion écrite. */
    delete data.followups[from];
    writeAll(storage, data);
    return true;
  }

  /* Appelé après chaque import et à chaque rendu : les sites rapprochés récupèrent le
     suivi saisi avant que le fichier ne les nomme. */
  function reconcileKeys(storage, sites) {
    let moved = 0;
    for (const site of Array.isArray(sites) ? sites : []) {
      if (!site || !site.storeId || !site.key) continue;
      if (migrateKey(storage, fallbackKey(site.storeId), site.key)) moved++;
    }
    return moved;
  }

  function statusFor(followup, site) {
    if (followup && followup.workflowStatus) return followup.workflowStatus;
    const hasContract = !!(site && (site.activeContract || site.lastContract));
    return hasContract ? null : 'aucun-contrat';
  }

  /* Alertes déterministes, sans IA, dans l'ordre de priorité demandé. Les signaux de
     contrat viennent de V193 (dates, mois restants) : son moteur n'est pas dupliqué. */
  function alerts(site, followup, now) {
    const day = today(now);
    const out = [];
    const next = followup && followup.nextAction;
    const due = next && isoDay(next.dueDate);
    if (due && due < day) out.push({ id: 'relance-retard', kind: 'suivi', label: 'Relance en retard', detail: next.label, date: due });
    else if (due && due === day) out.push({ id: 'relance-aujourdhui', kind: 'suivi', label: 'Relance aujourd’hui', detail: next.label, date: due });

    const contract = site && (site.activeContract || site.lastContract);
    const end = contract && isoDay(contract.endDate);
    const months = contract && typeof contract.monthsRemaining === 'number' ? contract.monthsRemaining : null;
    if (end && end < day) out.push({ id: 'contrat-termine', kind: 'contrat', label: 'Contrat arrivé à terme', detail: end, date: end });
    else if ((months != null && months <= 3) || (end && end >= day && monthsBetween(day, end) <= 3)) {
      out.push({ id: 'contrat-fin-proche', kind: 'contrat', label: 'Contrat proche de la fin', detail: end || (months + ' mois restants'), date: end });
    }

    const status = statusFor(followup, site);
    if (status === 'signe-en-cours' && !next) out.push({ id: 'signe-sans-suite', kind: 'suivi', label: 'Signé sans prochaine action', detail: '', date: null });
    if (status === 'a-renouveler') out.push({ id: 'a-renouveler', kind: 'suivi', label: 'À renouveler', detail: '', date: null });

    const order = ['relance-retard', 'relance-aujourdhui', 'contrat-fin-proche', 'contrat-termine', 'signe-sans-suite', 'a-renouveler'];
    return out.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  }

  function monthsBetween(from, to) {
    const a = new Date(from + 'T12:00:00Z'), b = new Date(to + 'T12:00:00Z');
    if (!Number.isFinite(a.getTime()) || !Number.isFinite(b.getTime())) return Infinity;
    return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
  }

  /* Compteurs de l'écran central, sur les sites réellement connus de V193. */
  const FILTERS = [
    { id: 'all', label: 'Tous' },
    { id: 'relance', label: 'À relancer' },
    { id: 'attente-signature', label: 'En attente signature' },
    { id: 'a-renouveler', label: 'À renouveler' },
    { id: 'signe-en-cours', label: 'Signés / en cours' },
  ];

  function matchesFilter(filter, site, followup, now) {
    if (filter === 'all') return true;
    const status = statusFor(followup, site);
    if (filter === 'relance') return alerts(site, followup, now).some(a => a.id === 'relance-retard' || a.id === 'relance-aujourdhui');
    return status === filter;
  }

  function summary(storage, sites, now) {
    const rows = Array.isArray(sites) ? sites : [];
    const counts = { relance: 0, 'attente-signature': 0, 'a-renouveler': 0, 'signe-en-cours': 0 };
    for (const site of rows) {
      const followup = followupFor(storage, site && site.key);
      for (const id of Object.keys(counts)) if (matchesFilter(id, site, followup, now)) counts[id]++;
    }
    return counts;
  }

  const api = { STATUSES, STATUS_IDS, ACTIONS, ACTION_IDS, FILTERS, HISTORY_LIMIT,
    statusLabel, actionLabel, suggestedStatus, emptyFollowup, normalize, followupFor,
    addAction, setStatus, setNextAction, clearNextAction, completeNextAction,
    statusFor, alerts, matchesFilter, summary, isoDay, today,
    fallbackKey, mergeFollowups, migrateKey, reconcileKeys };

  // ------------------------------------------------------------------ interface

  const SECTION_ID = 'srCuisineFollowupV229';
  const STYLE_ID = 'srCuisineFollowupV229Style';
  const doc = () => root.document || null;
  const el = (tag, txt, cls) => { const n = doc().createElement(tag); if (txt != null) n.textContent = txt; if (cls) n.className = cls; return n; };
  const fr = value => { const d = isoDay(value); return d ? d.split('-').reverse().slice(0, 2).join('/') : ''; };

  function css() {
    const d = doc();
    if (!d || d.getElementById(STYLE_ID)) return;
    const style = d.createElement('style');
    style.id = STYLE_ID;
    style.textContent =
      `#${SECTION_ID}{display:block;margin:10px 0 0;padding:11px 12px;border:1px solid #e2e6ef;border-radius:16px;background:#fbfcff}` +
      `#${SECTION_ID} .fuTop{display:flex;align-items:center;gap:8px;flex-wrap:wrap}` +
      `#${SECTION_ID} .fuStatus{padding:5px 9px;border-radius:999px;background:#eef2ff;color:#28356b;font-size:11px;font-weight:850}` +
      `#${SECTION_ID} .fuStatus.fuNone{background:#f1f2f5;color:#5a6472}` +
      `#${SECTION_ID} .fuTitle{font-size:11px;font-weight:800;letter-spacing:.03em;text-transform:uppercase;color:#8a919d}` +
      `#${SECTION_ID} .fuAlert{display:block;margin-top:8px;padding:8px 10px;border-radius:12px;font-size:11.5px;font-weight:800;line-height:1.35}` +
      `#${SECTION_ID} .fuAlert.fuSuivi{background:#fff4f3;border:1px solid #f4c9c3;color:#b42318}` +
      `#${SECTION_ID} .fuAlert.fuContrat{background:#fff8ec;border:1px solid #f0dcb4;color:#8a5000}` +
      `#${SECTION_ID} .fuLine{display:block;margin-top:8px;font-size:12px;line-height:1.4;color:#414a57}` +
      `#${SECTION_ID} .fuLine b{color:#1d2939}` +
      `#${SECTION_ID} .fuActions{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:11px}` +
      `#${SECTION_ID} .fuActions button{min-height:44px;border:1px solid #d7dce5;border-radius:12px;background:#fff;color:#1428a0;font-size:12px;font-weight:800}` +
      `#${SECTION_ID} .fuActions button.fuWide{grid-column:1/-1}` +
      `#${SECTION_ID} .fuForm{display:grid;gap:8px;margin-top:10px;padding-top:10px;border-top:1px solid #e7eaf1}` +
      `#${SECTION_ID} .fuForm[hidden]{display:none}` +
      `#${SECTION_ID} .fuForm label{font-size:11px;font-weight:750;color:#6b7280}` +
      `#${SECTION_ID} .fuForm select,#${SECTION_ID} .fuForm input,#${SECTION_ID} .fuForm textarea{width:100%;box-sizing:border-box;min-height:44px;border:1px solid #d7dce5;border-radius:11px;padding:8px 10px;font-size:14px;background:#fff;color:#1d1d1f}` +
      `#${SECTION_ID} .fuForm textarea{min-height:62px;resize:vertical}` +
      `#${SECTION_ID} .fuCheck{display:flex;align-items:center;gap:8px;font-size:12px;color:#414a57}` +
      `#${SECTION_ID} .fuCheck input{width:22px;height:22px;min-height:0}` +
      `#${SECTION_ID} .fuSubmit{min-height:46px;border:0;border-radius:12px;background:#1428a0;color:#fff;font-size:13px;font-weight:850}` +
      `#${SECTION_ID} details{margin-top:9px}` +
      `#${SECTION_ID} summary{font-size:11.5px;font-weight:800;color:#1428a0;cursor:pointer}` +
      `#${SECTION_ID} .fuHistory{list-style:none;margin:7px 0 0;padding:0}` +
      `#${SECTION_ID} .fuHistory li{padding:6px 0;border-top:1px solid #eef0f4;font-size:11.5px;line-height:1.35;color:#5a6472}`;
    d.head.appendChild(style);
  }

  function storeIsCuisiniste(storeId) {
    try {
      const list = (root.state && root.state.stores) || [];
      const store = list.find(s => String(s.id) === String(storeId));
      if (!store) return false;
      // Classification V228, jamais une seconde règle maison.
      return typeof root.storeChannel === 'function' ? root.storeChannel(store) === 'cuisiniste' : false;
    } catch (e) { return false; }
  }

  function siteFor(storeId) {
    const core = v193();
    if (!core || typeof core.siteForStore !== 'function' || typeof core.db !== 'function') return null;
    try { return core.siteForStore(core.db(), storeId); } catch (e) { return null; }
  }

  function storage() { const core = v193(); return core && typeof core.db === 'function' ? core.db() : null; }

  function refresh() {
    const core = v193();
    if (core && typeof core.renderStoreCard === 'function') core.renderStoreCard();
    if (core && typeof core.open === 'function' && doc() && doc().getElementById('srCuisineSheet193')) {
      const sheet = doc().getElementById('srCuisineSheet');
      if (sheet && sheet.open && typeof core.renderSheet === 'function') core.renderSheet();
    }
  }

  function appendForm(section, siteKey, site) {
    const d = doc();
    const form = el('div', null, 'fuForm');
    form.hidden = true;
    const kind = d.createElement('select');
    for (const row of ACTIONS) { const o = d.createElement('option'); o.value = row.id; o.textContent = row.label; kind.appendChild(o); }
    const note = d.createElement('textarea');
    note.setAttribute('placeholder', 'Note (facultatif)');
    const apply = d.createElement('label');
    apply.className = 'fuCheck';
    const box = d.createElement('input');
    box.type = 'checkbox';
    const applyText = el('span', '');
    apply.append(box, applyText);
    const refreshSuggestion = () => {
      const suggests = suggestedStatus(kind.value);
      apply.hidden = !suggests;
      box.checked = !!suggests;
      applyText.textContent = suggests ? 'Passer le statut à « ' + statusLabel(suggests) + ' »' : '';
    };
    kind.addEventListener('change', refreshSuggestion);
    refreshSuggestion();
    const submit = el('button', 'Enregistrer l’action', 'fuSubmit');
    submit.type = 'button';
    submit.addEventListener('click', () => {
      try {
        const suggests = suggestedStatus(kind.value);
        addAction(storage(), siteKey, { type: kind.value, note: note.value,
          status: suggests && box.checked ? suggests : null });
        form.hidden = true; note.value = '';
        refresh();
      } catch (error) { if (typeof root.showError === 'function') root.showError(error.message || String(error)); }
    });
    form.append(el('label', 'Type d’action'), kind, note, apply, submit);
    section.appendChild(form);
    return form;
  }

  function askStatus(siteKey) {
    const current = followupFor(storage(), siteKey).workflowStatus;
    const menu = STATUSES.map((s, i) => (i + 1) + '. ' + s.label).join('\n');
    const answer = root.prompt('Statut du suivi commercial :\n' + menu, String(Math.max(1, STATUS_IDS.indexOf(current) + 1)));
    if (answer === null) return;
    const index = Number(String(answer).trim()) - 1;
    if (!STATUSES[index]) return;
    try { setStatus(storage(), siteKey, STATUSES[index].id); refresh(); }
    catch (error) { if (typeof root.showError === 'function') root.showError(error.message || String(error)); }
  }

  function askReminder(siteKey) {
    const current = followupFor(storage(), siteKey).nextAction;
    const label = root.prompt('Prochaine action :', (current && current.label) || 'Relancer le responsable');
    if (label === null) return;
    if (!String(label).trim()) { try { clearNextAction(storage(), siteKey); refresh(); } catch (e) {} return; }
    const due = root.prompt('Date (AAAA-MM-JJ) :', (current && current.dueDate) || today());
    if (due === null) return;
    try { setNextAction(storage(), siteKey, { label, dueDate: String(due).trim(), type: 'relance' }); refresh(); }
    catch (error) { if (typeof root.showError === 'function') root.showError(error.message || String(error)); }
  }

  /* V225 possède les règles de proposition (2 à 5 références, « pas d'expo », objectif
     présent, groupement). On ne les réécrit pas : on lui fournit une allocation et on
     affiche telle quelle l'erreur qu'il renvoie. */
  function proposalEngine() {
    const p = root.StoreRunnerCuisinisteProposalV225;
    return p && typeof p.buildProposal === 'function' && typeof p.eligibleProducts === 'function' ? p : null;
  }

  function proposalAvailable(site) {
    const p = proposalEngine();
    if (!p || !site || !site.storeId) return false;
    try { return p.eligibleProducts(storage()).length >= (p.MIN_PRODUCTS || 2); } catch (e) { return false; }
  }

  function askProposal(siteKey, site) {
    const p = proposalEngine();
    if (!p || !site || !site.storeId) return;
    let eligible = [];
    try { eligible = p.eligibleProducts(storage()); } catch (e) { eligible = []; }
    const refs = eligible.map(x => p.productRef(x)).filter(Boolean);
    if (!refs.length) return;
    const min = p.MIN_PRODUCTS || 2, max = p.MAX_PRODUCTS || 5;
    const answer = root.prompt(
      'Références expo à proposer (' + min + ' à ' + max + '), séparées par une virgule.\n' +
      'Disponibles : ' + refs.slice(0, 12).join(', ') + (refs.length > 12 ? '…' : ''),
      refs.slice(0, min).join(', '));
    if (answer === null) return;
    const chosen = String(answer).split(',').map(x => x.trim()).filter(Boolean);
    let built = null;
    try { built = p.buildProposal(storage(), [{ storeId: site.storeId, refs: chosen }], (root.state && root.state.stores) || []); }
    catch (error) {
      const message = (error && error.message) || String(error);
      if (typeof root.showError === 'function') root.showError(message);
      else if (typeof root.alert === 'function') root.alert(message);
      return;
    }
    const lines = (built.products || []).map(x => x.ref).filter(Boolean);
    try {
      addAction(storage(), siteKey, { type: 'proposition', note: 'Proposition préparée : ' + lines.join(' · ') });
      refresh();
    } catch (e) {}
    if (typeof root.storeRunnerToast === 'function') root.storeRunnerToast('Proposition prête : ' + lines.join(' · '));
    else if (typeof root.alert === 'function') root.alert('Proposition prête : ' + lines.join(' · '));
  }

  /* Bloc de suivi commercial, posé juste avant la carte contrat de V193 pour respecter
     l'ordre mobile : statut, alerte, prochaine action, dernière action — puis les
     données du contrat, qui restent la propriété de V193. */
  function renderStoreSection(storeId) {
    const d = doc();
    if (!d) return false;
    const existing = d.getElementById(SECTION_ID);
    if (!storeId || !storeIsCuisiniste(storeId)) { if (existing) existing.remove(); return false; }
    const card = d.getElementById('srCuisineContractCard');
    const anchor = card || d.getElementById('sqPerformance') || d.getElementById('sqVisitCredit') || d.getElementById('sqAddress');
    if (!anchor) { if (existing) existing.remove(); return false; }

    css();
    const site = siteFor(storeId);
    if (site && site.key) { try { reconcileKeys(storage(), [site]); } catch (e) {} }
    const siteKey = site && site.key ? site.key : fallbackKey(storeId);
    const followup = followupFor(storage(), siteKey);
    const status = statusFor(followup, site);
    const rows = alerts(site, followup, new Date());

    const section = existing || el('section', null, null);
    section.id = SECTION_ID;
    section.setAttribute('aria-label', 'Suivi commercial du contrat expo');
    section.replaceChildren();

    const top = el('div', null, 'fuTop');
    top.append(el('span', 'Suivi commercial', 'fuTitle'),
      el('span', status ? statusLabel(status) : 'À qualifier', 'fuStatus' + (status === 'aucun-contrat' || !status ? ' fuNone' : '')));
    section.appendChild(top);

    for (const alert of rows.slice(0, 2)) {
      section.appendChild(el('span', alert.label + (alert.detail ? ' · ' + alert.detail : ''),
        'fuAlert ' + (alert.kind === 'contrat' ? 'fuContrat' : 'fuSuivi')));
    }

    const next = followup.nextAction;
    const nextLine = el('span', null, 'fuLine');
    nextLine.append(el('b', 'Prochaine action : '), d.createTextNode(next ? next.label + (next.dueDate ? ' · ' + fr(next.dueDate) : '') : 'aucune'));
    section.appendChild(nextLine);

    const last = followup.lastAction;
    const lastLine = el('span', null, 'fuLine');
    lastLine.append(el('b', 'Dernière action : '), d.createTextNode(last ? last.label + (last.date ? ' · ' + fr(String(last.date).slice(0, 10)) : '') : 'aucune'));
    section.appendChild(lastLine);

    if (!site || !(site.activeContract || site.lastContract)) {
      section.appendChild(el('span', 'Aucun contrat suivi pour ce magasin.', 'fuLine'));
    }

    const actions = el('div', null, 'fuActions');
    const add = el('button', '+ Action', null); add.type = 'button';
    const statusBtn = el('button', 'Modifier le statut', null); statusBtn.type = 'button';
    statusBtn.addEventListener('click', () => askStatus(siteKey));
    const remind = el('button', 'Programmer une relance', 'fuWide'); remind.type = 'button';
    remind.addEventListener('click', () => askReminder(siteKey));
    actions.append(add, statusBtn, remind);
    if (proposalAvailable(site)) {
      const propose = el('button', 'Préparer une proposition', 'fuWide');
      propose.type = 'button';
      propose.id = 'srCuisineFollowupPropose';
      propose.addEventListener('click', () => askProposal(siteKey, site));
      actions.appendChild(propose);
    }
    section.appendChild(actions);

    const form = appendForm(section, siteKey, site);
    add.addEventListener('click', () => { form.hidden = !form.hidden; });

    if (followup.history.length) {
      const details = d.createElement('details');
      details.appendChild(el('summary', 'Historique · ' + followup.history.length));
      const list = el('ul', null, 'fuHistory');
      for (const row of followup.history.slice().reverse().slice(0, 12)) {
        list.appendChild(el('li', fr(String(row.date).slice(0, 10)) + ' · ' + row.label + (row.note ? ' — ' + row.note : '')));
      }
      details.appendChild(list);
      section.appendChild(details);
    }

    if (!existing) {
      if (card) card.insertAdjacentElement('beforebegin', section);
      else anchor.insertAdjacentElement('afterend', section);
    }
    return true;
  }

  /* Écran central : un résumé, des filtres, et le suivi sur chaque ligne. On réutilise
     l'écran « Contrats expo » existant, on n'en ouvre pas un second. */
  let activeFilter = 'all';

  function renderSheetHeader(body, sites) {
    const d = doc();
    if (!d || !body) return null;
    css();
    const rows = Array.isArray(sites) ? sites : [];
    try { reconcileKeys(storage(), rows); } catch (e) {}
    const now = new Date();
    const counts = summary(storage(), rows, now);

    const head = el('section', null, 'fuSheetHead');
    const chips = el('div', null, 'fuSheetCounts');
    for (const filter of FILTERS) {
      if (filter.id === 'all') continue;
      const chip = el('span', null, 'fuSheetCount');
      chip.append(el('b', String(counts[filter.id] || 0)), el('span', filter.label));
      chips.appendChild(chip);
    }
    head.appendChild(chips);

    const tabs = el('div', null, 'fuSheetTabs');
    for (const filter of FILTERS) {
      const tab = el('button', filter.label, null);
      tab.type = 'button';
      tab.setAttribute('aria-pressed', String(filter.id === activeFilter));
      tab.addEventListener('click', () => {
        activeFilter = filter.id;
        const core = v193();
        if (core && typeof core.renderSheet === 'function') core.renderSheet();
      });
      tabs.appendChild(tab);
    }
    head.appendChild(tabs);
    body.appendChild(head);

    const shown = rows.filter(site => matchesFilter(activeFilter, site, followupFor(storage(), site && site.key), now));
    if (!shown.length) body.appendChild(el('p', 'Aucun cuisiniste dans ce filtre.', 'srCuisineMeta'));
    return shown;
  }

  function renderSheetRow(box, site) {
    const d = doc();
    if (!d || !box || !site) return false;
    const followup = followupFor(storage(), site.key);
    const status = statusFor(followup, site);
    const rows = alerts(site, followup, new Date());
    const line = el('div', null, 'fuRowLine');
    line.appendChild(el('span', status ? statusLabel(status) : 'À qualifier',
      'fuStatus' + (status === 'aucun-contrat' || !status ? ' fuNone' : '')));
    if (rows.length) line.appendChild(el('span', rows[0].label, 'fuRowAlert ' + (rows[0].kind === 'contrat' ? 'fuContrat' : 'fuSuivi')));
    box.appendChild(line);
    const next = followup.nextAction;
    if (next) box.appendChild(el('span', 'Prochaine action : ' + next.label + (next.dueDate ? ' · ' + fr(next.dueDate) : ''), 'srCuisineMeta'));
    return true;
  }

  function sheetCss() {
    const d = doc();
    if (!d || d.getElementById(STYLE_ID + 'Sheet')) return;
    const style = d.createElement('style');
    style.id = STYLE_ID + 'Sheet';
    style.textContent =
      '.fuSheetHead{display:block;margin:0 0 12px}' +
      '.fuSheetCounts{display:grid;grid-template-columns:repeat(2,1fr);gap:7px}' +
      '.fuSheetCount{display:flex;flex-direction:column;gap:2px;padding:9px 11px;border:1px solid #e2e6ef;border-radius:13px;background:#fbfcff}' +
      '.fuSheetCount b{font-size:19px;letter-spacing:-.02em;color:#1d2939}' +
      '.fuSheetCount span{font-size:10.5px;color:#6b7280;font-weight:700}' +
      '.fuSheetTabs{display:flex;gap:6px;overflow-x:auto;margin-top:10px;padding-bottom:2px}' +
      '.fuSheetTabs button{flex:0 0 auto;min-height:40px;padding:0 12px;border:1px solid #d7dce5;border-radius:999px;background:#fff;color:#4b5563;font-size:12px;font-weight:800;white-space:nowrap}' +
      '.fuSheetTabs button[aria-pressed="true"]{background:#1428a0;border-color:#1428a0;color:#fff}' +
      '.fuRowLine{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-top:7px}' +
      '.fuRowAlert{padding:4px 8px;border-radius:999px;font-size:10.5px;font-weight:800}' +
      '.fuRowAlert.fuSuivi{background:#fff4f3;color:#b42318}' +
      '.fuRowAlert.fuContrat{background:#fff8ec;color:#8a5000}';
    d.head.appendChild(style);
  }

  api.renderStoreSection = renderStoreSection;
  api.renderSheetHeader = (body, sites) => { sheetCss(); return renderSheetHeader(body, sites); };
  api.renderSheetRow = renderSheetRow;
  api.storeIsCuisiniste = storeIsCuisiniste;
  api.activeFilter = () => activeFilter;
  api.setFilter = value => { activeFilter = FILTERS.some(f => f.id === value) ? value : 'all'; return activeFilter; };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.StoreRunnerCuisinisteFollowupV229 = api;
})(typeof window !== 'undefined' ? window : globalThis);
