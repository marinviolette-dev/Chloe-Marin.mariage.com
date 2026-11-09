import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function reply(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === "," && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell.trim());
      if (row.some((v) => v !== "")) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  row.push(cell.trim());
  if (row.some((v) => v !== "")) rows.push(row);
  return rows;
}

function codeOf(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, "").toUpperCase();
}

function asNumber(value: string) {
  const n = Number(String(value ?? "").replace(",", ".").trim());
  return Number.isFinite(n) ? n : 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply({ error: "Méthode non autorisée." }, 405);

  try {
    const expectedPassword = Deno.env.get("ADMIN_DASHBOARD_PASSWORD");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const csvUrl = Deno.env.get("GUEST_SHEET_CSV_URL");

    if (!expectedPassword || !supabaseUrl || !serviceKey || !csvUrl) {
      throw new Error("Configuration administrateur incomplète dans les secrets Supabase.");
    }

    const body = await req.json();
    if (typeof body.password !== "string" || body.password !== expectedPassword) {
      return reply({ error: "Mot de passe administrateur incorrect." }, 401);
    }
    if (body.action !== "refresh") {
      return reply({ error: "Action inconnue." }, 400);
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // Synchronisation de la liste d'invités depuis Google Sheets.
    const csvResponse = await fetch(
      csvUrl + (csvUrl.includes("?") ? "&" : "?") + "t=" + Date.now(),
      { cache: "no-store" },
    );
    if (!csvResponse.ok) throw new Error("Impossible de lire le Google Sheets.");

    const rows = parseCSV(await csvResponse.text());
    const uniqueGuests = new Map<string, {
      first_name: string; last_name: string; invite_code: string; max_guests: number;
    }>();

    // A = nom/famille, B = prénom, G = adultes, H = enfants, I = code.
    for (const row of rows) {
      const inviteCode = codeOf(row[8]);
      if (!inviteCode) continue;
      const maxGuests = asNumber(row[6] || "0") + asNumber(row[7] || "0");
      uniqueGuests.set(inviteCode, {
        first_name: row[1] || row[0] || "Invité",
        last_name: row[0] || "Famille",
        invite_code: inviteCode,
        max_guests: maxGuests,
      });
    }

    const guestsToSync = [...uniqueGuests.values()];
    if (guestsToSync.length) {
      const { error: syncError } = await supabase
        .from("guests")
        .upsert(guestsToSync, { onConflict: "invite_code" });
      if (syncError) {
        throw new Error(
          `Synchronisation guests impossible : ${syncError.message}. Vérifie qu'un index UNIQUE existe sur guests.invite_code.`,
        );
      }
    }

    const { data: guests, error: guestsError } = await supabase
      .from("guests")
      .select("id, first_name, last_name, invite_code, max_guests")
      .order("last_name", { ascending: true });
    if (guestsError) throw guestsError;

    const { data: rsvps, error: rsvpError } = await supabase
      .from("rsvps")
      .select("guest_id, invite_code, attendance, people_count, companions, diet, updated_at");
    if (rsvpError) throw rsvpError;

    const byGuestId = new Map((rsvps || []).map((r) => [r.guest_id, r]));
    const result = (guests || []).map((g) => {
      const r = byGuestId.get(g.id);
      return {
        ...g,
        attendance: r?.attendance ?? null,
        people_count: r?.people_count ?? null,
        companions: r?.companions ?? null,
        diet: r?.diet ?? null,
        updated_at: r?.updated_at ?? null,
      };
    });

    const answered = result.filter((g) => g.attendance === "yes" || g.attendance === "no");
    const accepted = result.filter((g) => g.attendance === "yes");
    const declined = result.filter((g) => g.attendance === "no");

    return reply({
      success: true,
      guests: result,
      stats: {
        totalGuests: result.length,
        answered: answered.length,
        pending: result.length - answered.length,
        accepted: accepted.length,
        declined: declined.length,
        people: accepted.reduce((sum, g) => sum + Number(g.people_count || 0), 0),
      },
    });
  } catch (error) {
    console.error("ADMIN DASHBOARD ERROR:", error);
    return reply({
      error: error instanceof Error ? error.message : "Erreur serveur.",
    }, 500);
  }
});
