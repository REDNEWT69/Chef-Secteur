// Enveloppe Android (Trusted Web Activity) de Store Runner — garde-fous de packaging.
//
// android/ n'est qu'une coque : elle ouvre https://store-runner.fr/ dans Chrome et ne
// contient aucune logique métier. Ce test fige son identité (package, domaine, URL de
// lancement), la conformité Google Play (targetSdk), l'absence de secret de signature et
// la règle Digital Asset Links : /.well-known/assetlinks.json n'existe que lorsque
// android/twa-manifest.json porte de vraies empreintes, et reprend exactement celles-là.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const assert = require('assert/strict');

const ROOT = path.join(__dirname, '..');
const ANDROID = path.join(ROOT, 'android');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const readJson = relative => JSON.parse(read(relative));

const PACKAGE_ID = 'fr.storerunner.app';
const HOST = 'store-runner.fr';
const ORIGIN = 'https://' + HOST;
// Exigence Google Play en vigueur depuis le 31/08/2026 : nouvelles apps et mises à jour
// ciblent Android 16 (API 36) ou plus. Ne se relève que vers le haut.
const PLAY_MIN_TARGET_SDK = 36;
// Empreintes officielles des gradle-wrapper.jar (https://gradle.org/release-checksums/).
// Changer de version de Gradle impose d'ajouter ici l'empreinte publiée par Gradle.
const OFFICIAL_WRAPPER_JAR_SHA256 = {
  '9.7.1': '7a9ce74cff467ca1bf60a4fcd9f05185acceda4d0f382434d393e17864262c5d'
};

const twa = readJson('android/twa-manifest.json');
const webManifest = readJson('manifest.webmanifest');
const version = readJson('version.json');
const appGradle = read('android/app/build.gradle');
const rootGradle = read('android/build.gradle');
const settingsGradle = read('android/settings.gradle');
const androidManifest = read('android/app/src/main/AndroidManifest.xml');
const strings = read('android/app/src/main/res/values/strings.xml');

function gradleValue(source, key) {
  const match = source.match(new RegExp('^\\s*' + key + "\\s*[:=]\\s*'([^']*)'", 'm'));
  assert.ok(match, `valeur « ${key} » introuvable dans android/app/build.gradle`);
  return match[1];
}
function gradleNumber(source, key) {
  const match = source.match(new RegExp('^\\s*' + key + '\\s*=\\s*(\\d+)\\s*$', 'm'));
  assert.ok(match, `« ${key} = <nombre> » introuvable dans android/app/build.gradle`);
  return Number(match[1]);
}
function pngSize(relative) {
  const data = fs.readFileSync(path.join(ROOT, relative));
  assert.deepEqual([...data.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], `${relative} doit être un PNG`);
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
}
// Les fichiers qu'un commit emporterait : suivis, ou nouveaux et non ignorés. Une clé ou
// un APK posé localement dans un dossier ignoré (android/signing/, build/) n'est pas publié.
function versionableFiles() {
  const output = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8' });
  return output.split('\0').filter(file => file && fs.existsSync(path.join(ROOT, file)));
}

// 1. Identité : un seul package, un seul domaine, lancement sur la racine HTTPS.
assert.equal(twa.packageId, PACKAGE_ID);
assert.equal(twa.host, HOST);
assert.equal(twa.name, 'Store Runner');
assert.equal(twa.launcherName, 'Store Runner');
assert.equal(twa.startUrl, '/', 'la TWA doit ouvrir https://store-runner.fr/');
assert.equal(twa.display, 'standalone');
assert.equal(twa.orientation, 'portrait');
assert.equal(twa.fullScopeUrl, ORIGIN + '/');
assert.equal(twa.webManifestUrl, ORIGIN + '/manifest.webmanifest');
assert.deepEqual(twa.additionalTrustedOrigins, [], 'un seul domaine de confiance : store-runner.fr');
assert.equal(twa.fallbackType, 'customtabs', 'repli sur un onglet Chrome, jamais sur une WebView');
assert.equal(twa.enableNotifications, false, 'Store Runner n’utilise aucune notification');

