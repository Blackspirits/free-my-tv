/* Locale regression tests for LG/webOS and Samsung/Tizen; runtime remains ES5. */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'web/strings.js'), 'utf8');
const dataSource = fs.readFileSync(path.join(root, 'web/data.js'), 'utf8');
const en = JSON.parse(fs.readFileSync(path.join(root, 'app/assets/i18n/en.json'), 'utf8'));
const br = JSON.parse(fs.readFileSync(path.join(root, 'app/assets/i18n/pt-BR.json'), 'utf8'));
const pt = JSON.parse(fs.readFileSync(path.join(root, 'app/assets/i18n/pt-PT.json'), 'utf8'));
const fr = JSON.parse(fs.readFileSync(path.join(root, 'app/assets/i18n/fr.json'), 'utf8'));
const es = JSON.parse(fs.readFileSync(path.join(root, 'app/assets/i18n/es.json'), 'utf8'));
const zhCN = JSON.parse(fs.readFileSync(path.join(root, 'app/assets/i18n/zh-CN.json'), 'utf8'));
const zhTW = JSON.parse(fs.readFileSync(path.join(root, 'app/assets/i18n/zh-TW.json'), 'utf8'));
assert.deepStrictEqual(Object.keys(br).sort(), Object.keys(en).sort());
assert.deepStrictEqual(Object.keys(pt).sort(), Object.keys(en).sort());
// Include other supported catalogue variants to catch fallback regressions; fr-FR must not become English.
function fresh(language) {
  const scope = {
    window: {I18N_CATALOGUES: {'pt-PT': pt, 'pt-BR': br, fr: fr, es: es, 'zh-CN': zhCN, 'zh-TW': zhTW}},
    navigator: {language: language}, document: {documentElement: {}}, Intl: Intl, Date: Date
  };
  vm.createContext(scope);
  vm.runInContext(source, scope, {filename: 'web/strings.js'});
  return scope;
}
for (const [tv, expected, locale] of [
  ['pt-PT','pt-PT','pt-PT'], ['pt-BR','pt-BR','pt-BR'],
  ['pt','pt-PT','pt-PT'], ['pt-AO','pt-PT','pt-PT'],
  ['pt-MZ','pt-PT','pt-PT'], ['pt-CV','pt-PT','pt-PT'],
  ['pt-GW','pt-PT','pt-PT'], ['pt-TL','pt-PT','pt-PT'],
  ['fr-FR','fr','fr-FR'], ['es-ES','es','es-ES'], ['es-AR','es','es-AR'],
  ['zh-HK','zh-TW','zh-TW'], ['zh-Hans-HK','zh-CN','zh-CN'],
  ['eo-EO','en','en-US']
]) {
  const scope = fresh(tv);
  scope.I18N.set('auto');
  assert.strictEqual(scope.I18N.lang, expected, tv);
  assert.strictEqual(scope.I18N.locale(), locale, tv);
  assert.strictEqual(scope.document.documentElement.lang, locale, tv);
}
const scope = fresh('en-US');
scope.I18N.set('pt-PT');
assert.strictEqual(scope.I18N.lang, 'pt-PT');
assert.strictEqual(scope.I18N.tr('Home Screen'), pt['Home Screen']);
assert.strictEqual(scope.I18N.languageName('pt-PT'), 'Português (Portugal)');
scope.I18N.set('pt-BR');
assert.strictEqual(scope.I18N.lang, 'pt-BR');
assert.strictEqual(scope.I18N.tr('Home Screen'), br['Home Screen']);
assert.strictEqual(scope.I18N.languageName('pt-BR'), 'Português (Brasil)');
scope.I18N.set('pt'); // generic Portuguese defaults to Portugal
assert.strictEqual(scope.I18N.lang, 'pt-PT');
assert.strictEqual(scope.I18N.languageName('pt-PT'), 'Português (Portugal)');
assert.strictEqual(scope.I18N.tr('Home Screen'), pt['Home Screen']);
for (const region of ['pt-AO', 'pt-MZ', 'pt-CV', 'pt-GW']) {
  scope.I18N.set(region);
  assert.strictEqual(scope.I18N.lang, 'pt-PT', region);
}
assert.ok(scope.I18N.languages().includes('pt-PT'));
assert.ok(scope.I18N.languages().includes('pt-BR'));
assert.ok(!scope.I18N.languages().includes('pt'));
// A manual choice must always override the TV region.
const onBrazilianTV = fresh('pt-BR');
onBrazilianTV.I18N.set('pt-PT');
assert.strictEqual(onBrazilianTV.I18N.lang, 'pt-PT');
const onPortugueseTV = fresh('pt-PT');
onPortugueseTV.I18N.set('pt-BR');
assert.strictEqual(onPortugueseTV.I18N.lang, 'pt-BR');
// End-to-end boot path: strings.js → data.js (Prefs migration) → I18N.set(Prefs.language()).
// Unlike a direct I18N.set('pt'), a legacy *saved* pt must retain pt-BR after an upgrade.
function boot(tvLanguage, savedPrefs, config) {
  const scope = fresh(tvLanguage);
  let value = savedPrefs === undefined ? null : JSON.stringify(savedPrefs);
  let writes = 0;
  scope.window.CONFIG = config || {};
  scope.TV = {zone: function () { return ''; }};
  scope.XMLHttpRequest = function () {};
  scope.localStorage = {
    getItem: function (key) { return key === 'fmtv.prefs' ? value : null; },
    setItem: function (key, text) {
      if (key === 'fmtv.prefs') { value = text; writes++; }
    }
  };
  vm.runInContext(dataSource, scope, {filename: 'web/data.js'});
  scope.I18N.set(scope.Prefs.language());
  return {scope: scope, saved: function () { return JSON.parse(value); }, writes: writes};
}
const legacy = boot('pt-PT', {language: 'pt'});
assert.strictEqual(legacy.scope.Prefs.language(), 'pt-BR', 'legacy explicit choice is migrated');
assert.strictEqual(legacy.scope.I18N.lang, 'pt-BR', 'legacy startup still displays Brazilian');
assert.strictEqual(legacy.scope.I18N.tr('Home Screen'), br['Home Screen']);
assert.strictEqual(legacy.saved().language, 'pt-BR', 'migration is persisted');
assert.strictEqual(legacy.writes, 1, 'migration only writes once');
const upgraded = boot('pt-PT', legacy.saved());
assert.strictEqual(upgraded.scope.I18N.lang, 'pt-BR', 'Brazilian language persists after restart');
assert.strictEqual(upgraded.writes, 0, 'already migrated preferences are not rewritten');
const generic = boot('pt-PT', undefined, {language: 'pt'});
assert.strictEqual(generic.scope.I18N.lang, 'pt-PT', 'new generic build configuration is European');
assert.strictEqual(generic.writes, 0, 'generic configuration is not migrated');
const portugal = boot('pt-AO', {language: 'auto'});
assert.strictEqual(portugal.scope.I18N.lang, 'pt-PT', 'automatic Angola is European');
const brazil = boot('pt-BR', {language: 'auto'});
assert.strictEqual(brazil.scope.I18N.lang, 'pt-BR', 'automatic Brazil is Brazilian');
const explicit = boot('pt-BR', {language: 'pt-PT'});
assert.strictEqual(explicit.scope.I18N.lang, 'pt-PT', 'explicit Portugal overrides the TV region');
console.log('Regional language selection, preference migration and non-Portuguese fallbacks: all checks passed.');
