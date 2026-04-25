/* CURSOR */
const cur=document.getElementById('cur'),cur2=document.getElementById('cur2'),cur3=document.getElementById('cur3');
let mx=0,my=0,rx=0,ry=0,r3x=0,r3y=0;
if (window.innerWidth > 768) {
    document.addEventListener('mousemove',e=>{mx=e.clientX;my=e.clientY;});
    (function loop(){
      cur.style.transform=`translate(${mx-3}px,${my-3}px)`;
      rx+=(mx-rx)*.12;ry+=(my-ry)*.12;
      cur2.style.transform=`translate(${rx-16}px,${ry-16}px)`;
      r3x+=(mx-r3x)*.06;r3y+=(my-r3y)*.06;
      cur3.style.transform=`translate(${r3x-30}px,${r3y-30}px)`;
      requestAnimationFrame(loop);
    })();
}
document.querySelectorAll('a,button,.ex-tab,.pj-c,.ac-item,.resp-item,.dt,.sp,.dot,.cta,.cpill,.cb').forEach(el=>{
  el.addEventListener('mouseenter',()=>document.body.classList.add('hov'));
  el.addEventListener('mouseleave',()=>document.body.classList.remove('hov'));
});

/* ── GAME SCRIPT ── */
let prepareTargetGame;
(function() {
    let score = 0, combo = 0, timeLeft = 60, gameActive = false;
    let spawnInterval = null, timerInterval = null;
    let targets = [];
    let highScore = localStorage.getItem('yasiefTargetHighScore') || 0;

    const scoreEl = document.getElementById('score'),
          timerEl = document.getElementById('timer'),
          comboEl = document.getElementById('combo'),
          gameArea = document.getElementById('gameArea'),
          startScreen = document.getElementById('startScreen'),
          gameOverScreen = document.getElementById('gameOverScreen'),
          startBtn = document.getElementById('startBtn'),
          restartBtn = document.getElementById('restartBtn'),
          finalScoreEl = document.getElementById('finalScore'),
          highScoreEl = document.getElementById('highScore');

    function resetGame() {
        gameActive = false;
        clearInterval(spawnInterval);
        clearInterval(timerInterval);

        score = 0;
        combo = 0;
        timeLeft = 60;
        if (gameArea) {
            targets.forEach(target => target.remove());
        }
        targets = [];

        updateUI();
        if(gameOverScreen) gameOverScreen.classList.add('hidden');
        if(startScreen) startScreen.classList.remove('hidden');
    }

    function startGame() {
        if (gameActive) return;

        resetGame();
        gameActive = true;
        if(startScreen) startScreen.classList.add('hidden');
        updateUI();

        spawnInterval = setInterval(spawnTarget, 800);

        timerInterval = setInterval(() => {
            timeLeft--;
            updateUI();
            if (timeLeft <= 0) endGame();

            if (timeLeft === 40) {
                clearInterval(spawnInterval);
                spawnInterval = setInterval(spawnTarget, 650);
            } else if (timeLeft === 20) {
                clearInterval(spawnInterval);
                spawnInterval = setInterval(spawnTarget, 500);
            }
        }, 1000);
    }

    function spawnTarget() {
        if (!gameActive || !gameArea) return;

        const target = document.createElement('div');
        target.className = 'target';

        const maxX = gameArea.offsetWidth - 80, maxY = gameArea.offsetHeight - 80;
        target.style.left = (Math.random() * maxX) + 'px';
        target.style.top = (Math.random() * maxY) + 'px';

        target.innerHTML = `<div class="target-inner"><div class="target-ring"></div><div class="target-ring"></div><div class="target-ring"></div><div class="target-timer"><div class="target-timer-fill"></div></div></div>`;

        gameArea.appendChild(target);
        targets.push(target);

        target.addEventListener('click', (e) => hitTarget(target, e));

        setTimeout(() => {
            if (target.parentNode && gameActive) missTarget(target);
        }, 3000);
    }

    function hitTarget(target, event) {
        if (!gameActive || !target.parentNode) return;
        combo++;
        score += (10 * combo);
        target.style.animation = 'targetHit 0.3s ease-out forwards';
        setTimeout(() => target.remove(), 300);
        targets = targets.filter(t => t !== target);
        updateUI();
    }

    function missTarget(target) {
        if (!gameActive) return;
        combo = 0;
        updateUI();
        target.style.opacity = '0';
        target.style.transition = 'opacity 0.3s';
        setTimeout(() => target.remove(), 300);
        targets = targets.filter(t => t !== target);
    }

    function updateUI() {
        if (!scoreEl) return;
        scoreEl.textContent = score;
        comboEl.textContent = `${combo}x`;
        timerEl.textContent = timeLeft;
    }

    function endGame() {
        gameActive = false;
        clearInterval(spawnInterval);
        clearInterval(timerInterval);
        if (score > highScore) {
            highScore = score;
            localStorage.setItem('yasiefTargetHighScore', highScore);
            if(highScoreEl) highScoreEl.textContent = `🔥 New High Score!`;
        } else {
            if(highScoreEl) highScoreEl.textContent = `High Score: ${highScore > 0 ? highScore : '---'}`;
        }
        if(finalScoreEl) finalScoreEl.textContent = score;
        if(gameOverScreen) gameOverScreen.classList.remove('hidden');
    }

    prepareTargetGame = function() {
        if (gameActive) endGame();
        resetGame();
    }

    if(startBtn) startBtn.addEventListener('click', startGame);
    if(restartBtn) restartBtn.addEventListener('click', startGame);
})();

