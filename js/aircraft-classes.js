/* ==========================================================================
   AIRCRAFT CLASS MANAGEMENT
   ========================================================================== */

function escapeHtml(value){
  return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
async function loadAircraftClasses(){
  try{
    aircraftClasses=await getAircraftClasses();
  }catch(err){
    console.error("Could not load aircraft classes",err);
    aircraftClasses=[];
  }
  aircraftClasses.sort((a,b)=>a.name.localeCompare(b.name));
  renderAircraftClasses();
}
function renderAircraftClasses(){
  const el=$("#aircraftClassesList");
  if(!el) return;
  if(!aircraftClasses.length){
    el.innerHTML="";
    return;
  }
  el.innerHTML=aircraftClasses.map(c=>`
    <div class="aircraft-class" data-class-id="${escapeHtml(c.id)}">
      <div class="class-header">
        <input class="class-name-input" value="${escapeHtml(c.name)}" maxlength="40" aria-label="Class name">
        <div class="class-actions">
          <button type="button" class="secondary save-action save-class">Save</button>
          <button type="button" class="danger delete-action delete-class">Delete</button>
        </div>
      </div>
      <div class="class-types">
        <div class="types-heading">Aircraft types</div>
        <div class="type-list">
          ${(c.types||[]).map((t,i)=>`<div class="type-chip"><span>${escapeHtml(t)}</span><button type="button" class="remove-type delete-action" data-index="${i}" aria-label="Remove ${escapeHtml(t)}">×</button></div>`).join("") || '<span class="muted">No types added yet.</span>'}
        </div>
        <div class="add-type-row">
          <input class="new-type-input" type="text" maxlength="30" placeholder="e.g. C172">
          <button type="button" class="secondary add-action add-type">Add type</button>
        </div>
      </div>
    </div>`).join("");

  el.querySelectorAll(".save-class").forEach(btn=>btn.addEventListener("click",async e=>{
    const card=e.target.closest(".aircraft-class"), c=aircraftClasses.find(x=>x.id===card.dataset.classId);
    const name=card.querySelector(".class-name-input").value.trim();
    if(!name){toast("Class name cannot be blank.");return;}
    if(aircraftClasses.some(x=>x.id!==c.id && x.name.toLowerCase()===name.toLowerCase())){toast("That class already exists.");return;}
    c.name=name;
    await saveAircraftClass(c);
    await loadAircraftClasses();
    toast("Aircraft class saved.");
  }));
  el.querySelectorAll(".delete-class").forEach(btn=>btn.addEventListener("click",async e=>{
    const card=e.target.closest(".aircraft-class"), c=aircraftClasses.find(x=>x.id===card.dataset.classId);
    if(!confirm(`Delete aircraft class "${c.name}" and its aircraft types?`))return;
    await deleteAircraftClass(c.id);
    await loadAircraftClasses();
  }));
  el.querySelectorAll(".add-type").forEach(btn=>btn.addEventListener("click",async e=>{
    const card=e.target.closest(".aircraft-class"), c=aircraftClasses.find(x=>x.id===card.dataset.classId);
    const input=card.querySelector(".new-type-input"), type=input.value.trim().toUpperCase();
    if(!type){return;}
    c.types=c.types||[];
    if(c.types.some(x=>x.toLowerCase()===type.toLowerCase())){toast("That aircraft type is already in this class.");return;}
    c.types.push(type);
    await saveAircraftClass(c);
    await loadAircraftClasses();
  }));
  el.querySelectorAll(".new-type-input").forEach(input=>input.addEventListener("keydown",e=>{
    if(e.key==="Enter") input.closest(".aircraft-class").querySelector(".add-type").click();
  }));
  el.querySelectorAll(".remove-type").forEach(btn=>btn.addEventListener("click",async e=>{
    const card=e.target.closest(".aircraft-class"), c=aircraftClasses.find(x=>x.id===card.dataset.classId);
    c.types.splice(Number(e.target.dataset.index),1);
    await saveAircraftClass(c);
    await loadAircraftClasses();
  }));
}
async function addAircraftClass(){
  const input=$("#newClassName"), name=input.value.trim();
  if(!name){toast("Enter a class name.");return;}
  if(aircraftClasses.some(x=>x.name.toLowerCase()===name.toLowerCase())){toast("That class already exists.");return;}
  await saveAircraftClass({id:crypto.randomUUID(),name,types:[]});
  input.value="";
  await loadAircraftClasses();
}

