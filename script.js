/* ── FIREBASE ── */
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, addDoc, collection } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-firestore.js";

const _fbApp = initializeApp({
    apiKey: "AIzaSyAOIMO3KSymCdMEzzRSv8fPYTRq0d8B1dA",
    authDomain: "yasiefgamescore.firebaseapp.com",
    projectId: "yasiefgamescore",
    storageBucket: "yasiefgamescore.firebasestorage.app",
    messagingSenderId: "611373225952",
    appId: "1:611373225952:web:ab216bd2cdefebdcadfd85"
});
const _db = getFirestore(_fbApp);
const _CHAMP_DOC = doc(_db, 'game', 'champion');

/* CURSOR */
const cur=document.getElementById('cur'),cur2=document.getElementById('cur2'),cur3=document.getElementById('cur3');
let mx=0,my=0,rx=0,ry=0,r3x=0,r3y=0;
if (window.innerWidth > 768 && cur && cur2 && cur3) {
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
    let highScore = Number(localStorage.getItem('yasiefTargetHighScore')) || 0;

    /* bonus char state — declared early so clearBonusChar is usable in resetGame */
    let bonusEl = null, bonusTimeout = null, bonusMoveRaf = null, bonusSchedule = null;
    const BONUS_CHARS = ['⚡','🔥','💎','⭐','🎯'];
    function clearBonusChar() {
        clearTimeout(bonusTimeout);
        clearTimeout(bonusSchedule);
        cancelAnimationFrame(bonusMoveRaf);
        if (bonusEl && bonusEl.parentNode) bonusEl.remove();
        bonusEl = null;
    }

    async function getChampion() {
        try {
            const snap = await getDoc(_CHAMP_DOC);
            if (!snap.exists()) return null;
            const data = snap.data();
            if (Date.now() > data.expires) return null;
            return data;
        } catch(e) { return null; }
    }

    async function saveChampion(name, scoreVal) {
        const data = { name: name.trim() || 'Anonymous', score: scoreVal, expires: Date.now() + 86400000 };
        await setDoc(_CHAMP_DOC, data);
        localStorage.setItem('yasiefTargetHighScore', scoreVal);
        highScore = scoreVal;
    }

    async function renderChampionBanner() {
        const banner = document.getElementById('championBanner');
        if (!banner) return;
        const champ = await getChampion();
        if (champ) {
            banner.innerHTML = `<span class="champ-crown">👑</span><span class="champ-name">${champ.name}</span><span class="champ-score">${champ.score} pts</span><span class="champ-exp">resets in 24h</span>`;
            banner.classList.remove('hidden');
            // sync local highscore with cloud
            if (champ.score > highScore) {
                highScore = champ.score;
                localStorage.setItem('yasiefTargetHighScore', highScore);
            }
        } else {
            banner.classList.add('hidden');
        }
    }

    const scoreEl = document.getElementById('score'),
          timerEl = document.getElementById('timer'),
          comboEl = document.getElementById('combo'),
          gameArea = document.getElementById('gameArea'),
          startScreen = document.getElementById('startScreen'),
          gameOverScreen = document.getElementById('gameOverScreen'),
          startBtn = document.getElementById('startBtn'),
          restartBtn = document.getElementById('restartBtn'),
          finalScoreEl = document.getElementById('finalScore'),
          highScoreEl = document.getElementById('highScore'),
          nameInputWrap = document.getElementById('nameInputWrap'),
          championNameInput = document.getElementById('championNameInput'),
          saveNameBtn = document.getElementById('saveNameBtn');

    function resetGame() {
        gameActive = false;
        clearInterval(spawnInterval);
        clearInterval(timerInterval);
        clearBonusChar();

        score = 0;
        combo = 0;
        timeLeft = 60;
        if (gameArea) {
            targets.forEach(target => target.remove());
        }
        targets = [];

        updateUI();
        if(gameOverScreen) gameOverScreen.classList.add('hidden');
        if(nameInputWrap) nameInputWrap.classList.add('hidden');
        if(startScreen) startScreen.classList.remove('hidden');
        renderChampionBanner();
    }

    function startGame() {
        if (gameActive) return;

        resetGame();
        gameActive = true;
        if(startScreen) startScreen.classList.add('hidden');
        updateUI();

        spawnInterval = setInterval(spawnTarget, 800);
        scheduleNextBonus();

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

        target.addEventListener('click', () => hitTarget(target));

        setTimeout(() => {
            if (target.parentNode && gameActive) missTarget(target);
        }, 3000);
    }

    function showComboPopup(target) {
        if (!gameArea) return;
        const rect = target.getBoundingClientRect();
        const areaRect = gameArea.getBoundingClientRect();
        const pop = document.createElement('div');
        pop.className = 'combo-pop';
        const points = 10 + combo;
        pop.innerHTML = combo >= 2
            ? `<span class="combo-pop-pts">+${points}</span><span class="combo-pop-label">${combo}x COMBO!</span>`
            : `<span class="combo-pop-pts">+${points}</span>`;
        pop.style.left = (rect.left - areaRect.left + rect.width / 2) + 'px';
        pop.style.top  = (rect.top  - areaRect.top) + 'px';
        gameArea.appendChild(pop);
        setTimeout(() => pop.remove(), 700);
    }

    function hitTarget(target) {
        if (!gameActive || !target.parentNode) return;
        combo++;
        score += (10 + combo);
        showComboPopup(target);
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
        if (!scoreEl || !comboEl || !timerEl) return;
        scoreEl.textContent = score;
        comboEl.textContent = `${combo}x`;
        timerEl.textContent = timeLeft;
    }

    function showNameInput() {
        const wrap = document.getElementById('nameInputWrap');
        const input = document.getElementById('championNameInput');
        if (wrap) { wrap.style.display = 'flex'; wrap.classList.remove('hidden'); }
        if (input) { input.value = ''; setTimeout(() => input.focus(), 150); }
    }

    function hideNameInput() {
        const wrap = document.getElementById('nameInputWrap');
        if (wrap) { wrap.style.display = 'none'; wrap.classList.add('hidden'); }
    }

    async function endGame() {
        gameActive = false;
        clearInterval(spawnInterval);
        clearInterval(timerInterval);
        clearBonusChar();
        targets.forEach(t => t.remove());
        targets = [];

        // log every game to Firestore scores collection
        try {
            await addDoc(collection(_db, 'scores'), {
                score,
                playedAt: new Date().toISOString(),
                device: /Mobi|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop'
            });
        } catch(e) { /* silent fail — don't block game over screen */ }

        const fs = document.getElementById('finalScore');
        if (fs) fs.textContent = score;
        const gos = document.getElementById('gameOverScreen');
        if (gos) gos.classList.remove('hidden');

        const hs = document.getElementById('highScore');
        if (hs) hs.textContent = 'Checking scores…';

        const champ = await getChampion();
        const cloudBest = champ ? champ.score : 0;
        const isNewHigh = score > cloudBest;

        if (isNewHigh) {
            highScore = score;
            localStorage.setItem('yasiefTargetHighScore', score);
            if (hs) hs.textContent = '🔥 New High Score!';
            showNameInput();
        } else {
            if (hs) hs.textContent = champ
                ? `👑 ${champ.name} — ${champ.score} pts`
                : `High Score: ${highScore > 0 ? highScore : '---'}`;
            hideNameInput();
        }
    }

    /* ── BONUS CHARACTER ── */
    function spawnBonusChar() {
        if (!gameActive || !gameArea) return;
        clearBonusChar();

        bonusEl = document.createElement('div');
        bonusEl.className = 'bonus-char';
        bonusEl.textContent = BONUS_CHARS[Math.floor(Math.random() * BONUS_CHARS.length)];

        const aW = gameArea.offsetWidth, aH = gameArea.offsetHeight;
        const size = 36;
        let x = Math.random() * (aW - size);
        let y = Math.random() * (aH - size);
        // random fast velocity
        const speed = 3.5 + Math.random() * 2.5;
        let vx = (Math.random() < 0.5 ? -1 : 1) * speed;
        let vy = (Math.random() < 0.5 ? -1 : 1) * speed;

        bonusEl.style.left = x + 'px';
        bonusEl.style.top  = y + 'px';
        gameArea.appendChild(bonusEl);

        bonusEl.addEventListener('click', () => {
            if (!gameActive || !bonusEl) return;
            // show +30 popup
            const pop = document.createElement('div');
            pop.className = 'combo-pop bonus-pop';
            pop.innerHTML = `<span class="combo-pop-pts" style="color:var(--c4);font-size:1.4rem">+30</span><span class="combo-pop-label" style="color:var(--c3)">BONUS!</span>`;
            pop.style.left = (x + size / 2) + 'px';
            pop.style.top  = y + 'px';
            gameArea.appendChild(pop);
            setTimeout(() => pop.remove(), 700);
            score += 30;
            updateUI();
            clearBonusChar();
            scheduleNextBonus();
        });

        // bounce around game area
        function moveBonus() {
            if (!gameActive || !bonusEl) return;
            x += vx; y += vy;
            if (x <= 0)        { x = 0;        vx = Math.abs(vx); }
            if (x >= aW - size){ x = aW - size; vx = -Math.abs(vx); }
            if (y <= 0)        { y = 0;        vy = Math.abs(vy); }
            if (y >= aH - size){ y = aH - size; vy = -Math.abs(vy); }
            bonusEl.style.left = x + 'px';
            bonusEl.style.top  = y + 'px';
            bonusMoveRaf = requestAnimationFrame(moveBonus);
        }
        bonusMoveRaf = requestAnimationFrame(moveBonus);

        // disappears after 2.5s if not caught
        bonusTimeout = setTimeout(() => {
            clearBonusChar();
            scheduleNextBonus();
        }, 2500);
    }

    function scheduleNextBonus() {
        if (!gameActive) return;
        // appears every 8–15 seconds randomly
        const delay = 8000 + Math.random() * 7000;
        bonusSchedule = setTimeout(spawnBonusChar, delay);
    }

    prepareTargetGame = function() {
        if (gameActive) endGame();
        resetGame();
    }

    async function doSaveName() {
        const input = document.getElementById('championNameInput');
        const name = (input ? input.value.trim() : '') || 'Anonymous';
        const hs = document.getElementById('highScore');
        if (hs) hs.textContent = 'Saving…';
        hideNameInput();
        await saveChampion(name, highScore);
        if (hs) hs.textContent = `👑 ${name} — ${highScore} pts`;
        renderChampionBanner();
    }

    const _saveBtn = document.getElementById('saveNameBtn');
    const _nameInput = document.getElementById('championNameInput');
    if (_saveBtn) _saveBtn.addEventListener('click', doSaveName);
    if (_nameInput) _nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') doSaveName(); });

    // load champion from Firestore immediately on page load
    renderChampionBanner();

    const gameContainer = document.getElementById('gameContainer');
    const fsExitBtn     = document.getElementById('fsExitBtn');

    const cursorEls = ['cur','cur2','cur3'].map(id => document.getElementById(id)).filter(Boolean);
    let cursorOrigParent = cursorEls.length ? cursorEls[0].parentNode : null;

    function moveCursorsInto(container) {
        cursorEls.forEach(el => container.appendChild(el));
    }
    function moveCursorsOut() {
        if (!cursorOrigParent) return;
        cursorEls.forEach(el => cursorOrigParent.appendChild(el));
    }

    function enterFullscreen() {
        if (!gameContainer) return;
        const el = gameContainer;
        const req = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen;
        if (req) {
            req.call(el).then(() => moveCursorsInto(gameContainer)).catch(() => applyPseudoFs());
        } else {
            applyPseudoFs();
        }
    }

    function applyPseudoFs() {
        if (!gameContainer) return;
        gameContainer.classList.add('pseudo-fs');
        document.body.classList.add('game-pseudo-fs');
        moveCursorsInto(gameContainer);
        if (fsExitBtn) fsExitBtn.style.display = 'inline-block';
    }

    function removePseudoFs() {
        if (!gameContainer) return;
        gameContainer.classList.remove('pseudo-fs');
        document.body.classList.remove('game-pseudo-fs');
        moveCursorsOut();
        if (fsExitBtn) fsExitBtn.style.display = 'none';
    }

    function exitFullscreen() {
        if (gameContainer && gameContainer.classList.contains('pseudo-fs')) {
            removePseudoFs();
            return;
        }
        if      (document.exitFullscreen)       document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        else if (document.mozCancelFullScreen)  document.mozCancelFullScreen();
    }

    // show/hide exit button based on fullscreen state
    document.addEventListener('fullscreenchange',       onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
    document.addEventListener('mozfullscreenchange',    onFsChange);

    function onFsChange() {
        const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement);
        if (gameContainer && gameContainer.classList.contains('pseudo-fs')) return;
        if (!isFs) moveCursorsOut();
        if (fsExitBtn) fsExitBtn.style.display = isFs ? 'inline-block' : 'none';
    }

    if (startBtn)   startBtn.addEventListener('click',   () => { startGame(); enterFullscreen(); });
    if (restartBtn) restartBtn.addEventListener('click', () => { startGame(); enterFullscreen(); });
    if (fsExitBtn)  fsExitBtn.addEventListener('click',  exitFullscreen);
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
  const prev=cur_p;
  cur_p=i;
  track.style.transform=`translateX(-${i*100}vw)`;
  dots.forEach((d,j)=>d.classList.toggle('active',j===i));
  prog.style.width=((i/(N-1))*100)+'%';
  panels.forEach((p,j)=>p.classList.toggle('active',j===i));
  // Keep content of the entering panel visible permanently so the previous panel
  // doesn't appear blank during the 1s slide transition.
  panels[i].classList.add('revealed');
  if(isDesktop && i!==prev){
    panels[i].classList.remove('entering');
    void panels[i].offsetWidth;
    panels[i].classList.add('entering');
    setTimeout(()=>panels[i].classList.remove('entering'),700);
  }
  if(i===0 && typeof window.initHeroNetworkAnimation === 'function') window.initHeroNetworkAnimation();
  if(i===1 && typeof window.initThreeJSAnimation === 'function') window.initThreeJSAnimation();
  if(i===2)triggerAbout();
  if(i===4)triggerDash();
  if(i===5)triggerSkills();
  if(i===4 && typeof window.initNetworkTopologyAnimation === 'function') window.initNetworkTopologyAnimation();
  if(i===8)triggerMathUniverse();
  if(i===7)triggerAch();
  if(i===1 && typeof prepareTargetGame === 'function') prepareTargetGame();
}

