# Passage Google OAuth en External / production

Ce document prépare le projet Store Runner pour rendre la connexion Google Agenda utilisable par des comptes autres que les testeurs OAuth.

## URLs publiques à utiliser dans Google Auth Platform

- **Nom de l'application** : `Store Runner`
- **Page d'accueil de l'application** : `https://rednewt69.github.io/Chef-Secteur/oauth-home.html`
- **Politique de confidentialité** : `https://rednewt69.github.io/Chef-Secteur/privacy.html`
- **Conditions d'utilisation** : `https://rednewt69.github.io/Chef-Secteur/terms.html`
- **Domaine autorisé** : `rednewt69.github.io`
- **Origine JavaScript autorisée du client Web** : `https://rednewt69.github.io`
- **URL de l'application** : `https://rednewt69.github.io/Chef-Secteur/`

Le Client ID utilisé par l'application reste celui déjà déclaré dans `calendar-oauth.js`. Aucun secret client ne doit être ajouté au dépôt ou au navigateur.

## Accès Google réellement utilisé

Store Runner lit Google Agenda afin de récupérer :

- la liste des agendas auxquels l'utilisateur est abonné ;
- les événements de ces agendas sur la période de planning ;
- titre, localisation, dates/heures, statut et caractère « toute la journée » utiles à la détection des indisponibilités.

Le code actuel demande le scope en lecture seule :

`https://www.googleapis.com/auth/calendar.readonly`

Ne pas ajouter de scope d'écriture (`calendar`, `calendar.events`, `calendar.calendarlist`) tant qu'aucune fonction métier n'en a besoin.

## Préparation déjà faite dans le dépôt

- page publique décrivant clairement l'application et la fonction Google Agenda ;
- politique de confidentialité publique ;
- conditions d'utilisation publiques ;
- information de confidentialité visible dans l'interface Google Agenda ;
- jetons OAuth limités à la session et exclus des sauvegardes ;
- détails Google Agenda exclus du contexte envoyé à l'assistant IA en ligne ;
- tests de non-régression dédiés.

## Étapes à faire dans Google Cloud / Google Auth Platform

1. Ouvrir le projet Google Cloud qui contient le client OAuth de Store Runner.
2. Dans **Google Auth Platform > Branding**, renseigner le nom Store Runner, l'adresse e-mail d'assistance du projet et les trois URLs publiques ci-dessus.
3. Dans **Audience**, choisir **External**.
4. Ajouter `rednewt69.github.io` aux domaines autorisés.
5. Vérifier la propriété de `rednewt69.github.io` avec le même compte Google dans Google Search Console si Google le demande. Si Search Console fournit un fichier ou une balise de validation, l'ajouter au dépôt avant la soumission.
6. Dans **Data Access**, conserver uniquement le scope Calendar en lecture seule réellement utilisé.
7. Dans **Clients**, vérifier que le client Web autorise l'origine JavaScript `https://rednewt69.github.io`.
8. Tester la connexion avec un compte figurant déjà parmi les testeurs.
9. Passer l'application en **In production / Publish app**.
10. Si Google demande une vérification du scope sensible, soumettre l'application à la vérification en utilisant la page d'accueil, la politique de confidentialité et les conditions publiées ci-dessus.
11. Après publication, tester avec un compte Google qui n'a jamais été ajouté comme testeur.

## Ce qui ne peut pas être automatisé depuis le dépôt

Le changement `Testing -> External/In production`, l'adresse e-mail d'assistance, la validation de propriété Search Console et l'envoi du dossier de vérification doivent être effectués dans le compte Google propriétaire du projet. Le dépôt est préparé pour que ces étapes ne nécessitent pas de nouvelle modification de l'application, sauf éventuel fichier/balise de validation demandé par Google.
