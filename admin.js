(() => {
  "use strict";

  const config = window.MARRIAGE_CONFIG || {};
  const supabase = config.supabase || {};
  const endpoint = `${String(supabase.url || "").replace(/\/$/, "")}/functions/v1/admin-dashboard`;
  const anonKey = supabase.anonKey;

  const $ = (id) => document.getElementById(id);
  const state = { password: "", guests: [], stats: null };

  const loginSection = $("login");
  const dashboardSection = $("dashboard");

  function message(target, text, kind = "muted") {
    target.textContent = text;
    target.className = kind;
  }

  async function callAdmin(action) {
    if (!endpoint.startsWith("https://") || !anonKey) {
      throw new Error("La configuration Supabase de config.js est incomplète.");
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": anonKey,
        "Authorization": `Bearer ${anonKey}`
      },
      body: JSON.stringify({ password: state.password, action })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.error) {
      throw new Error(payload.error || `Erreur serveur (${response.status}).`);
    }
    return payload;
  }

  function showDashboard() {
    loginSection.hidden = true;
    dashboardSection.hidden = false;
  }

  function showLogin() {
    dashboardSection.hidden = true;
    loginSection.hidden = false;
  }

  function render(data) {
    state.guests = data.guests || [];
    state.stats = data.stats || {};

    $("total-guests").textContent = state.stats.totalGuests ?? 0;
    $("answered").textContent = state.stats.answered ?? 0;
    $("pending").textContent = state.stats.pending ?? 0;
    $("accepted").textContent = state.stats.accepted ?? 0;
    $("declined").textContent = state.stats.declined ?? 0;
    $("people").textContent = state.stats.people ?? 0;

    $("last-updated").textContent = `Mis à jour le ${new Date().toLocaleString("fr-FR")}`;
    $("dashboard-message").textContent = `${state.guests.length} invitation(s) affichée(s).`;
    renderRows();
  }

  function renderRows() {
    const query = $("search").value.trim().toLocaleLowerCase("fr");
    const filtered = state.guests.filter((guest) => {
      const text = [
        guest.first_name, guest.last_name, guest.invite_code,
        guest.companions, guest.diet
      ].join(" ").toLocaleLowerCase("fr");
      return text.includes(query);
    });

    const tbody = $("guest-rows");
    tbody.replaceChildren();

    for (const guest of filtered) {
      const tr = document.createElement("tr");
      const attendance = guest.attendance;
      const statusClass = attendance === "yes" ? "yes" : attendance === "no" ? "no" : "pending";
      const statusText = attendance === "yes" ? "Présent" : attendance === "no" ? "Absent" : "En attente";
      const values = [
        `${guest.first_name || ""} ${guest.last_name || ""}`.trim(),
        guest.invite_code || "",
        guest.max_guests ?? "",
        statusText,
        attendance === "yes" ? (guest.people_count ?? 0) : (attendance === "no" ? "0" : "—"),
        guest.companions || "—",
        guest.diet || "—",
        guest.updated_at ? new Date(guest.updated_at).toLocaleDateString("fr-FR") : "—"
      ];

      values.forEach((value, index) => {
        const td = document.createElement("td");
        if (index === 3) {
          const badge = document.createElement("span");
          badge.className = `status ${statusClass}`;
          badge.textContent = value;
          td.appendChild(badge);
        } else {
          td.textContent = String(value);
        }
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    }

    if (!filtered.length) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 8;
      td.textContent = "Aucun invité ne correspond à cette recherche.";
      tr.appendChild(td);
      tbody.appendChild(tr);
    }
  }

  async function loadDashboard() {
    $("refresh-button").disabled = true;
    message($("dashboard-message"), "Synchronisation avec Google Sheets et chargement…");
    try {
      // L'action refresh importe/actualise aussi les invités depuis la feuille.
      const data = await callAdmin("refresh");
      render(data);
      message($("dashboard-message"), "Liste synchronisée avec Google Sheets.", "success");
    } catch (error) {
      message($("dashboard-message"), error.message, "error");
    } finally {
      $("refresh-button").disabled = false;
    }
  }

  $("login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    state.password = $("admin-password").value;
    message($("login-message"), "Vérification…");
    try {
      const data = await callAdmin("refresh");
      showDashboard();
      render(data);
      $("admin-password").value = "";
      message($("dashboard-message"), "Connexion réussie. Liste synchronisée.", "success");
    } catch (error) {
      state.password = "";
      message($("login-message"), error.message, "error");
    }
  });

  $("refresh-button").addEventListener("click", loadDashboard);
  $("search").addEventListener("input", renderRows);

  $("logout-button").addEventListener("click", () => {
    state.password = "";
    state.guests = [];
    state.stats = null;
    $("guest-rows").replaceChildren();
    showLogin();
    message($("login-message"), "Vous êtes déconnecté.");
  });

  $("export-button").addEventListener("click", () => {
    const headers = ["Prénom", "Nom", "Code", "Quota", "Réponse", "Personnes", "Accompagnants", "Informations alimentaires", "Date réponse"];
    const rows = state.guests.map((g) => [
      g.first_name, g.last_name, g.invite_code, g.max_guests,
      g.attendance === "yes" ? "Présent" : g.attendance === "no" ? "Absent" : "En attente",
      g.people_count ?? "", g.companions ?? "", g.diet ?? "", g.updated_at ?? ""
    ]);
    const csv = [headers, ...rows].map((row) =>
      row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(";")
    ).join("\r\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "confirmations-chloe-marin.csv";
    link.click();
    URL.revokeObjectURL(url);
  });
})();
