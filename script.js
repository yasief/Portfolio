/* ── FIREBASE ── */
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, addDoc, collection } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const _fbApp = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const _db = getFirestore(_fbApp);
const _CHAMP_DOC = doc(_db, 'game', 'champion');

/* Escape untrusted strings before they touch innerHTML (e.g. the cloud champion name). */
function escHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

/* CURSOR */
const cur=document.getElementById('cur'),cur2=document.getElementById('cur2'),cur3=document.getElementById('cur3');
let mx=0,my=0,rx=0,ry=0,r3x=0,r3y=0;
let cursorAnimationId = null; // To store the requestAnimationFrame ID

function startCursorAnimation() {
  // Only start if elements exist and animation is not already running
  if (!cur || !cur2 || !cur3 || cursorAnimationId !== null) return;
  // Don't hide/replace the native pointer on touch or no-hover devices (incl. large
  // hybrid tablets), or for visitors who asked to reduce motion — CSS restores the
  // real cursor in those cases, so running this loop would leave them with no pointer.
  if (window.matchMedia('(hover: none), (pointer: coarse), (prefers-reduced-motion: reduce)').matches) return;

    document.addEventListener('mousemove',e=>{mx=e.clientX;my=e.clientY;});
    (function loop(){
      cur.style.transform=`translate(${mx-3}px,${my-3}px)`;
      rx+=(mx-rx)*.12;ry+=(my-ry)*.12;
      cur2.style.transform=`translate(${rx-16}px,${ry-16}px)`;
      r3x+=(mx-r3x)*.06;r3y+=(my-r3y)*.06;
      cur3.style.transform=`translate(${r3x-30}px,${r3y-30}px)`;
      cursorAnimationId = requestAnimationFrame(loop);
    })();
}

