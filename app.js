/* ═══════════════════════════════════════════════════════════════
   HH GOA 2026 — Builder ID Card Generator
   app.js  —  Canvas engine · Photo editor · HEIC · Export
═══════════════════════════════════════════════════════════════ */

'use strict';

// ── CARD DIMENSIONS ───────────────────────────────────────────
const CW = 1080;   // card width  (px)
const CH = 1520;   // card height (px)

// ── FRAME IMAGE GEOMETRY ──────────────────────────────────────
// The cropped frame PNG (731 × 556 px) has its transparent circle
// centered at X=365, Y=244 with Radius=186.
const FRAME_W_SRC = 731;
const FRAME_H_SRC = 556;
const FRAME_CX_F = 365 / FRAME_W_SRC;   // 0.4993
const FRAME_CY_F = 244 / FRAME_H_SRC;   // 0.4388
const FRAME_R_F = 186 / FRAME_W_SRC;   // exact transparent circle radius from source PNG

// ── HOW THE FRAME IS DRAWN ON THE CARD ────────────────────────
// We draw the frame centered on the 1080px wide card with 40px margins.
const FRAME_DRAW_W = 1000;
const FRAME_DRAW_H = Math.round(FRAME_DRAW_W * (FRAME_H_SRC / FRAME_W_SRC)); // 761 px
const FRAME_X = 40;
const FRAME_Y = 100; // offset from top

// Exact circle coordinates on the 1080x1520 canvas:
const CIRCLE_CX = Math.round(FRAME_X + FRAME_DRAW_W * FRAME_CX_F);   // 539
const CIRCLE_CY = Math.round(FRAME_Y + FRAME_DRAW_H * FRAME_CY_F);   // 434
const CIRCLE_R = Math.round(FRAME_DRAW_W * FRAME_R_F);               // 254

// No inset — fill the transparent hole exactly
const MAT_MARGIN = 0;
const CLIP_R = CIRCLE_R;

// ── APP STATE ─────────────────────────────────────────────────
const S = {
  img: null,   // Loaded HTMLImageElement
  zoom: 1.0,
  angle: 0,      // Rotation in degrees
  panX: 0,
  panY: 0,
  dragging: false,
  lx: 0, ly: 0,    // Last pointer coordinates
  genTitle: '',
  frameImg: null,   // The frame image
};

// ── DOM ELEMENTS ──────────────────────────────────────────────
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const emptyEl = document.getElementById('canvas-empty');
const adjustEl = document.getElementById('step-adjust');
const dzEl = document.getElementById('drop-zone');
const zoomSl = document.getElementById('zoom-slider');
const rotSl = document.getElementById('rot-slider');
const zoomValEl = document.getElementById('zoom-val');
const rotValEl = document.getElementById('rot-val');
const btnDl = document.getElementById('btn-download');
const btnSh = document.getElementById('btn-share');
const noteEl = document.getElementById('export-note');
const titleDisp = document.getElementById('title-display');

// ── FUN BUILDER TITLES ────────────────────────────────────────
const TITLES = [
  'The Stack Overflow Survivor',
  'Chief Vibe Engineer',
  'Prompt Whisperer',
  'Certified Chaos Deployer',
  'Async Await Evangelist',
  'TypeScript Apologist',
  'Coffee-Powered Coder',
  'Git Push & Pray Developer',
  'The 3 AM Debug Specialist',
  'AI Feature Sprinkler',
  '404: Sleep Not Found',
  'Serial Side-Project Starter',
  'Regex Enthusiast (Send Help)',
  'Full-Stack Hopeful',
  'Context Window Maximizer',
  'Hackathon Veteran',
  'Ship It & Forget It Engineer',
  'The Documentation Denier',
  'Rubber Duck Whisperer',
  'Semicolon Purist',
];

// ── INITIALIZATION ────────────────────────────────────────────
canvas.width = CW;
canvas.height = CH;

(async function init() {
  S.frameImg = await loadImage('goa-frame-transparent.png');
  render();
  setupPointerListeners();
})();

