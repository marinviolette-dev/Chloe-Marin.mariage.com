import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json"};
const URL=Deno.env.get("SUPABASE_URL")!;
const SERVICE=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SHEET=Deno.env.get("GUEST_SHEET_CSV_URL")!;
const db=createClient(URL,SERVICE);
const bucket="wedding-photos";

function csvRows(text:string){const rows:string[][]=[];let row:string[]=[];let cell="";let q=false;for(let i=0;i<text.length;i++){const c=text[i],n=text[i+1];if(c=='"'&&q&&n=='"'){cell+='"';i++;continue}if(c=='"'){q=!q;continue}if(c==','&&!q){row.push(cell);cell="";continue}if((c=='\n'||c=='\r')&&!q){if(c=='\r'&&n=='\n')i++;row.push(cell);cell="";if(row.some(x=>x.trim()))rows.push(row);row=[];continue}cell+=c}if(cell||row.length){row.push(cell);if(row.some(x=>x.trim()))rows.push(row)}return rows}
const norm=(v:string)=>String(v??"").trim().toLowerCase();

async function maxGuests(invite:string){
  const r=await fetch(SHEET,{cache:"no-store"}); if(!r.ok) throw new Error("Impossible de lire la liste des invités.");
  const rows=csvRows(await r.text()); const h=rows[0].map(norm);
  const find=(names:string[],fallback:number)=>{for(const n of names){const i=h.indexOf(norm(n));if(i>=0)return i}return fallback};
  const id=find(["identifiant","identifiant de connexion","login","code"],8), a=find(["max guest","max guests","adultes","adult"],6), c=find(["enfants","children"],7);
  const row=rows.slice(1).find(r=>norm(r[id])===norm(invite)); if(!row)return null;
  return (parseInt(row[a]||"0",10)||0)+(parseInt(row[c]||"0",10)||0);
}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  try{
    const b=await req.json(); const guest=String(b.guest_id||"").trim(); if(!guest)throw new Error("Identifiant invité manquant.");
    if(b.action==="confirm"){
      const p=b.photo||{};
      const {error}=await db.from("guest_photos").insert({invite_code:guest,storage_path:p.path,original_name:String(p.name||"").slice(0,255),mime_type:String(p.type||"application/octet-stream"),size_bytes:Number(p.size||0)});
      if(error)throw error;
      return new Response(JSON.stringify({ok:true}),{headers:cors});
    }
    const max=await maxGuests(guest); if(max===null)return new Response(JSON.stringify({error:"Identifiant invité invalide."}),{status:401,headers:cors});
    const {count,error}=await db.from("guest_photos").select("*",{count:"exact",head:true}).eq("invite_code",guest); if(error)throw error;
    const n=Number(b.count||0);
    if((count||0)+n>23)throw new Error(`Vous avez déjà ${count||0} photo(s). La limite est de 23.`);
    const uploads=[];
    for(let i=0;i<n;i++){
      const ext="jpg";
      const path=`${guest}/${crypto.randomUUID()}.${ext}`;
      const {data,error}=await db.storage.from(bucket).createSignedUploadUrl(path);
      if(error)throw error;
      uploads.push({path,token:data.token});
    }
    return new Response(JSON.stringify({uploads}),{headers:cors});
  }catch(e){
    return new Response(JSON.stringify({error:e instanceof Error?e.message:"Erreur serveur"}),{status:400,headers:cors});
  }
});
