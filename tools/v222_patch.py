from pathlib import Path
import json
import re

OLD_REV = "20260918-noteproof221"
NEW_REV = "20260918-visitai222"

report_path = Path("visit-report-slack.js")
s = report_path.read_text(encoding="utf-8")

if "const PRIMARY_BRAND='Sam'+'sung';" not in s:
    needle = "const PLACEHOLDER='[Non renseigné par le FMT]';\n"
    if needle not in s:
        raise SystemExit("PLACEHOLDER marker not found")
    s = s.replace(needle, needle + "const PRIMARY_BRAND='Sam'+'sung';\n", 1)

new_samples = r'''const GRAND_SAMPLE={
  brun:`⚫ Résumé BRUN – [Enseigne Ville]

Rédiger 3 à 6 paragraphes courts et naturels. Regrouper les informations qui parlent du même sujet : équipe et retours vendeurs, TV / OLED / Neo QLED / Lifestyle, audio, concurrence, merchandising, massifications et OMNI lorsqu'ils sont réellement renseignés. Les références, prix, volumes et verbatims utiles restent visibles dans le texte.

Ne pas réciter une checklist. Chaque paragraphe doit apporter un constat terrain utile au business ou au merchandising.

### 🎯 Plan d’action / prochain passage
- [action factuelle directement liée à un constat ou à un suivi saisi]
- [autre action uniquement si elle découle réellement des notes]

**Photos : X au total – Y avant / Z après / N autres.**`,
  blanc:`⚪ Résumé BLANC – [Enseigne Ville]

Rédiger 3 à 6 paragraphes courts et naturels. Regrouper les informations par sujet ou famille réellement présente dans les notes : aspiration, cuisson, froid, lavage, petit électroménager, concurrence, visibilité, massification et retours vendeurs. Les références, prix, volumes et verbatims utiles restent visibles dans le texte.

Ne pas réciter une checklist. Chaque paragraphe doit faire ressortir un constat terrain utile et le positionnement observé de la marque, sans extrapolation.

### 🎯 Plan d’action / prochain passage
- [action factuelle directement liée à un constat ou à un suivi saisi]
- [autre action uniquement si elle découle réellement des notes]

**Photos : X au total – Y avant / Z après / N autres.**`
};'''

s, n = re.subn(r"const GRAND_SAMPLE=\{[\s\S]*?\n\};\nfunction norm", new_samples + "\nfunction norm", s, count=1)
if n != 1:
    raise SystemExit(f"GRAND_SAMPLE replacement count={n}")