assert.equal(gradleValue(appGradle, 'applicationId'), PACKAGE_ID);
assert.equal(gradleValue(appGradle, 'namespace'), PACKAGE_ID);
assert.match(appGradle, /^\s*applicationId = twaManifest\.applicationId$/m, 'defaultConfig doit reprendre le package TWA');
assert.equal(gradleValue(appGradle, 'hostName'), HOST);
assert.equal(gradleValue(appGradle, 'launchUrl'), twa.startUrl);
assert.match(appGradle, /def launchUrl = 'https:\/\/' \+ twaManifest\.hostName \+ twaManifest\.launchUrl/, 'l’URL de lancement doit rester en HTTPS');
assert.equal(new URL(twa.startUrl, ORIGIN).href, ORIGIN + '/');
assert.equal(gradleValue(appGradle, 'fallbackType'), 'customtabs');
assert.equal(gradleValue(appGradle, 'orientation'), twa.orientation);
assert.equal(gradleValue(appGradle, 'name'), twa.name);
assert.equal(gradleValue(appGradle, 'launcherName'), twa.launcherName);
assert.match(appGradle, /enableNotifications:\s*false/);
assert.match(appGradle, /buildFeatures\s*\{\s*resValues\s*=\s*true\s*\}/, 'AGP 9 : resValue doit être activé explicitement');

// La coque reprend l'identité visuelle de la PWA V262 au lieu d'en inventer une.
const hex = value => String(value).toUpperCase();
assert.equal(hex(twa.themeColor), hex(webManifest.theme_color), 'barre d’état = theme_color PWA');
assert.equal(hex(twa.backgroundColor), hex(webManifest.background_color), 'écran de démarrage = background_color PWA');
for (const key of ['themeColor', 'themeColorDark', 'navigationColor', 'navigationColorDark', 'backgroundColor', 'navigationDividerColor', 'navigationDividerColorDark']) {
  assert.equal(hex(gradleValue(appGradle, key)), hex(twa[key]), `${key} : build.gradle et twa-manifest.json divergent`);
}
assert.equal(gradleValue(appGradle, 'navigationDividerColor'), '#00000000', 'séparateur transparent (ARGB), pas de trait noir');

