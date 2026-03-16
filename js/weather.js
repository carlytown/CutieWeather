(() => {
  "use strict";

  // ── State ──
  let unit = "fahrenheit"; // "celsius" | "fahrenheit"
  let forecastDays = 7;
  let currentLat = null;
  let currentLon = null;
  let weatherCache = null;
  let showFullState = false; // toggle for US state name display

  // ── US state abbreviation map ──
  const US_STATES = {
    "Alabama":"AL","Alaska":"AK","Arizona":"AZ","Arkansas":"AR","California":"CA",
    "Colorado":"CO","Connecticut":"CT","Delaware":"DE","Florida":"FL","Georgia":"GA",
    "Hawaii":"HI","Idaho":"ID","Illinois":"IL","Indiana":"IN","Iowa":"IA",
    "Kansas":"KS","Kentucky":"KY","Louisiana":"LA","Maine":"ME","Maryland":"MD",
    "Massachusetts":"MA","Michigan":"MI","Minnesota":"MN","Mississippi":"MS","Missouri":"MO",
    "Montana":"MT","Nebraska":"NE","Nevada":"NV","New Hampshire":"NH","New Jersey":"NJ",
    "New Mexico":"NM","New York":"NY","North Carolina":"NC","North Dakota":"ND","Ohio":"OH",
    "Oklahoma":"OK","Oregon":"OR","Pennsylvania":"PA","Rhode Island":"RI","South Carolina":"SC",
    "South Dakota":"SD","Tennessee":"TN","Texas":"TX","Utah":"UT","Vermont":"VT",
    "Virginia":"VA","Washington":"WA","West Virginia":"WV","Wisconsin":"WI","Wyoming":"WY",
    "District of Columbia":"DC",
  };
  const US_ABBREV_TO_FULL = Object.fromEntries(Object.entries(US_STATES).map(([k,v]) => [v,k]));

  // Convert a city name string to use state abbreviation or full name
  function cityNameWithAbbrev(name) {
    // Try "City, FullState, USA" → "City, AB, USA"
    for (const [full, abbr] of Object.entries(US_STATES)) {
      const re = new RegExp(`,\\s*${full}\\s*,\\s*USA?`, "i");
      if (re.test(name)) return name.replace(re, `, ${abbr}, USA`);
    }
    return name;
  }
  function cityNameWithFull(name) {
    // Try "City, AB, USA" → "City, FullState, USA"
    for (const [abbr, full] of Object.entries(US_ABBREV_TO_FULL)) {
      const re = new RegExp(`,\\s*${abbr}\\s*,\\s*USA?`, "i");
      if (re.test(name)) return name.replace(re, `, ${full}, USA`);
    }
    return name;
  }

  // ── DOM refs ──
  const $ = (s) => document.querySelector(s);
  const cityInput = $("#city-input");
  const searchBtn = $("#search-btn");
  const locateBtn = $("#locate-btn");
  const suggestionsEl = $("#suggestions");
  const loadingEl = $("#loading");
  const errorEl = $("#error");

  // ── Temperature → pastel color (0°F = deep indigo, 100°F = soft rose) ──
  function tempFToColor(f) {
    // Widen range to -10..110 for more variation at the extremes
    const t = Math.max(-10, Math.min(110, f));
    // Pastel color stops with more granularity
    const stops = [
      [-10, 60,  50, 120],   // -10°F – deep indigo
      [0,   80,  80, 160],   //  0°F  – muted indigo
      [8,  100, 110, 190],   //  8°F  – steel blue
      [16, 120, 140, 210],   // 16°F  – periwinkle
      [24, 130, 170, 220],   // 24°F  – soft blue
      [32, 140, 195, 225],   // 32°F  – powder blue (freezing)
      [38, 140, 210, 210],   // 38°F  – pale teal
      [44, 145, 215, 195],   // 44°F  – seafoam
      [50, 150, 210, 170],   // 50°F  – sage
      [56, 160, 205, 145],   // 56°F  – soft green
      [62, 175, 200, 125],   // 62°F  – spring green
      [68, 195, 205, 115],   // 68°F  – chartreuse
      [72, 215, 205, 110],   // 72°F  – warm lime
      [76, 230, 200, 115],   // 76°F  – pastel yellow
      [80, 235, 190, 120],   // 80°F  – golden
      [84, 235, 175, 125],   // 84°F  – light apricot
      [88, 230, 160, 130],   // 88°F  – peach
      [92, 225, 145, 130],   // 92°F  – salmon
      [96, 220, 130, 130],   // 96°F  – soft coral
      [100, 210, 115, 125],  // 100°F – dusty rose
      [110, 190,  90, 110],  // 110°F – deep rose
    ];
    // Find the two surrounding stops
    let lo = stops[0], hi = stops[stops.length - 1];
    for (let i = 0; i < stops.length - 1; i++) {
      if (t >= stops[i][0] && t <= stops[i + 1][0]) {
        lo = stops[i];
        hi = stops[i + 1];
        break;
      }
    }
    const pct = (hi[0] === lo[0]) ? 0 : (t - lo[0]) / (hi[0] - lo[0]);
    const r = Math.round(lo[1] + (hi[1] - lo[1]) * pct);
    const g = Math.round(lo[2] + (hi[2] - lo[2]) * pct);
    const b = Math.round(lo[3] + (hi[3] - lo[3]) * pct);
    return `rgb(${r},${g},${b})`;
  }

  function tempFToNightColor(f) {
    const t = Math.max(-10, Math.min(110, f));
    const stops = [
      [-10,  8,  5, 45],    // -10°F – icy deep violet
      [0,   12, 10, 55],    //  0°F  – cold indigo
      [8,   14, 18, 68],    //  8°F  – frigid blue
      [16,  16, 28, 78],    // 16°F  – dark sapphire
      [24,  18, 38, 82],    // 24°F  – midnight blue
      [32,  18, 45, 78],    // 32°F  – freezing teal-blue
      [38,  16, 48, 68],    // 38°F  – cold teal
      [44,  14, 48, 55],    // 44°F  – dark cyan
      [50,  16, 44, 42],    // 50°F  – deep sea green
      [56,  22, 40, 32],    // 56°F  – dark forest
      [62,  30, 36, 26],    // 62°F  – olive night
      [68,  38, 32, 22],    // 68°F  – warm dusk
      [72,  48, 30, 20],    // 72°F  – dark amber
      [76,  55, 28, 18],    // 76°F  – burnt sienna
      [80,  60, 25, 16],    // 80°F  – dark copper
      [84,  62, 22, 18],    // 84°F  – deep terracotta
      [88,  60, 18, 20],    // 88°F  – dark rust
      [92,  58, 14, 22],    // 92°F  – crimson night
      [96,  55, 12, 25],    // 96°F  – dark garnet
      [100, 50, 10, 28],    // 100°F – deep burgundy
      [110, 42,  8, 30],    // 110°F – blackened wine
    ];
    let lo = stops[0], hi = stops[stops.length - 1];
    for (let i = 0; i < stops.length - 1; i++) {
      if (t >= stops[i][0] && t <= stops[i + 1][0]) {
        lo = stops[i];
        hi = stops[i + 1];
        break;
      }
    }
    const pct = (hi[0] === lo[0]) ? 0 : (t - lo[0]) / (hi[0] - lo[0]);
    const r = Math.round(lo[1] + (hi[1] - lo[1]) * pct);
    const g = Math.round(lo[2] + (hi[2] - lo[2]) * pct);
    const b = Math.round(lo[3] + (hi[3] - lo[3]) * pct);
    return `rgb(${r},${g},${b})`;
  }

  // ── Render background gradient from hourly temperatures ──
  function renderBackgroundGradient(data) {
    const h = data.hourly;
    const firstDay = data.daily.time[0];

    // Determine if nighttime at this location
    const tz = data.timezone;
    let isNightBG = false;
    try {
      const now = new Date();
      const localHour = parseInt(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hour12: false }).format(now), 10);
      const srH = parseInt(data.daily.sunrise[0].slice(11, 13), 10);
      const ssH = parseInt(data.daily.sunset[0].slice(11, 13), 10);
      isNightBG = localHour < srH || localHour >= ssH;
    } catch (_) {}

    const colorFn = isNightBG ? tempFToNightColor : tempFToColor;

    // Build a 24-slot array (hour 0–23) for today
    const hourTemps = new Array(24).fill(null);
    for (let i = 0; i < h.time.length; i++) {
      if (h.time[i].startsWith(firstDay)) {
        const hr = parseInt(h.time[i].slice(11, 13), 10);
        if (hr >= 0 && hr < 24) hourTemps[hr] = h.temperature_2m[i];
      }
    }

    // Build gradient stops for every hour that has data
    const colorStops = [];
    for (let hr = 0; hr < 24; hr++) {
      if (hourTemps[hr] === null) continue;
      const f = (hourTemps[hr] * 9) / 5 + 32;
      const color = colorFn(f);
      const pct = (hr / 23) * 100; // 0=midnight at top, 23=11PM at bottom
      colorStops.push(`${color} ${pct.toFixed(1)}%`);
    }
    if (colorStops.length === 0) return;

    document.body.style.background = `linear-gradient(to bottom, ${colorStops.join(", ")})`;
    document.body.style.backgroundAttachment = "fixed";
  }

  // ── Weather particle effects (rain / snow / wind) ──
  const fxCanvas = $("#weather-fx");
  const fxCtx = fxCanvas.getContext("2d");
  let fxParticles = [];
  let fxType = null; // "rain" | "snow" | "wind" | null
  let fxIntensity = 0; // 0-1
  let fxAnimId = null;
  let lightningActive = false;
  let lightningFlash = 0; // current flash brightness 0-1
  let lightningTimer = null;
  let lightningBolt = null; // current bolt path to draw
  let swallowFallsMode = false; // Easter egg!
  let swallowFallsParticles = [];
  let fireworksMode = false; // July 4th USA fireworks
  let fireworksShells = []; // active firework shells
  let fireworksPreview = false; // set to true to preview fireworks now
  let cherryBlossomMode = false; // cherry blossom season for VA/DC/MD
  let blossomPetals = [];
  let birthdaySparkleMode = false; // birthday confetti easter egg
  let sparkleParticles = [];
  let birthdaySparklePreview = false; // set to true to preview confetti now
  let newYearSparkleMode = false; // New Year's sparkles
  let nySparkleParticles = [];
  let halloweenMode = false;
  let halloweenParticles = [];
  let halloweenPreview = false;
  let nightTwinkleMode = false;
  let twinkleStars = [];
  let dayDustMode = false;
  let dustMotes = [];

  // Snow accumulation: array of heights per pixel column
  let snowAccum = [];
  const SNOW_MAX_HEIGHT = 120; // max accumulation in pixels
  const SNOW_ACCUM_RATE = 1.8; // how much each flake adds

  function resetSnowAccum() {
    snowAccum = new Array(Math.max(1, fxCanvas.width)).fill(0);
  }
  // Clear accumulation on scroll
  window.addEventListener("scroll", () => {
    if (fxType === "snow") {
      for (let i = 0; i < snowAccum.length; i++) {
        snowAccum[i] = Math.max(0, snowAccum[i] - 2);
      }
    }
  });

  function resizeFxCanvas() {
    fxCanvas.width = window.innerWidth;
    fxCanvas.height = window.innerHeight;
    resetSnowAccum();
    spawnParticles();
  }
  resizeFxCanvas();
  window.addEventListener("resize", resizeFxCanvas);

  function classifyWeatherFX(code, windSpeed) {
    // Snow codes
    if ([71, 73, 75, 77, 85, 86].includes(code)) {
      const intensityMap = { 71: 0.3, 73: 0.6, 75: 1, 77: 0.4, 85: 0.4, 86: 0.8 };
      return { type: "snow", intensity: intensityMap[code] || 0.5, lightning: false };
    }
    // Rain / drizzle / shower codes
    if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99].includes(code)) {
      const intensityMap = {
        51: 0.2, 53: 0.4, 55: 0.6, 56: 0.3, 57: 0.5,
        61: 0.3, 63: 0.6, 65: 1, 66: 0.4, 67: 0.8,
        80: 0.3, 81: 0.6, 82: 1, 95: 0.7, 96: 0.8, 99: 1,
      };
      return { type: "rain", intensity: intensityMap[code] || 0.5, lightning: [95, 96, 99].includes(code) };
    }
    // Wind: if wind speed > 30 km/h and no precip, show wind streaks
    if (windSpeed > 30) {
      return { type: "wind", intensity: Math.min(1, (windSpeed - 30) / 40), lightning: false };
    }
    return { type: null, intensity: 0, lightning: false };
  }

  function spawnParticles() {
    fxParticles = [];
    if (swallowFallsMode) {
      // Cloudy with a Chance of Meatballs! — spawn DOM food rain
      const layer = $("#emoji-rain-layer");
      layer.innerHTML = "";
      const W = window.innerWidth;
      const H = window.innerHeight;
      const foods = ["🍝", "🧆", "🍖", "🥩", "🧀", "🍕", "🌭", "🥐", "🍞", "🥧", "🍰", "🧁", "🍗", "🥪"];
      const count = 30;
      swallowFallsParticles = [];
      for (let i = 0; i < count; i++) {
        const el = document.createElement("span");
        const emoji = foods[Math.floor(Math.random() * foods.length)];
        const size = 20 + Math.random() * 24;
        el.textContent = emoji;
        el.style.fontSize = size + "px";
        el.style.lineHeight = "1";
        const x = Math.random() * W;
        const y = Math.random() * H;
        el.style.left = "0px";
        el.style.top = "0px";
        el.style.transform = `translate(${x}px, ${y}px)`;
        layer.appendChild(el);
        swallowFallsParticles.push({
          el,
          x,
          y,
          size,
          speed: 1 + Math.random() * 2.5,
          drift: (Math.random() - 0.5) * 0.8,
          wobble: Math.random() * Math.PI * 2,
          wobbleSpeed: 0.01 + Math.random() * 0.02,
          rotation: Math.random() * Math.PI * 2,
          rotSpeed: (Math.random() - 0.5) * 0.03,
        });
      }
      return;
    }
    if (!fxType) return;
    const W = fxCanvas.width;
    const H = fxCanvas.height;
    if (fxType === "rain") {
      const count = Math.floor(40 * fxIntensity) + 15;
      for (let i = 0; i < count; i++) {
        fxParticles.push({
          x: Math.random() * W,
          y: Math.random() * H,
          len: 14 + Math.random() * 16,
          speed: 10 + Math.random() * 12 + fxIntensity * 8,
          drift: 3 + Math.random() * 3,
          opacity: 0.3 + Math.random() * 0.25,
          width: 2.5 + Math.random() * 2,
        });
      }
    } else if (fxType === "snow") {
      const count = Math.floor(50 * fxIntensity) + 25;
      for (let i = 0; i < count; i++) {
        fxParticles.push({
          x: Math.random() * W,
          y: Math.random() * H,
          r: 2.5 + Math.random() * 3.5,
          arms: 6,
          rotation: Math.random() * Math.PI * 2,
          rotSpeed: (Math.random() - 0.5) * 0.02,
          speed: 1.2 + Math.random() * 2.5 + fxIntensity * 1.5,
          drift: Math.random() * 1.2 - 0.6,
          wobble: Math.random() * Math.PI * 2,
          wobbleSpeed: 0.01 + Math.random() * 0.02,
          opacity: 0.5 + Math.random() * 0.4,
        });
      }
    } else if (fxType === "wind") {
      const count = Math.floor(20 * fxIntensity) + 8;
      for (let i = 0; i < count; i++) {
        fxParticles.push({
          x: Math.random() * W,
          y: Math.random() * H,
          rx: 60 + Math.random() * 100,
          ry: 15 + Math.random() * 25,
          rot: (Math.random() - 0.5) * 0.4,
          drift: 3.5 + Math.random() * 4.0,
          wobble: Math.random() * Math.PI * 2,
          wobbleSpeed: 0.005 + Math.random() * 0.01,
          wobbleAmp: 0.3 + Math.random() * 0.5,
          opacity: 0.12 + Math.random() * 0.10,
          fade: Math.random() * Math.PI * 2,
          fadeSpeed: 0.006 + Math.random() * 0.012,
        });
      }
    }
  }

  function animateFX() {
    const W = fxCanvas.width;
    const H = fxCanvas.height;
    fxCtx.clearRect(0, 0, W, H);

    if (!fxType || fxParticles.length === 0) {
      if (!swallowFallsMode && !fireworksMode && !cherryBlossomMode && !birthdaySparkleMode && !newYearSparkleMode && !halloweenMode && !nightTwinkleMode && !dayDustMode) {
        fxAnimId = requestAnimationFrame(animateFX);
        return;
      }
    }

    // July 4th fireworks
    if (fireworksMode) {
      drawFireworks(fxCtx, W, H);
      if (cherryBlossomMode) drawCherryBlossoms(fxCtx, W, H);
      fxAnimId = requestAnimationFrame(animateFX);
      return;
    }

    // Easter egg: Swallow Falls food rain
    if (swallowFallsMode && swallowFallsParticles.length > 0) {
      for (const p of swallowFallsParticles) {
        p.wobble += p.wobbleSpeed;
        p.rotation += p.rotSpeed;
        p.x += p.drift + Math.sin(p.wobble) * 0.3;
        p.y += p.speed;
        if (p.y > H + p.size) { p.y = -p.size; p.x = Math.random() * W; }
        if (p.x > W) p.x = 0;
        if (p.x < 0) p.x = W;
        p.el.style.transform = `translate(${p.x}px, ${p.y}px) rotate(${p.rotation}rad)`;
      }
      fxAnimId = requestAnimationFrame(animateFX);
      return;
    }

    if (fxType === "rain") {
      for (const p of fxParticles) {
        fxCtx.beginPath();
        fxCtx.moveTo(p.x, p.y);
        fxCtx.lineTo(p.x + p.drift, p.y + p.len);
        fxCtx.strokeStyle = `rgba(140, 180, 255, ${p.opacity})`;
        fxCtx.lineWidth = p.width;
        fxCtx.lineCap = "round";
        fxCtx.stroke();
        p.x += p.drift;
        p.y += p.speed;
        if (p.y > H) { p.y = -p.len; p.x = Math.random() * W; }
        if (p.x > W) p.x = 0;
      }
    } else if (fxType === "snow") {
      // Draw accumulated snow pile
      if (snowAccum.length > 0) {
        // Smooth the accumulation for a natural look
        const smoothed = new Array(snowAccum.length);
        const smoothRadius = 8;
        for (let x = 0; x < snowAccum.length; x++) {
          let sum = 0, count = 0;
          for (let dx = -smoothRadius; dx <= smoothRadius; dx++) {
            const nx = x + dx;
            if (nx >= 0 && nx < snowAccum.length) {
              sum += snowAccum[nx];
              count++;
            }
          }
          smoothed[x] = sum / count;
        }
        fxCtx.beginPath();
        fxCtx.moveTo(0, H);
        for (let x = 0; x < smoothed.length; x += 2) {
          fxCtx.lineTo(x, H - smoothed[x]);
        }
        fxCtx.lineTo(smoothed.length, H);
        fxCtx.closePath();
        fxCtx.fillStyle = "rgba(240, 245, 255, 0.8)";
        fxCtx.fill();
        // Subtle top edge highlight
        fxCtx.beginPath();
        fxCtx.moveTo(0, H - smoothed[0]);
        for (let x = 2; x < smoothed.length; x += 2) {
          fxCtx.lineTo(x, H - smoothed[x]);
        }
        fxCtx.strokeStyle = "rgba(255, 255, 255, 0.9)";
        fxCtx.lineWidth = 1.5;
        fxCtx.stroke();
      }

      // Draw and animate falling snowflakes
      for (const p of fxParticles) {
        p.wobble += p.wobbleSpeed;
        p.rotation += p.rotSpeed;

        // Draw snowflake star shape
        fxCtx.save();
        fxCtx.translate(p.x, p.y);
        fxCtx.rotate(p.rotation);
        fxCtx.strokeStyle = `rgba(255, 255, 255, ${p.opacity})`;
        fxCtx.lineWidth = 1;
        fxCtx.lineCap = "round";
        for (let a = 0; a < p.arms; a++) {
          const angle = (Math.PI * 2 / p.arms) * a;
          const cos = Math.cos(angle);
          const sin = Math.sin(angle);
          // Main arm
          fxCtx.beginPath();
          fxCtx.moveTo(0, 0);
          fxCtx.lineTo(cos * p.r, sin * p.r);
          fxCtx.stroke();
          // Small branches at 60% of arm length
          const bx = cos * p.r * 0.55;
          const by = sin * p.r * 0.55;
          const branchLen = p.r * 0.3;
          const bAngle1 = angle + 0.5;
          const bAngle2 = angle - 0.5;
          fxCtx.beginPath();
          fxCtx.moveTo(bx, by);
          fxCtx.lineTo(bx + Math.cos(bAngle1) * branchLen, by + Math.sin(bAngle1) * branchLen);
          fxCtx.stroke();
          fxCtx.beginPath();
          fxCtx.moveTo(bx, by);
          fxCtx.lineTo(bx + Math.cos(bAngle2) * branchLen, by + Math.sin(bAngle2) * branchLen);
          fxCtx.stroke();
        }
        fxCtx.restore();

        p.x += p.drift + Math.sin(p.wobble) * 0.5;
        p.y += p.speed;

        // Check if flake hits the snow pile or the bottom
        const col = Math.round(p.x);
        if (col >= 0 && col < snowAccum.length) {
          const surfaceY = H - snowAccum[col];
          if (p.y + p.r >= surfaceY) {
            // Add to accumulation in a small radius for natural look
            const spread = Math.floor(p.r * 3);
            for (let dx = -spread; dx <= spread; dx++) {
              const c = col + dx;
              if (c >= 0 && c < snowAccum.length) {
                const falloff = 1 - Math.abs(dx) / (spread + 1);
                snowAccum[c] = Math.min(SNOW_MAX_HEIGHT, snowAccum[c] + SNOW_ACCUM_RATE * falloff);
              }
            }
            // Reset flake to top
            p.y = -p.r * 2;
            p.x = Math.random() * W;
            continue;
          }
        }

        if (p.y > H + p.r) { p.y = -p.r * 2; p.x = Math.random() * W; }
        if (p.x > W) p.x = 0;
        if (p.x < 0) p.x = W;
      }
    } else if (fxType === "wind") {
      const isNight = document.body.classList.contains("night");
      const windR = isNight ? 210 : 255;
      const windG = isNight ? 222 : 255;
      const windB = isNight ? 235 : 255;
      const alphaBoost = isNight ? 1.0 : 1.8;
      fxCtx.save();
      for (const p of fxParticles) {
        const alpha = p.opacity * alphaBoost * (0.3 + 0.7 * Math.sin(p.fade));
        if (alpha < 0.01) { p.fade += p.fadeSpeed; p.x += p.drift; continue; }
        fxCtx.save();
        fxCtx.translate(p.x, p.y);
        fxCtx.rotate(p.rot + Math.sin(p.wobble) * 0.15);
        fxCtx.scale(1, p.ry / p.rx);
        const grad = fxCtx.createRadialGradient(0, 0, 0, 0, 0, p.rx);
        grad.addColorStop(0, `rgba(${windR}, ${windG}, ${windB}, ${alpha})`);
        grad.addColorStop(0.4, `rgba(${windR}, ${windG}, ${windB}, ${alpha * 0.5})`);
        grad.addColorStop(1, `rgba(${windR}, ${windG}, ${windB}, 0)`);
        fxCtx.fillStyle = grad;
        fxCtx.beginPath();
        fxCtx.arc(0, 0, p.rx, 0, Math.PI * 2);
        fxCtx.fill();
        fxCtx.restore();
        p.x += p.drift;
        p.y += Math.sin(p.wobble) * p.wobbleAmp;
        p.wobble += p.wobbleSpeed;
        p.fade += p.fadeSpeed;
        if (p.x > W + p.rx * 2) {
          p.x = -p.rx * 2;
          p.y = Math.random() * H;
        }
      }
      fxCtx.restore();
    }

    // Draw lightning flash overlay
    if (lightningActive && lightningFlash > 0) {
      // Full-screen yellow flash
      fxCtx.fillStyle = `rgba(255, 245, 180, ${lightningFlash * 0.25})`;
      fxCtx.fillRect(0, 0, W, H);

      // Draw bolt if active
      if (lightningBolt && lightningFlash > 0.3) {
        fxCtx.beginPath();
        fxCtx.moveTo(lightningBolt[0].x, lightningBolt[0].y);
        for (let i = 1; i < lightningBolt.length; i++) {
          fxCtx.lineTo(lightningBolt[i].x, lightningBolt[i].y);
        }
        fxCtx.strokeStyle = `rgba(255, 250, 200, ${lightningFlash})`;
        fxCtx.lineWidth = 3;
        fxCtx.shadowColor = "rgba(255, 240, 150, 0.8)";
        fxCtx.shadowBlur = 20;
        fxCtx.stroke();

        // Thinner bright core
        fxCtx.beginPath();
        fxCtx.moveTo(lightningBolt[0].x, lightningBolt[0].y);
        for (let i = 1; i < lightningBolt.length; i++) {
          fxCtx.lineTo(lightningBolt[i].x, lightningBolt[i].y);
        }
        fxCtx.strokeStyle = `rgba(255, 255, 220, ${lightningFlash})`;
        fxCtx.lineWidth = 1.5;
        fxCtx.shadowBlur = 0;
        fxCtx.stroke();

        fxCtx.shadowColor = "transparent";
        fxCtx.shadowBlur = 0;
      }

      // Fade out
      lightningFlash = Math.max(0, lightningFlash - 0.04);
    }

    // Night twinkle stars
    if (nightTwinkleMode) drawTwinkleStars(fxCtx, W, H);

    // Daytime dust motes
    if (dayDustMode) drawDustMotes(fxCtx, W, H);

    // Cherry blossoms overlay (draws on top of weather)
    if (cherryBlossomMode) drawCherryBlossoms(fxCtx, W, H);

    // Birthday confetti overlay
    if (birthdaySparkleMode) drawConfetti(fxCtx, W, H);

    // New Year's sparkles overlay
    if (newYearSparkleMode) drawNYSparkles(fxCtx, W, H);

    // Halloween emoji rain overlay
    if (halloweenMode) drawHalloweenEmoji(fxCtx, W, H);

    fxAnimId = requestAnimationFrame(animateFX);
  }

  function generateBolt(W, H) {
    const points = [];
    let x = W * (0.2 + Math.random() * 0.6);
    let y = 0;
    const segments = 8 + Math.floor(Math.random() * 8);
    const stepY = H / segments;
    points.push({ x, y });
    for (let i = 0; i < segments; i++) {
      x += (Math.random() - 0.5) * 120;
      y += stepY * (0.7 + Math.random() * 0.6);
      points.push({ x, y });
    }
    // Ensure the last point reaches the bottom
    points[points.length - 1].y = H;
    return points;
  }

  // ── Synthesize thunder: sharp crack + rolling rumble ──
  function playThunder() {
    try {
      const ctx = rainAudioCtx || (rainAudioCtx = new (window.AudioContext || window.webkitAudioContext)());
      if (ctx.state === "suspended") ctx.resume();
      const now = ctx.currentTime;
      const delay = 0.3 + Math.random() * 0.8;

      // ── CRACK: short burst of white noise, wide frequency ──
      const crackDur = 0.12;
      const crackSamples = Math.floor(crackDur * ctx.sampleRate);
      const crackBuf = ctx.createBuffer(1, crackSamples, ctx.sampleRate);
      const crackData = crackBuf.getChannelData(0);
      for (let i = 0; i < crackSamples; i++) {
        crackData[i] = (Math.random() * 2 - 1) * (1 - i / crackSamples);
      }
      const crackSrc = ctx.createBufferSource();
      crackSrc.buffer = crackBuf;
      const crackFilter = ctx.createBiquadFilter();
      crackFilter.type = "bandpass";
      crackFilter.frequency.value = 1800;
      crackFilter.Q.value = 0.4;
      const crackGain = ctx.createGain();
      crackGain.gain.setValueAtTime(0, now + delay);
      crackGain.gain.linearRampToValueAtTime(0.35, now + delay + 0.005);
      crackGain.gain.exponentialRampToValueAtTime(0.001, now + delay + crackDur);
      crackSrc.connect(crackFilter);
      crackFilter.connect(crackGain);
      crackGain.connect(ctx.destination);
      crackSrc.start(now + delay);
      crackSrc.stop(now + delay + crackDur + 0.01);

      // ── RUMBLE: brownian noise, very low, rolling for 2-3s ──
      const rumbleDur = 2 + Math.random() * 1.5;
      const rumbleSamples = Math.floor(rumbleDur * ctx.sampleRate);
      const rumbleBuf = ctx.createBuffer(1, rumbleSamples, ctx.sampleRate);
      const rumbleData = rumbleBuf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < rumbleSamples; i++) {
        last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
        rumbleData[i] = last * 3.5;
      }
      const rumbleSrc = ctx.createBufferSource();
      rumbleSrc.buffer = rumbleBuf;
      const rumbleLp = ctx.createBiquadFilter();
      rumbleLp.type = "lowpass";
      rumbleLp.frequency.value = 120;
      rumbleLp.Q.value = 0.7;
      const rumbleGain = ctx.createGain();
      const rumbleStart = delay + 0.04;
      rumbleGain.gain.setValueAtTime(0, now + rumbleStart);
      rumbleGain.gain.linearRampToValueAtTime(0.18, now + rumbleStart + 0.08);
      // Wobble the rumble for rolling effect
      rumbleGain.gain.linearRampToValueAtTime(0.08, now + rumbleStart + 0.4);
      rumbleGain.gain.linearRampToValueAtTime(0.13, now + rumbleStart + 0.7);
      rumbleGain.gain.linearRampToValueAtTime(0.06, now + rumbleStart + 1.2);
      rumbleGain.gain.exponentialRampToValueAtTime(0.001, now + rumbleStart + rumbleDur);
      rumbleSrc.connect(rumbleLp);
      rumbleLp.connect(rumbleGain);
      rumbleGain.connect(ctx.destination);
      rumbleSrc.start(now + rumbleStart);
      rumbleSrc.stop(now + rumbleStart + rumbleDur + 0.1);
    } catch (_) { /* audio unavailable */ }
  }

  function scheduleLightning() {
    if (!lightningActive) return;
    const delay = 2000 + Math.random() * 6000;
    lightningTimer = setTimeout(() => {
      if (!lightningActive) return;
      const W = fxCanvas.width;
      const H = fxCanvas.height;
      lightningBolt = generateBolt(W, H);
      lightningFlash = 1;
      playThunder();
      // Double flash effect
      setTimeout(() => {
        if (lightningActive) lightningFlash = 0.8;
      }, 100);
      scheduleLightning();
    }, delay);
  }

  function stopLightning() {
    lightningActive = false;
    lightningFlash = 0;
    lightningBolt = null;
    if (lightningTimer) { clearTimeout(lightningTimer); lightningTimer = null; }
  }

  // ── Rain ambient sound via Web Audio API ──
  let rainAudioCtx = null;
  let rainNoiseSource = null;
  let rainGainNode = null;
  let rainFilterNode = null;
  let rainHighFilter = null;

  let rainDropInterval = null;

  function startRainSound(intensity) {
    try {
      if (!rainAudioCtx) rainAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = rainAudioCtx;
      if (ctx.state === "suspended") ctx.resume();

      // If already playing, just adjust volume
      if (rainNoiseSource) {
        const vol = 0.01 + intensity * 0.04;
        rainGainNode.gain.linearRampToValueAtTime(vol, ctx.currentTime + 0.5);
        rainFilterNode.frequency.linearRampToValueAtTime(400 + intensity * 1000, ctx.currentTime + 0.5);
        return;
      }

      // ── Layer 1: Soft pink noise bed ──
      const sampleRate = ctx.sampleRate;
      const bufferLen = sampleRate * 2;
      const buffer = ctx.createBuffer(2, bufferLen, sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const data = buffer.getChannelData(ch);
        let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
        for (let i = 0; i < bufferLen; i++) {
          const white = Math.random() * 2 - 1;
          b0 = 0.99886 * b0 + white * 0.0555179;
          b1 = 0.99332 * b1 + white * 0.0750759;
          b2 = 0.96900 * b2 + white * 0.1538520;
          b3 = 0.86650 * b3 + white * 0.3104856;
          b4 = 0.55000 * b4 + white * 0.5329522;
          b5 = -0.7616 * b5 - white * 0.0168980;
          data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.08;
          b6 = white * 0.115926;
        }
      }

      rainNoiseSource = ctx.createBufferSource();
      rainNoiseSource.buffer = buffer;
      rainNoiseSource.loop = true;

      rainFilterNode = ctx.createBiquadFilter();
      rainFilterNode.type = "lowpass";
      rainFilterNode.frequency.value = 400 + intensity * 1000;
      rainFilterNode.Q.value = 0.5;

      rainHighFilter = ctx.createBiquadFilter();
      rainHighFilter.type = "highpass";
      rainHighFilter.frequency.value = 250;
      rainHighFilter.Q.value = 0.3;

      rainGainNode = ctx.createGain();
      rainGainNode.gain.value = 0.01 + intensity * 0.04;

      rainNoiseSource.connect(rainFilterNode);
      rainFilterNode.connect(rainHighFilter);
      rainHighFilter.connect(rainGainNode);
      rainGainNode.connect(ctx.destination);
      rainNoiseSource.start();

      // ── Layer 2: Pitter-patter drops (short percussive ticks) ──
      startDrops(ctx, intensity);
    } catch (_) { /* audio unavailable */ }
  }

  function startDrops(ctx, intensity) {
    stopDrops();
    const dropRate = Math.floor(400 - intensity * 340); // light=400ms, heavy=60ms between drops
    rainDropInterval = setInterval(() => {
      if (ctx.state !== "running") return;
      playDrop(ctx, intensity);
    }, dropRate);
  }

  function playDrop(ctx, intensity) {
    try {
      const now = ctx.currentTime;
      // Short burst of noise shaped as a raindrop "tick"
      const dropLen = 0.01 + Math.random() * 0.02;
      const samples = Math.floor(dropLen * ctx.sampleRate);
      const buf = ctx.createBuffer(1, samples, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < samples; i++) {
        // Exponential decay envelope baked in
        d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (samples * 0.2));
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;

      // Bandpass to give each drop a "tink" character
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 2000 + Math.random() * 4000;
      bp.Q.value = 1 + Math.random() * 2;

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.02 + intensity * 0.08 + Math.random() * 0.03, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + dropLen + 0.02);

      // Random panning for spatial effect
      const pan = ctx.createStereoPanner();
      pan.pan.value = Math.random() * 2 - 1;

      src.connect(bp);
      bp.connect(g);
      g.connect(pan);
      pan.connect(ctx.destination);
      src.start(now);
      src.stop(now + dropLen + 0.03);
    } catch (_) {}
  }

  function stopDrops() {
    if (rainDropInterval) {
      clearInterval(rainDropInterval);
      rainDropInterval = null;
    }
  }

  function stopRainSound() {
    stopDrops();
    if (rainNoiseSource) {
      try {
        if (rainGainNode && rainAudioCtx) {
          rainGainNode.gain.linearRampToValueAtTime(0, rainAudioCtx.currentTime + 0.5);
          setTimeout(() => {
            try { rainNoiseSource.stop(); } catch (_) {}
            rainNoiseSource = null;
            rainGainNode = null;
            rainFilterNode = null;
            rainHighFilter = null;
          }, 600);
        } else {
          rainNoiseSource.stop();
          rainNoiseSource = null;
        }
      } catch (_) {
        rainNoiseSource = null;
      }
    }
  }

  // ── Birthday confetti helpers ──
  function spawnConfetti() {
    sparkleParticles = [];
    const W = fxCanvas.width;
    const H = fxCanvas.height;
    const count = 65;
    const confettiColors = [
      [255, 100, 130], // hot pink
      [255, 180, 60],  // orange
      [100, 200, 255], // sky blue
      [180, 120, 255], // purple
      [255, 220, 80],  // yellow
      [120, 230, 150], // green
      [255, 140, 200], // pink
    ];
    for (let i = 0; i < count; i++) {
      const color = confettiColors[Math.floor(Math.random() * confettiColors.length)];
      sparkleParticles.push({
        x: Math.random() * W,
        y: Math.random() * H - H,
        w: 4 + Math.random() * 5,
        h: 6 + Math.random() * 8,
        r: color[0], g: color[1], b: color[2],
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.08,
        speed: 1 + Math.random() * 2,
        drift: (Math.random() - 0.5) * 1.2,
        wobble: Math.random() * Math.PI * 2,
        wobbleSpeed: 0.02 + Math.random() * 0.03,
        opacity: 0.6 + Math.random() * 0.4,
        shape: Math.floor(Math.random() * 3), // 0=rect, 1=circle, 2=strip
      });
    }
  }

  function drawConfetti(ctx, W, H) {
    for (const p of sparkleParticles) {
      p.wobble += p.wobbleSpeed;
      p.rotation += p.rotSpeed;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.globalAlpha = p.opacity;
      ctx.fillStyle = `rgb(${p.r}, ${p.g}, ${p.b})`;
      if (p.shape === 0) {
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      } else if (p.shape === 1) {
        ctx.beginPath();
        ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(-p.w / 2, -p.h / 4, p.w, p.h / 2);
      }
      ctx.globalAlpha = 1;
      ctx.restore();
      p.x += p.drift + Math.sin(p.wobble) * 0.5;
      p.y += p.speed;
      if (p.y > H + p.h) { p.y = -p.h * 2; p.x = Math.random() * W; }
      if (p.x > W) p.x = 0;
      if (p.x < 0) p.x = W;
    }
  }

  // ── New Year sparkle helpers ──
  function spawnNYSparkles() {
    nySparkleParticles = [];
    const W = fxCanvas.width;
    const H = fxCanvas.height;
    const count = 35;
    for (let i = 0; i < count; i++) {
      nySparkleParticles.push({
        x: Math.random() * W,
        y: Math.random() * H,
        size: 2 + Math.random() * 4,
        twinkleSpeed: 0.02 + Math.random() * 0.04,
        twinklePhase: Math.random() * Math.PI * 2,
        drift: (Math.random() - 0.5) * 0.3,
        fall: 0.1 + Math.random() * 0.3,
        hue: Math.floor(Math.random() * 4),
      });
    }
  }

  function drawNYSparkles(ctx, W, H) {
    const colors = [
      [255, 215, 100], // gold
      [210, 220, 240], // silver
      [255, 180, 210], // pink
      [255, 255, 255], // white
    ];
    for (const p of nySparkleParticles) {
      p.twinklePhase += p.twinkleSpeed;
      const alpha = 0.3 + Math.abs(Math.sin(p.twinklePhase)) * 0.7;
      const [r, g, b] = colors[p.hue];
      const s = p.size * (0.6 + Math.abs(Math.sin(p.twinklePhase)) * 0.4);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = `rgb(${r}, ${g}, ${b})`;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(0, s); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-s, 0); ctx.lineTo(s, 0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-s * 0.5, -s * 0.5); ctx.lineTo(s * 0.5, s * 0.5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(s * 0.5, -s * 0.5); ctx.lineTo(-s * 0.5, s * 0.5); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, s * 0.2, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`; ctx.fill();
      ctx.globalAlpha = 1;
      ctx.restore();
      p.x += p.drift;
      p.y += p.fall;
      if (p.y > H + p.size) { p.y = -p.size * 2; p.x = Math.random() * W; }
      if (p.x > W) p.x = 0;
      if (p.x < 0) p.x = W;
    }
  }

  // ── Halloween emoji rain ──
  function spawnHalloweenEmoji() {
    halloweenParticles = [];
    const layer = $("#emoji-rain-layer");
    layer.innerHTML = "";
    const W = window.innerWidth;
    const H = window.innerHeight;
    const emojis = ["🎃", "👻", "🦇", "🎃", "👻", "🦇", "🎃", "👻", "🕷️", "💀", "🍬"];
    const count = 35;
    for (let i = 0; i < count; i++) {
      const el = document.createElement("span");
      const emoji = emojis[Math.floor(Math.random() * emojis.length)];
      const size = 20 + Math.random() * 24;
      el.textContent = emoji;
      el.style.fontSize = size + "px";
      el.style.lineHeight = "1";
      const x = Math.random() * W;
      const y = Math.random() * H;
      el.style.left = x + "px";
      el.style.top = y + "px";
      layer.appendChild(el);
      halloweenParticles.push({
        el,
        x,
        y,
        size,
        speed: 0.8 + Math.random() * 2,
        drift: (Math.random() - 0.5) * 0.6,
        wobble: Math.random() * Math.PI * 2,
        wobbleSpeed: 0.01 + Math.random() * 0.02,
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.02,
      });
    }
  }

  function drawHalloweenEmoji(ctx, W, H) {
    for (const p of halloweenParticles) {
      p.wobble += p.wobbleSpeed;
      p.rotation += p.rotSpeed;
      p.x += p.drift + Math.sin(p.wobble) * 0.4;
      p.y += p.speed;
      if (p.y > H + p.size) { p.y = -p.size; p.x = Math.random() * W; }
      if (p.x > W) p.x = 0;
      if (p.x < 0) p.x = W;
      p.el.style.transform = `translate(${p.x}px, ${p.y}px) rotate(${p.rotation}rad)`;
    }
  }

  // ── Cherry blossom helpers ──
  function spawnBlossomPetals() {
    blossomPetals = [];
    const W = fxCanvas.width;
    const H = fxCanvas.height;
    const count = 40;
    for (let i = 0; i < count; i++) {
      blossomPetals.push({
        x: Math.random() * W,
        y: Math.random() * H,
        size: 6 + Math.random() * 8,
        speed: 0.4 + Math.random() * 0.8,
        drift: 0.3 + Math.random() * 0.6,
        wobble: Math.random() * Math.PI * 2,
        wobbleSpeed: 0.008 + Math.random() * 0.015,
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.02,
        opacity: 0.25 + Math.random() * 0.35,
        hue: Math.floor(Math.random() * 3), // 0 = soft pink, 1 = pale pink, 2 = near-white
      });
    }
  }

  function drawBlossomPetal(ctx, x, y, size, rotation, opacity, hue) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.globalAlpha = opacity;
    const fills = [
      [255, 183, 197], // soft pink
      [255, 210, 220], // pale pink
      [255, 228, 235], // near-white pink
    ];
    const [r, g, b] = fills[hue % fills.length];
    // Single petal: wide rounded teardrop shape
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.55);
    ctx.bezierCurveTo(size * 0.45, -size * 0.45, size * 0.5, size * 0.2, 0, size * 0.55);
    ctx.bezierCurveTo(-size * 0.5, size * 0.2, -size * 0.45, -size * 0.45, 0, -size * 0.55);
    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function drawCherryBlossoms(ctx, W, H) {
    for (const p of blossomPetals) {
      p.wobble += p.wobbleSpeed;
      p.rotation += p.rotSpeed;
      drawBlossomPetal(ctx, p.x, p.y, p.size, p.rotation, p.opacity, p.hue);
      p.x += p.drift + Math.sin(p.wobble) * 0.4;
      p.y += p.speed;
      if (p.y > H + p.size) { p.y = -p.size * 2; p.x = Math.random() * W; }
      if (p.x > W + p.size) p.x = -p.size;
    }
  }

  // ── Fireworks helpers ──
  function launchFirework(W, H) {
    const x = W * (0.15 + Math.random() * 0.7);
    const peakY = H * (0.1 + Math.random() * 0.3);
    const colors = [
      [255, 80, 80], [255, 255, 100], [100, 180, 255],
      [255, 140, 200], [120, 255, 120], [255, 200, 80],
      [200, 130, 255], [255, 255, 255],
    ];
    const color = colors[Math.floor(Math.random() * colors.length)];
    return {
      x, y: H, peakY, speed: 5 + Math.random() * 4,
      phase: "rise", // "rise" | "burst" | "done"
      color, sparks: [], trailParticles: [],
      burstSize: 120 + Math.random() * 120,
    };
  }

  function burstFirework(shell) {
    const count = 100 + Math.floor(Math.random() * 60);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * shell.burstSize / 15;
      shell.sparks.push({
        x: shell.x, y: shell.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        decay: 0.005 + Math.random() * 0.008,
        r: shell.color[0], g: shell.color[1], b: shell.color[2],
      });
    }
    shell.phase = "burst";
  }

  function drawFireworks(ctx, W, H) {
    // Launch new shells periodically
    if (Math.random() < 0.02) {
      fireworksShells.push(launchFirework(W, H));
    }

    for (let i = fireworksShells.length - 1; i >= 0; i--) {
      const s = fireworksShells[i];
      if (s.phase === "rise") {
        // Draw rising trail
        ctx.beginPath();
        ctx.arc(s.x, s.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${s.color[0]}, ${s.color[1]}, ${s.color[2]}, 0.9)`;
        ctx.shadowColor = `rgba(${s.color[0]}, ${s.color[1]}, ${s.color[2]}, 0.6)`;
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.shadowBlur = 0;
        // Trail particles
        s.trailParticles.push({
          x: s.x + (Math.random() - 0.5) * 2,
          y: s.y,
          life: 1, decay: 0.04,
        });
        s.y -= s.speed;
        if (s.y <= s.peakY) burstFirework(s);
      } else if (s.phase === "burst") {
        let allDead = true;
        for (const sp of s.sparks) {
          if (sp.life <= 0) continue;
          allDead = false;
          ctx.beginPath();
          ctx.arc(sp.x, sp.y, 2.5 + sp.life, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${sp.r}, ${sp.g}, ${sp.b}, ${sp.life})`;
          ctx.shadowColor = `rgba(${sp.r}, ${sp.g}, ${sp.b}, ${sp.life * 0.5})`;
          ctx.shadowBlur = 12;
          ctx.fill();
          ctx.shadowBlur = 0;
          sp.x += sp.vx;
          sp.y += sp.vy;
          sp.vy += 0.03; // gravity
          sp.vx *= 0.99;
          sp.life -= sp.decay;
        }
        if (allDead) s.phase = "done";
      }
      // Draw trail particles
      for (let t = s.trailParticles.length - 1; t >= 0; t--) {
        const tp = s.trailParticles[t];
        tp.life -= tp.decay;
        if (tp.life <= 0) { s.trailParticles.splice(t, 1); continue; }
        ctx.beginPath();
        ctx.arc(tp.x, tp.y, 1, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 200, 120, ${tp.life * 0.5})`;
        ctx.fill();
      }
      if (s.phase === "done" && s.trailParticles.length === 0) {
        fireworksShells.splice(i, 1);
      }
    }
  }

  function renderWeatherFX(data, name) {
    // Clean up DOM emoji layer on each render
    const emojiLayer = $("#emoji-rain-layer");
    emojiLayer.innerHTML = "";
    swallowFallsParticles = [];
    halloweenParticles = [];

    // July 4th fireworks for USA locations
    const nameLC = (name || "").toLowerCase();
    const today = new Date();
    const isJuly4th = today.getMonth() === 6 && today.getDate() === 4;
    const isUSA = nameLC.includes("usa") || nameLC.includes("united states") ||
      (currentLat != null && currentLon != null &&
       currentLat >= 24.5 && currentLat <= 49.5 &&
       currentLon >= -125 && currentLon <= -66.5);
    fireworksMode = (isJuly4th && isUSA) || (fireworksPreview && isUSA);

    // Cherry blossom season: Mar 29 – Apr 15 for VA/DC/MD, Mar 20 – Apr 20 for Japan
    const mo = today.getMonth(), day = today.getDate();
    const isDMVSeason = (mo === 2 && day >= 29) || (mo === 3 && day <= 15);
    const isJapanSeason = (mo === 2 && day >= 20) || (mo === 3 && day <= 20);
    const isDMVName = /\b(va|md|dc|virginia|maryland|district of columbia)\b/.test(nameLC) ||
      nameLC.includes("washington") && (nameLC.includes("dc") || nameLC.includes("district"));
    // Coordinate bounding box for VA/DC/MD region (lat 36.5–39.7, lon -79.5 to -75.0)
    const isDMVCoords = currentLat != null && currentLon != null &&
      currentLat >= 36.5 && currentLat <= 39.7 &&
      currentLon >= -79.5 && currentLon <= -75.0;
    const isDMV = isDMVName || isDMVCoords;
    const isJapan = nameLC.includes("japan") ||
      (currentLat != null && currentLon != null &&
       currentLat >= 30 && currentLat <= 46 &&
       currentLon >= 129 && currentLon <= 146);
    cherryBlossomMode = (isDMVSeason && isDMV) || (isJapanSeason && isJapan);
    if (cherryBlossomMode && blossomPetals.length === 0) spawnBlossomPetals();
    if (!cherryBlossomMode) blossomPetals = [];

    // Birthday confetti: May 21 & July 5 for VA locations
    const isVAName = /\b(va|virginia)\b/.test(nameLC);
    const isVACoords = currentLat != null && currentLon != null &&
      currentLat >= 36.5 && currentLat <= 39.5 &&
      currentLon >= -83.7 && currentLon <= -75.2;
    const isVA = isVAName || isVACoords;
    const isBirthday = (mo === 4 && day === 21) || (mo === 6 && day === 5);
    birthdaySparkleMode = (isBirthday && isVA) || (birthdaySparklePreview && isVA);
    if (birthdaySparkleMode && sparkleParticles.length === 0) spawnConfetti();
    if (!birthdaySparkleMode) sparkleParticles = [];

    // New Year's sparkles: Dec 31 & Jan 1 for all locations
    const isNewYear = (mo === 11 && day === 31) || (mo === 0 && day === 1);
    newYearSparkleMode = isNewYear;
    if (newYearSparkleMode && nySparkleParticles.length === 0) spawnNYSparkles();
    if (!newYearSparkleMode) nySparkleParticles = [];

    // Halloween: Oct 31 for all locations
    const isHalloween = (mo === 9 && day === 31);
    halloweenMode = isHalloween || halloweenPreview;
    if (halloweenMode && halloweenParticles.length === 0) spawnHalloweenEmoji();
    if (!halloweenMode) { halloweenParticles = []; $("#emoji-rain-layer").innerHTML = ""; }

    if (fireworksMode) {
      fxType = null;
      fxIntensity = 0;
      fireworksShells = [];
      stopLightning();
      stopRainSound();
      pendingRainIntensity = null;
      spawnParticles();
      if (!fxAnimId) animateFX();
      return;
    }

    // Easter egg: Swallow Falls, MD
    swallowFallsMode = nameLC.includes("swallow falls") || 
      (nameLC.includes("oakland") && nameLC.includes("maryland"));

    if (swallowFallsMode) {
      fxType = null;
      fxIntensity = 0;
      stopLightning();
      stopRainSound();
      pendingRainIntensity = null;
      spawnParticles();
      if (!fxAnimId) animateFX();
      return;
    }

    const code = data.current.weather_code;
    const wind = data.current.wind_speed_10m;
    const result = classifyWeatherFX(code, wind);
    fxType = result.type;
    fxIntensity = result.intensity;
    spawnParticles();

    // Lightning
    stopLightning();
    if (result.lightning) {
      lightningActive = true;
      scheduleLightning();
    }

    // Rain sound
    if (result.type === "rain") {
      pendingRainIntensity = result.intensity;
      startRainSound(result.intensity);
    } else {
      pendingRainIntensity = null;
      stopRainSound();
    }

    // Night twinkle stars
    const tz = data.timezone;
    let isNightFX = false;
    try {
      const now = new Date();
      const dd = data.daily;
      const localHour = parseInt(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hour12: false }).format(now), 10);
      const srH = parseInt(dd.sunrise[0].slice(11, 13), 10);
      const ssH = parseInt(dd.sunset[0].slice(11, 13), 10);
      isNightFX = localHour < srH || localHour >= ssH;
    } catch (_) {}
    nightTwinkleMode = isNightFX;
    if (nightTwinkleMode && twinkleStars.length === 0) spawnTwinkleStars();
    if (!nightTwinkleMode) twinkleStars = [];

    // Daytime dust motes
    dayDustMode = !isNightFX && !fxType;
    if (dayDustMode && dustMotes.length === 0) spawnDustMotes();
    if (!dayDustMode) dustMotes = [];

    // Toggle night mode on body
    if (isNightFX) {
      document.body.classList.add("night");
    } else {
      document.body.classList.remove("night");
    }

    if (!fxAnimId) animateFX();
  }

  function spawnTwinkleStars() {
    const W = fxCanvas.width;
    const H = fxCanvas.height;
    twinkleStars = [];
    const count = Math.floor((W * H) / 8000);
    for (let i = 0; i < count; i++) {
      twinkleStars.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: 1 + Math.random() * 2.5,
        phase: Math.random() * Math.PI * 2,
        speed: 0.01 + Math.random() * 0.025,
        baseAlpha: 0.2 + Math.random() * 0.3,
      });
    }
  }

  function drawTwinkleStars(ctx, W, H) {
    for (const s of twinkleStars) {
      s.phase += s.speed;
      const alpha = s.baseAlpha + Math.sin(s.phase) * 0.45;
      const a = Math.max(0.05, alpha);
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.fillStyle = `rgba(255, 255, 255, ${a})`;
      ctx.beginPath();
      const spikes = 4;
      const outerR = s.r;
      const innerR = s.r * 0.4;
      for (let i = 0; i < spikes * 2; i++) {
        const r = i % 2 === 0 ? outerR : innerR;
        const angle = (i * Math.PI) / spikes - Math.PI / 2;
        const method = i === 0 ? "moveTo" : "lineTo";
        ctx[method](Math.cos(angle) * r, Math.sin(angle) * r);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  function spawnDustMotes() {
    const W = fxCanvas.width;
    const H = fxCanvas.height;
    dustMotes = [];
    const count = Math.floor((W * H) / 12000);
    for (let i = 0; i < count; i++) {
      dustMotes.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: 1 + Math.random() * 1.5,
        vx: (Math.random() - 0.4) * 0.15,
        vy: -0.08 - Math.random() * 0.15,
        phase: Math.random() * Math.PI * 2,
        phaseSpeed: 0.008 + Math.random() * 0.012,
        baseAlpha: 0.15 + Math.random() * 0.15,
      });
    }
  }

  function drawDustMotes(ctx, W, H) {
    for (const m of dustMotes) {
      m.phase += m.phaseSpeed;
      m.x += m.vx + Math.sin(m.phase) * 0.1;
      m.y += m.vy;
      if (m.y < -5) { m.y = H + 5; m.x = Math.random() * W; }
      if (m.x < -5) m.x = W + 5;
      if (m.x > W + 5) m.x = -5;
      const alpha = m.baseAlpha + Math.sin(m.phase * 1.5) * 0.04;
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 240, 200, ${Math.max(0.02, alpha)})`;
      ctx.fill();
    }
  }

  // ── Unlock audio on first user interaction ──
  let pendingRainIntensity = null;
  function resumeAllAudio() {
    if (rainAudioCtx && rainAudioCtx.state === "suspended") {
      rainAudioCtx.resume().then(() => {
        if (pendingRainIntensity !== null && !rainNoiseSource) {
          startRainSound(pendingRainIntensity);
        }
      });
    }
    if (pendingRainIntensity !== null && !rainNoiseSource) {
      startRainSound(pendingRainIntensity);
    }
  }
  document.addEventListener("click", resumeAllAudio);
  document.addEventListener("keydown", resumeAllAudio);
  document.addEventListener("touchstart", resumeAllAudio);

  // ── Weather code → description & emoji ──
  const WMO = {
    0: ["Clear sky", "☀️"],
    1: ["Mainly clear", "🌤️"],
    2: ["Partly cloudy", "⛅"],
    3: ["Overcast", "☁️"],
    45: ["Fog", "🌫️"],
    48: ["Freezing fog", "🌫️"],
    51: ["Light drizzle", "🌦️"],
    53: ["Moderate drizzle", "🌦️"],
    55: ["Dense drizzle", "🌧️"],
    56: ["Light freezing drizzle", "🌧️"],
    57: ["Dense freezing drizzle", "🌧️"],
    61: ["Slight rain", "🌦️"],
    63: ["Moderate rain", "🌧️"],
    65: ["Heavy rain", "🌧️"],
    66: ["Light freezing rain", "🌧️"],
    67: ["Heavy freezing rain", "🌧️"],
    71: ["Slight snow", "🌨️"],
    73: ["Moderate snow", "🌨️"],
    75: ["Heavy snow", "❄️"],
    77: ["Snow grains", "❄️"],
    80: ["Slight showers", "🌦️"],
    81: ["Moderate showers", "🌧️"],
    82: ["Violent showers", "⛈️"],
    85: ["Slight snow showers", "🌨️"],
    86: ["Heavy snow showers", "❄️"],
    95: ["Thunderstorm", "⛈️"],
    96: ["Thunderstorm w/ hail", "⛈️"],
    99: ["Thunderstorm w/ heavy hail", "⛈️"],
  };

  const WMO_NIGHT = {
    0: ["Clear sky", "🌙"],
    1: ["Mainly clear", "🌙"],
    2: ["Partly cloudy", "☁️"],
  };

  // Kawaii descriptions with emoticons
  const KAWAII_DESC = {
    0:  ["Clear sky~", "so sunny and happy! (˶ᵔ ᵕ ᵔ˶)"],
    1:  ["Mainly clear~", "almost perfect skies! ꒰ᐢ. .ᐢ꒱"],
    2:  ["Partly cloudy~", "peekaboo clouds~ (◍˃ ᗜ ˂◍)"],
    3:  ["Overcast~", "cloudy and cozy ꒰ ꒡⌓꒡꒱"],
    45: ["Foggy~", "so mysterious~ (⸝⸝⸝°_°⸝⸝⸝)"],
    48: ["Freezing fog~", "chilly and hazy~ (꒦ິ꒳꒦ິ)"],
    51: ["Light drizzle~", "tiny raindrops~ ꒰ᐢ. .ᐢ꒱₊˚⊹"],
    53: ["Drizzle~", "pitter patter~ (っ˘з˘)っ"],
    55: ["Heavy drizzle~", "drip drip drip~ ꒰˶  ˃ ᵕ ˂˶꒱"],
    56: ["Freezing drizzle~", "icy little drops! (꒦ິ꒳꒦ິ)"],
    57: ["Freezing drizzle~", "brrr~ cold and drippy! (꒦ິ꒳꒦ິ)"],
    61: ["Light rain~", "bring an umbrella~! ꒰ᐢ. .ᐢ꒱"],
    63: ["Rainy~", "splish splash~ (っ˘з˘)っ♡"],
    65: ["Heavy rain~", "pouring down~! ꒰>⸝⸝⸝<꒱"],
    66: ["Freezing rain~", "icy rain~! be careful! (꒦ິ꒳꒦ິ)"],
    67: ["Freezing rain~", "slippery out there~! (꒦ິ꒳꒦ິ)"],
    71: ["Light snow~", "snowflakes falling~ ꒰˶ᵔ ᵕ ᵔ˶꒱⊹"],
    73: ["Snowy~", "it's a winter wonderland~! (˶ᵔ ᵕ ᵔ˶)♡"],
    75: ["Heavy snow~", "so much snow~! ꒰˶  ˃ ᵕ ˂˶꒱⊹"],
    77: ["Snow grains~", "tiny snow bits~ ꒰ᐢ. .ᐢ꒱"],
    80: ["Light showers~", "quick little rain~ (◍˃ ᗜ ˂◍)"],
    81: ["Showers~", "rain rain go away~ ꒰>⸝⸝⸝<꒱"],
    82: ["Heavy showers~", "wild rain~! stay inside~! (⸝⸝> ᴗ <⸝⸝)"],
    85: ["Snow showers~", "surprise snow~! ꒰˶ᵔ ᵕ ᵔ˶꒱"],
    86: ["Heavy snow showers~", "snowy chaos~! ꒰˶  ˃ ᵕ ˂˶꒱"],
    95: ["Thunderstorm~", "thunder rumbles~! ꒰>⸝⸝⸝<꒱"],
    96: ["Hail storm~", "eek~! hail! (⸝⸝⸝°_°⸝⸝⸝)"],
    99: ["Hail storm~", "scary hail~! stay safe! (꒦ິ꒳꒦ິ)"],
  };

  const KAWAII_DESC_NIGHT = {
    0:  ["Clear night~", "stars are out~ ꒰ᐢ. .ᐢ꒱₊˚⊹"],
    1:  ["Clear night~", "moonlit and lovely~ (˶ᵔ ᵕ ᵔ˶)"],
    2:  ["Cloudy night~", "clouds drifting by~ ꒰ ꒡⌓꒡꒱"],
  };

  function weatherInfo(code, isNight) {
    if (isNight && WMO_NIGHT[code]) return WMO_NIGHT[code];
    return WMO[code] || ["Unknown", "❓"];
  }

  function kawaiiDesc(code, isNight) {
    if (isNight && KAWAII_DESC_NIGHT[code]) return KAWAII_DESC_NIGHT[code];
    return KAWAII_DESC[code] || null;
  }

  // ── Degree → compass ──
  function degToCompass(deg) {
    const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
    return dirs[Math.round(deg / 22.5) % 16];
  }

  // ── Unit conversion helpers ──
  function tempVal(c) {
    return unit === "fahrenheit" ? (c * 9) / 5 + 32 : c;
  }
  function tempStr(c) {
    const v = tempVal(c);
    return `${Math.round(v)}°${unit === "fahrenheit" ? "F" : "C"}`;
  }
  function speedStr(kmh) {
    return unit === "fahrenheit" ? `${(kmh * 0.621371).toFixed(1)} mph` : `${kmh.toFixed(1)} km/h`;
  }
  function precipStr(mm) {
    if (unit === "fahrenheit") {
      return `${(mm / 25.4).toFixed(2)} in`;
    }
    return `${mm} mm`;
  }

  // ── Date formatting ──
  function formatDate(dateStr) {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  }
  function formatTime(isoStr, timeZone) {
    if (!isoStr) return "—";
    const d = new Date(isoStr);
    const opts = { hour: "2-digit", minute: "2-digit", hour12: !use24h };
    if (timeZone) opts.timeZone = timeZone;
    return d.toLocaleTimeString(undefined, opts);
  }
  function formatHour(isoStr, timeZone) {
    const d = new Date(isoStr);
    const opts = { hour: "2-digit", minute: "2-digit", hour12: !use24h };
    if (timeZone) opts.timeZone = timeZone;
    return d.toLocaleTimeString(undefined, opts);
  }

  // ── API calls (Open-Meteo — no key needed) ──
  async function geocode(query) {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=20&language=en`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Geocoding failed");
    const data = await res.json();
    return data.results || [];
  }

  // Common country-to-capital mapping for country name searches
  const COUNTRY_CAPITALS = {
    "india": "New Delhi", "china": "Beijing", "japan": "Tokyo", "france": "Paris",
    "germany": "Berlin", "italy": "Rome", "spain": "Madrid", "uk": "London",
    "united kingdom": "London", "england": "London", "brazil": "Brasília",
    "australia": "Canberra", "canada": "Ottawa", "mexico": "Mexico City",
    "russia": "Moscow", "south korea": "Seoul", "korea": "Seoul",
    "argentina": "Buenos Aires", "egypt": "Cairo", "turkey": "Istanbul",
    "thailand": "Bangkok", "vietnam": "Hanoi", "indonesia": "Jakarta",
    "philippines": "Manila", "malaysia": "Kuala Lumpur", "singapore": "Singapore",
    "south africa": "Cape Town", "nigeria": "Lagos", "kenya": "Nairobi",
    "morocco": "Casablanca", "colombia": "Bogotá", "peru": "Lima",
    "chile": "Santiago", "sweden": "Stockholm", "norway": "Oslo",
    "denmark": "Copenhagen", "finland": "Helsinki", "iceland": "Reykjavik",
    "portugal": "Lisbon", "greece": "Athens", "ireland": "Dublin",
    "netherlands": "Amsterdam", "belgium": "Brussels", "switzerland": "Zurich",
    "austria": "Vienna", "poland": "Warsaw", "czech republic": "Prague",
    "czechia": "Prague", "hungary": "Budapest", "romania": "Bucharest",
    "ukraine": "Kyiv", "saudi arabia": "Riyadh", "uae": "Dubai",
    "israel": "Jerusalem", "new zealand": "Auckland", "taiwan": "Taipei",
    "pakistan": "Islamabad", "bangladesh": "Dhaka", "sri lanka": "Colombo",
    "nepal": "Kathmandu", "cuba": "Havana", "jamaica": "Kingston",
    "costa rica": "San José", "panama": "Panama City", "ecuador": "Quito",
    "bolivia": "La Paz", "uruguay": "Montevideo", "paraguay": "Asunción",
    "venezuela": "Caracas", "guatemala": "Guatemala City",
    "ethiopia": "Addis Ababa", "ghana": "Accra", "tanzania": "Dar es Salaam",
    "uganda": "Kampala", "algeria": "Algiers", "tunisia": "Tunis",
    "lebanon": "Beirut", "jordan": "Amman", "iraq": "Baghdad", "iran": "Tehran",
    "afghanistan": "Kabul", "mongolia": "Ulaanbaatar", "myanmar": "Yangon",
    "cambodia": "Phnom Penh", "laos": "Vientiane", "fiji": "Suva",
    "scotland": "Edinburgh", "wales": "Cardiff",
  };

  // Fallback geocoder using Nominatim (OpenStreetMap) for small towns
  async function geocodeFallback(query) {
    // If the query is a known country name, search for its capital instead
    const capital = COUNTRY_CAPITALS[query.toLowerCase().trim()];
    const searchQuery = capital || query;

    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery)}&format=json&limit=5&addressdetails=1`;
    const res = await fetch(url, { headers: { "Accept": "application/json" } });
    if (!res.ok) return [];
    const data = await res.json();
    return data.map(r => ({
      name: r.address.city || r.address.town || r.address.village || r.name,
      latitude: parseFloat(r.lat),
      longitude: parseFloat(r.lon),
      admin1: r.address.state || "",
      country: r.address.country || "",
      country_code: (r.address.country_code || "").toUpperCase(),
    }));
  }

  async function fetchWeather(lat, lon, days) {
    const params = new URLSearchParams({
      latitude: lat,
      longitude: lon,
      current: [
        "temperature_2m",
        "relative_humidity_2m",
        "apparent_temperature",
        "precipitation",
        "weather_code",
        "cloud_cover",
        "surface_pressure",
        "wind_speed_10m",
        "wind_direction_10m",
        "uv_index",
      ].join(","),
      hourly: [
        "temperature_2m",
        "precipitation_probability",
        "precipitation",
        "weather_code",
        "wind_speed_10m",
      ].join(","),
      daily: [
        "weather_code",
        "temperature_2m_max",
        "temperature_2m_min",
        "sunrise",
        "sunset",
        "precipitation_sum",
        "precipitation_probability_max",
        "uv_index_max",
        "wind_speed_10m_max",
      ].join(","),
      timezone: "auto",
      forecast_days: days,
    });
    const url = `https://api.open-meteo.com/v1/forecast?${params}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Weather fetch failed");
    return res.json();
  }

  // ── Show / hide helpers ──
  function show(el) { el.classList.remove("hidden"); }
  function hide(el) { el.classList.add("hidden"); }

  function showLoading() { show(loadingEl); hide(errorEl); }
  function hideLoading() { hide(loadingEl); }
  function showError(msg) { errorEl.textContent = msg; show(errorEl); }

  // ── Render current weather ──
  let localTimeInterval = null;
  let use24h = localStorage.getItem("weather_use24h") === "true";

  function renderCurrent(data, name) {
    const c = data.current;
    const d = data.daily;

    // Determine if it's currently nighttime at this location
    const tz = data.timezone;
    let isNight = false;
    let localHour = new Date().getHours();
    try {
      const now = new Date();
      localHour = parseInt(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hour12: false }).format(now), 10);
      const srH = parseInt(d.sunrise[0].slice(11, 13), 10);
      const ssH = parseInt(d.sunset[0].slice(11, 13), 10);
      isNight = localHour < srH || localHour >= ssH;
    } catch (_) { /* fallback to daytime */ }

    const [desc, icon] = weatherInfo(c.weather_code, isNight);

    // Store both abbreviated and full-state versions for US cities
    const abbrevName = cityNameWithAbbrev(name);
    const fullName = cityNameWithFull(name);
    const locEl = $("#location-name");
    locEl.textContent = showFullState ? fullName : abbrevName;

    // Only add toggle if the two forms differ (i.e. it's a US city with a state)
    if (abbrevName !== fullName) {
      locEl.style.cursor = "pointer";
      locEl.title = "Click to toggle state name";
      locEl.onclick = () => {
        showFullState = !showFullState;
        locEl.textContent = showFullState ? fullName : abbrevName;
      };
    } else {
      locEl.style.cursor = "";
      locEl.title = "";
      locEl.onclick = null;
    }

    // Local time + timezone abbreviation, updating every minute
    function getTimeZoneAbbr(timeZone) {
      try {
        // Extract the real abbreviation from Intl formatter
        const parts = new Intl.DateTimeFormat("en-US", {
          timeZone: timeZone,
          timeZoneName: "short",
        }).formatToParts(new Date());
        const tzPart = parts.find(p => p.type === "timeZoneName");
        return tzPart ? tzPart.value : "";
      } catch (_) {
        return data.timezone_abbreviation || "";
      }
    }
    function updateLocalTime() {
      try {
        const now = new Date();
        const timeStr = now.toLocaleTimeString("en-US", {
          timeZone: tz,
          hour: "2-digit",
          minute: "2-digit",
          hour12: !use24h,
        });
        const abbr = getTimeZoneAbbr(tz);
        $("#local-time").textContent = `${timeStr} ${abbr}`;
      } catch (_) {
        $("#local-time").textContent = "";
      }
    }
    if (localTimeInterval) clearInterval(localTimeInterval);
    updateLocalTime();
    localTimeInterval = setInterval(updateLocalTime, 1000);

    // Toggle 12h/24h on click
    $("#local-time").style.cursor = "pointer";
    $("#local-time").title = "Click to toggle 12h/24h";
    $("#local-time").onclick = () => {
      use24h = !use24h;
      localStorage.setItem("weather_use24h", use24h);
      updateLocalTime();
      if (weatherCache) {
        renderSunTimes(weatherCache);
        renderMoonPhase(weatherCache);
        renderHourly(weatherCache);
      }
    };

    // Greeting based on local time + weather
    try {
      const now = new Date();
      const localHourForGreeting = parseInt(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hour12: false }).format(now), 10);
      const code = c.weather_code;
      const tempF = unit === "F" ? c.temperature_2m : c.temperature_2m * 9 / 5 + 32;
      const isRainy = [51,53,55,61,63,65,80,81,82,95,96,99].includes(code);
      const isSnowy = [71,73,75,77,85,86].includes(code);
      const isCloudy = [2,3,45,48].includes(code);
      const isSunny = [0,1].includes(code);
      const isWindy = c.wind_speed_10m > 25;

      let greeting;
      if (localHourForGreeting >= 5 && localHourForGreeting < 12) {
        if (isRainy) greeting = "rainy morning~ stay cozy! ꒰ᐢ. .ᐢ꒱₊˚⊹";
        else if (isSnowy) greeting = "snow day morning~! ꒰˶  ˃ ᵕ ˂˶꒱♡⊹";
        else if (tempF < 32) greeting = "brrr~ bundle up this morning! (꒦ິ꒳꒦ິ)";
        else if (tempF > 90) greeting = "it's a hot one~ stay cool! (⸝⸝⸝°_°⸝⸝⸝)";
        else if (isSunny) greeting = "good morning sunshine~! (ᵔ◡ᵔ)♡";
        else greeting = "good morning~! ꒰ᐢ. .ᐢ꒱";
      } else if (localHourForGreeting >= 12 && localHourForGreeting < 17) {
        if (isRainy) greeting = "rainy afternoon~ perfect for tea ₊˚⊹(っ˘з˘)っ";
        else if (isSnowy) greeting = "snowy afternoon~! so pretty ꒰˶ᵔ ᵕ ᵔ˶꒱⊹";
        else if (isWindy) greeting = "windy out there~! hold on tight ꒰>⸝⸝⸝<꒱";
        else if (tempF > 90) greeting = "so hot~ find some shade! (⸝⸝> ᴗ <⸝⸝)";
        else if (isSunny) greeting = "happy afternoon~! ₊˚⊹(◍˃ ᗜ ˂◍)";
        else greeting = "good afternoon~! (˶ᵔ ᵕ ᵔ˶)";
      } else if (localHourForGreeting >= 17 && localHourForGreeting < 21) {
        if (isRainy) greeting = "cozy rainy evening~ ꒰ᐢ. .ᐢ꒱₊˚⊹";
        else if (isSnowy) greeting = "snowy evening~ time to get warm ꒰˶  ˃ ᵕ ˂˶꒱";
        else if (isCloudy) greeting = "cloudy evening~ so dreamy ꒰ ꒡⌓꒡꒱";
        else greeting = "good evening~! (ᵔ◡ᵔ)₊˚⊹";
      } else {
        if (isRainy) greeting = "rainy night~ sleep tight ꒰ᐢ⸝⸝•༝•⸝⸝ᐢ꒱♡";
        else if (isSnowy) greeting = "snowy night~ so magical ꒰˶  ˃ ᵕ ˂˶꒱⊹";
        else if (tempF < 32) greeting = "cold night~ stay warm! (꒦ິ꒳꒦ິ)♡";
        else greeting = "good night~ sweet dreams ꒰ᐢ. .ᐢ꒱₊˚⊹";
      }
      $("#greeting").textContent = greeting;
    } catch (_) { $("#greeting").textContent = ""; }

    $("#current-date").textContent = new Date().toLocaleDateString(undefined, {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    $("#weather-icon").textContent = icon;
    $("#current-temp").textContent = tempStr(c.temperature_2m);
    const kawaii = kawaiiDesc(c.weather_code, isNight);
    if (kawaii) {
      $("#weather-desc").textContent = `${kawaii[0]} ${kawaii[1]}`;
    } else {
      $("#weather-desc").textContent = desc;
    }
    $("#feels-hilo").textContent = `Feels like ${tempStr(c.apparent_temperature)}  ·  L: ${tempStr(d.temperature_2m_min[0])} // H: ${tempStr(d.temperature_2m_max[0])}`;
    $("#humidity").textContent = `${c.relative_humidity_2m}%`;
    $("#wind").textContent = speedStr(c.wind_speed_10m);
    $("#wind-dir").textContent = `${degToCompass(c.wind_direction_10m)} (${Math.round(c.wind_direction_10m)}°)`;
    $("#precip").textContent = precipStr(c.precipitation);
    $("#cloud-cover").textContent = `${c.cloud_cover}%`;
    $("#uv-current").textContent = data.current.uv_index.toFixed(1);
    $("#uv-index").textContent = d.uv_index_max[0].toFixed(1);

    // Fetch AQI from Open-Meteo air quality API
    $("#aqi").textContent = "—";
    fetchAQI(data.latitude, data.longitude);

    show($("#current-weather"));
    setupDetailDrag();

    // Update star mascot
    updateStarMascot(c.weather_code, c.apparent_temperature, c.wind_speed_10m, isNight, localHour);
  }

  // ── Star Mascot ──
  function updateStarMascot(code, apparentC, windKmh, isNight, hour) {
    const el = $("#star-mascot");
    const faceEl = $("#mascot-face");
    const speechEl = $("#mascot-speech");
    if (!el) return;

    const feelsF = (apparentC * 9) / 5 + 32;
    const isRain = [51,53,55,56,57,61,63,65,66,67,80,81,82,95,96,99].includes(code);
    const isSnow = [71,73,75,77,85,86].includes(code);
    const isThunder = [95,96,99].includes(code);
    const isFog = [45,48].includes(code);
    const isWindy = windKmh > 30;

    let face = "ᵔᴗᵔ";
    let speech = "";
    let anim = "bounce";

    if (isThunder) {
      face = ">⸝⸝<";
      speech = "eek~! scary!!";
      anim = "shiver";
    } else if (isRain) {
      face = "◕︵◕";
      speech = "stay dry~!";
      anim = "bounce";
    } else if (isSnow) {
      face = "˃ᴗ˂";
      speech = "snow~! so pretty!";
      anim = "bounce";
    } else if (isFog) {
      face = "꒡⌓꒡";
      speech = "so mysterious~";
      anim = "sleepy";
    } else if (isNight && (hour >= 22 || hour < 6)) {
      face = "ᵕ‿ᵕ";
      speech = "sleepy time~ zzz";
      anim = "sleepy";
    } else if (isNight) {
      face = "ᵔ‿ᵔ";
      speech = "cozy evening~!";
      anim = "sway";
    } else if (feelsF <= 32) {
      face = "꒦ິ꒳꒦ິ";
      speech = "so c-cold~!";
      anim = "shiver";
    } else if (feelsF <= 50) {
      face = "ˊ·ˋ";
      speech = "a bit chilly~";
      anim = "shiver";
    } else if (isWindy) {
      face = ">⸝⸝<";
      speech = "whoaaa~!";
      anim = "sway";
    } else if (feelsF >= 90) {
      face = "×﹏×";
      speech = "too hot~!!";
      anim = "sway";
    } else if (feelsF >= 75) {
      face = "ᵔᴗᵔ";
      speech = "lovely day~!";
      anim = "bounce";
    } else {
      face = "˶ᵔᴗᵔ˶";
      speech = "perfect day~!";
      anim = "bounce";
    }

    faceEl.textContent = face;
    speechEl.textContent = speech;

    el.classList.remove("shiver", "bounce", "sway", "sleepy");
    el.classList.add(anim);
    el.classList.add("visible");

    // Hover blush
    el.onmouseenter = () => {
      el._savedFace = faceEl.textContent;
      el._savedSpeech = speechEl.textContent;
      faceEl.textContent = ">////<";
      speechEl.textContent = "kyaa~! \u2764";
    };
    el.onmouseleave = () => {
      if (el._savedFace) faceEl.textContent = el._savedFace;
      if (el._savedSpeech) speechEl.textContent = el._savedSpeech;
    };

    // Click to cartwheel
    el.onclick = () => {
      el.classList.add("cartwheel");
      el.addEventListener("animationend", function handler(e) {
        if (e.animationName === "mascotCartwheel") {
          el.classList.remove("cartwheel");
          el.removeEventListener("animationend", handler);
        }
      });
    };
  }

  async function fetchAQI(lat, lon) {
    try {
      const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=us_aqi`;
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      if (data.current && data.current.us_aqi != null) {
        const aqi = Math.round(data.current.us_aqi);
        let label;
        if (aqi <= 50) label = "Good";
        else if (aqi <= 100) label = "Moderate";
        else if (aqi <= 150) label = "Unhealthy (SG)";
        else if (aqi <= 200) label = "Unhealthy";
        else if (aqi <= 300) label = "Very Unhealthy";
        else label = "Hazardous";
        $("#aqi").textContent = `${aqi} · ${label}`;
      }
    } catch (_) {}
  }

  // ── Forecast-based Severe Weather Outlook ──
  function checkSevereOutlook(data) {
    const outlookEl = $("#weather-outlook");
    outlookEl.classList.add("hidden");
    outlookEl.innerHTML = "";

    const h = data.hourly;
    if (!h || !h.time) return;

    const now = new Date();
    const warnings = [];

    // Scan next 48 hours
    for (let i = 0; i < h.time.length && i < 48; i++) {
      const t = new Date(h.time[i]);
      if (t <= now) continue;

      const code = h.weather_code[i];
      const wind = h.wind_speed_10m ? h.wind_speed_10m[i] : 0;
      const precip = h.precipitation[i];
      const hoursAway = Math.round((t - now) / 3600000);

      const dayLabel = hoursAway <= 12 ? "later today" :
                       hoursAway <= 24 ? "tomorrow" : "in the next 2 days";
      const timeStr = t.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

      // Thunderstorm codes: 95 = thunderstorm, 96 = thunderstorm + hail, 99 = severe thunderstorm + hail
      if (code === 99 && !warnings.find(w => w.type === "severe-storm")) {
        warnings.push({ type: "severe-storm", severity: 3,
          title: "\u26A1 Severe Storms + Hail Expected",
          desc: `Heavy thunderstorms with hail forecasted ${dayLabel} around ${timeStr}. Stay safe & have a plan!` });
      } else if (code === 96 && !warnings.find(w => w.type === "storm-hail")) {
        warnings.push({ type: "storm-hail", severity: 2,
          title: "\u26A1 Thunderstorms & Hail Ahead",
          desc: `Thunderstorms with hail expected ${dayLabel} around ${timeStr}. Keep an eye on the sky!` });
      } else if (code === 95 && !warnings.find(w => w.type === "thunderstorm")) {
        warnings.push({ type: "thunderstorm", severity: 1,
          title: "\u26A8\uFE0F Thunderstorms Ahead",
          desc: `Thunderstorms forecasted ${dayLabel} around ${timeStr}.` });
      }

      // Extreme wind (>40 km/h = ~25 mph)
      if (wind >= 40 && !warnings.find(w => w.type === "high-wind")) {
        const label = wind >= 60 ? "Dangerous" : "Strong";
        const sev = wind >= 60 ? 2 : 1;
        warnings.push({ type: "high-wind", severity: sev,
          title: `\uD83D\uDCA8 ${label} Winds Expected`,
          desc: `Wind speeds up to ${Math.round(wind)} km/h (${Math.round(wind * 0.621)} mph) expected ${dayLabel} around ${timeStr}.` });
      }

      // Heavy precipitation (>5mm/hr)
      if (precip >= 5 && !warnings.find(w => w.type === "heavy-precip")) {
        const label = precip >= 10 ? "Heavy" : "Significant";
        const sev = precip >= 10 ? 2 : 1;
        warnings.push({ type: "heavy-precip", severity: sev,
          title: `\uD83C\uDF27\uFE0F ${label} Precipitation Expected`,
          desc: `Up to ${precip.toFixed(1)}mm/hr expected ${dayLabel} around ${timeStr}. Possible flooding risk.` });
      }
    }

    // Also check daily data for dangerous combos
    const d = data.daily;
    if (d && d.wind_speed_10m_max) {
      for (let i = 0; i < d.time.length && i < 3; i++) {
        const dt = new Date(d.time[i]);
        if (dt.toDateString() === now.toDateString()) continue; // skip today
        const dCode = d.weather_code[i];
        const dWind = d.wind_speed_10m_max[i];
        const dPrecip = d.precipitation_sum[i];
        const dayName = dt.toLocaleDateString([], { weekday: "long" });

        // Thunderstorm + high wind combo = possible severe/tornado risk
        if ([95, 96, 99].includes(dCode) && dWind >= 50 && !warnings.find(w => w.type === "combo-severe")) {
          warnings.push({ type: "combo-severe", severity: 3,
            title: "\u26A0\uFE0F Severe Weather Risk on " + dayName,
            desc: `Thunderstorms + high winds (${Math.round(dWind)} km/h / ${Math.round(dWind * 0.621)} mph) and ${dPrecip.toFixed(1)}mm of rain. Conditions may support severe storms. Have a safety plan ready!` });
        }
      }
    }

    if (warnings.length === 0) return;

    // Sort by severity (highest first)
    warnings.sort((a, b) => b.severity - a.severity);

    outlookEl.innerHTML = warnings.map(w =>
      `<div class="outlook-title">${w.title}</div><div class="outlook-desc">${w.desc}</div>`
    ).join("");
    outlookEl.classList.remove("hidden");
  }

  // ── NWS Weather Alerts ──
  async function fetchWeatherAlerts(lat, lon) {
    const alertEl = $("#weather-alert");
    alertEl.classList.add("hidden");
    alertEl.innerHTML = "";
    try {
      const url = `https://api.weather.gov/alerts/active?point=${lat.toFixed(4)},${lon.toFixed(4)}`;
      const res = await fetch(url, { headers: { "Accept": "application/geo+json" } });
      if (!res.ok) return;
      const data = await res.json();
      const severe = (data.features || []).filter(f => {
        const evt = (f.properties.event || "").toLowerCase();
        return evt.includes("tornado") || evt.includes("severe thunderstorm") ||
               evt.includes("hurricane") || evt.includes("severe weather") ||
               evt.includes("extreme wind") || evt.includes("flash flood") ||
               evt.includes("flood warning") || evt.includes("high wind");
      });
      if (severe.length === 0) return;
      alertEl.innerHTML = severe.map(f => {
        const p = f.properties;
        return `<div class="alert-title">\u26A0\uFE0F ${p.event}</div><div class="alert-desc">${p.headline || ""}</div>`;
      }).join("");
      alertEl.classList.remove("hidden");
    } catch (_) {}
  }

  // ── Drag-and-drop for detail cards ──
  function setupDetailDrag() {
    const grid = $(".current-details");
    const cards = [...grid.querySelectorAll(".detail-card")];

    // Restore saved order from localStorage
    try {
      const saved = JSON.parse(localStorage.getItem("detail_order"));
      if (saved && saved.length === cards.length) {
        const idMap = {};
        cards.forEach(c => { idMap[c.querySelector(".detail-value").id] = c; });
        saved.forEach(id => { if (idMap[id]) grid.appendChild(idMap[id]); });
      }
    } catch (_) {}

    function saveDetailOrder() {
      const order = [...grid.querySelectorAll(".detail-card")].map(c => c.querySelector(".detail-value").id);
      try { localStorage.setItem("detail_order", JSON.stringify(order)); } catch (_) {}
    }

    let dragEl = null;

    grid.querySelectorAll(".detail-card").forEach(card => {
      card.draggable = true;

      card.addEventListener("dragstart", (e) => {
        dragEl = card;
        card.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
      });

      card.addEventListener("dragend", () => {
        card.classList.remove("dragging");
        grid.querySelectorAll(".detail-card").forEach(c => c.classList.remove("drag-over"));
        dragEl = null;
        saveDetailOrder();
      });

      card.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (card !== dragEl) card.classList.add("drag-over");
      });

      card.addEventListener("dragleave", () => {
        card.classList.remove("drag-over");
      });

      card.addEventListener("drop", (e) => {
        e.preventDefault();
        card.classList.remove("drag-over");
        if (dragEl && dragEl !== card) {
          const allCards = [...grid.querySelectorAll(".detail-card")];
          const fromIdx = allCards.indexOf(dragEl);
          const toIdx = allCards.indexOf(card);
          if (fromIdx < toIdx) {
            grid.insertBefore(dragEl, card.nextSibling);
          } else {
            grid.insertBefore(dragEl, card);
          }
        }
      });

      // Touch support
      let touchTimeout = null;
      card.addEventListener("touchstart", (e) => {
        touchTimeout = setTimeout(() => {
          dragEl = card;
          card.classList.add("dragging");
        }, 300);
      }, { passive: true });

      card.addEventListener("touchmove", (e) => {
        if (touchTimeout) { clearTimeout(touchTimeout); touchTimeout = null; }
        if (!dragEl || dragEl !== card) return;
        e.preventDefault();
        const touch = e.touches[0];
        const target = document.elementFromPoint(touch.clientX, touch.clientY);
        const overCard = target ? target.closest(".detail-card") : null;
        grid.querySelectorAll(".detail-card").forEach(c => c.classList.remove("drag-over"));
        if (overCard && overCard !== dragEl) overCard.classList.add("drag-over");
      }, { passive: false });

      card.addEventListener("touchend", (e) => {
        if (touchTimeout) { clearTimeout(touchTimeout); touchTimeout = null; }
        if (!dragEl) return;
        const touch = e.changedTouches[0];
        const target = document.elementFromPoint(touch.clientX, touch.clientY);
        const overCard = target ? target.closest(".detail-card") : null;
        if (overCard && overCard !== dragEl) {
          const allCards = [...grid.querySelectorAll(".detail-card")];
          const fromIdx = allCards.indexOf(dragEl);
          const toIdx = allCards.indexOf(overCard);
          if (fromIdx < toIdx) {
            grid.insertBefore(dragEl, overCard.nextSibling);
          } else {
            grid.insertBefore(dragEl, overCard);
          }
        }
        grid.querySelectorAll(".detail-card").forEach(c => c.classList.remove("drag-over"));
        dragEl.classList.remove("dragging");
        dragEl = null;
        saveDetailOrder();
      });
    });
  }

  // ── Render sun times ──
  // ── Solar twilight calculation ──
  // Compute sunrise/sunset for a given solar zenith angle
  // zenith: 90.833 = standard sunrise/sunset, 96 = civil twilight (dawn/dusk)
  function solarEvent(date, lat, lon, zenith, rising) {
    const rad = Math.PI / 180;
    const deg = 180 / Math.PI;

    // Day of year
    const start = new Date(date.getFullYear(), 0, 1);
    const N = Math.floor((date - start) / 86400000) + 1;

    // Sun's mean anomaly
    const lngHour = lon / 15;
    const t = N + ((rising ? 6 : 18) - lngHour) / 24;
    const M = (0.9856 * t) - 3.289;

    // Sun's true longitude
    let L = M + (1.916 * Math.sin(M * rad)) + (0.020 * Math.sin(2 * M * rad)) + 282.634;
    L = ((L % 360) + 360) % 360;

    // Right ascension
    let RA = Math.atan(0.91764 * Math.tan(L * rad)) * deg;
    RA = ((RA % 360) + 360) % 360;

    // RA in same quadrant as L
    const Lq = Math.floor(L / 90) * 90;
    const RAq = Math.floor(RA / 90) * 90;
    RA += Lq - RAq;
    RA /= 15; // to hours

    // Sun's declination
    const sinDec = 0.39782 * Math.sin(L * rad);
    const cosDec = Math.cos(Math.asin(sinDec));

    // Hour angle
    const cosH = (Math.cos(zenith * rad) - sinDec * Math.sin(lat * rad)) / (cosDec * Math.cos(lat * rad));
    if (cosH > 1 || cosH < -1) return null; // no event (polar)

    let H = Math.acos(cosH) * deg;
    if (rising) H = 360 - H;
    H /= 15; // to hours

    // Local mean time
    const T = H + RA - (0.06571 * t) - 6.622;

    // UTC time
    let UT = ((T - lngHour) % 24 + 24) % 24;

    const hours = Math.floor(UT);
    const minutes = Math.round((UT - hours) * 60);
    const result = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), hours, minutes));
    return result;
  }

  function formatTimeRaw(isoStr) {
    // For API times that are already in local time (no offset), extract HH:MM directly
    if (!isoStr) return "—";
    const m = isoStr.match(/T(\d{2}):(\d{2})/);
    if (m) {
      let h = parseInt(m[1], 10);
      const min = m[2];
      if (use24h) {
        return `${String(h).padStart(2, "0")}:${min}`;
      }
      const ampm = h >= 12 ? "PM" : "AM";
      if (h === 0) h = 12;
      else if (h > 12) h -= 12;
      return `${h}:${min} ${ampm}`;
    }
    return isoStr;
  }

  function renderSunTimes(data) {
    const d = data.daily;
    const sunrise = d.sunrise[0];
    const sunset = d.sunset[0];
    const lat = data.latitude;
    const tz = data.timezone;

    // Compute civil twilight offset from sunrise/sunset using solar geometry
    // The offset is the difference in hour angles between zenith 90.833° and 96°
    const rad = Math.PI / 180;
    const dayOfYear = Math.floor((new Date(d.time[0]) - new Date(new Date(d.time[0]).getFullYear(), 0, 1)) / 86400000) + 1;
    // Solar declination (approximate)
    const declination = -23.44 * Math.cos(rad * (360 / 365) * (dayOfYear + 10));
    const latRad = lat * rad;
    const decRad = declination * rad;
    const cosDec = Math.cos(decRad);
    const cosLat = Math.cos(latRad);
    const sinDec = Math.sin(decRad);
    const sinLat = Math.sin(latRad);
    const denom = cosDec * cosLat;

    function hourAngle(zenith) {
      const cosH = (Math.cos(zenith * rad) - sinDec * sinLat) / denom;
      if (cosH > 1 || cosH < -1) return null;
      return Math.acos(cosH) / rad / 15; // hours
    }

    const haSunrise = hourAngle(90.833);
    const haTwilight = hourAngle(96);
    let twilightOffset = 0; // minutes
    if (haSunrise !== null && haTwilight !== null) {
      twilightOffset = Math.round((haTwilight - haSunrise) * 60);
    }

    // Apply offset to API sunrise/sunset strings to get dawn/dusk
    function offsetTime(isoStr, offsetMin) {
      const m = isoStr.match(/T(\d{2}):(\d{2})/);
      if (!m) return null;
      let totalMin = parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + offsetMin;
      if (totalMin < 0) totalMin += 1440;
      if (totalMin >= 1440) totalMin -= 1440;
      const h = Math.floor(totalMin / 60);
      const min = totalMin % 60;
      if (use24h) {
        return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
      }
      const ampm = h >= 12 ? "PM" : "AM";
      const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
      return `${h12}:${String(min).padStart(2, "0")} ${ampm}`;
    }

    $("#dawn").textContent = offsetTime(sunrise, -twilightOffset) || "—";
    $("#sunrise").textContent = formatTimeRaw(sunrise);
    $("#sunset").textContent = formatTimeRaw(sunset);
    $("#dusk").textContent = offsetTime(sunset, twilightOffset) || "—";

    // Show timezone abbreviation
    try {
      const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" }).formatToParts(new Date());
      const tzAbbr = parts.find(p => p.type === "timeZoneName");
      $("#sun-tz").textContent = tzAbbr ? `(${tzAbbr.value})` : "";
    } catch (_) { $("#sun-tz").textContent = ""; }

    show($("#sun-times"));
  }

  // ── Sunsethue API: Sunset & Sunrise Quality Score ──
  const SUNSETHUE_API_KEY = "daeed223612ebeaf08776fd7ae76d733";

  function scoreToColor(quality) {
    if (quality < 0.25) return "#a0a0b0";
    if (quality < 0.5) return "#f8cdd9";
    if (quality < 0.75) return "#f0a060";
    return "#ffd700";
  }

  function setScore(numEl, qualityEl, quality, qualityText) {
    const color = scoreToColor(quality);
    numEl.textContent = `${Math.round(quality * 100)}%`;
    numEl.style.color = color;
    qualityEl.textContent = qualityText;
    qualityEl.style.color = color;
  }

  function formatSunsethueTime(isoStr) {
    if (!isoStr) return "—";
    const d = new Date(isoStr);
    const opts = { hour: "2-digit", minute: "2-digit", hour12: !use24h };
    return d.toLocaleTimeString(undefined, opts);
  }

  const sunScoreCallLog = [];
  const SUN_SCORE_RATE_LIMIT = 7;
  const SUN_SCORE_RATE_WINDOW = 60000; // 1 minute

  async function fetchSunScore(lat, lon, date, type) {
    const cacheKey = `sunscore_${lat.toFixed(2)}_${lon.toFixed(2)}_${date}_${type}`;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed._cacheDate === date) return parsed;
        localStorage.removeItem(cacheKey);
      }
    } catch (_) {}
    // Rate limit: skip API call if too many recent requests
    const now = Date.now();
    while (sunScoreCallLog.length && now - sunScoreCallLog[0] > SUN_SCORE_RATE_WINDOW) sunScoreCallLog.shift();
    if (sunScoreCallLog.length >= SUN_SCORE_RATE_LIMIT) return null;
    sunScoreCallLog.push(now);
    const url = `https://api.sunsethue.com/event?latitude=${lat}&longitude=${lon}&date=${date}&type=${type}&key=${encodeURIComponent(SUNSETHUE_API_KEY)}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    try { json._cacheDate = date; localStorage.setItem(cacheKey, JSON.stringify(json)); } catch (_) {}
    return json;
  }

  async function renderSunScore(data) {
    const section = $("#sun-score-section");
    const d = data.daily;
    const sunrise = d.sunrise[0];
    const sunset = d.sunset[0];
    const lat = data.latitude;
    const lon = data.longitude;
    const dateStr = d.time[0]; // "YYYY-MM-DD"

    // Fall back to computed golden hours if API fails
    function offsetTime(isoStr, offsetMin) {
      const m = isoStr.match(/T(\d{2}):(\d{2})/);
      if (!m) return null;
      let totalMin = parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + offsetMin;
      if (totalMin < 0) totalMin += 1440;
      if (totalMin >= 1440) totalMin -= 1440;
      const h = Math.floor(totalMin / 60);
      const min = totalMin % 60;
      if (use24h) {
        return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
      }
      const ampm = h >= 12 ? "PM" : "AM";
      const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
      return `${h12}:${String(min).padStart(2, "0")} ${ampm}`;
    }

    // Set fallback golden hours (computed) while API loads
    $("#golden-morning").textContent = `${formatTimeRaw(sunrise)} – ${offsetTime(sunrise, 30) || "—"}`;
    $("#golden-evening").textContent = `${offsetTime(sunset, -30) || "—"} – ${formatTimeRaw(sunset)}`;
    $("#sunrise-score-num").textContent = "—";
    $("#sunset-score-num").textContent = "—";
    $("#sunrise-quality-text").textContent = "";
    $("#sunset-quality-text").textContent = "";

    // Show timezone abbreviation
    try {
      const tz = data.timezone;
      const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" }).formatToParts(new Date());
      const tzAbbr = parts.find(p => p.type === "timeZoneName");
      $("#score-tz").textContent = tzAbbr ? `(${tzAbbr.value})` : "";
    } catch (_) { $("#score-tz").textContent = ""; }

    show(section);

    // Fetch both scores in parallel
    try {
      const [srData, ssData] = await Promise.all([
        fetchSunScore(lat, lon, dateStr, "sunrise"),
        fetchSunScore(lat, lon, dateStr, "sunset"),
      ]);

      if (srData && srData.data) {
        const sr = srData.data;
        setScore(
          $("#sunrise-score-num"), $("#sunrise-quality-text"),
          sr.quality, sr.quality_text
        );
        // Golden hour from API if available
        if (sr.magics && sr.magics.golden_hour) {
          const [gs, ge] = sr.magics.golden_hour;
          $("#golden-morning").textContent = `${formatSunsethueTime(gs)} – ${formatSunsethueTime(ge)}`;
        }
      }

      if (ssData && ssData.data) {
        const ss = ssData.data;
        setScore(
          $("#sunset-score-num"), $("#sunset-quality-text"),
          ss.quality, ss.quality_text
        );
        if (ss.magics && ss.magics.golden_hour) {
          const [gs, ge] = ss.magics.golden_hour;
          $("#golden-evening").textContent = `${formatSunsethueTime(gs)} – ${formatSunsethueTime(ge)}`;
        }
      }
    } catch (_) {
      // API unavailable — section still shows with computed golden hours
    }
  }

  // ── Moon phase calculation ──
  function getMoonPhase(date) {
    // Compute moon age using a known new moon reference (Jan 6, 2000 18:14 UTC)
    const refNew = new Date(Date.UTC(2000, 0, 6, 18, 14, 0));
    const synodic = 29.53058770576;
    const daysSince = (date.getTime() - refNew.getTime()) / 86400000;
    const age = ((daysSince % synodic) + synodic) % synodic;
    const illumination = (1 - Math.cos((age / synodic) * 2 * Math.PI)) / 2;

    let name, icon;
    if (age < 1.85)       { name = "New Moon";        icon = "🌑"; }
    else if (age < 5.53)  { name = "Waxing Crescent"; icon = "🌒"; }
    else if (age < 9.22)  { name = "First Quarter";   icon = "🌓"; }
    else if (age < 12.91) { name = "Waxing Gibbous";  icon = "🌔"; }
    else if (age < 16.61) { name = "Full Moon";        icon = "🌕"; }
    else if (age < 20.30) { name = "Waning Gibbous";  icon = "🌖"; }
    else if (age < 23.99) { name = "Last Quarter";    icon = "🌗"; }
    else if (age < 27.68) { name = "Waning Crescent"; icon = "🌘"; }
    else                   { name = "New Moon";        icon = "🌑"; }

    return { name, icon, illumination: Math.round(illumination * 100), age: Math.round(age * 10) / 10 };
  }

  // ── Moonrise / Moonset calculation ──
  // Low-precision lunar position → rise/set via iterative hourly search
  function getMoonRiseSet(date, lat, lon) {
    const rad = Math.PI / 180;
    // Compute moon altitude at a given UTC Date
    function moonAlt(dt) {
      const T = (dt.getTime() / 86400000 - 10957.5) / 36525; // J2000 centuries
      // Moon's ecliptic longitude (simplified)
      const Lm = (218.316 + 481267.8813 * T) % 360;
      const Mm = (134.963 + 477198.8676 * T) % 360;
      const Fm = (93.272 + 483202.0175 * T) % 360;
      const lonMoon = Lm + 6.289 * Math.sin(Mm * rad);
      const latMoon = 5.128 * Math.sin(Fm * rad);
      // Obliquity
      const obl = 23.439 - 0.00000036 * (dt.getTime() / 86400000 - 10957.5);
      // Ecliptic to equatorial
      const cosObl = Math.cos(obl * rad), sinObl = Math.sin(obl * rad);
      const cosLat = Math.cos(latMoon * rad), sinLat = Math.sin(latMoon * rad);
      const cosLon = Math.cos(lonMoon * rad), sinLon = Math.sin(lonMoon * rad);
      const ra = Math.atan2(sinLon * cosObl - sinLat / cosLat * sinObl, cosLon);
      const dec = Math.asin(sinLat * cosObl + cosLat * sinObl * sinLon);
      // Sidereal time at Greenwich
      const GMST = (280.46061837 + 360.98564736629 * (dt.getTime() / 86400000 - 10957.5)) % 360;
      const ha = (GMST + lon - ra / rad) * rad;
      // Altitude
      const sinAlt = Math.sin(lat * rad) * Math.sin(dec) + Math.cos(lat * rad) * Math.cos(dec) * Math.cos(ha);
      return Math.asin(sinAlt) / rad;
    }

    // Scan 25 hours starting from midnight UTC of the given date
    // looking for crossings of -0.833° (standard refraction + moon semidiameter)
    const threshold = -0.833;
    const startUTC = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
    let rise = null, set = null;
    let prevAlt = moonAlt(new Date(startUTC));
    for (let m = 10; m <= 24 * 60; m += 10) {
      const t = new Date(startUTC + m * 60000);
      const alt = moonAlt(t);
      if (prevAlt <= threshold && alt > threshold && !rise) {
        // Interpolate
        const frac = (threshold - prevAlt) / (alt - prevAlt);
        rise = new Date(startUTC + (m - 10 + frac * 10) * 60000);
      }
      if (prevAlt >= threshold && alt < threshold && !set) {
        const frac = (threshold - prevAlt) / (alt - prevAlt);
        set = new Date(startUTC + (m - 10 + frac * 10) * 60000);
      }
      prevAlt = alt;
    }
    return { rise, set };
  }

  function getNextMoonEvent(fromDate, targetAge, synodic) {
    const refNew = new Date(Date.UTC(2000, 0, 6, 18, 14, 0));
    const daysSince = (fromDate.getTime() - refNew.getTime()) / 86400000;
    const currentAge = ((daysSince % synodic) + synodic) % synodic;
    let daysUntil = targetAge - currentAge;
    if (daysUntil <= 0) daysUntil += synodic;
    return new Date(fromDate.getTime() + daysUntil * 86400000);
  }

  function renderMoonPhase(data) {
    const today = new Date(data.daily.time[0] + "T12:00:00");
    const moon = getMoonPhase(today);
    $("#moon-icon").textContent = moon.icon;
    $("#moon-name").textContent = moon.name;
    $("#moon-illumination").textContent = `${moon.illumination}% illuminated · Day ${moon.age} of cycle`;

    const tz = data.timezone;
    const rs = getMoonRiseSet(today, data.latitude, data.longitude);
    $("#moonrise").textContent = rs.rise ? formatTime(rs.rise.toISOString(), tz) : "—";
    $("#moonset").textContent = rs.set ? formatTime(rs.set.toISOString(), tz) : "—";

    const synodic = 29.53058770576;
    const nextNew = getNextMoonEvent(today, 0, synodic);
    const nextFull = getNextMoonEvent(today, synodic / 2, synodic);
    const dateFmt = { month: "short", day: "numeric" };
    function moonDateLabel(d) {
      const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
      if (diff <= 0) return "Today";
      if (diff === 1) return "Tomorrow";
      return d.toLocaleDateString(undefined, dateFmt);
    }
    $("#next-new-moon").textContent = moonDateLabel(nextNew);
    $("#next-full-moon").textContent = moonDateLabel(nextFull);

    // Show timezone abbreviation
    try {
      const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" }).formatToParts(new Date());
      const tzAbbr = parts.find(p => p.type === "timeZoneName");
      $("#moon-tz").textContent = tzAbbr ? `(${tzAbbr.value})` : "";
    } catch (_) { $("#moon-tz").textContent = ""; }

    show($("#moon-phase"));
  }

  // ── Render hourly forecast ──
  function renderHourly(data) {
    const h = data.hourly;
    const d = data.daily;
    const container = $("#hourly-scroll");
    container.innerHTML = "";

    // Build sunrise/sunset hours for each day in the forecast
    const tz = data.timezone;
    let sunriseHours = [], sunsetHours = [];
    try {
      for (let di = 0; di < d.sunrise.length; di++) {
        const sr = new Date(d.sunrise[di]);
        const ss = new Date(d.sunset[di]);
        sunriseHours.push(sr.getTime());
        sunsetHours.push(ss.getTime());
      }
    } catch (_) { /* empty arrays = always daytime fallback */ }

    function isHourNight(timeStr) {
      if (sunriseHours.length === 0) return false;
      const t = new Date(timeStr).getTime();
      // Find the matching day
      for (let di = 0; di < sunriseHours.length; di++) {
        const dayStart = new Date(d.time[di] + "T00:00:00").getTime();
        const dayEnd = dayStart + 86400000;
        if (t >= dayStart && t < dayEnd) {
          return t < sunriseHours[di] || t >= sunsetHours[di];
        }
      }
      return false;
    }

    const now = new Date();
    let startIdx = 0;
    for (let i = 0; i < h.time.length; i++) {
      if (new Date(h.time[i]) >= now) { startIdx = i; break; }
    }

    const count = Math.min(48, h.time.length - startIdx);
    for (let i = startIdx; i < startIdx + count; i++) {
      const [, icon] = weatherInfo(h.weather_code[i], isHourNight(h.time[i]));
      const card = document.createElement("div");
      card.className = "hourly-card";
      card.innerHTML = `
        <div class="hour">${formatHour(h.time[i], data.timezone)}</div>
        <div class="h-icon">${icon}</div>
        <div class="h-temp">${tempStr(h.temperature_2m[i])}</div>
        <div class="h-precip">${h.precipitation_probability[i]}% 💧</div>
      `;
      container.appendChild(card);
    }
    show($("#hourly-section"));
  }

  // ── Render daily forecast ──
  function renderDaily(data, days) {
    const d = data.daily;
    const container = $("#daily-forecast");
    container.innerHTML = "";

    const allMax = Math.max(...d.temperature_2m_max.slice(0, days));
    const allMin = Math.min(...d.temperature_2m_min.slice(0, days));
    const range = allMax - allMin || 1;

    for (let i = 0; i < days && i < d.time.length; i++) {
      const [, icon] = weatherInfo(d.weather_code[i]);
      const lo = d.temperature_2m_min[i];
      const hi = d.temperature_2m_max[i];
      const leftPct = ((lo - allMin) / range) * 100;
      const widthPct = ((hi - lo) / range) * 100;

      const loF = (lo * 9) / 5 + 32;
      const hiF = (hi * 9) / 5 + 32;
      const loColor = tempFToColor(loF);
      const hiColor = tempFToColor(hiF);

      const row = document.createElement("div");
      row.className = "daily-row";
      row.innerHTML = `
        <span class="daily-day">${i === 0 ? "Today" : formatDate(d.time[i])}</span>
        <span class="daily-icon">${icon}</span>
        <div class="daily-bar-wrap"><div class="daily-bar" style="left:${leftPct}%;width:${Math.max(widthPct, 4)}%;background:linear-gradient(90deg, ${loColor}, ${hiColor})"></div></div>
        <span class="daily-lo">${tempStr(lo)}</span>
        <span class="daily-hi">${tempStr(hi)}</span>
      `;
      container.appendChild(row);
    }
    show($("#forecast-section"));
  }

  // ── What to Wear recommendation ──
  function renderAttire(data) {
    const c = data.current;
    const d = data.daily;
    const feelsF = (c.apparent_temperature * 9) / 5 + 32;
    const windKmh = c.wind_speed_10m;
    const precipProb = d.precipitation_probability_max[0];
    const uvIndex = d.uv_index_max[0];
    const code = c.weather_code;
    const items = [];

    // Rain / snow codes
    const isRain = [51,53,55,56,57,61,63,65,66,67,80,81,82,95,96,99].includes(code);
    const isSnow = [71,73,75,77,85,86].includes(code);

    // Umbrella
    if (isRain || precipProb >= 50) {
      items.push({ icon: "☂️", text: `<strong>grab your umbrella~!</strong> ${precipProb}% chance of rain today ꒰>⸝⸝⸝<꒱` });
    } else if (precipProb >= 30) {
      items.push({ icon: "🌂", text: `<strong>maybe bring an umbrella~</strong> ${precipProb}% chance of rain, just in case! ꒰ᐢ. .ᐢ꒱` });
    } else {
      items.push({ icon: "☀️", text: precipProb === 0
        ? `<strong>no umbrella needed~!</strong> zero chance of rain today (˶ᵔ ᵕ ᵔ˶)`
        : `<strong>no umbrella needed~!</strong> only ${precipProb}% chance of rain ₊˚⊹` });
    }

    // Temperature-based clothing
    if (feelsF <= 20) {
      items.push({ icon: "🥶", text: "<strong>bundle up in everything you own~!</strong> big puffy coat, thermals, boots, the works!! it's dangerously cold out there (꒦ິ꒳꒦ິ)" });
    } else if (feelsF <= 32) {
      items.push({ icon: "🧣", text: "<strong>cozy winter coat, scarf & gloves~!</strong> it's freezing outside, stay warm and toasty ꒰˶ ˃ ᵕ ˂˶꒱" });
    } else if (feelsF <= 40) {
      items.push({ icon: "🧥", text: "<strong>layer up with a warm jacket~!</strong> it's chilly enough to want something snuggly ꒰ᐢ. .ᐢ꒱" });
    } else if (feelsF <= 55) {
      items.push({ icon: "🧸", text: "<strong>sweater weather~!</strong> a cute fleece or hoodie with a light jacket is perfect (ᵔᴗᵔ)♡" });
    } else if (feelsF <= 65) {
      items.push({ icon: "👚", text: "<strong>long sleeves or a light cardigan~!</strong> comfy and cute, just a tiny bit cool ₊˚⊹" });
    } else if (feelsF <= 75) {
      items.push({ icon: "👗", text: "<strong>your cutest outfit~!</strong> the weather is literally perfect for anything (˶ᵔ ᵕ ᵔ˶)♡" });
    } else if (feelsF <= 85) {
      items.push({ icon: "🌺", text: "<strong>something light and breezy~!</strong> shorts, sundress, flowy tops — stay cool and cute (◍˃ ᗜ ˂◍)" });
    } else {
      items.push({ icon: "🧊", text: "<strong>as little as possible~!</strong> it's SO hot, wear the lightest thing you have and drink lots of water (⸝⸝×﹏×⸝⸝)" });
    }

    // Wind advisory
    if (windKmh >= 50) {
      items.push({ icon: "💨", text: "<strong>super windy~!</strong> hold onto your hat and maybe grab a windbreaker ꒰>⸝⸝⸝<꒱" });
    } else if (windKmh >= 30) {
      items.push({ icon: "🌬️", text: "<strong>a little breezy out~!</strong> a light jacket will keep the wind away ꒰ᐢ. .ᐢ꒱" });
    }

    // UV advisory (only before dusk)
    const dusk = solarEvent(new Date(d.time[0] + "T12:00:00"), data.latitude, data.longitude, 96, false);
    const now = new Date();
    const pastDusk = dusk && now > dusk;
    if (!pastDusk) {
      if (uvIndex >= 8) {
        items.push({ icon: "🧴", text: `<strong>UV is ${uvIndex.toFixed(1)} — so strong~!</strong> sunscreen is a must, plus sunnies and a cute hat ☀️₊˚⊹` });
      } else if (uvIndex >= 5) {
        items.push({ icon: "🕶️", text: `<strong>UV is ${uvIndex.toFixed(1)} — don't forget sunscreen~!</strong> your skin will thank you later (ᵔᴗᵔ)` });
      }
    }

    // Snow gear
    if (isSnow) {
      items.push({ icon: "🥾", text: "<strong>waterproof boots time~!</strong> snow is falling, watch your step on the slippery bits ꒰˶ᵔ ᵕ ᵔ˶꒱⊹" });
    }

    const container = $("#attire-content");
    container.innerHTML = items.map(i =>
      `<div class="attire-item"><span class="attire-icon">${i.icon}</span><span class="attire-text">${i.text}</span></div>`
    ).join("");
    show($("#attire-section"));
  }

  // ── Chinese Zodiac (based on traditional Heavenly Stems & Earthly Branches 天干地支) ──
  const ZODIAC_ANIMALS = [
    { name: "Rat",     emoji: "🐀", element: "Water", branch: 0 },
    { name: "Ox",      emoji: "🐂", element: "Earth", branch: 1 },
    { name: "Tiger",   emoji: "🐅", element: "Wood",  branch: 2 },
    { name: "Rabbit",  emoji: "🐇", element: "Wood",  branch: 3 },
    { name: "Dragon",  emoji: "🐉", element: "Earth", branch: 4 },
    { name: "Snake",   emoji: "🐍", element: "Fire",  branch: 5 },
    { name: "Horse",   emoji: "🐎", element: "Fire",  branch: 6 },
    { name: "Goat",    emoji: "🐐", element: "Earth", branch: 7 },
    { name: "Monkey",  emoji: "🐒", element: "Metal", branch: 8 },
    { name: "Rooster", emoji: "🐓", element: "Metal", branch: 9 },
    { name: "Dog",     emoji: "🐕", element: "Earth", branch: 10 },
    { name: "Pig",     emoji: "🐖", element: "Water", branch: 11 },
  ];

  // Chinese zodiac year
  function getChineseZodiacYear(year) {
    return ZODIAC_ANIMALS[(year - 4) % 12];
  }

  // ── Traditional Chinese almanac (黄历) daily branch calculation ──
  // The 60-day Sexagenary cycle assigns an Earthly Branch (地支) to each day.
  // Reference: Jan 1, 1900 = Geng-Wu day (Heavenly Stem 6, Earthly Branch 6 [Horse])
  function getDailyEarthlyBranch(date) {
    const ref = new Date(1900, 0, 1); // Jan 1 1900 = Earthly Branch 6 (Horse)
    const days = Math.floor((date - ref) / 86400000);
    return ((days + 6) % 12 + 12) % 12; // +6 because Jan 1 1900 is branch 6
  }

  // Traditional compatibility relationships from the Earthly Branches:
  // Six Harmonies (六合): pairs that are most compatible
  const SIX_HARMONIES = { 0:1, 1:0, 2:11, 3:10, 4:9, 5:8, 6:7, 7:6, 8:5, 9:4, 10:3, 11:2 };
  // Three Harmonies (三合): triangular groups of 3 that support each other
  const THREE_HARMONIES = [
    [0, 4, 8],   // Water frame: Rat, Dragon, Monkey
    [1, 5, 9],   // Metal frame: Ox, Snake, Rooster
    [2, 6, 10],  // Fire frame: Tiger, Horse, Dog
    [3, 7, 11],  // Wood frame: Rabbit, Goat, Pig
  ];
  // Six Clashes (六冲): opposing signs that clash
  const SIX_CLASHES = { 0:6, 1:7, 2:8, 3:9, 4:10, 5:11, 6:0, 7:1, 8:2, 9:3, 10:4, 11:5 };

  function getDailyZodiacFortune(date) {
    const branch = getDailyEarthlyBranch(date);
    const dayAnimal = ZODIAC_ANIMALS[branch];

    // The day's branch animal and its harmony partners are lucky
    const harmonyPartner = SIX_HARMONIES[branch];
    const threeGroup = THREE_HARMONIES.find(g => g.includes(branch)) || [];
    const clashSign = SIX_CLASHES[branch];

    const lucky = new Set([harmonyPartner, ...threeGroup]);
    lucky.delete(branch); // don't include the day's own sign as "lucky"

    return { dayBranch: branch, dayAnimal, lucky, clash: clashSign };
  }

  function renderZodiac(data) {
    // Use the selected city's timezone to get its local date
    const tz = data.timezone;
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()).split("-");
    const today = new Date(+parts[0], +parts[1] - 1, +parts[2]);
    const yearAnimal = getChineseZodiacYear(today.getFullYear());
    const fortune = getDailyZodiacFortune(today);
    const dayName = fortune.dayAnimal.name;

    $("#zodiac-year").innerHTML =
      `Year of the <strong>${yearAnimal.emoji} ${yearAnimal.name}</strong> (${yearAnimal.element}) · ` +
      `Today's branch: <strong>${fortune.dayAnimal.emoji} ${dayName}</strong> day`;

    let html = "";
    const thisYear = today.getFullYear();
    for (let i = 0; i < 12; i++) {
      const a = ZODIAC_ANIMALS[i];
      const isDay = i === fortune.dayBranch;
      const isLucky = fortune.lucky.has(i);
      const isClash = i === fortune.clash;
      let label = "";
      let cls = "";
      if (isDay) { label = "Day Sign"; cls = " day-sign"; }
      else if (isLucky) { label = "★ Lucky"; cls = " lucky"; }
      else if (isClash) { label = "⚠ Clash"; cls = " clash"; }

      // Compute recent years for this animal
      const years = [];
      for (let y = thisYear; years.length < 6; y--) {
        if ((y - 4) % 12 === i) years.push(y);
      }

      html += `<div class="zodiac-card${cls}" data-branch="${i}">
        <span class="zodiac-emoji">${a.emoji}</span>
        <span class="zodiac-name">${a.name}</span>
        ${label ? `<span class="zodiac-luck">${label}</span>` : ""}
        <span class="zodiac-years">${years.join(", ")}</span>
      </div>`;
    }
    $("#zodiac-lucky").innerHTML = html;

    // Click to show years tooltip
    let activeZodiacCard = null;
    $("#zodiac-lucky").querySelectorAll(".zodiac-card").forEach(card => {
      card.addEventListener("click", () => {
        const tooltip = $("#zodiac-tooltip");
        if (activeZodiacCard === card) {
          tooltip.classList.remove("visible");
          activeZodiacCard = null;
          return;
        }
        activeZodiacCard = card;
        tooltip.textContent = card.querySelector(".zodiac-years").textContent;
        tooltip.classList.add("visible");
        const rect = card.getBoundingClientRect();
        const tw = tooltip.offsetWidth;
        let left = rect.left + rect.width / 2 - tw / 2;
        left = Math.max(8, Math.min(left, window.innerWidth - tw - 8));
        tooltip.style.left = left + "px";
        tooltip.style.top = (rect.top - tooltip.offsetHeight - 8) + "px";
      });
    });

    // Dismiss tooltip on outside click
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".zodiac-card")) {
        const tooltip = $("#zodiac-tooltip");
        if (tooltip) { tooltip.classList.remove("visible"); activeZodiacCard = null; }
      }
    }, { capture: true });

    show($("#zodiac-section"));
  }

  // ── Draw simple canvas chart ──
  function drawChart(canvasId, labels, datasets, yUnit) {
    yUnit = yUnit || "";
    const canvas = $(canvasId);
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();
    const W = rect.width - 48;
    const H = 200;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.scale(dpr, dpr);

    const pad = { top: 20, right: 20, bottom: 36, left: 56 };
    const plotW = W - pad.left - pad.right;
    const plotH = H - pad.top - pad.bottom;

    // Find global min/max
    let gMin = Infinity, gMax = -Infinity;
    for (const ds of datasets) {
      for (const v of ds.values) {
        if (v < gMin) gMin = v;
        if (v > gMax) gMax = v;
      }
    }
    if (gMin === gMax) { gMin -= 1; gMax += 1; }
    const yRange = gMax - gMin;

    // Background
    ctx.fillStyle = "#1a2735";
    ctx.fillRect(0, 0, W, H);

    // Grid lines
    ctx.strokeStyle = "#2a3a4a";
    ctx.lineWidth = 0.5;
    const gridLines = 5;
    for (let i = 0; i <= gridLines; i++) {
      const y = pad.top + (plotH / gridLines) * i;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(W - pad.right, y);
      ctx.stroke();

      // Y labels
      ctx.fillStyle = "#8899aa";
      ctx.font = "11px sans-serif";
      ctx.textAlign = "right";
      const val = gMax - (yRange / gridLines) * i;
      ctx.fillText(val.toFixed(1) + yUnit, pad.left - 6, y + 4);
    }

    // X labels (show a subset)
    ctx.fillStyle = "#8899aa";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "center";
    const step = Math.max(1, Math.floor(labels.length / 7));
    for (let i = 0; i < labels.length; i += step) {
      const x = pad.left + (plotW / (labels.length - 1)) * i;
      ctx.fillText(labels[i], x, H - pad.bottom + 18);
    }

    // Draw datasets
    for (const ds of datasets) {
      ctx.beginPath();
      ctx.strokeStyle = ds.color;
      ctx.lineWidth = 2;
      for (let i = 0; i < ds.values.length; i++) {
        const x = pad.left + (plotW / (ds.values.length - 1)) * i;
        const y = pad.top + plotH - ((ds.values[i] - gMin) / yRange) * plotH;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Fill area
      if (ds.fill) {
        const last = ds.values.length - 1;
        ctx.lineTo(pad.left + plotW, pad.top + plotH);
        ctx.lineTo(pad.left, pad.top + plotH);
        ctx.closePath();
        ctx.fillStyle = ds.fill;
        ctx.fill();
      }
    }
  }

  // ── Render precipitation chart ──
  function renderPrecipChart(data, days) {
    const d = data.daily;
    const labels = [];
    const values = [];
    const isImperial = unit === "fahrenheit";
    for (let i = 0; i < days && i < d.time.length; i++) {
      labels.push(formatDate(d.time[i]).split(",")[0]);
      values.push(isImperial ? d.precipitation_sum[i] / 25.4 : d.precipitation_sum[i]);
    }
    drawChart("#precip-chart", labels, [
      { values, color: "#4fc3f7", fill: "rgba(79,195,247,0.15)" },
    ], isImperial ? " in" : " mm");
    show($("#precip-section"));
  }

  // ── Render temperature chart ──
  function renderTempChart(data, days) {
    const d = data.daily;
    const labels = [];
    const highs = [];
    const lows = [];
    for (let i = 0; i < days && i < d.time.length; i++) {
      labels.push(formatDate(d.time[i]).split(",")[0]);
      highs.push(tempVal(d.temperature_2m_max[i]));
      lows.push(tempVal(d.temperature_2m_min[i]));
    }
    const tempUnit = unit === "fahrenheit" ? "°F" : "°C";
    drawChart("#temp-chart", labels, [
      { values: highs, color: "#ff9800", fill: "rgba(255,152,0,0.10)" },
      { values: lows, color: "#4fc3f7", fill: "rgba(79,195,247,0.10)" },
    ], tempUnit);
    show($("#temp-chart-section"));
  }

  // ── Master render ──
  function renderAll(data, name) {
    weatherCache = data;
    hideLoading();

    // Hide everything first
    [
      "#current-weather", "#sun-times", "#sun-score-section", "#moon-phase", "#hourly-section",
      "#forecast-section", "#attire-section", "#zodiac-section",
    ].forEach((s) => hide($(s)));

    renderCurrent(data, name);
    renderBackgroundGradient(data);
    renderWeatherFX(data, name);
    renderSunTimes(data);
    renderSunScore(data);
    renderMoonPhase(data);
    renderHourly(data);
    renderDaily(data, forecastDays);
    renderAttire(data);
    renderZodiac(data);
    checkSevereOutlook(data);
    fetchWeatherAlerts(data.latitude, data.longitude);
  }

  // ── Fetch and render for coordinates ──
  async function loadWeather(lat, lon, name) {
    showLoading();
    hide(errorEl);
    currentLat = lat;
    currentLon = lon;
    // Persist location for page refresh
    try {
      localStorage.setItem("weather_loc", JSON.stringify({ lat, lon, name }));
    } catch (_) { /* storage unavailable */ }
    try {
      // Always fetch 14 days so we can toggle without re-fetching
      const data = await fetchWeather(lat, lon, 14);
      renderAll(data, name);
    } catch (err) {
      hideLoading();
      showError("Failed to load weather data. Please try again.");
    }
  }

  // ── Autocomplete search ──
  function formatCityName(r) {
    if (r.country_code === "US" && r.admin1) {
      const abbr = US_STATES[r.admin1] || r.admin1;
      return `${r.name}, ${abbr}, USA`;
    }
    return `${r.name}${r.country ? ", " + r.country : ""}`;
  }

  let debounceTimer = null;
  cityInput.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    const q = cityInput.value.trim();
    if (q.length < 2) { suggestionsEl.innerHTML = ""; return; }
    debounceTimer = setTimeout(async () => {
      try {
        const results = await geocode(q);
        results.sort((a, b) => (b.population || 0) - (a.population || 0));
        suggestionsEl.innerHTML = "";
        suggestionIdx = -1;
        const seen = new Set();
        for (const r of results) {
          const label = formatCityName(r);
          if (seen.has(label)) continue;
          seen.add(label);
          const div = document.createElement("div");
          div.className = "suggestion-item";
          div.textContent = formatCityName(r);
          div.addEventListener("click", () => {
            cityInput.value = r.name;
            suggestionsEl.innerHTML = "";
            loadWeather(r.latitude, r.longitude, formatCityName(r));
          });
          suggestionsEl.appendChild(div);
        }
      } catch (_) { /* ignore */ }
    }, 300);
  });

  // Close suggestions on outside click
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#search-bar") && !e.target.closest("#suggestions")) {
      suggestionsEl.innerHTML = "";
    }
  });

  // Select all text on focus for easy retyping
  cityInput.addEventListener("focus", () => {
    cityInput.select();
  });

  // ── Search button ──
  searchBtn.addEventListener("click", async () => {
    const q = cityInput.value.trim();
    if (!q) return;
    clearTimeout(debounceTimer);
    suggestionsEl.innerHTML = "";
    cityInput.blur();
    try {
      // If the query is a known country name, go straight to capital
      const capital = COUNTRY_CAPITALS[q.toLowerCase().trim()];
      if (capital) {
        const results = await geocode(capital);
        results.sort((a, b) => (b.population || 0) - (a.population || 0));
        if (results.length > 0) {
          const r = results[0];
          loadWeather(r.latitude, r.longitude, formatCityName(r));
          return;
        }
      }

      // Parse "city, region" format
      const parts = q.split(",").map(s => s.trim()).filter(Boolean);
      const cityName = parts[0];
      const regionHint = parts.slice(1).join(" ").toLowerCase();

      let results = await geocode(cityName);
      results.sort((a, b) => (b.population || 0) - (a.population || 0));

      // Check if the query might be a country name (no city results match well)
      const qLower = q.toLowerCase().trim();
      const looksLikeCountry = results.length === 0 || results.every(r =>
        (r.country || "").toLowerCase() === qLower ||
        (r.country_code || "").toLowerCase() === qLower
      );

      // If user provided a region/state/country hint, try to match it
      let r = results[0] || null;
      if (regionHint && results.length > 0) {
        const match = results.find(res => {
          const fields = [res.admin1, res.admin2, res.country, res.country_code]
            .filter(Boolean).map(s => s.toLowerCase()).join(" ");
          return fields.includes(regionHint) || regionHint.split(" ").some(word => word.length > 1 && fields.includes(word));
        });
        if (match) {
          r = match;
        } else {
          // Primary API didn't match region — try fallback geocoder with full query
          const fallback = await geocodeFallback(q);
          if (fallback.length > 0) r = fallback[0];
        }
      }

      // If primary returned nothing or query looks like a country, try fallback
      if (!r || (looksLikeCountry && !regionHint)) {
        const fallback = await geocodeFallback(q);
        if (fallback.length > 0) r = fallback[0];
      }

      if (!r) { showError("City not found"); return; }

      loadWeather(r.latitude, r.longitude, formatCityName(r));
    } catch (_) {
      showError("Search failed. Please try again.");
    }
  });

  // Enter key triggers search
  let suggestionIdx = -1;
  let suggestionOriginal = "";

  cityInput.addEventListener("keydown", (e) => {
    const items = suggestionsEl.querySelectorAll(".suggestion-item");
    if (e.key === "ArrowDown" && items.length > 0) {
      e.preventDefault();
      if (suggestionIdx === -1) suggestionOriginal = cityInput.value;
      suggestionIdx = Math.min(suggestionIdx + 1, items.length - 1);
      items.forEach(el => el.classList.remove("active"));
      items[suggestionIdx].classList.add("active");
      cityInput.value = items[suggestionIdx].textContent;
    } else if (e.key === "ArrowUp" && items.length > 0) {
      e.preventDefault();
      suggestionIdx = Math.max(suggestionIdx - 1, -1);
      items.forEach(el => el.classList.remove("active"));
      if (suggestionIdx >= 0) {
        items[suggestionIdx].classList.add("active");
        cityInput.value = items[suggestionIdx].textContent;
      } else {
        cityInput.value = suggestionOriginal;
      }
    } else if (e.key === "Enter") {
      suggestionIdx = -1;
      clearTimeout(debounceTimer);
      suggestionsEl.innerHTML = "";
      searchBtn.click();
    }
  });

  // ── Geolocation ──
  locateBtn.addEventListener("click", () => {
    if (!navigator.geolocation) { showError("Geolocation not supported"); return; }
    showLoading();
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        loadWeather(pos.coords.latitude, pos.coords.longitude, "Your Location");
      },
      () => {
        hideLoading();
        showError("Location access denied.");
      }
    );
  });

  // ── Randomize button ──
  const WORLD_CITIES = [
    // Asia
    [35.6762, 139.6503, "Tokyo, Japan"], [34.6937, 135.5023, "Osaka, Japan"],
    [35.1796, 136.9066, "Nagoya, Japan"], [32.7503, 129.8777, "Nagasaki, Japan"],
    [43.0621, 141.3544, "Sapporo, Japan"], [34.3853, 132.4553, "Hiroshima, Japan"],
    [39.9042, 116.4074, "Beijing, China"], [31.2304, 121.4737, "Shanghai, China"],
    [22.3193, 114.1694, "Hong Kong, China"], [39.0842, 117.2009, "Tianjin, China"],
    [30.5728, 104.0668, "Chengdu, China"], [23.1291, 113.2644, "Guangzhou, China"],
    [37.5665, 126.978, "Seoul, South Korea"], [35.1796, 129.0756, "Busan, South Korea"],
    [25.033, 121.5654, "Taipei, Taiwan"],
    [28.6139, 77.209, "New Delhi, India"], [19.076, 72.8777, "Mumbai, India"],
    [13.0827, 80.2707, "Chennai, India"], [12.9716, 77.5946, "Bangalore, India"],
    [13.7563, 100.5018, "Bangkok, Thailand"], [18.7883, 98.9853, "Chiang Mai, Thailand"],
    [1.3521, 103.8198, "Singapore"], [14.5995, 120.9842, "Manila, Philippines"],
    [21.0285, 105.8542, "Hanoi, Vietnam"], [-6.2088, 106.8456, "Jakarta, Indonesia"],
    [3.139, 101.6869, "Kuala Lumpur, Malaysia"], [39.9199, 32.8543, "Ankara, Turkey"],
    [41.0082, 28.9784, "Istanbul, Turkey"], [33.8886, 35.4955, "Beirut, Lebanon"],
    [31.7683, 35.2137, "Jerusalem, Israel"], [25.2048, 55.2708, "Dubai, UAE"],
    [24.4539, 54.3773, "Abu Dhabi, UAE"], [23.8859, 45.0792, "Riyadh, Saudi Arabia"],
    [40.4093, 49.8671, "Baku, Azerbaijan"], [41.7151, 44.8271, "Tbilisi, Georgia"],
    [47.9077, 106.9133, "Ulaanbaatar, Mongolia"], [27.7172, 85.324, "Kathmandu, Nepal"],
    // Europe
    [51.5074, -0.1278, "London, UK"], [48.8566, 2.3522, "Paris, France"],
    [52.52, 13.405, "Berlin, Germany"], [48.2082, 16.3738, "Vienna, Austria"],
    [55.7558, 37.6173, "Moscow, Russia"], [59.9343, 30.3351, "St. Petersburg, Russia"],
    [59.3293, 18.0686, "Stockholm, Sweden"], [60.1699, 24.9384, "Helsinki, Finland"],
    [64.1466, -21.9426, "Reykjavik, Iceland"], [69.6492, 18.9553, "Tromsø, Norway"],
    [59.9139, 10.7522, "Oslo, Norway"], [55.6761, 12.5683, "Copenhagen, Denmark"],
    [47.4979, 19.0402, "Budapest, Hungary"], [50.0755, 14.4378, "Prague, Czechia"],
    [52.2297, 21.0122, "Warsaw, Poland"], [44.4268, 26.1025, "Bucharest, Romania"],
    [42.6977, 23.3219, "Sofia, Bulgaria"], [37.9838, 23.7275, "Athens, Greece"],
    [41.3874, 2.1686, "Barcelona, Spain"], [40.4168, -3.7038, "Madrid, Spain"],
    [38.7223, -9.1393, "Lisbon, Portugal"], [43.7696, 11.2558, "Florence, Italy"],
    [41.9028, 12.4964, "Rome, Italy"], [45.4408, 12.3155, "Venice, Italy"],
    [46.2044, 6.1432, "Geneva, Switzerland"], [47.3769, 8.5417, "Zurich, Switzerland"],
    [53.3498, -6.2603, "Dublin, Ireland"], [55.9533, -3.1883, "Edinburgh, UK"],
    [50.8503, 4.3517, "Brussels, Belgium"], [52.3676, 4.9041, "Amsterdam, Netherlands"],
    [78.2232, 15.6267, "Longyearbyen, Norway"],
    // Africa
    [30.0444, 31.2357, "Cairo, Egypt"], [-1.2921, 36.8219, "Nairobi, Kenya"],
    [-33.9249, 18.4241, "Cape Town, South Africa"], [-26.2041, 28.0473, "Johannesburg, South Africa"],
    [6.5244, 3.3792, "Lagos, Nigeria"], [5.6037, -0.187, "Accra, Ghana"],
    [33.5731, -7.5898, "Casablanca, Morocco"], [36.8065, 3.0942, "Algiers, Algeria"],
    [9.0249, 38.7469, "Addis Ababa, Ethiopia"], [-4.4419, 15.2663, "Kinshasa, DR Congo"],
    [14.7167, -17.4677, "Dakar, Senegal"], [-6.7924, 39.2083, "Dar es Salaam, Tanzania"],
    // United States
    [40.7128, -74.006, "New York, NY, USA"], [34.0522, -118.2437, "Los Angeles, CA, USA"],
    [41.8781, -87.6298, "Chicago, IL, USA"], [29.7604, -95.3698, "Houston, TX, USA"],
    [33.4484, -112.074, "Phoenix, AZ, USA"], [29.9511, -90.0715, "New Orleans, LA, USA"],
    [39.9526, -75.1652, "Philadelphia, PA, USA"], [32.7767, -96.797, "Dallas, TX, USA"],
    [29.4241, -98.4936, "San Antonio, TX, USA"], [32.7157, -117.1611, "San Diego, CA, USA"],
    [47.6062, -122.3321, "Seattle, WA, USA"], [37.7749, -122.4194, "San Francisco, CA, USA"],
    [25.7617, -80.1918, "Miami, FL, USA"], [42.3601, -71.0589, "Boston, MA, USA"],
    [33.749, -84.388, "Atlanta, GA, USA"], [39.7392, -104.9903, "Denver, CO, USA"],
    [36.1627, -86.7816, "Nashville, TN, USA"], [30.2672, -97.7431, "Austin, TX, USA"],
    [21.3069, -157.8583, "Honolulu, HI, USA"], [61.2181, -149.9003, "Anchorage, AK, USA"],
    [27.3364, -82.5307, "Sarasota, FL, USA"], [28.5383, -81.3792, "Orlando, FL, USA"],
    [27.9506, -82.4572, "Tampa, FL, USA"], [30.3322, -81.6557, "Jacksonville, FL, USA"],
    [26.1224, -80.1373, "Fort Lauderdale, FL, USA"],
    [35.2271, -80.8431, "Charlotte, NC, USA"], [35.7796, -78.6382, "Raleigh, NC, USA"],
    [36.0726, -79.792, "Greensboro, NC, USA"],
    [38.9072, -77.0369, "Washington, DC, USA"], [39.2904, -76.6122, "Baltimore, MD, USA"],
    [37.5407, -77.436, "Richmond, VA, USA"], [36.8529, -75.978, "Virginia Beach, VA, USA"],
    [40.4406, -79.9959, "Pittsburgh, PA, USA"], [43.0481, -76.1474, "Syracuse, NY, USA"],
    [42.8864, -78.8784, "Buffalo, NY, USA"], [40.7282, -73.7949, "Long Island, NY, USA"],
    [41.764, -72.6823, "Hartford, CT, USA"], [41.3083, -72.9279, "New Haven, CT, USA"],
    [42.1015, -72.5898, "Springfield, MA, USA"], [41.824, -71.4128, "Providence, RI, USA"],
    [43.661, -70.2568, "Portland, ME, USA"], [44.4759, -73.2121, "Burlington, VT, USA"],
    [43.2081, -71.5376, "Concord, NH, USA"],
    [38.2527, -85.7585, "Louisville, KY, USA"], [39.1031, -84.512, "Cincinnati, OH, USA"],
    [41.4993, -81.6944, "Cleveland, OH, USA"], [39.9612, -82.9988, "Columbus, OH, USA"],
    [42.3314, -83.0458, "Detroit, MI, USA"], [42.9634, -85.6681, "Grand Rapids, MI, USA"],
    [43.0389, -87.9065, "Milwaukee, WI, USA"], [44.9778, -93.265, "Minneapolis, MN, USA"],
    [41.2565, -95.9345, "Omaha, NE, USA"], [39.0997, -94.5786, "Kansas City, MO, USA"],
    [38.627, -90.1994, "St. Louis, MO, USA"],
    [46.8772, -96.7898, "Fargo, ND, USA"], [43.5446, -96.7311, "Sioux Falls, SD, USA"],
    [40.8136, -96.7026, "Lincoln, NE, USA"],
    [35.4676, -97.5164, "Oklahoma City, OK, USA"], [36.154, -95.9928, "Tulsa, OK, USA"],
    [35.0844, -106.6504, "Albuquerque, NM, USA"], [32.2226, -110.9747, "Tucson, AZ, USA"],
    [36.1699, -115.1398, "Las Vegas, NV, USA"], [39.5296, -119.8138, "Reno, NV, USA"],
    [40.7608, -111.891, "Salt Lake City, UT, USA"], [43.615, -116.2023, "Boise, ID, USA"],
    [45.5152, -122.6784, "Portland, OR, USA"], [44.058, -121.3153, "Bend, OR, USA"],
    [36.7783, -119.4179, "Fresno, CA, USA"], [38.5816, -121.4944, "Sacramento, CA, USA"],
    [36.6002, -121.8947, "Monterey, CA, USA"], [34.4208, -119.6982, "Santa Barbara, CA, USA"],
    [33.4152, -111.8315, "Scottsdale, AZ, USA"],
    [32.0809, -81.0912, "Savannah, GA, USA"], [34.8526, -82.394, "Greenville, SC, USA"],
    [32.7765, -79.9311, "Charleston, SC, USA"],
    [35.1495, -90.049, "Memphis, TN, USA"],
    [35.0456, -85.3097, "Chattanooga, TN, USA"],
    [64.8378, -147.7164, "Fairbanks, AK, USA"], [58.3005, -134.4197, "Juneau, AK, USA"],
    [20.7984, -156.3319, "Kahului, HI, USA"],
    // Canada
    [45.4215, -75.6972, "Ottawa, Canada"], [49.2827, -123.1207, "Vancouver, Canada"],
    [45.5017, -73.5673, "Montréal, Canada"], [43.6532, -79.3832, "Toronto, Canada"],
    [51.0447, -114.0719, "Calgary, Canada"], [53.5461, -113.4938, "Edmonton, Canada"],
    // Latin America & Caribbean
    [19.4326, -99.1332, "Mexico City, Mexico"], [20.6597, -103.3496, "Guadalajara, Mexico"],
    [23.1136, -82.3666, "Havana, Cuba"], [18.4861, -69.9312, "Santo Domingo, Dominican Republic"],
    [9.9281, -84.0907, "San José, Costa Rica"],
    // South America
    [-22.9068, -43.1729, "Rio de Janeiro, Brazil"], [-23.5505, -46.6333, "São Paulo, Brazil"],
    [-15.7975, -47.8919, "Brasília, Brazil"], [-34.6037, -58.3816, "Buenos Aires, Argentina"],
    [-54.8019, -68.303, "Ushuaia, Argentina"], [-33.4489, -70.6693, "Santiago, Chile"],
    [-12.0464, -77.0428, "Lima, Peru"], [4.711, -74.0721, "Bogotá, Colombia"],
    [-0.1807, -78.4678, "Quito, Ecuador"], [-16.4897, -68.1193, "La Paz, Bolivia"],
    [-34.9011, -56.1645, "Montevideo, Uruguay"],
    // Oceania
    [-33.8688, 151.2093, "Sydney, Australia"], [-37.8136, 144.9631, "Melbourne, Australia"],
    [-27.4698, 153.0251, "Brisbane, Australia"], [-31.9505, 115.8605, "Perth, Australia"],
    [-41.2865, 174.7762, "Wellington, New Zealand"], [-36.8485, 174.7633, "Auckland, New Zealand"],
    [-17.7134, 178.065, "Suva, Fiji"],
    // Easter egg
    [39.4087, -79.4072, "Swallow Falls, Maryland, USA"],
    [38.8816, -77.0910, "Arlington, VA, USA"],
    [41.4040, -72.4526, "Chester, CT, USA"],
  ];
  let lastRandomIdx = -1;
  function triggerRandomCity() {
    let idx;
    do { idx = Math.floor(Math.random() * WORLD_CITIES.length); } while (idx === lastRandomIdx && WORLD_CITIES.length > 1);
    lastRandomIdx = idx;
    const city = WORLD_CITIES[idx];
    cityInput.value = city[2].split(",")[0];
    loadWeather(city[0], city[1], city[2]);
  }
  $("#random-btn").addEventListener("click", triggerRandomCity);

  // ── Shake to get random city (mobile) ──
  let shakeLastTime = 0;
  let shakeLastX = 0, shakeLastY = 0, shakeLastZ = 0;
  const SHAKE_THRESHOLD = 25;
  const SHAKE_COOLDOWN = 1500;

  function handleShake(e) {
    const acc = e.accelerationIncludingGravity;
    if (!acc) return;
    const now = Date.now();
    if (now - shakeLastTime < SHAKE_COOLDOWN) return;
    const dx = acc.x - shakeLastX;
    const dy = acc.y - shakeLastY;
    const dz = acc.z - shakeLastZ;
    const force = Math.sqrt(dx * dx + dy * dy + dz * dz);
    shakeLastX = acc.x;
    shakeLastY = acc.y;
    shakeLastZ = acc.z;
    if (force > SHAKE_THRESHOLD) {
      shakeLastTime = now;
      triggerRandomCity();
    }
  }

  if (window.DeviceMotionEvent) {
    if (typeof DeviceMotionEvent.requestPermission === "function") {
      // iOS 13+ requires permission — request on first touch
      document.addEventListener("touchstart", function iosMotionPermission() {
        DeviceMotionEvent.requestPermission().then((state) => {
          if (state === "granted") {
            window.addEventListener("devicemotion", handleShake);
          }
        }).catch(() => {});
        document.removeEventListener("touchstart", iosMotionPermission);
      }, { once: true });
    } else {
      window.addEventListener("devicemotion", handleShake);
    }
  }

  // ── Unit toggle (click temperature) ──
  $("#current-temp").addEventListener("click", () => {
    unit = unit === "fahrenheit" ? "celsius" : "fahrenheit";
    if (weatherCache && currentLat !== null) {
      renderAll(weatherCache, $("#location-name").textContent);
    }
  });

  // ── Collapsible sections ──
  document.querySelectorAll(".glass h3").forEach((h3) => {
    h3.classList.add("section-header-toggle");
    h3.addEventListener("click", (e) => {
      // Don't collapse when dragging the grip handle
      if (e.target.classList.contains("section-drag-handle")) return;
      const body = h3.closest("section").querySelector(".section-body");
      if (!body) return;
      h3.classList.toggle("collapsed");
      if (body.classList.contains("collapsed")) {
        body.style.maxHeight = body.scrollHeight + "px";
        body.classList.remove("collapsed");
        requestAnimationFrame(() => { body.style.maxHeight = body.scrollHeight + "px"; });
      } else {
        body.style.maxHeight = body.scrollHeight + "px";
        requestAnimationFrame(() => {
          body.style.maxHeight = "0px";
          body.classList.add("collapsed");
        });
      }
    });
  });

  // ── Drag-and-drop section reordering ──
  (function setupSectionDrag() {
    const container = $("#app");
    const sectionIds = [
      "sun-times", "sun-score-section", "moon-phase", "hourly-section",
      "forecast-section", "attire-section", "zodiac-section",
    ];
    const sections = sectionIds.map(id => $(`#${id}`)).filter(Boolean);

    // Add drag handle to each reorderable section
    sections.forEach(sec => {
      const h3 = sec.querySelector("h3");
      if (!h3) return;
      const handle = document.createElement("span");
      handle.className = "section-drag-handle";
      handle.textContent = "⠿";
      handle.title = "Drag to reorder";
      h3.prepend(handle);
    });

    // Restore saved order
    try {
      const saved = JSON.parse(localStorage.getItem("section_order"));
      if (saved && saved.length === sectionIds.length) {
        // Find the anchor: current-weather section
        const anchor = $("#current-weather");
        let ref = anchor;
        saved.forEach(id => {
          const el = $(`#${id}`);
          if (el) {
            ref.after(el);
            ref = el;
          }
        });
      }
    } catch (_) {}

    let dragSection = null;

    function saveSectionOrder() {
      const order = [...container.querySelectorAll("section.glass")]
        .map(s => s.id)
        .filter(id => sectionIds.includes(id));
      try { localStorage.setItem("section_order", JSON.stringify(order)); } catch (_) {}
    }

    sections.forEach(sec => {
      const handle = sec.querySelector(".section-drag-handle");
      if (!handle) return;
      sec.draggable = false; // only drag via handle

      handle.addEventListener("mousedown", () => { sec.draggable = true; });
      document.addEventListener("mouseup", () => { sec.draggable = false; });

      sec.addEventListener("dragstart", (e) => {
        dragSection = sec;
        sec.classList.add("section-dragging");
        e.dataTransfer.effectAllowed = "move";
      });

      sec.addEventListener("dragend", () => {
        sec.classList.remove("section-dragging");
        sections.forEach(s => s.classList.remove("section-drag-over"));
        dragSection = null;
        sec.draggable = false;
        saveSectionOrder();
      });

      sec.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (sec !== dragSection) sec.classList.add("section-drag-over");
      });

      sec.addEventListener("dragleave", () => {
        sec.classList.remove("section-drag-over");
      });

      sec.addEventListener("drop", (e) => {
        e.preventDefault();
        sec.classList.remove("section-drag-over");
        if (dragSection && dragSection !== sec) {
          const allSections = [...container.querySelectorAll("section.glass")].filter(s => sectionIds.includes(s.id));
          const fromIdx = allSections.indexOf(dragSection);
          const toIdx = allSections.indexOf(sec);
          if (fromIdx < toIdx) {
            sec.after(dragSection);
          } else {
            sec.parentNode.insertBefore(dragSection, sec);
          }
        }
      });

      // Touch support for section handle
      let touchActive = false;
      handle.addEventListener("touchstart", (e) => {
        e.preventDefault();
        e.stopPropagation();
        dragSection = sec;
        sec.classList.add("section-dragging");
        touchActive = true;
      });

      handle.addEventListener("touchmove", (e) => {
        if (!touchActive || dragSection !== sec) return;
        e.preventDefault();
        const touch = e.touches[0];
        const target = document.elementFromPoint(touch.clientX, touch.clientY);
        const overSec = target ? target.closest("section.glass") : null;
        sections.forEach(s => s.classList.remove("section-drag-over"));
        if (overSec && sectionIds.includes(overSec.id) && overSec !== dragSection) {
          overSec.classList.add("section-drag-over");
        }
      }, { passive: false });

      handle.addEventListener("touchend", (e) => {
        if (!touchActive || dragSection !== sec) return;
        touchActive = false;
        const touch = e.changedTouches[0];
        const target = document.elementFromPoint(touch.clientX, touch.clientY);
        const overSec = target ? target.closest("section.glass") : null;
        if (overSec && sectionIds.includes(overSec.id) && overSec !== dragSection) {
          const allSections = [...container.querySelectorAll("section.glass")].filter(s => sectionIds.includes(s.id));
          const fromIdx = allSections.indexOf(dragSection);
          const toIdx = allSections.indexOf(overSec);
          if (fromIdx < toIdx) {
            overSec.after(dragSection);
          } else {
            container.insertBefore(dragSection, overSec);
          }
        }
        sections.forEach(s => s.classList.remove("section-drag-over"));
        sec.classList.remove("section-dragging");
        dragSection = null;
        saveSectionOrder();
      });
    });
  })();

  // ── Range toggle (7/14 days) ──
  document.querySelectorAll(".range-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".range-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      forecastDays = parseInt(btn.dataset.days, 10);
      if (weatherCache) {
        renderDaily(weatherCache, forecastDays);
      }
    });
  });

  // ── Default: restore last city, else geolocation, else San Francisco ──
  let savedLoc = null;
  try {
    savedLoc = JSON.parse(localStorage.getItem("weather_loc"));
  } catch (_) { /* ignore */ }

  if (savedLoc && savedLoc.lat && savedLoc.lon && savedLoc.name) {
    loadWeather(savedLoc.lat, savedLoc.lon, cityNameWithAbbrev(savedLoc.name));
  } else if (navigator.geolocation) {
    showLoading();
    navigator.geolocation.getCurrentPosition(
      (pos) => loadWeather(pos.coords.latitude, pos.coords.longitude, "Your Location"),
      () => loadWeather(37.7749, -122.4194, "San Francisco, USA")
    );
  } else {
    loadWeather(37.7749, -122.4194, "San Francisco, USA");
  }

  // ── Sparkle effects (trail on desktop, click explosion everywhere) ──
  const sparkleTrail = [];
  const sparkleCanvas = document.createElement("canvas");
  sparkleCanvas.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;z-index:9999;pointer-events:none;";
  document.body.appendChild(sparkleCanvas);
  const sCtx = sparkleCanvas.getContext("2d");
  sparkleCanvas.width = window.innerWidth;
  sparkleCanvas.height = window.innerHeight;
  window.addEventListener("resize", () => {
    sparkleCanvas.width = window.innerWidth;
    sparkleCanvas.height = window.innerHeight;
  });

  // Cursor trail (desktop only)
  if (!("ontouchstart" in window)) {
    document.addEventListener("mousemove", (e) => {
      for (let i = 0; i < 2; i++) {
        sparkleTrail.push({
          x: e.clientX + (Math.random() - 0.5) * 12,
          y: e.clientY + (Math.random() - 0.5) * 12,
          size: 1.5 + Math.random() * 3,
          life: 1,
          decay: 0.015 + Math.random() * 0.02,
          vx: (Math.random() - 0.5) * 0.8,
          vy: (Math.random() - 0.5) * 0.8 + 0.3,
          hue: Math.random(),
        });
      }
    });
  }

  // Click/tap sparkle explosion (desktop + mobile)
  function spawnClickSparkles(x, y) {
    const count = 18 + Math.floor(Math.random() * 8);
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
      const speed = 1.5 + Math.random() * 3;
      sparkleTrail.push({
        x: x + (Math.random() - 0.5) * 6,
        y: y + (Math.random() - 0.5) * 6,
        size: 2 + Math.random() * 4,
        life: 1,
        decay: 0.012 + Math.random() * 0.015,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        hue: Math.random(),
      });
    }
  }
  document.addEventListener("click", (e) => spawnClickSparkles(e.clientX, e.clientY));
  let _tapStart = null;
  document.addEventListener("touchstart", (e) => {
    const t = e.touches[0];
    if (t) _tapStart = { x: t.clientX, y: t.clientY, time: Date.now() };
  }, { passive: true });
  document.addEventListener("touchend", (e) => {
    if (!_tapStart) return;
    const t = e.changedTouches[0];
    if (!t) { _tapStart = null; return; }
    const dx = t.clientX - _tapStart.x;
    const dy = t.clientY - _tapStart.y;
    const dt = Date.now() - _tapStart.time;
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10 && dt < 300) {
      spawnClickSparkles(t.clientX, t.clientY);
    }
    _tapStart = null;
  }, { passive: true });

  (function animateSparkles() {
    sCtx.clearRect(0, 0, sparkleCanvas.width, sparkleCanvas.height);
    for (let i = sparkleTrail.length - 1; i >= 0; i--) {
      const p = sparkleTrail[i];
      p.life -= p.decay;
      if (p.life <= 0) { sparkleTrail.splice(i, 1); continue; }
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.03;
      const alpha = p.life * 0.8;
      const s = p.size * p.life;
      const r = p.hue < 0.33 ? 255 : p.hue < 0.66 ? 255 : 220;
      const g = p.hue < 0.33 ? 200 : p.hue < 0.66 ? 230 : 180;
      const b = p.hue < 0.33 ? 220 : p.hue < 0.66 ? 255 : 255;
      sCtx.save();
      sCtx.translate(p.x, p.y);
      sCtx.globalAlpha = alpha;
      sCtx.strokeStyle = `rgb(${r}, ${g}, ${b})`;
      sCtx.lineWidth = 0.8;
      sCtx.beginPath(); sCtx.moveTo(0, -s); sCtx.lineTo(0, s); sCtx.stroke();
      sCtx.beginPath(); sCtx.moveTo(-s, 0); sCtx.lineTo(s, 0); sCtx.stroke();
      sCtx.beginPath(); sCtx.arc(0, 0, s * 0.3, 0, Math.PI * 2);
      sCtx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      sCtx.fill();
      sCtx.restore();
    }
    requestAnimationFrame(animateSparkles);
  })();

})();
