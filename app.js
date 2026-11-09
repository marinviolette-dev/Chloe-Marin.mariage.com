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

  // ==================================================
  // PARSEUR CSV
  // ==================================================

  function parseCSV(csv) {
    const rows = [];
    let row = [];
    let cell = "";
    let inQuotes = false;

    for (let i = 0; i < csv.length; i++) {
      const char = csv[i];
      const next = csv[i + 1];

      // Double guillemet à l'intérieur d'un champ
      if (char === '"' && inQuotes && next === '"') {
        cell += '"';
        i++;
        continue;
      }

      // Ouverture / fermeture d'un champ entre guillemets
      if (char === '"') {
        inQuotes = !inQuotes;
        continue;
      }

      // Fin de cellule
      if (char === "," && !inQuotes) {
        row.push(cell);
        cell = "";
        continue;
      }

      // Fin de ligne
      if ((char === "\n" || char === "\r") && !inQuotes) {
        if (char === "\r" && next === "\n") {
          i++;
        }

        row.push(cell);
        cell = "";

        if (row.some(value => String(value).trim() !== "")) {
          rows.push(row);
        }

        row = [];
        continue;
      }

      cell += char;
    }

    // Dernière cellule / dernière ligne
    if (cell !== "" || row.length > 0) {
      row.push(cell);

      if (row.some(value => String(value).trim() !== "")) {
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

    if (!C || !C.guestSheetCsvUrl) {
      throw new Error("L’adresse de la liste des invités n’est pas configurée.");
    }

    // Ajout d'un paramètre pour éviter le cache du navigateur
    const separator = C.guestSheetCsvUrl.includes("?") ? "&" : "?";
    const url = C.guestSheetCsvUrl + separator + "t=" + Date.now();

    const response = await fetch(url, {
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

    /*
     * COLONNES DE TON GOOGLE SHEET
     *
     * B = NOMS       -> index 1
     * G = ADULTES nb -> index 6
     * H = ENFANTS nb -> index 7
     * I = CODES      -> index 8
     */

    const NAME_INDEX = 1;
    const ADULTS_INDEX = 6;
    const CHILDREN_INDEX = 7;
    const CODE_INDEX = 8;

    for (let i = 1; i < rows.length; i++) {
      const currentRow = rows[i];

      if (!currentRow) {
        continue;
      }

      const code = normalize(
        currentRow[CODE_INDEX] || ""
      );

      if (code) {
        console.log(
          "Code trouvé dans la ligne",
          i + 1,
          ":",
          code
        );
      }

      // Comparaison avec le code saisi
      if (code === wanted) {
        const fullName = String(
          currentRow[NAME_INDEX] || ""
        ).trim();

        const adults =
          parseInt(
            String(currentRow[ADULTS_INDEX] || "").trim(),
            10
          ) || 0;

        const children =
          parseInt(
            String(currentRow[CHILDREN_INDEX] || "").trim(),
            10
          ) || 0;

        const maxGuests = adults + children;

        console.log("Invité trouvé :", {
          fullName,
          adults,
          children,
          maxGuests,
          inviteCode: code
        });

        return {
          invite_code: code,
          full_name: fullName,
          adults: adults,
          children: children,
          max_guests: maxGuests
        };
      }
    }

    console.log("Aucun invité trouvé pour :", wanted);

    return null;
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
        localStorage.getItem(SESSION_KEY) || "null"
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
    localStorage.removeItem(SESSION_KEY);
    window.location.href = "login.html";
  }

  // ==================================================
  // SUPABASE EDGE FUNCTIONS
  // ==================================================

  async function callFunction(functionName, body) {
    if (
      !C ||
      !C.supabase ||
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
        "Authorization": `Bearer ${C.supabase.anonKey}`
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
        inviteCode: String(inviteCode).trim(),

        attendance: attendance,

        peopleCount: peopleCount,

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

  async function uploadPhotos(guest, files) {
    const currentGuest =
      guest || getSession();

    const inviteCode =
      currentGuest?.invite_code;

    if (!inviteCode) {
      throw new Error(
        "Identifiant d’invitation manquant."
      );
    }

    if (!files || files.length === 0) {
      return true;
    }

    // Maximum 23 photos par envoi
    if (files.length > 23) {
      throw new Error(
        "Vous ne pouvez pas sélectionner plus de 23 photos à la fois."
      );
    }

    // Vérification des fichiers
    for (const file of files) {
      if (
        !file.type ||
        !file.type.startsWith("image/")
      ) {
        throw new Error(
          `"${file.name}" n’est pas une image.`
        );
      }

      if (
        file.size > 15 * 1024 * 1024
      ) {
        throw new Error(
          `"${file.name}" dépasse 15 Mo.`
        );
      }
    }

    // Demande au serveur des URLs d'upload signées
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
      session.uploads.length !== files.length
    ) {
      throw new Error(
        "Le serveur n’a pas fourni toutes les autorisations d’envoi."
      );
    }

    // Vérifie que la bibliothèque Supabase est disponible
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

    // Upload des fichiers
    for (
      let i = 0;
      i < files.length;
      i++
    ) {
      const file = files[i];
      const upload = session.uploads[i];

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
              contentType: file.type,
              upsert: false
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

    // Confirmation auprès de la fonction Supabase
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
  // LISTE DES PHOTOS
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
  // API PUBLIQUE
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
