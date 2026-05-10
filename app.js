(() => {
  const app = document.getElementById("app");

  const bodyPresets = {
    petite: { height: 0.92, head: 1.05, shoulders: 0.86, waist: 0.88, leg: 0.98 },
    balanced: { height: 1.0, head: 1.0, shoulders: 1.0, waist: 1.0, leg: 1.0 },
    athletic: { height: 1.03, head: 0.95, shoulders: 1.08, waist: 0.95, leg: 1.05 },
    bulky: { height: 1.0, head: 0.92, shoulders: 1.22, waist: 1.12, leg: 0.96 },
  };

  const poses = ["Idle", "Walk", "Run", "Jump", "Attack", "Cast", "Hurt", "Victory"];

  const clothingOptions = {
    headwear: ["None", "Cap", "Hood", "Crown", "Bandana", "Helmet"],
    top: ["Tee", "Hoodie", "Armor", "Jacket", "Robe", "Tunic"],
    bottom: ["Shorts", "Pants", "Armor Pants", "Skirt", "Kilt"],
    shoes: ["Sneakers", "Boots", "Sandals", "Barefoot", "Heavy Boots"],
    accessory: ["None", "Cape", "Scarf", "Backpack", "Shoulder Pad", "Amulet"],
  };

  const featureOptions = {
    skin: ["Warm", "Fair", "Tan", "Deep", "Cool Gray", "Fantasy Blue"],
    hair: ["Short", "Long", "Spiky", "Curly", "Bald", "Braided"],
    eyes: ["Round", "Sharp", "Glow", "Sleepy", "Robot", "Cat"],
    facial: ["Clean", "Beard", "Moustache", "Scar", "Mask"],
  };

  const abilityDefaults = [
    { name: "Dash", enabled: true },
    { name: "Double Jump", enabled: true },
    { name: "Shield", enabled: false },
    { name: "Fire", enabled: false },
    { name: "Ice", enabled: false },
    { name: "Fly", enabled: false },
    { name: "Stealth", enabled: false },
    { name: "Heal", enabled: false },
  ];

  const state = loadState() || {
    name: "Nova",
    theme: "default",
    style: "pixel",
    gender: "Neutral",
    bodyType: "balanced",
    hairColor: "Brown",
    skinTone: "Warm",
    eyeColor: "Brown",
    hairStyle: "Short",
    eyeStyle: "Round",
    facialHair: "Clean",
    headwear: "None",
    top: "Tee",
    bottom: "Pants",
    shoes: "Boots",
    accessory: "None",
    height: 50,
    headSize: 50,
    shoulders: 50,
    waist: 50,
    legLength: 50,
    animation: "Idle",
    abilities: abilityDefaults,
    notes: "A nimble explorer with balanced combat and mobility.",
    poseIndex: 0,
  };

  const el = (tag, attrs = {}, children = []) => {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (key === "class") node.className = value;
      else if (key === "html") node.innerHTML = value;
      else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2), value);
      else if (value !== null && value !== undefined) node.setAttribute(key, String(value));
    }
    for (const child of [].concat(children)) {
      if (child === null || child === undefined) continue;
      node.appendChild(child.nodeType ? child : document.createTextNode(String(child)));
    }
    return node;
  };

  const downloadText = (filename, content) => {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const choice = (arr) => arr[Math.floor(Math.random() * arr.length)];

  function palette(theme) {
    switch (theme) {
      case "sunset":
        return { bg: "#f8efe6", accent: "#e76f51", accent2: "#f4a261", dark: "#2f2e41", light: "#fff7f1" };
      case "neon":
        return { bg: "#12131a", accent: "#7c5cff", accent2: "#2de2e6", dark: "#e9ecf1", light: "#1a1c26" };
      case "forest":
        return { bg: "#edf6ec", accent: "#2f855a", accent2: "#6bbf59", dark: "#1f2937", light: "#f6fbf5" };
      default:
        return { bg: "#f4f6fb", accent: "#5b7cfa", accent2: "#9b5de5", dark: "#253041", light: "#ffffff" };
    }
  }

  const skinMap = {
    Warm: "#d8a07e",
    Fair: "#f2d6c9",
    Tan: "#c98f68",
    Deep: "#7a4f3d",
    "Cool Gray": "#9ea3ad",
    "Fantasy Blue": "#6aa9d8",
  };

  const hairMap = {
    Black: "#1f1f26",
    Brown: "#5c3d2e",
    Blonde: "#d9bd6b",
    Red: "#a93c2e",
    White: "#eceff6",
    Blue: "#4b6bd9",
    Pink: "#dd74b9",
    Green: "#59b167",
  };

  function activeAbilities() {
    return state.abilities.filter(a => a.enabled).map(a => a.name);
  }

  function characterClass() {
    const abilities = activeAbilities();
    if (abilities.includes("Fly")) return "Skyborne";
    if (abilities.includes("Fire") || abilities.includes("Ice")) return "Elemental";
    if (abilities.includes("Shield")) return "Guardian";
    return "Adventurer";
  }

  function designCode() {
    const parts = [
      state.name, state.theme, state.bodyType, state.gender, state.style,
      state.hairColor, state.skinTone, state.eyeColor, state.headwear,
      state.top, state.bottom, state.shoes, state.accessory,
      state.hairStyle, state.eyeStyle, state.facialHair,
      state.height, state.headSize, state.shoulders, state.waist, state.legLength,
      activeAbilities().join(",")
    ];
    return btoa(unescape(encodeURIComponent(parts.join("|")))).replace(/=+$/g, "");
  }

  function saveState() {
    localStorage.setItem("spritesmith-studio", JSON.stringify(state));
  }

  function loadState() {
    try {
      const raw = localStorage.getItem("spritesmith-studio");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function setState(patch) {
    Object.assign(state, patch);
    saveState();
    render();
  }

  function setAbility(name) {
    state.abilities = state.abilities.map(a => a.name === name ? { ...a, enabled: !a.enabled } : a);
    saveState();
    render();
  }

  function togglePose() {
    state.poseIndex = (state.poseIndex + 1) % poses.length;
    state.animation = poses[state.poseIndex];
    saveState();
    render();
  }

  function randomize() {
    const seeded = abilityDefaults.map(a => ({ ...a, enabled: Math.random() > 0.55 }));
    Object.assign(state, {
      name: choice(["Nova", "Rift", "Astra", "Kairo", "Mira", "Flux", "Echo", "Vanta"]),
      theme: choice(["default", "sunset", "neon", "forest"]),
      style: choice(["pixel", "vector", "concept"]),
      gender: choice(["Neutral", "Female", "Male"]),
      bodyType: choice(Object.keys(bodyPresets)),
      hairColor: choice(["Black", "Brown", "Blonde", "Red", "White", "Blue", "Pink", "Green"]),
      skinTone: choice(Object.keys(skinMap)),
      eyeColor: choice(["Brown", "Blue", "Green", "Gray", "Glow"]),
      hairStyle: choice(featureOptions.hair),
      eyeStyle: choice(featureOptions.eyes),
      facialHair: choice(featureOptions.facial),
      headwear: choice(clothingOptions.headwear),
      top: choice(clothingOptions.top),
      bottom: choice(clothingOptions.bottom),
      shoes: choice(clothingOptions.shoes),
      accessory: choice(clothingOptions.accessory),
      height: clamp(Math.round(35 + Math.random() * 35), 0, 100),
      headSize: clamp(Math.round(35 + Math.random() * 35), 0, 100),
      shoulders: clamp(Math.round(35 + Math.random() * 40), 0, 100),
      waist: clamp(Math.round(35 + Math.random() * 35), 0, 100),
      legLength: clamp(Math.round(35 + Math.random() * 40), 0, 100),
      abilities: seeded,
      poseIndex: Math.floor(Math.random() * poses.length),
      animation: poses[Math.floor(Math.random() * poses.length)],
      notes: "Randomized prototype character.",
    });
    saveState();
    render();
  }

  function exportJSON() {
    const payload = {
      app: "SpriteSmith Studio",
      version: 1,
      characterCode: designCode(),
      character: {
        ...state,
        abilities: activeAbilities(),
        class: characterClass()
      },
      generatedAt: new Date().toISOString(),
    };
    downloadText(`${state.name || "character"}.spritesmith.json`, JSON.stringify(payload, null, 2));
    toast("Export complete.");
  }

  let toastTimer = null;
  function toast(text) {
    const existing = document.querySelector(".toast");
    if (existing) existing.remove();
    const node = el("div", { class: "toast" }, text);
    Object.assign(node.style, {
      position: "fixed",
      left: "50%",
      bottom: "22px",
      transform: "translateX(-50%)",
      background: "#0f172a",
      color: "white",
      padding: "12px 16px",
      borderRadius: "999px",
      boxShadow: "0 15px 35px rgba(0,0,0,.18)",
      zIndex: 9999,
      fontSize: "13px",
      fontWeight: "700",
    });
    document.body.appendChild(node);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.remove(), 1600);
  }

  function svgSprite(pose, frame) {
    const p = palette(state.theme);
    const body = bodyPresets[state.bodyType] || bodyPresets.balanced;
    const abilities = activeAbilities();
    const fighting = pose === "Attack" || pose === "Hurt";
    const moving = pose === "Walk" || pose === "Run";
    const jumping = pose === "Jump";
    const casting = pose === "Cast";
    const victory = pose === "Victory";
    const stealth = abilities.includes("Stealth");
    const flight = abilities.includes("Fly");
    const fire = abilities.includes("Fire");
    const ice = abilities.includes("Ice");
    const shield = abilities.includes("Shield");

    const bob = moving ? (frame % 2 === 0 ? -3 : 3) : jumping ? -10 : victory ? -5 : 0;
    const armShift = fighting ? 16 : casting ? 10 : moving ? (frame % 2 === 0 ? -6 : 6) : 0;
    const legShift = moving ? (frame % 2 === 0 ? 10 : -10) : jumping ? 6 : 0;
    const bodyY = 124 + bob;
    const headY = 64 + bob;
    const bodyW = 34 * body.shoulders;
    const waistW = 24 * body.waist;
    const legW = 12;
    const headR = 28 * body.head;
    const heightScale = body.height;
    const legLen = 58 * body.leg;
    const topLen = 58 * heightScale;
    const skin = skinMap[state.skinTone] || skinMap.Warm;
    const hair = hairMap[state.hairColor] || hairMap.Brown;
    const clothTop = state.top === "Armor" ? p.accent2 : state.top === "Robe" ? p.light : p.accent;
    const clothBottom = state.bottom === "Armor Pants" ? p.accent2 : state.bottom === "Skirt" ? p.light : p.dark;
    const shoe = state.shoes === "Sandals" ? p.accent2 : p.dark;
    const cloak = state.accessory === "Cape" ? p.accent2 : state.accessory === "Scarf" ? p.accent : null;

    return `
      <svg viewBox="0 0 220 220" width="100%" height="100%" aria-label="${state.name} sprite">
        <defs>
          <linearGradient id="bg-${pose}-${frame}" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="${p.light}" />
            <stop offset="100%" stop-color="${p.bg}" />
          </linearGradient>
          <filter id="shadow-${pose}-${frame}" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="6" stdDeviation="8" flood-opacity="0.18" />
          </filter>
        </defs>
        <rect x="0" y="0" width="220" height="220" rx="28" fill="url(#bg-${pose}-${frame})" />
        <circle cx="110" cy="178" r="42" fill="rgba(0,0,0,0.08)" />
        <g filter="url(#shadow-${pose}-${frame})" transform="translate(0 ${flight ? -10 : 0}) scale(${stealth ? 0.98 : 1})">
          ${cloak ? `<path d="M 86 ${bodyY - 18} C 72 ${bodyY + 10}, 64 ${bodyY + 54}, 67 ${bodyY + 90} L 153 ${bodyY + 90} C 156 ${bodyY + 54}, 148 ${bodyY + 10}, 134 ${bodyY - 18} Z" fill="${cloak}" opacity="0.82" />` : ""}
          <ellipse cx="110" cy="${bodyY + 70}" rx="44" ry="10" fill="rgba(0,0,0,0.14)" />
          <rect x="${110 - waistW / 2}" y="${bodyY - 8}" width="${waistW}" height="${topLen}" rx="18" fill="${clothTop}" />
          <rect x="${110 - bodyW / 2}" y="${bodyY - 8}" width="${bodyW}" height="14" rx="7" fill="${clothTop}" opacity="0.92" />
          <rect x="${110 - bodyW / 2}" y="${bodyY + 38}" width="${bodyW}" height="14" rx="7" fill="${clothTop}" opacity="0.92" />
          <g transform="translate(0 ${armShift})">
            <rect x="74" y="${bodyY + 10}" width="14" height="44" rx="7" fill="${skin}" transform="rotate(${fighting ? -26 : moving ? -10 : 8}, 81, ${bodyY + 14})" />
            <rect x="132" y="${bodyY + 10}" width="14" height="44" rx="7" fill="${skin}" transform="rotate(${fighting ? 26 : moving ? 10 : -8}, 139, ${bodyY + 14})" />
            <circle cx="81" cy="${bodyY + 56}" r="8" fill="${skin}" />
            <circle cx="139" cy="${bodyY + 56}" r="8" fill="${skin}" />
          </g>
          ${shield ? `<path d="M 150 ${bodyY + 20} L 176 ${bodyY + 28} L 170 ${bodyY + 58} L 150 ${bodyY + 70} L 130 ${bodyY + 58} L 124 ${bodyY + 28} Z" fill="${p.accent2}" opacity="0.9" />` : ""}
          ${fire && pose === "Cast" ? `<path d="M 154 ${bodyY + 8} C 166 ${bodyY - 8}, 177 ${bodyY + 4}, 171 ${bodyY + 21} C 165 ${bodyY + 37}, 147 ${bodyY + 28}, 154 ${bodyY + 8} Z" fill="#ff9f1c" opacity="0.9" />` : ""}
          ${ice && pose === "Cast" ? `<path d="M 154 ${bodyY + 8} L 164 ${bodyY + 38} L 142 ${bodyY + 22} L 166 ${bodyY + 22} L 144 ${bodyY + 38} Z" fill="#72d7ff" opacity="0.9" />` : ""}
          <g transform="translate(0 ${legShift})">
            <rect x="91" y="${bodyY + 48}" width="${legW}" height="${legLen}" rx="5" fill="${clothBottom}" transform="rotate(${moving ? -14 : jumping ? -8 : 0}, 96, ${bodyY + 50})" />
            <rect x="121" y="${bodyY + 48}" width="${legW}" height="${legLen}" rx="5" fill="${clothBottom}" transform="rotate(${moving ? 14 : jumping ? 8 : 0}, 126, ${bodyY + 50})" />
            <rect x="85" y="${bodyY + 98}" width="22" height="10" rx="5" fill="${shoe}" transform="rotate(${moving ? -10 : 0}, 96, ${bodyY + 102})" />
            <rect x="113" y="${bodyY + 98}" width="22" height="10" rx="5" fill="${shoe}" transform="rotate(${moving ? 10 : 0}, 124, ${bodyY + 102})" />
          </g>
          <circle cx="110" cy="${headY}" r="${headR}" fill="${skin}" />
          ${state.headwear !== "None" && state.headwear !== "Helmet" ? `<path d="M ${110 - headR - 1} ${headY - headR + 6} C ${110 - 10} ${headY - headR - 12}, ${110 + 10} ${headY - headR - 12}, ${110 + headR + 1} ${headY - headR + 6} L ${110 + headR + 1} ${headY - headR + 18} C ${110 + 8} ${headY - headR + 9}, ${110 - 8} ${headY - headR + 9}, ${110 - headR - 1} ${headY - headR + 18} Z" fill="${state.headwear === "Crown" ? p.accent2 : state.headwear === "Hood" ? clothTop : p.dark}" />` : ""}
          ${state.headwear === "Helmet" ? `<path d="M ${110 - 30} ${headY - 18} C ${110 - 24} ${headY - 42}, ${110 + 24} ${headY - 42}, ${110 + 30} ${headY - 18} L ${110 + 28} ${headY + 10} L ${110 - 28} ${headY + 10} Z" fill="${p.dark}" />` : ""}
          ${state.hairStyle !== "Bald" ? `<path d="M ${110 - headR} ${headY - 3} C ${110 - 28} ${headY - 36}, ${110 + 28} ${headY - 36}, ${110 + headR} ${headY - 3} C ${110 + 24} ${headY - 16}, ${110 - 24} ${headY - 16}, ${110 - headR} ${headY - 3} Z" fill="${hair}" opacity="0.96" />` : ""}
          ${state.hairStyle === "Long" ? `<path d="M ${110 - 24} ${headY + 2} C ${92} ${headY + 16}, ${92} ${headY + 48}, ${94} ${headY + 64} L ${100} ${headY + 62} C ${96} ${headY + 42}, ${98} ${headY + 20}, ${110 - 12} ${headY + 8} Z" fill="${hair}" />` : ""}
          ${state.hairStyle === "Spiky" ? `<path d="M ${110 - 20} ${headY - 26} L ${110 - 10} ${headY - 44} L ${110} ${headY - 28} L ${110 + 10} ${headY - 46} L ${110 + 20} ${headY - 24} Z" fill="${hair}" />` : ""}
          ${state.hairStyle === "Curly" ? `<circle cx="${110 - 18}" cy="${headY - 18}" r="11" fill="${hair}" opacity="0.95" /><circle cx="${110 + 18}" cy="${headY - 18}" r="11" fill="${hair}" opacity="0.95" />` : ""}
          ${state.hairStyle === "Braided" ? `<path d="M ${110 - 10} ${headY + 4} C ${102} ${headY + 20}, ${102} ${headY + 42}, ${108} ${headY + 58}" stroke="${hair}" stroke-width="8" stroke-linecap="round" fill="none" /><path d="M ${110 + 10} ${headY + 4} C ${118} ${headY + 20}, ${118} ${headY + 42}, ${112} ${headY + 58}" stroke="${hair}" stroke-width="8" stroke-linecap="round" fill="none" />` : ""}
          ${state.facialHair === "Beard" ? `<path d="M ${110 - 15} ${headY + 12} C ${102} ${headY + 30}, ${118} ${headY + 30}, ${110 + 15} ${headY + 12} C ${118} ${headY + 42}, ${102} ${headY + 42}, ${110 - 15} ${headY + 12} Z" fill="${hair}" opacity="0.85" />` : ""}
          ${state.facialHair === "Moustache" ? `<path d="M ${110 - 13} ${headY + 13} C ${105} ${headY + 8}, ${100} ${headY + 8}, ${96} ${headY + 12} C ${102} ${headY + 16}, ${106} ${headY + 17}, ${110 - 13} ${headY + 13} Z" fill="${hair}" opacity="0.9" />` : ""}
          ${state.facialHair === "Scar" ? `<path d="M ${110 + 7} ${headY - 2} L ${110 + 18} ${headY + 10}" stroke="#8b3c3c" stroke-width="3" stroke-linecap="round" />` : ""}
          ${state.facialHair === "Mask" ? `<rect x="${110 - 16}" y="${headY + 4}" width="32" height="16" rx="8" fill="${p.dark}" opacity="0.9" />` : ""}
          <circle cx="96" cy="${headY + 2}" r="3.5" fill="${state.eyeColor === "Glow" ? p.accent2 : p.dark}" />
          <circle cx="124" cy="${headY + 2}" r="3.5" fill="${state.eyeColor === "Glow" ? p.accent2 : p.dark}" />
          ${state.eyeStyle === "Sharp" ? `<path d="M ${92} ${headY - 2} L ${101} ${headY + 1} L ${92} ${headY + 4}" stroke="${p.dark}" stroke-width="2" fill="none" />` : ""}
          ${state.eyeStyle === "Cat" ? `<path d="M ${94} ${headY + 1} L ${98} ${headY - 2} L ${102} ${headY + 1}" stroke="${p.dark}" stroke-width="2" fill="none" />` : ""}
          ${state.eyeStyle === "Robot" ? `<rect x="92" y="${headY - 1}" width="8" height="8" rx="2" fill="${p.dark}" />` : ""}
          <path d="M ${104} ${headY + 16} C ${110} ${headY + 22}, ${114} ${headY + 22}, ${118} ${headY + 16}" stroke="${p.dark}" stroke-width="2.5" fill="none" stroke-linecap="round" />
          ${state.eyeStyle === "Sleepy" ? `<path d="M ${91} ${headY + 1} C ${96} ${headY - 2}, ${98} ${headY - 2}, ${103} ${headY + 1}" stroke="${p.dark}" stroke-width="2" fill="none" />` : ""}
          ${casting ? `<circle cx="154" cy="${bodyY + 12}" r="18" fill="${p.accent2}" opacity="0.24" />` : ""}
          ${victory ? `<path d="M ${110 - 14} ${headY + 44} C ${110 - 8} ${headY + 36}, ${110 + 8} ${headY + 36}, ${110 + 14} ${headY + 44}" stroke="${p.accent}" stroke-width="4" stroke-linecap="round" fill="none" />` : ""}
        </g>
      </svg>`;
  }

  function controlField(label, control) {
    return el("div", { class: "field" }, [
      el("label", {}, label),
      control
    ]);
  }

  function rangeField(label, key, min, max, suffix = "") {
    const value = state[key];
    return el("div", { class: "range" }, [
      el("div", { class: "row" }, [
        el("span", {}, label),
        el("span", { class: "value" }, `${value}${suffix}`)
      ]),
      el("input", {
        type: "range",
        min, max, step: 1, value,
        oninput: (e) => setState({ [key]: Number(e.target.value) })
      })
    ]);
  }

  function selectField(label, key, options) {
    const sel = el("select", {
      onchange: (e) => setState({ [key]: e.target.value })
    }, options.map(opt => el("option", { value: opt, selected: state[key] === opt ? "selected" : null }, opt)));
    return controlField(label, sel);
  }

  function textField(label, key) {
    const input = el("input", {
      type: "text",
      value: state[key],
      oninput: (e) => setState({ [key]: e.target.value })
    });
    return controlField(label, input);
  }

  function specRow(label, value) {
    return el("div", { class: "spec-row" }, [
      el("div", { class: "label" }, label),
      el("div", { class: "value" }, value)
    ]);
  }

  function buildUI() {
    const abilitiesChips = state.abilities.map(ability =>
      el("button", {
        class: `chip ${ability.enabled ? "active" : ""}`,
        type: "button",
        onclick: () => setAbility(ability.name)
      }, [
        ability.name === "Shield" ? "🛡 " :
        ability.name === "Fire" ? "✨ " :
        ability.name === "Fly" ? "🌙 " :
        ability.name === "Double Jump" ? "👣 " :
        ability.name === "Dash" ? "➜ " :
        ability.name === "Heal" ? "➕ " :
        ability.name === "Stealth" ? "🎭 " : "⚔ ",
        ability.name
      ])
    );

    const poseCards = poses.map((pose, i) => {
      const holder = el("div", { class: `pose-btn ${state.poseIndex === i ? "active" : ""}` }, [
        el("div", { class: "svg-holder", html: svgSprite(pose, i) }),
        el("div", { class: "pose-name" }, pose)
      ]);
      holder.addEventListener("click", () => setState({ poseIndex: i, animation: pose }));
      return holder;
    });

    const preview = el("div", { class: "canvas-card" }, [
      el("div", { class: "svg-holder", html: svgSprite(poses[state.poseIndex], state.poseIndex) })
    ]);

    const sheet = el("div", { class: "canvas-card sheet" }, [
      el("div", { class: "pose-grid" }, poseCards)
    ]);

    const infoCard = el("div", { class: "info-card" }, [
      el("div", { class: "info-kicker" }, "Character class"),
      el("div", { class: "info-title" }, characterClass()),
      el("div", { class: "info-sub" }, "Derived from the active abilities and visual profile.")
    ]);

    const codeCard = el("div", { class: "info-card" }, [
      el("div", { class: "info-kicker" }, "Design code"),
      el("textarea", { class: "codebox", readonly: "readonly" }, JSON.stringify({
        app: "SpriteSmith Studio",
        version: 1,
        characterCode: designCode(),
        character: {
          ...state,
          abilities: activeAbilities(),
          class: characterClass()
        },
        generatedAt: new Date().toISOString()
      }, null, 2))
    ]);

    const workflow = el("div", { class: "panel" }, [
      el("div", { class: "panel-header" }, [
        el("div", { class: "panel-icon" }, "⇄"),
        el("div", {}, "Workflow")
      ]),
      el("div", { class: "panel-body" }, [
        el("div", { class: "stack" }, [
          el("div", { class: "info-card" }, [
            el("div", {}, el("strong", {}, "1. Design the character")),
            el("div", { class: "helper" }, "Adjust body proportions, clothing, features, and powers.")
          ]),
          el("div", { class: "info-card" }, [
            el("div", {}, el("strong", {}, "2. Pick a pose")),
            el("div", { class: "helper" }, "Preview idle, walk, run, jump, attack, cast, hurt, and victory states.")
          ]),
          el("div", { class: "info-card" }, [
            el("div", {}, el("strong", {}, "3. Export a design package")),
            el("div", { class: "helper" }, "Download a structured JSON file for downstream generation or handoff.")
          ]),
        ]),
        el("div", { class: "footer-actions", style: "margin-top:14px" }, [
          el("button", { class: "btn primary", type: "button", onclick: exportJSON }, "⬇ Export design"),
          el("button", { class: "btn", type: "button", onclick: randomize }, "↺ Randomize"),
          el("button", { class: "btn", type: "button", onclick: () => { localStorage.removeItem("spritesmith-studio"); location.reload(); } }, "⟲ Reset")
        ])
      ])
    ]);

    const specPanel = el("div", { class: "panel" }, [
      el("div", { class: "panel-header" }, [
        el("div", { class: "panel-icon" }, "⚙"),
        el("div", {}, "Generation-ready spec")
      ]),
      el("div", { class: "panel-body" }, [
        el("div", { class: "spec-list" }, [
          specRow("Name", state.name),
          specRow("Theme", state.theme),
          specRow("Style", state.style),
          specRow("Body type", state.bodyType),
          specRow("Top / Bottom", `${state.top} · ${state.bottom}`),
          specRow("Accessories", `${state.headwear} · ${state.accessory}`),
          specRow("Features", `${state.hairStyle} hair, ${state.eyeStyle} eyes, ${state.facialHair.toLowerCase()} face`),
          specRow("Abilities", activeAbilities().length ? activeAbilities().join(", ") : "None"),
        ])
      ])
    ]);

    const freeNote = el("div", { class: "panel" }, [
      el("div", { class: "panel-header" }, [
        el("div", { class: "panel-icon" }, "★"),
        el("div", {}, "Free version notes")
      ]),
      el("div", { class: "panel-body" }, [
        el("div", { class: "note" }, [
          el("div", {}, "This project is fully static and can run on GitHub Pages with no backend."),
          el("div", { style: "margin-top:6px" }, "All character design, preview, export, and saving happen in the browser.")
        ])
      ])
    ]);

    const left = el("div", { class: "column" }, [
      section("Identity", "◎", el("div", { class: "stack" }, [
        textField("Character name", "name"),
        el("div", { class: "grid-2" }, [
          selectField("Theme", "theme", ["default", "sunset", "neon", "forest"]),
          selectField("Style", "style", ["pixel", "vector", "concept"]),
        ]),
        el("div", { class: "grid-2" }, [
          selectField("Gender", "gender", ["Neutral", "Female", "Male"]),
          selectField("Body type", "bodyType", Object.keys(bodyPresets)),
        ]),
      ])),
      section("Proportions", "⇱", el("div", { class: "stack" }, [
        rangeField("Height", "height", 0, 100),
        rangeField("Head size", "headSize", 0, 100),
        rangeField("Shoulders", "shoulders", 0, 100),
        rangeField("Waist", "waist", 0, 100),
        rangeField("Leg length", "legLength", 0, 100),
      ])),
      section("Clothing", "✚", el("div", { class: "grid-2" }, [
        selectField("Headwear", "headwear", clothingOptions.headwear),
        selectField("Top", "top", clothingOptions.top),
        selectField("Bottom", "bottom", clothingOptions.bottom),
        selectField("Shoes", "shoes", clothingOptions.shoes),
        selectField("Accessory", "accessory", clothingOptions.accessory),
      ])),
      section("Features", "◌", el("div", { class: "grid-2" }, [
        selectField("Hair", "hairStyle", featureOptions.hair),
        selectField("Eyes", "eyeStyle", featureOptions.eyes),
        selectField("Facial", "facialHair", featureOptions.facial),
        selectField("Skin", "skinTone", featureOptions.skin),
        selectField("Hair color", "hairColor", ["Black", "Brown", "Blonde", "Red", "White", "Blue", "Pink", "Green"]),
      ])),
    ]);

    const middle = el("div", { class: "column" }, [
      el("div", { class: "panel" }, [
        el("div", { class: "panel-header" }, [
          el("div", { class: "panel-icon" }, "◈"),
          el("div", {}, "Live preview")
        ]),
        el("div", { class: "panel-body" }, [
          el("div", { class: "preview-wrap" }, [
            preview,
            el("div", { class: "meta-card" }, [
              infoCard,
              codeCard,
              el("div", { class: "info-card" }, [
                el("div", { class: "info-kicker" }, "Design controls"),
                el("div", { class: "footer-actions", style: "margin-top:10px" }, [
                  el("button", { class: "btn primary", type: "button", onclick: togglePose }, `Cycle pose: ${poses[state.poseIndex]}`),
                  el("button", { class: "btn", type: "button", onclick: exportJSON }, "⬇ Export JSON")
                ])
              ])
            ])
          ])
        ])
      ]),
      el("div", { class: "panel" }, [
        el("div", { class: "panel-header" }, [
          el("div", { class: "panel-icon" }, "▦"),
          el("div", {}, "Sprite sheet")
        ]),
        el("div", { class: "panel-body" }, [
          sheet
        ])
      ]),
      el("div", { class: "panel" }, [
        el("div", { class: "panel-header" }, [
          el("div", { class: "panel-icon" }, "✎"),
          el("div", {}, "Abilities + notes")
        ]),
        el("div", { class: "panel-body" }, [
          el("div", { class: "chips" }, abilitiesChips),
          el("div", { class: "stack", style: "margin-top:14px" }, [
            el("div", { class: "grid-2" }, [
              el("div", { class: "info-card" }, [
                el("div", { class: "info-kicker" }, "Active"),
                el("div", { class: "helper", style: "margin-top:6px" }, activeAbilities().length ? activeAbilities().join(" · ") : "None")
              ]),
              controlField("Notes", el("textarea", {
                value: state.notes,
                oninput: (e) => setState({ notes: e.target.value })
              }))
            ])
          ])
        ])
      ])
    ]);

    const right = el("div", { class: "column" }, [
      workflow,
      specPanel,
      freeNote
    ]);

    return el("div", { class: "shell" }, [
      el("div", { class: "topbar" }, [
        el("div", {}, [
          el("div", { class: "brand-badge" }, [el("span", { class: "dot" }), "SpriteSmith Studio"]),
          el("h1", {}, "Free GitHub Pages sprite studio with a character designer"),
          el("p", { class: "lede" }, "Build a game-ready character in the browser, tune clothing and proportions, tag abilities, preview multiple poses, and export a JSON design package with no paid backend.")
        ]),
        el("div", { class: "topbar-actions" }, [
          el("button", { class: "btn primary", type: "button", onclick: randomize }, "⚡ Randomize"),
          el("button", { class: "btn", type: "button", onclick: exportJSON }, "⬇ Export JSON")
        ])
      ]),
      el("div", { class: "layout" }, [left, middle, right])
    ]);
  }

  function section(title, icon, body) {
    return el("div", { class: "panel" }, [
      el("div", { class: "panel-header" }, [
        el("div", { class: "panel-icon" }, icon),
        el("div", {}, title)
      ]),
      el("div", { class: "panel-body" }, [body])
    ]);
  }

  function render() {
    app.innerHTML = "";
    app.appendChild(buildUI());
  }

  saveState();
  render();
})();