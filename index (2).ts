import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json"};
const URL=Deno.env.get("SUPABASE_URL")!, SERVICE=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db=createClient(URL,SERVICE);
Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  try{
    const {guest_id}=await req.json(); if(!guest_id)throw new Error("Identifiant invité manquant.");
    const {data,error}=await db.from("guest_photos").select("id,storage_path,original_name,created_at").eq("invite_code",guest_id).order("created_at",{ascending:false});
    if(error)throw error;
    const photos=[];
    for(const p of data||[]){
      const {data:signed,error:e}=await db.storage.from("wedding-photos").createSignedUrl(p.storage_path,3600);
      if(!e && signed)photos.push({id:p.id,url:signed.signedUrl,original_name:p.original_name,created_at:p.created_at});
    }
    return new Response(JSON.stringify({photos}),{headers:cors});
  }catch(e){return new Response(JSON.stringify({error:e instanceof Error?e.message:"Erreur serveur"}),{status:400,headers:cors});}
});