function loadImage(src) {
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';   // prevent canvas taint (needed for toDataURL on Vercel)
    img.onload = () => resolve(img);
    img.onerror = () => { console.warn(`Could not load: ${src}`); resolve(null); };
    img.src = src;
  });
}

// ── FILE UPLOAD & HEIC CONVERSION ─────────────────────────────
function handleDragOver(e) { e.preventDefault(); dzEl.classList.add('drag-over'); }
function handleDragLeave() { dzEl.classList.remove('drag-over'); }
function handleDrop(e) { e.preventDefault(); dzEl.classList.remove('drag-over'); if (e.dataTransfer.files[0]) processFile(e.dataTransfer.files[0]); }
function handleFileSelect(e) { if (e.target.files[0]) processFile(e.target.files[0]); e.target.value = ''; }

async function processFile(file) {
  const isHEIC = /\.(heic|heif)$/i.test(file.name) || /heic|heif/.test(file.type);
  dzEl.classList.add('loading');
  try {
    let blob = file;
    if (isHEIC) {
      toast('⏳ Converting HEIC…');
      if (typeof heic2any === 'undefined') throw new Error('HEIC library not loaded — check internet connection.');
      blob = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 });
      if (Array.isArray(blob)) blob = blob[0];
    }
    const url = URL.createObjectURL(blob);
    S.img = await loadImage(url);

    // Reset offsets
    resetAdj(false);

    // Show adjustment options
    adjustEl.classList.remove('hidden');
    emptyEl.classList.add('hidden');
    btnDl.disabled = false;
    btnSh.disabled = false;
    noteEl.textContent = 'Download first, then share on X.';

    // Update upload thumbnail
    document.getElementById('dz-inner').innerHTML = `
      <img src="${url}" style="width:48px;height:48px;border-radius:50%;object-fit:cover;border:2px solid hsl(38,80%,55%);margin-bottom:.35rem" />
      <p class="dz-text">Photo loaded ✓</p>
      <p style="font-size:.72rem;color:var(--tx-hint)">Click to change</p>`;

    render();
    toast('Photo loaded!');
  } catch (err) {
    toast('Error: ' + (err.message || 'Could not load image.'));
    console.error(err);
  } finally {
    dzEl.classList.remove('loading');
  }
}

