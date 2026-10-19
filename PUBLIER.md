# Publier DefiMemory sur l'App Store et Google Play

Le projet est prêt. Il contient le jeu, l'icône, l'écran de démarrage, les captures d'écran, les textes des fiches, la politique de confidentialité et la compilation automatique.
Vous n'avez **pas besoin de Mac** : **Codemagic** compile l'application iPhone et l'application Android pour vous, en ligne.

## Contenu du dossier

| Dossier / fichier | Rôle |
|---|---|
| `www/` | Le jeu (fonctionne sans Internet) |
| `android/`, `ios/` | Les projets natifs Android et iPhone (déjà configurés, icônes incluses) |
| `codemagic.yaml` | La recette de compilation automatique pour Codemagic |
| `store/FICHES-STORES.md` | Les textes à copier-coller dans les stores |
| `store/screenshots/` | Les captures d'écran (iPhone et Android) |
| `store/play-icon-512.png`, `store/play-feature-graphic-1024x500.png` | Les images demandées par Google Play |
| `docs/` | La page d'assistance et la politique de confidentialité (à mettre en ligne) |
| `secrets/` | **La clé de signature Android, à garder précieusement.** Ce dossier n'est jamais envoyé sur GitHub. |

Identifiant de l'application : **`com.defimemory.app`**. Il ne pourra plus changer après la première publication.

---

## Ce qu'il faut payer

