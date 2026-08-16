const $=s=>document.querySelector(s);
let APP_VERSION="";

async function loadAppVersion(){
  try{
    const response=await fetch("./version.json",{cache:"no-cache"});
    if(!response.ok) throw new Error("Version file unavailable");
    const info=await response.json();
    APP_VERSION=String(info.version||"").trim();
  }catch(err){
    APP_VERSION="Unknown";
  }
  const versionEl=$("#appVersion");
  if(versionEl) versionEl.textContent=APP_VERSION;
}

let flights=[];
let deferredInstall=null;
let refreshing=false;
let aircraftClasses=[];
let statsSelectedItem=null;


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


/* Phase 1: physical logbook page capture, crop and perspective correction */
let scanImage=null, scanSourceFile=null, scanCorners=[], scanDragIndex=-1, scanRotation=0;

function scanClamp(v,min,max){return Math.max(min,Math.min(max,v));}
function scanResetCorners(){
  if(!scanImage)return;
  const w=scanImage.naturalWidth,h=scanImage.naturalHeight;
  const inset=Math.min(w,h)*0.075;
  scanCorners=[
    {x:inset,y:inset},
    {x:w-inset,y:inset},
    {x:w-inset,y:h-inset},
    {x:inset,y:h-inset}
  ];
}
function scanRotateSource(){
  if(!scanImage)return;
  const c=document.createElement("canvas"),ctx=c.getContext("2d");
  c.width=scanImage.naturalHeight;c.height=scanImage.naturalWidth;
  ctx.translate(c.width/2,c.height/2);ctx.rotate(Math.PI/2);
  ctx.drawImage(scanImage,-scanImage.naturalWidth/2,-scanImage.naturalHeight/2);
  const rotated=new Image();
  rotated.onload=()=>{scanImage=rotated;scanMagnifierSourceCanvas=null;scanResetCorners();scanDraw();};
  rotated.src=c.toDataURL("image/jpeg",0.96);
}
function scanCanvasPoint(e){
  const c=$("#scanCanvas"),r=c.getBoundingClientRect();
  // scanCorners are stored in the original image's natural pixel coordinates.
  // c.width/c.height are deliberately scaled down for display, so using them
  // here causes an iOS-only-looking jump/offset after the first touch.
  const naturalW=scanImage?.naturalWidth||c.width;
  const naturalH=scanImage?.naturalHeight||c.height;
  return {
    x:scanClamp((e.clientX-r.left)*(naturalW/r.width),0,naturalW),
    y:scanClamp((e.clientY-r.top)*(naturalH/r.height),0,naturalH)
  };
}
function scanDraw(){
  if(!scanImage)return;
  const wrap=$("#scanCanvasWrap"),c=$("#scanCanvas"),ctx=c.getContext("2d");
  const maxW=Math.max(900,Math.min(1800,wrap.clientWidth||1200));
  const scale=Math.min(1,maxW/scanImage.naturalWidth);
  c.width=Math.round(scanImage.naturalWidth*scale);
  c.height=Math.round(scanImage.naturalHeight*scale);
  ctx.clearRect(0,0,c.width,c.height);
  ctx.drawImage(scanImage,0,0,c.width,c.height);
  scanCorners.forEach((p,i)=>{
    const el=document.querySelector(`.scan-corner[data-corner="${i}"]`);
    el.style.left=`${p.x/scanImage.naturalWidth*100}%`;
    el.style.top=`${p.y/scanImage.naturalHeight*100}%`;
  });
  scanUpdatePreview();
}
function solve8(A,b){
  const n=8,M=A.map((r,i)=>r.concat([b[i]]));
  for(let i=0;i<n;i++){
    let max=i;for(let r=i+1;r<n;r++)if(Math.abs(M[r][i])>Math.abs(M[max][i]))max=r;
    [M[i],M[max]]=[M[max],M[i]];
    if(Math.abs(M[i][i])<1e-10)return null;
    for(let r=i+1;r<n;r++){const f=M[r][i]/M[i][i];for(let j=i;j<=n;j++)M[r][j]-=f*M[i][j];}
  }
  const x=new Array(n);
  for(let i=n-1;i>=0;i--){let v=M[i][n];for(let j=i+1;j<n;j++)v-=M[i][j]*x[j];x[i]=v/M[i][i];}
  return x;
}
function homography(srcPts,dstW,dstH,dstPtsOverride=null){
  const dstPts=dstPtsOverride||[
    {x:0,y:0},{x:dstW,y:0},{x:dstW,y:dstH},{x:0,y:dstH}
  ];
  const A=[],b=[];
  srcPts.forEach((p,i)=>{
    const q=dstPts[i],x=p.x,y=p.y,u=q.x,v=q.y;
    A.push([x,y,1,0,0,0,-u*x,-u*y]);b.push(u);
    A.push([0,0,0,x,y,1,-v*x,-v*y]);b.push(v);
  });
  return solve8(A,b);
}

function scanCorrectedCanvas(){
  if(!scanImage)return null;

  const [tl,tr,br,bl]=scanCorners;
  const top=Math.hypot(tr.x-tl.x,tr.y-tl.y);
  const bottom=Math.hypot(br.x-bl.x,br.y-bl.y);
  const left=Math.hypot(bl.x-tl.x,bl.y-tl.y);
  const right=Math.hypot(br.x-tr.x,br.y-tr.y);

  // Preserve the photographed page's aspect ratio while producing a
  // sensible, high-resolution image for the Physical Log Book.
  const pageW=Math.max(1,(top+bottom)/2);
  const pageH=Math.max(1,(left+right)/2);
  const ratio=pageW/pageH;
  let outW=1600,outH=Math.round(outW/ratio);
  if(outH>1800){outH=1800;outW=Math.round(outH*ratio);}
  outW=Math.max(800,outW);
  outH=Math.max(500,outH);

  // IMPORTANT: solve the homography in the direction we actually sample:
  // destination rectangle -> the four selected source corners.
  // This avoids the blank/white output caused by attempting to invert the
  // source->destination matrix pixel-by-pixel.
  const dstPts=[
    {x:0,y:0},
    {x:outW,y:0},
    {x:outW,y:outH},
    {x:0,y:outH}
  ];
  const H=homography(dstPts,outW,outH,scanCorners);
  if(!H)return null;

  const [a,b,c,d,e,f,g,h]=H;
  const srcCanvas=document.createElement("canvas");
  srcCanvas.width=scanImage.naturalWidth;
  srcCanvas.height=scanImage.naturalHeight;
  const sctx=srcCanvas.getContext("2d",{willReadFrequently:true});
  sctx.drawImage(scanImage,0,0);
  const sw=srcCanvas.width,sh=srcCanvas.height;
  const sd=sctx.getImageData(0,0,sw,sh).data;

  const out=document.createElement("canvas");
  out.width=outW;
  out.height=outH;
  const octx=out.getContext("2d");
  const result=octx.createImageData(outW,outH);
  const rd=result.data;

  for(let y=0;y<outH;y++){
    for(let x=0;x<outW;x++){
      const den=g*x+h*y+1;
      if(Math.abs(den)<1e-10)continue;

      const sx=(a*x+b*y+c)/den;
      const sy=(d*x+e*y+f)/den;

      // Bilinear interpolation gives a much cleaner result than nearest
      // neighbour, especially for photographed handwriting.
      const x0=Math.floor(sx),y0=Math.floor(sy);
      const x1=x0+1,y1=y0+1;
      const wx=sx-x0,wy=sy-y0;
      if(x0<0||y0<0||x1>=sw||y1>=sh)continue;

      const i00=(y0*sw+x0)*4;
      const i10=(y0*sw+x1)*4;
      const i01=(y1*sw+x0)*4;
      const i11=(y1*sw+x1)*4;
      const di=(y*outW+x)*4;

      for(let ch=0;ch<3;ch++){
        const topv=sd[i00+ch]*(1-wx)+sd[i10+ch]*wx;
        const botv=sd[i01+ch]*(1-wx)+sd[i11+ch]*wx;
        rd[di+ch]=Math.round(topv*(1-wy)+botv*wy);
      }
      rd[di+3]=255;
    }
  }

  octx.putImageData(result,0,0);
  return out;
}
function scanUpdatePreview(){
  const out=scanCorrectedCanvas(),p=$("#scanPreviewCanvas");
  if(!out||!p)return;
  const maxW=700,maxH=420,scale=Math.min(1,maxW/out.width,maxH/out.height);
  p.width=Math.round(out.width*scale);p.height=Math.round(out.height*scale);
  p.getContext("2d").drawImage(out,0,0,p.width,p.height);
}
async function scanAddToPhysical(){
  const out=scanCorrectedCanvas();if(!out)return;
  const blob=await new Promise(r=>out.toBlob(r,"image/jpeg",.94));
  if(!blob || blob.size<1000){
    alert("The corrected page could not be created. Please adjust the four corners and try again.");
    return;
  }
  const page=physicalFileToPage(
    new File([blob],"physical-logbook-page.jpg",{type:"image/jpeg"}),
    physicalPages.length
  );
  await physicalPut(page);
  await physicalLoad();

  // The captured source image is temporary. Release it and return the
  // importer to its first page so the next scan starts completely fresh.
  if(scanImage)scanImage=null;
  scanMagnifierSourceCanvas=null;
  scanSourceFile=null;
  scanCorners=[];
  scanRotation=0;
  const input=$("#scanLogbookInput");
  if(input)input.value="";
  $("#scanEditorPanel").classList.add("hidden");
  $("#scanSourcePanel").classList.remove("hidden");
  toast("Corrected page added to Physical Log Book");
}

