# Store Runner — enveloppe Android (Trusted Web Activity)

Ce dossier n'est **qu'un emballage** pour publier Store Runner sur Google Play.
Il ne contient aucune logique métier et aucune interface : la PWA publiée sur
`https://store-runner.fr/` reste l'unique source de vérité.

## 1. Architecture

```
PWA Store Runner (store-runner.fr, V1)      ← code, données, service worker, mises à jour
        ↓ ouverte en plein écran par
Chrome — Trusted Web Activity                ← même moteur que la PWA installée
        ↓ lancée par
Application Android fr.storerunner.app       ← LauncherActivity d'androidbrowserhelper
        ↓ publiée sur
Google Play (AAB signé)
```

- Tout ce qui fait Store Runner (planning, visites, Mode Runner, photos, IA,
  IndexedDB V256, service worker, hors ligne, gestionnaire de mise à jour V260,
  retour Android et clavier V262) s'exécute **dans Chrome**, exactement comme la PWA.
- Une nouvelle version web publiée sur `main` arrive dans l'app sans passer par
  Google Play. Une mise à jour Play n'est nécessaire que si ce dossier change.
- Les données vivent dans le stockage de Chrome pour `store-runner.fr` : elles sont
  partagées avec la PWA ouverte dans Chrome, et survivent à la désinstallation de l'app.
- Si la TWA n'est pas vérifiée (voir §7) ou si le navigateur ne la prend pas en charge,
  l'app ouvre un **onglet Chrome personnalisé** avec barre d'adresse
  (`fallbackType: customtabs`). Jamais de WebView : Google y refuse l'OAuth.

## 2. Identité

