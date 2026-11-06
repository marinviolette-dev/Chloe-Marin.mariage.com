window.MarriageApp = (() => {
  const C = window.MARRIAGE_CONFIG;
  const SESSION_KEY = "chloe-marin-guest";

  function normalize(v) {
    return String(v ?? "").trim().toLowerCase();
  }

  function csvRows(text) {
    const rows=[]; let row=[]; let cell=""; let quoted=false;
    for(let i=0;i<text.length;i++){
      const c=text[i], n=text[i+1];
      if(c === '"' && quoted && n === '"'){ cell+='"'; i++; continue; }
      if(c === '"'){ quoted=!quoted; continue; }
      if(c === ',' && !quoted){ row.push(cell); cell=""; continue; }
      if((c === '\n' || c === '\r') && !quoted){
        if(c==='\r' && n==='\n') i++;
        row.push(cell); cell="";
        if(row.some(x=>x.trim()!=="")) rows.push(row);
        row=[]; continue;
      }
      cell+=c;
    }
    if(cell!=="" || row.length){row.push(cell); if(row.some(x=>x.trim()!=="")) rows.push(row);}
    return rows;
  }

  async function findGuest(identifier) {
    const url = C.guestSheetCsvUrl;
    if(!url || url.includes("REMPLACE")) throw new Error("La liste des invités n’est pas encore configurée.");
    const res = await fetch(url, {cache:"no-store"});
    if(!res.ok) throw new Error("Impossible de charger la liste des invités.");
    const rows=csvRows(await res.text());
    if(rows.length<2) throw new Error("La feuille des invités est vide.");
    const headers=rows[0].map(h=>normalize(h));
    // Colonnes fixes demandées : B=nom, G=max adultes, H=enfants, I=identifiant.
    const idx={name:1, adults:6, children:7, id:8};
    // Si les en-têtes sont nommés, ils sont prioritaires.
    const find=(names, fallback)=>{ for(const n of names){const i=headers.indexOf(normalize(n)); if(i>=0)return i;} return fallback; };
    idx.name=find(["nom","noms","nom complet","name"],1);
    idx.adults=find(["max guest","max guests","adultes","adult"],6);
    idx.children=find(["enfants","children"],7);
    idx.id=find(["identifiant","identifiant de connexion","login","code"],8);
    const wanted=normalize(identifier);
    const row=rows.slice(1).find(r=>normalize(r[idx.id])===wanted);
    if(!row) return null;
    const adults=Math.max(0, parseInt(String(row[idx.adults]||"0").replace(",", "."),10)||0);
    const children=Math.max(0, parseInt(String(row[idx.children]||"0").replace(",", "."),10)||0);
    const max=adults+children;
    if(max<1) throw new Error("Cet invité n’a pas de capacité d’invitation configurée.");
    const fullName=String(row[idx.name]||"").trim();
    const parts=fullName.split(/\s+/);
    return {
      invite_code:String(row[idx.id]).trim(),
      first_name:parts.length>1 ? parts.slice(0,-1).join(" ") : fullName,
      last_name:parts.length>1 ? parts.at(-1) : "",
      full_name:fullName,
      adults,
      children,
      max_guests:max
    };
  }

  function saveSession(guest){ localStorage.setItem(SESSION_KEY, JSON.stringify(guest)); }
  function getSession(){ try{return JSON.parse(localStorage.getItem(SESSION_KEY)||"null")}catch{return null} }
  function requireSession(){ const g=getSession(); if(!g){location.href="login.html"; return null;} return g; }
  function logout(){localStorage.removeItem(SESSION_KEY); location.href="login.html";}

  async function fn(name, body) {
    const url=`${C.supabase.url}/functions/v1/${name}`;
    const res=await fetch(url,{
      method:"POST",
      headers:{"Content-Type":"application/json","apikey":C.supabase.anonKey,"Authorization":`Bearer ${C.supabase.anonKey}`},
      body:JSON.stringify(body)
    });
    let data={}; try{data=await res.json()}catch{}
    if(!res.ok) throw new Error(data.error || "Une erreur est survenue.");
    return data;
  }

  async function saveRsvp(payload){
    if(!C.supabase.url || C.supabase.url.includes("REMPLACE")) throw new Error("Supabase n’est pas encore configuré.");
    return fn(C.functions.saveRsvp,payload);
  }

  async function loadRsvp(guest){
    if(!C.supabase.url || C.supabase.url.includes("REMPLACE")) return null;
    try{return await fn(C.functions.saveRsvp,{action:"get",guest_id:guest.invite_code})}catch{return null}
  }

  async function uploadPhotos(guest, files){
    if(files.length>23) throw new Error("Vous ne pouvez pas sélectionner plus de 23 photos à la fois.");
    if(!C.supabase.url || C.supabase.url.includes("REMPLACE")) throw new Error("Supabase n’est pas encore configuré.");
    const session=await fn(C.functions.photoSession,{guest_id:guest.invite_code,count:files.length});
    const sb=supabase.createClient(C.supabase.url,C.supabase.anonKey);
    for(let i=0;i<files.length;i++){
      const f=files[i];
      if(!f.type.startsWith("image/")) throw new Error(`"${f.name}" n’est pas une image.`);
      if(f.size>15*1024*1024) throw new Error(`"${f.name}" dépasse 15 Mo.`);
      const item=session.uploads[i];
      const {error}=await sb.storage.from(C.supabase.bucket).uploadToSignedUrl(item.path,item.token,f,{contentType:f.type,upsert:false});
      if(error) throw new Error(`Échec de l’envoi de "${f.name}".`);
      const record=await fn(C.functions.photoSession,{action:"confirm",guest_id:guest.invite_code,photo:{path:item.path,name:f.name,type:f.type,size:f.size}});
      if(!record.ok) throw new Error("La photo n’a pas pu être enregistrée.");
    }
    return true;
  }

  async function listPhotos(guest){
    const data=await fn(C.functions.photoList,{guest_id:guest.invite_code});
    return data.photos||[];
  }

  return {findGuest,saveSession,getSession,requireSession,logout,saveRsvp,loadRsvp,uploadPhotos,listPhotos};
})();