/* Phase 2: Pooleys page structure detection.
   The Pooleys layout is a fixed printed template, so we identify its
   geometry from the corrected page rather than trying to OCR handwriting yet. */
const POOLEYS_TEMPLATE={
  rows:10,
  left:{
    x:0.020,y:0.265,w:0.475,h:0.665,
    fields:[
      ["Date",0.00,0.092],
      ["Aircraft Type",0.092,0.213],
      ["Registration",0.213,0.321],
      ["Captain",0.321,0.485],
      ["Operating Capacity",0.485,0.567],
      ["From",0.567,0.715],
      ["To",0.715,0.865],
      ["Departure",0.865,0.934],
      ["Arrival",0.934,1.00]
    ]
  },
  right:{
    x:0.505,y:0.205,w:0.485,h:0.73,
    fields:[
      ["Flying Time / Role",0.00,0.575],
      ["Instrument",0.575,0.655],
      ["Simulated Instrument",0.655,0.705],
      ["Day / Night TO",0.705,0.80],
      ["Day / Night LDG",0.80,0.89],
      ["Remarks",0.89,1.00]
    ]
  }
};

function scanStructureDraw(){
  const source=scanCorrectedCanvas();
  if(!source)return;
  const canvas=$("#scanStructureCanvas");
  const wrap=$("#scanStructureView");
  const maxW=Math.max(700,Math.min(1600,wrap.clientWidth||1200));
  const scale=Math.min(1,maxW/source.width);
  canvas.width=Math.round(source.width*scale);
  canvas.height=Math.round(source.height*scale);
  const ctx=canvas.getContext("2d");
  ctx.drawImage(source,0,0,canvas.width,canvas.height);

  const overlay=$("#scanStructureOverlay");
  overlay.innerHTML="";
  const pageW=canvas.width,pageH=canvas.height;

  const addBox=(left,top,width,height,label,kind)=>{
    const el=document.createElement("div");
    el.className=`scan-detect-box ${kind}`;
    el.style.left=`${left*100}%`;
    el.style.top=`${top*100}%`;
    el.style.width=`${width*100}%`;
    el.style.height=`${height*100}%`;
    el.title=label;
    const tag=document.createElement("span");
    tag.textContent=label;
    el.appendChild(tag);
    overlay.appendChild(el);
  };

  // Left-hand flight table.
  const L=POOLEYS_TEMPLATE.left;
  const rowY=L.y, rowH=L.h/POOLEYS_TEMPLATE.rows;
  for(let i=0;i<POOLEYS_TEMPLATE.rows;i++){
    addBox(L.x,rowY+i*rowH,L.w,rowH,`Flight row ${i+1}`,"row");
  }
  L.fields.forEach(([label,x1,x2])=>{
    addBox(L.x+L.w*x1,L.y,L.w*(x2-x1),L.h,label,"field");
  });

  // Right-hand table fields. Its horizontal flight rows line up with the
  // left table, so show the same row detection on the corresponding area.
  const R=POOLEYS_TEMPLATE.right;
  for(let i=0;i<POOLEYS_TEMPLATE.rows;i++){
    addBox(R.x,R.y+i*(R.h/POOLEYS_TEMPLATE.rows),R.w,R.h/POOLEYS_TEMPLATE.rows,`Flight row ${i+1}`,"row");
  }
  R.fields.forEach(([label,x1,x2])=>{
    addBox(R.x+R.w*x1,R.y,R.w*(x2-x1),R.h,label,"field");
  });

  $("#scanStructureSummary").textContent=
    `${POOLEYS_TEMPLATE.rows} flight rows identified, with the main entry fields mapped on both sides of the Pooleys spread.`;
}


const SCAN_CELL_FIELDS=[
  ...POOLEYS_TEMPLATE.left.fields.map(([label,x1,x2])=>({label,side:"left",x1,x2})),
  ...POOLEYS_TEMPLATE.right.fields.map(([label,x1,x2])=>({label,side:"right",x1,x2}))
];

function scanGetCorrectedSource(){
  return scanCorrectedCanvas();
}

function scanCropCell(source,rowIndex,field){
  const pageW=source.width,pageH=source.height;
  const template=field.side==="left"?POOLEYS_TEMPLATE.left:POOLEYS_TEMPLATE.right;
  const rowCount=POOLEYS_TEMPLATE.rows;
  const rowY=template.y+(template.h/rowCount)*rowIndex;
  const rowH=template.h/rowCount;
  const x=template.x+template.w*field.x1;
  const y=rowY;
  const w=template.w*(field.x2-field.x1);
  const h=rowH;

  const padX=Math.max(4,w*0.025),padY=Math.max(4,h*0.08);
  const sx=Math.max(0,Math.round((x-padX)*pageW));
  const sy=Math.max(0,Math.round((y-padY)*pageH));
  const ex=Math.min(pageW,Math.round((x+w+padX)*pageW));
  const ey=Math.min(pageH,Math.round((y+h+padY)*pageH));
  const cw=Math.max(1,ex-sx),ch=Math.max(1,ey-sy);

  const out=document.createElement("canvas");
  // Keep a useful enlarged preview while avoiding enormous canvases.
  const scale=Math.min(4,Math.max(1,900/cw));
  out.width=Math.round(cw*scale);
  out.height=Math.round(ch*scale);
  const ctx=out.getContext("2d");
  ctx.fillStyle="#fff";
  ctx.fillRect(0,0,out.width,out.height);
  ctx.drawImage(source,sx,sy,cw,ch,0,0,out.width,out.height);
  return out;
}

