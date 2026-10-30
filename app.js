"use strict";
(() => {
  const SUPABASE_URL = "https://vosvdkkuiijywwmqzdiu.supabase.co";
  // This is a public/publishable frontend key, NOT a service-role key. Tables are protected by RLS.
  const SUPABASE_KEY = "sb_publishable_jlCywbu7vWBsZyw1dbfbvg_kezvqwvr";
  const $ = id => document.getElementById(id);
  const state = { items: [], status: "missing", admin: false, user: null, busy: new Set(), loaded: false };
  let client, toastTimer, intervalId, loginInProgress = false;

  const e = value => String(value ?? "").replace(/[&<>"']/g, char => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  })[char]);
  const clean = value => String(value ?? "").trim();
  const display = value => clean(value) || "Not specified";
  const formatDate = date => date ? new Date(date).toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"}) : "";
  const notify = (message, isError=false) => {
    const el = $("toast");
    el.textContent = message;
    el.style.background = isError ? "#8a3030" : "#123959";
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 3300);
  };
  const sync = (label, isError=false) => {
    const el = $("syncStatus"); el.lastChild.textContent = " " + label; el.classList.toggle("error",isError);
  };
  function showLogin(message="") {
    $("app").hidden = true;
    $("loginScreen").hidden = false;
    $("loginError").textContent = message;
    state.items = []; state.loaded = false;
  }
  function showApp() {
    $("loginScreen").hidden = true;
    $("app").hidden = false;
    $("userLabel").textContent = state.user?.email || "";
  }
  function refreshCounters() {
    const total = state.items.length;
    const found = state.items.filter(i=>i.found).length;
    const missing = total-found;
    const percentage = total ? Math.round(found/total*100) : 0;
    $("totalCount").textContent = total; $("foundCount").textContent = found; $("missingCount").textContent = missing;
    $("tabMissing").textContent = missing; $("tabAll").textContent = total; $("tabFound").textContent = found;
    $("percent").textContent = percentage + "%";
    $("progressFill").style.width = percentage + "%";
    $("progressRing").style.background = `conic-gradient(#22895e 0% ${percentage}%, #e5ecf3 ${percentage}% 100%)`;
    $("progressText").textContent = found + " of " + total + " located";
  }
  function rebuildSelect(id, values, blankLabel) {
    const el = $(id), previous = el.value;
    const sorted = [...new Set(values.map(clean).filter(Boolean))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
    const options = ['<option value="">'+e(blankLabel)+'</option>', ...sorted.map(v=>'<option value="'+e(v)+'">'+e(v)+'</option>')];
    el.innerHTML = options.join("");
    if(sorted.includes(previous)) el.value = previous;
  }
  function rebuildFilters() {
    rebuildSelect("nounSelect",state.items.map(i=>i.noun),"All equipment");
    rebuildSelect("locationSelect",state.items.map(i=>clean(i.location)||"(No location)"),"All locations");
    rebuildSelect("assignedSelect",state.items.map(i=>clean(i.assigned_to)||"(Unassigned)"),"Everyone / unassigned");
  }
  function filteredItems() {
    const q = $("searchInput").value.toLocaleLowerCase().trim();
    const noun = $("nounSelect").value, location = $("locationSelect").value, assigned = $("assignedSelect").value;
    return state.items.filter(item => {
      if(state.status === "missing" && item.found) return false;
      if(state.status === "found" && !item.found) return false;
      if(noun && item.noun !== noun) return false;
      if(location && (clean(item.location) || "(No location)") !== location) return false;
      if(assigned && (clean(item.assigned_to) || "(Unassigned)") !== assigned) return false;
      if(q && ![item.property_tag,item.noun,item.make,item.model,item.location,item.assigned_to].some(v=>String(v||"").toLocaleLowerCase().includes(q))) return false;
      return true;
    }).sort((a,b) =>
      Number(a.found)-Number(b.found) ||
      (clean(a.location) ? 0 : 1) - (clean(b.location) ? 0 : 1) ||
      (a.location||"").localeCompare(b.location||"",undefined,{numeric:true}) ||
      a.noun.localeCompare(b.noun) ||
      a.property_tag.localeCompare(b.property_tag,undefined,{numeric:true})
    );
  }
  function rowHTML(item) {
    const checked = item.found;
    const busy = state.busy.has(item.property_tag);
    const location = clean(item.location);
    const person = clean(item.assigned_to);
    const verifiedText = checked ? (item.found_at ? formatDate(item.found_at) : "From spreadsheet") : "—";
    return `<tr class="${checked ? "is-found":""}">
      <td class="check-cell"><label class="check-label" title="${checked ? "Mark as not found" : "Mark as found"}">
        <input type="checkbox" data-tag="${e(item.property_tag)}" ${checked?"checked":""} ${busy?"disabled":""} aria-label="${checked?"Uncheck":"Mark found"}: ${e(item.property_tag)}">
        <span class="custom-check" aria-hidden="true">✓</span></label></td>
      <td><span class="tag-text">${e(item.property_tag)}</span></td>
      <td><div class="item-title">${e(item.noun)}</div><div class="item-details">${e(item.make)} · ${e(item.model)}</div></td>
      <td><div class="item-location ${location?"":"no-data"}">${e(location||"Location not recorded")}</div>
        ${person ? '<div class="item-person">'+e(person)+'</div>' : ''}</td>
      <td><span class="${checked?"verified":"not-verified"}">${e(verifiedText)}</span></td>
    </tr>`;
  }
  function render() {
    if(!state.loaded)return;
    refreshCounters();
    const rows = filteredItems();
    $("inventoryBody").innerHTML = rows.map(rowHTML).join("");
    $("emptyState").hidden = rows.length !== 0;
    $("visibleCount").textContent = rows.length;
    $("resultSummary").textContent = "Showing " + rows.length + " of " + state.items.length + " items";
    document.querySelectorAll(".tab").forEach(btn=>{const active=btn.dataset.status===state.status;btn.classList.toggle("active",active);btn.setAttribute("aria-pressed",String(active));});
  }
  async function loadInventory(quiet=false) {
    if(!quiet) sync("Syncing…");
    const {data,error} = await client.from("wing_inventory_items")
      .select("property_tag,unit,noun,make,model,location,assigned_to,found,found_at,found_by,updated_at")
      .eq("unit","MT-001").order("property_tag");
    if(error) {sync("Sync error",true);if(!quiet)notify("Could not load inventory: "+error.message,true);return false;}
    if(!data?.length) {sync("No access",true);if(!quiet) notify("You do not have inventory access. Ask an administrator.",true);return false;}
    // A periodic refresh must never overwrite a checkbox while it is being saved.
    const pending = new Map(state.items.filter(item=>state.busy.has(item.property_tag)).map(item=>[item.property_tag,item]));
    state.items = data.map(item=>pending.get(item.property_tag)||item);
    state.loaded = true;
    rebuildFilters();render();sync("Saved · shared");
    return true;
  }
  async function startApp(session) {
    if(!session?.user) return showLogin();
    state.user = session.user;
    const {data:profile,error:profileError} = await client.from("profiles").select("is_app_admin").eq("id",state.user.id).maybeSingle();
    state.admin = !profileError && profile?.is_app_admin === true;
    $("manageBtn").hidden = !state.admin;
    const ok = await loadInventory();
    if(!ok) {
      await client.auth.signOut();
      showLogin("Your account is not approved for Wing Inventory. Ask the CAP Applications administrator to add your email.");
      return;
    }
    showApp();
    clearInterval(intervalId);
    intervalId = setInterval(()=>{if(!document.hidden && state.busy.size===0)loadInventory(true);},45000);
  }
  async function toggleFound(tag,newFound) {
    const item = state.items.find(i=>i.property_tag===tag);
    if(!item || state.busy.has(tag))return;
    const previous = {...item};
    state.busy.add(tag);
    item.found = newFound;
    render();
    const stamp = new Date().toISOString();
    try {
      const {data,error} = await client.from("wing_inventory_items").update({
        found:newFound,
        found_at:newFound?stamp:null,
        found_by:newFound?state.user.id:null,
        updated_at:stamp
      }).eq("property_tag",tag).eq("found",previous.found)
        .select("property_tag,found,found_at,found_by,updated_at").maybeSingle();
      if(error)throw error;
      if(!data)throw new Error("Another user updated this item first. Inventory will refresh.");
      Object.assign(item,data);
      notify((newFound?"Found and saved: ":"Unchecked: ")+tag);
      sync("Saved · shared");
    } catch(err) {
      Object.assign(item,previous);
      sync("Save failed",true);
      notify("Not saved: "+err.message,true);
      await loadInventory(true);
    } finally {state.busy.delete(tag);render();}
  }
  function clearFilters() {
    $("searchInput").value=""; $("nounSelect").value="";$("locationSelect").value="";$("assignedSelect").value="";
    state.status="missing";render();
  }
  function exportCSV() {
    const header=["Found","Property Tag","Noun","Make","Model","Location","Assigned To","Found At"];
    // Avoid spreadsheet formula injection in downloaded CSV cells.
    const cell = value => {
      let str=String(value??"");
      if(/^[=+\-@\t\r]/.test(str))str="'"+str;
      return '"'+str.replace(/"/g,'""')+'"';
    };
    const rows=state.items.map(item=>[item.found?"X":"",item.property_tag,item.noun,item.make,item.model,item.location,item.assigned_to,item.found_at||""]);
    const csv="\ufeff"+[header,...rows].map(row=>row.map(cell).join(",")).join("\r\n");
    const blob=new Blob([csv],{type:"text/csv;charset=utf-8;"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");a.href=url;a.download="MT-001_Inventory_"+new Date().toISOString().slice(0,10)+".csv";document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    notify("Inventory exported");
  }
  async function loadInvites() {
    const el=$("inviteList");el.textContent="Loading…";
    const {data,error}=await client.from("wing_inventory_invites").select("email,granted_at").order("email");
    if(error){el.textContent="Could not load users: "+error.message;return;}
    if(!data?.length){el.innerHTML='<div class="invite-item">No additional people authorized yet.</div>';return;}
    el.innerHTML=data.map(row=>`<div class="invite-item"><span>${e(row.email)}</span><button data-remove-email="${e(row.email)}" title="Remove access">Remove</button></div>`).join("");
  }
  async function init() {
    if(!window.supabase?.createClient){showLogin("Unable to load the login service. Check your connection and refresh.");return;}
    client=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
    client.auth.onAuthStateChange((event,session)=>{
      if(event==="SIGNED_OUT"){clearInterval(intervalId);showLogin();}
      if(event==="TOKEN_REFRESHED" && session?.user) state.user=session.user;
    });
    const {data:{session}}=await client.auth.getSession();
    if(session) await startApp(session);
    else showLogin();
  }
  $("loginForm").addEventListener("submit",async event=>{
    event.preventDefault();if(loginInProgress)return;
    loginInProgress=true;$("loginBtn").disabled=true;$("loginBtn").firstChild.textContent="Signing in… ";
    $("loginError").textContent="";
    try {
      if(!client)throw new Error("Login service unavailable. Reload the page.");
      const {data,error}=await client.auth.signInWithPassword({email:$("loginEmail").value.trim(),password:$("loginPassword").value});
      if(error)throw error;
      $("loginPassword").value="";
      await startApp(data.session);
    } catch(err){$("loginError").textContent=err.message;}
    finally{loginInProgress=false;$("loginBtn").disabled=false;$("loginBtn").firstChild.textContent="Sign in ";}
  });
  $("logoutBtn").addEventListener("click",async()=>{clearInterval(intervalId);await client.auth.signOut();showLogin();});
  $("refreshBtn").addEventListener("click",()=>loadInventory());
  $("exportBtn").addEventListener("click",exportCSV);
  $("searchInput").addEventListener("input",render);
  ["nounSelect","locationSelect","assignedSelect"].forEach(id=>$(id).addEventListener("change",render));
  ["clearBtn","emptyClearBtn"].forEach(id=>$(id).addEventListener("click",clearFilters));
  document.querySelectorAll(".tab").forEach(btn=>btn.addEventListener("click",()=>{state.status=btn.dataset.status;render();}));
  $("inventoryBody").addEventListener("change",event=>{
    if(!event.target.matches('input[type="checkbox"][data-tag]'))return;
    toggleFound(event.target.dataset.tag,event.target.checked);
  });
  document.addEventListener("keydown",event=>{
    if(event.key==="/" && !["INPUT","TEXTAREA","SELECT"].includes(document.activeElement.tagName) && !$("app").hidden){event.preventDefault();$("searchInput").focus();}
    if(event.key==="Escape" && document.activeElement===$("searchInput"))$("searchInput").blur();
  });
  document.addEventListener("visibilitychange",()=>{if(!document.hidden&&state.loaded&&state.busy.size===0)loadInventory(true);});
  $("manageBtn").addEventListener("click",()=>{$("accessDialog").showModal();loadInvites();});
  $("closeDialog").addEventListener("click",()=>$("accessDialog").close());
  $("accessDialog").addEventListener("click",event=>{if(event.target===$("accessDialog"))$("accessDialog").close();});
  $("inviteForm").addEventListener("submit",async event=>{
    event.preventDefault();$("inviteError").textContent="";
    const email=$("inviteEmail").value.trim().toLowerCase();
    const {error}=await client.from("wing_inventory_invites").insert({email,granted_by:state.user.id});
    if(error){$("inviteError").textContent=error.message;return;}
    $("inviteEmail").value="";notify("Access granted to "+email);await loadInvites();
  });
  $("inviteList").addEventListener("click",async event=>{
    const button=event.target.closest("[data-remove-email]");if(!button)return;
    const email=button.dataset.removeEmail;
    if(!confirm("Remove inventory access for "+email+"?"))return;
    button.disabled=true;
    const {error}=await client.from("wing_inventory_invites").delete().eq("email",email);
    if(error){notify("Could not remove: "+error.message,true);button.disabled=false;return;}
    notify("Access removed for "+email);await loadInvites();
  });
  init().catch(err=>showLogin("Could not start: "+err.message));
})();
