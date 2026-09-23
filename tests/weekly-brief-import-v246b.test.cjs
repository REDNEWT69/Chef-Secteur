const assert = require('assert/strict');

const B = require('../weekly-brief-v246.js');
const I = require('../weekly-brief-import-v246b.js');

const W39 = `Feuille de route W39
- Semaine Weekly GSA/Meublier. Merci de visiter sur Lundi, Mardi et Mercredi un max d’enseignes concernées, mais sans oublier la GSS. Benchmark à remplir entre mercredi et jeudi matin.
Champions Enseignes : ED : Julie / But : Lucy & Redouane / Crf : Whitney / Auchan : Samir / Confo : Nico / Leclerc : Philippe & Julien.
- Visites Mags Prio 1 : Terminez les visites et de remplir le Google Forms avant mercredi.
- Micro RGB : On ne lâche rien sur la prise d’infos sur les Micro RGB Sony vs Samsung. (Stock, infos pertinentes, retour vendeurs et clients…)
- Challenge Darty : Continuez à informer les mags du Challenge. Inscription des vendeurs par CDV et Directeur jusqu’au 28/09. Début challenge du 28/09 au 25/10. Important communiquer sur les Moniteurs !!!
- Prios Co Brun annulées cette semaine, celles du blanc maintenues semaine prochaine. En attente de confirmation de SEF.`;

// 1. Le vrai format W39 est reconnu sans inventer de boost ni activer quoi que ce soit.
{
  const a = I.analyzeText(W39, {
    fileName: 'Feuille de route W39(1).pdf', referenceWeek: '2026-W39', importedAt: '2026-09-23T18:00:00Z'
  });
  assert.equal(a.week, '2026-W39');
  assert.equal(a.source.kind, 'file');
  assert.equal(a.source.fileName, 'Feuille de route W39(1).pdf');
  assert.ok(a.rules.length >= 6, a.rules.map(r => r.label).join(', '));
  assert.ok(a.rules.every(r => r.confidence === 'ambiguous'), 'un PDF ne doit jamais modifier une priorité sans confirmation humaine');

  const p1 = a.rules.find(r => r.label === 'Visites Prio 1 + Google Forms');
  assert.equal(p1.type, 'deadline');
  assert.equal(p1.dueDate, '2026-09-23');
  assert.equal(p1.scope.basePrio, 'P1');

  const benchmark = a.rules.find(r => r.label === 'Benchmark GSA/Meublier');
  assert.equal(benchmark.type, 'deadline');
  assert.equal(benchmark.dueDate, '2026-09-24');

  const brun = a.rules.find(r => r.label === 'Prios Co BRUN annulées');
  assert.equal(brun.type, 'suspend');
  assert.equal(brun.target, 'performance');
  assert.equal(brun.scope.family, 'brun');
  assert.match(brun.pending, /confirmation/i);

  const blanc = a.rules.find(r => r.label === 'Prios Co BLANC maintenues');
  assert.equal(blanc.type, 'note', 'le PDF ne donne aucun chiffre de boost : on conserve une consigne, pas un bonus inventé');
  assert.equal(blanc.validFrom, '2026-W40');
  assert.equal(blanc.validTo, '2026-W40');
  assert.match(blanc.pending, /confirmation/i);

  const darty = a.rules.find(r => r.label === 'Challenge Darty');
  assert.equal(darty.type, 'note');
  assert.deepEqual(darty.scope.brands, ['Darty']);
  assert.equal(darty.boost, undefined, 'aucun boost numérique n’est inventé à partir du PDF');
  assert.ok(a.warnings.some(x => /Année absente/.test(x)));
}

// 2. Une année explicite dans le document gagne sur l’année de référence.
{
  const a = I.analyzeText('Feuille de route 2027-W02\n- Micro RGB : vérifier Sony vs Samsung.', {
    fileName: 'brief.pdf', referenceWeek: '2026-W39'
  });
  assert.equal(a.week, '2027-W02');
  assert.equal(a.detectedWeek.explicitYear, true);
  assert.equal(a.rules.length, 1);
  assert.equal(a.rules[0].label, 'Micro RGB Sony vs Samsung');
}

// 3. Texte non reconnu : il est conservé mais aucune règle n’est fabriquée.
{
  const a = I.analyzeText('Consigne libre sans structure connue', { fileName: 'brief.pdf', referenceWeek: '2026-W39' });
  assert.equal(a.rules.length, 0);
  assert.ok(a.warnings.some(x => /Aucune consigne structurée/.test(x)));
}

// 4. L’import ajoute des propositions au brief sans écraser une règle manuelle et sans doublon.
{
  global.state = { stores: [], profile: {}, settings: {}, visits: {}, notes: {}, plan: {} };
  global.save = () => true;
  B.addRule(global.state, '2026-W39', { type: 'note', label: 'Règle terrain existante', confidence: 'confirmed' });
  const a = I.analyzeText(W39, { fileName: 'Feuille de route W39.pdf', referenceWeek: '2026-W39' });
  const added = I.saveAnalysis(a);
  assert.ok(added >= 6);
  let brief = B.briefForWeek(global.state, '2026-W39');
  assert.ok(brief.rules.some(r => r.label === 'Règle terrain existante'));
  assert.equal(B.rulesForWeek(global.state, '2026-W39').length, 1, 'seule la règle déjà confirmée est active');

  const count = brief.rules.length;
  assert.equal(I.saveAnalysis(a), 0, 'réimporter le même PDF ne duplique pas les propositions');
  brief = B.briefForWeek(global.state, '2026-W39');
  assert.equal(brief.rules.length, count);

  const brun = brief.rules.find(r => r.label === 'Prios Co BRUN annulées');
  assert.ok(brun.pending);
  B.confirmRule(global.state, '2026-W39', brun.id);
  const confirmed = B.briefForWeek(global.state, '2026-W39').rules.find(r => r.id === brun.id);
  assert.equal(confirmed.confidence, 'confirmed');
  assert.equal(confirmed.pending, null, 'confirmer l’import lève aussi l’attente SEF');
}

// 5. Limites de sécurité du fichier.
{
  assert.equal(I.MAX_PDF_BYTES, 15 * 1024 * 1024);
  assert.equal(I.MAX_PAGES, 40);
  assert.equal(I.PDFJS_VERSION, '4.10.38');
}

console.log('PASS: V246B import PDF et propositions de brief');