function scanRenderCellInspector(){
  const panel=$("#scanCellInspector");
  const grid=$("#scanCellGrid");
  const selector=$("#scanRowSelector");
  if(!panel||!grid||!selector||!scanImage)return;

  panel.classList.remove("hidden");
  selector.innerHTML="";
  for(let i=0;i<POOLEYS_TEMPLATE.rows;i++){
    const b=document.createElement("button");
    b.type="button";
    b.className=`stats-range-btn${i===scanSelectedRow?" active":""}`;
    b.textContent=`Flight ${i+1}`;
    b.dataset.row=i;
    b.onclick=()=>{
      scanSelectedRow=i;
      scanRenderCellInspector();
    };
    selector.appendChild(b);
  }

  $("#scanInspectorStatus").textContent=`Flight ${scanSelectedRow+1}`;
  grid.innerHTML="";
  const source=scanGetCorrectedSource();
  if(!source)return;

  for(const field of SCAN_CELL_FIELDS){
    const card=document.createElement("article");
    card.className="scan-cell-card";
    const title=document.createElement("div");
    title.className="scan-cell-title";
    title.textContent=field.label;
    const meta=document.createElement("span");
    meta.textContent=field.side==="left"?"Flight details":"Flight record";
    title.appendChild(meta);

    const viewport=document.createElement("div");
    viewport.className="scan-cell-viewport";
    const crop=scanCropCell(source,scanSelectedRow,field);
    crop.className="scan-cell-canvas";
    viewport.appendChild(crop);

    card.append(title,viewport);
    grid.appendChild(card);
  }
}

function scanAnalysePage(){
  if(!scanImage){
    alert("Choose a physical log book page first.");
    return;
  }
  $("#scanStructurePanel").classList.remove("hidden");
  $("#scanAnalyseBtn").textContent="Pooleys Page Analysed";
  $("#scanAnalyseBtn").classList.add("save-action");
  scanSelectedRow=0;
  scanStructureDraw();
  scanRenderCellInspector();
}

function scanAnalysePage(){
  if(!scanImage){
    alert("Choose a physical log book page first.");
    return;
  }
  $("#scanStructurePanel").classList.remove("hidden");
  $("#scanAnalyseBtn").textContent="Pooleys Page Analysed";
  $("#scanAnalyseBtn").classList.add("save-action");
  scanStructureDraw();
}


let scanSelectedRow=0;
let scanMagnifierSourceCanvas=null;
let scanIOSMagnifierEl=null;
let scanIOSMagnifierCanvas=null;

function scanEnsureMagnifierSourceCanvas(){
  if(!scanImage)return null;
  const w=scanImage.naturalWidth,h=scanImage.naturalHeight;
  if(!scanMagnifierSourceCanvas || scanMagnifierSourceCanvas.width!==w || scanMagnifierSourceCanvas.height!==h){
    scanMagnifierSourceCanvas=document.createElement("canvas");
    scanMagnifierSourceCanvas.width=w;
    scanMagnifierSourceCanvas.height=h;
    scanMagnifierSourceCanvas.getContext("2d").drawImage(scanImage,0,0);
  }
  return scanMagnifierSourceCanvas;
}

function scanCreateIOSMagnifier(){
  if(scanIOSMagnifierEl)return;
  const el=document.createElement("div");
  el.id="scanIOSMagnifier";
  el.setAttribute("aria-hidden","true");
  Object.assign(el.style,{
    position:"fixed",display:"block",visibility:"visible",opacity:"1",
    left:"8px",top:"8px",width:"170px",height:"170px",
    borderRadius:"50%",overflow:"hidden",background:"#111",
    border:"3px solid #fff",boxShadow:"0 5px 22px rgba(0,0,0,.65)",
    zIndex:"2147483647",pointerEvents:"none",
    WebkitTransform:"translateZ(0)",transform:"translateZ(0)"
  });
  const canvas=document.createElement("canvas");
  canvas.width=170;canvas.height=170;
  Object.assign(canvas.style,{display:"block",width:"170px",height:"170px"});
  el.appendChild(canvas);
  document.body.appendChild(el);
  scanIOSMagnifierEl=el;
  scanIOSMagnifierCanvas=canvas;
}

function scanUpdateMagnifier(point){
  if(!scanImage||scanDragIndex<0)return;
  const source=scanEnsureMagnifierSourceCanvas();
  if(!source)return;
  scanCreateIOSMagnifier();
  const rect=$("#scanCanvas").getBoundingClientRect();
  const x=point.clientX-rect.left,y=point.clientY-rect.top;
  if(x<0||x>rect.width||y<0||y>rect.height)return;

  const size=170,margin=16;
  let left=point.clientX-size/2,top=point.clientY-size-22;
  if(top<margin)top=point.clientY+22;
  left=scanClamp(left,margin,Math.max(margin,window.innerWidth-size-margin));
  top=scanClamp(top,margin,Math.max(margin,window.innerHeight-size-margin));

  scanIOSMagnifierEl.style.left=Math.round(left)+"px";
  scanIOSMagnifierEl.style.top=Math.round(top)+"px";
  scanIOSMagnifierEl.style.display="block";
  scanIOSMagnifierEl.style.visibility="visible";
  scanIOSMagnifierEl.style.opacity="1";

  const sx=x*(source.width/rect.width),sy=y*(source.height/rect.height);
  const sourceSize=Math.max(50,Math.min(source.width,source.height)/10);
  const ctx=scanIOSMagnifierCanvas.getContext("2d");
  ctx.clearRect(0,0,size,size);
  ctx.drawImage(source,sx-sourceSize/2,sy-sourceSize/2,sourceSize,sourceSize,0,0,size,size);
  ctx.strokeStyle="rgba(255,255,255,.95)";
  ctx.lineWidth=2;
  ctx.beginPath();
  ctx.arc(size/2,size/2,10,0,Math.PI*2);
  ctx.moveTo(size/2-17,size/2);ctx.lineTo(size/2+17,size/2);
  ctx.moveTo(size/2,size/2-17);ctx.lineTo(size/2,size/2+17);
  ctx.stroke();
}

function scanHideMagnifier(){
  scanDragIndex=-1;
  if(scanIOSMagnifierEl){
    scanIOSMagnifierEl.style.display="none";
    scanIOSMagnifierEl.style.visibility="hidden";
  }
}