| Compte | Prix | Délai |
|---|---|---|
| Apple Developer Program | 99 $ par an | 1 à 2 jours de validation |
| Google Play Console | 25 $ une seule fois | quelques jours (vérification d'identité) |
| GitHub et Codemagic | gratuits (Codemagic offre 500 minutes de compilation par mois) | immédiat |

Créez dès maintenant les deux comptes payants, car leur validation prend du temps :
- Apple : https://developer.apple.com/programs/enroll/
- Google : https://play.google.com/console/signup

---

## Étape 1 : mettre le projet sur GitHub

1. Créez un compte sur https://github.com.
2. Créez un dépôt **privé** nommé `defimemory`, vide (sans README).
3. Envoyez-y le projet. Le plus simple est **GitHub Desktop** (https://desktop.github.com) : *File > Add local repository*, choisissez le dossier `defimemory`, puis *Publish*.
   Le dossier `secrets/` et `node_modules/` sont exclus automatiquement.

> Vous pouvez aussi me donner le nom du dépôt vide : je peux y envoyer le projet directement.

## Étape 2 : mettre en ligne la page de confidentialité

Les deux stores exigent une adresse web pour la politique de confidentialité.

1. Ouvrez `docs/confidentialite.html` et `docs/index.html`, puis remplacez `VOTRE-ADRESSE-EMAIL` par l'adresse de contact que vous voulez afficher publiquement.
2. Sur GitHub, ouvrez le dépôt, puis *Settings > Pages*. Dans *Source*, choisissez la branche **main** et le dossier **/docs**, puis cliquez sur *Save*.
   GitHub Pages n'est gratuit que pour un dépôt public. Si votre dépôt est privé, créez un second dépôt **public** `defimemory-site` qui ne contient que les 2 fichiers de `docs/`.
3. Après une minute, vos pages sont en ligne :
   - Assistance : `https://<votre-pseudo>.github.io/defimemory/`
   - Confidentialité : `https://<votre-pseudo>.github.io/defimemory/confidentialite.html`

## Étape 3 : relier Codemagic

1. Allez sur https://codemagic.io et connectez-vous avec GitHub.
2. Cliquez sur *Add application*, choisissez le dépôt `defimemory`, puis le type de projet **Capacitor / Ionic** ou *Other*.
3. Codemagic trouve tout seul le fichier `codemagic.yaml`, qui contient les deux recettes : **Android (Google Play)** et **iOS (App Store)**.

---

## Étape 4 : Google Play (Android)

### 4a. Donner la clé de signature à Codemagic
1. Dans Codemagic, ouvrez *Teams > Code signing identities > Android keystores*, puis *Add keystore*.
2. Envoyez le fichier `secrets/defimemory-upload.jks`.
3. Recopiez les mots de passe et l'alias qui se trouvent dans `secrets/CLE-ANDROID-A-GARDER.txt`.
4. Comme nom de référence, tapez exactement : **`defimemory_keystore`**.

### 4b. Compiler
Dans Codemagic, cliquez sur *Start new build* et choisissez la recette **Android (Google Play)**. Après environ 10 minutes, téléchargez le fichier **`app-release.aab`** dans les *Artifacts*.

### 4c. Créer l'application dans la Play Console
1. Cliquez sur *Créer une application* : nom **DefiMemory**, langue Français, type **Jeu**, **Gratuit**.
2. Dans le *Tableau de bord*, remplissez chaque section avec les réponses de `store/FICHES-STORES.md` : confidentialité, annonces, classification, public cible, sécurité des données, fiche du Play Store, images et captures.
3. Acceptez **Play App Signing** : Google garde la clé finale, et la vôtre ne sert qu'à envoyer les mises à jour.

### 4d. Test fermé obligatoire
Un **compte personnel** créé récemment doit d'abord faire un **test fermé avec au moins 12 testeurs pendant 14 jours d'affilée** avant de pouvoir publier pour tout le monde.
1. Ouvrez *Tests > Test fermé*, créez une version et envoyez-y le fichier `.aab`.
2. Ajoutez au moins 12 adresses Gmail (famille, amis). Chacun accepte l'invitation et installe le jeu.
3. Au bout de 14 jours, demandez l'accès à la **Production**, envoyez le même `.aab` (ou un plus récent), puis cliquez sur *Envoyer pour examen*.

Si vous avez un compte **organisation** (entreprise), ce test n'est pas obligatoire : vous pouvez publier directement en Production.

---

## Étape 5 : App Store (iPhone)

### 5a. Enregistrer l'identifiant de l'app
Sur https://developer.apple.com/account/resources/identifiers, cliquez sur **+**, choisissez *App IDs > App*, puis remplissez :
- Description : `DefiMemory`
- Bundle ID (Explicit) : **`com.defimemory.app`**

Laissez les capacités par défaut, puis cliquez sur *Register*.

### 5b. Créer la fiche dans App Store Connect
1. Ouvrez https://appstoreconnect.apple.com > *Apps* > **+** > *Nouvelle app*.
2. Remplissez : plateforme iOS, nom **DefiMemory**, langue Français, bundle ID `com.defimemory.app`, SKU `defimemory`.
3. Dans *Informations sur l'app*, notez l'**Identifiant Apple**, un nombre d'environ 10 chiffres.

### 5c. Créer une clé API pour Codemagic
1. Dans App Store Connect, ouvrez *Utilisateurs et accès > Intégrations > App Store Connect API*, puis cliquez sur **+**.
2. Nommez la clé `Codemagic`, avec le rôle **App Manager**. Téléchargez le fichier `.p8` : il n'est téléchargeable qu'une seule fois. Notez aussi l'*Issuer ID* et le *Key ID*.
3. Dans Codemagic, ouvrez *Teams > Integrations > Developer Portal*, puis *Connect*. Collez l'Issuer ID et le Key ID, envoyez le fichier `.p8`, et donnez comme nom exactement : **`DefiMemory`**.

### 5d. Indiquer l'identifiant de l'app
Dans `codemagic.yaml`, remplacez `0000000000` par l'Identifiant Apple de l'étape 5b, puis enregistrez le changement sur GitHub.

### 5e. Compiler et envoyer
Dans Codemagic, cliquez sur *Start new build* et choisissez la recette **iOS (App Store)**. Codemagic crée seul les certificats, compile l'application et l'envoie sur **TestFlight**, en 15 à 20 minutes environ.
Vous pouvez alors installer l'application TestFlight sur votre iPhone pour essayer le jeu.

### 5f. Soumettre à Apple
Dans App Store Connect, ouvrez la version 1.0.0 et remplissez :
- les textes, les mots-clés, les URL et les captures (`store/screenshots/iphone/`) ;
- *Confidentialité de l'app* : « Aucune donnée collectée » ;
- *Classification par âge* : « Aucun » partout, ce qui donne 4+ ;
- *Build* : choisissez la version envoyée par Codemagic ;
- *Tarifs* : Gratuit, dans tous les pays.

Cliquez ensuite sur **Ajouter pour vérification**, puis sur **Soumettre**. La réponse arrive en général en 1 à 3 jours.

---

## Version web installable
Le jeu est aussi publié sur **https://mohamedalimrabet.github.io/defimemory/jouer/** (GitHub Pages, dossier `docs/jouer/`).
Sur téléphone, il s'installe comme une application (« Ajouter à l'écran d'accueil ») et fonctionne sans Internet.
Après chaque modification de `www/`, lancez `npm run web` pour mettre à jour `docs/jouer/`, puis enregistrez sur GitHub.

## Publier une mise à jour plus tard
1. Modifiez le jeu dans `www/index.html`, puis lancez `npm run web` pour la version web.
2. Augmentez la version, par exemple `1.0.0` → `1.1.0` :
   - Android : `versionName` dans `android/app/build.gradle` ;
   - iPhone : `MARKETING_VERSION` dans `ios/App/App.xcodeproj/project.pbxproj` (2 lignes).
3. Enregistrez les changements sur GitHub, puis relancez les deux recettes dans Codemagic. Le numéro de build augmente tout seul.

## En cas de refus
- **Apple, règle 4.2 (« fonctionnalité minimale »)** : répondez dans le *Resolution Center* que DefiMemory est un jeu complet qui fonctionne hors ligne, avec 5 niveaux, des sons, des vibrations, une progression et des records. Ajouter du contenu, comme des thèmes de cartes, aide aussi.
- **Google, nom ou icône** : vérifiez que « DefiMemory » n'est pas déjà utilisé par une autre application.

## Jeu en ligne (Firebase)
Le mode « En ligne » utilise le projet Firebase **defimemory** (Realtime Database en Europe, connexion anonyme).
La configuration est dans `www/online.js`. Les **règles de sécurité** à coller dans la console sont dans `firebase/database.rules.json` :
Firebase > Realtime Database > onglet **Règles** > remplacer tout le texte > **Publier**.
Sans ces règles (mode verrouillé), le jeu en ligne affiche « Connexion impossible ».
