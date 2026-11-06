/*
  CHLOÉ & MARIN — CONFIG
  GitHub Pages + Supabase + Google Sheets

  IMPORTANT:
  - Only put the Supabase ANON/PUBLISHABLE key here.
  - NEVER put a service_role/secret key in this file.
*/
window.MARRIAGE_CONFIG = {
  couple: {
    firstName: "Chloé",
    secondName: "Marin",
    year: "2027",
    domain: "https://chloeetmarin.fr"
  },

  // Google Sheets > File > Share > Publish to web > CSV.
  // Recommended columns:
  // firstName,lastName,inviteCode,maxGuests
  guestSheetCsvUrl: "https://docs.google.com/spreadsheets/d/REMPLACE_ID/export?format=csv",

  supabase: {
    url: "https://REMPLACE_PROJECT.supabase.co",
    anonKey: "REMPLACE_ANON_OR_PUBLISHABLE_KEY",
    bucket: "wedding-photos"
  },

  // Supabase Edge Function URL for RSVP writes.
  // Example:
  // https://REMPLACE_PROJECT.supabase.co/functions/v1/save-rsvp
  rsvpEndpoint: "https://REMPLACE_PROJECT.supabase.co/functions/v1/save-rsvp"
};