/* NAV */
const track=document.getElementById('track');
const dots=document.querySelectorAll('.dot');
const prog=document.getElementById('prog');
const panels=document.querySelectorAll('.panel');
let cur_p=0,scrolling=false,wt=null;
const N = panels.length;
function goTo(i){
  if(i<0||i>=N)return;
  cur_p=i;
  track.style.transform=`translateX(-${i*100}vw)`;
  dots.forEach((d,j)=>d.classList.toggle('active',j===i));
  prog.style.width=((i/(N-1))*100)+'%';
  panels.forEach((p,j)=>p.classList.toggle('active',j===i));
  if(i===1) window.initThreeJSAnimation();
  if(i===2)triggerAbout();
  if(i===4)triggerDash();
  if(i===5)triggerSkills();
  if(i===7)triggerAch();
  // The Game is now on panel 1 (index 1) with the three.js animation
  if(i===1 && typeof prepareTargetGame === 'function') prepareTargetGame();
}

if (window.innerWidth > 768) {
    panels[0].classList.add('active');
    prog.style.width='0%';
    window.addEventListener('wheel',e=>{
      e.preventDefault();
      if(scrolling)return;
      scrolling=true;
      const d=Math.abs(e.deltaY)>Math.abs(e.deltaX)?e.deltaY:e.deltaX;
      if(d>30)goTo(cur_p+1);else if(d<-30)goTo(cur_p-1);
      clearTimeout(wt);wt=setTimeout(()=>scrolling=false,1000);
    },{passive:false});
    window.addEventListener('keydown',e=>{
      if(e.key==='ArrowRight'||e.key==='ArrowDown')goTo(cur_p+1);
      if(e.key==='ArrowLeft'||e.key==='ArrowUp')goTo(cur_p-1);
    });
    dots.forEach(d=>d.addEventListener('click',()=>goTo(+d.dataset.i)));
    let tx=0;
    window.addEventListener('touchstart',e=>{tx=e.touches[0].clientX;},{passive:true});
    window.addEventListener('touchend',e=>{const dx=e.changedTouches[0].clientX-tx;if(dx<-50)goTo(cur_p+1);if(dx>50)goTo(cur_p-1);},{passive:true});
} else {
    // Mobile/Portrait: Enable native vertical scrolling
    enableMobileScroll();
}

