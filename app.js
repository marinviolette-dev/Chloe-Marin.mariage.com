window.MarriageApp = (() => {

  const C = window.MARRIAGE_CONFIG;
  const SESSION_KEY = "chloe-marin-guest";

  function normalize(value) {
    return String(value ?? "")
      .replace(/^\uFEFF/, "")
      .replace(/\u00A0/g, " ")
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
      }
      else if (char === '"') {
        inQuotes = !inQuotes;
      }
      else if (char === "," && !inQuotes) {
        result.push(current);
        current = "";
      }
      else {
        current += char;
      }
    }

    result.push(current);
    return result;
  }

  function parseCSV(csv) {
    const lines = csv
      .replace(/^\uFEFF/, "")
      .split(/\r?\n/);

    return lines
      .filter(line => line.trim() !== "")
      .map(parseCSVLine);
  }

  async function findGuest(identifier) {

    const wanted = normalize(identifier);

    if (!wanted) {
      return null;
    }

    const url =
      C.guestSheetCsvUrl +
      (C.guestSheetCsvUrl.includes("?") ? "&" : "?") +
      "_cache=" +
      Date.now();

    const response = await fetch(url, {
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(
        "Impossible de lire la liste des invités."
      );
    }

    const csv = await response.text();

    console.log("===== TEST GOOGLE SHEETS =====");
    console.log("Code recherché :", wanted);
    console.log("Taille CSV :", csv.length);

    const rows = parseCSV(csv);

    console.log("Nombre de lignes :", rows.length);

    // Affiche les premières lignes pour diagnostic
    console.log("Première ligne :", rows[0]);
    console.log("Deuxième ligne :", rows[1]);

    /*
      COLONNES :
      B = NOM       = index 1
      G = ADULTES   = index 6
      H = ENFANTS   = index 7
      I = CODES     = index 8
    */

    for (let i = 1; i < rows.length; i++) {

      const row = rows[i];

      const code = normalize(row[8]);

      console.log(
        "Ligne",
        i + 1,
        "colonne I =",
        JSON.stringify(row[8]),
        "=>",
        code
      );

      if (code === wanted) {

        const name =
          String(row[1] || "").trim();

        const adults =
          parseInt(
            String(row[6] || "").trim(),
            10
          ) || 0;

        const children =
          parseInt(
            String(row[7] || "").trim(),
            10
          ) || 0;

        const guest = {
          invite_code: code,
          full_name: name,
          adults: adults,
          children: children,
          max_guests: adults + children
        };

        console.log(
          "===== INVITÉ TROUVÉ =====",
          guest
        );

        return guest;
      }
    }

    console.log(
      "===== INVITÉ NON TROUVÉ ====="
    );

    return null;
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
    }
    catch (error) {
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

  async function callFunction(functionName, body) {

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
    }
    catch (error) {
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

    const peopleCount =
      Number(
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

    if (!files || files.length === 0) {
      return true;
    }

    if (files.length > 23) {
      throw new Error(
        "Vous ne pouvez pas sélectionner plus de 23 photos à la fois."
      );
    }

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
