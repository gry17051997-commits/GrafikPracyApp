import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});

Deno.serve(async req=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
  try{
    const url=Deno.env.get("SUPABASE_URL")!, anon=Deno.env.get("SUPABASE_ANON_KEY")!, service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader=req.headers.get("Authorization");
    if(!authHeader) return json({error:"Musisz być zalogowany."},401);
    const userClient=createClient(url,anon,{global:{headers:{Authorization:authHeader}}});
    const {data:{user:caller},error:authError}=await userClient.auth.getUser();
    if(authError||!caller) return json({error:"Musisz być zalogowany."},401);
    const admin=createClient(url,service);
    const {data:profile}=await admin.from("users").select("uid,role,disabled").eq("uid",caller.id).maybeSingle();
    if(!profile||profile.role!=="admin"||profile.disabled) return json({error:"Tylko administrator może wykonywać tę operację."},403);

    const body=await req.json();
    const action=String(body.action||"");

    if(action==="create"){
      const email=String(body.email||"").trim().toLowerCase(), password=String(body.password||""), displayName=String(body.displayName||"").trim();
      const personKey=String(body.personKey||""), role=String(body.role||"employee");
      if(!/^\S+@\S+\.\S+$/.test(email)||email.length>254) return json({error:"Podaj prawidłowy e-mail."},400);
      if(password.length<6||password.length>128) return json({error:"Hasło musi mieć od 6 do 128 znaków."},400);
      if(displayName.length<2||displayName.length>100) return json({error:"Imię i nazwisko musi mieć od 2 do 100 znaków."},400);
      if(!["","P","M","L"].includes(personKey)||!["admin","employee","locator"].includes(role)) return json({error:"Nieprawidłowa rola lub przypisanie."},400);
      if(role==="employee"&&!["P","M","L"].includes(personKey)) return json({error:"Pracownik musi mieć P/M/L."},400);
      if(role!=="employee"&&personKey!=="") return json({error:"Administrator i lokalizator nie mogą mieć P/M/L."},400);
      if(personKey){const {data:conflict}=await admin.from("users").select("uid").eq("person_key",personKey).maybeSingle();if(conflict)return json({error:"Ten identyfikator pracownika jest już przypisany."},409);}
      const {data:created,error}=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{displayName}});
      if(error||!created.user)return json({error:error?.message||"Nie udało się utworzyć konta."},400);
      const uid=created.user.id;
      const {error:profileError}=await admin.from("users").insert({uid,email,display_name:displayName,person_key:personKey,role,created_by:caller.id,updated_by:caller.id});
      if(profileError){await admin.auth.admin.deleteUser(uid);return json({error:"Nie udało się utworzyć profilu. Konto zostało wycofane."},500);}
      await admin.from("audit").insert({action:"create-user",actor_uid:caller.id,target_uid:uid});
      return json({ok:true,uid,email});
    }

    const uid=String(body.uid||"").trim();
    if(!uid)return json({error:"Brak identyfikatora użytkownika."},400);
    if(uid===caller.id&&["delete","setDisabled","setRole"].includes(action))return json({error:"Administrator nie może wykonać tej operacji na własnym koncie."},409);

    if(action==="delete"){
      const {error}=await admin.auth.admin.deleteUser(uid);
      if(error&&!/not found/i.test(error.message))return json({error:error.message},400);
      await admin.from("users").delete().eq("uid",uid);
      await admin.from("audit").insert({action:"delete-user",actor_uid:caller.id,target_uid:uid});
      return json({ok:true,uid});
    }

    if(action==="setDisabled"){
      const disabled=body.disabled===true;
      const {error}=await admin.auth.admin.updateUserById(uid,{ban_duration:disabled?"876000h":"none"});
      if(error)return json({error:error.message},400);
      const {error:profileError}=await admin.from("users").update({disabled,updated_by:caller.id,updated_at:new Date().toISOString()}).eq("uid",uid);
      if(profileError)return json({error:profileError.message},400);
      await admin.from("audit").insert({action:disabled?"disable-user":"enable-user",actor_uid:caller.id,target_uid:uid});
      return json({ok:true,uid,disabled});
    }

    if(action==="setRole"){
      const role=String(body.role||"");
      if(!["admin","employee","locator"].includes(role))return json({error:"Nieprawidłowa rola."},400);
      const {data:target}=await admin.from("users").select("uid,person_key").eq("uid",uid).maybeSingle();
      if(!target)return json({error:"Profil użytkownika nie istnieje."},404);
      if(role==="employee"&&!["P","M","L"].includes(target.person_key))return json({error:"Pracownik musi mieć P/M/L."},400);
      if(role!=="employee"&&target.person_key)return json({error:"Administrator i lokalizator nie mogą mieć P/M/L."},400);
      const {error}=await admin.from("users").update({role,updated_by:caller.id,updated_at:new Date().toISOString()}).eq("uid",uid);
      if(error)return json({error:error.message},400);
      await admin.from("audit").insert({action:"set-role",actor_uid:caller.id,target_uid:uid,data:{role}});
      return json({ok:true,uid,role});
    }

    if(action==="assignVehicle"){
      const registration=String(body.registration||"").trim().toUpperCase();
      if(!registration)return json({error:"Brak numeru rejestracyjnego."},400);
      const vehicleId=registration.replace(/[^A-Z0-9ĄĆĘŁŃÓŚŹŻ]+/gi,"_").slice(0,40);
      if(!vehicleId)return json({error:"Nieprawidłowy numer rejestracyjny."},400);
      const {error}=await admin.from("location_config").upsert({id:"main",vehicle_id:vehicleId,registration,updated_at:new Date().toISOString(),updated_by:caller.id});
      if(error)return json({error:error.message},400);
      await admin.from("audit").insert({action:"assign-vehicle",actor_uid:caller.id,data:{vehicleId,registration}});
      return json({ok:true,vehicleId,registration});
    }

    if(action==="adjustRecoveryBalance"){
      const person=String(body.person||""), delta=Number(body.delta);
      if(!["P","M","L"].includes(person)||!Number.isFinite(delta)||delta===0)return json({error:"Nieprawidłowa korekta salda."},400);
      const {data:settings}=await admin.from("settings").select("data").eq("id","main").maybeSingle();
      const current=settings?.data||{};
      const balances={P:Number(current.recoveryBalances?.P)||0,M:Number(current.recoveryBalances?.M)||0,L:Number(current.recoveryBalances?.L)||0};
      balances[person]+=delta;
      const ledger=Array.isArray(current.recoveryLedger)?current.recoveryLedger.slice(-499):[];
      ledger.push({id:crypto.randomUUID(),person,delta,reason:"Korekta administratora",createdAt:new Date().toISOString(),actorUid:caller.id});
      const {error}=await admin.from("settings").upsert({id:"main",data:{...current,recoveryBalances:balances,recoveryLedger:ledger},updated_at:new Date().toISOString(),updated_by:caller.id});
      if(error)return json({error:error.message},400);
      await admin.from("audit").insert({action:"adjust-recovery-balance",actor_uid:caller.id,data:{person,delta,next:balances[person]}});
      return json({ok:true,person,delta,next:balances[person]});
    }

    if(action==="update"){
      const {data:current}=await admin.from("users").select("*").eq("uid",uid).maybeSingle();
      if(!current)return json({error:"Profil użytkownika nie istnieje."},404);
      const email=String(body.email??current.email).trim().toLowerCase(), displayName=String(body.displayName??current.display_name).trim();
      const personKey=String(body.personKey??current.person_key), role=String(body.role??current.role), password=String(body.password||"");
      if(!/^\S+@\S+\.\S+$/.test(email)||displayName.length<2||displayName.length>100)return json({error:"Nieprawidłowe dane użytkownika."},400);
      if(!["","P","M","L"].includes(personKey)||!["admin","employee","locator"].includes(role))return json({error:"Nieprawidłowa rola lub przypisanie."},400);
      if(role==="employee"&&!["P","M","L"].includes(personKey))return json({error:"Pracownik musi mieć P/M/L."},400);
      if(role!=="employee"&&personKey!=="")return json({error:"Ta rola nie może mieć P/M/L."},400);
      if(uid===caller.id&&role!=="admin")return json({error:"Nie możesz odebrać sobie roli administratora."},409);
      if(password&&(password.length<6||password.length>128))return json({error:"Hasło musi mieć od 6 do 128 znaków."},400);
      if(personKey&&personKey!==current.person_key){const {data:conflict}=await admin.from("users").select("uid").eq("person_key",personKey).neq("uid",uid).maybeSingle();if(conflict)return json({error:"Ten identyfikator pracownika jest już przypisany."},409);}
      const authUpdate={display_name:displayName,email,...(password?{password}: {})};
      const {error:authUpdateError}=await admin.auth.admin.updateUserById(uid,authUpdate);
      if(authUpdateError)return json({error:authUpdateError.message},400);
      const {error:profileError}=await admin.from("users").update({email,display_name:displayName,person_key:personKey,role,updated_by:caller.id,updated_at:new Date().toISOString()}).eq("uid",uid);
      if(profileError)return json({error:profileError.message},400);
      await admin.from("audit").insert({action:"update-user",actor_uid:caller.id,target_uid:uid});
      return json({ok:true,uid});
    }

    return json({error:"Nieznana operacja."},400);
  }catch(error){console.error(error);return json({error:error instanceof Error?error.message:"Błąd serwera."},500);}
});