function bindScanLogbook(){
  $("#scanLogbookInput").addEventListener("change",e=>{
    const file=e.target.files?.[0];e.target.value="";if(!file)return;
    const url=URL.createObjectURL(file),img=new Image();
    img.onload=()=>{URL.revokeObjectURL(url);scanImage=img;scanSourceFile=file;scanRotation=0;scanMagnifierSourceCanvas=null;scanMagnifierSourceCanvas=null;scanResetCorners();
      $("#scanSourcePanel").classList.add("hidden");$("#scanEditorPanel").classList.remove("hidden");scanDraw();};
    img.src=url;
  });
  $("#scanResetBtn").onclick=()=>{
    scanResetCorners();
    $("#scanStructurePanel").classList.add("hidden");
    $("#scanCellInspector").classList.add("hidden");
    $("#scanAnalyseBtn").textContent="Analyse Pooleys Page";
    $("#scanAnalyseBtn").classList.remove("save-action");
    scanDraw();
  };
  $("#scanRotateBtn").onclick=()=>{
    $("#scanStructurePanel").classList.add("hidden");
    $("#scanCellInspector").classList.add("hidden");
    $("#scanAnalyseBtn").textContent="Analyse Pooleys Page";
    $("#scanAnalyseBtn").classList.remove("save-action");
    scanRotateSource();
  };
  $("#scanAnalyseBtn").onclick=scanAnalysePage;
  $("#scanAddPhysicalBtn").onclick=scanAddToPhysical;
  // iPad/iOS can be less reliable with pointer events on dynamically positioned
  // overlay handles. Use document-level pointer/touch tracking so the handle
  // continues following the finger even when the finger leaves the small dot.
  const scanStartDrag=e=>{
    const el=e.target.closest(".scan-corner");
    if(!el)return;
    // Ignore touch PointerEvents because iOS also receives our explicit
    // touch fallback below. This prevents the same finger from being handled
    // twice and producing a jump.
    if(e.pointerType==="touch")return;
    e.preventDefault();
    scanDragIndex=Number(el.dataset.corner);
    const r=$("#scanCanvas").getBoundingClientRect();
    scanUpdateMagnifier({x:e.clientX,y:e.clientY});
    if(e.pointerId!==undefined && el.setPointerCapture){
      try{el.setPointerCapture(e.pointerId);}catch(_){}
    }
  };
  const scanMoveDrag=e=>{
    if(scanDragIndex<0||!scanImage)return;
    if(e.pointerType==="touch")return;
    if(e.cancelable)e.preventDefault();
    const p=scanCanvasPoint(e);
    scanCorners[scanDragIndex]={x:p.x,y:p.y};
    scanUpdateMagnifier(e);
    scanDraw();
  };
  const scanEndDrag=()=>{
    scanDragIndex=-1;
    scanHideMagnifier();
  };
  document.addEventListener("pointerdown",scanStartDrag,{passive:false});
  document.addEventListener("pointermove",scanMoveDrag,{passive:false});
  document.addEventListener("pointerup",scanEndDrag,{passive:false});
  document.addEventListener("pointercancel",scanEndDrag,{passive:false});
  // Explicit touch fallback for iOS versions/webviews where Pointer Events
  // don't deliver continuous movement reliably.
  document.addEventListener("touchstart",e=>{
    const el=e.target.closest(".scan-corner");
    if(!el)return;
    e.preventDefault();
    scanDragIndex=Number(el.dataset.corner);
    const t=e.touches[0];
    if(t)scanUpdateMagnifier(t);
  },{passive:false});
  document.addEventListener("touchmove",e=>{
    if(scanDragIndex<0||!scanImage)return;
    e.preventDefault();
    const t=e.touches[0];
    if(!t)return;
    const p=scanCanvasPoint(t);
    scanCorners[scanDragIndex]={x:p.x,y:p.y};
    scanUpdateMagnifier(t);
    scanDraw();
  },{passive:false});
  document.addEventListener("touchend",scanEndDrag,{passive:false});
  document.addEventListener("touchcancel",scanEndDrag,{passive:false});
  window.addEventListener("resize",()=>{
    if(scanImage){
      scanDraw();
      if(!$("#scanStructurePanel").classList.contains("hidden")){
        scanStructureDraw();
        scanRenderCellInspector();
      }
    }
  });
}

document.addEventListener("DOMContentLoaded", async ()=>{
  bindNavigation();
  bindDialog();
  bindPhysicalLogbook();
  bindScanLogbook();
  setupCompactInputs();
  $("#search").addEventListener("input",renderLogbook);
  $("#yearFilter").addEventListener("change",renderLogbook);
  document.querySelectorAll("[data-stats-range]").forEach(b=>b.addEventListener("click",()=>{
    document.querySelectorAll("[data-stats-range]").forEach(x=>x.classList.remove("active"));
    b.classList.add("active");
    $("#customRange").classList.toggle("hidden",b.dataset.statsRange!=="custom");
    renderStatistics();
  }));
  $("#statsFrom").addEventListener("change",renderStatistics);
  $("#statsTo").addEventListener("change",renderStatistics);
  $("#exportBtn").addEventListener("click",exportData);
  $("#importInput").addEventListener("change",importData);
  $("#clearFlightsBtn").addEventListener("click",async()=>{
    if(confirm("Delete all flight data from this device? This cannot be undone.")){
      await clearFlights(); await refresh(); toast("Flight data deleted");
    }
  });
  $("#settingsPhysicalExportBtn").addEventListener("click",physicalExportZip);
  $("#settingsPhysicalImportInput").addEventListener("change",async e=>{
    const file=e.target.files[0];
    if(file) await physicalImportZip(file);
    e.target.value="";
  });
  $("#clearPhysicalBtn").addEventListener("click",async()=>{
    if(confirm("Delete the entire physical log book from this device? This cannot be undone.")){
      await physicalClearAll(); physicalPages=[]; physicalIndex=0; physicalSelectedIds.clear();
      await physicalRender(); toast("Physical log book deleted");
    }
  });
  $("#clearAllDataBtn").addEventListener("click",async()=>{
    if(confirm("Delete ALL flight data and the entire physical log book from this device? This cannot be undone.")){
      await clearFlights(); await physicalClearAll();
      flights=[]; physicalPages=[]; physicalIndex=0; physicalSelectedIds.clear();
      await refresh(); await physicalRender(); toast("All data deleted");
    }
  });
  $("#updateBtn").addEventListener("click",checkForUpdate);
  $("#addClassBtn")?.addEventListener("click",addAircraftClass);
  $("#newClassName")?.addEventListener("keydown",e=>{if(e.key==="Enter")addAircraftClass();});
  document.addEventListener("click",e=>{
    const nav=e.target.closest("[data-view]");
    if(nav){e.preventDefault();showView(nav.dataset.view);}
    const item=e.target.closest("[data-stats-item]");
    if(item){statsSelectedItem=item.dataset.statsItem;renderStatistics();}
  });
  document.addEventListener("change",e=>{
    if(e.target.id==="statsBreakdown"||e.target.id==="statsRoleFilter"||e.target.id==="statsRouteFilter"||e.target.id==="statsDayNightFilter"){
      statsSelectedItem=null;
      renderStatistics();
    }
  });

  if("serviceWorker" in navigator){
    navigator.serviceWorker.addEventListener("controllerchange",()=>{
      if(refreshing) window.location.reload();
    });
  }
  await loadAppVersion();
  await refresh();
  await loadAircraftClasses();
  const updateMessage=localStorage.getItem("skylogUpdateMessage");
  if(updateMessage){
    localStorage.removeItem("skylogUpdateMessage");
    const status=$("#updateStatus");
    if(status){status.textContent=updateMessage;status.classList.add("success");}
    setTimeout(()=>toast(updateMessage),500);
  }
  if("serviceWorker" in navigator){
    navigator.serviceWorker.register("sw.js").then(reg=>window.skylogRegistration=reg).catch(()=>{});
  }
});

window.showView=function showView(id){
  const target=document.getElementById(id);
  if(!target) return;
  document.querySelectorAll(".view").forEach(v=>v.classList.toggle("active",v.id===id));
  document.querySelectorAll(".bottom-nav button").forEach(x=>x.classList.toggle("active",x.dataset.nav===id));
  if(id==="statistics") renderStatistics();
  if(id==="logbook") renderLogbook();
  if(id==="physicalLogbook") physicalLoad();
}
function bindNavigation(){
  document.querySelectorAll("[data-nav]").forEach(b=>b.addEventListener("click",()=>showView(b.dataset.nav)));
  document.querySelectorAll("[data-action='new-flight']").forEach(b=>b.addEventListener("click",()=>openDialog()));
}

