'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const src = fs.readFileSync(path.resolve(__dirname, '..', 'planning-ui-fixes.js'), 'utf8');

assert(/function\s+activePlanningControl\(\)/.test(src), 'planning-ui-fixes doit détecter un contrôle actif dans #planningSettings');
assert(/#planningSettings input, #planningSettings select, #planningSettings textarea/.test(src), 'le garde doit couvrir inputs, selects et textareas du panneau planning');
assert(/anchor\.nextElementSibling===node/.test(src), 'les déplacements DOM doivent être idempotents');
assert(/settings&&!editing/.test(src), 'planningSettings ne doit pas être reparenté pendant une interaction active');
assert(/if\(!activePlanningControl\(\)\)compactSettings\(\)/.test(src), 'compactSettings ne doit pas restructurer le panneau pendant un picker actif');
assert(/focusout/.test(src) && /#planningSettings input/.test(src), 'un rerender doit être replanifié après la fin de l’interaction');

console.log('planning-picker-stability: ok');