function stopCursorAnimation() {
  if (cursorAnimationId !== null) {
    cancelAnimationFrame(cursorAnimationId);
    cursorAnimationId = null;
    // Optionally reset cursor positions or hide them if needed
  }
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

    /* ── Sound engine (Web Audio API — no asset files) ──
       Soothing palette: pure sine waves in C-major pentatonic, soft attack/release
       envelopes prevent clicks. Notes feel like a soft music-box / wind-chime. */
    let audioCtx = null;
    let soundEnabled = localStorage.getItem('yasiefSound') !== 'off';
    let masterGain = null;
    function getCtx() {
        if (!audioCtx) {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            if (Ctx) {
                audioCtx = new Ctx();
                masterGain = audioCtx.createGain();
                masterGain.gain.value = 0.6; // global volume cap — gentle
                masterGain.connect(audioCtx.destination);
            }
        }
        if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
        return audioCtx;
    }

    // C-major pentatonic notes — never clash, always pleasant in any combination
    const NOTES = { C5:523.25, D5:587.33, E5:659.25, G5:783.99, A5:880.00, C6:1046.50, E6:1318.51, G6:1567.98 };

    // Single soft note with attack/release envelope to eliminate click artifacts
    function playNote({ freq, dur = 0.45, vol = 0.18, delay = 0, detune = 0 }) {
        if (!soundEnabled) return;
        const ctx = getCtx();
        if (!ctx) return;
        const t0 = ctx.currentTime + delay;
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t0);
        if (detune) osc.detune.setValueAtTime(detune, t0);
        // Soft envelope: 25ms attack, exponential release — bell-like
        gain.gain.setValueAtTime(0, t0);
        gain.gain.linearRampToValueAtTime(vol, t0 + 0.025);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        osc.connect(gain).connect(masterGain);
        osc.start(t0);
        osc.stop(t0 + dur + 0.05);
    }

    // Layered note: fundamental + soft octave above for warmth (like a music box)
    function playChime(freq, dur = 0.5, vol = 0.18, delay = 0) {
        playNote({ freq,         dur,        vol,        delay });
        playNote({ freq: freq*2, dur: dur*0.7, vol: vol*0.35, delay });
    }

    function sndHit()    { playChime(NOTES.E5, 0.35, 0.16); }
    function sndCombo()  {
        // Soft two-note interval — uplifting
        playChime(NOTES.G5, 0.45, 0.16);
        playChime(NOTES.C6, 0.50, 0.13, 0.06);
    }
    function sndMiss()   { playNote({ freq: NOTES.C5 * 0.5, dur: 0.40, vol: 0.10 }); } // low C — gentle, not harsh
    function sndBonus()  {
        // Pentatonic arpeggio — wind-chime sparkle
        playChime(NOTES.C5, 0.40, 0.14, 0.00);
        playChime(NOTES.E5, 0.40, 0.14, 0.07);
        playChime(NOTES.G5, 0.40, 0.14, 0.14);
        playChime(NOTES.C6, 0.45, 0.13, 0.21);
    }
    function sndStart()  {
        // Welcoming three-note opening
        playChime(NOTES.C5, 0.45, 0.14, 0.00);
        playChime(NOTES.E5, 0.45, 0.14, 0.10);
        playChime(NOTES.G5, 0.55, 0.14, 0.20);
    }
    function sndEnd()    {
        // Gentle resolving descending phrase
        playChime(NOTES.G5, 0.50, 0.14, 0.00);
        playChime(NOTES.E5, 0.55, 0.13, 0.18);
        playChime(NOTES.C5, 0.80, 0.13, 0.36);
    }
    function sndBigMiss() {
        // Bonus target slipped away — a longer, sadder descending pair (the "aww" tone)
        playChime(NOTES.E5, 0.55, 0.16, 0.00);
        playChime(NOTES.C5, 0.65, 0.15, 0.18);
        // soft low underlay for weight
        playNote({ freq: NOTES.C5 * 0.5, dur: 0.55, vol: 0.10, delay: 0.05 });
    }
    function sndHighScore() {
        // Triumphant ascending pentatonic fanfare with octave doubling
        playChime(NOTES.C5, 0.40, 0.18, 0.00);
        playChime(NOTES.E5, 0.40, 0.18, 0.10);
        playChime(NOTES.G5, 0.40, 0.18, 0.20);
        playChime(NOTES.C6, 0.55, 0.20, 0.32);
        // Final triad held longer for celebration
        playNote({ freq: NOTES.C6, dur: 1.0, vol: 0.14, delay: 0.55 });
        playNote({ freq: NOTES.E6, dur: 1.0, vol: 0.13, delay: 0.55 });
        playNote({ freq: NOTES.G6, dur: 1.0, vol: 0.11, delay: 0.55 });
    }

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
        // Skeleton shimmer while the Firestore champion doc resolves (idea 63)
        banner.innerHTML = '<span class="champ-skel champ-skel-crown"></span><span class="champ-skel champ-skel-name"></span><span class="champ-skel champ-skel-score"></span>';
        banner.classList.add('champ-loading');
        banner.classList.remove('hidden');
        const champ = await getChampion();
        banner.classList.remove('champ-loading');
        if (champ) {
            banner.innerHTML = `<span class="champ-crown">👑</span><span class="champ-name">${escHtml(champ.name)}</span><span class="champ-score">${Number(champ.score)||0} pts</span><span class="champ-exp">resets in 24h</span>`;
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
        getCtx(); // unlock AudioContext on user gesture (Start button click)
        sndStart();
        if(startScreen) startScreen.classList.add('hidden');
        const exitBtn = document.getElementById('gameExitBtn');
        if (exitBtn) exitBtn.style.setProperty('display', 'inline-block', 'important');
        updateUI();

        // Harder spawn cadence — starts faster, ramps up sooner
        spawnInterval = setInterval(spawnTarget, 600);
        scheduleNextBonus();

        timerInterval = setInterval(() => {
            timeLeft--;
            updateUI();
            if (timeLeft <= 0) endGame();

            if (timeLeft === 50) {
                clearInterval(spawnInterval);
                spawnInterval = setInterval(spawnTarget, 480);
            } else if (timeLeft === 35) {
                clearInterval(spawnInterval);
                spawnInterval = setInterval(spawnTarget, 380);
            } else if (timeLeft === 20) {
                clearInterval(spawnInterval);
                spawnInterval = setInterval(spawnTarget, 300);
            } else if (timeLeft === 10) {
                clearInterval(spawnInterval);
                spawnInterval = setInterval(spawnTarget, 240);
            }
        }, 1000);
    }

    function exitGame() {
        gameActive = false;
        clearInterval(spawnInterval);
        clearInterval(timerInterval);
        clearBonusChar();
        if (gameArea) targets.forEach(t => t.remove());
        targets = [];
        score = 0; combo = 0; timeLeft = 60;
        updateUI();
        if (gameOverScreen) gameOverScreen.classList.add('hidden');
        if (nameInputWrap) nameInputWrap.classList.add('hidden');
        if (startScreen) startScreen.classList.remove('hidden');
        const exitBtn = document.getElementById('gameExitBtn');
        if (exitBtn) exitBtn.style.display = 'none';
        renderChampionBanner();
        // also exit fullscreen if active
        if (typeof exitFullscreen === 'function') exitFullscreen();
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

        target.addEventListener('pointerdown', (e) => { e.preventDefault(); hitTarget(target); });

        // Tighter window — target lifetime shrinks as time pressure rises
        const lifetime = timeLeft > 40 ? 2200 : timeLeft > 20 ? 1800 : 1400;
        setTimeout(() => {
            if (target.parentNode && gameActive) missTarget(target);
        }, lifetime);
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
        // Combo milestones get a richer sound; normal hits a quick pop
        if (combo >= 5 && combo % 5 === 0) sndCombo(); else sndHit();
        showComboPopup(target);
        target.style.animation = 'targetHit 0.3s ease-out forwards';
        setTimeout(() => target.remove(), 300);
        targets = targets.filter(t => t !== target);
        updateUI();
    }

    function missTarget(target) {
        if (!gameActive) return;
        combo = 0;
        sndMiss();
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
        // play end-tone immediately; if a high-score is detected later, the
        // celebration sound layers gracefully on top.
        sndEnd();
        clearInterval(spawnInterval);
        clearInterval(timerInterval);
        clearBonusChar();
        targets.forEach(t => t.remove());
        targets = [];
        const exitBtn = document.getElementById('gameExitBtn');
        if (exitBtn) exitBtn.style.display = 'none';

        // log every game to Firestore scores collection
        try {
            await addDoc(collection(_db, 'scores'), {
                score,
                playedAt: new Date().toISOString(),
                device: /Mobi|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop',
                screenWidth: screen.width,
                screenHeight: screen.height,
                viewportWidth: window.innerWidth,
                viewportHeight: window.innerHeight,
                userAgent: navigator.userAgent,
                pageUrl: window.location.href,
                referrer: document.referrer || 'N/A'
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
            sndHighScore();
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

        bonusEl.addEventListener('pointerdown', (e) => { e.preventDefault();
            if (!gameActive || !bonusEl) return;
            sndBonus();
            const snapX = x, snapY = y;
            clearBonusChar();
            scheduleNextBonus();
            const pop = document.createElement('div');
            pop.className = 'combo-pop bonus-pop';
            pop.innerHTML = `<span class="combo-pop-pts" style="color:var(--c4);font-size:1.4rem">+30</span><span class="combo-pop-label" style="color:var(--c3)">BONUS!</span>`;
            pop.style.left = (snapX + size / 2) + 'px';
            pop.style.top  = snapY + 'px';
            gameArea.appendChild(pop);
            setTimeout(() => pop.remove(), 700);
            score += 30;
            updateUI();
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

        // disappears after 2.5s if not caught — play "big miss" sound only
        // if game is still active (avoid sound after game over)
        bonusTimeout = setTimeout(() => {
            if (gameActive && bonusEl) sndBigMiss();
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

    prepareTargetGame = async function() {
        if (gameActive) await endGame();
        resetGame();
    }

    async function doSaveName() {
        const input = document.getElementById('championNameInput');
        const name = (input ? input.value.trim() : '') || 'Anonymous';
        const hs = document.getElementById('highScore');
        if (hs) hs.textContent = 'Saving…';
        hideNameInput();
        try {
            await saveChampion(name, highScore);
            if (hs) hs.textContent = `👑 ${name} — ${highScore} pts`;
            renderChampionBanner();
        } catch (e) {
            // Never leave the UI stuck on "Saving…" — surface the failure and let them retry.
            if (hs) hs.textContent = '⚠️ Couldn’t save — check your connection and try again.';
            if (nameInputWrap) nameInputWrap.classList.remove('hidden');
        }
    }

    const _saveBtn = document.getElementById('saveNameBtn');
    const _nameInput = document.getElementById('championNameInput');
    if (_saveBtn) _saveBtn.addEventListener('click', doSaveName);
    if (_nameInput) _nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') doSaveName(); });

    // load champion from Firestore immediately on page load
    renderChampionBanner();

    const gameContainer = document.getElementById('gameContainer');
    const gameExitBtn   = document.getElementById('gameExitBtn');

    const cursorEls = ['cur','cur2','cur3'].map(id => document.getElementById(id)).filter(Boolean);
    let cursorOrigParent = cursorEls.length ? cursorEls[0].parentNode : null;

    const themeBtnEl = document.getElementById('theme-toggle');
    const themeBtnOrigParent = themeBtnEl ? themeBtnEl.parentNode : null;

    function moveCursorsInto(container) {
        cursorEls.forEach(el => container.appendChild(el));
        // also move the theme button into the game container so it renders above
        // the high-z-index pseudo-fs overlay (and inside the real fullscreen element)
        if (themeBtnEl) container.appendChild(themeBtnEl);
    }
    function moveCursorsOut() {
        if (cursorOrigParent) cursorEls.forEach(el => cursorOrigParent.appendChild(el));
        if (themeBtnEl && themeBtnOrigParent) themeBtnOrigParent.appendChild(themeBtnEl);
    }

    function enterFullscreen() {
        if (!gameContainer) return;
        const el = gameContainer;
        const req = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen;
        if (req) {
            req.call(el).then(() => {
                moveCursorsInto(gameContainer);
                document.body.classList.add('game-fs');
            }).catch(() => applyPseudoFs());
        } else {
            applyPseudoFs();
        }
    }

    function applyPseudoFs() {
        if (!gameContainer) return;
        gameContainer.classList.add('pseudo-fs');
        document.body.classList.add('game-pseudo-fs');
        document.documentElement.classList.add('game-pseudo-fs');
        moveCursorsInto(gameContainer);
    }

    function removePseudoFs() {
        if (!gameContainer) return;
        gameContainer.classList.remove('pseudo-fs');
        document.body.classList.remove('game-pseudo-fs');
        document.documentElement.classList.remove('game-pseudo-fs');
        moveCursorsOut();
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

    // show/hide exit button and overlay elements based on fullscreen state
    document.addEventListener('fullscreenchange',       onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
    document.addEventListener('mozfullscreenchange',    onFsChange);

    function onFsChange() {
        const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement);
        if (gameContainer && gameContainer.classList.contains('pseudo-fs')) return;
        if (!isFs) {
            moveCursorsOut();
            document.body.classList.remove('game-fs');
        }
    }

    if (startBtn)    startBtn.addEventListener('click',   () => { startGame(); enterFullscreen(); });
    if (restartBtn)  restartBtn.addEventListener('click', () => { startGame(); enterFullscreen(); });
    if (gameExitBtn) {
        gameExitBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); exitGame(); });
        gameExitBtn.addEventListener('click', exitGame);
    }

    /* Sound toggle button */
    const soundBtn = document.getElementById('gameSoundBtn');
    function refreshSoundBtn() {
        if (!soundBtn) return;
        soundBtn.textContent = soundEnabled ? '🔊 SOUND' : '🔇 MUTED';
        soundBtn.style.opacity = soundEnabled ? '1' : '.65';
    }
    refreshSoundBtn();
    if (soundBtn) {
        soundBtn.addEventListener('click', () => {
            soundEnabled = !soundEnabled;
            localStorage.setItem('yasiefSound', soundEnabled ? 'on' : 'off');
            refreshSoundBtn();
            if (soundEnabled) sndHit(); // tiny preview when re-enabling
        });
    }
})();

/* NAV */
const track=document.getElementById('track');
const dots=document.querySelectorAll('.dot');
const prog=document.getElementById('prog');
const panels=document.querySelectorAll('.panel');
let cur_p=0,scrolling=false,wt=null;
const N = panels.length;

// Deep-linking: each panel index maps to a URL hash so sections are shareable and
// a refresh (or a returning visitor) lands where they left off.
const SECTION_HASH=['home','game','about','experience','dashboard','skills','projects','achievements','contact'];
function updateHash(i){
  if(SECTION_HASH[i]){ try{ history.replaceState(null,'','#'+SECTION_HASH[i]); }catch(e){} }
  try{ localStorage.setItem('yasiefLastSection',String(i)); }catch(e){}
}
function initialIndex(){
  const h=(location.hash||'').replace('#','');
  let idx=SECTION_HASH.indexOf(h);
  if(idx<0){ const saved=parseInt(localStorage.getItem('yasiefLastSection'),10); if(!isNaN(saved)&&saved>0&&saved<N) idx=saved; }
  return idx>0?idx:0;
}

function goTo(i, focusPanel){
  if(i<0||i>=N)return;
  const prev=cur_p;
  cur_p=i;
  track.style.transform=`translateX(-${i*100}vw)`;
  dots.forEach((d,j)=>{d.classList.toggle('active',j===i);d.setAttribute('aria-selected',j===i);d.tabIndex=(j===i)?0:-1;});
  prog.style.width=((i/(N-1))*100)+'%';
  updateHash(i);
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
  // Keyboard-driven nav: hand focus to the entering panel + flash the HUD (idea 62)
  if(focusPanel){
    if(panels[i] && typeof panels[i].focus === 'function') panels[i].focus({preventScroll:true});
    if(typeof window.showNavHud === 'function') window.showNavHud(i);
  }
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
    // Don't hijack arrow keys while the visitor is typing in a field or a modal is open —
    // otherwise the caret moves AND the page jumps to another panel.
    if(document.body.classList.contains('cmd-open')) return;
    const t = e.target;
    if(t && t.matches && (t.matches('input, textarea, [contenteditable]') || t.isContentEditable)) return;
    if(e.key === 'ArrowRight' || e.key === 'ArrowDown') goTo(cur_p + 1, true);
    if(e.key === 'ArrowLeft' || e.key === 'ArrowUp') goTo(cur_p - 1, true);
};
const desktopDotHandler = e => goTo(+e.currentTarget.dataset.i, true);
let tx = 0;
const desktopTouchStart = e => { tx = e.touches[0].clientX; };
const desktopTouchEnd = e => {
    if(document.body.classList.contains('game-pseudo-fs')) return;
    if(document.fullscreenElement) return;
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
    startCursorAnimation();
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
                        updateHash(idx);
                        dots.forEach((d, j) => {d.classList.toggle('active', j === idx);d.setAttribute('aria-selected', j === idx);});
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
    stopCursorAnimation();
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

// Initial Setup — honour a deep-link hash / last-visited section.
cur_p = initialIndex();
if (panels.length > 0) { panels[cur_p].classList.add('active'); panels[cur_p].classList.add('revealed'); }
if (prog) prog.style.width = ((cur_p/(N-1))*100) + '%';
handleViewChange();
// Desktop is positioned by goTo() inside setupDesktopView; on mobile, scroll to the target panel.
if (!isDesktop && cur_p > 0 && panels[cur_p]) { setTimeout(() => panels[cur_p].scrollIntoView({ behavior: 'auto' }), 60); }

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
    initTermRepl();
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

/* ═══ TERMINAL REPL (ideas 35, 43) ═══
   After the boot animation the About terminal becomes a live shell. On desktop
   its height is locked so REPL output scrolls internally instead of growing the
   fixed-height panel; on mobile the panel flows, so no cap is needed. */
let termCapped=false;
const TERM_HIST=[]; let histPtr=0;
function termPrint(txt,kind){
  const tb=document.getElementById('termBody'); if(!tb) return;
  const div=document.createElement('div'); div.className='tl';
  if(kind==='cmd') div.innerHTML='<span class="tp">yasief@dubai:~$</span><span class="tc"> '+txt+'</span>';
  else div.innerHTML='<span class="to">'+txt+'</span>';
  const inp=tb.querySelector('.tl-input');
  if(inp) tb.insertBefore(div,inp); else tb.appendChild(div);
  tb.scrollTop=tb.scrollHeight;
}
function runHireSequence(){
  try{ localStorage.setItem('yasiefHireFound','1'); }catch(e){}
  const steps=['$ ./hire_mohamed.sh','&#9656; verifying credentials … ok','&#9656; checking availability … OPEN','&#9656; matching role … strong fit','✓ decision: HIRE — let’s talk 👇'];
  let i=0;
  (function step(){ if(i>=steps.length){ termPrint('<a href="mailto:mohamedyasief@gmail.com">mohamedyasief@gmail.com</a> &middot; <a href="https://wa.me/971503593856" target="_blank" rel="noopener">WhatsApp</a>','out'); return; } termPrint(steps[i++],'out'); setTimeout(step,420); })();
  return null;
}
const TERM_CMDS={
  help:()=>'commands: <span>help whoami skills experience projects resume contact theme clear hire</span>',
  whoami:()=>'Mohamed Yasief — IT Administrator &middot; ERP Specialist &middot; Dubai',
  skills:()=>'ERP &middot; Networks &middot; Security &middot; Cloud/DevOps &middot; Python &middot; Digital Marketing',
  experience:()=>'LaundryBox Dubai (2025–now) &middot; Muffin House / MFoods, India (2021–2025)',
  projects:()=>{ setTimeout(()=>goTo(6,true),350); return 'opening Key Projects…'; },
  resume:()=>{ const a=document.createElement('a');a.href='Mohamed_Yasief_IT_Administrator_Resume.pdf';a.download='';a.click(); return 'downloading resume.pdf…'; },
  contact:()=>'mohamedyasief@gmail.com &middot; wa.me/971503593856 &middot; linkedin.com/in/yasief',
  theme:()=>{ const t=document.getElementById('theme-toggle'); if(t)t.click(); return 'theme switched'; },
  clear:()=>{ const tb=document.getElementById('termBody'); const inp=tb.querySelector('.tl-input'); tb.innerHTML=''; if(inp)tb.appendChild(inp); return null; },
  hire:runHireSequence,
};
function runTermCmd(raw){
  const cmd=(raw||'').trim(); if(!cmd) return;
  TERM_HIST.push(cmd); histPtr=TERM_HIST.length;
  termPrint(cmd.replace(/</g,'&lt;'),'cmd');
  const key=cmd.toLowerCase().replace(/^sudo\s+/,'');
  const fn=TERM_CMDS[key];
  if(fn){ const out=fn(); if(out!=null) termPrint(out,'out'); }
  else termPrint('command not found: '+cmd.replace(/</g,'&lt;')+' — type <span>help</span>','out');
}
function initTermRepl(){
  const tb=document.getElementById('termBody'); if(!tb || tb.querySelector('.tl-input')) return;
  const line=document.createElement('div'); line.className='tl tl-input';
  line.innerHTML='<span class="tp">yasief@dubai:~$</span><input class="term-in" type="text" aria-label="Terminal command" autocomplete="off" spellcheck="false" enterkeyhint="go">';
  tb.appendChild(line);
  termPrint('type <span>help</span> to explore, or <span>hire</span> 😉','out');
  if(!termCapped && isDesktop){ termCapped=true; tb.style.height=tb.scrollHeight+'px'; tb.style.overflowY='auto'; }
  const input=line.querySelector('.term-in');
  input.addEventListener('keydown',e=>{
    if(e.key==='Enter'){ e.preventDefault(); const v=input.value; input.value=''; runTermCmd(v); }
    else if(e.key==='ArrowUp'){ e.preventDefault(); if(histPtr>0){ histPtr--; input.value=TERM_HIST[histPtr]||''; } }
    else if(e.key==='ArrowDown'){ e.preventDefault(); if(histPtr<TERM_HIST.length-1){ histPtr++; input.value=TERM_HIST[histPtr]||''; } else { histPtr=TERM_HIST.length; input.value=''; } }
  });
  tb.addEventListener('click',e=>{ if(!e.target.closest('a')) input.focus(); });
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
  cu('cnt1',5,'+');cu('cnt2',3,'');cu('cnt3',20,'%');cu('cnt4',35,'%');
  document.querySelectorAll('.sf').forEach(b=>{b.style.width=(b.dataset.w||50)+'%';});
  
  // Reset terminal animation state
  tIdx = 0; chIdx = 0; typing = false;
  
  const termBody = document.getElementById('termBody');
  const aLeft = document.querySelector('#p1 .a-left');

  // On mobile, the terminal has a fixed min-height in CSS so no compensation is needed.
  // On desktop, .a-left is justify-content: center, so the terminal growing pushes content
  // upward visually — counteract that by adding matching top padding as the terminal grows.
  const isMobileLayout = window.innerWidth <= 768 || window.matchMedia('(orientation:portrait)').matches;
  if (termBody && aLeft && !isMobileLayout) {
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
  const activate=()=>{
    document.querySelectorAll('.ex-tab').forEach(t=>{t.classList.remove('active');t.setAttribute('aria-selected','false');});
    tab.classList.add('active');
    tab.setAttribute('aria-selected','true');
    const pane=tab.dataset.pane;
    document.querySelectorAll('.ex-pane').forEach(p=>p.classList.remove('show'));
    const t=document.getElementById('pane-'+pane);if(t)t.classList.add('show');
  };
  tab.addEventListener('click',activate);
  // Keyboard support: these are focusable (role="button", tabindex=0) so Enter/Space must work.
  tab.addEventListener('keydown',e=>{
    if(e.key==='Enter'||e.key===' '){e.preventDefault();activate();}
  });
});

/* ═══ TEXT SCRAMBLE ═══ */
(function(){
  const CHARS='!<>-_\\/[]{}=+*^?#@ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

  function scramble(el) {
    if(el.dataset.scrambled)return;
    el.dataset.scrambled='1';
    // Respect reduced-motion: the final text is already in the DOM, so just leave it.
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

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
        }, 20); // Small delay to ensure final render is complete
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

/* ═══ SHARED UI HELPERS ═══
   toast() is hoisted to module scope so panels, the command palette, and
   later features share ONE implementation (it used to be private to the
   palette IIFE). copyText() adds a clipboard + haptic + toast affordance. */
function toast(msg){
  const t=document.createElement('div');
  t.className='cmd-toast';t.textContent=msg;
  document.body.appendChild(t);
  setTimeout(()=>{t.style.opacity='0';setTimeout(()=>t.remove(),450);},1400);
}
function haptic(ms){ try{ if(navigator.vibrate) navigator.vibrate(ms||15); }catch(e){} }
async function copyText(txt,msg){
  try{ await navigator.clipboard.writeText(txt); }
  catch(e){ try{ const ta=document.createElement('textarea');ta.value=txt;ta.style.position='fixed';ta.style.top='-999px';document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove(); }catch(_){} }
  haptic(15); if(msg) toast(msg);
}
window.toast=toast;

/* ═══ CLICK-TO-COPY AFFORDANCES ═══
   Any element with [data-copy] copies its value with a toast + haptic,
   while its inner mailto:/tel: link stays the primary tap target. */
(function(){
  document.addEventListener('click',e=>{
    const btn=e.target.closest('[data-copy]');
    if(!btn)return;
    e.preventDefault();
    copyText(btn.getAttribute('data-copy'),btn.getAttribute('data-copy-msg')||'Copied');
  });
})();

/* ═══ REUSABLE MODALS (ideas 12,14,15,19,21) ═══
   Any [data-modal="id"] opens #id; ESC / backdrop / ✕ close it. Fixed overlay,
   so it never affects the 100vh panel layout. */
(function(){
  let lastFocus=null;
  function openModal(id){
    const m=(typeof id==='string')?document.getElementById(id):id; if(!m) return;
    lastFocus=document.activeElement;
    m.hidden=false;
    requestAnimationFrame(()=>m.classList.add('open'));
    document.body.classList.add('modal-open');
    const c=m.querySelector('.modal-close'); if(c) c.focus();
  }
  function closeModal(m){
    if(typeof m==='string') m=document.getElementById(m);
    if(!m) return;
    m.classList.remove('open');
    document.body.classList.remove('modal-open');
    setTimeout(()=>{ m.hidden=true; },250);
    if(lastFocus&&lastFocus.focus){ try{lastFocus.focus();}catch(e){} }
  }
  window.openModal=openModal; window.closeModal=closeModal;
  document.addEventListener('click',e=>{
    const trig=e.target.closest('[data-modal]');
    if(trig){ e.preventDefault(); openModal(trig.getAttribute('data-modal')); return; }
    if(e.target.closest('.modal-close')){ const b=e.target.closest('.modal-backdrop'); if(b) closeModal(b); return; }
    if(e.target.classList && e.target.classList.contains('modal-backdrop')) closeModal(e.target);
  });
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'){ const o=document.querySelector('.modal-backdrop.open'); if(o) closeModal(o); }
    else if(e.key==='Enter'||e.key===' '){ const t=e.target; if(t&&t.matches&&t.matches('[data-modal]')){ e.preventDefault(); openModal(t.getAttribute('data-modal')); } }
  });
})();

/* ═══ RELIABILITY / COST-OF-DOWNTIME CALCULATOR (ideas 40, 41) ═══ */
(function(){
  const modal=document.getElementById('calc-modal');
  if(!modal) return;
  function fmtDur(sec){
    if(sec<90) return sec.toFixed(sec<10?1:0)+' sec';
    const min=sec/60; if(min<90) return min.toFixed(min<10?1:0)+' min';
    const hr=min/60; if(hr<48) return hr.toFixed(hr<10?1:0)+' hrs';
    return (hr/24).toFixed(1)+' days';
  }
  let curSla=99.7;
  function renderSla(){
    const frac=(100-curSla)/100;
    modal.querySelector('#sla-day').textContent=fmtDur(86400*frac);
    modal.querySelector('#sla-month').textContent=fmtDur(2592000*frac);
    modal.querySelector('#sla-year').textContent=fmtDur(31536000*frac);
    modal.querySelector('#sla-note').textContent='At '+curSla+'% you can be down up to '+fmtDur(31536000*frac)+' a year. I sustain 99.7% across ERP, IoT and networks.';
  }
  const presets=modal.querySelector('#sla-presets');
  presets.addEventListener('click',e=>{const b=e.target.closest('button[data-sla]');if(!b)return;curSla=parseFloat(b.dataset.sla);[...presets.children].forEach(x=>x.classList.toggle('on',x===b));renderSla();});
  let cur='AED';
  const rev=modal.querySelector('#cd-rev'), up=modal.querySelector('#cd-up');
  const fmtMoney=v=>cur+' '+Math.round(v).toLocaleString('en-US');
  function renderCost(){
    const annual=Math.max(0,parseFloat(rev.value)||0)*12;
    let u=parseFloat(up.value); if(isNaN(u))u=99; u=Math.min(100,Math.max(0,u));
    const lost=annual*((100-u)/100);
    const saved=Math.max(0,lost-annual*0.003);
    modal.querySelector('#cd-lost').textContent=fmtMoney(lost);
    modal.querySelector('#cd-saved').textContent=u<99.7?fmtMoney(saved):'Already ≥ 99.7%';
  }
  modal.querySelector('#cur-tog').addEventListener('click',e=>{const b=e.target.closest('button[data-cur]');if(!b)return;cur=b.dataset.cur;[...e.currentTarget.children].forEach(x=>x.classList.toggle('on',x===b));renderCost();});
  rev.addEventListener('input',renderCost); up.addEventListener('input',renderCost);
  renderSla(); renderCost();
})();

/* ═══ PROJECT CASE STUDIES (idea 12) ═══
   Each project card opens a Problem -> Approach -> Result modal. Content is
   restructured from the real card copy — nothing invented. */
(function(){
  const modal=document.getElementById('project-modal');
  if(!modal) return;
  const PROJECTS={
    '01':{cat:'Automation',name:'24/7 WhatsApp Chatbot',outcome:'24/7 coverage · faster replies',
      p:'Customers needed bookings and support around the clock, but off-hours queries went unanswered and response times lagged.',
      a:'Built from scratch on DoubleTick with Meta Flow automation — no template. Designed the conversation flows around real customer behaviour so it handles bookings and support end to end.',
      r:'Now handles 100+ interactions a day, 24/7, significantly cutting response times.',
      tags:['DoubleTick','Meta Flow','Automation']},
    '02':{cat:'IoT & Ops',name:'Heat Seal Garment Tracking',outcome:'Order accuracy transformed',
      p:'Garments were getting mixed up or lost as they moved through wash, dry, fold and delivery.',
      a:'Gave every item a heat-seal label tracked through each stage, in a cross-functional rollout across operations, customer service and IT.',
      r:'Transformed order accuracy across the facility.',
      tags:['IoT','Process Design','Tracking']},
    '03':{cat:'Infrastructure',name:'Enterprise Infrastructure Upgrade',outcome:'15% efficiency gain',
      p:'Aging infrastructure across multiple locations was limiting scalability and raising cost of ownership.',
      a:'Re-architected the network topology, upgraded server hardware, and integrated cloud services for scalability.',
      r:'Improved operational efficiency by ~15% while reducing cost of ownership.',
      tags:['AWS','Networking','Server Admin']},
    '04':{cat:'Security',name:'Cybersecurity Enhancement Program',outcome:'Zero critical breaches',
      p:'The environment needed a layered defense and a repeatable way to respond to incidents.',
      a:'Deployed endpoint protection, firewall rules, VPN and encryption policies, plus staff awareness training and incident-response procedures.',
      r:'Maintained a zero critical-breach record.',
      tags:['Firewall','VPN','Encryption']},
    '05':{cat:'ERP',name:'End-to-End ERP Integration',outcome:'3 brands unified',
      p:'Multiple brands were running on disconnected systems with no unified ERP.',
      a:'Led the full-lifecycle Odoo rollout — scoping, data migration, custom modules, training 50+ employees, and post-go-live hypercare.',
      r:'Unified 3 brands on one ERP, delivered ahead of schedule.',
      tags:['Odoo','SQL','Migration']},
    '06':{cat:'Marketing & CRM',name:'CRM & Digital Marketing Overhaul',outcome:'+20% conv · +35% reach',
      p:'Lead tracking was unstructured and campaign performance went unmeasured.',
      a:'Implemented Reelo CRM for structured lead tracking and ran digital campaigns across social and email, with analytics dashboards to measure ROI.',
      r:'Lifted conversion by ~20% and grew reach ~35%.',
      tags:['Reelo CRM','Adobe','Analytics']},
  };
  function fill(n){
    const d=PROJECTS[n]; if(!d) return;
    modal.querySelector('#proj-modal-cat').textContent='// '+d.cat;
    modal.querySelector('#proj-modal-title').textContent=d.name;
    modal.querySelector('#proj-modal-outcome').textContent=d.outcome;
    modal.querySelector('#proj-p').textContent=d.p;
    modal.querySelector('#proj-a').textContent=d.a;
    modal.querySelector('#proj-r').textContent=d.r;
    modal.querySelector('#proj-modal-tags').innerHTML=d.tags.map(t=>'<span class="pc-tg">'+t+'</span>').join('');
  }
  document.querySelectorAll('#p5 .pj-c').forEach(card=>{
    const n=((card.querySelector('.pc-n')||{}).textContent||'').trim();
    if(!PROJECTS[n]) return;
    card.setAttribute('data-proj',n);
    card.setAttribute('role','button');
    card.setAttribute('tabindex','0');
    card.setAttribute('aria-haspopup','dialog');
    card.title='View case study';
    const open=()=>{ fill(n); if(window.openModal) window.openModal('project-modal'); };
    card.addEventListener('click',open);
    card.addEventListener('keydown',e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); open(); } });
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
    {g:'Navigate',ic:ic('i-tool'),  label:'Technical Skills',desc:'Skill bars & proficiency',tag:'06',fn:()=>goTo(5)},
    {g:'Navigate',ic:ic('i-rocket'),label:'Key Projects',desc:'4 impact projects',tag:'07',fn:()=>goTo(6)},
    {g:'Navigate',ic:ic('i-chart'), label:'Achievements',desc:'Measurable outcomes',tag:'08',fn:()=>goTo(7)},
    {g:'Navigate',ic:ic('i-mail'),  label:'Contact',desc:'Get in touch',tag:'09',fn:()=>goTo(8)},
    {g:'Navigate',ic:ic('i-users'), label:'My Story',desc:'Education, journey & how I work',tag:'',fn:()=>{close();if(window.openModal)window.openModal('story-modal');}},
    {g:'Navigate',ic:ic('i-network'),label:'System Architecture',desc:'Real LaundryBox stack diagram',tag:'',fn:()=>{close();if(window.openModal)window.openModal('arch-modal');}},
    {g:'Navigate',ic:ic('i-search'), label:'FAQ',desc:'Straight answers to common questions',tag:'',fn:()=>{close();if(window.openModal)window.openModal('faq-modal');}},
    {g:'Actions', ic:ic('i-mail'),  label:'Copy Email',desc:'mohamedyasief@gmail.com',tag:'',fn:()=>copy('mohamedyasief@gmail.com','Email copied!')},
    {g:'Actions', ic:ic('i-phone'), label:'Copy Phone',desc:'+971 50 359 3856',tag:'',fn:()=>copy('+971503593856','Phone copied!')},
    {g:'Actions', ic:ic('i-linkedin'),label:'LinkedIn',desc:'linkedin.com/in/yasief',tag:'',fn:()=>window.open('https://linkedin.com/in/yasief','_blank','noopener')},
    {g:'Actions', ic:ic('i-phone'), label:'WhatsApp Mohamed',desc:'Chat on WhatsApp',tag:'',fn:()=>window.open('https://wa.me/971503593856?text=Hi%20Mohamed%20%E2%80%94%20I%20saw%20your%20portfolio%20and%20I%27d%20like%20to%20talk%20about%20a%20role%2Fproject.','_blank','noopener')},
    {g:'Actions', ic:ic('i-download'),label:'Download Resume',desc:'PDF · Mohamed Yasief',tag:'',fn:()=>{const a=document.createElement('a');a.href='Mohamed_Yasief_IT_Administrator_Resume.pdf';a.download='';a.click();}},
    {g:'Actions', ic:ic('i-users'),  label:'Save contact (.vcf)',desc:'Add Mohamed to your contacts',tag:'',fn:()=>saveVCard()},
    {g:'Actions', ic:ic('i-arrow'),  label:'Share this profile',desc:'Send or copy the link',tag:'',fn:()=>shareProfile()},
    {g:'Actions', ic:ic('i-moon'),   label:'Switch theme',desc:'Night · Day · Solar',tag:'',fn:()=>{const t=document.getElementById('theme-toggle');if(t)t.click();}},
    {g:'Actions', ic:ic('i-spark'),  label:'Take a quick tour',desc:'30-second guided walkthrough',tag:'',fn:()=>{close();if(typeof window.startTour==='function')setTimeout(window.startTour,180);}},
    {g:'Actions', ic:ic('i-check'),  label:'Accessibility',desc:'Keyboard · motion · screen-reader',tag:'',fn:()=>{close();if(window.openModal)window.openModal('a11y-modal');}},
    {g:'Actions', ic:ic('i-download'),label:'Save as PDF / Print',desc:'Print-optimized résumé view',tag:'',fn:()=>{close();setTimeout(()=>window.print(),160);}},
    {g:'Run',     ic:ic('i-bolt'),   label:'Run diagnostics',desc:'Mock system self-check',tag:'',fn:()=>runDiagnostics()},
    {g:'Run',     ic:ic('i-network'),label:'Ping services',desc:'Real fetch latency check',tag:'',fn:()=>pingServices()},
    {g:'Run',     ic:ic('i-spark'),  label:'Play reflex game',desc:'Jump to the mini-game',tag:'',fn:()=>{goTo(1);close();}},
    {g:'Run',     ic:ic('i-uptime'), label:'Uptime / ROI calculator',desc:'SLA nines & cost of downtime',tag:'',fn:()=>{close();if(window.openModal)window.openModal('calc-modal');}},
    {g:'Run',     ic:ic('i-erp'),    label:'ERP configurator',desc:'Scope a rollout: platform · phases · timeline',tag:'',fn:()=>{close();if(window.openModal)window.openModal('erp-modal');}},
    {g:'Run',     ic:ic('i-server'), label:'Operations center (NOC)',desc:'Live service health, latency & incidents',tag:'',fn:()=>{close();if(window.openModal)window.openModal('noc-modal');}},
    {g:'Run',     ic:ic('i-bolt'),   label:'CI/CD pipeline',desc:'Watch a deploy: build · test · ship',tag:'',fn:()=>{close();if(window.openModal)window.openModal('cicd-modal');}},
    {g:'Run',     ic:ic('i-link'),   label:'GitHub activity',desc:'Live public feed from github.com/yasief',tag:'',fn:()=>{close();if(window.openModal)window.openModal('gh-modal');}},
  ];
  const backdrop=document.getElementById('cmd-backdrop');
  const input=document.getElementById('cmd-input');
  const list=document.getElementById('cmd-list');
  if(!backdrop||!input||!list)return;
  let sel=0,filtered=[...CMDS];

  function copy(txt,msg){
    copyText(txt,msg);close();
  }
  // Run-group actions (self-contained, fail-soft).
  function runDiagnostics(){
    close();
    toast('Running self-check…');
    const checks=['DNS','TLS 1.3','CDN','Firestore','EmailJS'];
    setTimeout(()=>toast('✓ '+checks.join(' · ')+' — all nominal'),900);
  }
  async function pingServices(){
    close();
    toast('Pinging services…');
    const t0=(performance&&performance.now)?performance.now():Date.now();
    try{
      await fetch(location.origin+location.pathname+'?_p='+Date.now(),{method:'HEAD',cache:'no-store'});
    }catch(e){}
    const ms=Math.max(1,Math.round(((performance&&performance.now)?performance.now():Date.now())-t0));
    toast('● Site responded in '+ms+' ms');
  }
  // Save Mohamed as a phone contact (client-side vCard, no backend).
  function saveVCard(){
    const v=['BEGIN:VCARD','VERSION:3.0','N:Yasief;Mohamed;;;','FN:Mohamed Yasief',
      'TITLE:IT Administrator & ERP Specialist','TEL;TYPE=CELL:+971503593856',
      'EMAIL:mohamedyasief@gmail.com','URL:https://yasief.github.io/',
      'URL:https://linkedin.com/in/yasief','ADR;TYPE=WORK:;;Dubai;;;;UAE','END:VCARD'].join('\r\n');
    const blob=new Blob([v],{type:'text/vcard'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download='Mohamed_Yasief.vcf';a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    toast('Contact downloaded');close();
  }
  // Native share sheet on mobile; copy-link fallback on desktop.
  async function shareProfile(){
    const url=location.href.split('#')[0];
    try{ if(navigator.share){ await navigator.share({title:'Mohamed Yasief — IT Administrator · Dubai',text:'IT Administrator & ERP Specialist · Dubai',url}); return; } }catch(e){ return; }
    try{ await navigator.clipboard.writeText(url); toast('Link copied!'); }catch(e){ toast('Copy failed'); }
    close();
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
    if(e.target&&e.target.matches&&e.target.matches('input,textarea'))return;
    if(e.key==='/'||e.key==='?'){
      const cmd=document.getElementById('cmd-backdrop');
      if(cmd && !cmd.classList.contains('open') && typeof window.openCmdPalette==='function'){
        e.preventDefault();
        window.openCmdPalette();
      }
    }
  });
})();

/* ═══ KEYBOARD NAV — leveled up (idea 62) ═══
   Digit 1-9 jumps to a section; the section dots become a roving-tabindex
   tablist (Arrow/Home/End); a transient HUD confirms position. Desktop only —
   mobile uses native scroll. */
(function(){
  const dotEls=[...document.querySelectorAll('.dot')];
  if(!dotEls.length) return;
  const hud=document.createElement('div'); hud.id='nav-hud'; hud.setAttribute('aria-hidden','true');
  document.body.appendChild(hud);
  let hudT;
  window.showNavHud=function(i){
    const label=(dotEls[i]&&dotEls[i].getAttribute('aria-label'))||('Section '+(i+1));
    hud.textContent=String(i+1).padStart(2,'0')+' / '+String(dotEls.length).padStart(2,'0')+'  ·  '+label;
    hud.classList.add('show');
    clearTimeout(hudT); hudT=setTimeout(()=>hud.classList.remove('show'),1600);
  };
  document.addEventListener('keydown',e=>{
    if(!isDesktop) return;
    if(document.body.classList.contains('cmd-open')) return;
    const t=e.target; if(t&&t.matches&&(t.matches('input,textarea,[contenteditable]')||t.isContentEditable)) return;
    if(e.key>='1' && e.key<='9'){
      const idx=parseInt(e.key,10)-1;
      if(idx<dotEls.length){ e.preventDefault(); goTo(idx,true); }
    }
  });
  const wrap=document.getElementById('dots');
  if(wrap){
    wrap.addEventListener('keydown',e=>{
      if(!isDesktop) return;
      let idx=dotEls.indexOf(document.activeElement);
      if(idx<0) idx=dotEls.findIndex(d=>d.classList.contains('active'));
      let n=idx;
      if(e.key==='ArrowRight'||e.key==='ArrowDown') n=Math.min(dotEls.length-1,idx+1);
      else if(e.key==='ArrowLeft'||e.key==='ArrowUp') n=Math.max(0,idx-1);
      else if(e.key==='Home') n=0;
      else if(e.key==='End') n=dotEls.length-1;
      else return;
      e.preventDefault(); dotEls[n].focus(); goTo(n,true);
    });
  }
})();

/* ═══ RETURNING-VISITOR WELCOME (idea 64) ═══
   Count visits in localStorage; greet returning visitors non-intrusively.
   Resume-to-last-section is already handled on load by the deep-link logic. */
(function(){
  let n=0;
  try{ n=(parseInt(localStorage.getItem('yasiefVisits')||'0',10)||0)+1; localStorage.setItem('yasiefVisits',String(n)); }catch(e){}
  if(n>=2){
    setTimeout(()=>{ if(typeof window.toast==='function') window.toast('Welcome back 👋'); }, 1800);
  }
})();

/* ═══ FOOTER YEAR ═══
   Keep the copyright year current automatically. */
(function(){
  const el=document.getElementById('footYear');
  if(el) el.textContent=new Date().getFullYear();
})();

/* ═══ LIVE DUBAI CLOCK + TIME-AWARE STATUS ═══ */
(function(){
  const el=document.querySelector('.nav-status');
  if(!el) return;
  el.innerHTML='<div class="nav-dot"></div><span class="nav-state">Available</span> · <span class="nav-time"></span> Dubai';
  const stateEl=el.querySelector('.nav-state'), timeEl=el.querySelector('.nav-time');
  function paint(){
    const now=new Date();
    timeEl.textContent=now.toLocaleTimeString('en-GB',{timeZone:'Asia/Dubai',hour:'2-digit',minute:'2-digit',hour12:false});
    const h=parseInt(now.toLocaleString('en-GB',{timeZone:'Asia/Dubai',hour:'2-digit',hour12:false}),10);
    stateEl.textContent=(h>=9 && h<19)?'Available now':'Online · replies soon';
  }
  paint(); setInterval(paint,60000);
})();

/* ═══ COMMAND PALETTE: Mac key label + mobile launcher ═══ */
(function(){
  const isMac=/Mac|iPhone|iPad|iPod/.test(navigator.platform||'')||/Mac OS X/.test(navigator.userAgent||'');
  if(isMac){
    document.querySelectorAll('#cmd-hint .ck').forEach(el=>{ if(el.textContent.trim()==='Ctrl') el.textContent='⌘'; });
    document.querySelectorAll('#cmd-footer .ck').forEach(el=>{ if(el.textContent.trim()==='Ctrl K') el.textContent='⌘ K'; });
  }
  // Touch/coarse-pointer devices can't press Ctrl+K — give them a launcher button.
  if(window.matchMedia('(hover: none), (pointer: coarse)').matches){
    const fab=document.createElement('button');
    fab.id='cmd-fab'; fab.type='button'; fab.setAttribute('aria-label','Open command menu');
    fab.innerHTML='<svg width="20" height="20" aria-hidden="true"><use href="#i-search"/></svg>';
    fab.addEventListener('click',()=>{ if(typeof window.openCmdPalette==='function') window.openCmdPalette(); });
    document.body.appendChild(fab);
  }
})();

/* ═══ FIRST-VISIT NAVIGATION HINT ═══ */
(function(){
  try{ if(localStorage.getItem('yasiefCoachSeen')==='1') return; }catch(e){}
  const touch=window.matchMedia('(hover: none), (pointer: coarse)').matches;
  const c=document.createElement('div'); c.id='coach';
  c.innerHTML='<div class="coach-inner"><strong>Tip</strong><span>'+
    (touch?'Swipe or tap the dots to move between sections.':'Scroll, use ←/→ arrows, or press <span class="ck">Ctrl</span><span class="ck">K</span> to jump anywhere.')+
    '</span><button type="button" id="coachTour">Take the tour</button><button type="button" id="coachClose">Got it</button></div>';
  document.body.appendChild(c);
  function dismiss(){ c.classList.add('gone'); setTimeout(()=>c.remove(),400); try{localStorage.setItem('yasiefCoachSeen','1');}catch(e){} }
  const btn=document.getElementById('coachClose'); if(btn) btn.addEventListener('click',dismiss);
  const tbtn=document.getElementById('coachTour'); if(tbtn) tbtn.addEventListener('click',()=>{ dismiss(); if(typeof window.startTour==='function') setTimeout(window.startTour,140); });
  setTimeout(dismiss,9000);
})();

/* ═══ GUIDED TOUR (idea #49) — spotlight walkthrough of the key UI ═══ */
(function(){
  const STEPS=[
    {sel:'#cmd-hint',   title:'Command palette',      body:'Press <span class="tk">⌘K</span> / <span class="tk">Ctrl&nbsp;K</span> — or click here — to jump to any section or run actions like copying my email or downloading the résumé.', place:'bottom'},
    {sel:'#dots',       title:'Section navigation',   body:'These dots move between the nine sections. Arrow keys and digits <span class="tk">1</span>–<span class="tk">9</span> work too.', place:'left'},
    {sel:'.h-ctas',     title:'Reach me in one click',body:'Email, WhatsApp, LinkedIn, or grab the one-page résumé — all right here.', place:'top'},
    {sel:'#theme-toggle',title:'Make it yours',       body:'Switch between Night, Day and Solar themes anytime.', place:'bottom'},
    {sel:'#chat-toggle-btn',title:'Ask my AI assistant',body:'Got a question about my experience or stack? Ask the assistant — it answers in seconds.', place:'left'}
  ];
  let steps=[], i=0, ov, spot, pop, keyH, lastFocus;

  function build(){
    ov=document.createElement('div'); ov.className='tour-overlay';
    spot=document.createElement('div'); spot.className='tour-spot';
    pop=document.createElement('div'); pop.className='tour-pop';
    pop.setAttribute('role','dialog'); pop.setAttribute('aria-modal','true'); pop.setAttribute('aria-label','Guided tour');
    ov.appendChild(spot); ov.appendChild(pop);
    document.body.appendChild(ov);
    pop.addEventListener('click',e=>{
      const t=e.target.closest('[data-tour]'); if(!t) return;
      const a=t.getAttribute('data-tour');
      if(a==='next') next(); else if(a==='back') back(); else finish();
    });
  }
  function render(){
    const s=steps[i]; if(!s) return finish();
    const el=document.querySelector(s.sel);
    if(!el){ if(i<steps.length-1){ i++; return render(); } return finish(); }
    const r=el.getBoundingClientRect(), pad=8;
    spot.style.left=(r.left-pad)+'px'; spot.style.top=(r.top-pad)+'px';
    spot.style.width=(r.width+pad*2)+'px'; spot.style.height=(r.height+pad*2)+'px';
    pop.innerHTML=
      '<div class="tour-step">Step '+(i+1)+' of '+steps.length+'</div>'+
      '<h3 class="tour-title">'+s.title+'</h3>'+
      '<p class="tour-body">'+s.body+'</p>'+
      '<div class="tour-nav"><button type="button" class="tour-skip" data-tour="skip">Skip</button>'+
      '<div class="tour-right">'+(i>0?'<button type="button" class="tour-btn" data-tour="back">Back</button>':'')+
      '<button type="button" class="tour-btn tour-next" data-tour="next">'+(i===steps.length-1?'Done':'Next')+'</button></div></div>';
    position(r,s.place);
    const nb=pop.querySelector('.tour-next'); if(nb) nb.focus();
  }
  function position(r,place){
    const gap=14, vw=innerWidth, vh=innerHeight, pr=pop.getBoundingClientRect(), pw=pr.width, ph=pr.height;
    const room={bottom:vh-r.bottom, top:r.top, left:r.left, right:vw-r.right};
    let p=place;
    if(p==='bottom'&&room.bottom<ph+gap+10) p='top';
    else if(p==='top'&&room.top<ph+gap+10) p='bottom';
    if(p==='left'&&room.left<pw+gap+10) p='right';
    else if(p==='right'&&room.right<pw+gap+10) p='left';
    let top,left;
    if(p==='bottom'){ top=r.bottom+gap; left=r.left; }
    else if(p==='top'){ top=r.top-ph-gap; left=r.left; }
    else if(p==='left'){ left=r.left-pw-gap; top=r.top; }
    else { left=r.right+gap; top=r.top; }
    left=Math.max(10,Math.min(left,vw-pw-10));
    top=Math.max(10,Math.min(top,vh-ph-10));
    pop.style.left=left+'px'; pop.style.top=top+'px';
  }
  function onKey(e){
    if(e.key==='Escape'){ e.preventDefault(); finish(); }
    else if(e.key==='ArrowRight'){ e.preventDefault(); next(); }
    else if(e.key==='ArrowLeft'){ e.preventDefault(); back(); }
  }
  function onResize(){ if(steps[i]) render(); }
  function next(){ if(i<steps.length-1){ i++; render(); } else finish(); }
  function back(){ if(i>0){ i--; render(); } }
  function finish(){
    if(keyH){ removeEventListener('keydown',keyH); keyH=null; }
    removeEventListener('resize',onResize);
    if(ov){ const o=ov; o.classList.add('gone'); setTimeout(()=>o.remove(),300); ov=null; }
    try{ localStorage.setItem('yasiefTourSeen','1'); }catch(e){}
    if(lastFocus&&lastFocus.focus){ try{ lastFocus.focus(); }catch(e){} }
  }
  function start(){
    if(ov) return; // already running
    try{ localStorage.setItem('yasiefTourSeen','1'); }catch(e){}
    lastFocus=document.activeElement;
    const d0=document.querySelector('.dot[data-i="0"]'); if(d0) d0.click(); // hero holds the panel-bound targets
    steps=STEPS.filter(s=>{ const e=document.querySelector(s.sel); return e && e.getBoundingClientRect().width>0; });
    if(!steps.length) return;
    i=0;
    setTimeout(()=>{ build(); keyH=onKey; addEventListener('keydown',keyH); addEventListener('resize',onResize); render(); },700);
  }
  window.startTour=start;
})();

/* ═══ ERP CONFIGURATOR (idea #36) — interactive scoping tool ═══ */
(function(){
  const modal=document.getElementById('erp-modal');
  if(!modal) return;
  const START={
    retail:['crm','inventory','accounting','pos','purchase'],
    services:['crm','accounting','project','helpdesk','hr'],
    manufacturing:['inventory','accounting','purchase','mrp','hr'],
    hospitality:['pos','inventory','accounting','purchase','hr'],
    ecommerce:['website','inventory','accounting','crm','marketing']
  };
  const MODNAME={crm:'Sales / CRM',inventory:'Inventory',accounting:'Accounting',pos:'POS',purchase:'Purchase',mrp:'Manufacturing',hr:'HR & Payroll',project:'Project',website:'Website / eShop',helpdesk:'Helpdesk',marketing:'Marketing'};
  const SIZEF={s:1,m:1.35,l:1.75,xl:2.3};
  const SIZELBL={s:'1–10',m:'11–50',l:'51–200',xl:'200+'};
  const INDLBL={retail:'Retail & POS',services:'Professional Services',manufacturing:'Manufacturing',hospitality:'Hospitality / F&B',ecommerce:'eCommerce'};
  const state={industry:'retail',size:'s',modules:new Set(START.retail)};
  const $=s=>modal.querySelector(s);
  const modBtns=[...modal.querySelectorAll('.erp-mod')];

  function syncChips(){ modBtns.forEach(b=>b.classList.toggle('active',state.modules.has(b.dataset.mod))); }

  function platform(){
    const m=state.modules; let odoo=0,zoho=0;
    if(m.has('mrp'))odoo+=3;
    if(m.has('pos'))odoo+=2;
    if(m.has('inventory'))odoo+=1;
    if(m.has('website'))odoo+=1;
    if(state.industry==='manufacturing')odoo+=2;
    if(state.size==='xl')odoo+=2; else if(state.size==='l')odoo+=1;
    if(m.size>=7)odoo+=1;
    const lightOps=!m.has('inventory')&&!m.has('pos')&&!m.has('mrp');
    if(lightOps&&(m.has('crm')||m.has('marketing')||m.has('helpdesk')||m.has('project')))zoho+=3;
    if(state.industry==='services')zoho+=1;
    if(state.size==='s')zoho+=1;
    const pick=zoho>odoo?'Zoho':'Odoo';
    let why;
    if(pick==='Odoo'){
      why = m.has('mrp') ? 'MRP + inventory + accounting in one database — Odoo avoids the integration tax between manufacturing and finance.'
        : m.has('pos') ? 'Odoo POS decrements inventory and posts to accounting in real time — ideal for '+INDLBL[state.industry].toLowerCase()+'.'
        : (state.size==='xl'||state.size==='l') ? 'At this headcount a single integrated Odoo database keeps data consistent as you scale.'
        : 'Odoo’s tightly-integrated modules keep this stack consistent with room to grow.';
    } else {
      why='For a lean team centred on CRM, finance and customer ops, Zoho One is quick to roll out and easy on budget — without an over-built ERP.';
    }
    return {pick,why};
  }
  function phases(){
    const m=state.modules;
    const P1=['accounting','inventory','crm'].filter(x=>m.has(x));
    const P2=['pos','purchase','mrp','project'].filter(x=>m.has(x));
    const P3=['website','marketing','helpdesk','hr'].filter(x=>m.has(x));
    const g=[];
    if(P1.length)g.push(['Foundation',P1]);
    if(P2.length)g.push(['Operations',P2]);
    if(P3.length)g.push(['Growth & people',P3]);
    return g;
  }
  function notes(){
    const m=state.modules,out=[];
    if(m.has('pos')&&m.has('inventory'))out.push('POS ↔ Inventory: stock decrements at the till in real time.');
    if(m.has('website')&&m.has('inventory'))out.push('eShop ↔ Inventory: live online stock, no overselling.');
    if(m.has('mrp')&&m.has('purchase'))out.push('MRP ↔ Purchase: auto-replenishment driven by bill-of-materials demand.');
    if(m.has('crm')&&m.has('marketing'))out.push('CRM ↔ Marketing: closed-loop lead nurturing into the sales pipeline.');
    if(m.has('accounting')&&(m.has('pos')||m.has('purchase')))out.push('Accounting auto-posts from POS/Purchase — no double entry.');
    if(m.has('hr'))out.push('HR & Payroll: WPS-compliant payroll configuration for the UAE.');
    return out.slice(0,4);
  }
  function recompute(){
    const count=state.modules.size, {pick,why}=platform(), ph=phases();
    const w=(3+count)*SIZEF[state.size];
    const lo=Math.max(2,Math.round(w*0.8)), hi=Math.round(w*1.15);
    $('#erp-platform').textContent=pick;
    $('#erp-why').textContent=why;
    $('#erp-modcount').textContent=count;
    $('#erp-weeks').textContent=count?(lo+'–'+hi):'—';
    $('#erp-phases').textContent=ph.length||'—';
    const ol=$('#erp-phaselist'); ol.innerHTML='';
    if(!ph.length){ ol.innerHTML='<li>Select a module to see a rollout plan.</li>'; }
    else ph.forEach(g=>{ const li=document.createElement('li'); li.innerHTML='<strong>'+g[0]+':</strong> '+g[1].map(x=>MODNAME[x]).join(', '); ol.appendChild(li); });
    const nt=$('#erp-notes'); nt.innerHTML='';
    notes().forEach(n=>{ const d=document.createElement('div'); d.className='erp-note'; d.textContent=n; nt.appendChild(d); });
  }
  function ctaHref(){
    const {pick}=platform();
    const mods=[...state.modules].map(x=>MODNAME[x]).join(', ')||'core modules';
    const msg='Hi Mohamed — I scoped an ERP setup on your site:\n• Industry: '+INDLBL[state.industry]+'\n• Team: '+SIZELBL[state.size]+'\n• Modules: '+mods+'\n• Suggested platform: '+pick+'\nCan we discuss?';
    return 'https://wa.me/971503593856?text='+encodeURIComponent(msg);
  }

  modal.querySelectorAll('[data-erp="industry"] .erp-pill').forEach(b=>b.addEventListener('click',()=>{
    modal.querySelectorAll('[data-erp="industry"] .erp-pill').forEach(x=>x.classList.remove('active'));
    b.classList.add('active'); state.industry=b.dataset.val;
    state.modules=new Set(START[state.industry]); syncChips(); recompute();
  }));
  modal.querySelectorAll('[data-erp="size"] .erp-pill').forEach(b=>b.addEventListener('click',()=>{
    modal.querySelectorAll('[data-erp="size"] .erp-pill').forEach(x=>x.classList.remove('active'));
    b.classList.add('active'); state.size=b.dataset.val; recompute();
  }));
  modBtns.forEach(b=>b.addEventListener('click',()=>{
    const k=b.dataset.mod;
    if(state.modules.has(k))state.modules.delete(k); else state.modules.add(k);
    b.classList.toggle('active'); recompute();
  }));
  const cta=$('#erp-cta');
  if(cta)cta.addEventListener('click',()=>window.open(ctaHref(),'_blank','noopener'));

  syncChips(); recompute();
})();

/* ═══ Shared helper: run code when a modal opens / closes ═══ */
function onModalToggle(id,onOpen,onClose){
  const el=document.getElementById(id); if(!el) return;
  let was=el.classList.contains('open');
  new MutationObserver(()=>{
    const is=el.classList.contains('open');
    if(is&&!was) onOpen&&onOpen();
    else if(!is&&was) onClose&&onClose();
    was=is;
  }).observe(el,{attributes:true,attributeFilter:['class']});
}

/* ═══ NOC — live monitoring (idea #38 + perf #48) · simulated telemetry ═══ */
(function(){
  const modal=document.getElementById('noc-modal'); if(!modal) return;
  const SVCS=[
    {nm:'PROD-01',base:24},{nm:'DB-SERVER',base:38},{nm:'BACKUP-SRV',base:60},
    {nm:'LOCKER-IOT',base:85},{nm:'APP-API',base:30},{nm:'CDN-EDGE',base:18},{nm:'MAIL-GW',base:45}
  ];
  const svcEl=document.getElementById('noc-services');
  const feedEl=document.getElementById('noc-feed');
  const line=document.getElementById('noc-spark-line');
  const state=SVCS.map(s=>({nm:s.nm,base:s.base,lat:s.base,status:'ok'}));
  let hist=[], timer=null, incidents=0;

  const now=()=>new Date().toTimeString().slice(0,8);
  const statusOf=l=>l>140?'down':l>95?'warn':'ok';
  function renderSvcs(){
    svcEl.innerHTML='';
    state.forEach(s=>{
      const st=s.status, pct=Math.max(6,Math.min(100,120-s.lat));
      const row=document.createElement('div'); row.className='noc-srv';
      row.innerHTML='<span class="noc-dot '+(st==='ok'?'':st)+'"></span>'+
        '<span class="noc-srv-nm">'+s.nm+'</span>'+
        '<span class="noc-srv-bar"><i style="width:'+pct+'%"></i></span>'+
        '<span class="noc-srv-lat">'+Math.round(s.lat)+' ms</span>'+
        '<span class="noc-srv-st">'+(st==='ok'?'OK':st==='warn'?'WARN':'DOWN')+'</span>';
      svcEl.appendChild(row);
    });
  }
  function feed(cls,msg){
    const div=document.createElement('div'); div.className='nf';
    div.innerHTML='<span class="nf-t">'+now()+'</span><span class="'+cls+'">'+msg+'</span>';
    feedEl.insertBefore(div,feedEl.firstChild);
    while(feedEl.children.length>30) feedEl.removeChild(feedEl.lastChild);
  }
  function tick(){
    let total=0, up=0;
    state.forEach(s=>{
      s.lat+=(s.base-s.lat)*0.2+(Math.random()-0.5)*18;
      if(Math.random()<0.02) s.lat+=60+Math.random()*80;
      s.lat=Math.max(6,s.lat);
      const prev=s.status; s.status=statusOf(s.lat);
      total+=s.lat; if(s.status!=='down') up++;
      if(prev!=='down'&&s.status==='down'){ incidents++; feed('nf-down','⚠ '+s.nm+' unreachable ('+Math.round(s.lat)+'ms) — paging on-call'); }
      else if(prev==='down'&&s.status!=='down') feed('nf-ok','✔ '+s.nm+' recovered ('+Math.round(s.lat)+'ms)');
      else if(prev==='ok'&&s.status==='warn') feed('nf-warn','● '+s.nm+' latency elevated ('+Math.round(s.lat)+'ms)');
    });
    const avg=total/state.length;
    document.getElementById('noc-lat').textContent=Math.round(avg)+' ms';
    document.getElementById('noc-up').textContent=up+'/'+state.length;
    document.getElementById('noc-rps').textContent=(1.2+Math.random()*0.6).toFixed(1)+'k';
    document.getElementById('noc-inc').textContent=incidents;
    hist.push(avg); if(hist.length>40) hist.shift();
    const max=Math.max(120,...hist), min=Math.min(...hist,0);
    line.setAttribute('points',hist.map((v,i)=>{
      const x=(i/Math.max(1,hist.length-1))*200, y=48-((v-min)/((max-min)||1))*44-2;
      return x.toFixed(1)+','+y.toFixed(1);
    }).join(' '));
    renderSvcs();
  }
  function start(){
    if(timer) return;
    state.forEach(s=>{s.lat=s.base;s.status='ok';}); hist=[]; incidents=0; feedEl.innerHTML='';
    renderSvcs();
    feed('nf-ok','✔ Monitoring session started — '+state.length+' services under watch');
    tick(); timer=setInterval(tick,1600);
  }
  function stop(){ if(timer){clearInterval(timer);timer=null;} }
  onModalToggle('noc-modal',start,stop);
})();

/* ═══ CI/CD pipeline (idea #44) — simulated deploy ═══ */
(function(){
  const modal=document.getElementById('cicd-modal'); if(!modal) return;
  const STAGES=[
    {nm:'Checkout',log:['git clone yasief/Portfolio','HEAD detached at main']},
    {nm:'Install',log:['restoring dependency cache','deps up to date']},
    {nm:'Lint',log:['eslint . --max-warnings 0','0 problems']},
    {nm:'Test',log:['running 42 unit tests','42 passed, 0 failed']},
    {nm:'Build',log:['minify + fingerprint assets','bundle 1.2 MB gzipped']},
    {nm:'Deploy',log:['publishing to GitHub Pages','live → yasief.github.io']}
  ];
  const stagesEl=document.getElementById('cicd-stages');
  const logEl=document.getElementById('cicd-log');
  const runBtn=document.getElementById('cicd-run');
  let running=false, timers=[];
  function build(){
    stagesEl.innerHTML='';
    STAGES.forEach((s,i)=>{
      const d=document.createElement('div'); d.className='cicd-stage'; d.dataset.i=i;
      d.innerHTML='<span class="cicd-ic"></span><span class="cicd-nm">'+s.nm+'</span><span class="cicd-dur"></span>';
      stagesEl.appendChild(d);
    });
  }
  function reset(){ timers.forEach(clearTimeout); timers=[]; running=false; build(); logEl.innerHTML=''; runBtn.disabled=false; runBtn.innerHTML='&#9654; Run pipeline'; }
  function log(msg,ok){ const l=document.createElement('div'); if(ok)l.className='cl-ok'; l.textContent=(ok?'✔ ':'$ ')+msg; logEl.appendChild(l); logEl.scrollTop=logEl.scrollHeight; }
  function run(){
    if(running) return; reset(); running=true; runBtn.disabled=true; runBtn.innerHTML='● Running…';
    let delay=0;
    STAGES.forEach((s,i)=>{
      const sel=()=>stagesEl.querySelector('.cicd-stage[data-i="'+i+'"]');
      timers.push(setTimeout(()=>{ const e=sel(); if(e){e.classList.add('running'); s.log.forEach(l=>log(l,false));} },delay));
      const dur=600+Math.random()*700; delay+=dur;
      timers.push(setTimeout(()=>{
        const e=sel(); if(!e) return;
        e.classList.remove('running'); e.classList.add('passed');
        e.querySelector('.cicd-ic').innerHTML='✓';
        e.querySelector('.cicd-dur').textContent=(dur/1000).toFixed(1)+'s';
        log(s.nm+' passed',true);
        if(i===STAGES.length-1){ running=false; runBtn.disabled=false; runBtn.innerHTML='&#9654; Run again'; log('Pipeline succeeded ✨',true); }
      },delay));
    });
  }
  runBtn.addEventListener('click',run);
  onModalToggle('cicd-modal',()=>setTimeout(run,300),reset);
})();

/* ═══ GitHub activity (idea #52) — live public feed ═══ */
(function(){
  const modal=document.getElementById('gh-modal'); if(!modal) return;
  const feed=document.getElementById('gh-feed');
  let loaded=false, loading=false;
  function when(iso){
    const diff=(Date.now()-new Date(iso).getTime())/1000;
    if(diff<3600) return Math.max(1,Math.floor(diff/60))+'m ago';
    if(diff<86400) return Math.floor(diff/3600)+'h ago';
    return Math.floor(diff/86400)+'d ago';
  }
  const ICON={PushEvent:'⬆',CreateEvent:'✦',WatchEvent:'★',ForkEvent:'⑂',PullRequestEvent:'⇄',IssuesEvent:'◉',ReleaseEvent:'⚑',IssueCommentEvent:'💬'};
  function describe(e){
    const r='<span class="gh-repo">'+(e.repo?e.repo.name:'')+'</span>';
    const p=e.payload||{};
    switch(e.type){
      case 'PushEvent':{ const n=(p.commits?p.commits.length:p.size)||1; return 'Pushed <b>'+n+'</b> commit'+(n>1?'s':'')+' to '+r; }
      case 'CreateEvent': return 'Created '+(p.ref_type||'repo')+' in '+r;
      case 'WatchEvent': return 'Starred '+r;
      case 'ForkEvent': return 'Forked '+r;
      case 'PullRequestEvent': return (p.action||'updated')+' a pull request in '+r;
      case 'IssuesEvent': return (p.action||'updated')+' an issue in '+r;
      case 'ReleaseEvent': return 'Published a release in '+r;
      default: return e.type.replace('Event','')+' · '+r;
    }
  }
  async function load(){
    if(loaded||loading) return; loading=true;
    try{
      const res=await fetch('https://api.github.com/users/yasief/events/public?per_page=12',{headers:{'Accept':'application/vnd.github+json'}});
      if(!res.ok) throw new Error('http '+res.status);
      const data=await res.json();
      if(!Array.isArray(data)||!data.length){ feed.innerHTML='<div class="gh-msg">No recent public activity to show right now.<br>See the full profile below.</div>'; loaded=true; return; }
      feed.innerHTML='';
      data.slice(0,12).forEach(e=>{
        const ev=document.createElement('div'); ev.className='gh-ev';
        ev.innerHTML='<span class="gh-ic">'+(ICON[e.type]||'•')+'</span><span class="gh-tx">'+describe(e)+'</span><span class="gh-when">'+when(e.created_at)+'</span>';
        feed.appendChild(ev);
      });
      loaded=true;
    }catch(err){
      feed.innerHTML='<div class="gh-msg">Couldn’t load live activity (GitHub may be rate-limiting).<br>Open the full profile below.</div>';
    }finally{ loading=false; }
  }
  onModalToggle('gh-modal',load);
})();

/* ═══ Clickable topology (idea #39) — architecture node details ═══ */
(function(){
  const modal=document.getElementById('arch-modal'); if(!modal) return;
  const detail=document.getElementById('arch-detail'); if(!detail) return;
  const NODES={
    lockers:['Smart Lockers','100+ IoT locker units across Dubai residential buildings — firmware managed centrally, 24/7 cloud sync, tamper detection on every door.'],
    cctv:['CCTV','Remote-monitored cameras at each site: security coverage and fast dispute resolution when an order is questioned.'],
    pabx:['Yeastar PABX','IP telephony powering the support line — call routing, IVR and extension management for the operations team.'],
    gateway:['IoT Gateway','The secure, encrypted bridge between edge hardware and the cloud — the single controlled path in and out of the device fleet.'],
    tracksolid:['Tracksolid','Hardware tracking and health monitoring across the fleet — location, connectivity and status at a glance.'],
    backend:['Locker Management Backend','The custom brain of the platform: assigns lockers, drives the customer app and orchestrates the whole order lifecycle.'],
    cloud:['AWS · Azure · Firebase','Compute, object storage and a realtime database — the elastic backbone that keeps everything online and in sync.'],
    app:['Customer App','Bookings, payments and locker access in the customer’s hand — the primary self-service channel.'],
    whatsapp:['WhatsApp Bot','24/7 automated support and bookings on DoubleTick + Meta Flow — built from real user behaviour, not a template.'],
    quickbill:['QuickBill','Billing and ERP — closing the loop from service delivered to invoice raised, with no manual re-entry.'],
    security:['IoT Security','Not a layer, a spine: encryption in transit and at rest, least-privilege access control and threat detection across every tier. Zero breaches to date.']
  };
  function show(key,el){
    const n=NODES[key]; if(!n) return;
    modal.querySelectorAll('.ab-node.sel').forEach(x=>x.classList.remove('sel'));
    if(el) el.classList.add('sel');
    detail.innerHTML='<strong class="arch-detail-t">'+n[0]+'</strong><span class="arch-detail-d">'+n[1]+'</span>';
  }
  function reset(){ detail.innerHTML='<span class="arch-detail-hint">Tap any component above for details.</span>'; modal.querySelectorAll('.ab-node.sel').forEach(x=>x.classList.remove('sel')); }
  modal.addEventListener('click',e=>{ const node=e.target.closest('.ab-node'); if(node) show(node.getAttribute('data-node'),node); });
  modal.addEventListener('keydown',e=>{
    if(e.key!=='Enter'&&e.key!==' ') return;
    const node=e.target.closest&&e.target.closest('.ab-node'); if(!node) return;
    e.preventDefault(); show(node.getAttribute('data-node'),node);
  });
  onModalToggle('arch-modal',null,reset);
})();

/* ═══ Exit-intent lead capture (ideas #23/#27/#28) ═══ */
(function(){
  const dismiss=document.getElementById('exit-dismiss');
  if(dismiss) dismiss.addEventListener('click',()=>{ if(window.closeModal) window.closeModal('exit-modal'); });
  try{ if(localStorage.getItem('yasiefExitShown')==='1') return; }catch(e){}
  let armed=false, fired=false;
  setTimeout(()=>{ armed=true; },15000); // only after ~15s of genuine engagement
  function overlayOpen(){
    return document.body.classList.contains('modal-open') ||
           document.body.classList.contains('cmd-open') ||
           !!document.querySelector('#chatbot-widget.open');
  }
  function fire(){
    if(fired||!armed||overlayOpen()) return;
    fired=true;
    try{ localStorage.setItem('yasiefExitShown','1'); }catch(e){}
    if(window.openModal) window.openModal('exit-modal');
  }
  if(window.matchMedia('(pointer:fine)').matches){
    document.addEventListener('mouseout',e=>{ if(e.clientY<=0 && !e.relatedTarget) fire(); });
  } else {
    setTimeout(fire,45000); // mobile has no reliable exit signal — gentle timed fallback
  }
})();
