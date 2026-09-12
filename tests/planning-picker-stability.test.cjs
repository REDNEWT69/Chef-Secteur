'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const src = fs.readFileSync(path.resolve(__dirname, '..', 'planning-ui-fixes.js'), 'utf8');
const rangePlanner = fs.readFileSync(path.resolve(__dirname, '..', 'range-planner-v2.js'), 'utf8');

// Un verrou explicite, pas seulement document.activeElement : sur iOS, ouvrir un
// <input type="date"> fait perdre le focus à la page (le champ n'est plus activeElement
// pendant que le sélecteur natif est affiché) tout en déclenchant focusout - le seul
// activePlanningControl() de la version précédente ne suffisait donc pas.
assert(/let\s+editingLocked\s*=\s*false/.test(src), 'un verrou explicite d\'édition doit exister, pas seulement document.activeElement');
assert(/function\s+activePlanningControl\(\)/.test(src), 'planning-ui-fixes doit garder la détection activeElement en filet de sécurité');
assert(/function\s+isEditingLocked\(\)\{return editingLocked\|\|activePlanningControl\(\)\}/.test(src), 'isEditingLocked doit combiner le verrou explicite et le filet activeElement');
assert(/SETTINGS_FIELD\s*=\s*'#planningSettings input, #planningSettings select, #planningSettings textarea'/.test(src), 'le garde doit couvrir inputs, selects et textareas du panneau planning');

// Le verrou est posé dès l'intention d'interagir (pointerdown/focusin), pas seulement au
// focus in fine, pour couvrir l'ouverture du sélecteur natif iOS.
assert(/addEventListener\('pointerdown',[^;]*editingLocked=true/.test(src), 'un pointerdown sur un champ des réglages doit poser le verrou');
assert(/addEventListener\('focusin',[^;]*editingLocked=true/.test(src), 'un focusin sur un champ des réglages doit poser le verrou');

// Le verrou ne se lève qu'au `change` (valeur choisie) ou à la fermeture du panneau -
// jamais sur un simple changement de focus (focusout), qui est justement ce que déclenche
// spontanément le sélecteur natif iOS.
assert(/editingLocked=false;schedule\(\)/.test(src), 'le change doit lever le verrou et replanifier un rendu');
assert(/document\.addEventListener\('focusout',e=>\{if\(editingLocked\)return;/.test(src), 'un focusout ne doit rien faire tant que le verrou tient');
assert(/addEventListener\('toggle',e=>\{if\(e\.target&&e\.target\.id==='planningSettings'&&!e\.target\.open\)\{editingLocked=false;schedule\(\)\}/.test(src), 'fermer #planningSettings doit aussi lever le verrou');

// Le panneau ne doit plus être réorganisé pendant la saisie : run() sort tôt tant que le
// verrou tient, avant reorderPlanning()/compactSettings()/restoreHotelStars().
assert(/function run\(\)\{css\(\);syncSmartBrief\(\);if\(isEditingLocked\(\)\)return;reorderPlanning\(\);compactSettings\(\);restoreHotelStars\(\)\}/.test(src), 'run() doit sortir avant tout réordonnancement tant que le verrou tient');
assert(/settings&&!editing/.test(src), 'planningSettings ne doit pas être reparenté pendant une interaction active');

// window.focus et visibilitychange sont interdits par AGENTS.md (pas de réinstallation
// globale sur ces événements quand un événement métier existe déjà) - ce sont eux qui
// cassaient la saisie du sélecteur de dates sur iOS.
assert(!/addEventListener\(['"]focus['"]/.test(src), 'planning-ui-fixes ne doit plus écouter window.focus');
assert(!/visibilitychange/.test(src), 'planning-ui-fixes ne doit plus écouter visibilitychange');

// #rangePlannerCard est un <details> imbriqué dans le <details id="planningSettings"> : un
// <details> fermé rend tout son contenu non focusable, y compris un <details> ouvert à
// l'intérieur. L'ouvrir doit donc aussi ouvrir son parent.
assert(/box\.addEventListener\('toggle',function\(\)\{const parent=document\.getElementById\('planningSettings'\);if\(box\.open&&parent&&!parent\.open\)parent\.open=true\}\)/.test(rangePlanner), '#rangePlannerCard doit ouvrir #planningSettings quand il s\'ouvre lui-même');

console.log('planning-picker-stability: ok');