function updateFlightRulesFields(){
  const mixed=$("#flightType").value==="VFR + IFR";
  $("#vfrMinutesField").classList.toggle("hidden",!mixed);
  $("#ifrMinutesField").classList.toggle("hidden",!mixed);
}

function bindDialog(){
  $("#flightType").addEventListener("change",updateFlightRulesFields);
  $("#closeDialog").onclick=()=>$("#flightDialog").close();
  $("#cancelDialog").onclick=()=>$("#flightDialog").close();
  $("#deleteFlight").onclick=async()=>{
    const id=$("#flightId").value;
    if(id && confirm("Delete this flight?")){await deleteFlight(id);$("#flightDialog").close();await refresh();toast("Flight deleted");}
  };
  $("#flightForm").addEventListener("submit",async e=>{
    e.preventDefault();
    const id=$("#flightId").value || crypto.randomUUID();
    const storedDate=displayToISODate($("#date").value);
    const depart=normaliseTime($("#departTime").value);
    const arrival=normaliseTime($("#arrivalTime").value);
    if(!storedDate){alert("Please enter a valid date as DD/MM/YYYY.");return;}
    if(!depart||!arrival){alert("Please enter valid times as HH:MM.");return;}
    const flight={
      id,date:storedDate,registration:$("#registration").value.trim().toUpperCase(),
      aircraft:$("#aircraft").value.trim().toUpperCase(),departure:$("#departure").value.trim().toUpperCase(),
      arrival:$("#arrival").value.trim().toUpperCase(),departTime:depart, arrivalTime:arrival,
      blockMinutes:calculateDuration(depart,arrival),
      role:$("#role").value,flightType:$("#flightType").value,nightMinutes:num("nightMinutes"),
      vfrMinutes:num("vfrMinutes"),ifrMinutes:num("ifrMinutes"),
      instrumentMinutes:num("instrumentMinutesActual"),
      instrumentMinutesActual:num("instrumentMinutesActual"),
      instrumentMinutesSimulated:num("instrumentMinutesSimulated"),
      takeoffsDay:num("takeoffsDay"),takeoffsNight:num("takeoffsNight"),
      landingsDay:num("landingsDay"),landingsNight:num("landingsNight"),
      takeoffs:num("takeoffsDay")+num("takeoffsNight"),
      landings:num("landingsDay")+num("landingsNight"),
      remarks:$("#remarks").value.trim()
    };
    await putFlight(flight);$("#flightDialog").close();await refresh();toast("Flight saved");
  });
}
const num=id=>Math.max(0,Number($("#"+id).value)||0);
function isoToDisplayDate(iso){if(!iso)return "";const [y,m,d]=iso.split("-");return d&&m&&y?`${d}/${m}/${y}`:"";}
function displayToISODate(value){const m=String(value||"").trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);if(!m)return "";const [,d,mo,y]=m;const dt=new Date(Number(y),Number(mo)-1,Number(d));if(dt.getFullYear()!==Number(y)||dt.getMonth()!==Number(mo)-1||dt.getDate()!==Number(d))return "";return `${y}-${mo}-${d}`;}
function normaliseTime(value){const m=String(value||"").trim().match(/^(\d{1,2}):(\d{2})$/);if(!m)return "";const h=Number(m[1]),min=Number(m[2]);if(h>23||min>59)return "";return `${String(h).padStart(2,"0")}:${m[2]}`;}
function formatDateInput(el){let v=el.value.replace(/\D/g,"").slice(0,8);if(v.length>4)v=v.slice(0,2)+"/"+v.slice(2,4)+"/"+v.slice(4);else if(v.length>2)v=v.slice(0,2)+"/"+v.slice(2);el.value=v;}
function formatTimeInput(el){let v=el.value.replace(/\D/g,"").slice(0,4);if(v.length>2)v=v.slice(0,2)+":"+v.slice(2);el.value=v;}
function setupCompactInputs(){const d=$("#date"),p=$("#departTime"),a=$("#arrivalTime");d?.addEventListener("input",()=>formatDateInput(d));p?.addEventListener("input",()=>formatTimeInput(p));a?.addEventListener("input",()=>formatTimeInput(a));}


function openDialog(f=null){
  $("#dialogTitle").textContent=f?"Edit flight":"Log flight";
  $("#flightId").value=f?.id||"";
  $("#date").value=f?.date?isoToDisplayDate(f.date):"";
  $("#registration").value=f?.registration||"";
  $("#aircraft").value=f?.aircraft||"";
  $("#departure").value=f?.departure||"";
  $("#arrival").value=f?.arrival||"";
  $("#departTime").value=f?.departTime||"";
  $("#arrivalTime").value=f?.arrivalTime||"";
  $("#role").value=f?.role||"PIC";
  $("#flightType").value=f?.flightType||"VFR";
  $("#nightMinutes").value=f?.nightMinutes??0;
  $("#vfrMinutes").value=f?.vfrMinutes??0;
  $("#ifrMinutes").value=f?.ifrMinutes??0;
  $("#instrumentMinutesActual").value=f?.instrumentMinutesActual??f?.instrumentMinutes??0;
  $("#instrumentMinutesSimulated").value=f?.instrumentMinutesSimulated??0;
  updateFlightRulesFields();
  const oldTakeoffs=Number(f?.takeoffs)||0;
  const oldLandings=Number(f?.landings)||0;
  $("#takeoffsDay").value=f?.takeoffsDay!=null?f.takeoffsDay:(f?oldTakeoffs:1);
  $("#takeoffsNight").value=f?.takeoffsNight!=null?f.takeoffsNight:0;
  $("#landingsDay").value=f?.landingsDay!=null?f.landingsDay:(f?oldLandings:1);
  $("#landingsNight").value=f?.landingsNight!=null?f.landingsNight:0;
  $("#remarks").value=f?.remarks||"";
  $("#deleteFlight").classList.toggle("hidden",!f);
  $("#flightDialog").showModal();
}

