// networkTopologyAnimation.js

let topologyInitialized = false;
let heroTopologyInitialized = false;

function startAnimation(canvasId, isHero = false) {
  const c = document.getElementById(canvasId);
  if(!c) return;

  const ctx = c.getContext('2d');
  let W,H;
  function resize(){W=c.width=c.offsetWidth;H=c.height=c.offsetHeight;}
  resize();window.addEventListener('resize',resize);

  const nodeCount = 40;
  const partCount = 20;
  const nodes=[];
  for(let i=0;i<nodeCount;i++) nodes.push({x:Math.random()*W,y:Math.random()*H,vx:(Math.random()-.5)*.3,vy:(Math.random()-.5)*.3,r:Math.random()*1.5+.5,pulse:Math.random()*Math.PI*2,bright:Math.random()>.88});
  const parts=[];
  for(let i=0;i<partCount;i++) parts.push({x:Math.random()*W,y:Math.random()*H,vx:(Math.random()-.5)*.8,vy:(Math.random()-.5)*.8,a:Math.random()*.4+.1,r:Math.random()*1.5+.5,col:Math.random()>.7?'0,255,157':Math.random()>.5?'123,47,255':'0,210,255'});
  
  let mouseX=W/2,mouseY=H/2;
  // For the hero canvas, interaction should be across the whole panel.
  const interactionTarget = isHero ? c.parentElement : c;
  interactionTarget.addEventListener('mousemove',e=>{
    const r=c.getBoundingClientRect();
    mouseX=e.clientX-r.left;
    mouseY=e.clientY-r.top;
  });

  function draw(){
    ctx.clearRect(0,0,W,H);
    const isDaylight = document.body.dataset.theme === 'daylight';
    const isSolar    = document.body.dataset.theme === 'solar';
    const baseColor = isDaylight ? '37,99,235'  : isSolar ? '34,211,238'  : '0,210,255';   // c1 per theme
    const brightColor = isDaylight ? '13,148,136' : isSolar ? '74,222,128'  : '0,255,157'; // c4 per theme
    const hoverColor = isDaylight ? '234,88,12'  : isSolar ? '251,113,133' : '255,107,53'; // c3 per theme

    // Day-mode needs stronger lines on a light backdrop. Solar gets a small bump too.
    const lineMult = isDaylight ? 2.6 : isSolar ? 1.4 : 1;
    const mouseMult = isDaylight ? 2.0 : isSolar ? 1.3 : 1;

    // Grid background is only for the dashboard version, not the hero background.
    if (!isHero) {
        ctx.strokeStyle = isDaylight ? 'rgba(37,99,235,0.06)' : 'rgba(0,210,255,0.025)';
        ctx.lineWidth=1;
        for(let x=0;x<W;x+=80){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
        for(let y=0;y<H;y+=80){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
    }

    // Draw connecting lines between nodes
    for(let a=0;a<nodes.length;a++){
      const n=nodes[a];
      for(let b=a+1;b<nodes.length;b++){
        const m=nodes[b],dx=n.x-m.x,dy=n.y-m.y,dist=Math.sqrt(dx*dx+dy*dy);
        if(dist<140){ctx.strokeStyle=`rgba(${baseColor},${(1-dist/140)*.13*lineMult})`;ctx.lineWidth=isDaylight?.7:.5;ctx.beginPath();ctx.moveTo(n.x,n.y);ctx.lineTo(m.x,m.y);ctx.stroke();}
      }
    }

    // Draw lines from nodes to mouse
    nodes.forEach(n=>{
      const dx=n.x-mouseX,dy=n.y-mouseY,dist=Math.sqrt(dx*dx+dy*dy);
      if(dist<200){ctx.strokeStyle=`rgba(${baseColor},${(1-dist/200)*.28*mouseMult})`;ctx.lineWidth=isDaylight?1:.8;ctx.beginPath();ctx.moveTo(n.x,n.y);ctx.lineTo(mouseX,mouseY);ctx.stroke();}
    });

    // Draw nodes and handle hover
    nodes.forEach(n=>{
      n.pulse+=.03;
      let gl = n.bright ? (Math.sin(n.pulse)*.5+.5) : .3;
      if (isDaylight) gl = Math.min(1, gl + .35); // brighten on light bg

      const dx = n.x - mouseX, dy = n.y - mouseY, dist = Math.sqrt(dx*dx + dy*dy);
      const isHovered = dist < 100;

      const nodeColorRgb = isHovered ? hoverColor : (n.bright ? brightColor : baseColor);

      ctx.fillStyle=`rgba(${nodeColorRgb}, ${gl})`;
      if (isHovered) {
        ctx.shadowBlur = 12;
        ctx.shadowColor = `rgba(${hoverColor}, 0.7)`;
      } else if (n.bright) {
        ctx.shadowBlur = isDaylight ? 6 : 8;
        ctx.shadowColor = `rgba(${brightColor}, ${isDaylight ? 0.4 : 0.5})`;
      }

      const nodeRadius = isDaylight ? n.r * 1.3 : n.r;
      ctx.beginPath();ctx.arc(n.x,n.y,nodeRadius,0,Math.PI*2);ctx.fill();
      ctx.shadowBlur=0; // Reset shadow for next element

      n.x+=n.vx;n.y+=n.vy;
      if(n.x<0||n.x>W)n.vx*=-1;if(n.y<0||n.y>H)n.vy*=-1;
    });

    // Draw particles
    parts.forEach(p=>{
      // In daylight, swap to deep-saturated theme tones (vivid, not gray ink) so
      // particles read clearly on the light backdrop.
      const partColor = isDaylight
        ? (p.col === '0,255,157' ? '13,148,136' : p.col === '123,47,255' ? '124,58,237' : '37,99,235')
        : p.col;
      const alpha = isDaylight ? Math.min(1, p.a * 2.2) : p.a;
      ctx.fillStyle=`rgba(${partColor},${alpha})`;
      ctx.beginPath();ctx.arc(p.x,p.y,isDaylight ? p.r*1.2 : p.r,0,Math.PI*2);ctx.fill();
      p.x+=p.vx;p.y+=p.vy;
      if(p.x<0)p.x=W;if(p.x>W)p.x=0;if(p.y<0)p.y=H;if(p.y>H)p.y=0;
    });

    requestAnimationFrame(draw);
  }
  draw();
}

export function initNetworkTopologyAnimation() {
  if (topologyInitialized) return;
  topologyInitialized = true;
  startAnimation('netCanvas', false);
}

export function initHeroNetworkAnimation() {
    if (heroTopologyInitialized) return;
    heroTopologyInitialized = true;
    startAnimation('heroNetCanvas', true);
}

window.initNetworkTopologyAnimation = initNetworkTopologyAnimation;
window.initHeroNetworkAnimation = initHeroNetworkAnimation;