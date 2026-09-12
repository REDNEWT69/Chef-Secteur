// Tests de COMPORTEMENT du shell V2 : exécutent le shell avec le faux
// document minimal de fake-dom.mjs et vérifient ce qu'il fait réellement
// (un seul écran actif, refus d'un écran inconnu, pas de doublon après une
// seconde initialisation, pas de listener installé deux fois). Les
// contrats qui ne peuvent être vérifiés que par lecture du source (absence
// de focus/visibilitychange, de MutationObserver, de dépendance npm) sont
// dans architecture.test.mjs : ce fichier ne fait pas de recherche de texte.
import assert from 'node:assert/strict';
import { createFakeDocument } from './fake-dom.mjs';
import { createShell, ShellError } from '../src/app/shell.mjs';
import { SCREEN_IDS, NavigationError } from '../src/app/navigation.mjs';

function setup() {
  const document = createFakeDocument();
  const root = document.createElement('div');
  const shell = createShell({ document, root });
  return { document, root, shell };
}

// 1. les 4 écrans sont définis, avec un onglet par écran
{
  const { root } = setup();
  assert.equal(root.children.length, 3);
  const [header, main, nav] = root.children;
  assert.equal(header.tagName, 'HEADER');
  assert.equal(main.tagName, 'MAIN');
  assert.equal(nav.tagName, 'NAV');
  assert.equal(main.children.length, SCREEN_IDS.length);
  assert.equal(nav.children.length, SCREEN_IDS.length);
  assert.deepEqual(main.children.map(el => el.getAttribute('data-screen')), SCREEN_IDS);
  assert.deepEqual(nav.children.map(el => el.getAttribute('data-tab')), SCREEN_IDS);
}

// 1 bis. SCREEN_IDS (navigation.mjs) est la seule source de vérité des
// écrans : createShell ne prend aucun paramètre `screens`. Un objet
// d'options portant une clé `screens` arbitraire (identifiant inconnu,
// doublons, liste vide...) est donc silencieusement sans effet — le shell
// monte toujours exactement les quatre écrans de SCREEN_IDS.
{
  const document = createFakeDocument();
  const root = document.createElement('div');
  assert.equal(SCREEN_IDS.length, 4);
  const shell = createShell({ document, root, screens: ['inconnu', 'planning', 'planning'] });
  const [, main, nav] = root.children;
  assert.deepEqual(main.children.map(el => el.getAttribute('data-screen')), SCREEN_IDS);
  assert.deepEqual(nav.children.map(el => el.getAttribute('data-tab')), SCREEN_IDS);
  // et l'écran actif par défaut ('home') existe bel et bien, contrairement
  // à l'ancien comportement où un `screens` restreint pouvait laisser
  // nav.getActive() pointer vers un écran jamais monté.
  assert.equal(shell.getActiveScreen(), 'home');
  assert.equal(main.children.filter(el => el.classList.contains('is-active')).length, 1);
}

// 2. un seul écran actif dès l'initialisation
{
  const { root, shell } = setup();
  const [, main] = root.children;
  assert.equal(shell.getActiveScreen(), 'home');
  const active = main.children.filter(el => el.classList.contains('is-active'));
  assert.equal(active.length, 1);
  assert.equal(active[0].getAttribute('data-screen'), 'home');
}

// 3. navigation vers un écran valide : écran actif et onglet actif cohérents
{
  const { root, shell } = setup();
  shell.goTo('planning');
  assert.equal(shell.getActiveScreen(), 'planning');
  const [, main, nav] = root.children;
  const activeScreens = main.children.filter(el => el.classList.contains('is-active'));
  const activeTabs = nav.children.filter(el => el.classList.contains('is-active'));
  assert.equal(activeScreens.length, 1);
  assert.equal(activeScreens[0].getAttribute('data-screen'), 'planning');
  assert.equal(activeTabs.length, 1);
  assert.equal(activeTabs[0].getAttribute('data-tab'), 'planning');
}

// 4. refus clair d'un écran inconnu : aucune mutation d'état. Le shell
// délègue la validité d'un écran à navigation.mjs (source unique de vérité)
// et laisse son erreur remonter telle quelle plutôt que de la masquer.
{
  const { shell } = setup();
  assert.throws(() => shell.goTo('inconnu'), NavigationError);
  assert.equal(shell.getActiveScreen(), 'home');
}

// 5. un tap sur un onglet change bien d'écran
{
  const { root, shell } = setup();
  const [, , nav] = root.children;
  const storesTab = nav.children.find(btn => btn.getAttribute('data-tab') === 'stores');
  storesTab.dispatch('click');
  assert.equal(shell.getActiveScreen(), 'stores');
}

// 6. changer plusieurs fois d'écran ne crée aucun doublon de listener
{
  const { root, shell } = setup();
  const [, , nav] = root.children;
  const planningTab = nav.children.find(btn => btn.getAttribute('data-tab') === 'planning');
  shell.goTo('planning');
  shell.goTo('stores');
  shell.goTo('planning');
  shell.goTo('more');
  assert.equal(planningTab._listeners.get('click').length, 1);
}

// 7. une seconde initialisation sur la même racine est explicitement refusée
// (pas de double header/main/nav, pas de listeners en double)
{
  const { document, root } = setup();
  assert.throws(() => createShell({ document, root }), ShellError);
  assert.equal(root.children.length, 3);
}

// 8. points d'extension explicites : header-actions et main
{
  const { document, shell } = setup();
  const headerActions = shell.getSlot('header-actions');
  const badge = document.createElement('span');
  headerActions.appendChild(badge);
  assert.equal(headerActions.children.includes(badge), true);
  assert.throws(() => shell.getSlot('inconnu'), ShellError);
}

// 9. mountScreen monte du contenu dans un écran existant et refuse un écran inconnu
{
  const { document, root, shell } = setup();
  const node = document.createElement('p');
  shell.mountScreen('home', node);
  const [, main] = root.children;
  const homeScreen = main.children.find(el => el.getAttribute('data-screen') === 'home');
  assert.equal(homeScreen.children.includes(node), true);
  assert.throws(() => shell.mountScreen('inconnu', document.createElement('p')), ShellError);
}

// 10. shell seul propriétaire de la structure globale : rien d'autre que
// header/main/nav n'est ajouté à la racine de montage.
{
  const { root } = setup();
  assert.deepEqual(root.children.map(el => el.tagName), ['HEADER', 'MAIN', 'NAV']);
}

console.log('v2 shell: ok');
