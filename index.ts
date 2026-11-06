import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SHEET_CSV_URL = Deno.env.get("GUEST_SHEET_CSV_URL")!;
const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function csvRows(text: string) {
  const rows:string[][]=[]; let row:string[]=[]; let cell=""; let quoted=false;
  for(let i=0;i<text.length;i++){
    const c=text[i], n=text[i+1];
    if(c === '"' && quoted && n === '"'){cell+='"';i++;continue;}
    if(c === '"'){quoted=!quoted;continue;}
    if(c === ',' && !quoted){row.push(cell);cell="";continue;}
    if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&n==='\n')i++;row.push(cell);cell="";if(row.some(x=>x.trim()))rows.push(row);row=[];continue;}
    cell+=c;
  }
  if(cell!==""||row.length){row.push(cell);if(row.some(x=>x.trim()))rows.push(row);}
  return rows;
}
const norm=(v:string)=>String(v??"").trim().toLowerCase();

async function guestFromSheet(invite:string){
  const r=await fetch(SHEET_CSV_URL,{cache:"no-store"});
  if(!r.ok) throw new Error("Impossible de lire la liste des invités.");
  const rows=csvRows(await r.text());
  if(rows.length<2) throw new Error("Liste des invités vide.");
  const h=rows[0].map(norm);
  const find=(names:string[], fallback:number)=>{for(const n of names){const i=h.indexOf(norm(n));if(i>=0)return i;}return fallback;};
  const iId=find(["identifiant","identifiant de connexion","login","code"],8);
  const iAdults=find(["max guest","max guests","adultes","adult"],6);
  const iChildren=find(["enfants","children"],7);
  const row=rows.slice(1).find(r=>norm(r[iId])===norm(invite));
  if(!row) return null;
  const adults=Math.max(0,parseInt(row[iAdults]||"0",10)||0);
  const children=Math.max(0,parseInt(row[iChildren]||"0",10)||0);
  return {maxGuests:adults+children};
}

Deno.serve(async (req)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
  try{
    const body=await req.json();
    const guest_id=String(body.guest_id||"").trim();
    if(!guest_id) throw new Error("Identifiant invité manquant.");

    if(body.action==="get"){
      const {data,error}=await db.from("rsvps").select("*").eq("invite_code",guest_id).maybeSingle();
      if(error) throw error;
      return new Response(JSON.stringify(data||null),{headers:cors});
    }

    const guest=await guestFromSheet(guest_id);
    if(!guest) return new Response(JSON.stringify({error:"Identifiant invité invalide."}),{status:401,headers:cors});

    const attendance=body.attendance==="yes"?"yes":"no";
    const peopleCount=attendance==="yes"?Number(body.people_count||0):0;
    if(attendance==="yes" && (peopleCount<1 || peopleCount>guest.maxGuests)){
      return new Response(JSON.stringify({error:`Votre invitation autorise au maximum ${guest.maxGuests} personne(s).`}),{status:400,headers:cors});
    }

    const payload={
      invite_code:guest_id,
      attendance,
      people_count:peopleCount,
      companions:String(body.companions||"").slice(0,2000),
      diet:String(body.diet||"").slice(0,2000),
      updated_at:new Date().toISOString()
    };
    const {data,error}=await db.from("rsvps").upsert(payload,{onConflict:"invite_code"}).select().single();
    if(error) throw error;
    return new Response(JSON.stringify(data),{headers:cors});
  }catch(e){
    return new Response(JSON.stringify({error:e instanceof Error?e.message:"Erreur serveur"}),{status:400,headers:cors});
  }
});