// 2. Icônes : celles de la PWA (PR #445), standard ≥ 512 px et maskable distincte.
const iconPath = url => {
  assert.ok(url.startsWith(ORIGIN + '/'), `${url} doit être servie par ${ORIGIN}`);
  return new URL(url).pathname.slice(1);
};
const standardIcon = iconPath(twa.iconUrl);
const maskableIcon = iconPath(twa.maskableIconUrl);
assert.notEqual(standardIcon, maskableIcon);
for (const [file, purpose] of [[standardIcon, 'any'], [maskableIcon, 'maskable']]) {
  const size = pngSize(file);
  assert.ok(size.width >= 512 && size.width === size.height, `${file} doit être carrée et ≥ 512 px`);
  assert.ok(webManifest.icons.some(icon => icon.src.replace(/^\.\//, '').split('?')[0] === file && icon.purpose === purpose),
    `${file} doit être l’icône ${purpose} déclarée par manifest.webmanifest`);
}
const storeIcon = pngSize('android/store_icon.png');
assert.deepEqual([storeIcon.width, storeIcon.height], [512, 512], 'icône Play Store 512 × 512');
assert.deepEqual(pngSize('android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png'), { width: 192, height: 192 });
assert.deepEqual(pngSize('android/app/src/main/res/mipmap-xxxhdpi/ic_maskable.png'), { width: 328, height: 328 });
assert.match(read('android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml'), /@mipmap\/ic_maskable/, 'icône adaptative Android = icône maskable');

// 3. Conformité Google Play et versions figées.
const targetSdk = gradleNumber(appGradle, 'targetSdk');
const compileSdk = gradleNumber(appGradle, 'compileSdk');
const minSdk = gradleNumber(appGradle, 'minSdk');
assert.ok(targetSdk >= PLAY_MIN_TARGET_SDK, `targetSdk ${targetSdk} < ${PLAY_MIN_TARGET_SDK} exigé par Google Play`);
assert.ok(compileSdk >= targetSdk, 'compileSdk doit être ≥ targetSdk');
assert.equal(minSdk, twa.minSdkVersion, 'minSdk : build.gradle et twa-manifest.json divergent');
assert.ok(gradleNumber(appGradle, 'versionCode') >= 1);
assert.equal(gradleValue(appGradle, 'versionName'), twa.appVersion);
assert.equal(gradleNumber(appGradle, 'versionCode'), twa.appVersionCode);
const agp = rootGradle.match(/id 'com\.android\.application' version '(\d+)\.(\d+)\.(\d+)'/);
assert.ok(agp, 'la version du plugin Android doit être figée (x.y.z)');
assert.ok(Number(agp[1]) >= 9, 'AGP 9 ou plus (compileSdk 36)');
assert.doesNotMatch(appGradle + rootGradle + settingsGradle, /\+['"]/, 'aucune dépendance dynamique « + »');
assert.doesNotMatch(appGradle + rootGradle + settingsGradle, /jcenter\(\)/, 'JCenter est fermé');
assert.match(appGradle, /implementation 'com\.google\.androidbrowserhelper:androidbrowserhelper:\d+\.\d+\.\d+'/, 'androidbrowserhelper figé en version stable');
assert.doesNotMatch(appGradle, /androidbrowserhelper:[^']*(alpha|beta|rc)/i, 'pas de version préliminaire d’androidbrowserhelper');

const wrapper = read('android/gradle/wrapper/gradle-wrapper.properties');
const distribution = wrapper.match(/^distributionUrl=https\\:\/\/services\.gradle\.org\/distributions\/gradle-(\d+\.\d+(?:\.\d+)?)-bin\.zip$/m);
assert.ok(distribution, 'distribution Gradle officielle en HTTPS');
assert.match(wrapper, /^distributionSha256Sum=[0-9a-f]{64}$/m, 'la distribution Gradle doit être vérifiée par SHA-256');
const expectedJar = OFFICIAL_WRAPPER_JAR_SHA256[distribution[1]];
assert.ok(expectedJar, `empreinte officielle du wrapper Gradle ${distribution[1]} à renseigner dans ce test`);
const actualJar = crypto.createHash('sha256').update(fs.readFileSync(path.join(ANDROID, 'gradle/wrapper/gradle-wrapper.jar'))).digest('hex');
assert.equal(actualJar, expectedJar, 'gradle-wrapper.jar ne correspond pas au binaire publié par Gradle');
assert.ok(fs.statSync(path.join(ANDROID, 'gradlew')).mode & 0o111, 'gradlew doit rester exécutable');

// 4. Manifest Android : une seule activité de lancement, lien vérifié vers store-runner.fr.
assert.doesNotMatch(androidManifest, /<uses-permission\b/, 'aucune permission Android : toute nouvelle permission est une décision explicite');
assert.match(androidManifest, /android:name="\.LauncherActivity"/);
assert.match(androidManifest, /<intent-filter android:autoVerify="true">[\s\S]*?android:scheme="https"[\s\S]*?android:host="@string\/hostName"/, 'lien d’application HTTPS vérifié');
assert.match(androidManifest, /android:name="asset_statements"\s+android:resource="@string\/assetStatements"/);
assert.match(androidManifest, /android\.support\.customtabs\.trusted\.DEFAULT_URL"\s+android:value="@string\/launchUrl"/);
const statements = JSON.parse(strings.match(/<string name="assetStatements">([\s\S]*?)<\/string>/)[1].replace(/\\"/g, '"'));
assert.deepEqual(statements, [{ relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'web', site: ORIGIN } }]);

// 5. Aucun secret, aucune clé, aucun binaire Android dans le dépôt.
const files = versionableFiles();
assert.ok(files.includes('android/app/build.gradle') && files.length > 200, 'liste des fichiers du dépôt illisible');
const forbidden = files.filter(file => /\.(jks|keystore|p12|pfx|pepk|apk|aab|idsig)$/i.test(file) || /(^|\/)keystore\.properties$/.test(file) || /(^|\/)local\.properties$/.test(file));
assert.deepEqual(forbidden, [], `fichiers de signature ou de build interdits : ${forbidden.join(', ')}`);
for (const file of files.filter(file => file.startsWith('android/'))) {
  if (/\.(png|jar)$/.test(file)) continue;
  const content = read(file);
  assert.doesNotMatch(content, /-----BEGIN [A-Z ]*PRIVATE KEY-----/, `${file} contient une clé privée`);
  // Un mot de passe écrit en dur : littéral dans un script, valeur dans un .properties.
  const password = file.endsWith('.properties') || file.endsWith('.example')
    ? /^[ \t]*(storePassword|keyPassword)[ \t]*=[ \t]*\S/m
    : /(storePassword|keyPassword)(\s*[=:]\s*|\s+)['"][^'"]+['"]/i;
  assert.doesNotMatch(content, password, `${file} contient un mot de passe de signature`);
  assert.doesNotMatch(content, /\b\d{8}-r\d+[a-z0-9-]*\b/, `${file} ne doit pas suivre BUILD_REV : la coque Android ne change pas à chaque version web`);
  assert.ok(!content.includes(version.latestBuild), `${file} ne doit pas contenir BUILD_REV`);
  assert.doesNotMatch(content, /(^|[^a-z])v2\//, `${file} ne doit rien référencer de /v2/`);
}
const example = read('android/keystore.properties.example');
assert.match(example, /^storePassword=$/m, 'le modèle de signature ne porte aucun mot de passe');
assert.match(example, /^keyPassword=$/m, 'le modèle de signature ne porte aucun mot de passe');
const ignoreRules = read('.gitignore') + '\n' + read('android/.gitignore');
for (const rule of ['*.jks', '*.keystore', 'keystore.properties', '*.apk', '*.aab', 'signing/', 'local.properties', 'build/']) {
  assert.ok(ignoreRules.split('\n').includes(rule), `.gitignore doit exclure ${rule}`);
}
assert.ok(twa.signingKey.path.startsWith('./signing/'), 'la clé locale Bubblewrap doit vivre dans android/signing/, ignoré par Git');

// 6. Digital Asset Links : jamais d'empreinte fictive, jamais de fichier sans vraie empreinte.
const SHA256_FINGERPRINT = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;
assert.ok(Array.isArray(twa.fingerprints), 'twa-manifest.json doit déclarer fingerprints');
const fingerprints = twa.fingerprints.map(entry => entry && entry.value);
for (const value of fingerprints) {
  assert.match(String(value), SHA256_FINGERPRINT, `empreinte SHA-256 invalide : ${value}`);
  assert.ok(new Set(value.split(':')).size > 2, `empreinte manifestement fictive : ${value}`);
}
assert.equal(new Set(fingerprints).size, fingerprints.length, 'empreintes en double');
const assetLinksFiles = files.filter(file => /(^|\/)assetlinks\.json$/i.test(file));
if (!fingerprints.length) {
  assert.deepEqual(assetLinksFiles, [], 'aucun assetlinks.json tant qu’aucune vraie empreinte de signature n’est validée');
} else {
  assert.deepEqual(assetLinksFiles, ['.well-known/assetlinks.json'], 'assetlinks.json vit uniquement dans /.well-known/');
  const links = readJson('.well-known/assetlinks.json');
  assert.deepEqual(links, [{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: { namespace: 'android_app', package_name: PACKAGE_ID, sha256_cert_fingerprints: fingerprints }
  }], 'assetlinks.json doit reprendre exactement les empreintes de twa-manifest.json');
  // upload-pages-artifact v4+ écarte les dossiers cachés : /.well-known/ disparaîtrait du site.
  const deploy = read('.github/workflows/deploy-pages.yml');
  assert.ok(/upload-pages-artifact@v3\b/.test(deploy) || /include-hidden-files:\s*true/.test(deploy),
    'le déploiement Pages doit publier /.well-known/ (upload-pages-artifact@v3 ou include-hidden-files: true)');
}

// 7. La PWA reste la source de vérité : V1 ne charge ni ne met en cache android/.
const index = read('index.html');
const sw = read('sw.js');
assert.ok(!index.includes('android/'), 'index.html ne charge rien de android/');
assert.ok(!sw.includes('android/'), 'sw.js ne met rien de android/ en cache');
assert.ok(!sw.includes('assetlinks'), 'sw.js ne doit pas intercepter assetlinks.json');
assert.notEqual(webManifest.prefer_related_applications, true, 'la PWA reste installable depuis le navigateur');
assert.equal(new URL(webManifest.scope, ORIGIN + '/manifest.webmanifest').href, ORIGIN + '/', 'la TWA ouvre la racine du scope PWA');
assert.ok(!files.some(file => file.startsWith('v2/') && /(^|[\/_.-])(android|twa)([\/_.-]|$)/i.test(file)), 'v2/ reste hors du packaging Android');

console.log(`PASS: TWA ${PACKAGE_ID} → ${ORIGIN}/ (targetSdk ${targetSdk}, AGP ${agp.slice(1).join('.')}, Gradle ${distribution[1]}), icônes PWA, aucun secret, assetlinks absent faute d’empreinte validée.`);