let isDesktop;

// --- Event Handlers ---
const desktopWheelHandler = e => {
    if(document.body.classList.contains('cmd-open')) return;
    e.preventDefault();
    if(scrolling) return;
    scrolling = true;
    const d = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    if(d > 30) goTo(cur_p + 1); else if(d < -30) goTo(cur_p - 1);
    clearTimeout(wt); wt = setTimeout(() => scrolling = false, 1000);
};
const desktopKeydownHandler = e => {
    if(e.key === 'ArrowRight' || e.key === 'ArrowDown') goTo(cur_p + 1);
    if(e.key === 'ArrowLeft' || e.key === 'ArrowUp') goTo(cur_p - 1);
};
const desktopDotHandler = e => goTo(+e.currentTarget.dataset.i);
let tx = 0;
const desktopTouchStart = e => { tx = e.touches[0].clientX; };
const desktopTouchEnd = e => {
    const dx = e.changedTouches[0].clientX - tx;
    if(dx < -50) goTo(cur_p + 1); if(dx > 50) goTo(cur_p - 1);
};
let mobileScrollObserver = null;
const mobileDotHandler = e => {
    const panelIndex = +e.currentTarget.dataset.i;
    if (panels[panelIndex]) panels[panelIndex].scrollIntoView({ behavior: 'smooth' });
};

