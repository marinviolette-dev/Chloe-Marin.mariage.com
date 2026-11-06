(() => {
  const cfg = window.MARRIAGE_CONFIG || {};
  const KEY = "weddingGuest";

  function getGuest(){ try{return JSON.parse(localStorage.getItem(KEY)||"null")}catch{return null} }
  function setGuest(g){localStorage.setItem(KEY,JSON.stringify(g))}
  function logout(){localStorage.removeItem(KEY);location.href="login.html"}

  async function csvGuests(){
    if(!cfg.guestSheetCsvUrl || cfg.guestSheetCsvUrl.includes("REMPLACE")) return [];
    const r=await fetch(cfg.guestSheetCsvUrl,{cache:"no-store"});
    if(!r.ok) throw new Error("Impossible de lire la liste des invités.");
    const text=await r.text();
    return parseCSV(text);
  }

  function parseCSV(text){
    const rows=[]; let row=[], cell="", q=false;
    for(let i=0;i<text.length;i++){const c=text[i],n=text[i+1];
      if(c=='"'&&q&&n=='"'){cell+='"';i++;continue}
      if(c=='"'){q=!q;continue}
      if(c==','&&!q){row.push(cell);cell="";continue}
      if((c=='\n'||c=='\r')&&!q){if(c=='\r'&&n=='\n')i++;row.push(cell);if(row.some(x=>x.trim()))rows.push(row);row=[];cell="";continue}
      cell+=c;
    }
    if(cell||row.length){row.push(cell);rows.push(row)}
    if(!rows.length)return [];
    const headers=rows.shift().map(h=>h.trim());
    return rows.map(r=>Object.fromEntries(headers.map((h,i)=>[h,(r[i]||"").trim()])));
  }

  async function login(e){
    e.preventDefault();
    const first=firstName.value.trim(), last=lastName.value.trim(), code=inviteCode.value.trim();
    const err=loginError; err.hidden=true;
    try{
      const guests=await csvGuests();
      if(!guests.length){
        err.textContent="La liste des invités n'est pas encore configurée. Consulte le README.";
        err.hidden=false; return;
      }
      const g=guests.find(x=>x.firstName.toLowerCase()===first.toLowerCase() &&
        x.lastName.toLowerCase()===last.toLowerCase() &&
        (!x.inviteCode || x.inviteCode===code));
      if(!g){err.textContent="Invité non trouvé. Vérifiez le prénom, le nom et le code.";err.hidden=false;return}
      setGuest({firstName:g.firstName,lastName:g.lastName,inviteCode:g.inviteCode||"",maxGuests:Math.max(1,Number(g.maxGuests||1))});
      location.href="app.html";
    }catch(ex){err.textContent=ex.message;err.hidden=false}
  }

  function guard(){
    const g=getGuest();
    if(!g && !location.pathname.endsWith("login.html") && !location.pathname.endsWith("index.html")) location.href="login.html";
    return g;
  }

  async function setupApp(){
    const g=guard(); if(!g)return;
    const gn=document.querySelector("#guestName"), wn=document.querySelector("#welcomeName");
    if(gn)gn.textContent=`${g.firstName} ${g.lastName}`;
    if(wn)wn.textContent=`Bonjour ${g.firstName}`;
    document.querySelector("#logoutBtn")?.addEventListener("click",logout);
  }

  function setupRsvp(){
    const g=guard(); if(!g)return;
    const select=document.querySelector("#peopleCount");
    for(let i=1;i<=g.maxGuests;i++){const o=document.createElement("option");o.value=i;o.textContent=`${i} personne${i>1?"s":""}`;select.appendChild(o)}
    document.querySelector("#allowedText").textContent=`Votre invitation permet jusqu'à ${g.maxGuests} personne${g.maxGuests>1?"s":""}.`;
    document.querySelector("#attendance").addEventListener("change",e=>{
      document.querySelector("#peopleBlock").style.display=e.target.value==="yes"?"block":"none";
      document.querySelector("#companionsBlock").style.display=e.target.value==="yes"?"block":"none";
    });
    document.querySelector("#rsvpForm").addEventListener("submit",async e=>{
      e.preventDefault();
      const payload={...g,attendance:attendance.value,peopleCount:Number(peopleCount.value||0),companions:companions.value,diet:diet.value};
      if(cfg.rsvpEndpoint){
        try{const r=await fetch(cfg.rsvpEndpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});if(!r.ok)throw new Error("Erreur serveur.");}
        catch(ex){rsvpError.textContent=ex.message;rsvpError.hidden=false;return}
      } else {
        localStorage.setItem("rsvp",JSON.stringify(payload));
      }
      rsvpError.hidden=true;rsvpMessage.textContent="Votre réponse a bien été enregistrée.";rsvpMessage.hidden=false;
    });
  }

  function setupPhotos(){
    const g=guard(); if(!g)return;
    const input=document.querySelector("#photoInput"), btn=document.querySelector("#uploadBtn"), status=document.querySelector("#photoStatus");
    const MAX=23;
    btn.addEventListener("click",async()=>{
      const files=[...input.files];
      if(!files.length){status.textContent="Sélectionnez au moins une photo.";return}
      if(files.length>MAX){status.textContent=`Maximum ${MAX} photos par personne.`;return}
      if(!cfg.supabase.url || cfg.supabase.url.includes("REMPLACE")){status.textContent="Le stockage photo n'est pas encore configuré. Voir README.";return}
      status.textContent="Envoi en cours…";
      // Upload Supabase intentionally left as a small integration point:
      // configure Storage bucket + RLS policies, then use supabase-js or REST.
      status.textContent="Le stockage Supabase est configuré côté projet mais l'upload doit être activé dans le README.";
    });
  }

  document.addEventListener("DOMContentLoaded",()=>{
    if(document.querySelector("#loginForm")) document.querySelector("#loginForm").addEventListener("submit",login);
    if(document.querySelector("#guestName")) setupApp();
    if(document.querySelector("#rsvpForm")) setupRsvp();
    if(document.querySelector("#photoInput")) setupPhotos();
  });
})();
