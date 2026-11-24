/**
 * CWP Detailers & Motors — 3D Neural Core Canvas Engine
 * Automotive Luxury & AI Authentication Console
 *
 * Faithfully mirrors the BidWar 3D Fibonacci Neural Core:
 * - 96 Fibonacci sphere nodes: Platinum Pearl, Metallic Sapphire-Cobalt, and Radiant Cyan starbursts
 * - Geodesic electric sapphire/cyan filaments
 * - Sculpted central metallic chrome-pearl sphere with specular gloss and internal luminescence
 * - Ground plane contact umbra & concentric cyan ripples
 * - Full mouse and touch interactive tilt with inertia damping
 * - Stage management: 'intro' | 'passwordPrompt' | 'authenticating'
 * - Inactivity auto-reset timer (6 seconds)
 */

(function (window, document) {
  'use strict';

  var INACTIVITY_TIMEOUT_MS = 6000;

  var state = {
    stage: 'intro', // 'intro' | 'passwordPrompt' | 'authenticating'
    coreSize: 320,
    charged: false,
    active: false,
    rotX: 0,
    rotY: 0,
    targetRotX: 0,
    targetRotY: 0,
    energy: 0.28,
    targetEnergy: 0.28,
    pulse: 0,
    hover: 0,
    paused: false,
    animFrameId: null,
    inactivityTimer: null,
    isInitialized: false,
    nodes: [],
    pairs: []
  };

  // Generate 96 Fibonacci sphere nodes
  function generateNodes() {
    var N = 96;
    var goldenRatioAngle = Math.PI * (3 - Math.sqrt(5));
    var nodes = [];

    for (var i = 0; i < N; i += 1) {
      var y = 1 - (i / (N - 1)) * 2;
      var r = Math.sqrt(Math.max(0, 1 - y * y));
      var theta = goldenRatioAngle * i;

      // Color taxonomy for CWP:
      // - 45% Polished pearl porcelain
      // - 40% Metallic sapphire cobalt
      // - 15% Radiant cyan glowing starbursts
      var colorType = 'pearl';
      var isRadiantStar = false;

      if (i % 7 === 0) {
        colorType = 'radiantCyan';
        isRadiantStar = true;
      } else if (i % 2 === 0) {
        colorType = 'sapphire';
      }

      nodes.push({
        x: Math.cos(theta) * r,
        y: y,
        z: Math.sin(theta) * r,
        colorType: colorType,
        isRadiantStar: isRadiantStar
      });
    }

    // Connect node pairs within Euclidean threshold
    var pairs = [];
    for (var a = 0; a < N; a += 1) {
      for (var b = a + 1; b < N; b += 1) {
        var dx = nodes[a].x - nodes[b].x;
        var dy = nodes[a].y - nodes[b].y;
        var dz = nodes[a].z - nodes[b].z;
        var dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist < 0.46) {
          pairs.push([a, b]);
        }
      }
    }

    state.nodes = nodes;
    state.pairs = pairs;
  }

  // Calculate responsive core sizing
  function calculateCoreSize() {
    var h = window.innerHeight || 800;
    var w = window.innerWidth || 1200;
    if (h < 640 || w < 360) {
      return 220;
    } else if (h < 760 || w < 440) {
      return 250;
    } else if (w < 1024) {
      return 290;
    }
    return 320;
  }

  // Clear and start inactivity timer
  function clearInactivityTimer() {
    if (state.inactivityTimer) {
      window.clearTimeout(state.inactivityTimer);
      state.inactivityTimer = null;
    }
  }

  function startInactivityTimer() {
    clearInactivityTimer();
    state.inactivityTimer = window.setTimeout(function () {
      var input = document.getElementById('adminPasswordInput');
      var currentVal = input ? (input.value || '').trim() : '';
      if (currentVal.length === 0) {
        setStage('intro');
      }
      state.inactivityTimer = null;
    }, INACTIVITY_TIMEOUT_MS);
  }

  // Set auth stage
  function setStage(newStage) {
    state.stage = newStage;
    var root = document.getElementById('adminAuthGate');
    var introCta = document.getElementById('cwpCoreIntroCta');
    var pwBox = document.getElementById('cwpCorePasswordBox');
    var loaderText = document.getElementById('cwpAuthenticatingIndicator');
    var pwInput = document.getElementById('adminPasswordInput');
    var submitBtn = document.getElementById('btnAdminLogin');
    var errBox = document.getElementById('adminAuthError');

    state.charged = newStage === 'passwordPrompt' || newStage === 'authenticating';

    if (root) {
      if (state.charged) {
        root.classList.add('is-charged');
      } else {
        root.classList.remove('is-charged');
      }
    }

    if (newStage === 'intro') {
      clearInactivityTimer();
      if (introCta) {
        introCta.style.display = 'flex';
        introCta.removeAttribute('hidden');
      }
      if (pwBox) {
        pwBox.style.display = 'none';
        pwBox.setAttribute('hidden', 'true');
      }
      if (loaderText) loaderText.style.display = 'none';
      if (errBox) errBox.style.display = 'none';
      if (pwInput) pwInput.value = '';
    } else if (newStage === 'passwordPrompt') {
      if (introCta) {
        introCta.style.display = 'none';
        introCta.setAttribute('hidden', 'true');
      }
      if (pwBox) {
        pwBox.style.display = 'flex';
        pwBox.removeAttribute('hidden');
      }
      if (loaderText) loaderText.style.display = 'none';
      if (pwInput) {
        pwInput.disabled = false;
        if (typeof initAdminAutoLogin === 'function') initAdminAutoLogin();
        setTimeout(function () {
          pwInput.focus();
        }, 150);
      }
      if (submitBtn) submitBtn.disabled = false;
      startInactivityTimer();
    } else if (newStage === 'authenticating') {
      clearInactivityTimer();
      if (introCta) introCta.style.display = 'none';
      if (pwBox) pwBox.style.display = 'flex';
      if (loaderText) loaderText.style.display = 'block';
      if (errBox) errBox.style.display = 'none';
      if (pwInput) pwInput.disabled = true;
      if (submitBtn) submitBtn.disabled = true;
    }
  }

  function activateCore() {
    if (state.stage === 'intro') {
      setStage('passwordPrompt');
    }
  }

  // Canvas render loop
  function startRenderLoop() {
    var canvas = document.getElementById('cwpNeuralCoreCanvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    if (!ctx) return;

    var prefersReducedMotion =
      window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    var autoSpin = 0;

    function render() {
      if (state.paused) return;

      var size = state.coreSize;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);

      if (canvas.width !== size * dpr || canvas.height !== size * dpr) {
        canvas.width = size * dpr;
        canvas.height = size * dpr;
        canvas.style.width = size + 'px';
        canvas.style.height = size + 'px';
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, size, size);

      var cx = size / 2;
      var cy = size / 2;
      var radius = size * 0.35;

      var damping = prefersReducedMotion ? 0.02 : 0.06;
      state.rotX += (state.targetRotX - state.rotX) * damping;
      state.rotY += (state.targetRotY - state.rotY) * damping;

      state.hover += ((state.active ? 1 : 0) - state.hover) * 0.1;
      var baseE = state.charged ? 1.9 : state.targetEnergy;
      var targetE = baseE + state.hover * 0.65;
      state.energy += (targetE - state.energy) * 0.08;

      var spinStep = prefersReducedMotion ? 0.0006 : 0.0016 + state.hover * 0.0014;
      autoSpin += spinStep;
      state.pulse += 0.042 + state.hover * 0.02;

      var ry = state.rotY + autoSpin;
      var rx = state.rotX;
      var cosY = Math.cos(ry);
      var sinY = Math.sin(ry);
      var cosX = Math.cos(rx);
      var sinX = Math.sin(rx);

      // 3D coordinate projection
      var nodes = state.nodes;
      var proj = [];
      for (var n = 0; n < nodes.length; n += 1) {
        var node = nodes[n];
        var x = node.x * cosY - node.z * sinY;
        var z = node.x * sinY + node.z * cosY;
        var y = node.y;
        var y2 = y * cosX - z * sinX;
        var z2 = y * sinX + z * cosX;
        var persp = 1 / (1.65 - z2 * 0.5);

        proj.push({
          sx: cx + x * radius * persp,
          sy: cy + y2 * radius * persp,
          depth: (z2 + 1) / 2,
          rawZ: z2,
          colorType: node.colorType,
          isRadiantStar: node.isRadiantStar
        });
      }

      var isDark =
        document.body.classList.contains('theme-dark') ||
        document.documentElement.getAttribute('data-theme') === 'dark';

      // 1. Floor Shadow & Concentric Cyan Ripple Rings
      ctx.save();
      var shadowY = cy + radius * 1.09;

      ctx.strokeStyle = isDark ? 'rgba(56, 189, 248, 0.16)' : 'rgba(37, 99, 235, 0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(cx, shadowY + 2, radius * 1.15, radius * 0.28, 0, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = isDark ? 'rgba(56, 189, 248, 0.08)' : 'rgba(56, 189, 248, 0.07)';
      ctx.beginPath();
      ctx.ellipse(cx, shadowY + 4, radius * 1.35, radius * 0.32, 0, 0, Math.PI * 2);
      ctx.stroke();

      // Penumbra
      var penumbra = ctx.createRadialGradient(cx, shadowY, 0, cx, shadowY, radius * 0.95);
      if (isDark) {
        penumbra.addColorStop(0, 'rgba(0, 0, 0, 0.5)');
        penumbra.addColorStop(0.5, 'rgba(7, 16, 28, 0.25)');
        penumbra.addColorStop(1, 'rgba(7, 16, 28, 0)');
      } else {
        penumbra.addColorStop(0, 'rgba(15, 23, 42, 0.14)');
        penumbra.addColorStop(0.5, 'rgba(71, 85, 105, 0.05)');
        penumbra.addColorStop(1, 'rgba(248, 250, 252, 0)');
      }
      ctx.beginPath();
      ctx.ellipse(cx, shadowY, radius * 0.95, radius * 0.24, 0, 0, Math.PI * 2);
      ctx.fillStyle = penumbra;
      ctx.fill();

      // Umbra
      var umbra = ctx.createRadialGradient(cx, shadowY - 4, 0, cx, shadowY - 4, radius * 0.48);
      if (isDark) {
        umbra.addColorStop(0, 'rgba(0, 0, 0, 0.8)');
        umbra.addColorStop(0.65, 'rgba(0, 0, 0, 0.3)');
        umbra.addColorStop(1, 'rgba(7, 16, 28, 0)');
      } else {
        umbra.addColorStop(0, 'rgba(15, 23, 42, 0.22)');
        umbra.addColorStop(0.65, 'rgba(30, 41, 59, 0.08)');
        umbra.addColorStop(1, 'rgba(248, 250, 252, 0)');
      }
      ctx.beginPath();
      ctx.ellipse(cx, shadowY - 4, radius * 0.48, radius * 0.12, 0, 0, Math.PI * 2);
      ctx.fillStyle = umbra;
      ctx.fill();
      ctx.restore();

      // 2. Sapphire / Cyan Ambient Halo
      ctx.save();
      var haloR = radius * (1.2 + Math.sin(state.pulse) * 0.02);
      var ambientHalo = ctx.createRadialGradient(cx, cy, radius * 0.88, cx, cy, haloR);
      if (isDark) {
        ambientHalo.addColorStop(0, 'rgba(56, 189, 248, ' + (0.2 + state.hover * 0.12) + ')');
        ambientHalo.addColorStop(0.45, 'rgba(37, 99, 235, ' + (0.1 + state.hover * 0.08) + ')');
        ambientHalo.addColorStop(1, 'rgba(7, 16, 28, 0)');
      } else {
        ambientHalo.addColorStop(0, 'rgba(186, 230, 253, ' + (0.24 + state.hover * 0.12) + ')');
        ambientHalo.addColorStop(0.45, 'rgba(224, 242, 254, ' + (0.12 + state.hover * 0.08) + ')');
        ambientHalo.addColorStop(1, 'rgba(248, 250, 252, 0)');
      }
      ctx.beginPath();
      ctx.arc(cx, cy, haloR, 0, Math.PI * 2);
      ctx.fillStyle = ambientHalo;
      ctx.fill();
      ctx.restore();

      // 3. Central Sculpted Metallic Chrome/Sapphire Sphere
      var lightX = cx - radius * 0.32;
      var lightY = cy - radius * 0.36;
      var sphereGrad = ctx.createRadialGradient(
        lightX,
        lightY,
        radius * 0.04,
        cx,
        cy,
        radius * 0.98
      );
      if (isDark) {
        sphereGrad.addColorStop(0, 'rgba(255, 255, 255, 1)');
        sphereGrad.addColorStop(0.24, 'rgba(203, 213, 225, 1)');
        sphereGrad.addColorStop(0.58, 'rgba(30, 58, 138, 1)');
        sphereGrad.addColorStop(0.88, 'rgba(15, 23, 42, 1)');
        sphereGrad.addColorStop(1, 'rgba(37, 99, 235, 0.8)');
      } else {
        sphereGrad.addColorStop(0, 'rgba(255, 255, 255, 1)');
        sphereGrad.addColorStop(0.24, 'rgba(241, 245, 249, 1)');
        sphereGrad.addColorStop(0.58, 'rgba(219, 234, 254, 1)');
        sphereGrad.addColorStop(0.88, 'rgba(148, 163, 184, 1)');
        sphereGrad.addColorStop(1, 'rgba(191, 219, 254, 1)');
      }

      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 0.96, 0, Math.PI * 2);
      ctx.fillStyle = sphereGrad;
      ctx.fill();
      ctx.restore();

      // 4. Surface Docking Ports
      for (var d = 0; d < proj.length; d += 1) {
        var dp = proj[d];
        if (dp.depth > 0.45) {
          var portR = 2.2 * (0.8 + dp.depth * 0.5);
          ctx.beginPath();
          ctx.arc(dp.sx, dp.sy, portR, 0, Math.PI * 2);
          ctx.fillStyle = isDark ? 'rgba(56, 189, 248, 0.4)' : 'rgba(148, 163, 184, 0.45)';
          ctx.fill();

          ctx.beginPath();
          ctx.arc(dp.sx, dp.sy, portR * 0.6, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(56, 189, 248, 0.85)';
          ctx.fill();
        }
      }

      // 5. Internal Core Luminescence
      var corePulse = 0.25 + state.energy * 0.3 + Math.sin(state.pulse) * 0.05;
      var innerCore = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 0.72);
      innerCore.addColorStop(0, 'rgba(240, 249, 255, ' + Math.min(0.85, corePulse * 0.9) + ')');
      innerCore.addColorStop(0.35, 'rgba(56, 189, 248, ' + Math.min(0.65, corePulse * 0.7) + ')');
      innerCore.addColorStop(0.7, 'rgba(37, 99, 235, ' + Math.min(0.25, corePulse * 0.3) + ')');
      innerCore.addColorStop(1, 'rgba(37, 99, 235, 0)');

      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 0.72, 0, Math.PI * 2);
      ctx.fillStyle = innerCore;
      ctx.fill();
      ctx.restore();

      // 6. Specular Gloss Curvature Sheen
      ctx.save();
      ctx.beginPath();
      var glossGrad = ctx.createRadialGradient(
        cx - radius * 0.32,
        cy - radius * 0.36,
        0,
        cx - radius * 0.32,
        cy - radius * 0.36,
        radius * 0.48
      );
      glossGrad.addColorStop(0, 'rgba(255, 255, 255, 0.7)');
      glossGrad.addColorStop(0.35, 'rgba(224, 242, 254, 0.3)');
      glossGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = glossGrad;
      ctx.arc(cx, cy, radius * 0.95, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // 7. Electric Sapphire / Cyan Neural Filaments
      var pairs = state.pairs;
      for (var k = 0; k < pairs.length; k += 1) {
        var pair = pairs[k];
        var a = proj[pair[0]];
        var b = proj[pair[1]];
        var depth = (a.depth + b.depth) / 2;
        var isFg = a.rawZ > -0.28 || b.rawZ > -0.28;

        var baseAlpha = (0.08 + depth * 0.32) * (0.8 + state.energy * 0.7);

        if (isFg) {
          ctx.strokeStyle = 'rgba(56, 189, 248, ' + Math.min(0.92, baseAlpha * 1.35) + ')';
          ctx.lineWidth = 0.65 + depth * 0.95;
        } else {
          ctx.strokeStyle = 'rgba(148, 163, 184, ' + Math.min(0.32, baseAlpha * 0.45) + ')';
          ctx.lineWidth = 0.5;
        }

        ctx.beginPath();
        ctx.moveTo(a.sx, a.sy);
        ctx.lineTo(b.sx, b.sy);
        ctx.stroke();
      }

      // 8. Neural Nodes: Pearl Porcelain, Metallic Sapphire & Radiant Cyan Suns
      var sorted = proj
        .map(function (p, idx) {
          return { idx: idx, depth: p.depth };
        })
        .sort(function (a, b) {
          return a.depth - b.depth;
        });

      for (var sIdx = 0; sIdx < sorted.length; sIdx += 1) {
        var pIdx = sorted[sIdx].idx;
        var p = proj[pIdx];
        var twinkle = 0.5 + 0.5 * Math.sin(state.pulse * 1.8 + pIdx * 0.8);
        var pr = (1.2 + p.depth * 2.8) * (1 + state.energy * 0.16);
        var pAlpha = (0.35 + p.depth * 0.65) * (0.85 + twinkle * 0.15);

        // A. Radiant Cyan Suns with 4-Point Starburst Flare
        if (p.isRadiantStar) {
          var starGlowR = pr * (2.8 + twinkle * 0.8);
          var starGrad = ctx.createRadialGradient(p.sx, p.sy, 0, p.sx, p.sy, starGlowR);
          starGrad.addColorStop(0, 'rgba(255, 255, 255, ' + Math.min(1, pAlpha * 1.4) + ')');
          starGrad.addColorStop(0.3, 'rgba(56, 189, 248, ' + Math.min(0.85, pAlpha * 1.1) + ')');
          starGrad.addColorStop(0.7, 'rgba(37, 99, 235, ' + Math.min(0.45, pAlpha * 0.6) + ')');
          starGrad.addColorStop(1, 'rgba(37, 99, 235, 0)');

          ctx.beginPath();
          ctx.arc(p.sx, p.sy, starGlowR, 0, Math.PI * 2);
          ctx.fillStyle = starGrad;
          ctx.fill();

          if (p.depth > 0.55) {
            var flareLen = pr * 3.4;
            ctx.strokeStyle = 'rgba(240, 249, 255, ' + (pAlpha * 0.75) + ')';
            ctx.lineWidth = 0.75;
            ctx.beginPath();
            ctx.moveTo(p.sx - flareLen, p.sy);
            ctx.lineTo(p.sx + flareLen, p.sy);
            ctx.moveTo(p.sx, p.sy - flareLen);
            ctx.lineTo(p.sx, p.sy + flareLen);
            ctx.stroke();
          }

          ctx.beginPath();
          ctx.arc(p.sx, p.sy, pr * 1.1, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255, 255, 255, ' + pAlpha + ')';
          ctx.fill();
        }
        // B. Metallic Sapphire Cobalt Nodes
        else if (p.colorType === 'sapphire') {
          var sapphireGrad = ctx.createRadialGradient(
            p.sx - pr * 0.28,
            p.sy - pr * 0.28,
            pr * 0.05,
            p.sx,
            p.sy,
            pr
          );
          sapphireGrad.addColorStop(0, 'rgba(186, 230, 253, ' + Math.min(1, pAlpha * 1.3) + ')');
          sapphireGrad.addColorStop(0.4, 'rgba(37, 99, 235, ' + pAlpha + ')');
          sapphireGrad.addColorStop(1, 'rgba(29, 78, 216, ' + pAlpha + ')');

          ctx.beginPath();
          ctx.arc(p.sx, p.sy, pr, 0, Math.PI * 2);
          ctx.fillStyle = sapphireGrad;
          ctx.fill();
        }
        // C. Polished Pearl Porcelain Nodes
        else {
          var pearlGrad = ctx.createRadialGradient(
            p.sx - pr * 0.28,
            p.sy - pr * 0.28,
            pr * 0.05,
            p.sx,
            p.sy,
            pr
          );
          pearlGrad.addColorStop(0, 'rgba(255, 255, 255, ' + Math.min(1, pAlpha * 1.3) + ')');
          pearlGrad.addColorStop(0.4, 'rgba(241, 245, 249, ' + pAlpha + ')');
          pearlGrad.addColorStop(1, 'rgba(148, 163, 184, ' + pAlpha + ')');

          ctx.beginPath();
          ctx.arc(p.sx, p.sy, pr, 0, Math.PI * 2);
          ctx.fillStyle = pearlGrad;
          ctx.fill();
        }
      }

      ctx.restore();

      state.animFrameId = requestAnimationFrame(render);
    }

    if (state.animFrameId) {
      cancelAnimationFrame(state.animFrameId);
    }
    state.animFrameId = requestAnimationFrame(render);
  }

  // Pointer move handler
  function handlePointerMove(clientX, clientY) {
    var canvas = document.getElementById('cwpNeuralCoreCanvas');
    if (!canvas) return;
    var rect = canvas.getBoundingClientRect();
    var mx = clientX - (rect.left + rect.width / 2);
    var my = clientY - (rect.top + rect.height / 2);
    var dist = Math.hypot(mx, my);
    var influence = Math.max(0, 1 - dist / 500);

    state.targetRotY = (mx / 240) * 0.95;
    state.targetRotX = (-my / 240) * 0.95;
    state.targetEnergy = 0.3 + influence * 0.7;
  }

  function handlePointerLeave() {
    state.targetRotX = 0;
    state.targetRotY = 0;
    state.targetEnergy = 0.28;
    state.active = false;
  }

  // Sizing update
  function updateSizing() {
    state.coreSize = calculateCoreSize();
    var btn = document.getElementById('cwpCoreBtn');
    if (btn) {
      btn.style.width = state.coreSize + 'px';
      btn.style.height = state.coreSize + 'px';
    }
  }

  // Initialize
  function init() {
    generateNodes();
    updateSizing();

    var btn = document.getElementById('cwpCoreBtn');
    var canvas = document.getElementById('cwpNeuralCoreCanvas');
    var introBtn = document.getElementById('cwpCoreIntroBtn');
    var pwInput = document.getElementById('adminPasswordInput');

    if (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        activateCore();
      });
      btn.addEventListener('mouseenter', function () {
        state.active = true;
      });
      btn.addEventListener('mouseleave', function () {
        state.active = false;
      });
      btn.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          activateCore();
        }
      });
    }

    if (introBtn) {
      introBtn.addEventListener('click', function (e) {
        e.preventDefault();
        activateCore();
      });
    }

    if (pwInput) {
      pwInput.addEventListener('input', function () {
        var val = (pwInput.value || '').trim();
        if (val.length > 0) {
          clearInactivityTimer();
        } else {
          startInactivityTimer();
        }
      });
    }

    window.addEventListener('resize', updateSizing);

    window.addEventListener('mousemove', function (e) {
      handlePointerMove(e.clientX, e.clientY);
    }, { passive: true });

    window.addEventListener('touchmove', function (e) {
      if (e.touches && e.touches.length > 0) {
        handlePointerMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: true });

    window.addEventListener('mouseout', handlePointerLeave);
    window.addEventListener('touchend', handlePointerLeave);

    document.addEventListener('visibilitychange', function () {
      state.paused = document.hidden;
      if (!document.hidden) {
        startRenderLoop();
      }
    });

    setStage('intro');
    startRenderLoop();
    state.isInitialized = true;
  }

  // Global API
  window.CwpNeuralCore = {
    init: init,
    setStage: setStage,
    getStage: function () {
      return state.stage;
    },
    activateCore: activateCore,
    reset: function () {
      setStage('intro');
    }
  };

  // Auto-init on DOMContentLoaded if gate is present
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      var gate = document.getElementById('adminAuthGate');
      if (gate && !state.isInitialized) {
        init();
      }
    });
  } else {
    var gate = document.getElementById('adminAuthGate');
    if (gate && !state.isInitialized) {
      init();
    }
  }

})(window, document);