| Élément | Valeur |
|---|---|
| Nom / lanceur | Store Runner |
| Package (`applicationId`, `namespace`) | `fr.storerunner.app` |
| Domaine associé | `store-runner.fr` |
| URL de lancement | `https://store-runner.fr/` |
| Orientation | portrait (ignorée par Android 16 sur grands écrans ≥ 600 dp) |
| Couleurs | barre d'état et navigation `#F2F5FA`, démarrage `#F4F6FA` (manifest PWA) |
| Icônes | `app-icon-512.png` et `app-icon-maskable-512.png` de la PWA (Runner bleu, PR #523), exportées vers `res/` par `tools/generate-android-icons.py` |
| Permissions Android | aucune déclarée ; AndroidX ajoute seulement `fr.storerunner.app.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` (interne, niveau signature). Géolocalisation et caméra : permissions Chrome du site |
| Version de la coque | `versionCode 2`, `versionName 1.0.1` (indépendante de `BUILD_REV`) |

`twa-manifest.json` garde les paramètres Bubblewrap. `app/build.gradle` en est la
traduction ; `tests/android-twa.test.cjs` (Reliability) vérifie qu'ils restent alignés.

## 3. Versions retenues

| Composant | Version | Pourquoi |
|---|---|---|
| `targetSdk` / `compileSdk` | 36 (Android 16) | Exigé par Google Play depuis le 31/08/2026 |
| `minSdk` | 24 | Minimum d'androidbrowserhelper 2.7.x |
| Android Gradle Plugin | 9.4.0 | Stable courant (sept. 2026), API jusqu'à 37 |
| Gradle (wrapper) | 9.7.1 | ≥ 9.6.0 exigé par AGP 9.4 ; dernier correctif de la 9.7, SHA-256 vérifié |
| androidbrowserhelper | 2.7.3 | Version recommandée par son README officiel |
| JDK de build | 17+ | Requis par AGP 9 (Android Studio embarque un JDK compatible) |

Le projet a été généré par **Bubblewrap 1.25.0** (`@bubblewrap/core`, générateur
officiel des TWA) puis porté sur le DSL AGP 9 : Bubblewrap produit encore AGP 8.9.1,
`jcenter()` et un séparateur de barre de navigation noir. **Ne pas lancer
`bubblewrap update` dans ce dossier** : il réécrirait ces fichiers. Pour de nouvelles
icônes, générer dans un dossier temporaire puis ne recopier que `app/src/main/res/`
(`mipmap-*`, `drawable-*/splash.png`) et `store_icon.png`. Depuis la 1.0.1, le plus simple
est `python tools/generate-android-icons.py` (Pillow) : il exporte ces ressources, aux mêmes
tailles, depuis les icônes PWA approuvées, sans Bubblewrap.

## 4. Construire localement

Prérequis : Android Studio (ou JDK 17+ et SDK Android avec `platforms;android-36`).

```bash
cd android
./gradlew assembleDebug        # app/build/outputs/apk/debug/app-debug.apk
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

La CI fait la même chose : le workflow **Android TWA build** construit l'APK debug et
l'AAB release non signé à chaque PR qui touche `android/`, et publie l'APK debug en
artefact (7 jours) pour un test sur téléphone.

Sans `assetlinks.json`, l'APK s'ouvre en onglet personnalisé (barre d'adresse visible).
Pour voir le vrai plein écran avant la publication de l'association, sur un appareil
de test : `chrome://flags` → « Enable command line on non-rooted devices », puis

```bash
adb shell "echo '_ --disable-digital-asset-link-verification-for-url=\"https://store-runner.fr\"' > /data/local/tmp/chrome-command-line"
```

et redémarrer Chrome.

## 5. Préparer la signature

Trois notions distinctes :

- **Clé d'importation (upload key)** — la vôtre. Elle signe l'AAB envoyé à la Play
  Console. Perdue ou compromise : Google peut la réinitialiser sur demande.
- **Clé de signature de l'application (Play App Signing)** — détenue par Google,
  obligatoire pour toute nouvelle app. Elle signe les APK réellement installés.
  Elle ne change jamais pendant la vie de l'app.
- **Certificat Digital Asset Links** — l'empreinte SHA-256 que le site déclare pour
  prouver que l'app lui appartient. En production, c'est celle de la **clé Play App
  Signing**. On peut y ajouter celle de la clé d'importation pour tester un AAB signé
  localement. L'empreinte de la clé **debug** n'y figure jamais.

Créer la clé d'importation, hors dépôt ou dans `android/signing/` (ignoré par Git) :

```bash
cd android && mkdir -p signing
keytool -genkeypair -v -keystore signing/upload-keystore.jks -alias upload \
  -keyalg RSA -keysize 2048 -validity 10000     # ≈ 27 ans (Google : ≥ 25 ans)
cp keystore.properties.example keystore.properties   # puis renseigner les mots de passe
```

Conserver le keystore et ses mots de passe dans un gestionnaire de secrets, avec une
sauvegarde hors ligne. **Rien de tout cela ne va dans Git** : `keystore.properties`,
`signing/`, `*.jks`, `*.keystore`, `*.apk`, `*.aab` sont ignorés et Reliability échoue
si l'un d'eux devient versionnable.

## 6. Récupérer le vrai SHA-256

- Clé d'importation : `keytool -list -v -keystore signing/upload-keystore.jks -alias upload`
  → ligne `SHA256:`.
- Clé Play App Signing (celle qui compte) : Play Console → l'app → page **App signing**
  (Release → Setup → App signing) → « App signing key certificate » → SHA-256. La même
  page propose l'extrait Digital Asset Links prêt à copier.

Ne jamais inventer ni recopier une empreinte d'exemple.

## 7. Créer ensuite `assetlinks.json` (PR dédiée, après validation humaine)

1. Ajouter les vraies empreintes dans `android/twa-manifest.json` :
   `"fingerprints": [{ "name": "Play App Signing", "value": "AA:BB:…" }]`.
2. Créer à la racine du dépôt `.well-known/assetlinks.json`, servi à
   `https://store-runner.fr/.well-known/assetlinks.json` :

   ```json
   [{
     "relation": ["delegate_permission/common.handle_all_urls"],
     "target": {
       "namespace": "android_app",
       "package_name": "fr.storerunner.app",
       "sha256_cert_fingerprints": ["<SHA-256 Play App Signing, format AA:BB:…>"]
     }
   }]
   ```

3. `tests/android-twa.test.cjs` refuse ce fichier tant que `fingerprints` est vide, et
   exige ensuite qu'il reprenne exactement ces empreintes. Pas de bump `BUILD_REV` :
   le fichier n'est ni chargé par `index.html` ni mis en cache par `sw.js`.
4. Après déploiement, vérifier : réponse 200 en `application/json` sans redirection,
   non bloquée par Cloudflare pour les robots Google ;
   `https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://store-runner.fr&relation=delegate_permission/common.handle_all_urls` ;
   sur appareil, `adb shell pm get-app-links fr.storerunner.app` → `verified`.

`deploy-pages.yml` utilise `upload-pages-artifact@v3`, qui publie `.well-known/`. Une
montée en v4+ exigera `include-hidden-files: true` (le test le vérifie).

## 8. Produire l'AAB final

1. Incrémenter `versionCode` (obligatoire à chaque envoi) et `versionName` dans
   `app/build.gradle` **et** `twa-manifest.json`.
2. Avec `keystore.properties` renseigné :
   ```bash
   cd android && ./gradlew bundleRelease
   # app/build/outputs/bundle/release/app-release.aab, signé par la clé d'importation
   keytool -printcert -jarfile app/build/outputs/bundle/release/app-release.aab
   ```
3. Envoyer cet AAB dans la Play Console (Google le re-signe avec la clé Play App Signing).

## 9. Reste à faire dans la Play Console

- Compte développeur et vérification d'identité ; créer l'app (nom Store Runner,
  langue par défaut fr-FR, gratuite) ; accepter Play App Signing.
- Fiche : icône 512 × 512 (`store_icon.png`), bannière 1024 × 500, captures téléphone.
- Politique de confidentialité : `https://store-runner.fr/privacy.html`.
- Sécurité des données : déclarer fidèlement localisation, photos, comptes rendus
  (stockés sur l'appareil), appels IA via la passerelle, Google Agenda en lecture seule.
- Classification du contenu, public cible, accès à l'app (pas de compte requis),
  absence de publicité, pays.
- Test interne, puis test fermé : un compte personnel créé après le 13/11/2023 doit
  réunir au moins 12 testeurs actifs pendant 14 jours avant la production.

## 10. Points à valider sur un vrai téléphone Android

Aucun comportement web n'a été modifié pour la TWA. À contrôler en conditions réelles :

- **Retour Android V262** : fiche magasin, menu Plus, assistant, `<dialog>`, retour à
  l'accueil puis sortie (Chrome gère l'historique comme pour la PWA installée).
- **Clavier** (`interactive-widget=resizes-content`) et **zones sûres** / bord à bord.
- **Liens sortants**, qui restent tels quels :
  Google Maps (`google.com/maps`, `_blank`) → app Maps ou onglet Chrome ;
  Apple Plans (`maps.apple.com`) → navigateur ; `mailto:` → messagerie ;
  `navigator.share` → feuille de partage Android ;
  OAuth Google Agenda (fenêtre GIS `accounts.google.com`) → le jeton doit revenir à
  l'app ; `privacy.html` / `terms.html` → restent dans l'app (même origine) ;
  Nominatim et la passerelle IA ne sont que des requêtes réseau.
- Géolocalisation et caméra : invite Chrome pour `store-runner.fr`.
- Mise à jour PWA (V260) et fonctionnement hors ligne depuis l'icône Android.

## Publication web de ce dossier

`deploy-pages.yml` publie tout le dépôt : les fichiers de `android/` sont donc aussi
servis sous `https://store-runner.fr/android/`. Ils sont déjà publics sur GitHub et ne
contiennent aucun secret ; la PWA ne les charge ni ne les met en cache.
