window.MarriageApp = (() => {
  const C = window.MARRIAGE_CONFIG;
  const SESSION_KEY = "chloe-marin-guest";

  // ==================================================
  // UTILITAIRES
  // ==================================================

  function normalize(value) {
    return String(value ?? "")
      .replace(/^\uFEFF/, "")
      .trim()
      .toLowerCase();
  }

  // Parse une ligne CSV en respectant les champs entre guillemets
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

  // Parse tout le CSV
  function parseCSV(csv) {
    const rows = [];
    let row = [];
    let cell = "";
    let inQuotes = false;

    for (let i = 0; i < csv.length; i++) {
      const char = csv[i];
      const next = csv[i + 1];

      if (char === '"' && inQuotes && next === '"') {
        cell += '"';
        i++;
        continue;
      }

      if (char === '"') {
        inQuotes = !inQuotes;
        continue;
      }

      if ((char === "\n" || char === "\r") && !inQuotes) {
        if (char === "\r" && next === "\n") {
          i++;
        }

        row.push(cell);
        cell = "";

        if (row.some(value => value.trim() !== "")) {
          rows.push(row);
        }

        row = [];
        continue;
      }

      cell += char;
    }

    if (cell !== "" || row.length > 0) {
      row.push(cell);

      if (row.some(value => value.trim() !== "")) {
        rows.push(row);
      }
    }

    return rows;
  }

  // ==================================================
  // RECHERCHE INVITÉ DANS GOOGLE SHEET
  // ==================================================

 async function findGuest(identifier) {
  const wanted = normalize(identifier);

  if (!wanted) {
    return null;
  }

  const url = C.guestSheetCsvUrl;

  const response = await fetch(url + "&t=" + Date.now(), {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error("Impossible de lire la liste des invités.");
  }

  const csv = await response.text();
  const rows = parseCSV(csv);

  console.log("CSV chargé :", rows.length, "lignes");
  console.log("Recherche du code :", wanted);

  if (rows.length < 2) {
    throw new Error("La liste des invités est vide ou inaccessible.");
  }

  // Colonnes fixes de ta feuille Google :
  // B = NOMS      → index 1
  // G = ADULTES   → index 6
  // H = ENFANTS   → index 7
  // I = CODES     → index 8

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];

    const name = String(row[1] || "").trim();
    const adults = parseInt(String(row[6] || "").trim(), 10) || 0;
    const children = parseInt(String(row[7] || "").trim(), 10) || 0;
    const code = normalize(row[8] || "");

    if (code) {
      console.log("Code trouvé dans la ligne", i + 1, ":", code);
    }

    if (code === wanted) {
      return {
        invite_code: code,
        full_name: name,
        adults,
        children,
        max_guests: adults + children
      };
    }
  }

  return null;
}

    /*
     * ==================================================
     * COLONNES DE TON GOOGLE SHEET
     *
     * B = NOMS       -> index 1
     * G = ADULTES nb -> index 6
     * H = ENFANTS nb -> index 7
     * I = CODES      -> index 8
     *
     * On utilise volontairement les positions,
     * car elles sont définies par ton fichier.
     * ==================================================
     */

    const NAME_INDEX = 1;
    const ADULTS_INDEX = 6;
    const CHILDREN_INDEX = 7;
    const CODE_INDEX = 8;

    const wanted = normalize(identifier);

    if (!wanted) {
      return null;
    }

    let foundRow = null;

    for (let i = 1; i < rows.length; i++) {
      const currentRow = rows[i];

      if (!currentRow) {
        continue;
      }

      const code = normalize(
        currentRow[CODE_INDEX]
      );

      if (code === wanted) {
        foundRow = currentRow;
        break;
      }
    }

    if (!foundRow) {
      return null;
    }

    // ----------------------------------------------
    // ADULTES
    // ----------------------------------------------

    const adults =
      parseInt(
        String(
          foundRow[ADULTS_INDEX] ?? ""
        ).trim(),
        10
      ) || 0;

    // ----------------------------------------------
    // ENFANTS
    // ----------------------------------------------

    const children =
      parseInt(
        String(
          foundRow[CHILDREN_INDEX] ?? ""
        ).trim(),
        10
      ) || 0;

    // ----------------------------------------------
    // NOM
    // ----------------------------------------------

    const fullName =
      String(
        foundRow[NAME_INDEX] ?? ""
      ).trim();

    // ----------------------------------------------
    // CODE
    // ----------------------------------------------

    const inviteCode =
      String(
        foundRow[CODE_INDEX] ?? ""
      ).trim();

    // ----------------------------------------------
    // TOTAL AUTORISÉ
    // ----------------------------------------------

    const maxGuests =
      adults + children;

    return {
      invite_code: inviteCode,
      full_name: fullName,
      adults: adults,
      children: children,
      max_guests: maxGuests
    };
  }

  // ==================================================
  // SESSION
  // ==================================================

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
    } catch (error) {
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

    window.location.href = "login.html";
  }

  // ==================================================
  // SUPABASE EDGE FUNCTIONS
  // ==================================================

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
    } catch (error) {
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

  // ==================================================
  // RSVP
  // ==================================================

  async function saveRsvp(payload) {
    const guest = getSession();

    const inviteCode =
      guest?.invite_code ||
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

  // ==================================================
  // CHARGEMENT RSVP
  // ==================================================

  async function loadRsvp(guest) {
    const currentGuest =
      guest || getSession();

    const inviteCode =
      currentGuest?.invite_code;

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

  // ==================================================
  // UPLOAD PHOTOS
  // ==================================================

  async function uploadPhotos(
    guest,
    files
  ) {
    const currentGuest =
      guest || getSession();

    const inviteCode =
      currentGuest?.invite_code;

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

  // ==================================================
  // LISTE PHOTOS
  // ==================================================

  async function listPhotos(guest) {
    const currentGuest =
      guest || getSession();

    const inviteCode =
      currentGuest?.invite_code;

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
    ).map(photo => ({
      ...photo,

      created_at:
        photo.createdAt ||
        photo.created_at
    }));
  }

  // ==================================================
  // API
  // ==================================================

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
