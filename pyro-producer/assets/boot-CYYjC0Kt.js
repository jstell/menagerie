const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["./main-Bk1Q1DCw.js","./renderer-8qP5s0P4.js","./library--yenoGR3.js","./textures-BK4KnsI5.js","./unlock-CivG8CrC.js","./main-C17uOb6D.css"])))=>i.map(i=>d[i]);
const b="modulepreload",f=function(a,o){return new URL(a,o).href},m={},k=function(o,c,p){let u=Promise.resolve();if(c&&c.length>0){let y=function(e){return Promise.all(e.map(n=>Promise.resolve(n).then(r=>({status:"fulfilled",value:r}),r=>({status:"rejected",reason:r}))))};const i=document.getElementsByTagName("link"),t=document.querySelector("meta[property=csp-nonce]"),h=t?.nonce||t?.getAttribute("nonce");u=y(c.map(e=>{if(e=f(e,p),e in m)return;m[e]=!0;const n=e.endsWith(".css"),r=n?'[rel="stylesheet"]':"";if(p)for(let d=i.length-1;d>=0;d--){const l=i[d];if(l.href===e&&(!n||l.rel==="stylesheet"))return}else if(document.querySelector(`link[href="${e}"]${r}`))return;const s=document.createElement("link");if(s.rel=n?"stylesheet":b,n||(s.as="script"),s.crossOrigin="",s.href=e,h&&s.setAttribute("nonce",h),document.head.appendChild(s),n)return new Promise((d,l)=>{s.addEventListener("load",d),s.addEventListener("error",()=>l(new Error(`Unable to preload CSS for ${e}`)))})}))}function v(i){const t=new Event("vite:preloadError",{cancelable:!0});if(t.payload=i,window.dispatchEvent(t),!t.defaultPrevented)throw i}return u.then(i=>{for(const t of i||[])t.status==="rejected"&&v(t.reason);return o().catch(v)})},w=`
  <div id="skyWrap">
    <canvas id="sky"></canvas>
    <div class="hint">Pyro Producer · timeline designer · place peaks on beats — triggers fire early on real physics</div>
    <div class="hud" id="showHud"></div>
    <div id="report">
      <div class="reportCard">
        <div class="label">Crowd score</div>
        <div id="scoreBig"></div>
        <div id="scoreVerdict"></div>
        <div id="scoreRows"></div>
        <button id="reportClose">Close</button>
      </div>
    </div>
  </div>
  <div id="panel">
    <div class="transport">
      <button id="backBtn" style="display:none">← Gig board</button>
      <button class="go" id="play">▶ Play</button>
      <button class="stop" id="stop" disabled>■ Stop</button>
      <select id="trackSel"></select>
      <span class="trackName" id="trackName"></span>
      <span id="budget" style="display:none"></span>
      <span id="kitNotice" style="display:none"></span>
      <span id="laneNotice" style="display:none"></span>
      <span id="budgetNotice" style="display:none"></span>
      <span id="beatReadout">—</span>
      <!-- Meter before the spacer, zoom after it: the meter belongs with the
           show state on the left, and the two controls sit together on the
           right. Ordered this way the row fits on one line at 1280px. -->
      <div class="meterWrap"><span id="face">🙂</span><div class="meterBar"><div id="meterFill"></div></div><span id="exNum">–</span></div>
      <span class="spacer"></span>
      <label class="chk"><input type="checkbox" id="allTails"> all tails</label>
      <div class="seg zoomSeg">
        <button id="zoomOut" title="Zoom out">−</button>
        <button id="zoomFit" title="Fit the whole track">⤢</button>
        <button id="zoomIn" title="Zoom in">+</button>
      </div>
    </div>
    <!--
      The gear tray is its own row, not part of the transport. With ten-plus
      pieces of gear across two mounts it no longer fits beside play/stop, and
      the two segments mirror the two lane groups so the tray reads like the
      grid it fills.
    -->
    <div class="tray">
      <div class="trayGroup" id="mortarGroup">
        <span class="trayLabel">Sky racks</span>
        <div class="seg" id="mortarSeg"></div>
      </div>
      <div class="trayGroup" id="groundGroup">
        <span class="trayLabel">Ground</span>
        <div class="seg" id="groundSeg"></div>
      </div>
      <span class="spacer"></span>
      <div class="swatches" id="swatches"></div>
      <label class="small" id="sizeLabel">Size</label>
      <input type="range" id="size" min="0" max="2" step="1" value="1">
      <span class="keyhint">click cell: place / select · click selected: remove · esc: deselect · drag ruler: scrub</span>
    </div>
    <div id="grid">
      <div id="gridInner">
        <div class="sections" id="sections"></div>
        <canvas id="energy"></canvas>
        <div id="ruler"></div>
        <div id="lanes"></div>
        <div id="spans"></div>
        <div id="overlay"></div>
        <div id="playhead"></div>
      </div>
    </div>
  </div>
`;let g=null;function S(a){g=a}function E(){return g??{trackSlug:"first-light"}}async function P(a,o){a.innerHTML=w,S(o),await k(()=>import("./main-Bk1Q1DCw.js"),__vite__mapDeps([0,1,2,3,4,5]),import.meta.url)}export{P as b,E as d};
