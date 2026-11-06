window.MarriageApp = (() => {
  const C = window.MARRIAGE_CONFIG;
  const SESSION_KEY = "chloe-marin-guest";

  function normalize(value) {
    return String(value ?? "").trim().toLowerCase();
  }

  function parseCSVLine(line) {
    const result = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const next = line[i + 1];

      if (char === '"' && inQuotes && next === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        result.push(current);
        current = "";
      } else {
        current += char;
      }
    }

    result.push(current);
    return result;
  }

  function parseCSV(csv) {
    const rows = [];
    let row = [];
    let cell = "";
    let quoted = false;

    for (let i = 0; i < csv.length; i++) {
      const char = csv[i];
      const next = csv[i + 1];

      if (char === '"' && quoted && next === '"') {
        cell += '"';
        i++;
      } else if (char === '"') {
        quoted = !quoted;
      } else if ((char === "\n" || char === "\r") && !quoted) {
        if (char === "\r" && next === "\n") i++;

        row.push(cell);
        cell = "";

        if (row.some((value) => value.trim() !== "")) {
          rows.push(row);
        }

        row = [];
      } else {
        cell += char;
      }
    }

    if (cell !== "" || row.length > 0) {
      row.push(cell);

      if (row.some((value) => value.trim() !== "")) {
        rows.push(row);
      }
    }

    return rows;
  }

  async function findGuest(identifier) {
    const url = C.guestSheetCsvUrl;

    if (!url || url.includes("REMPLACE")) {
      throw new Error("La liste des invités n’est pas configurée.");
    }

    const response = await fetch(url, {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error("Impossible de charger la liste des invités.");
    }

    const rows = parseCSV(await response.text());

    if (rows.length < 2) {
      throw new Error("La feuille des invités est vide.");
    }

    const headers = rows[0].map((header) => normalize(header));

    function findColumn(names, fallback) {
      for (const name of names) {
        const index = headers.indexOf(normalize(name));

        if (index !== -1) {
          return index;
        }
      }

      return fallback;
    }

    // Colonnes du Google Sheet :
    // B = nom
    // G = adultes
    // H = enfants
    // I = identifiant personnalisé

    const nameIndex = findColumn(
      ["nom", "noms", "nom complet", "name"],
      1
    );

    const adultsIndex = findColumn(
      ["adultes", "adult", "nombre adultes", "max adultes"],
      6
    );

    const childrenIndex = findColumn(
      ["enfants", "enfant", "nombre enfants", "max enfants"],
      7
    );

    const inviteCodeIndex = findColumn(
      [
        "identifiant",
        "identifiant de connexion",
        "login",
        "code",
        "code invitation",
        "invite_code",
        "invitation"
      ],
      8
    );

    const wanted = normalize(identifier);

    const row = rows
      .slice(1)
      .find((currentRow) => {
        return normalize(currentRow[inviteCodeIndex]) === wanted;
      });

    if (!row) {
      return null;
    }

    const adults =
      parseInt(String(row[adultsIndex] || "0"), 10) || 0;

    const children =
      parseInt(String(row[childrenIndex] || "0"), 10) || 0;

    const maxGuests = adults + children;

    const fullName = String(row[nameIndex] || "").trim();

    return {
      invite_code: String(row[inviteCodeIndex] || "").trim(),
      full_name: fullName,
      adults,
      children,
      max_guests: maxGuests,
    };
  }

  function saveSession(guest) {
    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify(guest)
    );
  }

  function getSession() {
    try {
      return JSON.parse(
        localStorage.getItem(SESSION_KEY) || "null"
      );
    } catch {
      return null;
    }
  }

  function requireSession() {
    const guest = getSession();

    if (!guest) {
      window.location.href = "login.html";
      return null;
    }

    return guest;
  }

  function logout() {
    localStorage.removeItem(SESSION_KEY);
    window.location.href = "login.html";
  }

  async function callFunction(functionName, body) {
    if (
      !C.supabase.url ||
      C.supabase.url.includes("REMPLACE")
    ) {
      throw new Error("Supabase n’est pas configuré.");
    }

    if (
      !C.supabase.anonKey ||
      C.supabase.anonKey.includes("REMPLACE")
    ) {
      throw new Error("La clé Supabase n’est pas configurée.");
    }

    const url =
      `${C.supabase.url}/functions/v1/${functionName}`;

    const response = await fetch(url, {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
        "apikey": C.supabase.anonKey,
        "Authorization": `Bearer ${C.supabase.anonKey}`,
      },

      body: JSON.stringify(body),
    });

    let data = {};

    try {
      data = await response.json();
    } catch {
      data = {};
    }

    if (!response.ok) {
      throw new Error(
        data.error ||
        `Erreur serveur (${response.status}).`
      );
    }

    return data;
  }

  async function saveRsvp(payload) {
    const guest = getSession();

    /*
     * IMPORTANT :
     * L'identifiant est maintenant récupéré depuis
     * la session du navigateur.
     *
     * On ne dépend donc plus de guest_id envoyé
     * par le formulaire.
     */

    const inviteCode =
      guest?.invite_code ||
      payload.inviteCode ||
      payload.guest_id;

    if (!inviteCode) {
      throw new Error(
        "Identifiant d’invitation manquant."
      );
    }

    const attendance =
      payload.attendance === true ||
      payload.attendance === "yes" ||
      payload.attendance === "oui";

    const peopleCount = Number(
      payload.peopleCount ??
      payload.people_count ??
      0
    );

    return callFunction(
      C.functions.saveRsvp,
      {
        inviteCode: inviteCode,

        attendance: attendance,

        peopleCount: peopleCount,

        companions:
          payload.companions ?? "",

        diet:
          payload.diet ?? "",
      }
    );
  }

  async function loadRsvp(guest) {
    const currentGuest =
      guest || getSession();

    if (!currentGuest?.invite_code) {
      throw new Error(
        "Identifiant d’invitation manquant."
      );
    }

    const data = await callFunction(
      C.functions.saveRsvp,
      {
        action: "get",

        inviteCode:
          currentGuest.invite_code,
      }
    );

    if (!data.rsvp) {
      return null;
    }

    return {
      ...data.rsvp,

      attendance:
        data.rsvp.attendance
          ? "yes"
          : "no",

      people_count:
        data.rsvp.people_count,

      companions:
        data.rsvp.companions || "",

      diet:
        data.rsvp.diet || "",
    };
  }

  async function uploadPhotos(guest, files) {
    const currentGuest =
      guest || getSession();

    if (!currentGuest?.invite_code) {
      throw new Error(
        "Identifiant d’invitation manquant."
      );
    }

    if (!files || files.length === 0) {
      return true;
    }

    if (files.length > 23) {
      throw new Error(
        "Vous ne pouvez pas sélectionner plus de 23 photos à la fois."
      );
    }

    for (const file of files) {
      if (!file.type.startsWith("image/")) {
        throw new Error(
          `"${file.name}" n’est pas une image.`
        );
      }

      if (file.size > 15 * 1024 * 1024) {
        throw new Error(
          `"${file.name}" dépasse 15 Mo.`
        );
      }
    }

    const session =
      await callFunction(
        C.functions.photoSession,
        {
          inviteCode:
            currentGuest.invite_code,

          count: files.length,
        }
      );

    const supabaseClient =
      window.supabase.createClient(
        C.supabase.url,
        C.supabase.anonKey
      );

    const confirmations = [];

    for (
      let i = 0;
      i < files.length;
      i++
    ) {
      const file = files[i];
      const upload = session.uploads[i];

      const { error } =
        await supabaseClient.storage
          .from(C.supabase.bucket)
          .uploadToSignedUrl(
            upload.path,
            upload.token,
            file,
            {
              contentType: file.type,
              upsert: false,
            }
          );

      if (error) {
        throw new Error(
          `Échec de l’envoi de "${file.name}" : ${error.message}`
        );
      }

      confirmations.push({
        storagePath:
          upload.path,

        originalName:
          file.name,

        mimeType:
          file.type,

        sizeBytes:
          file.size,
      });
    }

    await callFunction(
      C.functions.photoSession,
      {
        action: "confirm",

        inviteCode:
          currentGuest.invite_code,

        uploads:
          confirmations,
      }
    );

    return true;
  }

  async function listPhotos(guest) {
    const currentGuest =
      guest || getSession();

    if (!currentGuest?.invite_code) {
      throw new Error(
        "Identifiant d’invitation manquant."
      );
    }

    const data =
      await callFunction(
        C.functions.photoList,
        {
          inviteCode:
            currentGuest.invite_code,
        }
      );

    return (data.photos || []).map(
      (photo) => ({
        ...photo,

        created_at:
          photo.createdAt ||
          photo.created_at,
      })
    );
  }

  return {
    findGuest,
    saveSession,
    getSession,
    requireSession,
    logout,
    saveRsvp,
    loadRsvp,
    uploadPhotos,
    listPhotos,
  };
})();
