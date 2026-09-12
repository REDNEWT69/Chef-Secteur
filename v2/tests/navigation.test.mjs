// Tests de COMPORTEMENT : navigation.mjs est une logique pure, testable sans
// aucun DOM (faux ou réel).
import assert from 'node:assert/strict';
import { SCREEN_IDS, createNavigation, isValidScreen, NavigationError } from '../src/app/navigation.mjs';

assert.deepEqual(SCREEN_IDS, ['home', 'planning', 'stores', 'more']);
assert.equal(isValidScreen('home'), true);
assert.equal(isValidScreen('inconnu'), false);

// définition correcte de l'écran actif initial
{
  const nav = createNavigation();
  assert.equal(nav.getActive(), 'home');
}

// navigation vers un écran valide
{
  const nav = createNavigation();
  assert.equal(nav.goTo('planning'), 'planning');
  assert.equal(nav.getActive(), 'planning');
}

// refus clair d'un écran inconnu, sans changer l'état courant
{
  const nav = createNavigation();
  nav.goTo('stores');
  assert.throws(() => nav.goTo('inconnu'), NavigationError);
  assert.equal(nav.getActive(), 'stores');
}

// un écran initial inconnu est refusé dès la création
assert.throws(() => createNavigation('inconnu'), NavigationError);

// un seul écran actif à la fois, quel que soit l'enchaînement d'appels
{
  const nav = createNavigation();
  nav.goTo('planning');
  nav.goTo('stores');
  nav.goTo('more');
  assert.equal(nav.getActive(), 'more');
}

console.log('v2 navigation: ok');