// ── CANVAS CANVAS RENDERER ────────────────────────────────────
function render() {
  const W = CW, H = CH;
  ctx.clearRect(0, 0, W, H);

  // 1. Background Sandy Gradient (blends nicely with the outer wood background)
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, 'hsl(37, 42%, 63%)');   // Matches top-left frame pixels
  bg.addColorStop(0.12, 'hsl(36, 40%, 65%)');
  bg.addColorStop(0.60, 'hsl(34, 35%, 60%)');
  bg.addColorStop(1, 'hsl(30, 32%, 52%)');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Subtle radial vignette for designer feel
  const vig = ctx.createRadialGradient(W / 2, H * 0.38, H * 0.18, W / 2, H * 0.38, H * 0.78);
  vig.addColorStop(0, 'transparent');
  vig.addColorStop(1, 'rgba(20,12,4,0.30)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);

  // 2. Header Texts
  drawHeader(W);

  // 3. User Photo (With a beautiful dark bronze mat gap / passe-partout border)
  // First, draw the mat board background (radius CIRCLE_R)
  ctx.save();
  const matGrad = ctx.createRadialGradient(CIRCLE_CX, CIRCLE_CY - CIRCLE_R * 0.1, 0, CIRCLE_CX, CIRCLE_CY, CIRCLE_R);
  matGrad.addColorStop(0, 'hsl(33, 28%, 28%)'); // Sandy/bronze tone
  matGrad.addColorStop(1, 'hsl(28, 25%, 15%)'); // Dark wood shadow
  ctx.fillStyle = matGrad;
  ctx.beginPath();
  ctx.arc(CIRCLE_CX, CIRCLE_CY, CIRCLE_R, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Next, clip the photo/placeholder to the inset circle (radius CLIP_R)
  ctx.save();
  ctx.beginPath();
  ctx.arc(CIRCLE_CX, CIRCLE_CY, CLIP_R, 0, Math.PI * 2);
  ctx.clip();

  if (S.img) {
    drawPhoto(CIRCLE_CX, CIRCLE_CY, CLIP_R * 2, CLIP_R * 2);
  } else {
    // Elegant silhouette placeholder inside the inset circle
    const ph = ctx.createRadialGradient(CIRCLE_CX, CIRCLE_CY - CLIP_R * 0.2, 0, CIRCLE_CX, CIRCLE_CY, CLIP_R);
    ph.addColorStop(0, 'hsl(33, 30%, 42%)');
    ph.addColorStop(1, 'hsl(28, 25%, 22%)');
    ctx.fillStyle = ph;
    ctx.fillRect(CIRCLE_CX - CLIP_R, CIRCLE_CY - CLIP_R, CLIP_R * 2, CLIP_R * 2);

    ctx.fillStyle = 'hsla(35, 40%, 55%, 0.25)';
    ctx.beginPath();
    ctx.arc(CIRCLE_CX, CIRCLE_CY - CLIP_R * 0.13, CLIP_R * 0.33, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(CIRCLE_CX, CIRCLE_CY + CLIP_R * 0.72, CLIP_R * 0.52, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // 4. Wooden Frame (Drawn ON TOP of the photo so it covers the clipped photo edges perfectly)
  if (S.frameImg) {
    ctx.drawImage(S.frameImg, FRAME_X, FRAME_Y, FRAME_DRAW_W, FRAME_DRAW_H);
  }

  // 4b. Thin decorative ring boundary over the profile picture circle
  ctx.save();
  const ringGrad = ctx.createLinearGradient(
    CIRCLE_CX - CIRCLE_R, CIRCLE_CY - CIRCLE_R,
    CIRCLE_CX + CIRCLE_R, CIRCLE_CY + CIRCLE_R
  );
  ringGrad.addColorStop(0,   'hsla(38,  88%, 65%, 0.90)');  // gold highlight
  ringGrad.addColorStop(0.5, 'hsla(185, 72%, 55%, 0.80)');  // teal mid
  ringGrad.addColorStop(1,   'hsla(38,  88%, 55%, 0.90)');  // gold again
  ctx.strokeStyle = ringGrad;
  ctx.lineWidth   = 4;
  ctx.shadowColor = 'hsla(38, 88%, 55%, 0.50)';
  ctx.shadowBlur  = 8;
  ctx.beginPath();
  ctx.arc(CIRCLE_CX, CIRCLE_CY, CIRCLE_R, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // 5. Details Section (Below the frame)
  const infoTop = FRAME_Y + FRAME_DRAW_H;   // bottom of the frame
  drawInfoSection(W, H, infoTop);
}

function drawHeader(W) {
  // Top thin design line
  const topLine = ctx.createLinearGradient(0, 0, W, 0);
  topLine.addColorStop(0, 'hsla(38, 80%, 55%, 0)');
  topLine.addColorStop(0.3, 'hsla(38, 80%, 55%, 0.65)');
  topLine.addColorStop(0.7, 'hsla(185, 60%, 48%, 0.65)');
  topLine.addColorStop(1, 'hsla(185, 60%, 48%, 0)');
  ctx.fillStyle = topLine;
  ctx.fillRect(0, 0, W, 3);

  // Main HH GOA Title
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 ${W * 0.052}px Outfit, sans-serif`;

  ctx.shadowBlur = 12;
  ctx.shadowColor = 'rgba(25,12,0,0.4)';
  ctx.shadowOffsetY = 2;

  const titleGrad = ctx.createLinearGradient(W * 0.25, 0, W * 0.75, 0);
  titleGrad.addColorStop(0, 'hsl(25, 55%, 16%)');
  titleGrad.addColorStop(0.5, 'hsl(32, 65%, 22%)');
  titleGrad.addColorStop(1, 'hsl(25, 55%, 16%)');
  ctx.fillStyle = titleGrad;
  ctx.fillText('HH GOA 2026', W / 2, 45, W * 0.85);

  ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

  // Subtitle
  ctx.font = `600 ${W * 0.026}px Outfit, sans-serif`;
  ctx.fillStyle = 'hsla(38, 70%, 35%, 0.88)';
  ctx.fillText('✦  BUILDER PASS  ✦', W / 2, 78, W * 0.85);

  ctx.restore();
}

function drawPhoto(cx, cy, areaW, areaH) {
  const img = S.img;
  const zoom = S.zoom;
  const rad = S.angle * Math.PI / 180;

  // Cover scale to make sure photo takes up whole circular circle
  const scale = Math.max(areaW / img.width, areaH / img.height) * zoom;
  const dw = img.width * scale;
  const dh = img.height * scale;

  ctx.save();
  ctx.translate(cx + S.panX, cy + S.panY);
  ctx.rotate(rad);
  ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();
}

function drawInfoSection(W, H, top) {
  const name = (document.getElementById('inp-name')?.value || '').trim();
  const role = (document.getElementById('inp-role')?.value || '').trim();
  const title = S.genTitle;

  let y = top + 52;

  // Decorative divider
  drawHLine(W, top + 16);

  // Name
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `800 ${W * 0.070}px Outfit, sans-serif`;

  const nameGrad = ctx.createLinearGradient(W * 0.20, 0, W * 0.80, 0);
  nameGrad.addColorStop(0, 'hsl(25, 55%, 12%)');
  nameGrad.addColorStop(0.5, 'hsl(32, 65%, 18%)');
  nameGrad.addColorStop(1, 'hsl(25, 55%, 12%)');
  ctx.fillStyle = nameGrad;
  ctx.shadowBlur = 8;
  ctx.shadowColor = 'rgba(25,12,0,0.25)';
  ctx.shadowOffsetY = 2;
  ctx.fillText(name || 'Your Name', W / 2, y, W * 0.82);
  ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  ctx.restore();

  y += W * 0.09;

  // Pill badge for role
  const roleText = role || 'Builder · HH Goa 2026';
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `600 ${W * 0.032}px Outfit, sans-serif`;

  const metrics = ctx.measureText(roleText);
  const pillW = Math.min(metrics.width + W * 0.1, W * 0.75);
  const pillH = W * 0.055;
  const pillX = (W - pillW) / 2;
  const pillY = y - pillH / 2;
  const pillR = pillH / 2;

  ctx.fillStyle = 'hsla(185, 45%, 30%, 0.18)';
  roundRect(ctx, pillX, pillY, pillW, pillH, pillR);
  ctx.fill();
  ctx.strokeStyle = 'hsla(185, 55%, 35%, 0.40)';
  ctx.lineWidth = 1.5;
  roundRect(ctx, pillX, pillY, pillW, pillH, pillR);
  ctx.stroke();

  ctx.fillStyle = 'hsl(185, 55%, 20%)';
  ctx.fillText(roleText, W / 2, y, pillW - W * 0.06);
  ctx.restore();

  y += W * 0.08;

  // Builder fun title
  if (title) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `500 italic ${W * 0.027}px Outfit, sans-serif`;
    ctx.fillStyle = 'hsla(35, 50%, 25%, 0.8)';
    ctx.fillText(`"${title}"`, W / 2, y, W * 0.78);
    ctx.restore();
    y += W * 0.07;
  }

  // Second separator
  drawHLine(W, y);
  y += W * 0.055;

  // Hashtags
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${W * 0.034}px Outfit, sans-serif`;
  ctx.fillStyle = 'hsl(35, 55%, 22%)';
  ctx.fillText('#FrameInGoa  ·  #HHGoa2026', W / 2, y, W * 0.82);
  ctx.restore();

  y += W * 0.055;

  // Event footer details
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `400 ${W * 0.024}px Outfit, sans-serif`;
  ctx.fillStyle = 'hsla(35, 35%, 28%, 0.75)';
  ctx.fillText('Hackhouse Goa 2026  ·  Deadline: 11:59 PM, 13 Aug 2026', W / 2, y, W * 0.85);
  ctx.restore();

  // Bottom text decoration
  const botY = H - 65;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `600 ${W * 0.028}px Outfit, sans-serif`;
  ctx.globalAlpha = 0.30;
  ctx.fillStyle = 'hsl(25, 50%, 18%)';
  ctx.fillText('🌴  G O A  🌴', W / 2, botY, W * 0.6);
  ctx.globalAlpha = 1;
  ctx.restore();

  // Bottom gold design line
  const botLine = ctx.createLinearGradient(0, 0, W, 0);
  botLine.addColorStop(0, 'hsla(38, 80%, 45%, 0)');
  botLine.addColorStop(0.3, 'hsla(38, 80%, 45%, 0.55)');
  botLine.addColorStop(0.7, 'hsla(185, 60%, 40%, 0.55)');
  botLine.addColorStop(1, 'hsla(185, 60%, 40%, 0)');
  ctx.fillStyle = botLine;
  ctx.fillRect(0, H - 3, W, 3);
}

function drawHLine(W, y) {
  const g = ctx.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, 'transparent');
  g.addColorStop(0.2, 'hsla(35, 60%, 35%, 0.45)');
  g.addColorStop(0.8, 'hsla(35, 60%, 35%, 0.45)');
  g.addColorStop(1, 'transparent');
  ctx.save();
  ctx.fillStyle = g;
  ctx.fillRect(0, y, W, 1.5);
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ── PHOTO CONTROLS ────────────────────────────────────────────
function constrainPan() {
  if (!S.img) return;

  const rad = S.angle * Math.PI / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  // Scaled dimensions of the image under current zoom (based on CLIP_R)
  const scale = Math.max(CLIP_R * 2 / S.img.width, CLIP_R * 2 / S.img.height) * S.zoom;
  const dw = S.img.width * scale;
  const dh = S.img.height * scale;

  // Transform circular well center to image-local space
  const lx = -S.panX * cos - S.panY * sin;
  const ly = S.panX * sin - S.panY * cos;

  // Maximum allowed panning offset in local coordinate space (based on CLIP_R)
  const limitX = Math.max(0, dw / 2 - CLIP_R);
  const limitY = Math.max(0, dh / 2 - CLIP_R);

  // Clamp local coordinates
  const lxClamped = Math.max(-limitX, Math.min(limitX, lx));
  const lyClamped = Math.max(-limitY, Math.min(limitY, ly));

  // Convert back to canvas world pan offsets
  S.panX = -(lxClamped * cos - lyClamped * sin);
  S.panY = -(lxClamped * sin + lyClamped * cos);
}

function onZoom(v) {
  S.zoom = Math.max(1.0, v / 100);
  zoomValEl.textContent = Math.round(S.zoom * 100) + '%';
  constrainPan();
  render();
}

function onRotate(v) {
  S.angle = Number(v);
  rotValEl.textContent = v + '°';
  constrainPan();
  render();
}

function resetAdj(doRender = true) {
  S.zoom = 1.0; S.angle = 0; S.panX = 0; S.panY = 0;
  zoomSl.value = 100; rotSl.value = 0;
  zoomValEl.textContent = '100%';
  rotValEl.textContent = '0°';
  if (doRender) render();
}

// ── BUILDER TITLE GENERATOR ───────────────────────────────────
function genTitle() {
  const t = TITLES[Math.floor(Math.random() * TITLES.length)];
  S.genTitle = t;
  titleDisp.textContent = t;
  render();
}

// ── INTERACTIVE CANVAS DRAG, PINCH-TO-ZOOM, & SCROLL ─────────
let touchStartDist = 0;
let touchStartZoom = 1.0;

function getTouchDist(e) {
  const dx = e.touches[0].clientX - e.touches[1].clientX;
  const dy = e.touches[0].clientY - e.touches[1].clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

function setupPointerListeners() {
  const stage = document.getElementById('canvas-stage');

  // Desktop Mouse Drag
  stage.addEventListener('mousedown', e => { if (!S.img) return; S.dragging = true; S.lx = e.clientX; S.ly = e.clientY; e.preventDefault(); });
  window.addEventListener('mousemove', e => {
    if (!S.dragging) return;
    const rect = stage.getBoundingClientRect();
    const sx = CW / rect.width;
    const sy = CH / rect.height;
    S.panX += (e.clientX - S.lx) * sx;
    S.panY += (e.clientY - S.ly) * sy;
    S.lx = e.clientX; S.ly = e.clientY;
    constrainPan();
    render();
  });
  window.addEventListener('mouseup', () => { S.dragging = false; });

  // Mobile Touch Pan & Pinch-to-Zoom
  stage.addEventListener('touchstart', e => {
    if (!S.img) return;
    if (e.touches.length === 1) {
      S.dragging = true;
      S.lx = e.touches[0].clientX;
      S.ly = e.touches[0].clientY;
    } else if (e.touches.length === 2) {
      S.dragging = false;
      touchStartDist = getTouchDist(e);
      touchStartZoom = S.zoom;
    }
    e.preventDefault();
  }, { passive: false });

  stage.addEventListener('touchmove', e => {
    if (!S.img) return;
    if (e.touches.length === 1 && S.dragging) {
      const rect = stage.getBoundingClientRect();
      const sx = CW / rect.width;
      const sy = CH / rect.height;
      S.panX += (e.touches[0].clientX - S.lx) * sx;
      S.panY += (e.touches[0].clientY - S.ly) * sy;
      S.lx = e.touches[0].clientX; S.ly = e.touches[0].clientY;
      constrainPan();
      render();
    } else if (e.touches.length === 2) {
      const dist = getTouchDist(e);
      if (touchStartDist > 5) {
        const factor = dist / touchStartDist;
        S.zoom = Math.min(3.0, Math.max(1.0, touchStartZoom * factor));
        const pct = Math.round(S.zoom * 100);
        zoomSl.value = pct;
        zoomValEl.textContent = pct + '%';
        constrainPan();
        render();
      }
    }
    e.preventDefault();
  }, { passive: false });

  stage.addEventListener('touchend', () => { S.dragging = false; });

  // Desktop Mouse Wheel Scroll Zoom
  stage.addEventListener('wheel', e => {
    if (!S.img) return;
    e.preventDefault();
    S.zoom = Math.min(3.0, Math.max(1.0, S.zoom + (e.deltaY < 0 ? 0.05 : -0.05)));
    const pct = Math.round(S.zoom * 100);
    zoomSl.value = pct;
    zoomValEl.textContent = pct + '%';
    constrainPan();
    render();
  }, { passive: false });
}

// ── DOWNLOAD ──────────────────────────────────────────────────
function download() {
  try {
    const a = document.createElement('a');
    a.download = 'hh-goa-2026-builder-card.png';
    a.href = canvas.toDataURL('image/png', 1.0);
    document.body.appendChild(a);   // required for Firefox / Safari
    a.click();
    document.body.removeChild(a);
    toast('Downloading your card!');
  } catch (err) {
    console.error('Download failed:', err);
    toast('⚠️ Download failed — try a different browser.');
  }
}

// ── SHARE ON X ────────────────────────────────────────────────
const TWEET = `🪪 My HH Goa 2026 Builder Card is ready!\n\nBuilding something wild for Goa 2026 🌊🌴\n\n#FrameInGoa #HHGoa2026`;

function shareX() {
  download();
  navigator.clipboard?.writeText(TWEET).catch(() => { });
  document.getElementById('caption-txt').textContent = TWEET;
  document.getElementById('modal-bg').classList.remove('hidden');
  setTimeout(() => window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(TWEET)}`, '_blank', 'noopener'), 400);
}

function closeModal() {
  document.getElementById('modal-bg').classList.add('hidden');
}

// ── TOAST ─────────────────────────────────────────────────────
let _tt = null;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  if (_tt) clearTimeout(_tt);
  _tt = setTimeout(() => el.classList.remove('show'), 2800);
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