async function refresh(){
  flights=await getAllFlights();
  renderStats();renderRecent();renderLogbook();renderStatistics();populateYears();
}
function calculateDuration(depart, arrival){
  if(!depart || !arrival) return 0;
  const [dh,dm]=depart.split(":").map(Number), [ah,am]=arrival.split(":").map(Number);
  let start=dh*60+dm, end=ah*60+am;
  if(end<start) end+=24*60; // supports flights crossing midnight
  return end-start;
}
function hours(min){return (Math.round((min/60)*10)/10).toFixed(1)}
function entryHours(min){return Math.round((min/60)*10)/10}
function sumRoundedHours(list, field="blockMinutes"){
  return list.reduce((sum,f)=>sum+entryHours(Number(f[field])||0),0);
}
function displayHours(value){return value.toFixed(1)}
function total(field){return flights.reduce((s,f)=>s+(Number(f[field])||0),0)}
function renderStats(){
  const totalHours=sumRoundedHours(flights);
  const picFlights=flights.filter(f=>f.role==="P.1"||f.role==="P.1/S"||f.role==="P.1 (Instructor)");
  const dualFlights=flights.filter(f=>f.role==="P.U/T");
  const instructorFlights=flights.filter(f=>f.role==="P.1 (Instructor)");
  const picHours=sumRoundedHours(picFlights);
  const dualHours=sumRoundedHours(dualFlights);
  const nightHours=sumRoundedHours(flights,"nightMinutes");
  const actualInstrumentHours=sumRoundedHours(flights,"instrumentMinutesActual");
  const legacyInstrumentHours=flights.some(f=>f.instrumentMinutesActual!=null)?0:sumRoundedHours(flights,"instrumentMinutes");
  const simulatedInstrumentHours=sumRoundedHours(flights,"instrumentMinutesSimulated");
  const instrumentHours=actualInstrumentHours+legacyInstrumentHours+simulatedInstrumentHours;
  const instructorHours=sumRoundedHours(instructorFlights);
  const takeoffsDay=total("takeoffsDay"), takeoffsNight=total("takeoffsNight");
  const landingsDay=total("landingsDay"), landingsNight=total("landingsNight");
  const takeoffs=takeoffsDay+takeoffsNight || total("takeoffs");
  const landings=landingsDay+landingsNight || total("landings");

  $("#stats").innerHTML=[
    ["Total Hours",displayHours(totalHours)+" h"],
    ["PIC Hours",displayHours(picHours)+" h"],
    ["Dual Hours",displayHours(dualHours)+" h"],
    ["Night Hours",displayHours(nightHours)+" h"],
    ["Instrument Hours",displayHours(instrumentHours)+" h"],
    ["Instructor Hours",displayHours(instructorHours)+" h"],
    ["Take-offs",takeoffs],
    ["Landings",landings]
  ].map(x=>`<div class="stat"><strong>${x[1]}</strong><span>${x[0]}</span></div>`).join("");
}
function flightHTML(f){
  return `<article class="flight" data-id="${f.id}">
    <div class="flight-date">${formatDate(f.date)}</div>
    <div><div class="route">${f.departure} → ${f.arrival}</div><div class="flight-meta">${f.registration} · ${f.aircraft} · ${f.role} · ${f.flightType}${f.remarks?" · "+escapeHTML(f.remarks):""}</div></div>
    <div class="flight-time">${hours(f.blockMinutes)} h<small>${f.departTime||"--:--"}–${f.arrivalTime||"--:--"} GMT</small></div>
  </article>`;
}
function attachFlightClicks(){
  document.querySelectorAll(".flight").forEach(el=>el.onclick=()=>openDialog(flights.find(f=>f.id===el.dataset.id)));
}
function renderRecent(){
  const data=flights.slice(0,6);
  $("#recentFlights").innerHTML=data.length?data.map(flightHTML).join(""):`<div class="empty">No flights yet. Tap “Log flight” to start.</div>`;
  attachFlightClicks();
}
function renderLogbook(){
  const q=($("#search")?.value||"").toLowerCase(), y=$("#yearFilter")?.value||"";
  const data=flights.filter(f=>(!y||f.date.startsWith(y)) && (!q||[f.registration,f.aircraft,f.departure,f.arrival,f.remarks,f.flightType].join(" ").toLowerCase().includes(q)));
  $("#allFlights").innerHTML=data.length?data.map(flightHTML).join(""):`<div class="empty">No matching flights.</div>`;
  attachFlightClicks();
}
function populateYears(){
  const years=[...new Set(flights.map(f=>f.date.slice(0,4)))].sort().reverse();
  const old=$("#yearFilter").value;
  $("#yearFilter").innerHTML='<option value="">All years</option>'+years.map(y=>`<option>${y}</option>`).join("");
  $("#yearFilter").value=years.includes(old)?old:"";
}
function getDayNightCounts(f){
  const legacyT=Number(f.takeoffs)||0;
  const legacyL=Number(f.landings)||0;
  const tDay=f.takeoffsDay!=null?Number(f.takeoffsDay):legacyT;
  const tNight=f.takeoffsNight!=null?Number(f.takeoffsNight):0;
  const lDay=f.landingsDay!=null?Number(f.landingsDay):legacyL;
  const lNight=f.landingsNight!=null?Number(f.landingsNight):0;
  return {
    takeoffsDay:tDay,takeoffsNight:tNight,takeoffsTotal:tDay+tNight,
    landingsDay:lDay,landingsNight:lNight,landingsTotal:lDay+lNight
  };
}
function buildStatsRows(data,mode){
  const groups={};
  if(mode==="class"){
    const classByType=new Map();
    aircraftClasses.forEach(c=>(c.types||[]).forEach(type=>{
      const key=String(type).trim().toUpperCase();
      if(key && !classByType.has(key)) classByType.set(key,c.name);
    }));
    data.forEach(f=>{
      const aircraft=String(f.aircraft||"").trim().toUpperCase();
      const key=classByType.get(aircraft)||"Unclassified";
      (groups[key] ||= []).push(f);
    });
  }else{
    data.forEach(f=>{
      const key=String(f.aircraft||"Unknown").trim()||"Unknown";
      (groups[key] ||= []).push(f);
    });
  }
  return Object.entries(groups).map(([name,items])=>{
    const c=items.reduce((a,f)=>{
      const n=getDayNightCounts(f);
      a.hours+=entryHours(f.blockMinutes);
      a.takeoffsDay+=n.takeoffsDay;a.takeoffsNight+=n.takeoffsNight;a.takeoffsTotal+=n.takeoffsTotal;
      a.landingsDay+=n.landingsDay;a.landingsNight+=n.landingsNight;a.landingsTotal+=n.landingsTotal;
      return a;
    },{hours:0,takeoffsDay:0,takeoffsNight:0,takeoffsTotal:0,landingsDay:0,landingsNight:0,landingsTotal:0});
    return {name,...c};
  }).sort((a,b)=>b.hours-a.hours);
}
function statsRowsTable(rows){
  if(!rows.length) return '<div class="empty">No flights in this period.</div>';
  return `<div class="stats-table-wrap"><table class="stat-table stats-breakdown-table">
    <thead><tr><th>Aircraft / Class</th><th>Hours</th><th colspan="3">Take-offs</th><th colspan="3">Landings</th></tr>
    <tr><th></th><th></th><th>Day</th><th>Night</th><th>Total</th><th>Day</th><th>Night</th><th>Total</th></tr></thead>
    <tbody>${rows.map(r=>`<tr><td>${escapeHTML(r.name)}</td><td>${displayHours(r.hours)} h</td>
      <td>${r.takeoffsDay}</td><td>${r.takeoffsNight}</td><td>${r.takeoffsTotal}</td>
      <td>${r.landingsDay}</td><td>${r.landingsNight}</td><td>${r.landingsTotal}</td></tr>`).join("")}</tbody>
  </table></div>`;
}
function getDayNightCounts(f){
  const t=Number(f.takeoffs)||0,l=Number(f.landings)||0;
  const td=f.takeoffsDay!=null?Number(f.takeoffsDay):t;
  const tn=f.takeoffsNight!=null?Number(f.takeoffsNight):0;
  const ld=f.landingsDay!=null?Number(f.landingsDay):l;
  const ln=f.landingsNight!=null?Number(f.landingsNight):0;
  return {takeoffsDay:td,takeoffsNight:tn,takeoffsTotal:td+tn,landingsDay:ld,landingsNight:ln,landingsTotal:ld+ln};
}
function statsGroups(data,mode){
  const groups={};
  const typeToClass=new Map();
  if(mode==="class") aircraftClasses.forEach(c=>(c.types||[]).forEach(t=>typeToClass.set(String(t).trim().toUpperCase(),c.name)));
  data.forEach(f=>{
    const type=String(f.aircraft||"").trim().toUpperCase();
    const registration=String(f.registration||"").trim().toUpperCase();
    const name=mode==="class"?(typeToClass.get(type)||"Unclassified"):
      mode==="registration"?(registration||"Unknown"):
      (type||"Unknown");
    (groups[name] ||= []).push(f);
  });
  return Object.entries(groups).map(([name,items])=>items.reduce((a,f)=>{
    const n=getDayNightCounts(f);
    const hours=entryHours(Number(f.blockMinutes)||0);
    a.hours+=hours;
    if(String(f.flightType||"").toUpperCase()==="IFR") a.ifrHours+=hours;
    else a.vfrHours+=hours;
    a.instrumentHours+=entryHours(Number(f.instrumentMinutes)||0);
    a.takeoffsDay+=n.takeoffsDay;a.takeoffsNight+=n.takeoffsNight;a.takeoffsTotal+=n.takeoffsTotal;
    a.landingsDay+=n.landingsDay;a.landingsNight+=n.landingsNight;a.landingsTotal+=n.landingsTotal;
    return a;
  },{name,hours:0,vfrHours:0,ifrHours:0,instrumentHours:0,takeoffsDay:0,takeoffsNight:0,takeoffsTotal:0,landingsDay:0,landingsNight:0,landingsTotal:0})).sort((a,b)=>b.hours-a.hours);
}