// Handle resize/orientation change
window.addEventListener('resize', function() {
    if (window.innerWidth <= 768 || window.matchMedia('(orientation:portrait)').matches) {
        enableMobileScroll();
    }
});

// Also handle orientation change
window.matchMedia('(orientation:portrait)').addEventListener('change', function() {
    enableMobileScroll();
});

function enableMobileScroll() {
    // On mobile, layout is controlled by CSS media queries.
    // We just need to remove the inline transform from desktop mode
    // and ensure the body is scrollable, as the CSS handles the rest.
    track.style.transform = 'none';
    document.body.style.overflowY = 'auto';
    document.documentElement.style.overflowY = 'auto';

    panels[0].classList.add('active');
    
    // Add scroll spy to highlight current panel
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const idx = Array.from(panels).indexOf(entry.target);
                if (idx !== -1) {
                    cur_p = idx;
                    dots.forEach((d,j)=>d.classList.toggle('active',j===idx));
                    panels.forEach((p,j)=>p.classList.toggle('active',j===idx));
                    // Trigger animations for specific panels
                    if(idx===1) window.initThreeJSAnimation();
                    if(idx===2)triggerAbout();
                    if(idx===4)triggerDash();
                    if(idx===5)triggerSkills();
                    if(idx===7)triggerAch();
                    if(idx===1 && typeof prepareTargetGame === 'function') prepareTargetGame();
                }
            }
        });
    }, { threshold: 0.5 });
    
    panels.forEach(p => observer.observe(p));
}

/* CONTACT CANVAS */
(function(){
  const c=document.getElementById('ctCanvas');
  if (!c) return;
  const ctx=c.getContext('2d');
  let W,H;
  function resize(){W=c.width=c.offsetWidth;H=c.height=c.offsetHeight;}
  resize();window.addEventListener('resize',resize);
  const pts=[];
  for(let i=0;i<50;i++) pts.push({x:Math.random()*W,y:Math.random()*H,vx:(Math.random()-.5)*.4,vy:(Math.random()-.5)*.4,r:Math.random()*1+.3});
  function draw(){
    ctx.clearRect(0,0,W,H);
    pts.forEach((p,i)=>{
      pts.slice(i+1).forEach(q=>{
        const d=Math.hypot(p.x-q.x,p.y-q.y);
        if(d<160){ctx.strokeStyle=`rgba(0,210,255,${(1-d/160)*.07})`;ctx.lineWidth=.5;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);ctx.stroke();}
      });
      ctx.fillStyle='rgba(0,210,255,0.25)';ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill();
      p.x+=p.vx;p.y+=p.vy;
      if(p.x<0||p.x>W)p.vx*=-1;if(p.y<0||p.y>H)p.vy*=-1;
    });
    requestAnimationFrame(draw);
  }
  draw();
})();

