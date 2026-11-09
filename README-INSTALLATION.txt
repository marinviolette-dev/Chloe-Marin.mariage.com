# Tableau de bord organisateurs — Chloé & Marin

Ce pack ajoute une page `admin.html` privée par mot de passe et une Edge Function `admin-dashboard`.

## Fichiers à copier dans le dépôt GitHub Pages

Copier à la racine du site :
- `admin.html`
- `admin.js`

Le fichier `admin.html` charge le `config.js` déjà présent dans le site. Ne remplacez pas votre `config.js`.

## Déployer la fonction Supabase

Dans Supabase > Edge Functions, créez une nouvelle fonction nommée exactement `admin-dashboard`.
Remplacez son code par le contenu de `supabase/functions/admin-dashboard/index.ts`, puis déployez.

La fonction utilise les secrets automatiques `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY`, ainsi que le secret existant `GUEST_SHEET_CSV_URL`.

## Ajouter le mot de passe administrateur

Dans Supabase > Edge Functions > Secrets (ou Project Settings > Edge Functions > Secrets), ajoutez :

- Name : `ADMIN_DASHBOARD_PASSWORD`
- Value : un mot de passe long et unique que vous choisissez.

Ne mettez jamais ce mot de passe dans `config.js`, `admin.js` ou dans GitHub.

## Vérifier l'index unique des codes invités

La synchronisation utilise `upsert(..., onConflict: "invite_code")`. La colonne `guests.invite_code` doit donc avoir une contrainte ou un index UNIQUE.

Dans SQL Editor, vérifiez d'abord :

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'guests';
```

S'il n'existe pas d'index UNIQUE sur `invite_code`, exécutez :

```sql
CREATE UNIQUE INDEX guests_invite_code_key
ON public.guests (invite_code);
```

Si cette commande échoue à cause de doublons, ne supprimez aucune ligne : il faudra examiner les doublons avant de continuer.

## Utilisation

Après publication GitHub Pages, ouvrez :

`https://marinviolette-dev.github.io/Chloe-Marin.mariage.com/admin.html`

Saisissez le mot de passe administrateur. À chaque connexion ou clic sur « Actualiser », la fonction synchronise les invités depuis Google Sheets puis rapproche leurs RSVP.

La page permet de rechercher les invités et d'exporter les réponses au format CSV compatible Excel.

## Sécurité et limites

- Le mot de passe est vérifié côté serveur par l'Edge Function.
- La clé `service_role` n'est jamais envoyée au navigateur.
- La page utilise la clé publique déjà présente dans `config.js`.
- Choisissez un mot de passe long, ne le partagez pas et ne le publiez pas.
- Pour une sécurité renforcée à long terme, remplacez le mot de passe partagé par Supabase Auth avec un compte organisateur.
