// js/design.js (Maze 제거 + 도트빈티지 제거 · 통합본 + [클릭으로 재업로드] + [hatchPlus] + [카테고리/도킹] 추가)
(function () {
  /* ============ DOM Ready ============ */
  const ready = (f) =>
    document.readyState === "loading"
      ? document.addEventListener("DOMContentLoaded", f, { once: true })
      : f();

  /* ============ 작은 유틸 ============ */
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const log = (...a) => console.log("[PP-Pro]", ...a);

  /* =========================================================
     1) UI/렌더 공통 설정
     ========================================================= */
  ready(() => {
    /* === 상수 & 유틸 ==================================================== */
    const TWO = Math.PI * 2,
      MAX = 8192,
      minDot = 0.3,
      GR_MIN = 0.3,
      GR_MAX = 0.9,
      GR_OFF = 0.2,
      ST_MIN_R = 0.6,
      ST_MAX_R = 3.2,
      ST_DENS = 0.55,
      EDGE_THICK = 1.4,
      EDGE_NOISE = 1.2;

    const cellSize = (v) => Math.max(3, Math.round(v || 0));
    const thrVal = (v) => Math.round(1 + ((Number(v || 1) - 1) * 179) / 49); // 1~50 → 1~180
    const ts = () => new Date().toISOString().replace(/[^\d]/g, "").slice(0, 14);
    const prng = (i, j) => {
      const t = Math.sin(i * 183.3 + j * 97.7) * 43758.5453;
      return t - Math.floor(t);
    };

    // 슬라이더 채움 CSS 변수 업데이트
    function setRangeFill(el) {
      if (!el) return;
      const min = +el.min || 0;
      const max = +el.max || 100;
      const val = Math.min(Math.max(+el.value || 0, min), max);
      const pct = ((val - min) / (max - min)) * 100;
      el.style.setProperty("--val", pct + "%");
    }

    /* === DOM 안전 탐색 =================================================== */
    const cvs = $("#canvas") || $("canvas.main");
    if (!cvs) {
      console.warn("[PP-Pro] 캔버스 요소(#canvas 또는 canvas.main)를 찾지 못했습니다.");
      return;
    }
    const ctx = cvs.getContext("2d");

    // 오프스크린
    const off = document.createElement("canvas");
    const oCtx = off.getContext("2d");

    // 패널/컨트롤 셋
    const DOM = {
      leftPane: $("#left") || cvs.parentElement || document.body,
      upload: $("#upload") || $('#right input[type="file"]'),
      uploadArea: $("#upload-area"),
      overlayLabel: document.querySelector('label.upload-overlay[for="upload"]') || $("label.upload-overlay"),
      hint: $("#hint"),
      origImg: $("#origImg"),

      // ▼ 기존 그리드 모드바는 사용 중단(카테고리/도킹으로 대체)
      modeBar: $("#modeBar") || $(".mode-toggle"),

      // ▼ 카테고리/도킹
      categoryBar: $("#categoryBar"),
      modeDock: $("#modeDock"),

      sizeR: $("#size"),
      sizeV: $("#sizeVal") || $("#sizeDisp") || $("#sizeValue"),
      thR: $("#th"),
      thV: $("#thDisp") || $("#thVal") || $("#thValue"),

      glyphBox: $("#glyphBox"),
      glyphSet: $("#glyphSet"),

      dotScaleR: $("#dotScale"),
      dotScaleV: $("#dotScaleVal"),
      dotScaleWrap: $("#dotScaleWrap"),

      barCtrl: $("#barCtrl"),
      barMinR: $("#barMin"),
      barMaxR: $("#barMax"),
      barMinV: $("#barMinVal"),
      barMaxV: $("#barMaxVal"),

      flowCtrl: $("#flowCtrl"),
      flowDensityR: $("#flowDensity"),
      flowDensityV: $("#flowDensityVal"),
      flowLengthR: $("#flowLength"),
      flowLengthV: $("#flowLengthVal"),
      flowStrengthR: $("#flowStrength"),
      flowStrengthV: $("#flowStrengthVal"),

      downloadWrap: $("#downloadWrap"),
      btnPNG: $("#downloadPNG"),
      btnSVG: $("#downloadSVG"),
    };

    // (레거시) data-mode 버튼 — 이제는 없을 수 있음
    const MODE_BTNS = $$("[data-mode]");

    /* === 스테이지 스케일링 ============================================= */
    function fitStage() {
      try {
        const cs = getComputedStyle(document.documentElement);
        const BASE_W = parseFloat(cs.getPropertyValue("--base-w")) || 1920;
        const BASE_H = parseFloat(cs.getPropertyValue("--base-h")) || 1080;
        const headerH = 56;
        const vw = window.innerWidth || 1920;
        const vh = Math.max(0, (window.innerHeight || 1080) - headerH);
        const scale = Math.min(vw / BASE_W, vh / BASE_H);
        const clamped = Math.max(0.3, Math.min(scale, 1.25));
        document.documentElement.style.setProperty("--app-scale", String(clamped));
      } catch (e) {}
    }
    fitStage();
    let rAF;
    window.addEventListener(
      "resize",
      () => {
        cancelAnimationFrame(rAF);
        rAF = requestAnimationFrame(fitStage);
      },
      { passive: true }
    );

    /* === 업로드 열기 핸들 ================================================ */
    const openPicker = () => {
      if (!DOM.upload) return;
      try {
        DOM.upload.value = "";
        DOM.upload.click();
      } catch {
        DOM.upload.focus();
      }
    };

    if (DOM.overlayLabel) {
      if (!DOM.overlayLabel.hasAttribute("tabindex")) DOM.overlayLabel.tabIndex = 0;
      DOM.overlayLabel.addEventListener("click", (e) => {
        e.stopPropagation();
      });
      DOM.overlayLabel.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openPicker();
        }
      });
    }
    if (DOM.uploadArea) {
      if (!DOM.uploadArea.hasAttribute("tabindex")) DOM.uploadArea.tabIndex = 0;
      DOM.uploadArea.addEventListener("click", (e) => {
        if (e.target && e.target.closest && e.target.closest("label.upload-overlay")) return;
        openPicker();
      });
      DOM.uploadArea.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openPicker();
        }
      });
    }

    /* === [ADD] 클릭-교체 업로드 헬퍼 ====================================== */
    function triggerReplaceUpload() {
      if (!DOM.upload) return;
      try {
        DOM.upload.value = "";
        DOM.upload.click();
      } catch {
        DOM.upload.focus();
      }
    }
    function attachReplaceClick(targetEl) {
      if (!targetEl || targetEl.dataset.replaceBound === "1") return;
      targetEl.dataset.replaceBound = "1";
      targetEl.classList.add("click-to-replace");
      if (!targetEl.hasAttribute("tabindex")) targetEl.tabIndex = 0;
      targetEl.setAttribute("aria-label", "이미지 교체");

      const onActivate = (e) => {
        e.stopPropagation();
        triggerReplaceUpload();
      };
      targetEl.addEventListener("click", onActivate);
      targetEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onActivate(e);
        }
      });
    }
    /* =================================================================== */

    /* === 상태값 ========================================================= */
    let mode = "bw";
    let img = null;
    let raf = 0;
    let fileBase = "";
    let pxData = null;

    /* === 초기 UI값 & visible =========================================== */
    if (DOM.downloadWrap) DOM.downloadWrap.style.display = "flex";

    if (DOM.sizeR) {
      DOM.sizeR.value = DOM.sizeR.value || 3;
      if (DOM.sizeV) DOM.sizeV.textContent = DOM.sizeR.value;
      setRangeFill(DOM.sizeR);
    }
    if (DOM.thR) {
      DOM.thR.value = DOM.thR.value || 24;
      if (DOM.thV) DOM.thV.textContent = DOM.thR.value;
      setRangeFill(DOM.thR);
    }
    if (DOM.dotScaleR) {
      DOM.dotScaleR.value = DOM.dotScaleR.value || 100;
      if (DOM.dotScaleV) DOM.dotScaleV.textContent = DOM.dotScaleR.value;
      setRangeFill(DOM.dotScaleR);
    }

    if (DOM.barMinR) {
      DOM.barMinR.value = DOM.barMinR.value || "0";
      if (DOM.barMinV) DOM.barMinV.textContent = DOM.barMinR.value;
      setRangeFill(DOM.barMinR);
    }
    if (DOM.barMaxR) {
      DOM.barMaxR.value = DOM.barMaxR.value || "98";
      if (DOM.barMaxV) DOM.barMaxV.textContent = DOM.barMaxR.value;
      setRangeFill(DOM.barMaxR);
    }

    if (DOM.flowDensityR) {
      DOM.flowDensityR.value = DOM.flowDensityR.value || "10";
      if (DOM.flowDensityV) DOM.flowDensityV.textContent = DOM.flowDensityR.value;
      setRangeFill(DOM.flowDensityR);
    }
    if (DOM.flowLengthR) {
      DOM.flowLengthR.value = DOM.flowLengthR.value || "20";
      if (DOM.flowLengthV) DOM.flowLengthV.textContent = DOM.flowLengthR.value;
      setRangeFill(DOM.flowLengthR);
    }
    if (DOM.flowStrengthR) {
      DOM.flowStrengthR.value = DOM.flowStrengthR.value || "1.0";
      if (DOM.flowStrengthV) DOM.flowStrengthV.textContent = DOM.flowStrengthR.value;
      setRangeFill(DOM.flowStrengthR);
    }

    if (DOM.btnPNG) DOM.btnPNG.disabled = true;
    if (DOM.btnSVG) DOM.btnSVG.disabled = true;

    document.body.classList.toggle("mode-color", mode === "color");
    document.body.classList.toggle("mode-ascii", mode === "ascii");

    /* === 이벤트 바인딩: 슬라이더 ======================================= */
    const onSlider = (el, cb) => {
      if (!el) return;
      el.addEventListener("input", () => {
        setRangeFill(el);
        cb && cb(el.value);
      });
      el.addEventListener("change", () => setRangeFill(el));
    };

    onSlider(DOM.sizeR, (v) => {
      if (DOM.sizeV) DOM.sizeV.textContent = v;
      draw();
    });
    onSlider(DOM.thR, (v) => {
      if (DOM.thV) DOM.thV.textContent = v;
      draw();
    });
    onSlider(DOM.dotScaleR, (v) => {
      if (DOM.dotScaleV) DOM.dotScaleV.textContent = v;
      if (
        mode === "dotPro" ||
        mode === "dotProColor" ||
        mode === "halftoneSpiral" ||
        mode === "halftoneSpiralColor"
      ) {
        draw();
      }
    });
    onSlider(DOM.barMinR, (v) => {
      if (DOM.barMinV) DOM.barMinV.textContent = v;
      if (mode === "barVert" || mode === "barHori") draw();
    });
    onSlider(DOM.barMaxR, (v) => {
      if (DOM.barMaxV) DOM.barMaxV.textContent = v;
      if (mode === "barVert" || mode === "barHori") draw();
    });

    onSlider(DOM.flowDensityR, (v) => {
      if (DOM.flowDensityV) DOM.flowDensityV.textContent = v;
      if (mode === "flowField") draw();
    });
    onSlider(DOM.flowLengthR, (v) => {
      if (DOM.flowLengthV) DOM.flowLengthV.textContent = v;
      if (mode === "flowField") draw();
    });
    onSlider(DOM.flowStrengthR, (v) => {
      if (DOM.flowStrengthV) DOM.flowStrengthV.textContent = v;
      if (mode === "flowField") draw();
    });

    if (DOM.glyphSet) {
      DOM.glyphSet.addEventListener("input", () => {
        if (mode === "ascii") draw();
      });
    }

    /* === (레거시) 개별 모드 버튼 핸들러: 있으면 작동, 없으면 무시 ======= */
    function setActiveModeButton(targetBtn) {
      MODE_BTNS.forEach((b) => b.classList.toggle("active", b === targetBtn));
    }
    if (DOM.modeBar) {
      DOM.modeBar.addEventListener("click", (e) => {
        const btn = e.target.closest ? e.target.closest("[data-mode]") : null;
        if (!btn) return;
        mode = btn.dataset.mode || mode;
        setActiveModeButton(btn);
        document.body.classList.toggle("mode-color", mode === "color");
        document.body.classList.toggle("mode-ascii", mode === "ascii");
        toggleCtrls();
        draw();
      });
    }
    MODE_BTNS.forEach((btn) => {
      btn.addEventListener("click", () => {
        mode = btn.dataset.mode || mode;
        setActiveModeButton(btn);
        document.body.classList.toggle("mode-color", mode === "color");
        document.body.classList.toggle("mode-ascii", mode === "ascii");
        toggleCtrls();
        draw();
      });
    });

    /* === 파일 업로드 ==================================================== */
    if (DOM.upload) {
      DOM.upload.addEventListener("change", (e) => {
        const f = e.target.files && e.target.files[0];
        if (!f) return;
        fileBase = (f.name || "image").replace(/\.[^.]+$/, "");
        const fr = new FileReader();
        fr.onload = () => {
          img = new Image();
          img.onload = () => {
            setupCanvas();
            draw();
            cvs.style.display = "block";
            if (DOM.hint) DOM.hint.style.display = "none";
            if (DOM.origImg) DOM.origImg.src = fr.result;
            if (DOM.btnPNG) DOM.btnPNG.disabled = false;
            if (DOM.btnSVG) DOM.btnSVG.disabled = false;
            if (DOM.leftPane) DOM.leftPane.classList.add("uploaded");
            if (DOM.downloadWrap) DOM.downloadWrap.style.display = "flex";

            // 업로드 완료 후: 캔버스 클릭으로 재업로드
            attachReplaceClick(cvs);
            DOM.upload.value = "";
          };
          img.src = fr.result;
        };
        fr.readAsDataURL(f);
      });
    } else {
      console.warn("[PP-Pro] 파일 input(#upload)가 없습니다. 업로드 기능은 비활성화됩니다.");
    }

    /* === 모드별 컨트롤 토글 ============================================ */
    function toggleCtrls() {
      const showThr = mode !== "color";
      if (DOM.thR) {
        DOM.thR.style.display = showThr ? "block" : "none";
        if (DOM.thV && DOM.thV.parentElement) {
          DOM.thV.parentElement.style.display = showThr ? "" : "none";
        }
        DOM.thR.disabled = !showThr;
        DOM.thR.tabIndex = showThr ? 0 : -1;
        if (!showThr) DOM.thR.blur();
      }

      const showGlyph = mode === "ascii";
      if (DOM.glyphBox) DOM.glyphBox.style.display = showGlyph ? "block" : "none";
      if (DOM.glyphSet) {
        DOM.glyphSet.disabled = !showGlyph;
        DOM.glyphSet.tabIndex = showGlyph ? 0 : -1;
      }

      const showDotScale =
        mode === "dotPro" ||
        mode === "dotProColor" ||
        mode === "halftoneSpiral" ||
        mode === "halftoneSpiralColor";
      if (DOM.dotScaleWrap) DOM.dotScaleWrap.style.display = showDotScale ? "block" : "none";
      if (DOM.dotScaleR) {
        DOM.dotScaleR.disabled = !showDotScale;
        DOM.dotScaleR.tabIndex = showDotScale ? 0 : -1;
      }

      const showBar = mode === "barVert" || mode === "barHori";
      if (DOM.barCtrl) DOM.barCtrl.style.display = showBar ? "block" : "none";
      if (DOM.barMinR) DOM.barMinR.disabled = !showBar;
      if (DOM.barMaxR) DOM.barMaxR.disabled = !showBar;

      const showFlow = mode === "flowField";
      if (DOM.flowCtrl) DOM.flowCtrl.style.display = showFlow ? "block" : "none";
      if (DOM.flowDensityR) DOM.flowDensityR.disabled = !showFlow;
      if (DOM.flowLengthR) DOM.flowLengthR.disabled = !showFlow;
      if (DOM.flowStrengthR) DOM.flowStrengthR.disabled = !showFlow;
    }

    /* === 캔버스 세팅 ==================================================== */
    function setupCanvas() {
      if (!img) return;
      let w = img.naturalWidth || img.width || 0;
      let h = img.naturalHeight || img.height || 0;
      if (!w || !h) return;
      if (Math.max(w, h) > MAX) {
        const s = MAX / Math.max(w, h);
        w = (w * s) | 0;
        h = (h * s) | 0;
      }
      const leftW = (DOM.leftPane && DOM.leftPane.clientWidth) || window.innerWidth || w;
      const leftH = (DOM.leftPane && DOM.leftPane.clientHeight) || window.innerHeight || h;
      const sc = Math.min((leftW * 0.8) / w, (leftH * 0.8) / h, 1);
      [cvs, off].forEach((c) => {
        c.width = w;
        c.height = h;
      });
      cvs.style.width = w * sc + "px";
      cvs.style.height = h * sc + "px";
      oCtx.clearRect(0, 0, w, h);
      oCtx.drawImage(img, 0, 0, w, h);
      pxData = oCtx.getImageData(0, 0, w, h).data;
    }

    /* === 렌더 스케줄러 ================================================== */
    const draw = () => {
      if (!img) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(render);
    };

    function render() {
      off.width = off.width; // clear
      oCtx.drawImage(img, 0, 0, off.width, off.height);
      pxData = oCtx.getImageData(0, 0, off.width, off.height).data;

      switch (mode) {
        case "stipple":     return drawStipple();
        case "ascii":       return drawASCII();
        case "crossStitch": return drawCrossStitch();
        case "flowField":   return drawFlowField();
        case "halftoneSpiral":       return drawHalftoneSpiral();
        case "halftoneSpiralColor":  return drawHalftoneSpiralColor();
        default:            return drawRectModes(); // bw/color/dot/dotPro/dotProColor/grunge/hatch*/barVert/barHori
      }
    }

    /* === 보조: 픽셀 휘도 얻기 (0~1) =================================== */
    function lumAt(x, y) {
      const X = Math.max(0, Math.min(off.width - 1, x | 0));
      const Y = Math.max(0, Math.min(off.height - 1, y | 0));
      const i = (Y * off.width + X) * 4;
      const R = pxData[i], G = pxData[i + 1], B = pxData[i + 2];
      return (0.2126 * R + 0.7152 * G + 0.0722 * B) / 255;
    }

    /* === 1) 사각형 기반 모드 =========================================== */
    function drawRectModes() {
      const cell = cellSize(+((DOM.sizeR && DOM.sizeR.value) || 3));
      const cH = cell / 2;
      const thr = thrVal(+((DOM.thR && DOM.thR.value) || 24));
      ctx.clearRect(0, 0, cvs.width, cvs.height);

      for (let y = 0; y < cvs.height; y += cell) {
        let path = new Path2D(), needLine = false;

        for (let x = 0; x < cvs.width; x += cell) {
          const i =
            (Math.min(y, off.height - 1) * off.width + Math.min(x, off.width - 1)) * 4,
            R = pxData[i],
            G = pxData[i + 1],
            B = pxData[i + 2],
            white = R >= thr && G >= thr && B >= thr;

          const pureWhite = (R === 255 && G === 255 && B === 255);

          if (mode === "color") {
            ctx.fillStyle = `rgb(${R},${G},${B})`;
            ctx.fillRect(x, y, cell, cell);
            continue;
          }
          if (!(mode === "dotPro" || mode === "dotProColor" || mode === "barVert" || mode === "barHori") && white) continue;

          switch (mode) {
            case "bw":
              ctx.fillStyle = "#000";
              ctx.fillRect(x, y, cell, cell);
              break;

            case "dot":
              ctx.fillStyle = "#000";
              ctx.beginPath();
              ctx.arc(x + cH, y + cH, Math.max(cH * 0.7, minDot), 0, TWO);
              ctx.fill();
              break;

            case "dotPro":
            case "dotProColor": {
              const bright = (R + G + B) / 765;
              const pivot = thr / 255;
              const denom = Math.max(1e-6, 1 - pivot);
              let k = (1 - bright) / denom;
              k = Math.min(1, Math.max(0, k));
              const rMin = Math.max(minDot, cH * 0.18);
              const rMax = cH * 0.98;
              let r = rMin + (rMax - rMin) * k;

              const scale = DOM.dotScaleR ? +DOM.dotScaleR.value / 100 : 1;
              r *= scale;
              r = Math.min(r, cH * 1.05);

              ctx.fillStyle = mode === "dotProColor" ? `rgb(${R},${G},${B})` : "#000";
              ctx.beginPath();
              ctx.arc(x + cH, y + cH, r, 0, TWO);
              ctx.fill();
              break;
            }

            case "barVert": {
              if (pureWhite) break;
              const lum = (0.2126 * R + 0.7152 * G + 0.0722 * B) / 255;
              const pivot = thr / 255;
              if (lum >= pivot) break;

              const pctMin = DOM.barMinR ? +DOM.barMinR.value : 0;
              const pctMax = DOM.barMaxR ? +DOM.barMaxR.value : 98;
              const pMin = Math.min(pctMin, pctMax);
              const pMax = Math.max(pctMin, pctMax);

              const k = Math.max(0, Math.min(1, 1 - lum));
              const minW = (pMin / 100) * cell;
              const maxW = (pMax / 100) * cell;
              const barW = minW + (maxW - minW) * k;
              if (barW <= 0.5) break;

              const barH = Math.max(1, Math.round(cell * 0.95));
              const cx = x + Math.round((cell - barW) / 2);
              const cy = y + Math.round((cell - barH) / 2);

              ctx.fillStyle = "#000";
              ctx.fillRect(cx, cy, barW, barH);
              break;
            }

            case "barHori": {
              if (pureWhite) break;
              const lum = (0.2126 * R + 0.7152 * G + 0.0722 * B) / 255;
              const pivot = thr / 255;
              if (lum >= pivot) break;

              const pctMin = DOM.barMinR ? +DOM.barMinR.value : 0;
              const pctMax = DOM.barMaxR ? +DOM.barMaxR.value : 98;
              const pMin = Math.min(pctMin, pctMax);
              const pMax = Math.max(pctMin, pctMax);

              const k = Math.max(0, Math.min(1, 1 - lum));
              const minH = (pMin / 100) * cell;
              const maxH = (pMax / 100) * cell;
              const barH = Math.max(1, minH + (maxH - minH) * k);
              const barW = Math.max(1, Math.round(cell * 0.95));

              const cx = x + Math.round((cell - barW) / 2);
              const cy = y + Math.round((cell - barH) / 2);

              ctx.fillStyle = "#000";
              ctx.fillRect(cx, cy, barW, barH);
              break;
            }

            case "grunge": {
              const u = Math.floor(x / cell),
                v = Math.floor(y / cell),
                r1 = prng(u, v),
                r2 = prng(u + 7, v + 13),
                r3 = prng(u + 19, v + 5),
                rad = Math.max(cH * (GR_MIN + (GR_MAX - GR_MIN) * r1), minDot),
                dist = cell * GR_OFF * r2,
                ang = r3 * TWO,
                cx = x + cH + Math.cos(ang) * dist,
                cy = y + cH + Math.sin(ang) * dist;
              ctx.fillStyle = "#000";
              ctx.beginPath();
              ctx.arc(cx, cy, rad, 0, TWO);
              ctx.fill();
              break;
            }

            case "hatchSlash":
              path.moveTo(x, y + cell);
              path.lineTo(x + cell, y);
              needLine = true;
              break;
            case "hatchBack":
              path.moveTo(x, y);
              path.lineTo(x + cell, y + cell);
              needLine = true;
              break;
            case "hatchHori":
              path.moveTo(x, y + cH);
              path.lineTo(x + cell, y + cH);
              needLine = true;
              break;
            case "hatchVert":
              path.moveTo(x + cH, y);
              path.lineTo(x + cH, y + cell);
              needLine = true;
              break;

            // ★ 추가: hatchPlus (가로+세로 십자)
            case "hatchPlus":
              path.moveTo(x,        y + cH);
              path.lineTo(x + cell, y + cH);
              path.moveTo(x + cH,   y);
              path.lineTo(x + cH,   y + cell);
              needLine = true;
              break;
          }
        }
        if (needLine) {
          ctx.strokeStyle = "#000";
          ctx.lineWidth = 1;
          ctx.lineCap = "round";
          ctx.stroke(path);
        }
      }
    }

    /* === Flow Field ==================================================== */
    function drawFlowField() {
      const cell = cellSize(+((DOM.sizeR && DOM.sizeR.value) || 3));
      const thr = thrVal(+((DOM.thR && DOM.thR.value) || 24));
      const density = DOM.flowDensityR ? +DOM.flowDensityR.value : 10;
      const segLenUI = DOM.flowLengthR ? +DOM.flowLengthR.value : 20;
      const strength = DOM.flowStrengthR ? +DOM.flowStrengthR.value : 1.0;

      const step = Math.max(3, Math.round((cell * 24) / Math.max(1, density)));
      const baseLen = Math.max(4, (segLenUI / 20) * cell);

      ctx.clearRect(0, 0, cvs.width, cvs.height);
      ctx.strokeStyle = "#000";
      ctx.lineCap = "round";
      ctx.lineWidth = 1;

      for (let y = 1; y < cvs.height - 1; y += step) {
        for (let x = 1; x < cvs.width - 1; x += step) {
          const L = lumAt(x, y);
          if (L * 255 >= thr) continue;

          const gx = (lumAt(x + 1, y) - lumAt(x - 1, y)) * 0.5;
          const gy = (lumAt(x, y + 1) - lumAt(x, y - 1)) * 0.5;

          let angle = Math.atan2(gy, gx) + Math.PI / 2;
          const len = baseLen * (1 - L) * strength;
          if (len < 0.5) continue;

          const dx = Math.cos(angle) * (len * 0.5);
          const dy = Math.sin(angle) * (len * 0.5);

          ctx.beginPath();
          ctx.moveTo(x - dx, y - dy);
          ctx.lineTo(x + dx, y + dy);
          ctx.stroke();
        }
      }
    }

    /* === Spiral Halftone – BW/Color =================================== */
    function drawHalftoneSpiral() {
      const cell = cellSize(+((DOM.sizeR && DOM.sizeR.value) || 3));
      const thr  = thrVal(+((DOM.thR && DOM.thR.value) || 24));
      const scale = DOM.dotScaleR ? (+DOM.dotScaleR.value / 100) : 1;

      const w = cvs.width, h = cvs.height;
      const cx = w * 0.5, cy = h * 0.5;
      const k = cell / (2 * Math.PI);
      const Rmax = Math.hypot(cx, cy);
      const thetaMax = Rmax / k;

      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#000";

      let θ = 0;
      while (θ <= thetaMax) {
        const r = k * θ;
        const x = cx + r * Math.cos(θ);
        const y = cy + r * Math.sin(θ);

        if (x >= -2 && x < w + 2 && y >= -2 && y < h + 2) {
          const X = Math.max(0, Math.min(off.width - 1, x | 0));
          const Y = Math.max(0, Math.min(off.height - 1, y | 0));
          const i = (Y * off.width + X) * 4;
          const R = pxData[i], G = pxData[i + 1], B = pxData[i + 2];

          const bright = (R + G + B) / 765;
          const pivot  = thr / 255;
          const denom  = Math.max(1e-6, 1 - pivot);
          let kdot = (1 - bright) / denom;
          kdot = Math.max(0, Math.min(1, kdot));

          const rMin = Math.max(0.35, cell * 0.12);
          const rMax = cell * 0.55;
          let Rdot = (rMin + (rMax - rMin) * kdot) * scale;

          if (Rdot > 0.05) {
            ctx.beginPath();
            ctx.arc(x, y, Rdot, 0, TWO);
            ctx.fill();
          }
        }
        const dθ = cell / Math.max(1, Math.hypot(r, k));
        θ += dθ;
      }
    }

    function drawHalftoneSpiralColor() {
      const cell = cellSize(+((DOM.sizeR && DOM.sizeR.value) || 3));
      const thr  = thrVal(+((DOM.thR && DOM.thR.value) || 24));
      const scale = DOM.dotScaleR ? (+DOM.dotScaleR.value / 100) : 1;

      const w = cvs.width, h = cvs.height;
      const cx = w * 0.5, cy = h * 0.5;
      const k = cell / (2 * Math.PI);
      const Rmax = Math.hypot(cx, cy);
      const thetaMax = Rmax / k;

      ctx.clearRect(0, 0, w, h);

      let θ = 0;
      while (θ <= thetaMax) {
        const r = k * θ;
        const x = cx + r * Math.cos(θ);
        const y = cy + r * Math.sin(θ);

        if (x >= -2 && x < w + 2 && y >= -2 && y < h + 2) {
          const X = Math.max(0, Math.min(off.width - 1, x | 0));
          const Y = Math.max(0, Math.min(off.height - 1, y | 0));
          const i = (Y * off.width + X) * 4;
          const R = pxData[i], G = pxData[i + 1], B = pxData[i + 2];

          const bright = (R + G + B) / 765;
          const pivot  = thr / 255;
          const denom  = Math.max(1e-6, 1 - pivot);
          let kdot = (1 - bright) / denom;
          kdot = Math.max(0, Math.min(1, kdot));

          const rMin = Math.max(0.35, cell * 0.12);
          const rMax = cell * 0.55;
          let Rdot = (rMin + (rMax - rMin) * kdot) * scale;

          if (Rdot > 0.05) {
            ctx.fillStyle = `rgb(${R},${G},${B})`;
            ctx.beginPath();
            ctx.arc(x, y, Rdot, 0, TWO);
            ctx.fill();
          }
        }
        const dθ = cell / Math.max(1, Math.hypot(r, k));
        θ += dθ;
      }
    }

    /* === 1-b) Cross-Stitch =========================================== */
    function drawCrossStitch() {
      const cell = cellSize(+((DOM.sizeR && DOM.sizeR.value) || 3));
      const thr = thrVal(+((DOM.thR && DOM.thR.value) || 24));
      ctx.clearRect(0, 0, cvs.width, cvs.height);
      ctx.lineWidth = 1;
      ctx.lineCap = "round";
      ctx.strokeStyle = "#000";
      for (let y = 0; y < cvs.height; y += cell) {
        for (let x = 0; x < cvs.width; x += cell) {
          const i =
            (Math.min(y, off.height - 1) * off.width + Math.min(x, off.width - 1)) * 4,
            R = pxData[i],
            G = pxData[i + 1],
            B = pxData[i + 2];
          if (R >= thr && G >= thr && B >= thr) continue;
          const alpha = 0.3 + (1 - (R + G + B) / 765) * 0.7;
          ctx.globalAlpha = alpha;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + cell, y + cell);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(x, y + cell);
          ctx.lineTo(x + cell, y);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    }

    /* === 3) ASCII ===================================================== */
    function drawASCII() {
      const glyphs = (DOM.glyphSet && DOM.glyphSet.value) || "@#%*+=-:. ";
      const gLen = glyphs.length || 1;
      const cell = cellSize(+((DOM.sizeR && DOM.sizeR.value) || 3));
      const thr = thrVal(+((DOM.thR && DOM.thR.value) || 24));
      ctx.clearRect(0, 0, cvs.width, cvs.height);
      ctx.fillStyle = "#000";
      ctx.font = `${cell}px monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      let gi = 0;
      for (let y = 0; y < cvs.height; y += cell)
        for (let x = 0; x < cvs.width; x += cell) {
          const i =
            (Math.min(y, off.height - 1) * off.width + Math.min(x, off.width - 1)) * 4,
            R = pxData[i],
            G = pxData[i + 1],
            B = pxData[i + 2];
          if (R >= thr && G >= thr && B >= thr) continue;
          ctx.fillText(glyphs[gi++ % gLen], x + cell / 2, y + cell / 2);
        }
    }

    /* === 4) Stipple ==================================================== */
    function drawStipple() {
      const thr = thrVal(+((DOM.thR && DOM.thR.value) || 24));
      const cell = cellSize(+((DOM.sizeR && DOM.sizeR.value) || 3));
      ctx.clearRect(0, 0, cvs.width, cvs.height);
      for (let y = 0; y < cvs.height; y += cell)
        for (let x = 0; x < cvs.width; x += cell) {
          const i =
            (Math.min(y, off.height - 1) * off.width + Math.min(x, off.width - 1)) * 4,
            R = pxData[i],
            G = pxData[i + 1],
            B = pxData[i + 2],
            bright = (R + G + B) / 765;
          if (Math.random() > ST_DENS * (1 - bright + 0.05)) continue;
          const l = i >= 4 ? i - 4 : i,
            edge = R + G + B < thr && pxData[l] + pxData[l + 1] + pxData[l + 2] >= thr * 3;
          if (!edge && R >= thr && G >= thr && B >= thr) continue;
          let rad = ST_MIN_R + (1 - bright) * (ST_MAX_R - ST_MIN_R);
          if (edge) rad *= EDGE_THICK;
          const rx = x + cell * 0.5 + (Math.random() - 0.5) * cell * 0.4,
            ry = y + cell * 0.5 + (Math.random() - 0.5) * cell * 0.4;
          ctx.beginPath();
          ctx.arc(rx + prng(x, y) * EDGE_NOISE, ry + prng(x + 5, y + 3) * EDGE_NOISE, rad, 0, TWO);
          ctx.fillStyle = "#000";
          ctx.fill();
        }
    }

    /* === PNG 저장 ===================================================== */
    if (DOM.btnPNG) {
      DOM.btnPNG.addEventListener("click", () => {
        if (!img) return;
        const a = document.createElement("a");
        a.href = cvs.toDataURL("image/png");
        a.download = `${fileBase}_${ts()}.png`;
        a.click();
      });
    }

    /* ==== SVG Export 유틸 ============================================== */
    const dl = (src, name) => {
      try {
        const b = new Blob([src], { type: "image/svg+xml;charset=utf-8" });
        const url = URL.createObjectURL(b);
        const a = document.createElement("a");
        a.style.display = "none";
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          URL.revokeObjectURL(url);
          a.remove();
        }, 500);
      } catch (err) {
        console.error("[PP-Pro] SVG 다운로드 실패:", err);
        alert("SVG 다운로드 중 오류가 발생했습니다.");
      }
    };
    const svgHeader = (w, h) =>
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`;

    /* === 공통: Rect/Lines 기반 SVG 저장 ================================ */
    function saveRectModesSVG() {
      const cell = cellSize(+((DOM.sizeR && DOM.sizeR.value) || 3));
      const cH = cell / 2;
      const thr = thrVal(+((DOM.thR && DOM.thR.value) || 24));
      const w = cvs.width, h = cvs.height;

      let svg = svgHeader(w, h);

      if (mode === "bw" || mode === "color") svg += `<g id="pix">`;
      else if (["dot", "dotPro", "grunge", "barVert", "barHori"].includes(mode)) svg += `<g id="dots" fill="#000">`;
      else if (mode === "dotProColor") svg += `<g id="dotsColor">`;
      else svg += `<g id="hatch" stroke="#000" stroke-linecap="round" stroke-width="1">`;

      for (let y = 0; y < h; y += cell) {
        for (let x = 0; x < w; x += cell) {
          const i = (Math.min(y, off.height - 1) * off.width + Math.min(x, off.width - 1)) * 4;
          const R = pxData[i], G = pxData[i + 1], B = pxData[i + 2];

          if (mode === "color") {
            svg += `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="rgb(${R},${G},${B})"/>`;
            continue;
          }

          const thrAll = R >= thr && G >= thr && B >= thr;
          const pureWhite = (R === 255 && G === 255 && B === 255);

          if (!["dotPro", "dotProColor", "barVert", "barHori", "grunge"].includes(mode) && thrAll) continue;

          switch (mode) {
            case "bw":
              svg += `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="#000"/>`;
              break;

            case "dot":
              svg += `<circle cx="${x + cH}" cy="${y + cH}" r="${(Math.max(cH * 0.7, minDot)).toFixed(2)}"/>`;
              break;

            case "dotPro":
            case "dotProColor": {
              const bright = (R + G + B) / 765;
              const pivot = thr / 255;
              const denom = Math.max(1e-6, 1 - pivot);
              let k = (1 - bright) / denom;
              k = Math.min(1, Math.max(0, k));
              const rMin = Math.max(minDot, cH * 0.18);
              const rMax = cH * 0.98;
              let r = rMin + (rMax - rMin) * k;
              const scale = DOM.dotScaleR ? +DOM.dotScaleR.value / 100 : 1;
              r *= scale;
              r = Math.min(r, cH * 1.05);
              const fillAttr = mode === "dotProColor" ? ` fill="rgb(${R},${G},${B})"` : "";
              svg += `<circle cx="${(x + cH).toFixed(2)}" cy="${(y + cH).toFixed(2)}" r="${r.toFixed(2)}"${fillAttr}/>`;
              break;
            }

            case "barVert": {
              if (pureWhite) break;
              const lum = (0.2126 * R + 0.7152 * G + 0.0722 * B) / 255;
              const pivot = thr / 255;
              if (lum >= pivot) break;

              const pctMin = DOM.barMinR ? +DOM.barMinR.value : 0;
              const pctMax = DOM.barMaxR ? +DOM.barMaxR.value : 98;
              const pMin = Math.min(pctMin, pctMax);
              const pMax = Math.max(pctMin, pctMax);

              const k = Math.max(0, Math.min(1, 1 - lum));
              const minW = (pMin / 100) * cell;
              const maxW = (pMax / 100) * cell;
              const barW = minW + (maxW - minW) * k;
              if (barW <= 0.5) break;

              const barH = Math.max(1, Math.round(cell * 0.95));
              const cxr = x + Math.round((cell - barW) / 2);
              const cyr = y + Math.round((cell - barH) / 2);
              svg += `<rect x="${cxr}" y="${cyr}" width="${barW.toFixed(2)}" height="${barH}" fill="#000"/>`;
              break;
            }

            case "barHori": {
              if (pureWhite) break;
              const lum = (0.2126 * R + 0.7152 * G + 0.0722 * B) / 255;
              const pivot = thr / 255;
              if (lum >= pivot) break;

              const pctMin = DOM.barMinR ? +DOM.barMinR.value : 0;
              const pctMax = DOM.barMaxR ? +DOM.barMaxR.value : 98;
              const pMin = Math.min(pctMin, pctMax);


              const pMax = Math.max(pctMin, pctMax);

              const k = Math.max(0, Math.min(1, 1 - lum));
              const minH = (pMin / 100) * cell;
              const maxH = (pMax / 100) * cell;
              const barH = Math.max(1, minH + (maxH - minH) * k);
              const barW = Math.max(1, Math.round(cell * 0.95));
              const cxr = x + Math.round((cell - barW) / 2);
              const cyr = y + Math.round((cell - barH) / 2);
              svg += `<rect x="${cxr}" y="${cyr}" width="${barW}" height="${barH.toFixed(2)}" fill="#000"/>`;
              break;
            }

            case "grunge": {
              const u = Math.floor(x / cell);
              const v = Math.floor(y / cell);
              const r1 = prng(u, v);
              const r2 = prng(u + 7, v + 13);
              const r3 = prng(u + 19, v + 5);

              const rad  = Math.max(cH * (GR_MIN + (GR_MAX - GR_MIN) * r1), minDot);
              const dist = cell * GR_OFF * r2;
              const ang  = r3 * TWO;
              const cxp  = x + cH + Math.cos(ang) * dist;
              const cyp  = y + cH + Math.sin(ang) * dist;

              svg += `<circle cx="${cxp.toFixed(2)}" cy="${cyp.toFixed(2)}" r="${rad.toFixed(2)}"/>`;
              break;
            }

            case "hatchSlash":
              svg += `<line x1="${x}" y1="${y + cH + cH}" x2="${x + cell}" y2="${y}"/>`;
              break;
            case "hatchBack":
              svg += `<line x1="${x}" y1="${y}" x2="${x + cell}" y2="${y + cell}"/>`;
              break;
            case "hatchHori":
              svg += `<line x1="${x}" y1="${y + cH}" x2="${x + cell}" y2="${y + cH}"/>`;
              break;
            case "hatchVert":
              svg += `<line x1="${x + cH}" y1="${y}" x2="${x + cH}" y2="${y + cell}"/>`;
              break;

            // ★ 추가: hatchPlus (SVG)
            case "hatchPlus":
              svg += `<line x1="${x}" y1="${y + cH}" x2="${x + cell}" y2="${y + cH}"/>`;
              svg += `<line x1="${x + cH}" y1="${y}" x2="${x + cH}" y2="${y + cell}"/>`;
              break;
          }
        }
      }
      svg += `</g></svg>`;
      dl(svg, `${fileBase}_${ts()}.svg`);
    }

    /* === Halftone Spiral SVG (BW) ===================================== */
    function saveHalftoneSpiralSVG() {
      const cell  = cellSize(+((DOM.sizeR && DOM.sizeR.value) || 3));
      const thr   = thrVal(+((DOM.thR && DOM.thR.value) || 24));
      const scale = DOM.dotScaleR ? (+DOM.dotScaleR.value / 100) : 1;

      const w = cvs.width, h = cvs.height;
      const cx = w * 0.5, cy = h * 0.5;
      const k  = cell / (2 * Math.PI);
      const Rmax = Math.hypot(cx, cy);
      const thetaMax = Rmax / k;

      let out = `<g fill="#000">`;

      let theta = 0;
      while (theta <= thetaMax) {
        const r = k * theta;
        const x = cx + r * Math.cos(theta);
        const y = cy + r * Math.sin(theta);

        if (x >= -2 && x < w + 2 && y >= -2 && y < h + 2) {
          const X = Math.max(0, Math.min(off.width  - 1, x | 0));
          const Y = Math.max(0, Math.min(off.height - 1, y | 0));
          const i = (Y * off.width + X) * 4;
          const Rv = pxData[i], Gv = pxData[i + 1], Bv = pxData[i + 2];

          const bright = (Rv + Gv + Bv) / 765;
          const pivot  = thr / 255;
          const denom  = Math.max(1e-6, 1 - pivot);
          let kdot = (1 - bright) / denom;
          kdot = Math.max(0, Math.min(1, kdot));

          const rMin = Math.max(0.35, cell * 0.12);
          const rMax = cell * 0.55;
          let Rdot  = (rMin + (rMax - rMin) * kdot) * scale;

          if (Rdot > 0.05) {
            out += `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${Rdot.toFixed(2)}"/>`;
          }
        }
        const dtheta = cell / Math.max(1, Math.hypot(r, k));
        theta += dtheta;
      }

      out += `</g>`;
      const svg = svgHeader(w, h) + out + `</svg>`;
      dl(svg, `${fileBase}_${ts()}.svg`);
    }

    /* === Halftone Spiral SVG (Color) ================================== */
    function saveHalftoneSpiralColorSVG() {
      const cell  = cellSize(+((DOM.sizeR && DOM.sizeR.value) || 3));
      const thr   = thrVal(+((DOM.thR && DOM.thR.value) || 24));
      const scale = DOM.dotScaleR ? (+DOM.dotScaleR.value / 100) : 1;

      const w = cvs.width, h = cvs.height;
      const cx = w * 0.5, cy = h * 0.5;
      const k  = cell / (2 * Math.PI);
      const Rmax = Math.hypot(cx, cy);
      const thetaMax = Rmax / k;

      let out = ``;

      let theta = 0;
      while (theta <= thetaMax) {
        const r = k * theta;
        const x = cx + r * Math.cos(theta);
        const y = cy + r * Math.sin(theta);

        if (x >= -2 && x < w + 2 && y >= -2 && y < h + 2) {
          const X = Math.max(0, Math.min(off.width  - 1, x | 0));
          const Y = Math.max(0, Math.min(off.height - 1, y | 0));
          const i = (Y * off.width + X) * 4;
          const Rv = pxData[i], Gv = pxData[i + 1], Bv = pxData[i + 2];

          const bright = (Rv + Gv + Bv) / 765;
          const pivot  = thr / 255;
          const denom  = Math.max(1e-6, 1 - pivot);
          let kdot = (1 - bright) / denom;
          kdot = Math.max(0, Math.min(1, kdot));

          const rMin = Math.max(0.35, cell * 0.12);
          const rMax = cell * 0.55;
          let Rdot  = (rMin + (rMax - rMin) * kdot) * scale;

          if (Rdot > 0.05) {
            out += `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${Rdot.toFixed(2)}" fill="rgb(${Rv},${Gv},${Bv})"/>`;
          }
        }
        const dtheta = cell / Math.max(1, Math.hypot(r, k));
        theta += dtheta;
      }

      const svg = svgHeader(w, h) + out + `</svg>`;
      dl(svg, `${fileBase}_${ts()}.svg`);
    }

    /* === FlowField SVG ================================================ */
    function saveFlowFieldSVG() {
      const cell = cellSize(+((DOM.sizeR && DOM.sizeR.value) || 3));
      const thr = thrVal(+((DOM.thR && DOM.thR.value) || 24));
      const density = DOM.flowDensityR ? +DOM.flowDensityR.value : 10;
      const segLenUI = DOM.flowLengthR ? +DOM.flowLengthR.value : 20;
      const strength = DOM.flowStrengthR ? +DOM.flowStrengthR.value : 1.0;
      const step = Math.max(3, Math.round((cell * 24) / Math.max(1, density)));
      const baseLen = Math.max(4, (segLenUI / 20) * cell);
      const w = cvs.width, h = cvs.height;

      let out = `<g stroke="#000" stroke-linecap="round" stroke-width="1">`;
      for (let y = 1; y < h - 1; y += step) {
        for (let x = 1; x < w - 1; x += step) {
          const L = lumAt(x, y);
          if (L * 255 >= thr) continue;
          const gx = (lumAt(x + 1, y) - lumAt(x - 1, y)) * 0.5;
          const gy = (lumAt(x, y + 1) - lumAt(x, y - 1)) * 0.5;
          let angle = Math.atan2(gy, gx) + Math.PI / 2;
          const len = baseLen * (1 - L) * strength;
          if (len < 0.5) continue;
          const dx = Math.cos(angle) * (len * 0.5);
          const dy = Math.sin(angle) * (len * 0.5);
          out += `<line x1="${(x - dx).toFixed(2)}" y1="${(y - dy).toFixed(2)}" x2="${(x + dx).toFixed(2)}" y2="${(y + dy).toFixed(2)}"/>`;
        }
      }
      out += `</g>`;
      const svg = svgHeader(w, h) + out + `</svg>`;
      dl(svg, `${fileBase}_${ts()}.svg`);
    }

    /* === CrossStitch SVG ============================================== */
    function saveCrossStitchSVG() {
      const cell = cellSize(+((DOM.sizeR && DOM.sizeR.value) || 3));
      const thr = thrVal(+((DOM.thR && DOM.thR.value) || 24));
      const w = cvs.width, h = cvs.height;
      let out = `<g stroke="#000" stroke-linecap="round" stroke-width="1">`;
      for (let y = 0; y < h; y += cell) {
        for (let x = 0; x < w; x += cell) {
          const i =
            (Math.min(y, off.height - 1) * off.width + Math.min(x, off.width - 1)) * 4,
            R = pxData[i], G = pxData[i + 1], B = pxData[i + 2];
          if (R >= thr && G >= thr && B >= thr) continue;
          const alpha = 0.3 + (1 - (R + G + B) / 765) * 0.7;
          const a = alpha.toFixed(2);
          out += `<line x1="${x}" y1="${y}" x2="${x + cell}" y2="${y + cell}" stroke="rgba(0,0,0,${a})"/>`;
          out += `<line x1="${x}" y1="${y + cell}" x2="${x + cell}" y2="${y}" stroke="rgba(0,0,0,${a})"/>`;
        }
      }
      out += `</g>`;
      const svg = svgHeader(w, h) + out + `</svg>`;
      dl(svg, `${fileBase}_${ts()}.svg`);
    }

    /* === ASCII SVG (구현 추가) ========================================= */
    function saveASCIISVG() {
      const glyphs = (DOM.glyphSet && DOM.glyphSet.value) || "@#%*+=-:. ";
      const gLen = glyphs.length || 1;
      const cell = cellSize(+((DOM.sizeR && DOM.sizeR.value) || 3));
      const thr  = thrVal(+((DOM.thR && DOM.thR.value) || 24));
      const w = cvs.width, h = cvs.height;

      let out = `<g font-family="monospace" font-size="${cell}" text-anchor="middle" dominant-baseline="middle" fill="#000">`;
      let gi = 0;

      for (let y = 0; y < h; y += cell) {
        for (let x = 0; x < w; x += cell) {
          const i =
            (Math.min(y, off.height - 1) * off.width + Math.min(x, off.width - 1)) * 4;
          const R = pxData[i], G = pxData[i + 1], B = pxData[i + 2];
          if (R >= thr && G >= thr && B >= thr) continue;
          const ch = glyphs[gi++ % gLen]
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
          out += `<text x="${(x + cell / 2).toFixed(2)}" y="${(y + cell / 2).toFixed(2)}">${ch}</text>`;
        }
      }
      out += `</g>`;
      const svg = svgHeader(w, h) + out + `</svg>`;
      dl(svg, `${fileBase}_${ts()}.svg`);
    }

    /* === SVG 저장 버튼 분기 ============================================ */
    if (DOM.btnSVG) {
      DOM.btnSVG.addEventListener("click", () => {
        if (!img) return;
        switch (mode) {
          case "color":
          case "bw":
          case "dot":
          case "dotPro":
          case "dotProColor":
          case "grunge":
          case "hatchSlash":
          case "hatchBack":
          case "hatchHori":
          case "hatchVert":
          case "hatchPlus": // ★ 추가: hatchPlus도 Rect 모드 SVG 경로 사용
          case "barVert":
          case "barHori":
            return saveRectModesSVG();
          case "flowField":
            return saveFlowFieldSVG();
          case "stipple":
            return saveStippleSVG();
          case "ascii":
            return saveASCIISVG();
          case "crossStitch":
            return saveCrossStitchSVG();
          case "halftoneSpiral":
            return saveHalftoneSpiralSVG();
          case "halftoneSpiralColor":
            return saveHalftoneSpiralColorSVG();
          default:
            alert("SVG 저장 미지원 모드");
        }
      });
    }

    /* === 카테고리 구성 ================================================ */
    const CATEGORY_MAP = {
      // ★ HTML의 data-cat 값과 일치하도록 키 수정: pixel / dot / hatch / flowfield / type
      pixel: [
        { label: "픽셀·흑백",  mode: "bw" },
        { label: "픽셀·컬러",  mode: "color" },
        { label: "세로바",     mode: "barVert" },
        { label: "가로바",     mode: "barHori" },
      ],
      dot: [
        { label: "도트·점묘화",     mode: "dot" },
        { label: "도트·그런지",     mode: "grunge" },
        { label: "도트PRO",         mode: "dotPro" },
        { label: "도트PRO·컬러",    mode: "dotProColor" },
        { label: "하프톤 나선",      mode: "halftoneSpiral" },
        { label: "하프톤 나선·컬러", mode: "halftoneSpiralColor" },
      ],
      hatch: [
        { label: "해치(／)", mode: "hatchSlash" },
        { label: "해치(＼)", mode: "hatchBack"  },
        { label: "해치(ㅣ)", mode: "hatchVert"  },
        { label: "해치(ㅡ)", mode: "hatchHori"  },
        { label: "해치(X)",  mode: "crossStitch"},
        { label: "해치(+)",  mode: "hatchPlus"  }, // ★ 플러스
      ],
      flowfield: [
        { label: "Flow Field", mode: "flowField" },
      ],
      type: [
        { label: "ASCII 타이포", mode: "ascii" },
      ],
    };

    let activeCat = null;

    // 모드 전환 공통
    function activateMode(newMode, srcBtn){
      mode = newMode;
      // 도킹 내 버튼 active 표시
      if (DOM.modeDock){
        $$(".mode-dock .mode-btn").forEach(b => b.classList.toggle("active", b === srcBtn));
      }
      // body 클래스 토글 (color/ascii UI 토글)
      document.body.classList.toggle("mode-color", mode === "color");
      document.body.classList.toggle("mode-ascii", mode === "ascii");
      toggleCtrls();
      draw();
    }

    // 도킹 빌더 (세로 원형 버튼 생성)
    function buildDock(catKey){
      if (!DOM.modeDock) return;
      DOM.modeDock.innerHTML = "";
      const items = CATEGORY_MAP[catKey] || [];
      items.forEach(({label, mode: m}, idx) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "mode-btn";
        btn.dataset.mode = m;
        btn.textContent = label.replace(/\s+/g, "\n"); // 세로 버튼에서 줄바꿈 자연스럽게
        btn.addEventListener("click", () => activateMode(m, btn));
        DOM.modeDock.appendChild(btn);
        // 현재 모드와 일치하면 active 표시
        if (m === mode) btn.classList.add("active");
      });
      DOM.modeDock.hidden = items.length === 0;
    }

    // 카테고리 토글
    function onCategoryClick(catBtn){
      const catKey = catBtn.dataset.cat;
      const isSame = (activeCat === catKey);

      // aria-selected 업데이트
      $$(".category-bar .cat-btn").forEach(b => b.setAttribute("aria-selected", "false"));

      if (isSame){
        activeCat = null;
        if (DOM.modeDock) DOM.modeDock.hidden = true;
        return;
      }
      activeCat = catKey;
      catBtn.setAttribute("aria-selected", "true");
      buildDock(catKey);
    }

    // 카테고리 바 이벤트
    if (DOM.categoryBar){
      DOM.categoryBar.addEventListener("click", (e) => {
        const btn = e.target.closest(".cat-btn");
        if (!btn) return;
        onCategoryClick(btn);
      });
      DOM.categoryBar.addEventListener("keydown", (e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        const btn = e.target.closest(".cat-btn");
        if (!btn) return;
        e.preventDefault();
        onCategoryClick(btn);
      });
    } else {
      log("카테고리 바(#categoryBar)를 찾지 못했습니다. 기존 모드 버튼(있다면)으로 동작합니다.");
    }

    // ==== 초기 상태: 픽셀 카테고리 활성화 + '픽셀·흑백' 기본 모드 ====
    (function initCategoryAndMode(){
      const pixelBtn = DOM.categoryBar && DOM.categoryBar.querySelector('.cat-btn[data-cat="pixel"]');
      if (pixelBtn) {
        pixelBtn.setAttribute("aria-selected", "true");
        activeCat = "pixel";
        buildDock("pixel");
      }
      // 기본 모드 'bw' 활성화 표시
      const firstDockBtn = DOM.modeDock && DOM.modeDock.querySelector('.mode-btn[data-mode="bw"]');
      if (firstDockBtn) firstDockBtn.classList.add("active");
      mode = "bw";
      document.body.classList.toggle("mode-color", false);
      document.body.classList.toggle("mode-ascii", false);
      toggleCtrls();
    })();

    // 초기 컨트롤 가시성
    toggleCtrls();
    log("초기화 완료 (Maze 제거 + DotVintage 제거 + 클릭-재업로드 + hatchPlus + 카테고리/도킹 + ASCII SVG 구현 + 키 일치 수정)");
  }); // ready

  /* =========================================================
     2) 커스텀 커서 — 실패해도 페이지 기능엔 영향 없게
     ========================================================= */
  (function initCursor() {
    try {
      const ring = document.createElement("div");
      ring.className = "cursor";
      document.body.appendChild(ring);

      let tail = document.getElementById("trail-canvas");
      if (!tail) {
        tail = document.createElement("canvas");
        tail.id = "trail-canvas";
        document.body.prepend(tail);
      }

      document.documentElement.classList.add("has-custom-cursor");

      const tctx = tail.getContext("2d");
      const resize = () => {
        tail.width = innerWidth;
        tail.height = innerHeight;
      };
      window.addEventListener("resize", resize, { passive: true });
      resize();

      const SEG = 11, SPEED = 0.4;
      const segs = Array.from({ length: SEG }, () => ({ x: innerWidth / 2, y: innerHeight / 2 }));
      let mx = innerWidth / 2, my = innerHeight / 2;

      document.addEventListener("mousemove", (e) => { mx = e.clientX; my = e.clientY; }, { passive: true });

      (function loop() {
        tctx.clearRect(0, 0, tail.width, tail.height);
        segs[0].x += (mx - segs[0].x) * SPEED;
        segs[0].y += (my - segs[0].y) * SPEED;
        for (let i = 1; i < SEG; i++) {
          segs[i].x += (segs[i - 1].x - segs[i].x) * SPEED;
          segs[i].y += (segs[i - 1].y - segs[i].y) * SPEED;
        }
        tctx.lineCap = "round";
        tctx.lineJoin = "round";
        tctx.lineWidth = 7;
        tctx.strokeStyle = "rgba(20,42,171,0.9)";
        tctx.beginPath();
        tctx.moveTo(segs[0].x, segs[0].y);
        for (let i = 1; i < SEG - 1; i++) {
          const cx = (segs[i].x + segs[i + 1].x) / 2, cy = (segs[i].y + segs[i + 1].y) / 2;
          tctx.quadraticCurveTo(segs[i].x, segs[i].y, cx, cy);
        }
        tctx.lineTo(segs[SEG - 1].x, segs[SEG - 1].y);
        tctx.stroke();

        ring.style.left = `${mx}px`;
        ring.style.top = `${my}px`;

        requestAnimationFrame(loop);
      })();
    } catch (err) {
      console.error("[Custom Cursor] 초기화 실패:", err);
    }
  })();

  /* === ASCII SVG (원래 위치 유지 · 외부 선언) ========================= */
  function saveASCIISVG() {
    // ready() 내부에서 구현된 동일 함수가 실제로 사용됩니다.
  }
})();