function renderStatistics(){
  const active=$("#statistics .filter-btn.active")?.dataset.statsRange||"all";
  let data=flights;
  if(active==="90"){
    const end=new Date();end.setHours(23,59,59,999);
    const start=new Date(end);start.setDate(start.getDate()-89);
    const from=start.toISOString().slice(0,10),to=end.toISOString().slice(0,10);
    data=flights.filter(f=>f.date>=from&&f.date<=to);
  }else if(active==="custom"){
    const from=$("#statsFrom").value,to=$("#statsTo").value;
    data=from&&to?flights.filter(f=>f.date>=from&&f.date<=to):[];
  }

  const roleFilter=$("#statsRoleFilter")?.value||"all";
  if(roleFilter==="pic") data=data.filter(f=>f.role==="P.1"||f.role==="P.1/S"||f.role==="P.1 (Instructor)");
  if(roleFilter==="instructor") data=data.filter(f=>f.role==="P.1 (Instructor)");
  if(roleFilter==="dual") data=data.filter(f=>f.role==="P.U/T");

  const routeFilter=$("#statsRouteFilter")?.value||"all";
  if(routeFilter==="local") data=data.filter(f=>String(f.departure||"").trim().toUpperCase()===String(f.arrival||"").trim().toUpperCase());
  if(routeFilter==="crossCountry") data=data.filter(f=>String(f.departure||"").trim().toUpperCase()!==String(f.arrival||"").trim().toUpperCase());

  const dayNightFilter=$("#statsDayNightFilter")?.value||"all";
  if(dayNightFilter==="day") data=data.filter(f=>{
    const n=getDayNightCounts(f); return n.takeoffsDay>0||n.landingsDay>0;
  });
  if(dayNightFilter==="night") data=data.filter(f=>{
    const n=getDayNightCounts(f); return n.takeoffsNight>0||n.landingsNight>0;
  });

  const mode=$("#statsBreakdown")?.value||"all";
  const groups=mode==="all"?[]:statsGroups(data,mode);
  if(mode!=="all" && (!statsSelectedItem||!groups.some(g=>g.name===statsSelectedItem))) statsSelectedItem=groups[0]?.name||null;

  let selectedData=data;
  if(mode!=="all" && statsSelectedItem){
    if(mode==="aircraft") selectedData=data.filter(f=>String(f.aircraft||"").trim().toUpperCase()===String(statsSelectedItem).toUpperCase());
    else if(mode==="registration") selectedData=data.filter(f=>String(f.registration||"").trim().toUpperCase()===String(statsSelectedItem).toUpperCase());
    else if(mode==="class"){
      const cls=aircraftClasses.find(c=>c.name===statsSelectedItem);
      const types=new Set((cls?.types||[]).map(t=>String(t).trim().toUpperCase()));
      selectedData=data.filter(f=>types.has(String(f.aircraft||"").trim().toUpperCase()));
    }
  }

  const aggregate=list=>list.reduce((a,f)=>{
    const n=getDayNightCounts(f);
    const hours=entryHours(Number(f.blockMinutes)||0);
    const actual=entryHours(Number(f.instrumentMinutesActual??f.instrumentMinutes)||0);
    const simulated=entryHours(Number(f.instrumentMinutesSimulated)||0);
    const rules=String(f.flightType||"VFR").toUpperCase();
    const nightMinutes=Number(f.nightMinutes)||0;

    a.hours+=hours;
    a.actualInstrument+=actual;
    a.simulatedInstrument+=simulated;
    a.takeoffsDay+=n.takeoffsDay;
    a.takeoffsNight+=n.takeoffsNight;
    a.landingsDay+=n.landingsDay;
    a.landingsNight+=n.landingsNight;

    if(rules==="VFR"){
      a.vfrHours+=hours;
      a.nightVfr+=entryHours(nightMinutes);
    }else if(rules==="IFR"){
      a.ifrHours+=hours;
      a.nightIfr+=entryHours(nightMinutes);
    }else{
      a.vfrHours+=entryHours(Number(f.vfrMinutes)||0);
      a.ifrHours+=entryHours(Number(f.ifrMinutes)||0);
      const mixedTotal=(Number(f.vfrMinutes)||0)+(Number(f.ifrMinutes)||0);
      if(mixedTotal>0){
        a.nightVfr+=entryHours(nightMinutes*(Number(f.vfrMinutes)||0)/mixedTotal);
        a.nightIfr+=entryHours(nightMinutes*(Number(f.ifrMinutes)||0)/mixedTotal);
      }
    }
    return a;
  },{hours:0,vfrHours:0,ifrHours:0,nightVfr:0,nightIfr:0,actualInstrument:0,simulatedInstrument:0,takeoffsDay:0,takeoffsNight:0,landingsDay:0,landingsNight:0});

  const stats=aggregate(selectedData);
  const pic=aggregate(selectedData.filter(f=>f.role==="P.1"||f.role==="P.1/S"||f.role==="P.1 (Instructor)"));
  const dual=aggregate(selectedData.filter(f=>f.role==="P.U/T"));
  const instructor=aggregate(selectedData.filter(f=>f.role==="P.1 (Instructor)"));
  const night=aggregate(selectedData.filter(f=>(Number(f.nightMinutes)||0)>0));
  const title=mode==="all"?"All Flights":mode==="class"?"By Class":mode==="registration"?"By Registration":"By Aircraft";

  $("#statisticsContent").innerHTML=`
    <div class="panel stats-breakdown">
      <div class="stats-breakdown-controls">
        <label>Breakdown
          <select id="statsBreakdown">
            <option value="all" ${mode==="all"?"selected":""}>All Flights</option>
            <option value="aircraft" ${mode==="aircraft"?"selected":""}>By Aircraft</option>
            <option value="class" ${mode==="class"?"selected":""}>By Class</option>
            <option value="registration" ${mode==="registration"?"selected":""}>By Registration</option>
          </select>
        </label>
        <label>Role
          <select id="statsRoleFilter">
            <option value="all" ${roleFilter==="all"?"selected":""}>All Roles</option>
            <option value="pic" ${roleFilter==="pic"?"selected":""}>PIC</option>
            <option value="instructor" ${roleFilter==="instructor"?"selected":""}>Instructor</option>
            <option value="dual" ${roleFilter==="dual"?"selected":""}>Dual</option>
          </select>
        </label>
        <label>Route
          <select id="statsRouteFilter">
            <option value="all" ${routeFilter==="all"?"selected":""}>All Routes</option>
            <option value="local" ${routeFilter==="local"?"selected":""}>Local</option>
            <option value="crossCountry" ${routeFilter==="crossCountry"?"selected":""}>Cross Country</option>
          </select>
        </label>
        <label>Time
          <select id="statsDayNightFilter">
            <option value="all" ${dayNightFilter==="all"?"selected":""}>All Times</option>
            <option value="day" ${dayNightFilter==="day"?"selected":""}>Day</option>
            <option value="night" ${dayNightFilter==="night"?"selected":""}>Night</option>
          </select>
        </label>
      </div>
    </div>
    <div class="panel stats-item-panel">
      <div class="stats-item-buttons" role="group" aria-label="${title}">
        ${mode==="all"
          ? `<button type="button" class="filter-btn stats-item-btn active">All Flights</button>`
          : groups.length
            ? groups.map(g=>`<button type="button" class="filter-btn stats-item-btn ${g.name===statsSelectedItem?"active":""}" data-stats-item="${escapeHTML(g.name)}">${escapeHTML(g.name)}</button>`).join("")
            : '<span class="empty">No flights in this period.</span>'}
      </div>
    </div>
    <div class="stats-grid stats-grid-expanded">
      <div class="stat">
        <strong>${displayHours(stats.hours)} h</strong>
        <span>Hours</span>
        <small>VFR ${displayHours(stats.vfrHours)} h · IFR ${displayHours(stats.ifrHours)} h</small>
      </div>
      <div class="stat">
        <strong>${displayHours(stats.actualInstrument+stats.simulatedInstrument)} h</strong>
        <span>Instrument Hours</span>
        <small>Actual ${displayHours(stats.actualInstrument)} h · Simulated ${displayHours(stats.simulatedInstrument)} h</small>
      </div>
      <div class="stat">
        <strong>${stats.takeoffsDay+stats.takeoffsNight}</strong>
        <span>Take-offs</span>
        <small>Day ${stats.takeoffsDay} · Night ${stats.takeoffsNight}</small>
      </div>
      <div class="stat">
        <strong>${stats.landingsDay+stats.landingsNight}</strong>
        <span>Landings</span>
        <small>Day ${stats.landingsDay} · Night ${stats.landingsNight}</small>
      </div>
    </div>`;
}

