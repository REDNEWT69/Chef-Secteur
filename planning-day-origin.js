(function(root){
  'use strict';

  /* Store Runner V1 — point de départ réel d'une journée.
   *
   * Le planning calculait toujours le premier trajet depuis la base habituelle. Après
   * une nuit sur place, c'est faux : on repart de là où on a dormi, pas de chez soi.
   *
   * Trois cas, et un seul interdit :
   *   - pas de découché la veille        -> base habituelle, comportement inchangé ;
   *   - découché + hôtel localisé        -> l'hôtel ;
   *   - découché sans position précise   -> on DEMANDE. Jamais de retour muet à la base.
   *
   * L'hôtel garde ses coordonnées dans state.hotelReservations : aucune duplication.
   * state.dayOrigins[date] ne stocke que ce que l'utilisateur a explicitement confirmé
   * quand l'hôtel ne suffisait pas — une décision, pas un fait déjà écrit ailleurs.
   */

  const ORIGINS_KEY = 'dayOrigins';
  const MIN_DEGREE = 0.01;   // au-delà du 0 par défaut : une vraie position

  function isoDate(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value) : null;
  }

  function dayBefore(date) {
    const iso = isoDate(date);
    if (!iso) return null;
    const d = new Date(iso + 'T12:00:00Z');
    if (!Number.isFinite(d.getTime())) return null;
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  }

  function located(point) {
    if (!point) return false;
    const lat = Number(point.lat), lon = Number(point.lon);
    return Number.isFinite(lat) && Number.isFinite(lon) && (Math.abs(lat) > MIN_DEGREE || Math.abs(lon) > MIN_DEGREE);
  }

  function reservations(state) {
    const rows = state && state.hotelReservations;
    return rows && typeof rows === 'object' && !Array.isArray(rows) ? rows : {};
  }

  /* La nuit qui précède une date : la réservation dont le lendemain est cette date.
     `toDate` fait foi quand il est renseigné ; sinon la veille calendaire suffit. */
  function nightBefore(date, state) {
    const iso = isoDate(date);
    if (!iso) return null;
    const rows = reservations(state);
    const eve = dayBefore(iso);
    for (const key of Object.keys(rows)) {
      const row = rows[key];
      if (!row) continue;
      if (isoDate(row.toDate) === iso) return row;
      if (!isoDate(row.toDate) && isoDate(row.fromDate || key) === eve) return row;
    }
    return null;
  }

  function storedOrigins(state) {
    const rows = state && state[ORIGINS_KEY];
    return rows && typeof rows === 'object' && !Array.isArray(rows) ? rows : {};
  }

  function baseOrigin(state) {
    const profile = (state && state.profile) || {};
    return {
      type: 'base',
      label: profile.baseName || 'la base',
      ville: profile.baseName || '',
      adresse: profile.baseAddress || '',
      lat: Number(profile.baseLat) || 0,
      lon: Number(profile.baseLon) || 0,
    };
  }

  function hotelOrigin(reservation) {
    return {
      type: 'hotel',
      label: reservation.hotelName || 'l’hôtel',
      ville: reservation.zone || '',
      adresse: reservation.address || '',
      lat: Number(reservation.lat),
      lon: Number(reservation.lon),
    };
  }

  /* Le point de départ effectif d'une date. `pending` dit que la question doit être
     posée : la base sert alors de repli de calcul, mais jamais en silence. */
  function originFor(date, state = root.state) {
    const iso = isoDate(date);
    const base = baseOrigin(state);
    if (!iso || !state) return Object.assign({}, base, { pending: false, nightDate: null, suggestion: '' });

    const night = nightBefore(iso, state);
    if (!night) return Object.assign({}, base, { pending: false, nightDate: null, suggestion: '' });

    const nightDate = isoDate(night.fromDate) || dayBefore(iso);
    if (located(night)) {
      return Object.assign(hotelOrigin(night), { pending: false, nightDate, suggestion: night.zone || '' });
    }

    const confirmed = storedOrigins(state)[iso];
    if (confirmed && located(confirmed) && confirmed.sourceNightDate === nightDate) {
      return {
        type: confirmed.type === 'custom' ? 'custom' : 'zone',
        label: confirmed.label || confirmed.ville || 'le point de départ choisi',
        ville: confirmed.ville || '',
        adresse: confirmed.adresse || '',
        lat: Number(confirmed.lat),
        lon: Number(confirmed.lon),
        pending: false,
        nightDate,
        suggestion: night.zone || '',
      };
    }

    // Découché sans position exploitable : on ne décide pas à la place de l'utilisateur.
    return Object.assign({}, base, {
      pending: true,
      nightDate,
      suggestion: night.zone || '',
      hotelName: night.hotelName || '',
    });
  }

  /* Ce que l'ordonnanceur attend : un point de départ au format magasin. */
  function baseFor(date, state = root.state) {
    const origin = originFor(date, state);
    return { id: 'ORIGIN', enseigne: 'Départ', ville: origin.ville, adresse: origin.adresse,
      lat: origin.lat, lon: origin.lon, originType: origin.type, originLabel: origin.label,
      originPending: origin.pending };
  }

  function label(origin) {
    if (!origin) return 'la base';
    if (origin.type === 'base') return 'la base';
    return origin.label || (origin.type === 'hotel' ? 'l’hôtel' : origin.ville || 'le point de départ choisi');
  }

  function confirmOrigin(state, date, choice) {
    const iso = isoDate(date);
    if (!iso) throw Error('Date de départ invalide.');
    if (!located(choice)) throw Error('Ce point de départ n’a pas de position exploitable.');
    if (!state[ORIGINS_KEY] || typeof state[ORIGINS_KEY] !== 'object' || Array.isArray(state[ORIGINS_KEY])) state[ORIGINS_KEY] = {};
    const night = nightBefore(iso, state);
    state[ORIGINS_KEY][iso] = {
      type: choice.type === 'custom' ? 'custom' : 'zone',
      label: String(choice.label || choice.ville || '').trim(),
      ville: String(choice.ville || '').trim(),
      adresse: String(choice.adresse || '').trim(),
      lat: Number(choice.lat),
      lon: Number(choice.lon),
      sourceNightDate: (night && isoDate(night.fromDate)) || dayBefore(iso),
      confirmedAt: new Date().toISOString(),
    };
    return state[ORIGINS_KEY][iso];
  }

  function clearOrigin(state, date) {
    const iso = isoDate(date);
    if (!iso || !state || !state[ORIGINS_KEY]) return false;
    if (!Object.prototype.hasOwnProperty.call(state[ORIGINS_KEY], iso)) return false;
    delete state[ORIGINS_KEY][iso];
    return true;
  }

  /* Une origine dérivée ne survit pas à la nuit qui l'a justifiée : si le découché
     disparaît ou change de date, le choix qui en découlait n'a plus d'objet. */
  function pruneOrigins(state) {
    const rows = state && state[ORIGINS_KEY];
    if (!rows || typeof rows !== 'object' || Array.isArray(rows)) return 0;
    let removed = 0;
    for (const date of Object.keys(rows)) {
      const entry = rows[date];
      const night = nightBefore(date, state);
      const stillValid = !!night && (!entry || !entry.sourceNightDate
        || entry.sourceNightDate === (isoDate(night.fromDate) || dayBefore(date)));
      if (!stillValid) { delete rows[date]; removed++; }
    }
    return removed;
  }

  const api = { ORIGINS_KEY, isoDate, dayBefore, located, nightBefore, originFor, baseFor, label,
    confirmOrigin, clearOrigin, pruneOrigins, baseOrigin };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.StoreRunnerDayOrigin = api;
})(typeof window !== 'undefined' ? window : globalThis);