new_ai_prompt = r'''function aiPrompt(data){
 const source=JSON.stringify(data,null,2);
 if(data.skeleton==='grands-magasins'){
  const fam=String(data.family||'brun').toUpperCase(),emoji=fam==='BLANC'?'⚪':'⚫',sample=GRAND_SAMPLE[data.family]||GRAND_SAMPLE.brun,storeName=[text(data.store&&data.store.enseigne),text(data.store&&data.store.ville)].filter(Boolean).join(' ');
  return `Tu es un Field Merchandising Trainer (FMT) d’excellence. Tu rédiges le résumé de fin de visite destiné à une direction commerciale. Le résultat doit ressembler à un compte rendu écrit par un chef de secteur expérimenté : naturel, précis, synthétique, hiérarchisé et immédiatement exploitable.

RÈGLES DE FOND — PRIORITÉ ABSOLUE :
1. Utilise UNIQUEMENT les faits présents dans DONNEES_SOURCE. N’invente jamais un nom, un chiffre, une référence, un prix, un volume, une tendance, une cause, une action réalisée, une promesse, une formation ou une conclusion.
2. Conserve exactement les références produit, prix, volumes, noms de concurrents, prénoms et verbatims utiles lorsqu’ils sont présents. Ne corrige jamais une référence produit de toi-même.
3. Ne retranscris pas les notes ligne par ligne. Regroupe les informations proches par sujet ou univers produit et hiérarchise-les selon leur intérêt terrain : visibilité / merchandising, performance ou tendance observée, retour vendeur, concurrence, action réalisée, massification, OMNI et point de blocage.
4. Fais des liens uniquement lorsque le lien est explicitement présent dans les notes. Ne transforme jamais deux constats séparés en relation de cause à effet supposée.
5. Corrige orthographe, grammaire et syntaxe. Supprime les répétitions et les formulations vagues ou génériques. Préfère des phrases courtes, concrètes et professionnelles.
6. Ne montre JAMAIS les libellés techniques 6P (PROMOTION, PRIX, PRODUIT, PLACE, PROPRETÉ, PÉDAGOGIE). Intègre seulement leur contenu utile dans le texte naturel.
7. Couvre, uniquement lorsqu’ils sont renseignés, les sujets métier suivants : ${officialStructure(data.skeleton)}
8. Dans le corps du résumé, n’affiche pas de rubrique vide et n’ajoute pas ${PLACEHOLDER} à chaque information absente. Omet simplement les thèmes non renseignés.
9. Le plan d’action doit contenir uniquement des actions explicitement prévues dans la source OU des suivis opérationnels évidents et conservateurs qui découlent directement d’un constat réel. Exemple autorisé : un meuble de marque explicitement absent peut conduire à « suivre la possibilité de mise en place du meuble ». Exemple interdit : inventer une négociation, un accord magasin, une commande ou une formation non mentionnée.
10. Si une formation / un prochain passage est explicitement saisi, il doit apparaître dans le plan d’action. N’invente jamais une formation.
11. Si aucune action sûre ne peut être formulée, écris uniquement ${PLACEHOLDER} sous le titre du plan d’action.
12. Si photos.total > 0, termine par une seule ligne photos avec le total et les compteurs disponibles avant / après / autres. Si photos.total = 0, n’ajoute aucune ligne Photos.
13. Le résultat est destiné à Slack : aucun préambule, aucune explication de méthode, aucun bloc de code, aucune phrase du type « voici le résumé ».

FORMAT STRICT :
${emoji} Résumé ${fam} – ${storeName||'[Enseigne Ville]'}

[3 à 6 paragraphes courts, naturels et regroupés intelligemment. Utilise si pertinent des amorces comme « Sur l’aspiration », « Sur la cuisson », « Sur le froid », « Côté TV » ou « Sur l’audio », mais seulement pour les thèmes réellement présents.]

### 🎯 Plan d’action / prochain passage
- [2 à 5 actions maximum, uniquement si elles sont sûres et directement reliées aux faits]

[Si photos.total > 0 : **Photos : X au total – Y avant / Z après / N autres.**]

DONNEES_SOURCE :
${source}

EXEMPLE_DE_STYLE_VALIDÉ — STYLE ET ORGANISATION UNIQUEMENT, JAMAIS UNE SOURCE FACTUELLE :
${sample}`;
 }
 if(data.skeleton==='cuisinistes'){
  return `Tu es un Field Merchandising Trainer (FMT) expert des enseignes cuisinistes. Transforme DONNEES_SOURCE en un compte rendu professionnel, analytique mais factuel, destiné à la direction.

RÈGLES ABSOLUES :
- utilise uniquement les faits présents dans DONNEES_SOURCE ;
- n’invente aucun chiffre, contact, cause, performance, marque partenaire, contrat, litige, rendez-vous ou action ;
- corrige la forme, regroupe les informations proches, supprime les doublons et conserve les références / montants / dates exacts ;
- rédige naturellement : ne récite pas les notes et ne montre pas les libellés techniques 6P ;
- pour chaque information attendue mais absente, écris exactement ${PLACEHOLDER} ;
- le plan d’action ne contient que les actions ou suivis réellement saisis ;
- aucun préambule ni bloc de code.

FORMAT STRICT :
# COMPTE RENDU DE VISITE CUISINISTE
**Enseigne :** [Schmidt / Cuisinella] | **Magasin :** [Ville / Point de vente]

### 1. Suivi Magasin
- **Chiffre d’Affaires 2025 / 2026 :** [montants exacts ou ${PLACEHOLDER}]
- **Groupement :** [statut + nombre de magasins ou ${PLACEHOLDER}]
- **Équipe du Magasin :** [propriétaire / directeur / nombre de concepteurs-vendeurs ou ${PLACEHOLDER}]

### 2. Point Produits & Concurrence
- **Performance de la marque :** [faits de vente vs concurrence uniquement]
- **Typologie de produits porteurs :** [familles réellement citées]
- **Marques Partenaires :** [marques + raisons réellement citées]

### 3. Formation
- **Historique Classroom :** [Oui / Non + date + nombre de personnes si disponibles]

### 4. Contrats d’Exposition (Expo)
- **Contrat d’Expo ${PRIMARY_BRAND} :** [Oui avec montant / nombre de produits / temps restant, ou Non avec points bloquants]
- **Contrat Concurrent :** [marque et produits]

### 5. SAV / ADV
- **Litiges en cours :** [détails + statut de résolution FMT / SEF]

### 6. Plan d’Action & Prochaines Étapes
- **Suivi Opérationnel :** [RDV point chiffre / Classroom / accompagnement technique réellement saisi]
- **Statut Négociation Contrat d’Expo :** [RDV programmé + date / RDV effectué en attente retour / signé en attente livraison]

DONNEES_SOURCE :
${source}`;
 }
 return `Tu es un Field Merchandising Trainer (FMT) expert des Buying Groups Gitem et Pro&Cie. Transforme DONNEES_SOURCE en un compte rendu structuré, clair, analytique mais strictement factuel pour la direction.

RÈGLES ABSOLUES :
- utilise uniquement les faits présents dans DONNEES_SOURCE ;
- n’invente aucun chiffre, ancienneté, effectif, performance, motif d’absence, partenaire, formation, litige, perception de Findis ou action ;
- corrige la forme, regroupe les informations proches, supprime les doublons et conserve les références / dates / chiffres exacts ;
- ne récite pas les notes et ne montre pas les libellés techniques 6P ;
- pour chaque information attendue mais absente, écris exactement ${PLACEHOLDER} ;
- le plan d’action ne contient que les engagements ou suivis réellement présents dans la source ;
- aucun préambule ni bloc de code.

FORMAT STRICT :
# COMPTE RENDU DE VISITE BUYING GROUP
**Enseigne :** [Gitem / Pro&Cie] | **Magasin :** [Ville / Point de vente]

### 1. Suivi Magasin & Profil
- **Ancienneté & Effectif :** [temps de détention / nombre de personnes]
- **Santé du magasin :** [faits réellement saisis sur la dynamique commerciale]

### 2. Point Produits & Concurrence
- **Performance SEF & Présence :** [ventes vs concurrence / présence par famille et motifs réellement cités]
- **Typologie & Partenaires :** [familles porteuses / marques partenaires et leviers réellement cités]

### 3. Formation & Newsletter
- **Statut Formation :** [session prévue + date / non + raison réellement citée]
- **Newsletter SEF :** [réception + avis du magasin]

### 4. Écosystème SAV & Technique
- **Système Protechneed :** [magasin informé Oui/Non + formation éventuelle]
- **Valise Haas & SAV :** [utilisation / fonctionnement / relation SAV]
- **Litiges SAV :** [litiges + suivi FMT ou Marc]

### 5. Contexte Marché : Rachat par Findis
- **Perception Terrain :** [assortiment / stock / livraison uniquement si réellement renseignés]

### 6. Plan d’Action
- **PDL & Linéaire :** [suivi réellement prévu]
- **Accompagnement :** [formations produits / Haas / SAV / technique réellement prévues]

DONNEES_SOURCE :
${source}`
}'''

