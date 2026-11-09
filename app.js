window.MarriageApp = (() => {
  const C = window.MARRIAGE_CONFIG;
  const SESSION_KEY = "chloe-marin-guest";

  // --------------------------------------------------
  // UTILITAIRES
  // --------------------------------------------------

  function normalize(value) {
    return String(value ?? "")
      .replace(/^\uFEFF/, "")
      .trim()
      .toLowerCase();
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
      } else if (
        (char === "\n" || char === "\r") &&
        !quoted
      ) {
        if (char === "\r" && next === "\n") {
          i++;
        }

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

  // --------------------------------------------------
  // GOOGLE SHEET
  // --------------------------------------------------

  async function findGuest(identifier) {
    const url = C.guestSheetCsvUrl;

    if (!url || url.includes("REMPLACE")) {
      throw new Error(
        "La liste des invités n’est pas configurée."
      );
    }

    const response = await fetch(url, {
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(
        "Impossible de charger la liste des invités."
      );
    }

    const csv = await response.text();
    const rows = parseCSV(csv);

    if (rows.length < 2) {
      throw new Error(
        "La feuille des invités est vide."
      );
    }

    // ------------------------------------------------
    // Lecture des en-têtes
    // ------------------------------------------------

    const headers = rows[0].map((header) =>
      normalize(header)
    );

    function findColumn(names, fallback) {
      for (const name of names) {
        const index = headers.indexOf(
          normalize(name)
        );

        if (index !== -1) {
          return index;
        }
      }

      return fallback;
    }

    // ------------------------------------------------
    // TON GOOGLE SHEET
    //
    // B = NOMS
    // G = ADULTES nb
    // H = ENFANTS nb
    // I = CODES
    // ------------------------------------------------

    const nameIndex = findColumn(
      [
        "nom",
        "noms",
        "nom complet",
        "name"
      ],
      1
    );

    const adultsIndex = findColumn(
      [
        "adultes nb",
        "adultes",
        "adult",
        "nombre adultes",
        "max adultes"
      ],
      6
    );

    const childrenIndex = findColumn(
      [
        "enfants nb",
        "enfants",
        "enfant",
        "nombre enfants",
        "max enfants"
      ],
      7
    );

    const inviteCodeIndex = findColumn(
      [
        // IMPORTANT :
        // Ton Google Sheet utilise "CODES"
        "codes",

        "code",
        "code invitation",
        "code_invitation",

        "identifiant",
        "identifiant de connexion",

        "login",
        "invite_code",
        "invitation"
      ],
      8
    );

    // ------------------------------------------------
    // RECHERCHE DU CODE
    // ------------------------------------------------

    const wanted = normalize(identifier);

    if (!wanted) {
      return null;
    }

    const row = rows
      .slice(1)
      .find((currentRow) => {
        const code = normalize(
          currentRow[inviteCodeIndex]
        );

        return code === wanted;
      });

    if (!row) {
      return null;
    }

    // ------------------------------------------------
    // INFOS INVITÉ
    // ------------------------------------------------

    const adults =
      parseInt(
        String(row[adultsIndex] || "0"),
        10
      ) || 0;

    const children =
      parseInt(
        String(row[childrenIndex] || "0"),
        10
      ) || 0;

    const maxGuests =
      adults + children;

    const fullName =
      String(row[nameIndex] || "").trim();

    const inviteCode =
      String(
        row[inviteCodeIndex] || ""
      ).trim();

    return {
      invite_code: inviteCode,
      full_name: fullName,
      adults: adults,
      children: children,
      max_guests: maxGuests
    };
  }

  // --------------------------------------------------
  // SESSION INVITÉ
  // --------------------------------------------------

  function saveSession(guest) {
    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify(guest)
    );
  }

  function getSession() {
    try {
      return JSON.parse(
        localStorage.getItem(
          SESSION_KEY
        ) || "null"
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
    localStorage.removeItem(
      SESSION_KEY
    );

    window.location.href =
      "login.html";
  }

  // --------------------------------------------------
  // SUPABASE EDGE FUNCTIONS
  // --------------------------------------------------

  async function callFunction(
    functionName,
    body
  ) {
    if (
      !C.supabase.url ||
      C.supabase.url.includes("REMPLACE")
    ) {
      throw new Error(
        "Supabase n’est pas configuré."
      );
    }

    if (
      !C.supabase.anonKey ||
      C.supabase.anonKey.includes("REMPLACE")
    ) {
      throw new Error(
        "La clé Supabase n’est pas configurée."
      );
    }

    const url =
      `${C.supabase.url}/functions/v1/${functionName}`;

    const response = await fetch(url, {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
        "apikey": C.supabase.anonKey,
        "Authorization":
          `Bearer ${C.supabase.anonKey}`
      },

      body: JSON.stringify(body)
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
        data.message ||
        `Erreur serveur (${response.status}).`
      );
    }

    return data;
  }

  // --------------------------------------------------
  // RSVP
  // --------------------------------------------------

  async function saveRsvp(payload) {
    const guest = getSession();

    /*
     * L'identifiant est récupéré depuis
     * la session du navigateur.
     *
     * Plusieurs noms sont acceptés en secours
     * pour rester compatible avec l'ancien formulaire.
     */

    const inviteCode =
      guest?.invite_code ||
      guest?.code ||
      payload?.inviteCode ||
      payload?.invite_code ||
      payload?.guest_id;

    if (!inviteCode) {
      throw new Error(
        "Identifiant d’invitation manquant."
      );
    }

    const attendance =
      payload?.attendance === true ||
      payload?.attendance === "yes" ||
      payload?.attendance === "oui";

    const peopleCount = Number(
      payload?.peopleCount ??
      payload?.people_count ??
      0
    );

    return callFunction(
      C.functions.saveRsvp,
      {
        inviteCode:
          String(inviteCode).trim(),

        attendance:
          attendance,

        peopleCount:
          peopleCount,

        companions:
          payload?.companions ?? "",

        diet:
          payload?.diet ?? ""
      }
    );
  }

  // --------------------------------------------------
  // CHARGEMENT RSVP
  // --------------------------------------------------

  async function loadRsvp(guest) {
    const currentGuest =
      guest || getSession();

    const inviteCode =
      currentGuest?.invite_code ||
      currentGuest?.code;

    if (!inviteCode) {
      throw new Error(
        "Identifiant d’invitation manquant."
      );
    }

    const data =
      await callFunction(
        C.functions.saveRsvp,
        {
          action: "get",

          inviteCode:
            String(inviteCode).trim()
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
        data.rsvp.diet || ""
    };
  }

  // --------------------------------------------------
  // PHOTOS
  // --------------------------------------------------

  async function uploadPhotos(
    guest,
    files
  ) {
    const currentGuest =
      guest || getSession();

    const inviteCode =
      currentGuest?.invite_code ||
      currentGuest?.code;

    if (!inviteCode) {
      throw new Error(
        "Identifiant d’invitation manquant."
      );
    }

    if (
      !files ||
      files.length === 0
    ) {
      return true;
    }

    if (files.length > 23) {
      throw new Error(
        "Vous ne pouvez pas sélectionner plus de 23 photos à la fois."
      );
    }

    for (const file of files) {
      if (
        !file.type.startsWith("image/")
      ) {
        throw new Error(
          `"${file.name}" n’est pas une image.`
        );
      }

      if (
        file.size >
        15 * 1024 * 1024
      ) {
        throw new Error(
          `"${file.name}" dépasse 15 Mo.`
        );
      }
    }

    // ------------------------------------------------
    // Demande des URLs d'upload signées
    // ------------------------------------------------

    const session =
      await callFunction(
        C.functions.photoSession,
        {
          inviteCode:
            String(inviteCode).trim(),

          count:
            files.length
        }
      );

    if (
      !session ||
      !Array.isArray(session.uploads)
    ) {
      throw new Error(
        "La session d’envoi des photos est invalide."
      );
    }

    if (
      session.uploads.length !==
      files.length
    ) {
      throw new Error(
        "Le serveur n’a pas fourni toutes les autorisations d’envoi."
      );
    }

    // ------------------------------------------------
    // Client Supabase pour Storage
    // ------------------------------------------------

    if (
      !window.supabase ||
      !window.supabase.createClient
    ) {
      throw new Error(
        "La bibliothèque Supabase n’est pas chargée."
      );
    }

    const supabaseClient =
      window.supabase.createClient(
        C.supabase.url,
        C.supabase.anonKey
      );

    const confirmations = [];

    // ------------------------------------------------
    // Upload des photos
    // ------------------------------------------------

    for (
      let i = 0;
      i < files.length;
      i++
    ) {
      const file =
        files[i];

      const upload =
        session.uploads[i];

      if (
        !upload ||
        !upload.path ||
        !upload.token
      ) {
        throw new Error(
          `Autorisation d’envoi manquante pour "${file.name}".`
        );
      }

      const { error } =
        await supabaseClient.storage
          .from(C.supabase.bucket)
          .uploadToSignedUrl(
            upload.path,
            upload.token,
            file,
            {
              contentType:
                file.type,

              upsert:
                false
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
          file.size
      });
    }

    // ------------------------------------------------
    // Confirmation auprès de Supabase
    // ------------------------------------------------

    await callFunction(
      C.functions.photoSession,
      {
        action: "confirm",

        inviteCode:
          String(inviteCode).trim(),

        uploads:
          confirmations
      }
    );

    return true;
  }

  // --------------------------------------------------
  // LISTE DES PHOTOS
  // --------------------------------------------------

  async function listPhotos(guest) {
    const currentGuest =
      guest || getSession();

    const inviteCode =
      currentGuest?.invite_code ||
      currentGuest?.code;

    if (!inviteCode) {
      throw new Error(
        "Identifiant d’invitation manquant."
      );
    }

    const data =
      await callFunction(
        C.functions.photoList,
        {
          inviteCode:
            String(inviteCode).trim()
        }
      );

    return (
      data.photos || []
    ).map((photo) => ({
      ...photo,

      created_at:
        photo.createdAt ||
        photo.created_at
    }));
  }

  // --------------------------------------------------
  // API PUBLIQUE
  // --------------------------------------------------

  return {
    findGuest,
    saveSession,
    getSession,
    requireSession,
    logout,
    saveRsvp,
    loadRsvp,
    uploadPhotos,
    listPhotos
  };
})();
