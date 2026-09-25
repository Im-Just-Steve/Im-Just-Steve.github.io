/* ==========================================================================
   PHYSICAL LOG BOOK
   IndexedDB storage, page viewer, ordering, selection and ZIP backup.
   ========================================================================== */

/* Physical Log Book ------------------------------------------------------- */
const PHYSICAL_DB_NAME="skylogPhysicalLogbook";
const PHYSICAL_DB_VERSION=1;
const PHYSICAL_STORE="pages";
let physicalPages=[];
let physicalIndex=0;
let physicalEditMode=false;
let physicalSelectedIds=new Set();
let physicalObjectUrl=null;

function physicalDB(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(PHYSICAL_DB_NAME,PHYSICAL_DB_VERSION);
    req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(PHYSICAL_STORE))req.result.createObjectStore(PHYSICAL_STORE,{keyPath:"id"});};
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
}
async function physicalGetAll(){
  const db=await physicalDB();
  return new Promise((resolve,reject)=>{
    const r=db.transaction(PHYSICAL_STORE,"readonly").objectStore(PHYSICAL_STORE).getAll();
    r.onsuccess=()=>resolve(r.result.sort((a,b)=>a.order-b.order));
    r.onerror=()=>reject(r.error);
  });
}
async function physicalPut(page){
  const db=await physicalDB();
  return new Promise((resolve,reject)=>{
    const r=db.transaction(PHYSICAL_STORE,"readwrite").objectStore(PHYSICAL_STORE).put(page);
    r.onsuccess=()=>resolve();
    r.onerror=()=>reject(r.error);
  });
}
async function physicalDelete(id){
  const db=await physicalDB();
  return new Promise((resolve,reject)=>{
    const r=db.transaction(PHYSICAL_STORE,"readwrite").objectStore(PHYSICAL_STORE).delete(id);
    r.onsuccess=()=>resolve();
    r.onerror=()=>reject(r.error);
  });
}
async function physicalClearAll(){
  const db=await physicalDB();
  return new Promise((resolve,reject)=>{
    const r=db.transaction(PHYSICAL_STORE,"readwrite").objectStore(PHYSICAL_STORE).clear();
    r.onsuccess=()=>resolve();
    r.onerror=()=>reject(r.error);
  });
}

async function physicalLoad(){
  physicalPages=await physicalGetAll();
  if(physicalIndex>=physicalPages.length) physicalIndex=Math.max(0,physicalPages.length-1);
  await physicalRender();
}
function physicalFileToPage(file,order){
  return {id:crypto.randomUUID(),order,name:file.name,type:file.type||"image/jpeg",blob:file,addedAt:Date.now()};
}
async function physicalAddFiles(files){
  const list=Array.from(files||[]).filter(f=>f.type.startsWith("image/"));
  if(!list.length)return;
  let order=physicalPages.length;
  for(const file of list) await physicalPut(physicalFileToPage(file,order++));
  await physicalLoad();
  toast(`${list.length} page${list.length===1?"":"s"} added`);
}
async function physicalRender(){
  const empty=$("#physicalPageEmpty"),wrap=$("#physicalPageImageWrap"),img=$("#physicalPageImage"),indicator=$("#physicalPageIndicator");
  const has=physicalPages.length>0;
  empty.classList.toggle("hidden",has);
  wrap.classList.toggle("hidden",!has);
  $("#physicalEditbar").classList.toggle("hidden",!has||!physicalEditMode);
  const deleteBtn=$("#physicalRemove");
  if(deleteBtn){
    const selectedCount=physicalSelectedIds.size;
    deleteBtn.textContent=selectedCount>1?`Delete ${selectedCount} Pages`:"Delete Page";
    deleteBtn.disabled=selectedCount===0;
    deleteBtn.setAttribute("aria-disabled",selectedCount===0?"true":"false");
  }
  if(!has){
    indicator.textContent="No pages";
    $("#physicalPrev").disabled=true;$("#physicalNext").disabled=true;
    $("#physicalSidePrev").disabled=true;$("#physicalSideNext").disabled=true;
    if(physicalObjectUrl){URL.revokeObjectURL(physicalObjectUrl);physicalObjectUrl=null;}
    return;
  }
  indicator.textContent=`Page ${physicalIndex+1} of ${physicalPages.length}`;
  $("#physicalPrev").disabled=physicalIndex===0;
  $("#physicalNext").disabled=physicalIndex===physicalPages.length-1;
  $("#physicalSidePrev").disabled=physicalIndex===0;
  $("#physicalSideNext").disabled=physicalIndex===physicalPages.length-1;
  $("#physicalMoveLeft").disabled=physicalIndex===0;
  $("#physicalMoveRight").disabled=physicalIndex===physicalPages.length-1;
  if(physicalObjectUrl)URL.revokeObjectURL(physicalObjectUrl);
  physicalObjectUrl=URL.createObjectURL(physicalPages[physicalIndex].blob);
  img.src=physicalObjectUrl;
  img.alt=`Physical log book page ${physicalIndex+1}`;
  wrap.classList.toggle("physical-page-selected",physicalSelectedIds.has(physicalPages[physicalIndex].id));
}
async function physicalReorder(delta){
  const j=physicalIndex+delta;
  if(j<0||j>=physicalPages.length)return;
  [physicalPages[physicalIndex],physicalPages[j]]=[physicalPages[j],physicalPages[physicalIndex]];
  physicalPages.forEach((p,i)=>p.order=i);
  for(const p of physicalPages)await physicalPut(p);
  physicalIndex=j;await physicalRender();
}
async function physicalRemove(){
  if(!physicalPages.length)return;
  const selected=physicalSelectedIds.size?physicalPages.filter(p=>physicalSelectedIds.has(p.id)):[physicalPages[physicalIndex]];
  const count=selected.length;
  if(!confirm(`Delete ${count} physical log book page${count===1?"":"s"}?`))return;
  for(const p of selected)await physicalDelete(p.id);
  physicalPages=physicalPages.filter(p=>!physicalSelectedIds.has(p.id));
  physicalPages.forEach((p,i)=>p.order=i);
  for(const p of physicalPages)await physicalPut(p);
  physicalSelectedIds.clear();
  physicalIndex=Math.min(physicalIndex,Math.max(0,physicalPages.length-1));
  await physicalRender();
  toast(`${count} page${count===1?"":"s"} deleted`);
}