function setupDesktopView() {
    if (mobileScrollObserver) { mobileScrollObserver.disconnect(); mobileScrollObserver = null; }
    dots.forEach(d => d.removeEventListener('click', mobileDotHandler));
    document.body.style.overflowY = 'hidden';
    document.documentElement.style.overflowY = 'hidden';
    window.addEventListener('wheel', desktopWheelHandler, { passive: false });
    window.addEventListener('keydown', desktopKeydownHandler);
    window.addEventListener('touchstart', desktopTouchStart, { passive: true });
    window.addEventListener('touchend', desktopTouchEnd, { passive: true });
    dots.forEach(d => d.addEventListener('click', desktopDotHandler));
    goTo(cur_p);
}

function setupMobileView() {
    window.removeEventListener('wheel', desktopWheelHandler);
    window.removeEventListener('keydown', desktopKeydownHandler);
    window.removeEventListener('touchstart', desktopTouchStart);
    window.removeEventListener('touchend', desktopTouchEnd);
    dots.forEach(d => d.removeEventListener('click', desktopDotHandler));
    track.style.transform = 'none';
    document.body.style.overflowY = 'auto';
    document.documentElement.style.overflowY = 'auto';
    dots.forEach(d => d.addEventListener('click', mobileDotHandler));
    if (!mobileScrollObserver) {
        mobileScrollObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const idx = Array.from(panels).indexOf(entry.target);
                    if (idx !== -1) {
                        cur_p = idx;
                        dots.forEach((d, j) => d.classList.toggle('active', j === idx));
                        panels.forEach((p, j) => p.classList.toggle('active', j === idx));
                        panels[idx].classList.add('revealed');
                        if(idx===0 && typeof window.initHeroNetworkAnimation === 'function') window.initHeroNetworkAnimation();
                        if(idx===1 && typeof window.initThreeJSAnimation === 'function') window.initThreeJSAnimation();
                        if(idx===2)triggerAbout();
                        if(idx===4)triggerDash();
                        if(idx===5)triggerSkills();
                        if(idx===4 && typeof window.initNetworkTopologyAnimation === 'function') window.initNetworkTopologyAnimation();
                        if(idx===8)triggerMathUniverse();
                        if(idx===7)triggerAch();
                        if(idx===1 && typeof prepareTargetGame === 'function') prepareTargetGame();
                    }
                }
            });
        }, { threshold: 0.15 });
        panels.forEach(p => mobileScrollObserver.observe(p));
    }
}