/* NETWORK TOPOLOGY CANVAS */
(function(){
  const c=document.getElementById('netCanvas');
  if (!c) return;
  const ctx=c.getContext('2d');
  let W,H;
  function resize(){W=c.width=c.offsetWidth;H=c.height=c.offsetHeight;}
  resize();
  const devs=[{label:'IoT',col:'#00ff9d'},{label:'DB',col:'#7b2fff'},{label:'APP',col:'#00d2ff'},{label:'BKUP',col:'#ff6b35'},{label:'SEC',col:'#ff3e8a'},{label:'WEB',col:'#00d2ff'}];
  let pkts=[];
  setInterval(()=>{const d=devs[Math.floor(Math.random()*devs.length)];pkts.push({to:d,t:0,col:d.col});},600);
  function draw(){
    if(!W){resize();return;}
    ctx.clearRect(0,0,W,H);
    const cx=W/2,cy=H/2,R=Math.min(W,H)*.36;
    devs.forEach((d,i)=>{const a=(i/devs.length)*Math.PI*2-Math.PI/2;d.x=cx+Math.cos(a)*R;d.y=cy+Math.sin(a)*R;});
    devs.forEach(d=>{
      ctx.strokeStyle='rgba(0,210,255,0.08)';ctx.lineWidth=1;ctx.setLineDash([4,6]);
      ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(d.x,d.y);ctx.stroke();ctx.setLineDash([]);
    });
    pkts.forEach(p=>{
      p.t+=.015;
      const x=cx+(p.to.x-cx)*p.t,y=cy+(p.to.y-cy)*p.t;
      ctx.fillStyle=p.col;ctx.shadowBlur=6;ctx.shadowColor=p.col;
      ctx.beginPath();ctx.arc(x,y,2.5,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
    });
    pkts=pkts.filter(p=>p.t<1);
    ctx.fillStyle='rgba(0,210,255,0.1)';ctx.strokeStyle='rgba(0,210,255,0.5)';ctx.lineWidth=1.5;
    ctx.beginPath();ctx.arc(cx,cy,18,0,Math.PI*2);ctx.fill();ctx.stroke();
    ctx.fillStyle='#00d2ff';ctx.font='bold 8px JetBrains Mono';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText('CORE',cx,cy);
    devs.forEach(d=>{
      ctx.fillStyle=d.col+'22';ctx.strokeStyle=d.col+'88';ctx.lineWidth=1;
      ctx.beginPath();ctx.arc(d.x,d.y,12,0,Math.PI*2);ctx.fill();ctx.stroke();
      ctx.fillStyle=d.col;ctx.font='bold 7px JetBrains Mono';ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.fillText(d.label,d.x,d.y);
    });
    requestAnimationFrame(draw);
  }
  draw();
})();

/* TERMINAL */
const tLines=[
  {t:'cmd',txt:'whoami'},{t:'out',txt:'<span>Mohamed Yasief</span> — IT Administrator'},
  {t:'cmd',txt:'cat location.txt'},{t:'out',txt:'Dubai, United Arab Emirates 🇦🇪'},
  {t:'cmd',txt:'cat current_role.txt'},{t:'out',txt:'IT Administrator @ <span>LaundryBox Dubai</span>'},
  {t:'cmd',txt:'ls skills/'},{t:'out',txt:'ERP  Networks  Security  Cloud  DevOps  Marketing'},
  {t:'cmd',txt:'./status.sh'},{t:'out',txt:'✓ Available for new opportunities'},
];
let tIdx=0,chIdx=0,typing=false;
function typeNext(){
  if(tIdx>=tLines.length)return;
  if (!document.getElementById('termBody')) return; // Safety check
  const tb=document.getElementById('termBody');
  const line=tLines[tIdx];
  if(!typing){
    const div=document.createElement('div');div.className='tl';
    if(line.t==='cmd')div.innerHTML=`<span class="tp">yasief@dubai:~$</span><span class="tc" id="tl${tIdx}"> </span>`;
    else div.innerHTML=`<span class="to" id="tl${tIdx}"></span>`;
    tb.appendChild(div);typing=true;chIdx=0;
  }
  const el=document.getElementById('tl'+tIdx);
  if(chIdx<=line.txt.length){
    el.innerHTML=(line.t==='cmd'?' ':'')+line.txt.substring(0,chIdx);
    chIdx++;setTimeout(typeNext,line.t==='cmd'?55:22);
  } else {typing=false;tIdx++;setTimeout(typeNext,line.t==='cmd'?220:700);}
}

/* ACTIVITY LOG */
const logs=[
  {cl:'lok',m:'[SUCCESS] ERP sync completed — 0 errors'},{cl:'linf',m:'[INFO] Backup job initiated on BKUP-01'},
  {cl:'lok',m:'[SUCCESS] Firewall rules updated'},{cl:'lwn',m:'[WARN] IoT node 07 high latency'},
  {cl:'linf',m:'[INFO] New device enrolled — MOBILE-42'},{cl:'lok',m:'[SUCCESS] SSL certificates renewed'},
  {cl:'lerr',m:'[ALERT] Unauthorized access attempt blocked'},{cl:'lok',m:'[SUCCESS] Threat neutralized'},
  {cl:'linf',m:'[INFO] Network health check passed'},{cl:'lok',m:'[SUCCESS] Database optimisation complete'},
  {cl:'linf',m:'[INFO] User account provisioned — STAFF-19'},{cl:'lwn',m:'[WARN] Disk usage 78% on PROD-01'},
];
let logIdx=0;
function addLog(){
  const w=document.getElementById('logWrap');if(!w)return;
  const m=logs[logIdx%logs.length];
  const now=new Date();
  const ts=now.getHours().toString().padStart(2,'0')+':'+now.getMinutes().toString().padStart(2,'0')+':'+now.getSeconds().toString().padStart(2,'0');
  const div=document.createElement('div');div.className='log-ln';
  div.innerHTML=`<span class="lt">${ts}</span><span class="${m.cl} lmsg">${m.m}</span>`;
  w.appendChild(div);w.scrollTop=w.scrollHeight;
  if(w.children.length>12)w.removeChild(w.children[0]);
  logIdx++;
}
setInterval(addLog,1800);
for(let i=0;i<6;i++)addLog();

/* TRIGGERS */
let aboutDone=false,dashDone=false,skillsDone=false,achDone=false;
function triggerAbout(){
  if(aboutDone)return;aboutDone=true;
  function cu(id,end,suf=''){
    let n=0;const el=document.getElementById(id);if(!el)return;
    const iv=setInterval(()=>{n=Math.min(n+end/40,end);el.innerHTML=Math.round(n)+(suf?`<span style="font-size:1.5rem">${suf}</span>`:'');if(n>=end)clearInterval(iv);},40);
  }
  cu('cnt1',4,'+');cu('cnt2',3,'');cu('cnt3',20,'%');cu('cnt4',35,'%');
  document.querySelectorAll('.sf').forEach(b=>{b.style.width=(b.dataset.w||50)+'%';});
  setTimeout(typeNext,400);
}
function triggerDash(){
  if(dashDone)return;dashDone=true;
  let u=0;const uel=document.getElementById('uptimeCount');
  const iv=setInterval(()=>{u=Math.min(u+2.5,99.7);if(uel)uel.textContent=u.toFixed(1);if(u>=99.7)clearInterval(iv);},30); // No change needed, uel is checked
  let inc=0;const iel=document.getElementById('incCount');
  const iv2=setInterval(()=>{inc=Math.min(inc+7,347);if(iel)iel.textContent=String(inc);if(inc>=347)clearInterval(iv2);},20);
  setTimeout(()=>{
    document.querySelectorAll('.cfill').forEach(r=>{r.style.strokeDashoffset=r.dataset.offset;});
  },300);
  document.querySelectorAll('.erp-fill').forEach(b=>{b.style.width=(b.dataset.w||70)+'%';});
}
function triggerSkills(){
  if(skillsDone)return;skillsDone=true;
  document.querySelectorAll('.skf').forEach(b=>{b.style.width=(b.dataset.w||60)+'%';});
}
function triggerAch(){
  if(achDone)return;achDone=true;
  document.querySelectorAll('.cn').forEach(el=>{
    const end=+el.dataset.n;let n=0;
    const iv=setInterval(()=>{n=Math.min(n+Math.ceil(end/30),end);el.textContent=n;if(n>=end)clearInterval(iv);},40);
  });
}

/* EXPERIENCE TABS */
document.querySelectorAll('.ex-tab').forEach(tab=>{
  tab.addEventListener('click',()=>{
    document.querySelectorAll('.ex-tab').forEach(t=>t.classList.remove('active'));
    tab.classList.add('active');
    const pane=tab.dataset.pane;
    document.querySelectorAll('.ex-pane').forEach(p=>p.classList.remove('show'));
    const t=document.getElementById('pane-'+pane);if(t)t.classList.add('show');
  });
});
