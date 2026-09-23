(function(){
  'use strict';

  /* « Quoi de neuf ? » — annonce une seule fois les nouveautés d'une version.
     100 % local : aucune requête réseau, aucune lecture de version.json. La version
     affichée vient du bootloader (window.__STORE_RUNNER_BUILD_REV), exactement
     comme le centre de mise à jour, donc l'écran fonctionne hors ligne.
     Ce module ne possède que son propre écran : il ne remplace aucune fonction
     métier, n'observe rien en permanence et n'ajoute aucun setInterval. */

  const SEEN_KEY='store-runner-whatsnew-last-seen';
  const LAST_BUILD_KEY='store-runner-whatsnew-last-build';
  const PENDING_KEY='store-runner-whatsnew-pending';
  /* Clé du centre de mise à jour, lue seulement : elle note déjà le build à chaque
     lancement, ce qui donne un « avant » aux installations antérieures à ce module. */
  const UPDATE_MANAGER_BUILD_KEY='store-runner-last-seen-build';
  const DIALOG_ID='storeRunnerWhatsNew';
  const MENU_BUTTON_ID='storeRunnerWhatsNewMenuButton';
  const STYLE_ID='store-runner-whats-new-css';
  const UPDATE_BANNER_ID='storeRunnerUpdateBanner';
  const AUTO_OPEN_DELAY=1100;

  /* Texte utilisateur, jamais du changelog technique : ce que le terrain constate,
     pas ce que le dépôt a changé. Versions les plus récentes en premier, 3 à 6
     éléments par version. Ajouter une version = ajouter une entrée ici, rien d'autre. */
  const RELEASES=[
    {
      version:'249',
      title:'Des journées mieux regroupées',
      items:[
        'Quand Store Runner prépare une semaine, les magasins déjà retenus sont maintenant regroupés en journées plus cohérentes géographiquement.',
        'L’équilibre de charge entre tes journées reste prioritaire : la proximité ne vient départager que des journées comparables.',
        'Quand les distances routières sont disponibles, elles servent à rapprocher les magasins d’un même secteur ; sinon l’estimation habituelle prend le relais.',
        'Tes priorités, tes rotations, tes magasins posés et tes rendez-vous gardent exactement la même priorité qu’avant.'
      ]
    },
    {
      version:'248',
      title:'Des trajets plus proches de la réalité',
      items:[
        'Quand tu génères ton planning, Store Runner essaie désormais de récupérer les vraies distances et durées routières entre ton point de départ et tes magasins.',
        'Les trajets déjà calculés sont conservés sur le téléphone pour éviter de les redemander à chaque génération.',
        'Sans réseau ou si le service routier ne répond pas, le planning continue avec son estimation habituelle au lieu de se bloquer.',
        'Tes priorités, tes visites, tes magasins posés et tes règles de planning ne sont pas modifiés par ce changement.'
      ]
    },
    {
      version:'247',
      title:'Le résumé IA de sortie magasin a plus de temps',
      items:[
        'Une note terrain longue laisse maintenant jusqu’à 90 secondes à l’IA pour rédiger le résumé BRUN ou BLANC, au lieu de 45.',
        'Si l’IA met quand même trop de temps, le message le dit clairement au lieu d’afficher une erreur technique.',
        'Le compte rendu local reste toujours affiché, modifiable et copiable, même quand l’IA ne répond pas.'
      ]
    },
    {
      version:'246',
      title:'Le brief de la semaine explique tes priorités',
      items:[
        'Nouveau « 🗓️ Brief semaine » dans le menu Plus : note la feuille de route de la semaine (W39, W40…) et ses consignes.',
        'Chaque semaine garde son brief : la feuille de route W40 ne remplace jamais celle de W39, et tu peux relire les anciennes.',
        'Une consigne peut renforcer des magasins, fixer une échéance ou neutraliser une priorité le temps d’une semaine, comme « Prios Co BRUN annulées ».',
        'La fiche magasin affiche pourquoi il est prioritaire cette semaine : sa priorité permanente, son P1/P2 et la règle du brief, sans rien effacer.',
        'Ton planning n’est pas modifié par le brief pour l’instant.'
      ]
    },
    {
      version:'245',
      title:'Le Mode Terrain au cœur de ta journée',
      items:[
        'Le Mode Terrain est désormais accessible directement depuis votre journée, et les compteurs distinguent clairement magasins, visites réalisées et crédits.',
        'Les jours de tournée, l’accueil affiche une carte noire Mode terrain : magasin en cours, visite X / Y, démarrage de la visite 6P et itinéraire en un geste.',
        'Quand une visite est terminée, la carte passe toute seule au magasin suivant.',
        'Dans Planning, « ▶ Passer en mode terrain » ouvre directement la tournée du jour affiché.'
      ]
    },
    {
      version:'244',
      title:'Les mises à jour s’appliquent toutes seules',
      items:[
        'Les mises à jour s’appliquent désormais automatiquement sans devoir fermer puis rouvrir Store Runner.',
        'Après « Mettre à jour », Store Runner télécharge la nouvelle version puis se recharge une seule fois, directement dessus.',
        'Tes visites, notes, photos, sauvegardes et ton planning restent intacts : seule l’application elle-même change.'
      ]
    },
    {
      version:'243',
      title:'Le planning se souvient enfin de qui il a déjà visité',
      items:[
        'La génération 3 semaines garde maintenant en mémoire les cycles précédents : elle ne repropose plus systématiquement les mêmes magasins les plus proches.',
        'Un magasin plus éloigné, jamais planifié depuis longtemps, finit par avoir sa place au lieu de rester indéfiniment de côté.',
        'Sur un secteur trop grand pour tenir dans un seul cycle de 3 semaines, chaque magasin est couvert avant qu’un autre ne repasse une deuxième fois.',
        'Tes verrous, rendez-vous, capacités par jour et horaires restent respectés exactement comme avant : seul l’ordre de passage change.'
      ]
    },
    {
      version:'242',
      title:'Les semaines modifiées à la main se complètent toute seules',
      items:[
        'Une semaine où tu as posé une visite ou réorganisé une journée à la main ne reste plus bloquée avec des jours vides pour le reste du cycle.',
        'Les visites que tu as posées ne bougent jamais de leur jour : seule la place encore libre se remplit automatiquement avec tes prochains magasins à voir.',
        'Le remplissage respecte tes capacités par jour, tes horaires, tes jours bloqués, tes rendez-vous et tes magasins verrouillés, sans jamais créer de doublon.',
        'Si la semaine était déjà complète, rien ne change : ce correctif ne touche que les jours réellement vides.'
      ]
    },
    {
      version:'240',
      title:'Plus de blocage « quota dépassé »',
      items:[
        'Le message « quota exceeded » qui bloquait la génération du planning a disparu : Store Runner ne recopie plus tes données entières à chaque enregistrement.',
        'Seul ce qui change réellement est mis de côté le temps de l’enregistrement, au lieu de tout le carnet magasins et des imports cuisinistes.',
        'L’historique des sauvegardes ne peut plus occuper presque toute la place disponible sur le téléphone.',
        'Si la place vient vraiment à manquer, tu lis une phrase claire et tes données restent intactes, au lieu d’une erreur technique.'
      ]
    },
    {
      version:'239',
      title:'Planning 3 semaines simplifié',
      items:[
        'La génération du planning crée maintenant directement un cycle de 3 semaines.',
        'Un seul bouton : « Générer mes 3 semaines » part de la semaine affichée et prépare aussi les deux suivantes.',
        'L’ancienne action séparée dans « Planifier plusieurs semaines » a disparu : plus de doublon, plus de choix à faire.',
        'Tes visites posées à la main, tes magasins épinglés, tes rendez-vous et tes capacités par jour sont protégés comme avant.'
      ]
    },
    {
      version:'238',
      title:'Génération des comptes rendus plus fiable',
      items:[
        'Store Runner relance automatiquement une génération de compte rendu lorsqu’une réponse IA revient vide.',
        'Quand la seconde tentative aboutit, le compte rendu s’affiche normalement et Store Runner te le signale d’un mot.',
        'Si elle échoue aussi, tu lis une phrase claire au lieu d’un message technique, et ton compte rendu local reste intact.',
        'Le bouton reste verrouillé pendant toute la génération : un second appui ne relance plus rien.'
      ]
    },
    {
      version:'237',
      title:'Priorités magasin plus claires',
      items:[
        'Les performances sont maintenant résumées en quelques points : problème principal, action terrain, point positif et chiffres clés.',
        'La carte du magasin ne déroule plus toutes les alertes du fichier : elle garde les deux sujets qui comptent et les tailles vraiment en recul.',
        'Une semaine encore négative n’est plus annoncée comme une hausse : elle est dite « en amélioration mais toujours en recul ».',
        'Le détail complet reste à un clic avec « Voir le détail performance », et le pilotage performance ne change pas.',
        'Les caractères illisibles qui apparaîssaient avant « ALERTE » ont disparu.'
      ]
    },
    {
      version:'235',
      title:'Partage photo amélioré',
      items:[
        'Les photos BRUN et BLANC sont maintenant triées automatiquement et partagées par lots de 10, sans doublons.',
        'Une photo sans famille n’est plus comptée à la fois dans BRUN et dans BLANC : elle reste à part.',
        'Le bouton indique ce qu’il envoie et ce qu’il reste : « Partager les 10 suivantes · 21 restantes ».',
        'Si tu refermes la fenêtre de partage d’Android, rien n’est perdu : le même lot est reproposé au clic suivant.'
      ]
    },
    {
      version:'234',
      title:'Un démarrage plus rapide et plus fluide',
      items:[
        'Démarrage plus rapide et plus fluide : un seul écran de chargement, sans flash de l’ancienne interface.',
        'L’écran de chargement reste affiché jusqu’à ce que l’accueil soit vraiment prêt, puis laisse la main immédiatement.',
        'Les lancements suivants réutilisent les fichiers déjà installés : moins d’attente avant d’arriver sur l’accueil.',
        'Si l’accueil met du temps à se construire, l’application redevient utilisable au lieu de rester bloquée derrière le chargement.'
      ]
    },
    {
      version:'233',
      title:'Une seule visite par magasin et par jour',
      items:[
        'Revenir sur un magasin déjà visité aujourd’hui ouvre la visite existante au lieu d’en créer une nouvelle.',
        'La visite du jour peut être consultée sans modifier vos données.',
        'Pour continuer la saisie, « Réouvrir cette visite » reprend exactement le même passage.',
        'Fermer puis rouvrir plusieurs fois la fiche ne crée plus de doublon dans l’historique.'
      ]
    },
    {
      version:'232',
      title:'Des comptes rendus IA qui aboutissent',
      items:[
        'La génération du compte rendu de visite fonctionne de nouveau, pour le BRUN comme pour le BLANC.',
        'Quand la réponse revient mal formée, Store Runner la fait corriger une seule fois avant d’abandonner.',
        'En cas d’échec, votre rapport local, vos notes et vos photos sont conservés tels quels.',
        'Le bouton redevient utilisable immédiatement et un appui répété ne lance plus deux générations.'
      ]
    },
    {
      version:'231',
      title:'Corriger une visite enregistrée par erreur',
      items:[
        'Une visite saisie sur le mauvais magasin peut maintenant être supprimée depuis sa fiche de visite, en deux gestes volontaires.',
        'La confirmation rappelle l’enseigne, la ville et la date avant de supprimer quoi que ce soit.',
        'La visite disparaît partout à la fois : mémoire magasin, historique, compteurs et comptes rendus, sans laisser de visite fantôme.',
        'Si deux visites du même magasin ont eu lieu le même jour, la date reste dans l’historique.',
        'Les opportunités notées pendant la visite sont conservées sur le magasin.'
      ]
    },
    {
      version:'230',
      title:'Les horaires de vos magasins, par enseigne',
      items:[
        'Dans les réglages du planning, renseignez une seule fois les horaires d’une enseigne, du lundi au dimanche.',
        'Les magasins utilisent automatiquement ce modèle et suivent ses modifications.',
        'Les horaires personnalisés d’un magasin gardent la priorité. Vous pouvez revenir aux horaires de son enseigne en un geste.',
        'Les fermetures et les pauses de midi sont prises en compte dans les heures d’arrivée et de fin estimées.',
        'Vos modèles restent disponibles hors ligne et sont inclus dans vos sauvegardes.'
      ]
    },
    {
      version:'229',
      title:'Suivre vos contrats cuisinistes du premier contact à la signature',
      items:[
        'Chaque magasin cuisiniste affiche où en est votre démarche commerciale : à proposer, proposition présentée, contrat envoyé, en attente de signature, signé ou à renouveler.',
        'Notez en deux gestes ce que vous venez de faire (visite, appel, relance, devis, signature) et ce que vous prévoyez ensuite, avec une date.',
        'Store Runner vous alerte quand une relance est en retard ou quand un contrat approche de sa fin.',
        'L’espace Cuisinistes regroupe tous vos magasins avec un filtre par situation pour voir d’un coup d’œil ce qui demande une action.',
        'Les contrats importés depuis vos fichiers restent intacts : le suivi commercial s’ajoute à côté sans jamais les modifier.',
        'Importez directement votre fichier contrats .xlsx ou .xlsm : Store Runner ne garde que les magasins de votre secteur et ne vous demande de trancher que les cas douteux.'
      ]
    },
    {
      version:'228',
      title:'Ajouter et retrouver un magasin devient simple',
      items:[
        'Ajoutez un magasin avec seulement son enseigne, son nom, sa ville et éventuellement son adresse.',
        'Store Runner localise le magasin et vous demande de confirmer avant de l’ajouter.',
        'Les coordonnées techniques restent invisibles et sont gérées automatiquement.',
        'La liste Magasins peut maintenant afficher Tous, Retail ou Cuisinistes, avec les enseignes du secteur comme Schmidt.',
        'Les magasins compris par l’IA passent par le même contrôle avant enregistrement.'
      ]
    },
    {
      version:'227',
      title:'Le bon départ après une nuit sur place',
      items:[
        'Après un découché, le premier trajet part de votre hôtel localisé.',
        'Si le lieu manque, le planning vous demande de confirmer votre point de départ.',
        'Le retour du soir et la fin estimée de journée restent calculés vers votre base habituelle.'
      ]
    },
    {
      version:'226',
      title:'Un planning qui tient sur le terrain',
      items:[
        'Le planning reste fiable après une modification manuelle.',
        'Les magasins verrouillés ne bougent plus lors d’un recalcul.',
        'Plus de visite en double quand une tournée est reportée.',
        'Les horaires d’ouverture des magasins sont mieux pris en compte.',
        'Sauvegarde et rechargement des données renforcés.'
      ]
    }
  ];

  let openedVersion=null;

  function displayVersion(build){
    const m=String(build||'').match(/(\d{2,})$/);
    return m?m[1]:'';
  }

  function currentBuild(){
    return String((typeof window!=='undefined'&&window.__STORE_RUNNER_BUILD_REV)||'');
  }

  function currentVersion(){
    return displayVersion(currentBuild());
  }

  function latestRelease(){
    return RELEASES.length?RELEASES[0]:null;
  }

  function releaseFor(version){
    const wanted=String(version||'');
    for(let i=0;i<RELEASES.length;i++)if(RELEASES[i].version===wanted)return RELEASES[i];
    return null;
  }

  /* Un stockage simplement présent ne suffit pas : sur iPhone il peut exister et
     refuser toute écriture (quota, navigation privée). On le sonde une fois — lecture
     et écriture réelles — car c'est cette écriture qui tient la promesse « une seule
     fois ». Un stockage qui lève est traité comme absent. */
  let probedStorage;
  function storage(){
    if(probedStorage!==undefined)return probedStorage;
    let candidate=null;
    try{candidate=window.__chefStorage||window.localStorage||null}catch(e){candidate=null}
    if(candidate){
      const probe='__srwn_probe__';
      try{candidate.setItem(probe,'1');candidate.getItem(probe);candidate.removeItem(probe)}
      catch(e){candidate=null}
    }
    probedStorage=candidate||null;
    return probedStorage;
  }

  function lastSeenVersion(){
    const s=storage();
    if(!s)return null;
    try{return s.getItem(SEEN_KEY)}catch(e){return null}
  }

  function markSeen(version){
    const s=storage();
    if(!s)return false;
    const value=String(version||currentVersion()||'');
    if(!value)return false;
    try{s.setItem(SEEN_KEY,value);return true}catch(e){return false}
  }

  /* La seule chose qui autorise une ouverture automatique, c'est un changement de
     build réellement observé entre deux lancements. Présence de données, ancienneté
     du profil ou absence de clé « vue » ne prouvent rien : une page qui se recharge
     dans la même version en produit autant, et c'est ainsi que l'écran s'était
     interposé pendant un test métier. On compare donc le build courant à celui du
     lancement précédent, et rien d'autre.

     L'instantané est pris à l'évaluation du script, avant DOMContentLoaded : à cet
     instant le stockage ne reflète encore que les sessions passées, ni l'application
     ni le centre de mise à jour n'ont réécrit quoi que ce soit.

       'premiere-installation' → aucun avant : rien à annoncer, la version est notée
                                 en silence pour que la mise à jour suivante le soit ;
       'mise-a-jour'           → le build a changé depuis le lancement précédent ;
       'meme-build'            → même version qu'au lancement précédent, y compris
                                 un simple rechargement de page ;
       'inconnu'               → sans persistance utilisable, on n'ouvre jamais. */
  let launch=null;
  function launchState(){
    if(launch!==null)return launch;
    const s=storage(),build=currentBuild();
    if(!s||!build){launch='inconnu';return launch}
    let previous=null;
    try{previous=s.getItem(LAST_BUILD_KEY)}catch(e){previous=null}
    if(previous==null){
      try{previous=s.getItem(UPDATE_MANAGER_BUILD_KEY)}catch(e){previous=null}
    }
    try{s.setItem(LAST_BUILD_KEY,build)}catch(e){}
    if(previous==null)launch='premiere-installation';
    else if(previous!==build)launch='mise-a-jour';
    else launch='meme-build';
    /* Une vraie mise à jour arme l'annonce. La clé survit à une fermeture de
       l'application avant lecture, et elle seule peut rouvrir l'écran dans un
       lancement ultérieur : aucun rechargement ne peut l'écrire. */
    if(launch==='mise-a-jour'){
      const version=currentVersion();
      if(version&&releaseFor(version)&&lastSeenVersion()!==version){
        try{s.setItem(PENDING_KEY,version)}catch(e){}
      }
    }
    return launch;
  }

  function pendingVersion(){
    const s=storage();
    if(!s)return null;
    try{return s.getItem(PENDING_KEY)}catch(e){return null}
  }

  function clearPending(){
    const s=storage();
    if(!s)return false;
    try{s.removeItem(PENDING_KEY);return true}catch(e){return false}
  }

  /* Sans persistance utilisable, « une seule fois » ne peut pas être tenu : on
     préfère ne jamais ouvrir automatiquement plutôt que rouvrir à chaque lancement.
     L'entrée du menu ⋮ reste disponible dans ce cas. */
  function hasUnseenRelease(){
    const version=currentVersion();
    if(!version||!releaseFor(version))return false;
    if(!storage())return false;
    return lastSeenVersion()!==version;
  }

  function css(){
    if(document.getElementById(STYLE_ID))return;
    const style=document.createElement('style');
    style.id=STYLE_ID;
    /* z-index au-dessus du bandeau de mise à jour (9999) : l'écran de nouveautés
       est modal, rien ne doit flotter par-dessus son fond flouté. */
    style.textContent=`
      #${DIALOG_ID}{display:none;position:fixed;inset:0;z-index:10010;background:rgba(20,24,32,.24);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}
      #${DIALOG_ID}.open{display:block}
      #${DIALOG_ID} .srwnCard{position:absolute;left:12px;right:12px;bottom:calc(18px + env(safe-area-inset-bottom));max-height:calc(100vh - 64px);max-height:calc(100dvh - 64px);overflow:auto;-webkit-overflow-scrolling:touch;padding:10px 10px 12px;border-radius:28px;background:rgba(249,250,252,.98);border:1px solid rgba(255,255,255,.9);box-shadow:0 28px 80px rgba(20,25,35,.24)}
      #${DIALOG_ID} .srwnHandle{width:42px;height:5px;border-radius:999px;background:#d3d6dc;margin:2px auto 14px}
      #${DIALOG_ID} .srwnTitle{padding:0 8px;font-size:22px;font-weight:850;letter-spacing:-.02em;color:#1d1d1f}
      #${DIALOG_ID} .srwnSub{padding:5px 8px 0;font-size:13px;line-height:1.4;color:#6b7280}
      #${DIALOG_ID} .srwnList{list-style:none;margin:14px 0 2px;padding:0}
      #${DIALOG_ID} .srwnList li{position:relative;padding:9px 10px 9px 32px;font-size:14px;line-height:1.42;color:#1d1d1f;overflow-wrap:anywhere}
      #${DIALOG_ID} .srwnList li::before{content:'✓';position:absolute;left:10px;top:9px;font-weight:850;color:#1428A0}
      #${DIALOG_ID} .srwnOk{width:100%;margin-top:10px;border:0;border-radius:16px;min-height:50px;padding:0 12px;background:#1428A0;color:#fff;font-size:15px;font-weight:850}
      @media(max-width:520px){#${DIALOG_ID} .srwnTitle{font-size:20px}}
    `;
    document.head.appendChild(style);
  }

  function ensureDialog(){
    css();
    let dialog=document.getElementById(DIALOG_ID);
    if(dialog)return dialog;
    dialog=document.createElement('div');
    dialog.id=DIALOG_ID;
    dialog.setAttribute('role','dialog');
    dialog.setAttribute('aria-modal','true');
    dialog.setAttribute('aria-label','Nouveautés de Store Runner');
    dialog.innerHTML='<div class="srwnCard"><div class="srwnHandle"></div><div class="srwnTitle" data-srwn-title></div><div class="srwnSub" data-srwn-sub></div><ul class="srwnList" data-srwn-list></ul><button type="button" class="srwnOk" data-srwn-ok>Compris</button></div>';
    document.body.appendChild(dialog);
    const ok=dialog.querySelector('[data-srwn-ok]');
    if(ok)ok.addEventListener('click',function(e){if(e&&e.preventDefault)e.preventDefault();close()});
    dialog.addEventListener('click',function(e){if(e&&e.target===dialog)close()});
    return dialog;
  }

  /* Le contenu est écrit en textContent, jamais en innerHTML : le texte des
     nouveautés reste du texte, même si une version future en reprend un extrait. */
  function fill(release){
    const dialog=ensureDialog();
    const title=dialog.querySelector('[data-srwn-title]');
    const sub=dialog.querySelector('[data-srwn-sub]');
    const list=dialog.querySelector('[data-srwn-list]');
    if(title)title.textContent='Nouveautés V'+release.version;
    if(sub)sub.textContent=release.title;
    if(list){
      while(list.firstChild)list.removeChild(list.firstChild);
      for(let i=0;i<release.items.length;i++){
        const li=document.createElement('li');
        li.textContent=release.items[i];
        list.appendChild(li);
      }
    }
    return dialog;
  }

  function open(version){
    const release=releaseFor(version||currentVersion())||latestRelease();
    if(!release)return false;
    fill(release).classList.add('open');
    openedVersion=release.version;
    return true;
  }

  /* Toute fermeture vaut « vu » : réafficher automatiquement après une fermeture
     volontaire serait la même gêne que de ne jamais l'enregistrer. */
  function close(){
    const dialog=document.getElementById(DIALOG_ID);
    if(dialog)dialog.classList.remove('open');
    if(openedVersion){markSeen(openedVersion);clearPending();openedVersion=null}
    return true;
  }

  function isOpen(){
    const dialog=document.getElementById(DIALOG_ID);
    return !!(dialog&&dialog.classList&&dialog.classList.contains&&dialog.classList.contains('open'));
  }

  function autoOpen(){
    const kind=launchState();
    if(kind==='premiere-installation'){markSeen(currentVersion());return false}
    if(kind==='inconnu')return false;
    /* Seule une annonce armée par un changement de build ouvre l'écran. Un
       rechargement dans la même version n'en arme aucune, donc n'ouvre rien. */
    if(pendingVersion()!==currentVersion())return false;
    if(!hasUnseenRelease()){clearPending();return false}
    /* Le bandeau « Mise à jour installée » du centre de mise à jour arrive au même
       moment et ferait doublon sous le fond flouté. On masque uniquement ce toast
       passager ; un bandeau collant (mise à jour disponible ou installation en
       cours) porte une information à garder et n'est jamais touché. */
    const banner=document.getElementById(UPDATE_BANNER_ID);
    if(banner&&banner.dataset&&!banner.dataset.sticky)banner.hidden=true;
    return open(currentVersion());
  }

  function ensureMenuEntry(){
    const grid=document.querySelector('#moreSheetV2 .moreSheetGrid');
    if(!grid)return null;
    let button=document.getElementById(MENU_BUTTON_ID);
    if(button)return button;
    button=document.createElement('button');
    button.id=MENU_BUTTON_ID;
    button.type='button';
    button.textContent='✦ Nouveautés';
    button.setAttribute('aria-label','Nouveautés de Store Runner');
    button.addEventListener('click',function(e){
      if(e&&e.preventDefault){e.preventDefault();e.stopPropagation()}
      const more=document.getElementById('moreSheetV2');
      if(more)more.classList.remove('open');
      open(currentVersion());
    });
    grid.appendChild(button);
    return button;
  }

  function start(){
    css();
    ensureMenuEntry();
    window.setTimeout(ensureMenuEntry,80);
    document.addEventListener('store-runner:home-rendered',function(){window.setTimeout(ensureMenuEntry,0)});
    window.setTimeout(autoOpen,AUTO_OPEN_DELAY);
  }

  const publicApi={
    RELEASES:RELEASES,
    SEEN_KEY:SEEN_KEY,
    LAST_BUILD_KEY:LAST_BUILD_KEY,
    PENDING_KEY:PENDING_KEY,
    displayVersion:displayVersion,
    currentVersion:currentVersion,
    releaseFor:releaseFor,
    latestRelease:latestRelease,
    lastSeenVersion:lastSeenVersion,
    hasUnseenRelease:hasUnseenRelease,
    launchState:launchState,
    pendingVersion:pendingVersion,
    currentBuild:currentBuild,
    markSeen:markSeen,
    open:open,
    close:close,
    isOpen:isOpen,
    autoOpen:autoOpen,
    ensureMenuEntry:ensureMenuEntry
  };

  if(typeof module!=='undefined'&&module.exports)module.exports=publicApi;
  if(typeof window==='undefined'||typeof document==='undefined')return;
  window.StoreRunnerWhatsNew=publicApi;
  launchState();   // instantané pris maintenant, avant que l'application n'écrive
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();