function formatDate(s){return new Date(s+"T12:00:00").toLocaleDateString(undefined,{day:"2-digit",month:"short",year:"numeric"})}
function escapeHTML(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function toast(msg){const t=$("#toast");t.textContent=msg;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),1800)}

async function exportData(){
  const blob=new Blob([JSON.stringify({app:"SkyLog",version:1,exportedAt:new Date().toISOString(),flights},null,2)],{type:"application/json"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`skylog-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(a.href);
}
async function importData(e){
  const file=e.target.files[0];
  if(!file)return;

  try{
    // Read as text and tolerate a UTF-8 BOM, which can be present in JSON
    // files created/exported by some desktop tools.
    let text=await file.text();
    text=text.replace(/^\\uFEFF/,"").trim();
    if(!text)throw new Error("The file is empty.");

    const data=JSON.parse(text);

    // Accept the current SkyLog format, the older plain-array format, and
    // a couple of harmless wrapper names used by earlier test backups.
    let list;
    if(Array.isArray(data)) list=data;
    else if(data && Array.isArray(data.flights)) list=data.flights;
    else if(data && Array.isArray(data.data)) list=data.data;
    else if(data && Array.isArray(data.records)) list=data.records;
    else throw new Error("No flight records were found.");

    // Never delete existing data during an import. Validate the records first
    // so a bad backup cannot leave the user's logbook empty or partially changed.
    const valid=list.filter(f=>f && typeof f==="object" && f.id!=null && String(f.id).trim()!=="");
    if(!valid.length)throw new Error("The backup contains no valid flight records.");

    let imported=0;
    for(const flight of valid){
      await putFlight(flight);
      imported++;
    }

    await refresh();
    toast(`${imported} flight${imported===1?"":"s"} imported`);
  }catch(err){
    console.error("SkyLog JSON import failed",err);
    alert(`Could not import this SkyLog backup. ${err.message||"The file is invalid or unsupported."}`);
  }finally{
    e.target.value="";
  }
}
async function clearData(){
  if(confirm("Delete every flight from this device? This cannot be undone.")){await clearFlights();await refresh();toast("Logbook cleared")}
}



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

async function checkForUpdate(){
  const btn=$("#updateBtn"), status=$("#updateStatus");
  if(!("serviceWorker" in navigator)){
    status.textContent="Updates are not supported by this browser.";
    return;
  }

  btn.disabled=true;
  status.classList.remove("success");
  status.textContent="Checking for updates…";

  try{
    const reg=window.skylogRegistration || await navigator.serviceWorker.getRegistration();
    if(!reg) throw new Error("No service worker registration found.");
    window.skylogRegistration=reg;

    // If an update is already waiting, activate it immediately.
    if(reg.waiting){
      await activateSkyLogUpdate(reg,status);
      return;
    }

    // Ask Safari/iPadOS to check the live HTTPS service-worker script.
    await reg.update();

    // iPadOS can finish the update asynchronously after update() resolves.
    const installing=reg.installing;
    if(installing){
      status.textContent="Downloading update…";
      await new Promise((resolve,reject)=>{
        const onState=()=>{
          if(installing.state==="installed"){
            installing.removeEventListener("statechange",onState);
            resolve();
          }else if(installing.state==="redundant"){
            installing.removeEventListener("statechange",onState);
            reject(new Error("Update became redundant."));
          }
        };
        installing.addEventListener("statechange",onState);
      });
    }

    // The new worker may now be waiting, or it may already have activated.
    if(reg.waiting){
      await activateSkyLogUpdate(reg,status);
      return;
    }

    // If the registration has already taken control, reload and confirm.
    if(navigator.serviceWorker.controller && reg.active){
      status.textContent="You're already using the latest version.";
    }else{
      status.textContent="You're already using the latest version.";
    }
    btn.disabled=false;
  }catch(err){
    console.error(err);
    status.textContent="Could not check for an update. Please try again.";
    btn.disabled=false;
  }
}

function activateSkyLogUpdate(reg,status){
  return new Promise((resolve,reject)=>{
    refreshing=true;
    localStorage.setItem("skylogUpdateMessage","SkyLog was successfully updated to the latest version.");
    status.textContent="Update found. Installing…";

    const timeout=setTimeout(()=>{
      cleanup();
      reject(new Error("Timed out waiting for updated service worker."));
    },10000);

    const onController=()=>{
      cleanup();
      status.textContent="Updated. Reloading…";
      // Give iPadOS a moment to finish switching the standalone document
      // before reloading it.
      setTimeout(()=>window.location.reload(),250);
      resolve();
    };

    const cleanup=()=>{
      clearTimeout(timeout);
      navigator.serviceWorker.removeEventListener("controllerchange",onController);
    };

    navigator.serviceWorker.addEventListener("controllerchange",onController);
    reg.waiting.postMessage({type:"SKIP_WAITING"});
  });
}

window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferredInstall=e;$("#installBtn").classList.remove("hidden")});
$("#installBtn")?.addEventListener("click",async()=>{if(!deferredInstall)return;deferredInstall.prompt();deferredInstall=null});
