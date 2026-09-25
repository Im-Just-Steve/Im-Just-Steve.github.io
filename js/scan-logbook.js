/* ==========================================================================
   PHYSICAL LOG BOOK IMPORT / SCANNING
   Phase 1: crop + perspective correction
   Phase 2: Pooleys structure detection
   Phase 3A: cell inspection
   ========================================================================== */

/* Phase 1: physical logbook page capture, crop and perspective correction */
let scanImage=null, scanSourceFile=null, scanCorners=[], scanDragIndex=-1, scanRotation=0;

/* Phase 1 — image preparation and corner interaction */
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
/* Phase 2 — Pooleys page structure detection */
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


/* Phase 3A — cell inspection */
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

/* Phase 3A renderer is retained for the next import phase. The current
   active analyser below intentionally preserves v0.79 behaviour. */
function scanAnalysePageWithCellInspector(){
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

/* Magnifier — shared source and iOS overlay */
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

/* Scan-page event wiring */
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

