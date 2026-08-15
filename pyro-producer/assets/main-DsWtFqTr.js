import{E as q,C as R,a as B,d as k}from"./library-1cuVL6R9.js";import{v as p,l as P}from"./textures-BmA3wdwE.js";import{b as A}from"./boot-CHRYM5ge.js";import{S as u}from"./unlock-CvlgYHdK.js";const v=[{slug:"backyard-debut",name:"Backyard Debut",venue:"backyard",venueBlurb:"Your own back fence, a folding-chair crowd, and a milk crate of ground gear. No mortars — not yet.",trackSlug:"first-light",budget:160,fee:1e3},{slug:"block-party",name:"Block Party",venue:"neighborhood",venueBlurb:"The neighborhood closed the street and hired you on purpose. Bigger sky, bigger song, real expectations.",trackSlug:"ignition",budget:600,fee:1500},{slug:"town-square",name:"Town Square",venue:"civic",venueBlurb:"The civic fireworks night, in front of everyone you know. A slow, grand piece with a long quiet half — hold your nerve before the anthem lands.",trackSlug:"skyline",budget:1100,fee:2750},{slug:"main-stage",name:"Main Stage",venue:"festival",venueBlurb:"Festival headliner, and the crowd is already lit before you fire a thing. Ninety seconds, a real breakdown to hold your nerve through, and the first stage that expects fire.",trackSlug:"main-stage",budget:3200,fee:5e3}];function M(t){const e=v.find(n=>n.slug===t);if(!e)throw new Error(`unknown gig '${t}' (have: ${v.map(n=>n.slug).join(", ")})`);return e}for(const t of v)p(t.venue);const g=[{id:"effect-sparkler-bed",kind:"effect",name:"sparkler-bed",label:"Sparkler bed",blurb:"A long, soft shimmer at ground level. Holds the quietest bars without ever stealing them.",price:80},{id:"effect-whistler",kind:"effect",name:"whistler",label:"Whistlers",blurb:"A rising shriek and a small pop. Your first cue that lands on the ear before the eye.",price:120},{id:"color-blue",kind:"color",name:"blue",label:"Blue stars",blurb:"A cool third colour — another way to break a repeat.",price:150},{id:"color-green",kind:"color",name:"green",label:"Green stars",blurb:"Reads bright against gold; good for alternating runs.",price:150},{id:"effect-fountain",kind:"effect",name:"fountain",label:"Fountain",blurb:"Seven seconds of gold. The long burn that carries a whole quiet section on its own.",price:200},{id:"color-violet",kind:"color",name:"violet",label:"Violet stars",blurb:"The moody one. Sits back so the golds punch harder.",price:250},{id:"color-white",kind:"color",name:"white",label:"White stars",blurb:"Pure flash — the sharpest contrast in the palette.",price:250},{id:"effect-roman-candle",kind:"effect",name:"roman-candle",label:"Roman candles",blurb:"Eight shots on a steady beat. Ground gear that keeps time instead of just holding a note.",price:260},{id:"effect-peony",kind:"effect",name:"peony",label:"Peony shells + mortar rack",blurb:"Your first rack, and the shell to put in it. This is the night the sky opens up.",price:1200},{id:"effect-flame-jet",kind:"effect",name:"flame-jet",label:"Flame jets",price:1300,blurb:"A column of fire and a propane whump. The first cue that hits the chest instead of the ear."},{id:"effect-chrysanthemum",kind:"effect",name:"chrysanthemum",label:"Chrysanthemum shells",blurb:"A second silhouette to alternate against — a full sphere of trailing stars.",price:1400},{id:"size-2",kind:"size",name:"size-2",label:"Big shells (size L)",blurb:"Size-2 shells. The only way to land the big accents — and they sour in quiet sections. Needs a rack.",price:1600},{id:"effect-flame-wall",kind:"effect",name:"flame-wall",label:"Flame wall",price:1700,blurb:"Four seconds of fire across the whole stage. Carries a breakdown the way a fountain carries a quiet bar."},{id:"effect-willow",kind:"effect",name:"willow",label:"Willow shells",blurb:"Long drooping tails that hang in the air — a breath between hits.",price:1800},{id:"effect-crossette",kind:"effect",name:"crossette",label:"Crossette shells",blurb:"Every star splits into a cross. The highest magnitude a single cue can carry.",price:2600}];for(const t of g){if(t.kind==="effect"&&!q.some(e=>e.name===t.name))throw new Error(`shop item '${t.id}' names unknown effect '${t.name}'`);if(t.kind==="color"&&!R.some(e=>e.name===t.name))throw new Error(`shop item '${t.id}' names unknown color '${t.name}'`)}const x="pyro-save-v1";function y(){return{effects:[...u.effects],colors:[...u.colors],maxSize:u.maxSize}}function b(){return{v:2,cash:0,showsPerformed:0,best:{},owned:y()}}function N(t){if(typeof t!="object"||t===null)return y();const e=t,n=(a,i)=>Array.isArray(a)&&a.every(o=>typeof o=="string")&&a.length>0?a:i,s=e.maxSize===0||e.maxSize===1||e.maxSize===2?e.maxSize:u.maxSize;return{effects:n(e.effects,[...u.effects]),colors:n(e.colors,[...u.colors]),maxSize:s}}function F(t=localStorage){const e=t.getItem(x);if(e===null)return b();let n;try{n=JSON.parse(e)}catch{return b()}if(typeof n!="object"||n===null)return b();const s=n;if(s.v!==1&&s.v!==2||typeof s.cash!="number"||!Number.isFinite(s.cash))return b();const a={};if(typeof s.best=="object"&&s.best!==null)for(const[r,l]of Object.entries(s.best))typeof l=="number"&&Number.isFinite(l)&&(a[r]=l);const i=typeof s.showsPerformed=="number"&&Number.isFinite(s.showsPerformed)?s.showsPerformed:0,o=s.v===2?N(s.owned):y();return{v:2,cash:s.cash,showsPerformed:i,best:a,owned:o}}function C(t,e=localStorage){e.setItem(x,JSON.stringify(t))}function G(t,e,n){const s=Math.round(t.fee*e.final/100);return{fee:t.fee,bonus:s,spend:n,profit:t.fee+s-n}}function T(t,e){return e.kind==="effect"?t.owned.effects.includes(e.name):e.kind==="color"?t.owned.colors.includes(e.name):t.owned.maxSize>=2}function z(t,e){return t.cash>=e.price}function O(t,e){if(T(t,e)||!z(t,e))return null;const n={effects:e.kind==="effect"?[...t.owned.effects,e.name]:[...t.owned.effects],colors:e.kind==="color"?[...t.owned.colors,e.name]:[...t.owned.colors],maxSize:e.kind==="size"?2:t.owned.maxSize};return{...t,cash:t.cash-e.price,owned:n}}function W(t,e,n,s){const a=t.best[e];return{...t,cash:t.cash+n.profit,showsPerformed:t.showsPerformed+1,best:{...t.best,[e]:a===void 0?s:Math.max(a,s)}}}function f(t){const e=document.createElement("template");return e.innerHTML=t.trim(),e.content.firstElementChild}function j(t,e,n,s){const a=e.owned.effects.length+e.owned.colors.length+(e.owned.maxSize>=2?1:0),i=f(`
    <div class="frame">
      <div class="kicker">A show producer sim</div>
      <h1>Pyro <span class="flare">Producer</span></h1>
      <div class="sub">Take a gig · study the track · design the show · get paid on how the crowd felt.</div>
      <div class="producerCard">
        <div class="stat"><div class="label">Cash</div><div class="value" id="cash">$${e.cash}</div></div>
        <div class="stat"><div class="label">Shows</div><div class="value">${e.showsPerformed}</div></div>
        <div class="stat"><div class="label">Kit</div><div class="value">${a}/${g.length+3}</div></div>
      </div>
      <div class="btnRow"><button class="primary" id="toWorkshop">🛠 Workshop — spend your profit</button></div>
      <div id="gigBoard"></div>
      <!-- Relative, NOT root-absolute: the built site deploys into a SUBFOLDER
           of the menagerie site, so '/designer.html' resolves against that
           site's root and 404s. Same reason vite.config sets base './' — but
           hand-written hrefs never pass through Vite's asset rewriting, so
           they have to be relative by hand. -->
      <div class="devLinks">dev corners: <a href="designer.html">standalone designer</a> · <a href="demo.html">effect engine demo</a></div>
    </div>
  `),o=i.querySelector("#gigBoard");for(const r of v){const l=B(r.trackSlug),c=e.best[r.slug],h=f(`
      <button class="gigCard" data-gig="${r.slug}">
        <div class="gigName">${r.name}</div>
        <div class="gigTrack">${l.name} · ${l.bpm} bpm</div>
        <div class="gigBlurb">${r.venueBlurb}</div>
        <div class="gigMeta">
          <span>fee <b>$${r.fee}</b></span>
          <span>budget <b>$${r.budget}</b></span>
          <span>${c!==void 0?`<span class="best">best ${c}</span>`:"not yet played"}</span>
        </div>
      </button>
    `);h.onclick=()=>n(r),o.appendChild(h)}i.querySelector("#toWorkshop").onclick=s,t.replaceChildren(i)}function I(t,e,n,s){const a=f(`
    <div class="frame shop">
      <div class="kicker">Workshop</div>
      <h1>Your kit</h1>
      <div class="sub">Unlocks are permanent — they carry into every gig. The per-gig budget is separate: this is what you're <em>allowed</em> to place, not what you can afford tonight.</div>
      <div class="producerCard">
        <div class="stat"><div class="label">Cash</div><div class="value">$${e.cash}</div></div>
      </div>
      <div id="shelf"></div>
      <div class="btnRow"><button class="ghost" id="shopBack">← Gig board</button></div>
    </div>
  `),i=a.querySelector("#shelf");for(const o of g){const r=T(e,o),l=z(e,o),c=f(`
      <div class="shopItem ${r?"owned":l?"":"broke"}" data-item="${o.id}">
        <div class="shopMain">
          <div class="shopLabel">${o.label}</div>
          <div class="shopBlurb">${o.blurb}</div>
        </div>
        <div class="shopBuy">
          ${r?'<span class="ownedTag">✓ owned</span>':`<button class="primary buy" ${l?"":"disabled"}>$${o.price}</button>
                 ${l?"":`<div class="short">$${o.price-e.cash} short</div>`}`}
        </div>
      </div>
    `),h=c.querySelector(".buy");h&&(h.onclick=()=>n(o)),i.appendChild(c)}a.querySelector("#shopBack").onclick=s,t.replaceChildren(a)}function L(t,e){const n=t.getBoundingClientRect();t.width=Math.max(1,Math.round(n.width*devicePixelRatio)),t.height=Math.max(1,Math.round(n.height*devicePixelRatio));const s=t.getContext("2d");s.scale(devicePixelRatio,devicePixelRatio);const a=n.width,i=n.height;s.clearRect(0,0,a,i),s.beginPath();for(let o=0;o<=a;o++){const r=i-4-k(e,o/a*e.durationBeats)*(i-9);o===0?s.moveTo(o,r):s.lineTo(o,r)}s.strokeStyle="rgba(245,185,66,.7)",s.lineWidth=1.5,s.stroke();for(const o of e.accents)s.beginPath(),s.arc(o.beat/e.durationBeats*a,i-4-k(e,o.beat)*(i-9),2.5,0,Math.PI*2),s.fillStyle=o.strength>=.9?"#f5b942":"rgba(245,185,66,.55)",s.fill()}function Y(t,e,n,s,a){const i=B(e.trackSlug),o=Math.round(i.durationBeats/i.beatsPerBar),r=n.best[e.slug],l=f(`
    <div class="frame brief">
      <div class="kicker">Gig briefing</div>
      <h1>${e.name}</h1>
      <div class="sub">${e.venueBlurb}</div>
      <dl>
        <dt>Fee</dt><dd>$${e.fee} flat, plus a crowd bonus up to $${e.fee} — score S pays $${e.fee}·S/100 on top.</dd>
        <dt>Budget</dt><dd>$${e.budget} for shells. Unspent money stays yours; a starved sky pays no bonus.</dd>
        <dt>Track</dt><dd>${i.name} · ${i.bpm} bpm · ${o} bars · ${i.accents.length} accents worth hitting</dd>
        ${r!==void 0?`<dt>Your best</dt><dd>${r}</dd>`:""}
      </dl>
      <div class="sectionsRow">${i.sections.map(c=>`<span class="sectionChip" style="flex:${c.endBeat-c.startBeat}">${c.name}</span>`).join("")}</div>
      <canvas id="briefEnergy"></canvas>
      <div class="energyNote">What the crowd wants, beat by beat — trace it. Dots are the accents; the big ones want size-2 shells.</div>
      <div class="btnRow">
        <button class="ghost" id="briefBack">← Gig board</button>
        <button class="primary" id="briefGo">Design the show →</button>
      </div>
    </div>
  `);l.querySelector("#briefBack").onclick=s,l.querySelector("#briefGo").onclick=a,t.replaceChildren(l),L(l.querySelector("#briefEnergy"),i)}function D(t,e,n,s,a,i){document.querySelector(".gameOverlay")?.remove();const o=f(`
    <div class="gameOverlay" id="payout">
      <div class="card">
        <div class="label">${t.name} — settled up</div>
        <div class="big">${e.final}</div>
        <div class="verdict">${e.verdict}</div>
        ${a?'<div class="newBest">★ new personal best</div>':""}
        <div class="rows">
          <div><span>Completion fee</span><b>+$${n.fee}</b></div>
          <div><span>Crowd bonus (${e.final}% of fee)</span><b>+$${n.bonus}</b></div>
          <div><span>Production spend</span><b>−$${n.spend}</b></div>
          <div class="profit"><span>Profit</span><b>$${n.profit}</b></div>
        </div>
        <div class="cashNote">${e.note}<br>Cash on hand: <b>$${s.cash}</b> · shows performed: ${s.showsPerformed}</div>
        <button id="payoutBack">Back to the gig board</button>
      </div>
    </div>
  `);o.querySelector("#payoutBack").onclick=i,document.body.appendChild(o)}const m=document.getElementById("screens"),$=document.getElementById("wrap");let d=F();function w(){j(m,d,U,E)}function E(){I(m,d,K,w)}function K(t){const e=O(d,t);e!==null&&(d=e,C(d)),E()}function U(t){P(p(t.venue)),Y(m,t,d,w,()=>{location.href=`?gig=${t.slug}`})}async function V(t){m.style.display="none",$.style.display="",await P(p(t.venue)),A($,{trackSlug:t.trackSlug,gig:{budget:t.budget,owned:d.owned,venue:p(t.venue),onComplete:(e,n)=>{const s=G(t,e,n),a=e.final>(d.best[t.slug]??-1);d=W(d,t.slug,s,e.final),C(d),D(t,e,s,d,a,()=>{location.href="./"})}}})}const S=new URLSearchParams(location.search).get("gig");if(S!==null){let t=null;try{t=M(S)}catch{location.href="./"}t&&V(t)}else w();
