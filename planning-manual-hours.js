(function(root){
  'use strict';

  /* Store Runner V1 — horaires manuels d'une visite.
   *
   * Aucun nouvel ordonnanceur : la contrainte est écrite dans `state.appointments`,
   * le registre qui existe déjà, et c'est `StoreOpeningHoursV1.scheduleRoute` — le
   * seul ordonnanceur qui décide de l'heure affichée dans la timeline — qui la lit
   * et propage la suite de la journée. Ce module ne fait qu'écrire la contrainte et
   * la présenter.
   *
   * L'entrée est datée : elle vaut pour la visite de CE jour, jamais pour le magasin
   * en général. Repasser en automatique = supprimer l'entrée.
   */

  const TYPE = 'Horaire manuel';
  const DIALOG_ID = 'manualHoursDialog';
  const STYLE_ID = 'planning-manual-hours-css';
  const MIN_MINUTES = 15;

  function minutes(value) {
    const m = String(value == null ? '' : value).trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const h = Number(m[1]), n = Number(m[2]);
    return h >= 0 && h <= 23 && n >= 0 && n <= 59 ? h * 60 + n : null;
  }

  function clock(total) {
    if (total == null || !Number.isFinite(Number(total))) return '';
    const m = Math.round(Number(total));
    return String(Math.floor(((m % 1440) + 1440) % 1440 / 60)).padStart(2, '0') + ':' + String(((m % 60) + 60) % 60).padStart(2, '0');
  }

  function isManual(row) { return !!(row && row.manualHours === true); }

  /* Arrivée + départ => durée déduite. Arrivée seule => la durée prévue est conservée,
     jamais réinventée. */
  function deriveDuration(time, endTime, fallback) {
    const start = minutes(time);
    if (start == null) return { ok: false, error: 'Renseigne une heure d’arrivée valide.' };
    const planned = Math.max(MIN_MINUTES, Math.round(Number(fallback) || 60));
    const raw = String(endTime == null ? '' : endTime).trim();
    if (!raw) return { ok: true, duration: planned, derived: false };
    const end = minutes(raw);
    if (end == null) return { ok: false, error: 'Renseigne une heure de départ valide.' };
    if (end <= start) return { ok: false, error: 'Le départ doit être après l’arrivée.' };
    const duration = end - start;
    if (duration < MIN_MINUTES) return { ok: false, error: `Une visite dure au moins ${MIN_MINUTES} minutes.` };
    return { ok: true, duration, derived: true };
  }

  function findManual(state, storeId, date) {
    const rows = (state && state.appointments) || [];
    return rows.find(row => isManual(row) && String(row.storeId) === String(storeId) && row.date === date) || null;
  }

  /* Un vrai rendez-vous n'est jamais remplacé par un horaire manuel : les deux
     vivent dans le même registre, on ne touche que nos propres entrées. */
  function realAppointment(state, storeId, date) {
    const rows = (state && state.appointments) || [];
    return rows.find(row => !isManual(row) && String(row.storeId) === String(storeId) && row.date === date) || null;
  }

  function buildEntry(options) {
    const { storeId, date, time, endTime, duration, id } = options;
    return {
      id: id || ('mh' + Date.now()),
      storeId: String(storeId),
      date,
      time,
      endTime: endTime ? endTime : null,
      duration,
      type: TYPE,
      manualHours: true,
      note: '',
    };
  }

  function applyManual(state, options) {
    if (!state) throw Error('État indisponible.');
    if (!Array.isArray(state.appointments)) state.appointments = [];
    const existing = findManual(state, options.storeId, options.date);
    const entry = buildEntry(Object.assign({}, options, { id: existing ? existing.id : null }));
    if (existing) state.appointments[state.appointments.indexOf(existing)] = entry;
    else state.appointments.push(entry);
    return entry;
  }

  function clearManual(state, storeId, date) {
    if (!state || !Array.isArray(state.appointments)) return false;
    const before = state.appointments.length;
    state.appointments = state.appointments.filter(row => !(isManual(row) && String(row.storeId) === String(storeId) && row.date === date));
    return state.appointments.length !== before;
  }

  /* Lecture seule de l'ordonnanceur unique : ni recalcul ni copie de sa logique. */
  function scheduleFor(day, state) {
    const api = root.StoreOpeningHoursV1;
    if (!api || typeof api.scheduleRoute !== 'function') return null;
    const plan = (state && state.plan) || {};
    const route = plan[day] || [];
    if (!route.length) return null;
    try { return api.scheduleRoute(route, day, state); } catch (error) { return null; }
  }

  function rowFor(day, storeId, state) {
    const schedule = scheduleFor(day, state || root.state);
    if (!schedule) return null;
    return schedule.rows.find(row => String(row.store && row.store.id) === String(storeId)) || null;
  }

  const api = { TYPE, MIN_MINUTES, minutes, clock, isManual, deriveDuration, findManual, realAppointment,
    buildEntry, applyManual, clearManual, scheduleFor, rowFor };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof root.document === 'undefined' || !root.document) { root.StoreRunnerManualHours = api; return; }

  // ---------------------------------------------------------------- interface

  function css() {
    const doc = root.document;
    if (doc.getElementById(STYLE_ID)) return;
    const style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent =
      `#${DIALOG_ID}{display:none;position:fixed;inset:0;z-index:10020;background:rgba(20,24,32,.26);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}` +
      `#${DIALOG_ID}.open{display:block}` +
      `#${DIALOG_ID} .mhCard{position:absolute;left:12px;right:12px;bottom:calc(16px + env(safe-area-inset-bottom));max-height:calc(100vh - 60px);max-height:calc(100dvh - 60px);overflow:auto;padding:10px 12px 14px;border-radius:26px;background:rgba(250,251,253,.98);border:1px solid rgba(255,255,255,.9);box-shadow:0 26px 74px rgba(20,25,35,.25)}` +
      `#${DIALOG_ID} .mhHandle{width:42px;height:5px;border-radius:999px;background:#d3d6dc;margin:2px auto 12px}` +
      `#${DIALOG_ID} h2{margin:0 0 2px;font-size:19px;letter-spacing:-.02em}` +
      `#${DIALOG_ID} .mhStore{margin:0 0 12px;font-size:12px;color:#6b7280}` +
      `#${DIALOG_ID} .mhModes{display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:4px;border-radius:15px;background:#eceff4;margin-bottom:12px}` +
      `#${DIALOG_ID} .mhModes button{min-height:44px;border:0;border-radius:11px;background:transparent;font-size:13px;font-weight:800;color:#525a66}` +
      `#${DIALOG_ID} .mhModes button[aria-pressed="true"]{background:#fff;color:#1428a0;box-shadow:0 2px 8px rgba(25,42,80,.09)}` +
      `#${DIALOG_ID} .mhFields{display:grid;grid-template-columns:1fr 1fr;gap:9px}` +
      `#${DIALOG_ID} .mhFields label{display:block;font-size:11px;font-weight:750;color:#6b7280;margin-bottom:4px}` +
      `#${DIALOG_ID} .mhFields input{width:100%;box-sizing:border-box;min-height:46px;border:1px solid #d7dce5;border-radius:13px;padding:0 10px;font-size:15px;background:#fff;color:#1d1d1f}` +
      `#${DIALOG_ID} .mhReadout{margin:11px 0 0;font-size:12.5px;line-height:1.45;color:#475467}` +
      `#${DIALOG_ID} .mhReadout b{color:#1d2939}` +
      `#${DIALOG_ID} .mhWarn{margin:9px 0 0;padding:9px 11px;border-radius:13px;background:#fff4f3;border:1px solid #f4c9c3;color:#b42318;font-size:12px;line-height:1.4;font-weight:700}` +
      `#${DIALOG_ID} .mhWarn[hidden]{display:none}` +
      `#${DIALOG_ID} .mhWarn.mhNote{background:#f4f8ff;border-color:#cbdcf7;color:#1f3c74;font-weight:650}` +
      `#${DIALOG_ID} .mhActions{display:grid;gap:8px;margin-top:13px}` +
      `#${DIALOG_ID} .mhActions button{min-height:48px;border:0;border-radius:15px;font-size:14px;font-weight:850}` +
      `#${DIALOG_ID} .mhSave{background:#1428a0;color:#fff}` +
      `#${DIALOG_ID} .mhAuto{background:rgba(235,238,244,.9);color:#1d1d1f}` +
      `#${DIALOG_ID} .mhClose{background:#111217;color:#fff}`;
    doc.head.appendChild(style);
  }

  let context = null;

  function dialog() {
    const doc = root.document;
    css();
    let el = doc.getElementById(DIALOG_ID);
    if (el) return el;
    el = doc.createElement('div');
    el.id = DIALOG_ID;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'Horaires de la visite');
    el.innerHTML = '<div class="mhCard"><div class="mhHandle"></div>'
      + '<h2>Horaires de la visite</h2><p class="mhStore" data-mh-store></p>'
      + '<div class="mhModes"><button type="button" data-mh-mode="auto">Automatique</button>'
      + '<button type="button" data-mh-mode="manual">Horaire imposé</button></div>'
      + '<div class="mhFields" data-mh-fields><div><label for="mhArrival">Arrivée</label>'
      + '<input id="mhArrival" type="time" step="300" data-mh-arrival></div>'
      + '<div><label for="mhDeparture">Départ (optionnel)</label>'
      + '<input id="mhDeparture" type="time" step="300" data-mh-departure></div></div>'
      + '<p class="mhReadout" data-mh-readout></p><p class="mhWarn" data-mh-warn hidden></p>'
      + '<div class="mhActions"><button type="button" class="mhSave" data-mh-save>Enregistrer</button>'
      + '<button type="button" class="mhAuto" data-mh-auto>Repasser en automatique</button>'
      + '<button type="button" class="mhClose" data-mh-close>Fermer</button></div></div>';
    doc.body.appendChild(el);
    el.addEventListener('click', event => { if (event.target === el) close(); });
    el.querySelector('[data-mh-close]').addEventListener('click', close);
    el.querySelector('[data-mh-auto]').addEventListener('click', backToAuto);
    el.querySelector('[data-mh-save]').addEventListener('click', save);
    for (const mode of ['auto', 'manual']) {
      el.querySelector(`[data-mh-mode="${mode}"]`).addEventListener('click', () => setMode(mode));
    }
    el.querySelector('[data-mh-arrival]').addEventListener('input', refresh);
    el.querySelector('[data-mh-departure]').addEventListener('input', refresh);
    return el;
  }

  function setMode(mode) {
    if (!context) return;
    context.mode = mode;
    const el = dialog();
    for (const name of ['auto', 'manual']) {
      el.querySelector(`[data-mh-mode="${name}"]`).setAttribute('aria-pressed', String(name === mode));
    }
    el.querySelector('[data-mh-fields]').hidden = mode !== 'manual';
    el.querySelector('[data-mh-save]').hidden = mode !== 'manual';
    refresh();
  }

  function refresh() {
    if (!context) return;
    const el = dialog();
    const readout = el.querySelector('[data-mh-readout]');
    const warn = el.querySelector('[data-mh-warn]');
    const row = context.row;
    const travel = row && Number.isFinite(Number(row.travel)) ? Math.round(Number(row.travel)) : null;
    const travelText = travel == null ? '' : (travel < 1 ? ' · trajet de moins d’une minute' : ` · ${travel} min de trajet`);

    if (context.mode !== 'manual') {
      const arrival = row && row.arrival != null ? clock(row.arrival) : '—';
      readout.innerHTML = `Arrivée estimée <b>${arrival}</b>, durée prévue <b>${context.plannedDuration} min</b>${travelText}.`;
      warn.classList.remove('mhNote');
      warn.hidden = true;
      return;
    }

    const arrival = el.querySelector('[data-mh-arrival]').value;
    const departure = el.querySelector('[data-mh-departure]').value;
    const derived = deriveDuration(arrival, departure, context.plannedDuration);
    if (!derived.ok) {
      readout.textContent = derived.error;
      warn.classList.remove('mhNote');
      warn.hidden = true;
      return;
    }
    const end = minutes(arrival) + derived.duration;
    readout.innerHTML = `Arrivée <b>${arrival}</b> · départ <b>${clock(end)}</b> · <b>${derived.duration} min</b> sur place`
      + (derived.derived ? ' (déduits du départ)' : ' (durée prévue conservée)') + travelText + '.';

    const wanted = minutes(arrival);

    /* Premier arrêt : rien ne le précède, donc rien n'est impossible de ce seul fait.
       Vouloir y être plus tôt revient à partir plus tôt de la base — une information,
       pas une alerte. Les magasins suivants, eux, gardent l'avertissement : une visite
       et un trajet réels les précèdent. */
    if (row && Number(row.index) === 0 && travel != null && wanted != null) {
      const departure = wanted - travel;
      /* Le départ ne vient pas toujours de la base : après une nuit sur place il vient
         de l'hôtel ou du point de départ confirmé. On nomme le vrai lieu. */
      const from = root.StoreRunnerDayOrigin && typeof root.StoreRunnerDayOrigin.label === 'function'
        ? root.StoreRunnerDayOrigin.label(context.origin) : 'la base';
      let text = `Départ conseillé depuis ${from} : ${clock(departure)} pour arriver à ${arrival}.`;
      if (context.dayStart != null && departure < Number(context.dayStart)) {
        text += ` Votre journée est habituellement réglée à partir de ${clock(context.dayStart)}.`;
      }
      warn.classList.add('mhNote');
      warn.hidden = false;
      warn.textContent = text;
      return;
    }

    warn.classList.remove('mhNote');
    // Ne jamais laisser croire qu'une arrivée plus tôt que la visite et le trajet
    // précédents est tenable.
    const earliest = row && Number.isFinite(Number(row.nominalArrival)) ? Math.round(Number(row.nominalArrival)) : null;
    if (earliest != null && wanted != null && wanted < earliest) {
      warn.hidden = false;
      warn.textContent = `Impossible à tenir : au plus tôt ${clock(earliest)} compte tenu des visites et trajets précédents.`;
    } else {
      warn.hidden = true;
    }
  }

  function open(storeId, day) {
    const state = root.state;
    if (!state) return false;
    const api2 = root.StoreOpeningHoursV1;
    const resolvedDay = day || (api2 && typeof api2.dayNow === 'function' ? api2.dayNow() : null);
    if (!resolvedDay) return false;
    const date = api2 && typeof api2.dateForDay === 'function' ? api2.dateForDay(resolvedDay, state) : null;
    if (!date) return false;
    const store = (state.stores || []).find(row => String(row.id) === String(storeId));
    if (!store) return false;
    if (realAppointment(state, storeId, date)) {
      if (typeof root.showError === 'function') {
        root.showError('Ce magasin a déjà un rendez-vous ce jour-là : modifie le rendez-vous plutôt que les horaires.');
      }
      return false;
    }

    const schedule = scheduleFor(resolvedDay, state);
    const row = schedule ? schedule.rows.find(item => String(item.store && item.store.id) === String(storeId)) || null : null;
    const existing = findManual(state, storeId, date);
    let planned = 60;
    try {
      planned = typeof root.storeVisitDuration === 'function' ? root.storeVisitDuration(store, state)
        : Math.max(15, Number(state.settings && state.settings.visitMinutes) || 60);
    } catch (error) { planned = 60; }
    if (existing && !existing.endTime) planned = Math.max(15, Number(existing.duration) || planned);

    context = { storeId: String(storeId), day: resolvedDay, date, row, dayStart: schedule ? schedule.start : null,
      origin: schedule ? schedule.origin : null,
      plannedDuration: Math.round(planned), mode: existing ? 'manual' : 'auto' };

    const el = dialog();
    el.querySelector('[data-mh-store]').textContent = `${store.enseigne} ${store.ville} · ${resolvedDay} ${date.split('-').reverse().join('/')}`;
    el.querySelector('[data-mh-arrival]').value = existing ? existing.time : (row && row.arrival != null ? clock(row.arrival) : '');
    el.querySelector('[data-mh-departure]').value = existing && existing.endTime ? existing.endTime : '';
    el.querySelector('[data-mh-auto]').hidden = !existing;
    setMode(context.mode);
    el.classList.add('open');
    return true;
  }

  function close() {
    const el = root.document.getElementById(DIALOG_ID);
    if (el) el.classList.remove('open');
    context = null;
  }

  function commit(mutate) {
    const state = root.state;
    try {
      mutate(state);
      if (typeof root.save === 'function') root.save();
      if (typeof root.renderAll === 'function') root.renderAll();
      else if (typeof root.renderWeek === 'function') root.renderWeek();
      root.document.dispatchEvent(new CustomEvent('store-runner:planning-updated'));
      return true;
    } catch (error) {
      if (typeof root.showError === 'function') root.showError(error.message || String(error));
      return false;
    }
  }

  function save() {
    if (!context) return;
    const el = dialog();
    const arrival = el.querySelector('[data-mh-arrival]').value;
    const departure = el.querySelector('[data-mh-departure]').value;
    const derived = deriveDuration(arrival, departure, context.plannedDuration);
    if (!derived.ok) { refresh(); return; }
    const ctx = context;
    if (commit(state => applyManual(state, { storeId: ctx.storeId, date: ctx.date, time: arrival,
      endTime: departure || null, duration: derived.duration }))) close();
  }

  function backToAuto() {
    if (!context) return;
    const ctx = context;
    if (commit(state => clearManual(state, ctx.storeId, ctx.date))) close();
  }

  /* Aucun point d'entrée dans la fiche magasin : depuis #368, le bloc ARRIVÉE de la
     ligne de planning ouvre cet éditeur. Un second bouton ne ferait que dupliquer la
     même action, plus loin et moins visible. L'API open() reste publique. */
  function boot() {
    css();
  }

  root.StoreRunnerManualHours = Object.assign({}, api, { open, close });
  if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})(typeof window !== 'undefined' ? window : globalThis);