function crc32(bytes){
  let c=0xffffffff;
  for(const b of bytes){c^=b;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0);}
  return (c^0xffffffff)>>>0;
}
function u16(n){return new Uint8Array([n&255,(n>>>8)&255]);}
function u32(n){return new Uint8Array([n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255]);}
function concatBytes(...arrs){
  const n=arrs.reduce((s,a)=>s+a.length,0),out=new Uint8Array(n);let p=0;
  for(const a of arrs){out.set(a,p);p+=a.length;}return out;
}
async function deflateRaw(bytes){
  if(!("CompressionStream" in window))return {bytes,method:0};
  try{
    const cs=new CompressionStream("deflate-raw"),w=cs.writable.getWriter();
    w.write(bytes);w.close();
    return {bytes:new Uint8Array(await new Response(cs.readable).arrayBuffer()),method:8};
  }catch(_){return {bytes,method:0};}
}
async function inflateRaw(bytes){
  const ds=new DecompressionStream("deflate-raw"),w=ds.writable.getWriter();
  w.write(bytes);w.close();
  return new Uint8Array(await new Response(ds.readable).arrayBuffer());
}
function zipLocalHeader(name,method,crc,compSize,size){
  const enc=new TextEncoder().encode(name);
  return concatBytes(new Uint8Array([80,75,3,4]),u16(20),u16(0),u16(method),u16(0),u16(0),u32(crc),u32(compSize),u32(size),u16(enc.length),u16(0),enc);
}
async function physicalExportZip(){
  if(!physicalPages.length){alert("There are no physical log book pages to export.");return;}
  const files=[],meta={version:1,pages:physicalPages.map((p,i)=>({page:i+1,name:p.name,type:p.type}))};
  const metaBytes=new TextEncoder().encode(JSON.stringify(meta,null,2));
  files.push(["physical-logbook.json",metaBytes]);
  for(let i=0;i<physicalPages.length;i++)files.push([`page-${String(i+1).padStart(3,"0")}.${(physicalPages[i].type.split("/")[1]||"jpg").replace("jpeg","jpg")}`,new Uint8Array(await physicalPages[i].blob.arrayBuffer())]);
  const chunks=[];let offset=0,central=[];
  for(const [name,raw] of files){
    const z=await deflateRaw(raw),crc=crc32(raw),head=zipLocalHeader(name,z.method,crc,z.bytes.length,raw.length);
    chunks.push(head,z.bytes);
    const enc=new TextEncoder().encode(name);
    central.push(concatBytes(new Uint8Array([80,75,1,2]),u16(20),u16(20),u16(0),u16(z.method),u16(0),u16(0),u32(crc),u32(z.bytes.length),u32(raw.length),u16(enc.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(offset),enc));
    offset+=head.length+z.bytes.length;
  }
  const centralBytes=concatBytes(...central),localBytes=concatBytes(...chunks);
  const end=concatBytes(new Uint8Array([80,75,5,6]),u16(0),u16(0),u16(files.length),u16(files.length),u32(centralBytes.length),u32(localBytes.length),u16(0));
  const blob=new Blob([localBytes,centralBytes,end],{type:"application/zip"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`SkyLog_Physical_Logbook_${new Date().toISOString().slice(0,10)}.zip`;a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);toast("Physical log book ZIP exported");
}
function readU16(a,p){return a[p]|a[p+1]<<8}
function readU32(a,p){return (a[p]|a[p+1]<<8|a[p+2]<<16|a[p+3]<<24)>>>0}
async function physicalImportZip(file){
  try{
    const a=new Uint8Array(await file.arrayBuffer()),items=[];
    let p=0;
    while(p+30<=a.length && readU32(a,p)===0x04034b50){
      const flags=readU16(a,p+6);
      if(flags&0x08) throw new Error("ZIP data descriptors are not supported");
      const method=readU16(a,p+8),comp=readU32(a,p+18),size=readU32(a,p+22),nl=readU16(a,p+26),xl=readU16(a,p+28);
      const name=new TextDecoder().decode(a.slice(p+30,p+30+nl));
      const startData=p+30+nl+xl;
      const raw=a.slice(startData,startData+comp);
      let bytes;
      if(method===8) bytes=await inflateRaw(raw);
      else if(method===0) bytes=raw;
      else throw new Error("Unsupported ZIP compression");
      if(bytes.length!==size) throw new Error("Invalid ZIP entry");
      if(/^page-\d+\.(jpg|jpeg|png|webp)$/i.test(name))items.push({name,bytes});
      p=startData+comp;
    }
    if(!items.length)throw new Error("No physical log book pages were found in this ZIP.");
    items.sort((a,b)=>a.name.localeCompare(b.name,navigator.language,{numeric:true}));
    let order=physicalPages.length;
    for(const item of items){
      const ext=(item.name.split(".").pop()||"jpg").toLowerCase();
      const type=ext==="png"?"image/png":ext==="webp"?"image/webp":"image/jpeg";
      await physicalPut({id:crypto.randomUUID(),order:order++,name:item.name,type,blob:new Blob([item.bytes],{type}),addedAt:Date.now()});
    }
    await physicalLoad();
    toast(`${items.length} physical log book page${items.length===1?"":"s"} imported`);
  }catch(err){
    console.error("Physical log book ZIP import failed",err);
    alert(`Could not import the physical log book ZIP. ${err.message||"The file may be invalid or unsupported."}`);
  }
}

function bindPhysicalLogbook(){
  $("#physicalLogbookInput").addEventListener("change",e=>{physicalAddFiles(e.target.files);e.target.value="";});
  const physicalGoPrev=()=>{if(physicalIndex>0){physicalIndex--;physicalRender();}};
  const physicalGoNext=()=>{if(physicalIndex<physicalPages.length-1){physicalIndex++;physicalRender();}};
  $("#physicalPrev").onclick=physicalGoPrev;
  $("#physicalNext").onclick=physicalGoNext;
  $("#physicalSidePrev").onclick=physicalGoPrev;
  $("#physicalSideNext").onclick=physicalGoNext;
  $("#physicalStartEditBtn").onclick=async()=>{
    physicalEditMode=true;
    physicalSelectedIds.clear();
    $("#physicalStartEditBtn").classList.add("hidden");
    $("#physicalEditBtn").classList.remove("hidden");
    await physicalRender();
  };
  $("#physicalEditBtn").onclick=async()=>{
    physicalEditMode=false;
    physicalSelectedIds.clear();
    $("#physicalEditBtn").classList.add("hidden");
    $("#physicalStartEditBtn").classList.remove("hidden");
    await physicalRender();
  };
  $("#physicalMoveLeft").onclick=()=>physicalReorder(-1);
  $("#physicalMoveRight").onclick=()=>physicalReorder(1);
  $("#physicalRemove").onclick=physicalRemove;
  $("#physicalPageImageWrap").addEventListener("click",()=>{
    if(!physicalEditMode||!physicalPages.length)return;
    const id=physicalPages[physicalIndex].id;
    if(physicalSelectedIds.has(id)) physicalSelectedIds.delete(id);
    else physicalSelectedIds.add(id);
    physicalRender();
  });
  physicalLoad();
}