s, n = re.subn(r"function aiPrompt\(data\)\{[\s\S]*?\n\}\nfunction cleanAIText", new_ai_prompt + "\nfunction cleanAIText", s, count=1)
if n != 1:
    raise SystemExit(f"aiPrompt replacement count={n}")

old_validation = "if(skeleton==='grands-magasins'&&!/^Résumé\\s+(BRUN|BLANC)/i.test(generated))throw new Error('format de résumé inattendu');if(skeleton==='grands-magasins'&&!/Formation\\s*\\/\\s*prochain passage/i.test(generated))throw new Error('bloc formation / prochain passage manquant');"
new_validation = "if(skeleton==='grands-magasins'&&!/^(?:⚫|⚪)?\\s*Résumé\\s+(BRUN|BLANC)\\b/i.test(generated))throw new Error('format de résumé inattendu');if(skeleton==='grands-magasins'&&!/(?:Formation|Plan d[’']action)\\s*\\/\\s*prochain passage/i.test(generated))throw new Error('bloc plan d’action / prochain passage manquant');"
if old_validation not in s:
    raise SystemExit("generateAI validation marker not found")
s = s.replace(old_validation, new_validation, 1)
report_path.write_text(s, encoding="utf-8")

# Strengthen existing visit-report tests without adding a new test runner entry.
test_path = Path("tests/visit-report-slack.test.cjs")
t = test_path.read_text(encoding="utf-8")
t = t.replace("assert.ok(prompt.includes('Formation / prochain passage'));", "assert.ok(prompt.includes('Plan d’action / prochain passage'));", 1)
marker = "assert.ok(prompt.includes('PROMOTION, PRIX, PRODUIT, PLACE, PROPRETÉ ou PÉDAGOGIE'));"
if marker not in t:
    raise SystemExit("prompt test marker not found")
