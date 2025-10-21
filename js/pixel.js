/* =======================================================================
   Pixel-Painter — Fixed Sidebar 960 px & Wheel 320 px
   (완전 통합본 — SVG 업로드 포함, 2025-07-14)
   ======================================================================= */
document.addEventListener('DOMContentLoaded', () => {

  /* ───────── 설정 값 ───────── */
  const WHEEL_SIZE = 320;  // 색상 휠 지름(px)
  const MAX        = 100;  // 보드 최대 행/열
  const STACK      = 30;   // Undo 스택 깊이

  /* ───────── 전역 상태 ───────── */
  let background = '#FFFFFF'; // 현재 보드 배경색 (흰색)

  /* ───────── 공통 유틸 ───────── */
  const toHex = v => v.toString(16).padStart(2, '0');

  function hsv2rgb(h, s, v) {
    s /= 100; v /= 100;
    const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
    let [r, g, b] = [0, 0, 0];
    if (h < 60)       [r, g, b] = [c, x, 0];
    else if (h < 120) [r, g, b] = [x, c, 0];
    else if (h < 180) [r, g, b] = [0, c, x];
    else if (h < 240) [r, g, b] = [0, x, c];
    else if (h < 300) [r, g, b] = [x, 0, c];
    else              [r, g, b] = [c, 0, x];
    return [(r + m) * 255, (g + m) * 255, (b + m) * 255].map(Math.round);
  }

  function rgb2hsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const M = Math.max(r, g, b), m = Math.min(r, g, b), d = M - m;
    let h = 0;
    if (d) {
      switch (M) {
        case r: h = ((g - b) / d) % 6; break;
        case g: h = (b - r) / d + 2;   break;
        default: h = (r - g) / d + 4;
      }
      h *= 60;
    }
    return [(h + 360) % 360, (M ? d / M : 0) * 100, M * 100];
  }

  const rgb2cmyk = (r, g, b) => {
    r /= 255; g /= 255; b /= 255;
    const k = 1 - Math.max(r, g, b);
    if (k === 1) return [0, 0, 0, 100];
    return [
      (1 - r - k) / (1 - k) * 100,
      (1 - g - k) / (1 - k) * 100,
      (1 - b - k) / (1 - k) * 100,
      k * 100
    ];
  };

  const hex2rgb = h => [
    parseInt(h.substr(1, 2), 16),
    parseInt(h.substr(3, 2), 16),
    parseInt(h.substr(5, 2), 16)
  ];

  const cvPt = (e, c) => {
    const r = c.getBoundingClientRect();
    return [
      (e.clientX - r.left) * c.width / r.width,
      (e.clientY - r.top)  * c.height / r.height
    ];
  };

  /* ───────── 색상 피커 ───────── */
  let H = 0, S = 100, V = 100;
  const curHex = () => `#${hsv2rgb(H, S, V).map(toHex).join('').toUpperCase()}`;

  const wheel = document.getElementById('wheelCanvas');
  const ctx   = wheel.getContext('2d');
  let R, innerR, ringW, ringMid, ringTol;

  /* (1) 좌표 변환 */
  function svToPoint(S, V) {
    let px = R - innerR + (S / 100) * 2 * innerR,
        py = R + innerR - (V / 100) * 2 * innerR,
        dx = px - R, dy = py - R;
    const d2 = dx * dx + dy * dy;
    if (d2 > innerR * innerR) {
      const k = innerR / Math.sqrt(d2);
      dx *= k; dy *= k; px = R + dx; py = R + dy;
    }
    return [px, py];
  }

  function pointToSV(px, py) {
    let dx = px - R, dy = py - R;
    const dist = Math.hypot(dx, dy);
    if (dist > innerR) {
      const k = innerR / dist;
      dx *= k; dy *= k; px = R + dx; py = R + dy;
    }
    const s = ((px - (R - innerR)) / (2 * innerR)) * 100;
    const v = (1 - (py - (R - innerR)) / (2 * innerR)) * 100;
    return [Math.max(0, Math.min(100, s)), Math.max(0, Math.min(100, v))];
  }

  /* (2) 휠 렌더 */
  function drawWheel() {
    ctx.clearRect(0, 0, wheel.width, wheel.height);
    R = wheel.width / 2; ringW = R * 0.144; innerR = R * 0.75; ringMid = R - ringW / 2; ringTol = ringW * 0.6;

    for (let a = 0; a < 360; a++) {
      const rad = (a - 90) * Math.PI / 180;
      ctx.beginPath();
      ctx.lineWidth = ringW;
      ctx.strokeStyle = `hsl(${a},100%,50%)`;
      ctx.arc(R, R, ringMid, rad, rad + Math.PI / 180);
      ctx.stroke();
    }

    const clip = new Path2D();
    clip.arc(R, R, innerR, 0, Math.PI * 2);
    ctx.save();
    ctx.clip(clip);

    const g1 = ctx.createLinearGradient(R - innerR, R, R + innerR, R);
    g1.addColorStop(0, '#fff');
    g1.addColorStop(1, `hsl(${H},100%,50%)`);
    ctx.fillStyle = g1;
    ctx.fillRect(R - innerR, R - innerR, innerR * 2, innerR * 2);

    const g2 = ctx.createLinearGradient(R, R - innerR, R, R + innerR);
    g2.addColorStop(0, 'rgba(0,0,0,0)');
    g2.addColorStop(1, '#000');
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = g2;
    ctx.fillRect(R - innerR, R - innerR, innerR * 2, innerR * 2);
    ctx.restore();

    ctx.lineWidth = 1.2; ctx.strokeStyle = '#fff';
    ctx.beginPath(); ctx.arc(R, R, innerR, 0, Math.PI * 2); ctx.stroke();

    const dotR = Math.max(3, ringW * 0.35), hueRad = (H - 90) * Math.PI / 180;
    ctx.lineWidth = 1; ctx.strokeStyle = '#000'; ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(R + ringMid * Math.cos(hueRad), R + ringMid * Math.sin(hueRad), dotR, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();

    const [svx, svy] = svToPoint(S, V);
    ctx.beginPath(); ctx.arc(svx, svy, dotR, 0, Math.PI * 2);
    ctx.fillStyle = curHex(); ctx.fill(); ctx.stroke();
  }

  function resizePicker() {
    wheel.width = wheel.height = WHEEL_SIZE;
    drawWheel(); syncUI(); commit();
  }

  /* (3) 휠 드래그 */
  let activeTarget = null;

  function handlePointer(ev) {
    if (!activeTarget) return;
    const [x, y] = cvPt(ev, wheel);
    if (activeTarget === 'ring') {
      H = (Math.atan2(y - R, x - R) * 180 / Math.PI + 450) % 360;
    } else {
      [S, V] = pointToSV(x, y);
    }
    drawWheel(); syncUI();
  }

  wheel.addEventListener('pointerdown', e => {
    const [x, y] = cvPt(e, wheel), dist = Math.hypot(x - R, y - R);
    activeTarget = Math.abs(dist - ringMid) < ringTol ? 'ring' : dist <= innerR ? 'inner' : null;
    if (activeTarget) {
      wheel.setPointerCapture(e.pointerId);
      handlePointer(e);
    }
  });
  wheel.addEventListener('pointermove', handlePointer);
  ['pointerup', 'pointercancel'].forEach(t => wheel.addEventListener(t, e => {
    if (activeTarget) {
      activeTarget = null;
      wheel.releasePointerCapture(e.pointerId);
      commit();
    }
  }));

  /* (4) HSV/RGB/CMYK ↔ 입력 */
  const hF = hVal, sF = sVal, vF = vVal,
        rF = rVal, gF = gVal, bF = blVal,
        cF = cVal, mF = mVal, yF = yVal, kF = kVal,
        hexF = hexVal, curBox = curCol;

  function syncUI() {
    [hF.value, sF.value, vF.value] = [H, S, V].map(Math.round);
    const [r, g, b] = hsv2rgb(H, S, V);
    [rF.value, gF.value, bF.value] = [r, g, b];
    const [c, m, y, k] = rgb2cmyk(r, g, b);
    [cF.value, mF.value, yF.value, kF.value] = [c, m, y, k].map(v => v.toFixed(1));
    curBox.style.background = curHex(); hexF.value = curHex();
  }

  function commit() {
    curBox.style.background = curHex();
    hexF.value = curHex();
  }

  [hF, sF, vF, rF, gF, bF, cF, mF, yF, kF, hexF].forEach(inp =>
    inp.addEventListener('change', () => {
      if (inp === hexF && /^#[0-9a-fA-F]{6}$/.test(hexF.value)) {
        [H, S, V] = rgb2hsv(...hex2rgb(hexF.value));
      } else if ([rF, gF, bF].includes(inp)) {
        [H, S, V] = rgb2hsv(+rF.value || 0, +gF.value || 0, +bF.value || 0);
      } else if ([cF, mF, yF, kF].includes(inp)) {
        const C = +cF.value / 100, M = +mF.value / 100, Y = +yF.value / 100, K = +kF.value / 100;
        const r = (1 - Math.min(1, C * (1 - K) + K)) * 255,
              g = (1 - Math.min(1, M * (1 - K) + K)) * 255,
              b = (1 - Math.min(1, Y * (1 - K) + K)) * 255;
        [H, S, V] = rgb2hsv(r, g, b);
      } else {
        H = +hF.value || H; S = +sF.value || S; V = +vF.value || V;
      }
      H = Math.max(0, Math.min(360, H));
      S = Math.max(0, Math.min(100, S));
      V = Math.max(0, Math.min(100, V));
      drawWheel(); syncUI(); commit();
    })
  );

  /* (5) 기본 팔레트 */
  document.getElementById('basePalette').addEventListener('click', e => {
    const sw = e.target.closest('.swatch'); if (!sw) return;
    [H, S, V] = rgb2hsv(...hex2rgb(sw.dataset.col));
    drawWheel(); syncUI(); commit();
  });

  /* ───────── 커서 클래스 ───────── */
  const BODY = document.body;
  const CUR_CLASSES = ['cursor-brush', 'cursor-bucket', 'cursor-pick', 'cursor-eraser'];
  function setCursor(cls) { BODY.classList.remove(...CUR_CLASSES); BODY.classList.add(cls); }
  setCursor('cursor-brush');

  /* ───────── 픽셀 보드 ───────── */
  let cell = 10, cols = 50, rows = 50, grid = [], undo = [], redo = [],
      zoom = 1, MIN_ZOOM = 1, MAX_ZOOM = 8;

  const bd   = document.getElementById('pixelCanvas');
  const bCtx = bd.getContext('2d', { alpha: false });

  function initGrid() { grid = Array.from({ length: rows }, () => Array(cols).fill(null)); }
  function push() {
    undo.push(grid.map(r => [...r]));
    if (undo.length > STACK) undo.shift();
    redo.length = 0;
  }

  let tool = 'brush', symMode = 'none', down = false;

  function symCoords(r, c) {
    const list = [[r, c]], rm = rows - 1, cm = cols - 1;
    const add = (rr, cc) => {
      if (rr >= 0 && cc >= 0 && rr < rows && cc < cols && !list.some(([a, b]) => a === rr && b === cc)) {
        list.push([rr, cc]);
      }
    };
    switch (symMode) {
      case 'v2':     add(r, cm - c); break;
      case 'h2':     add(rm - r, c); break;
      case 'cross4': add(r, cm - c); add(rm - r, c); add(rm - r, cm - c); break;
      case 'x4':     add(c, r); add(rm - c, cm - r); add(cm - r, rm - c); break;
      case 'eight':
        [[r, cm - c], [rm - r, c], [rm - r, cm - c], [c, r], [c, cm - r], [rm - c, r], [rm - c, cm - r], [cm - r, rm - c]]
          .forEach(([a, b]) => add(a, b));
        break;
    }
    return list;
  }

  function drawGuides() {
    if (symMode === 'none') return;
    bCtx.save();
    bCtx.strokeStyle = 'rgba(255,0,0,.9)';
    bCtx.lineWidth = 2;
    const midX = bd.width / 2, midY = bd.height / 2;
    bCtx.beginPath();
    if (['v2', 'cross4', 'eight'].includes(symMode)) { bCtx.moveTo(midX, 0); bCtx.lineTo(midX, bd.height); }
    if (['h2', 'cross4', 'eight'].includes(symMode)) { bCtx.moveTo(0, midY); bCtx.lineTo(bd.width, midY); }
    if (['x4', 'eight'].includes(symMode)) {
      bCtx.moveTo(0, 0); bCtx.lineTo(bd.width, bd.height);
      bCtx.moveTo(bd.width, 0); bCtx.lineTo(0, bd.height);
    }
    bCtx.stroke();
    bCtx.restore();
  }

  function redrawBoard(gridLines = true) {
    const bw = document.getElementById('boardWrap').clientWidth;
    const bh = document.getElementById('boardWrap').clientHeight;
    cell = Math.floor(Math.min(bw / cols, bh / rows));
    bd.width = cell * cols; bd.height = cell * rows;

    bCtx.fillStyle = background;
    bCtx.fillRect(0, 0, bd.width, bd.height);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (grid[r][c] !== null) {
          bCtx.fillStyle = grid[r][c];
          bCtx.fillRect(c * cell, r * cell, cell, cell);
        }
      }
    }

    if (gridLines) {
      bCtx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--grid') || '#000';
      bCtx.beginPath();
      for (let i = 0; i <= cols; i++) { bCtx.moveTo(i * cell + .5, 0); bCtx.lineTo(i * cell + .5, bd.height); }
      for (let j = 0; j <= rows; j++) { bCtx.moveTo(0, j * cell + .5); bCtx.lineTo(bd.width, j * cell + .5); }
      bCtx.stroke();
    }
    drawGuides();
    applyZoom();
  }

  function applyZoom() {
    const z = document.getElementById('zoomContainer');
    z.style.width  = (bd.width  * zoom) + 'px';
    z.style.height = (bd.height * zoom) + 'px';
    bd.style.transformOrigin = 'top left';
    bd.style.transform = `scale(${zoom})`;
  }

  /* Flood-fill */
  function flood(sr, sc, t, n) {
    if (t === n) return;
    const q = [[sr, sc]], d = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    while (q.length) {
      const [r, c] = q.pop();
      if (r < 0 || c < 0 || r >= rows || c >= cols || grid[r][c] !== t) continue;
      grid[r][c] = n;
      d.forEach(([dr, dc]) => q.push([r + dr, c + dc]));
    }
  }

  const rc = ev => {
    const [pX, pY] = cvPt(ev, bd);
    return [Math.floor(pY / cell), Math.floor(pX / cell)];
  };

  let lastRC = null, raf = null;

  function paint(e) {
    const [r, c] = rc(e);
    if (r < 0 || c < 0 || r >= rows || c >= cols) return;
    if (lastRC && lastRC[0] === r && lastRC[1] === c) return;
    lastRC = [r, c];

    const cells = (tool === 'brush' || tool === 'eraser') ? symCoords(r, c) : [[r, c]];
    cells.forEach(([rr, cc]) => {
      switch (tool) {
        case 'brush':  grid[rr][cc] = curHex(); break;
        case 'eraser': grid[rr][cc] = null;     break;
        case 'bucket': flood(rr, cc, grid[rr][cc], curHex()); break;
        case 'picker': {
          const picked = grid[rr][cc] ?? background;
          [H, S, V] = rgb2hsv(...hex2rgb(picked));
          drawWheel(); syncUI(); commit();
          lastRC = null; return;
        }
      }
    });

    if (!raf) {
      raf = requestAnimationFrame(() => { raf = null; redrawBoard(); });
    }
  }

  /* 보드 이벤트 */
  bd.addEventListener('mousedown', e => { down = true; push(); paint(e); });
  bd.addEventListener('mousemove', e => { if (down && (tool === 'brush' || tool === 'eraser')) paint(e); });
  window.addEventListener('mouseup',  () => { down = false; lastRC = null; });

  /* 툴바 & 커서 */
  document.getElementById('toolBar').addEventListener('click', e => {
    const btn = e.target.closest('.btn'); if (!btn) return;
    const t = btn.dataset.tool;
    if (t === 'clear') { clearAll(); tool = 'brush'; } else tool = t;
    document.querySelectorAll('#toolBar .btn')
      .forEach(b => b.classList.toggle('active', b === btn || (t === 'clear' && b.dataset.tool === 'brush')));
    setCursor({ brush: 'cursor-brush', bucket: 'cursor-bucket', picker: 'cursor-pick', eraser: 'cursor-eraser' }[tool]);
  });

  /* 대칭 / 줌 */
  document.getElementById('symBar').addEventListener('click', e => {
    const b = e.target.closest('.btn'); if (!b) return;
    symMode = b.dataset.sym;
    document.querySelectorAll('#symBar .btn').forEach(btn => btn.classList.toggle('active', btn === b));
    redrawBoard();
  });

  document.getElementById('zoomBar').addEventListener('click', e => {
    const b = e.target.closest('.btn'); if (!b) return;
    if (b.dataset.zoom === 'in'  && zoom < MAX_ZOOM) zoom++;
    if (b.dataset.zoom === 'out' && zoom > MIN_ZOOM) zoom--;
    applyZoom();
  });

  /* 배경 전환 */
  document.getElementById('bgBar').addEventListener('click', e => {
    const btn = e.target.closest('.btn'); if (!btn) return;
    const newCol = btn.dataset.bg; if (newCol === background) return;
    background = newCol;
    document.documentElement.style.setProperty('--grid', background === '#000000' ? '#ffffff' : '#000000');
    document.querySelectorAll('#bgBar .btn').forEach(b => b.classList.toggle('active', b === btn));
    redrawBoard();
  });

  /* Undo / Redo */
  document.addEventListener('keydown', e => {
    if (e.key === 'z' && e.ctrlKey && !e.shiftKey) {
      e.preventDefault();
      if (undo.length) { redo.push(grid); grid = undo.pop(); redrawBoard(); }
    }
    if (e.key.toLowerCase() === 'z' && e.ctrlKey && e.shiftKey) {
      e.preventDefault();
      if (redo.length) { undo.push(grid); grid = redo.pop(); redrawBoard(); }
    }
  });

  /* 전체 Clear */
  function clearAll() {
    if (confirm('전체 보드를 지울까요?')) { push(); initGrid(); redrawBoard(); }
  }

  /* 사이즈 변경 */
  ['sizeX', 'sizeY'].forEach(id => document.getElementById(id).addEventListener('change', () => {
    const sizeX = document.getElementById('sizeX'), sizeY = document.getElementById('sizeY');
    const newCols = Math.min(Math.max(+sizeX.value || cols, 1), MAX),
          newRows = Math.min(Math.max(+sizeY.value || rows, 1), MAX);
    if (newCols === cols && newRows === rows) { sizeX.value = cols; sizeY.value = rows; return; }

    push();
    const colShift = Math.floor((newCols - cols) / 2), rowShift = Math.floor((newRows - rows) / 2);
    const newGrid = Array.from({ length: newRows }, (_, r) =>
      Array.from({ length: newCols }, (_, c) => {
        const oR = r - rowShift, oC = c - colShift;
        return (oR >= 0 && oR < rows && oC >= 0 && oC < cols) ? grid[oR][oC] : null;
      })
    );
    cols = newCols; rows = newRows; grid = newGrid;
    sizeX.value = cols; sizeY.value = rows;
    redrawBoard();
  }));

  /* ------------ 이미지 업로드/돋보기/다운로드 ------------- */
  const uploadBox = document.getElementById('uploadBox'),
        imgInput  = document.getElementById('imgUp'),
        imgTag    = document.getElementById('origImg'),
        // place-txt(비표준 하이픈) 사용 버전 유지
        placeTxt  = document.querySelector('.place-txt'),
        replBtn   = document.getElementById('imgReplace');

  uploadBox.addEventListener('click', () => { if (!uploadBox.classList.contains('has-img')) imgInput.click(); });
  replBtn.addEventListener('click', e => { e.stopPropagation(); imgInput.click(); });

  imgInput.addEventListener('change', e => {
    const f = e.target.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = ev => {
      imgTag.src = ev.target.result;
      imgTag.style.display = 'block';
      if (placeTxt) placeTxt.style.display = 'none';
      uploadBox.classList.add('has-img');
    };
    rd.readAsDataURL(f);
  });

  const imgCanvas = document.createElement('canvas'),
        imgCtx    = imgCanvas.getContext('2d', { willReadFrequently: true });

  imgTag.addEventListener('load', () => {
    imgCanvas.width  = imgTag.naturalWidth;
    imgCanvas.height = imgTag.naturalHeight;
    imgCtx.drawImage(imgTag, 0, 0);
  });

  imgTag.addEventListener('click', e => {
    if (tool !== 'picker') return;
    const rect = imgTag.getBoundingClientRect(),
          x = Math.floor((e.clientX - rect.left) * imgTag.naturalWidth  / rect.width),
          y = Math.floor((e.clientY - rect.top)  * imgTag.naturalHeight / rect.height),
          [r, g, b] = imgCtx.getImageData(x, y, 1, 1).data;
    [H, S, V] = rgb2hsv(r, g, b); drawWheel(); syncUI(); commit();
  });

  const mag      = document.getElementById('magnifier'),
        magCtx   = mag.getContext('2d'),
        MAG_SIZE = mag.width, ZOOM = 6;

  function showMagnifier(e) {
    if (tool !== 'picker') { mag.style.display = 'none'; return; }
    mag.style.left = `${e.clientX + 20}px`;
    mag.style.top  = `${e.clientY + 20}px`;
    mag.style.display = 'block';

    const rect = imgTag.getBoundingClientRect(),
          x = Math.floor((e.clientX - rect.left) * imgTag.naturalWidth  / rect.width),
          y = Math.floor((e.clientY - rect.top)  * imgTag.naturalHeight / rect.height),
          src = MAG_SIZE / ZOOM,
          sx = Math.max(0, Math.min(imgTag.naturalWidth  - src, x - src / 2)),
          sy = Math.max(0, Math.min(imgTag.naturalHeight - src, y - src / 2));

    magCtx.imageSmoothingEnabled = false;
    magCtx.clearRect(0, 0, MAG_SIZE, MAG_SIZE);
    magCtx.save();
    magCtx.beginPath();
    magCtx.arc(MAG_SIZE / 2, MAG_SIZE / 2, MAG_SIZE / 2, 0, Math.PI * 2);
    magCtx.clip();
    magCtx.drawImage(imgCanvas, sx, sy, src, src, 0, 0, MAG_SIZE, MAG_SIZE);
    magCtx.restore();

    magCtx.strokeStyle = '#ff0';
    magCtx.beginPath();
    magCtx.moveTo(MAG_SIZE / 2, 0);         magCtx.lineTo(MAG_SIZE / 2, MAG_SIZE);
    magCtx.moveTo(0, MAG_SIZE / 2);         magCtx.lineTo(MAG_SIZE, MAG_SIZE / 2);
    magCtx.stroke();
  }
  imgTag.addEventListener('mousemove', showMagnifier);
  imgTag.addEventListener('mouseleave', () => { mag.style.display = 'none'; });

  /* 다운로드 */
  const ts = () => new Date().toISOString().replace(/[^\d]/g, '').slice(0, 14);

  document.getElementById('dlPNG').addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = bd.toDataURL('image/png');
    a.download = `pixel_${ts()}.png`;
    a.click();
  });

  document.getElementById('dlSVG').addEventListener('click', () => {
    let svg = [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${cols}" height="${rows}" shape-rendering="crispEdges">`
    ];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (grid[r][c] !== null) {
          svg.push(`<rect x="${c}" y="${r}" width="1" height="1" fill="${grid[r][c]}"/>`);
        }
      }
    }
    svg.push('</svg>');
    const blob = new Blob(svg, { type: 'image/svg+xml' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `pixel_${ts()}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  });

  /* ───────── SVG 업로드 기능 ───────── */
  const svgInput = document.getElementById('svgUp'),
        svgBtn   = document.getElementById('svgBtn');

  svgBtn.addEventListener('click', () => svgInput.click());

  svgInput.addEventListener('change', e => {
    const f = e.target.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = ev => importSvg(ev.target.result.trim());
    rd.readAsText(f);
  });

  function importSvg(txt) {
    const doc   = new DOMParser().parseFromString(txt, 'image/svg+xml');
    const rects = [...doc.querySelectorAll('rect, svg\\:rect')];
    if (!rects.length) { alert('유효한 SVG 픽셀 데이터가 없습니다'); return; }

    /* ① 크기 확장 */
    const maxX = Math.max(...rects.map(r => +r.getAttribute('x')));
    const maxY = Math.max(...rects.map(r => +r.getAttribute('y')));
    if (maxX + 1 > cols || maxY + 1 > rows) {
      cols = maxX + 1; rows = maxY + 1;
      document.getElementById('sizeX').value = cols;
      document.getElementById('sizeY').value = rows;
    }
    initGrid();

    /* ② 색상 채우기 */
    rects.forEach(r => {
      const x = +r.getAttribute('x'),
            y = +r.getAttribute('y'),
            col = (r.getAttribute('fill') || '#000000').toUpperCase();
      if (y < rows && x < cols) grid[y][x] = col;
    });

    /* ③ 갱신 */
    push(); redrawBoard();
  }

  /* ───── 초기화 ───── */
  function init() {
    document.documentElement.style.setProperty('--grid', '#000000');
    initGrid(); resizePicker(); redrawBoard();
  }
  init();

  window.addEventListener('resize', () => { resizePicker(); redrawBoard(); });

}); /* DOMContentLoaded 끝 */
