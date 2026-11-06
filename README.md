# Chloé & Marin — site de mariage

## Stack

- Frontend : HTML / CSS / JavaScript
- Hébergement : GitHub Pages
- Domaine : `https://chloeetmarin.fr`
- Base de données + stockage : Supabase
- Liste invités : Google Sheets publié en CSV
- Photos : Supabase Storage

## 1. Mettre le site sur GitHub

Crée un repository GitHub, puis dépose le contenu de ce dossier à la racine.

GitHub > Settings > Pages > Build and deployment > Source: GitHub Actions ou Deploy from branch.

Pour une configuration simple : `main` + `/ (root)`.

## 2. Domaine chloeetmarin.fr

Le domaine doit être acheté et géré chez un registrar/DNS.

Dans GitHub Pages, ajoute :
`chloeetmarin.fr`

Puis configure les DNS indiqués par GitHub chez ton registrar.

Le HTTPS est ensuite fourni par GitHub Pages après validation du domaine.

## 3. Google Sheets pour les invités

Utilise Google Sheets plutôt qu'un Google Doc.

Colonnes minimales :

| firstName | lastName | inviteCode | maxGuests |
|---|---|---|---:|
| Jean | Dupont | CM-1234 | 2 |
| Marie | Martin | CM-5688 | 1 |

Publie uniquement la feuille utile en CSV :

Google Sheets > Fichier > Partager > Publier sur le Web > Feuille > CSV.

Copie l'URL dans `config.js`.

### Important

Le CSV publié est lisible publiquement. Ne mets donc aucune donnée sensible dedans.

Le code d'invitation est recommandé pour éviter qu'une personne connaissant simplement un nom puisse accéder à une invitation.

## 4. Supabase — configuration gratuite

Créer un projet sur Supabase.

Dans Supabase :
- Project Settings > API
- copie l'URL du projet dans `config.js`
- copie la clé ANON/PUBLISHABLE dans `config.js`

NE COPIE JAMAIS la clé `service_role` dans le site GitHub.

### Tables

Créer une table `guests` :

- `id` uuid primary key
- `first_name` text
- `last_name` text
- `invite_code` text unique
- `max_guests` integer
- `created_at` timestamptz default now()

Créer une table `rsvps` :

- `id` uuid primary key
- `guest_id` uuid references guests(id)
- `attendance` text
- `people_count` integer
- `companions` text
- `diet` text
- `created_at` timestamptz default now()
- `updated_at` timestamptz default now()

Créer un bucket Storage :
`wedding-photos`

Pour les photos, prévoir des chemins du type :
`guest/<guest_id>/<uuid>-photo.jpg`

La limite de 23 photos doit être contrôlée côté serveur, pas uniquement dans le navigateur.

## 5. RSVP sécurisé

La version de base utilise `rsvpEndpoint` dans `config.js`.

Créer une Supabase Edge Function :
`save-rsvp`

Elle reçoit :
```json
{
  "inviteCode": "CM-1234",
  "attendance": "yes",
  "peopleCount": 2,
  "companions": "Prénom Nom",
  "diet": "Sans gluten"
}
```

La fonction doit :
1. retrouver l'invité avec `invite_code`;
2. vérifier `peopleCount <= max_guests`;
3. insérer ou mettre à jour le RSVP;
4. ne jamais exposer une clé secrète au navigateur.

## 6. Photos

Le frontend prévoit 23 photos maximum par personne.

Pour une vraie mise en production :
- vérifier le nombre de photos déjà enregistrées côté serveur;
- refuser toute nouvelle photo au-delà de 23;
- limiter les types MIME;
- limiter la taille maximale d'une photo;
- utiliser les politiques Supabase Storage/RLS.

## 7. Personnalisation

Modifier :
- `config.js` pour les réglages ;
- les fichiers HTML pour les textes ;
- `style.css` pour le design ;
- `assets/` pour les photos/logos.

## 8. Avant ouverture aux invités

Tester :
- un invité à 1 personne ;
- un invité à 2 personnes ;
- un invité à 4 personnes ;
- un mauvais code ;
- un RSVP ;
- un RSVP modifié ;
- 23 photos ;
- tentative de 24e photo ;
- accès mobile ;
- domaine HTTPS.
