// Faux document minimal, écrit à la main pour les tests de comportement du
// shell V2 (voir shell.test.mjs). Aucune bibliothèque de simulation DOM
// (jsdom ou autre) n'est utilisée : ce fichier ne contient que les
// primitives réellement consommées par v2/src/app/shell.mjs et
// v2/src/ui/render.mjs (createElement, appendChild, setAttribute/
// getAttribute, classList, addEventListener, textContent, hidden).
//
// `dispatch` n'est pas une primitive DOM : c'est un raccourci de test pour
// déclencher synchronement les gestionnaires enregistrés via
// addEventListener, en l'absence d'un vrai moteur d'événements.

function createClassList(el) {
  return {
    add(...names) {
      for (const name of names) el._classes.add(name);
    },
    remove(...names) {
      for (const name of names) el._classes.delete(name);
    },
    contains(name) {
      return el._classes.has(name);
    },
    toggle(name, force) {
      const has = el._classes.has(name);
      const next = force === undefined ? !has : Boolean(force);
      if (next) el._classes.add(name);
      else el._classes.delete(name);
      return next;
    },
  };
}

function createElement(tagName) {
  const el = {
    tagName: String(tagName).toUpperCase(),
    children: [],
    parentNode: null,
    hidden: undefined,
    _classes: new Set(),
    _attributes: new Map(),
    _listeners: new Map(),
    _text: '',
    get textContent() {
      return this._text;
    },
    set textContent(value) {
      this._text = String(value);
    },
    setAttribute(name, value) {
      this._attributes.set(name, String(value));
    },
    getAttribute(name) {
      return this._attributes.has(name) ? this._attributes.get(name) : null;
    },
    removeAttribute(name) {
      this._attributes.delete(name);
    },
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    },
    addEventListener(type, handler) {
      if (!this._listeners.has(type)) this._listeners.set(type, []);
      this._listeners.get(type).push(handler);
    },
    removeEventListener(type, handler) {
      const list = this._listeners.get(type) || [];
      const idx = list.indexOf(handler);
      if (idx !== -1) list.splice(idx, 1);
    },
    dispatch(type, event = {}) {
      for (const handler of (this._listeners.get(type) || []).slice()) handler(event);
    },
  };
  el.classList = createClassList(el);
  return el;
}

export function createFakeDocument() {
  return {
    createElement,
    body: createElement('body'),
  };
}
