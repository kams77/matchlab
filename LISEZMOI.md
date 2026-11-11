# Matchlab — application Android

Application d'analyse des cartons, corners et buts en 2e mi-temps.
Elle télécharge elle-même les championnats (football-data.co.uk) et le calendrier des matchs à venir.

## Obtenir l'APK sans ordinateur (GitHub, gratuit)

1. Créez un compte sur github.com.
2. Créez un nouveau dépôt (bouton « New »), par exemple `matchlab`.
3. Dans le dépôt : « Add file » → « Upload files », puis déposez **tout le contenu** de ce dossier
   (y compris le dossier caché `.github`). Validez avec « Commit changes ».
4. Ouvrez l'onglet « Actions » : la compilation démarre seule (5 à 8 minutes).
5. Quand le cercle devient vert, ouvrez l'exécution et téléchargez l'artefact **Matchlab-APK** (un ZIP).
6. Décompressez-le : `app-debug.apk` est l'application. Installez-la sur le téléphone
   (autorisez l'installation d'applications de source inconnue).

## Avec Android Studio

Ouvrez ce dossier dans Android Studio, laissez la synchronisation se terminer,
puis « Build » → « Build APK(s) ».

## Fonctionnement

- Au premier lancement, l'application télécharge 3 saisons des championnats cochés,
  puis les met à jour à chaque ouverture si les données ont plus de 6 heures.
- Onglet « Données » : choix des championnats et mise à jour manuelle.
- Le seul site contacté est www.football-data.co.uk.

## Modifier l'application

Les sources de la page sont dans `web/` (`head.html`, `engine.js`, `ui.js`).
Après modification, lancez `python3 web/build.py` : il régénère `app/src/main/assets/index.html`.
Chaque envoi sur GitHub compile et publie un nouvel APK dans « Releases ».
