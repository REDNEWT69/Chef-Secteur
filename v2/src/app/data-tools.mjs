// Store Runner V2 — outils de données locales montés dans l'écran Plus.
// Aucun upload : File.text() -> conversion pure -> store central local.

import { parseAndMigrateV1Backup, V1MigrationError } from '../migration/v1-backup.mjs';
import { STALE_TAB_MESSAGE } from '../storage/tab-guard.mjs';

export class DataToolsError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DataToolsError';
  }
}

function requireOptions(options) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new DataToolsError('createDataToolsFeature attend { document, store }.');
  }
  const { document, store } = options;
  if (!document || typeof document.createElement !== 'function') throw new DataToolsError('Un document valide est requis.');
  if (!store || typeof store.replace !== 'function' || typeof store.getState !== 'function') {
    throw new DataToolsError('Un store V2 valide est requis.');
  }
  return { document, store };
}

function plural(value, singular, pluralForm = `${singular}s`) {
  return Number(value) > 1 ? pluralForm : singular;
}

export function createDataToolsFeature(options) {
  const { document: doc, store } = requireOptions(options);

  const root = doc.createElement('section');
  root.classList.add('srv2-data-tools');

  const title = doc.createElement('h2');
  title.classList.add('srv2-data-tools-title');
  title.textContent = 'Données locales';

  const privacy = doc.createElement('p');
  privacy.classList.add('srv2-data-tools-privacy');
  privacy.textContent = 'Import local uniquement : le fichier reste sur cet appareil et n’est envoyé à aucun serveur.';

  const note = doc.createElement('p');
  note.classList.add('srv2-data-tools-note');
  note.textContent = 'Le pont V1 copie le secteur, les magasins, leurs GPS et les réglages de planning. L’historique V1 non encore pris en charge reste intact dans l’ancienne application.';

  const label = doc.createElement('label');
  label.classList.add('srv2-data-import-label');
  label.textContent = 'Sauvegarde Store Runner V1 (.json)';

  const input = doc.createElement('input');
  input.setAttribute('type', 'file');
  input.setAttribute('accept', '.json,application/json');
  input.classList.add('srv2-data-import-input');
  label.appendChild(input);

  const status = doc.createElement('p');
  status.classList.add('srv2-data-tools-status');
  status.setAttribute('aria-live', 'polite');

  root.appendChild(title);
  root.appendChild(privacy);
  root.appendChild(note);
  root.appendChild(label);
  root.appendChild(status);
  const reportDetails = doc.createElement('ul');
  reportDetails.classList.add('srv2-migration-report');
  root.appendChild(reportDetails);

  function importText(text) {
    reportDetails.replaceChildren();
    try {
      const migrated = parseAndMigrateV1Backup(text, store.getState());
      if (options.persist) options.persist(migrated.state);
      store.replace(migrated.state);
      const { report } = migrated;
      for (const message of report.warnings) {
        const item = doc.createElement('li'); item.textContent = message; reportDetails.appendChild(item);
      }
      const visitSummary = report.visits.status === 'empty' ? ' Visites V1 : 0 (conteneur vide reconnu).'
        : report.visits.status === 'absent' ? ' Visites V1 : conteneur absent.' : ' Visites V1 : non migrées (format non documenté).';
      const warnings = report.warnings.length
        ? ` ${report.warnings.length} ${plural(report.warnings.length, 'élément')} d’historique reste${report.warnings.length > 1 ? 'nt' : ''} uniquement dans V1.`
        : '';
      const gps = report.missingGpsStores > 0
        ? ` ${report.missingGpsStores} ${plural(report.missingGpsStores, 'magasin')} sans GPS.`
        : ' GPS prêts pour tous les magasins.';
      status.textContent = `Secteur importé : ${report.totalStores} magasins, ${report.activeStores} actifs.${gps}${warnings}${visitSummary}`;
      return migrated;
    } catch (error) {
      status.textContent = error instanceof V1MigrationError || error instanceof DataToolsError
        ? `Import refusé : ${error.message}`
        : `Import non enregistré : ${error.message || 'sauvegarde illisible'}`;
      return null;
    }
  }

  // importText reste synchrone : c'est le contrat utilisé par les tests de domaine.
  // La protection multi-onglets vit ici, autour de l'écriture réelle, parce qu'un
  // import écrase l'état entier — c'est la mutation la plus destructrice de la V2.
  const guard = options.guard && typeof options.guard.run === 'function' ? options.guard : null;

  async function importFile(file) {
    if (!file || typeof file.text !== 'function') {
      status.textContent = 'Import refusé : sélectionne un fichier JSON.';
      return null;
    }
    const text = await file.text();
    if (!guard) return importText(text);
    const outcome = await guard.run(() => importText(text));
    if (outcome.ok === false) {
      reportDetails.replaceChildren();
      status.textContent = `Import refusé : ${STALE_TAB_MESSAGE}`;
      return null;
    }
    return outcome.value;
  }

  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    await importFile(file);
    // Autorise la sélection du même fichier une seconde fois après correction.
    input.value = '';
  });

  return Object.freeze({
    element: root,
    input,
    importText,
    importFile,
  });
}