function handleViewChange() {
    const shouldBeDesktop = window.innerWidth > 768 && !window.matchMedia('(orientation:portrait)').matches;
    if (shouldBeDesktop === isDesktop) return;
    isDesktop = shouldBeDesktop;
    if (isDesktop) {
        setupDesktopView();
    } else {
        setupMobileView();
    }
}

// Initial Setup
if (panels.length > 0) { panels[0].classList.add('active'); panels[0].classList.add('revealed'); }
if (prog) prog.style.width = '0%';
handleViewChange();

// Kick off hero network animation as soon as the function is available.
(function startHeroNet(){
  if (typeof window.initHeroNetworkAnimation === 'function') window.initHeroNetworkAnimation();
  else setTimeout(startHeroNet, 60);
})();

// Listen for changes
window.addEventListener('resize', handleViewChange);
window.matchMedia('(orientation:portrait)').addEventListener('change', handleViewChange);

const themeModes = [
  { id: 'night',    label: 'Night', icon: 'i-moon' },
  { id: 'daylight', label: 'Day',   icon: 'i-sun'  },
  { id: 'solar',    label: 'Solar', icon: 'i-star' }
];
const themeToggleBtn = document.getElementById('theme-toggle');
let currentThemeIndex = 0;

function applyTheme(themeId) {
  const theme = themeModes.find(t => t.id === themeId) || themeModes[0];
  document.body.dataset.theme = theme.id;
  if (themeToggleBtn) {
    const next = themeModes[(themeModes.indexOf(theme) + 1) % themeModes.length];
    themeToggleBtn.innerHTML = `<span class="tt-ic" aria-hidden="true"><svg width="14" height="14"><use href="#${theme.icon}"/></svg></span><span>${theme.label}</span>`;
    themeToggleBtn.setAttribute('aria-label', `Theme: ${theme.label}. Click to switch to ${next.label}.`);
    themeToggleBtn.setAttribute('title', `Switch to ${next.label} theme`);
  }
  localStorage.setItem('yasiefTheme', theme.id);
}

