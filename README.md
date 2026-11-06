# Chloé & Marin — site mariage V3

## Architecture

- GitHub Pages : hébergement statique gratuit pour un dépôt public.
- Google Sheets : liste des invités.
- Supabase : RSVP + stockage privé des photos.
- Aucun mot de passe ni service_role n'est placé dans le navigateur.

## 1. Google Sheets

La feuille utilisée est celle du mariage.

Colonnes attendues :
- B : nom
- G : nombre maximum d'adultes / invités
- H : nombre d'enfants
- I : identifiant de connexion personnalisé

Le maximum affiché et contrôlé est `G + H`.

Le CSV utilisé par le site est configuré dans `config.js`.

La feuille doit être publiée/accessible en lecture via le lien CSV.

## 2. GitHub Pages

Le dépôt doit être public avec GitHub Free.

GitHub :
Settings > Pages > Build and deployment > Source: Deploy from a branch
Branch: main
Folder: / (root)

L'adresse sera :
https://VOTRE-PSEUDO.github.io/NOM-DU-REPO/

## 3. Supabase

Créer un projet sur https://supabase.com/

Dans SQL Editor, exécuter `supabase_schema.sql`.

Créer/laisser le bucket privé `wedding-photos`.

### Déployer les Edge Functions

Installer Supabase CLI puis, dans ce dossier :

supabase login
supabase link --project-ref VOTRE_PROJECT_REF

Définir les secrets :
supabase secrets set GUEST_SHEET_CSV_URL="https://docs.google.com/spreadsheets/d/12gbTMlem0s8YRrA3MKDIOTfgRaKYHh8uJffcl4UwgmI/export?format=csv&gid=0"

Déployer :
supabase functions deploy save-rsvp
supabase functions deploy photo-session
supabase functions deploy photo-list

Les fonctions utilisent automatiquement SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY fournis par Supabase dans l'environnement Edge Function.

## 4. config.js

Remplacer seulement :
- REMPLACE_PROJECT_URL
- REMPLACE_PUBLISHABLE_OR_ANON_KEY

Ne jamais mettre `service_role` dans config.js.

## 5. Limite photos

La limite de 23 est contrôlée :
- dans l'interface,
- et surtout côté Edge Function avant création des uploads signés.

Le bucket est privé. Les photos sont servies avec des URLs signées temporaires.

## 6. QR codes

Tous les QR codes peuvent pointer vers la même URL GitHub Pages.

L'identifiant personnel de la colonne I est ensuite saisi par l'invité.

## 7. Avant d'envoyer les invitations

Tester :
1. connexion avec un identifiant réel ;
2. RSVP à 1 personne ;
3. tentative au-dessus de G+H ;
4. modification d'un RSVP ;
5. upload de 1 photo ;
6. upload jusqu'à 23 ;
7. tentative de 24e photo ;
8. affichage des photos ;
9. déconnexion ;
10. test mobile.