t = t.replace(marker, marker + "assert.ok(prompt.includes('hiérarchise'));assert.ok(prompt.includes('références produit, prix, volumes'));assert.ok(prompt.includes('actions explicitement prévues'));assert.ok(prompt.includes('Photos : X au total'));", 1)

merged_marker = "(function ancienne(){"
if merged_marker not in t:
    raise SystemExit("merged test insertion marker not found")
extra = r'''// Les deux trames métier du PDF restent explicites, mais avec les mêmes garde-fous rédactionnels.
(function promptsMetierV222(){
 const cuisiniste=R.aiPrompt({skeleton:'cuisinistes',store:{enseigne:'Schmidt',ville:'Test'},family:'mixte'});
 assert.ok(cuisiniste.includes('Chiffre d’Affaires 2025 / 2026'));
 assert.ok(cuisiniste.includes('Historique Classroom'));
 assert.ok(cuisiniste.includes('Contrat d’Expo'));
 assert.ok(cuisiniste.includes('SAV / ADV'));
 assert.ok(cuisiniste.includes('n’invente aucun chiffre'));
 const buying=R.aiPrompt({skeleton:'buying-groups',store:{enseigne:'Gitem',ville:'Test'},family:'mixte'});
 assert.ok(buying.includes('Protechneed'));
 assert.ok(buying.includes('Valise Haas'));
 assert.ok(buying.includes('Rachat par Findis'));
 assert.ok(buying.includes('PDL & Linéaire'));
 assert.ok(buying.includes('n’invente aucun chiffre'));
})();

'''
t = t.replace(merged_marker, extra + merged_marker, 1)
test_path.write_text(t, encoding="utf-8")

# PWA/build revision bump.
index_path = Path("index.html")
idx = index_path.read_text(encoding="utf-8")
count = idx.count(OLD_REV)
if count < 3:
    raise SystemExit(f"index revision occurrences unexpectedly low: {count}")
index_path.write_text(idx.replace(OLD_REV, NEW_REV), encoding="utf-8")

sw_path = Path("sw.js")
sw = sw_path.read_text(encoding="utf-8")
if OLD_REV not in sw:
    raise SystemExit("sw revision not found")
sw_path.write_text(sw.replace(OLD_REV, NEW_REV), encoding="utf-8")

version_path = Path("version.json")
version = json.loads(version_path.read_text(encoding="utf-8"))
version.update({"latestBuild": NEW_REV, "displayVersion": "222", "channel": "stable", "releasedAt": "2026-09-18"})
version_path.write_text(json.dumps(version, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

print("V222 patch applied")