function getStoredTheme() {
  const stored = localStorage.getItem('yasiefTheme');
  return themeModes.some(t => t.id === stored) ? stored : 'night';
}

function cycleTheme() {
  currentThemeIndex = (currentThemeIndex + 1) % themeModes.length;
  applyTheme(themeModes[currentThemeIndex].id);
}

function initThemeToggle() {
  if (!themeToggleBtn) return;
  const stored = getStoredTheme();
  currentThemeIndex = themeModes.findIndex(t => t.id === stored);
  if (currentThemeIndex < 0) currentThemeIndex = 0;
  applyTheme(themeModes[currentThemeIndex].id);
  themeToggleBtn.addEventListener('click', cycleTheme);
}

initThemeToggle();

/* TERMINAL */
const tLines=[
  {t:'cmd',txt:'whoami'},{t:'out',txt:'<span>Mohamed Yasief</span> — IT Administrator'},
  {t:'cmd',txt:'cat location.txt'},{t:'out',txt:'Dubai, United Arab Emirates 🇦🇪'},
  {t:'cmd',txt:'cat current_role.txt'},{t:'out',txt:'IT Administrator @ <span>LaundryBox Dubai</span>'},
  {t:'cmd',txt:'ls skills/'},{t:'out',txt:'ERP  Networks  Security  Cloud  DevOps  Marketing'},
  {t:'cmd',txt:'./status.sh'},{t:'out',txt:'✓ Available for new opportunities'},
];
let tIdx=0,chIdx=0,typing=false;
let termObserver = null; // For stabilizing the terminal animation

function typeNext(){
  if(tIdx>=tLines.length){
    if (termObserver) {
      termObserver.disconnect();
      termObserver = null;
      // Clean up the added style smoothly after animation.
      const aLeft = document.querySelector('#p1 .a-left');
      if (aLeft && aLeft.style.paddingTop) {
        aLeft.style.transition = 'padding-top 0.4s ease';
        aLeft.style.paddingTop = '';
        setTimeout(() => { if(aLeft) aLeft.style.transition = ''; }, 400);
      }
    }
    return;
  }
  const tb=document.getElementById('termBody');
  if(!tb)return;
  const line=tLines[tIdx];
  if(!typing){
    // Clear previous content if re-triggering
    if (tIdx === 0) tb.innerHTML = '';
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
let aboutDone=false,dashDone=false,skillsDone=false,achDone=false,mathUniverseDone=false;
function triggerAbout(){
  if(aboutDone)return;aboutDone=true;
  function cu(id,end,suf=''){
    let n=0;const el=document.getElementById(id);if(!el)return;
    const iv=setInterval(()=>{n=Math.min(n+end/40,end);el.innerHTML=Math.round(n)+(suf?`<span style="font-size:1.5rem">${suf}</span>`:'');if(n>=end)clearInterval(iv);},40);
  }
  cu('cnt1',4,'+');cu('cnt2',3,'');cu('cnt3',20,'%');cu('cnt4',35,'%');
  document.querySelectorAll('.sf').forEach(b=>{b.style.width=(b.dataset.w||50)+'%';});
  
  // Reset terminal animation state
  tIdx = 0; chIdx = 0; typing = false;
  
  const termBody = document.getElementById('termBody');
  const aLeft = document.querySelector('#p1 .a-left');

  if (termBody && aLeft) {
    // This logic prevents the content above the terminal from shifting up.
    // It works by adding top padding equal to the terminal's growth,
    // counteracting the shift caused by `justify-content: center`.
    let lastHeight = termBody.closest('.terminal').offsetHeight;
    termObserver = new MutationObserver(() => {
      const terminalEl = termBody.closest('.terminal');
      if (!terminalEl) return;
      const newHeight = terminalEl.offsetHeight;
      const deltaHeight = newHeight - lastHeight;
      if (deltaHeight > 0) {
        const currentPadding = parseFloat(aLeft.style.paddingTop) || 0;
        aLeft.style.paddingTop = `${currentPadding + deltaHeight}px`;
      }
      lastHeight = newHeight;
    });
    termObserver.observe(termBody, { childList: true, subtree: true });
  }
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
function triggerMathUniverse(){
  if(mathUniverseDone)return;
  if(typeof window.initMathUniverse==='function'){
    window.initMathUniverse();
    mathUniverseDone=true;
  }
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

/* ═══ TEXT SCRAMBLE ═══ */
(function(){
  const CHARS='!<>-_\\/[]{}=+*^?#@ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

  function scramble(el) {
    if(el.dataset.scrambled)return;
    el.dataset.scrambled='1';

    // Lock the element's height to prevent vertical layout shifts during animation.
    const originalHeight = el.offsetHeight;
    el.style.height = `${originalHeight}px`; // Lock height
    el.style.overflow = 'hidden';           // Prevent content overflow from affecting layout
    
    const originalHTML = el.innerHTML;

    // Create a temporary element to parse the original HTML and extract text nodes
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = originalHTML;

    const scrambleUnits = [];
    let textNodeIndex = 0;
    let delayOffset = 0; // Delay for staggering lines/text nodes

    // Function to recursively traverse and extract text nodes for scrambling
    function extractTextNodes(node) {
      if (node.nodeType === Node.TEXT_NODE && node.textContent.trim().length > 0) {
        const placeholder = `__SCRAMBLE_TEXT_NODE_${textNodeIndex}__`;
        scrambleUnits.push({
          placeholder: placeholder,
          originalText: node.textContent,
          currentScrambled: node.textContent, // Starts as original text
          frame: 0,
          total: 40, // Original speed
          delay: delayOffset,
          q: node.textContent.split('').map((to, i) => ({
            to, start: Math.floor(Math.random() * 40 * 0.3),
            end: Math.floor(40 * 0.5 + Math.random() * 40 * 0.3), char: ''
          }))
        });
        node.textContent = placeholder; // Replace text with placeholder in temp DOM
        textNodeIndex++;
        delayOffset += 100; // Stagger delay for next text node within the same line
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        // If it's a <br> tag, reset delayOffset for the next line
        if (node.tagName.toLowerCase() === 'br') {
          delayOffset = 0; // Reset delay for the start of a new line
        }
        for (let child of node.childNodes) {
          extractTextNodes(child);
        }
      }
    }

    extractTextNodes(tempDiv);

    // The HTML with placeholders
    let htmlWithPlaceholders = tempDiv.innerHTML;

    let animationFrameId;
    let allUnitsDone = false;

    function tick(currentTime) {
      let currentAllUnitsDone = true;
      let currentHTML = htmlWithPlaceholders;

      scrambleUnits.forEach(unit => {
        if (!unit._startTime) {
            unit._startTime = currentTime + unit.delay; // Set actual start time for this unit
        }

        if (currentTime < unit._startTime) {
            currentAllUnitsDone = false; // Not yet time to start this unit
            return;
        }

        let out = '', done = 0;
        unit.q.forEach(r => {
          if (unit.frame >= r.end) {
            out += r.to === ' ' ? ' ' : `<span class="sc-stable">${r.to}</span>`;
            done++;
          } else if (unit.frame >= r.start) {
            if (!r.char || Math.random() < 0.35) r.char = CHARS[Math.floor(Math.random() * CHARS.length)];
            out += `<span class="sc-char">${r.char}</span>`;
          } else {
            out += r.to === ' ' ? ' ' : `<span class="sc-stable">·</span>`;
          }
        });
        unit.currentScrambled = out;

        if (done < unit.q.length) {
          currentAllUnitsDone = false;
          unit.frame++;
        } else {
          unit.currentScrambled = unit.originalText; // Ensure final state is original text
        }
        currentHTML = currentHTML.replace(unit.placeholder, unit.currentScrambled);
      });

      el.innerHTML = currentHTML;

      if (currentAllUnitsDone) {
        allUnitsDone = true;
      }

      if (!allUnitsDone) {
        animationFrameId = requestAnimationFrame(tick);
      } else {
        el.innerHTML = originalHTML; // Ensure final state is exactly original HTML
        // Use a short timeout to reset styles, ensuring the final render is complete before constraints are removed.
        setTimeout(() => {
          el.style.height = '';
          el.style.overflow = '';
        }, 20);
        el.dataset.scrambled = ''; // Reset scrambled state
      }
    }

    // Start the animation loop
    animationFrameId = requestAnimationFrame(tick);
  }
  document.querySelectorAll('.panel').forEach(p=>{
    new MutationObserver(()=>{
      if(p.classList.contains('active'))
        setTimeout(()=>p.querySelectorAll('[data-scramble]').forEach(scramble),50); // Reduced initial delay
    }).observe(p,{attributes:true,attributeFilter:['class']});
  });
})();

/* ═══ MAGNETIC BUTTONS ═══ */
(function(){
  if(window.innerWidth<=768)return;
  document.querySelectorAll('.cta,.cpill,.ac-cta').forEach(el=>{
    el.addEventListener('mousemove',e=>{
      const r=el.getBoundingClientRect();
      const dx=((e.clientX-r.left)/r.width-.5)*2;
      const dy=((e.clientY-r.top)/r.height-.5)*2;
      el.style.transition='transform .1s ease';
      el.style.transform=`translate(${dx*9}px,${dy*6}px)`;
    });
    el.addEventListener('mouseleave',()=>{
      el.style.transition='transform .55s cubic-bezier(.25,.46,.45,.94)';
      el.style.transform='';
      setTimeout(()=>el.style.transition='',560);
    });
  });
})();

/* ═══ COMMAND PALETTE ═══ */
(function(){
  const ic = id => `<svg width="14" height="14"><use href="#${id}"/></svg>`;
  const CMDS=[
    {g:'Navigate',ic:ic('i-target'),label:'Hero',desc:'Introduction & overview',tag:'01',fn:()=>goTo(0)},
    {g:'Navigate',ic:ic('i-spark'), label:'Reflex Game',desc:'Interactive mini-game + 3D',tag:'02',fn:()=>goTo(1)},
    {g:'Navigate',ic:ic('i-users'), label:'About Me',desc:'Background & philosophy',tag:'03',fn:()=>goTo(2)},
    {g:'Navigate',ic:ic('i-list'),  label:'Experience',desc:'LaundryBox · Muffin House',tag:'04',fn:()=>goTo(3)},
    {g:'Navigate',ic:ic('i-server'),label:'IT Dashboard',desc:'Live metrics & system status',tag:'05',fn:()=>goTo(4)},
    {g:'Navigate',ic:ic('i-tool'),  label:'Technical Skills',desc:'Hex grid skill map',tag:'06',fn:()=>goTo(5)},
    {g:'Navigate',ic:ic('i-rocket'),label:'Key Projects',desc:'4 impact projects',tag:'07',fn:()=>goTo(6)},
    {g:'Navigate',ic:ic('i-chart'), label:'Achievements',desc:'Measurable outcomes',tag:'08',fn:()=>goTo(7)},
    {g:'Navigate',ic:ic('i-mail'),  label:'Contact',desc:'Get in touch',tag:'09',fn:()=>goTo(8)},
    {g:'Actions', ic:ic('i-mail'),  label:'Copy Email',desc:'mohamedyasief@gmail.com',tag:'',fn:()=>copy('mohamedyasief@gmail.com','Email copied!')},
    {g:'Actions', ic:ic('i-phone'), label:'Copy Phone',desc:'+971 50 359 3856',tag:'',fn:()=>copy('+971503593856','Phone copied!')},
    {g:'Actions', ic:ic('i-linkedin'),label:'LinkedIn',desc:'linkedin.com/in/yasief',tag:'',fn:()=>window.open('https://linkedin.com/in/yasief','_blank','noopener')},
    {g:'Actions', ic:ic('i-download'),label:'Download Resume',desc:'PDF · Mohamed Yasief',tag:'',fn:()=>{const a=document.createElement('a');a.href='Mohamed_Yasief_IT_Administrator_Resume.pdf';a.download='';a.click();}},
  ];
  const backdrop=document.getElementById('cmd-backdrop');
  const input=document.getElementById('cmd-input');
  const list=document.getElementById('cmd-list');
  if(!backdrop||!input||!list)return;
  let sel=0,filtered=[...CMDS];

  function copy(txt,msg){
    navigator.clipboard.writeText(txt).catch(()=>{});
    toast(msg);close();
  }
  function toast(msg){
    const t=document.createElement('div');
    t.className='cmd-toast';t.textContent=msg;
    document.body.appendChild(t);
    setTimeout(()=>{t.style.opacity='0';setTimeout(()=>t.remove(),450);},1400);
  }
  function render(){
    list.innerHTML='';
    const groups=[...new Set(filtered.map(c=>c.g))];
    groups.forEach(g=>{
      const gl=document.createElement('div');gl.className='cmd-group';gl.textContent=g;list.appendChild(gl);
      filtered.forEach((c,idx)=>{
        if(c.g!==g)return;
        const row=document.createElement('div');
        row.className='cmd-row'+(idx===sel?' sel':'');
        row.innerHTML=`<div class="cmd-ic">${c.ic}</div><div class="cmd-info"><div class="cmd-label">${c.label}</div><div class="cmd-desc">${c.desc}</div></div>${c.tag?`<span class="cmd-tag">${c.tag}</span>`:''}`;
        row.addEventListener('click',()=>{c.fn();if(!c.label.includes('Copy'))close();});
        list.appendChild(row);
      });
    });
  }
  function open(){
    filtered=[...CMDS];sel=0;input.value='';render();
    backdrop.classList.add('open');
    document.body.classList.add('cmd-open');
    setTimeout(()=>input.focus(),30);
  }
  function close(){
    backdrop.classList.remove('open');
    document.body.classList.remove('cmd-open');
    input.value='';
  }
  function move(d){
    sel=Math.max(0,Math.min(filtered.length-1,sel+d));render();
    const s=list.querySelector('.sel');if(s)s.scrollIntoView({block:'nearest'});
  }
  input.addEventListener('input',()=>{
    const q=input.value.toLowerCase();
    filtered=q?CMDS.filter(c=>c.label.toLowerCase().includes(q)||c.desc.toLowerCase().includes(q)):[...CMDS];
    sel=0;render();
  });
  document.addEventListener('keydown',e=>{
    if((e.ctrlKey||e.metaKey)&&e.key==='k'){e.preventDefault();backdrop.classList.contains('open')?close():open();return;}
    if(!backdrop.classList.contains('open'))return;
    if(e.key==='Escape')close();
    if(e.key==='ArrowDown'){e.preventDefault();move(1);}
    if(e.key==='ArrowUp'){e.preventDefault();move(-1);}
    if(e.key==='Enter'){e.preventDefault();if(filtered[sel]){filtered[sel].fn();if(!filtered[sel].label.includes('Copy'))close();}}
  });
  backdrop.addEventListener('click',e=>{if(e.target===backdrop)close();});
  window.openCmdPalette=open;
})();

/* ═══ MICRO-INTERACTIONS ═══
   Radial glow tracking on cards (CSS reads --mx/--my). */
(function(){
  if(window.matchMedia('(hover:none)').matches) return;
  const targets=document.querySelectorAll('.stat-box,.dt,.ac-item,.resp-item,.pj-c,.cb,.badge');
  targets.forEach(el=>{
    el.addEventListener('mousemove',e=>{
      const r=el.getBoundingClientRect();
      el.style.setProperty('--mx',((e.clientX-r.left)/r.width*100)+'%');
      el.style.setProperty('--my',((e.clientY-r.top)/r.height*100)+'%');
    },{passive:true});
  });
})();

/* ═══ KEYBOARD SHORTCUTS ═══
   '/' focuses command palette search. '?' shows it as well. */
(function(){
  document.addEventListener('keydown',e=>{
    if(e.target.matches('input,textarea'))return;
    if(e.key==='/'||e.key==='?'){
      const cmd=document.getElementById('cmd-backdrop');
      if(cmd && !cmd.classList.contains('open') && typeof window.openCmdPalette==='function'){
        e.preventDefault();
        window.openCmdPalette();
      }
    }
  });
})();
