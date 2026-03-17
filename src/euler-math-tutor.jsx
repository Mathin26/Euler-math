import { useState, useRef, useEffect, useCallback } from "react";

/* ═══════════════════════════════════════════
   COLOUR TOKENS  (blue dark theme)
═══════════════════════════════════════════ */
const C = {
  bg:      "#07101f",
  bg2:     "#0b1628",
  surf:    "#0f1e35",
  surf2:   "#162540",
  border:  "rgba(99,155,255,0.13)",
  border2: "rgba(99,155,255,0.28)",
  text:    "#d8e8ff",
  text2:   "#7fa0c8",
  text3:   "#4a6a8a",
  blue:    "#4a9eff",
  blueD:   "#153c6b",
  blueL:   "#a0c8ff",
  cyan:    "#22d4f5",
  violet:  "#7c6cff",
  green:   "#2dd4a0",
  red:     "#ff6b6b",
  amber:   "#f5a623",
};

/* ═══════════════════════════════════════════
   SYSTEM PROMPT
═══════════════════════════════════════════ */
const SYS = `You are Euler, a brilliant AI mathematics tutor with complete mastery of all areas of mathematics: arithmetic, algebra, geometry, trigonometry, calculus, linear algebra, differential equations, probability, statistics, number theory, complex analysis, topology, and discrete mathematics.

TEACHING PHILOSOPHY:
- Lead with intuition BEFORE formulas. Why does this concept exist?
- Make the abstract tangible with concrete real-world examples.
- Derive things step by step — never just hand over a formula.
- Connect ideas to other mathematics the student may know.
- End by inviting the student to go deeper.
- Be warm, curious, genuinely excited about beautiful mathematics.

RESPONSE FORMATTING — use these EXACT tags, the UI renders them visually:

Step-by-step solution:
[STEP 1: Title here]
content
[/STEP]
[STEP 2: Next title]
content
[/STEP]

Displayed equation (centred):
[MATH]expression[/MATH]

Key insight callout:
[INSIGHT]important idea here[/INSIGHT]

Proof block:
[PROOF: Theorem Name]
proof body
[/PROOF]

Practice quiz (when user asks):
[QUIZ]
Q: question text
A: first option
B: second option
C: third option
D: fourth option
ANSWER: B
EXPLAIN: brief explanation
[/QUIZ]

Inline math/code: backticks like \`x^2 + 1\`
Bold: **text**   Italic: *text*

IMPORTANT RULES:
- When asked to graph or plot: describe the shape, key points, roots, and behaviour clearly using [MATH] blocks. Also mention "You can plot this in the Graph Explorer tab above."
- When asked for a quiz: always include a [QUIZ] block.
- When solving step by step: always use [STEP] blocks.
- Use [MATH] for every important standalone equation.
- Use [INSIGHT] for the single most important takeaway in any explanation.`;

/* ═══════════════════════════════════════════
   PARSER
═══════════════════════════════════════════ */
const TAG_STARTS = ["[STEP ", "[MATH]", "[INSIGHT]", "[PROOF:", "[QUIZ]"];

function tokenise(raw) {
  const tokens = [];
  let pos = 0;
  const len = raw.length;
  while (pos < len) {
    let nearest = len, nearestTag = null;
    for (const tag of TAG_STARTS) {
      const idx = raw.indexOf(tag, pos);
      if (idx !== -1 && idx < nearest) { nearest = idx; nearestTag = tag; }
    }
    if (nearest > pos) tokens.push({ type: "text", value: raw.slice(pos, nearest) });
    pos = nearest;
    if (!nearestTag) break;

    if (nearestTag === "[STEP ") {
      const ob = raw.indexOf("]", pos);
      if (ob === -1) { tokens.push({ type: "text", value: raw.slice(pos) }); break; }
      const m = raw.slice(pos + 1, ob).match(/STEP\s*(\d+):\s*(.+)/);
      const be = raw.indexOf("[/STEP]", ob + 1);
      tokens.push({ type: "STEP", n: m ? m[1] : "?", title: m ? m[2].trim() : "", body: raw.slice(ob + 1, be === -1 ? len : be).trim() });
      pos = (be === -1 ? len : be) + 7;
    } else if (nearestTag === "[MATH]") {
      const s = pos + 6, e = raw.indexOf("[/MATH]", s);
      tokens.push({ type: "MATH", value: raw.slice(s, e === -1 ? len : e).trim() });
      pos = (e === -1 ? len : e) + 7;
    } else if (nearestTag === "[INSIGHT]") {
      const s = pos + 9, e = raw.indexOf("[/INSIGHT]", s);
      tokens.push({ type: "INSIGHT", value: raw.slice(s, e === -1 ? len : e).trim() });
      pos = (e === -1 ? len : e) + 10;
    } else if (nearestTag === "[PROOF:") {
      const ob = raw.indexOf("]", pos);
      if (ob === -1) { tokens.push({ type: "text", value: raw.slice(pos) }); break; }
      const title = raw.slice(pos + 7, ob).trim();
      const s = ob + 1, e = raw.indexOf("[/PROOF]", s);
      tokens.push({ type: "PROOF", title, body: raw.slice(s, e === -1 ? len : e).trim() });
      pos = (e === -1 ? len : e) + 8;
    } else if (nearestTag === "[QUIZ]") {
      const s = pos + 6, e = raw.indexOf("[/QUIZ]", s);
      tokens.push({ type: "QUIZ", raw: raw.slice(s, e === -1 ? len : e) });
      pos = (e === -1 ? len : e) + 7;
    } else {
      tokens.push({ type: "text", value: raw[pos] }); pos++;
    }
  }
  return tokens;
}

function inlineMarkup(text) {
  const parts = [];
  const re = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`)/g;
  let last = 0, m, ki = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(<span key={ki++}>{text.slice(last, m.index)}</span>);
    const s = m[0];
    if (s.startsWith("**")) parts.push(<strong key={ki++} style={{ color: C.blueL }}>{s.slice(2,-2)}</strong>);
    else if (s.startsWith("*")) parts.push(<em key={ki++} style={{ fontFamily:"Georgia,serif", color: C.cyan }}>{s.slice(1,-1)}</em>);
    else parts.push(<code key={ki++} style={{ fontFamily:"monospace", fontSize:"0.88em", background:"rgba(74,158,255,0.12)", border:`1px solid ${C.border2}`, borderRadius:4, padding:"1px 6px", color: C.cyan }}>{s.slice(1,-1)}</code>);
    last = m.index + s.length;
  }
  if (last < text.length) parts.push(<span key={ki++}>{text.slice(last)}</span>);
  return parts;
}

function TextBlock({ text }) {
  const paras = text.split(/\n{2,}/).filter(p => p.trim());
  if (!paras.length) return null;
  return <>
    {paras.map((p, i) => (
      <p key={i} style={{ marginBottom: 12, lineHeight: 1.78 }}>
        {p.split("\n").map((line, j) => <span key={j}>{j > 0 && <br />}{inlineMarkup(line)}</span>)}
      </p>
    ))}
  </>;
}

function QuizBlock({ raw, idx, quizState, onAnswer }) {
  const lines = raw.trim().split("\n").map(l => l.trim()).filter(Boolean);
  const gv = k => { const f = lines.find(l => l.toLowerCase().startsWith(k.toLowerCase() + ":")); return f ? f.slice(k.length + 1).trim() : ""; };
  const q = gv("Q"), answer = gv("ANSWER").toUpperCase(), explain = gv("EXPLAIN");
  const opts = ["A","B","C","D"].map(l => ({ l, t: gv(l) })).filter(o => o.t);
  const chosen = quizState[idx];
  return (
    <div style={{ background: C.surf, border:`1px solid ${C.border}`, borderRadius:12, padding:"18px 20px", margin:"12px 0" }}>
      <p style={{ fontFamily:"Georgia,serif", fontSize:17, lineHeight:1.45, marginBottom:14, color: C.text }}>{q}</p>
      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
        {opts.map(o => {
          const revealed = chosen !== undefined;
          const isCorrect = o.l === answer, isChosen = chosen === o.l;
          let bg = C.bg2, border = C.border, color = C.text;
          if (revealed && isCorrect) { bg="rgba(45,212,160,0.08)"; border=C.green; color=C.green; }
          else if (revealed && isChosen && !isCorrect) { bg="rgba(255,107,107,0.07)"; border=C.red; color=C.red; }
          return (
            <button key={o.l} disabled={revealed} onClick={() => onAnswer(idx, o.l)}
              style={{ background:bg, border:`1.5px solid ${border}`, borderRadius:8, padding:"10px 14px", textAlign:"left", cursor:revealed?"default":"pointer", fontSize:14, fontFamily:"inherit", color, display:"flex", alignItems:"center", gap:10, transition:"all 0.15s" }}>
              <span style={{ width:24, height:24, borderRadius:"50%", border:`1.5px solid ${border}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:600, flexShrink:0, background: revealed&&isCorrect ? C.green : revealed&&isChosen&&!isCorrect ? C.red : "transparent", color: revealed&&(isCorrect||(isChosen&&!isCorrect)) ? (isCorrect ? C.bg : "white") : color }}>{o.l}</span>
              {o.t}
            </button>
          );
        })}
      </div>
      {chosen !== undefined && (
        <div style={{ marginTop:12, padding:"10px 14px", borderRadius:8, fontSize:13.5, lineHeight:1.55, background: chosen===answer?"rgba(45,212,160,0.08)":"rgba(255,107,107,0.07)", border:`1px solid ${chosen===answer?"rgba(45,212,160,0.2)":"rgba(255,107,107,0.2)"}`, color: chosen===answer ? C.green : C.red }}>
          {chosen===answer ? "✓ Correct! " : `✗ Answer: ${answer}. `}{explain}
        </div>
      )}
    </div>
  );
}

function RenderTokens({ tokens, quizState, onAnswer }) {
  return <>
    {tokens.map((t, i) => {
      if (t.type === "text") return <TextBlock key={i} text={t.value} />;
      if (t.type === "MATH") return <div key={i} style={{ background:C.bg2, border:`1px solid ${C.border2}`, borderRadius:12, padding:"14px 20px", margin:"10px 0", fontFamily:"monospace", fontSize:15, color:C.cyan, textAlign:"center", overflowX:"auto", letterSpacing:0.3 }}>{t.value}</div>;
      if (t.type === "INSIGHT") return <div key={i} style={{ background:"rgba(74,158,255,0.06)", border:`1px solid rgba(74,158,255,0.2)`, borderRadius:12, padding:"13px 16px", margin:"10px 0", fontSize:14.5, lineHeight:1.65, color:C.text2 }}><span style={{ color:C.blue, marginRight:8 }}>◈</span>{inlineMarkup(t.value)}</div>;
      if (t.type === "STEP") return <div key={i} style={{ background:C.surf, border:`1px solid ${C.border}`, borderLeft:`3px solid ${C.blue}`, borderRadius:"0 12px 12px 0", padding:"13px 16px", margin:"10px 0", fontSize:14.5, lineHeight:1.65 }}><div style={{ fontFamily:"monospace", fontSize:10.5, color:C.blue, fontWeight:500, marginBottom:5, textTransform:"uppercase", letterSpacing:0.4 }}>Step {t.n} — {t.title}</div><TextBlock text={t.body} /></div>;
      if (t.type === "PROOF") return <div key={i} style={{ background:C.surf, border:`1px solid ${C.border}`, borderTop:`2px solid ${C.violet}`, borderRadius:"0 0 12px 12px", padding:"16px 18px", margin:"10px 0", fontSize:14.5, lineHeight:1.78 }}><div style={{ fontFamily:"Georgia,serif", fontStyle:"italic", fontSize:13, color:C.text3, marginBottom:10 }}>Proof — {t.title}</div><TextBlock text={t.body} /></div>;
      if (t.type === "QUIZ") return <QuizBlock key={i} raw={t.raw} idx={i} quizState={quizState} onAnswer={onAnswer} />;
      return null;
    })}
  </>;
}

/* ═══════════════════════════════════════════
   GRAPH EXPLORER — pure canvas plotter
═══════════════════════════════════════════ */
const GRAPH_COLORS = ["#4a9eff","#22d4f5","#f5a623","#ff6b6b","#2dd4a0","#7c6cff"];
const PRESETS = [
  { label:"sin(x)", expr:"sin(x)" },
  { label:"cos(x)", expr:"cos(x)" },
  { label:"tan(x)", expr:"tan(x)" },
  { label:"x²", expr:"x*x" },
  { label:"x³", expr:"x*x*x" },
  { label:"√x", expr:"sqrt(x)" },
  { label:"1/x", expr:"1/x" },
  { label:"eˣ", expr:"exp(x)" },
  { label:"ln(x)", expr:"log(x)" },
  { label:"|x|", expr:"abs(x)" },
  { label:"sin(x)/x", expr:"sin(x)/x" },
  { label:"x·sin(x)", expr:"x*sin(x)" },
];

function evalExpr(exprStr, x) {
  try {
    // replace common math notation
    let e = exprStr
      .replace(/\^/g,"**")
      .replace(/sin\(/g,"Math.sin(")
      .replace(/cos\(/g,"Math.cos(")
      .replace(/tan\(/g,"Math.tan(")
      .replace(/sqrt\(/g,"Math.sqrt(")
      .replace(/abs\(/g,"Math.abs(")
      .replace(/log\(/g,"Math.log(")
      .replace(/ln\(/g,"Math.log(")
      .replace(/exp\(/g,"Math.exp(")
      .replace(/pi/g,"Math.PI")
      .replace(/π/g,"Math.PI")
      .replace(/e(?![a-zA-Z])/g,"Math.E");
    // eslint-disable-next-line no-new-func
    const fn = new Function("x","Math","return " + e);
    const v = fn(x, Math);
    return typeof v === "number" && isFinite(v) ? v : null;
  } catch { return null; }
}

function GraphExplorer() {
  const canvasRef = useRef(null);
  const [functions, setFunctions] = useState([
    { expr: "Math.sin(x)", label: "sin(x)", color: GRAPH_COLORS[0], visible: true },
    { expr: "Math.cos(x)", label: "cos(x)", color: GRAPH_COLORS[1], visible: true },
  ]);
  const [inputVal, setInputVal] = useState("");
  const [xMin, setXMin] = useState(-10);
  const [xMax, setXMax] = useState(10);
  const [xMinInput, setXMinInput] = useState("-10");
  const [xMaxInput, setXMaxInput] = useState("10");
  const [hoverInfo, setHoverInfo] = useState(null);
  const [error, setError] = useState("");

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
    const pad = { top:20, right:20, bottom:40, left:55 };
    const plotW = W - pad.left - pad.right;
    const plotH = H - pad.top - pad.bottom;

    ctx.clearRect(0, 0, W, H);

    // background
    ctx.fillStyle = "#07101f";
    ctx.fillRect(0, 0, W, H);

    // compute y range from all visible functions
    const visibles = functions.filter(f => f.visible);
    let allY = [];
    const STEPS = plotW * 2;
    for (const fn of visibles) {
      for (let i = 0; i <= STEPS; i++) {
        const x = xMin + (xMax - xMin) * i / STEPS;
        const y = evalExpr(fn.expr, x);
        if (y !== null) allY.push(y);
      }
    }
    let yMin = allY.length ? Math.min(...allY) : -5;
    let yMax = allY.length ? Math.max(...allY) : 5;
    if (yMin === yMax) { yMin -= 1; yMax += 1; }
    const yPad = (yMax - yMin) * 0.08;
    yMin -= yPad; yMax += yPad;
    // clamp extreme ranges
    if (yMax - yMin > 1000) { const mid = (yMax+yMin)/2; yMin = mid-100; yMax = mid+100; }

    const toCanvasX = x => pad.left + (x - xMin) / (xMax - xMin) * plotW;
    const toCanvasY = y => pad.top + (1 - (y - yMin) / (yMax - yMin)) * plotH;

    // grid lines
    const xTicks = 8, yTicks = 6;
    ctx.strokeStyle = "rgba(74,158,255,0.07)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= xTicks; i++) {
      const x = xMin + (xMax - xMin) * i / xTicks;
      const cx = toCanvasX(x);
      ctx.beginPath(); ctx.moveTo(cx, pad.top); ctx.lineTo(cx, pad.top + plotH); ctx.stroke();
    }
    for (let i = 0; i <= yTicks; i++) {
      const y = yMin + (yMax - yMin) * i / yTicks;
      const cy = toCanvasY(y);
      ctx.beginPath(); ctx.moveTo(pad.left, cy); ctx.lineTo(pad.left + plotW, cy); ctx.stroke();
    }

    // axes
    ctx.strokeStyle = "rgba(99,155,255,0.3)";
    ctx.lineWidth = 1;
    // x-axis
    if (yMin <= 0 && yMax >= 0) {
      const cy = toCanvasY(0);
      ctx.beginPath(); ctx.moveTo(pad.left, cy); ctx.lineTo(pad.left+plotW, cy); ctx.stroke();
    }
    // y-axis
    if (xMin <= 0 && xMax >= 0) {
      const cx = toCanvasX(0);
      ctx.beginPath(); ctx.moveTo(cx, pad.top); ctx.lineTo(cx, pad.top+plotH); ctx.stroke();
    }

    // tick labels
    ctx.fillStyle = "#4a6a8a";
    ctx.font = "11px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (let i = 0; i <= xTicks; i++) {
      const x = xMin + (xMax - xMin) * i / xTicks;
      const cx = toCanvasX(x);
      ctx.fillText(x.toFixed(x % 1 === 0 ? 0 : 1), cx, pad.top + plotH + 6);
    }
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let i = 0; i <= yTicks; i++) {
      const y = yMin + (yMax - yMin) * i / yTicks;
      const cy = toCanvasY(y);
      ctx.fillText(y.toFixed(Math.abs(y) < 10 ? 2 : 0), pad.left - 6, cy);
    }

    // clip to plot area
    ctx.save();
    ctx.beginPath();
    ctx.rect(pad.left, pad.top, plotW, plotH);
    ctx.clip();

    // draw functions
    for (const fn of visibles) {
      ctx.strokeStyle = fn.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      let started = false, prevNull = false;
      for (let i = 0; i <= STEPS; i++) {
        const x = xMin + (xMax - xMin) * i / STEPS;
        const y = evalExpr(fn.expr, x);
        if (y === null || Math.abs(y - (yMin+yMax)/2) > (yMax-yMin)*3) {
          prevNull = true; started = false; continue;
        }
        const cx = toCanvasX(x), cy = toCanvasY(y);
        if (!started || prevNull) { ctx.moveTo(cx, cy); started = true; }
        else ctx.lineTo(cx, cy);
        prevNull = false;
      }
      ctx.stroke();
    }

    // hover crosshair
    if (hoverInfo) {
      ctx.strokeStyle = "rgba(255,255,255,0.2)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4,4]);
      ctx.beginPath(); ctx.moveTo(hoverInfo.cx, pad.top); ctx.lineTo(hoverInfo.cx, pad.top+plotH); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(pad.left, hoverInfo.cy); ctx.lineTo(pad.left+plotW, hoverInfo.cy); ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.restore();

    // border
    ctx.strokeStyle = "rgba(99,155,255,0.18)";
    ctx.lineWidth = 1;
    ctx.strokeRect(pad.left, pad.top, plotW, plotH);
  }, [functions, xMin, xMax, hoverInfo]);

  useEffect(() => { draw(); }, [draw]);

  // resize canvas to match element
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      draw();
    });
    ro.observe(canvas);
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    return () => ro.disconnect();
  }, [draw]);

  const addFunction = useCallback((expr, label) => {
    const e = expr || inputVal.trim();
    if (!e) return;
    const lbl = label || e;
    // quick validate
    const test = evalExpr(e, 1);
    if (test === null && evalExpr(e, 2) === null && evalExpr(e, -1) === null) {
      setError(`Cannot parse: "${e}". Use syntax like sin(x), x^2, sqrt(x)`);
      return;
    }
    setError("");
    setFunctions(prev => {
      const idx = prev.length % GRAPH_COLORS.length;
      return [...prev, { expr: e, label: lbl, color: GRAPH_COLORS[idx], visible: true }];
    });
    setInputVal("");
  }, [inputVal]);

  const toggleFn = i => setFunctions(prev => prev.map((f,j) => j===i ? {...f, visible:!f.visible} : f));
  const removeFn = i => setFunctions(prev => prev.filter((_,j) => j!==i));
  const clearAll = () => setFunctions([]);

  const handleMouseMove = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const pad = { top:20, right:20, bottom:40, left:55 };
    const plotW = canvas.width - pad.left - pad.right;
    const plotH = canvas.height - pad.top - pad.bottom;
    const mx = (e.clientX - rect.left) * (canvas.width / rect.width);
    const my = (e.clientY - rect.top) * (canvas.height / rect.height);
    if (mx < pad.left || mx > pad.left+plotW || my < pad.top || my > pad.top+plotH) {
      setHoverInfo(null); return;
    }
    const x = xMin + (mx - pad.left) / plotW * (xMax - xMin);
    const vals = functions.filter(f=>f.visible).map(f => ({ label:f.label, y: evalExpr(f.expr, x), color:f.color })).filter(f=>f.y!==null);
    setHoverInfo({ x, cx: mx, cy: my, vals });
  }, [functions, xMin, xMax]);

  const applyRange = () => {
    const mn = parseFloat(xMinInput), mx = parseFloat(xMaxInput);
    if (!isNaN(mn) && !isNaN(mx) && mn < mx) { setXMin(mn); setXMax(mx); }
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

      {/* Toolbar */}
      <div style={{ display:"flex", gap:10, flexWrap:"wrap", alignItems:"flex-end" }}>
        <div style={{ flex:1, minWidth:200 }}>
          <div style={{ fontSize:11, color:C.text3, marginBottom:5, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.8px" }}>Add function</div>
          <div style={{ display:"flex", gap:8 }}>
            <input
              value={inputVal}
              onChange={e => setInputVal(e.target.value)}
              onKeyDown={e => e.key==="Enter" && addFunction()}
              placeholder="e.g. sin(x), x^2, 1/(1+x^2)"
              style={{ flex:1, background:C.bg2, border:`1px solid ${C.border2}`, borderRadius:10, padding:"9px 14px", color:C.text, fontFamily:"monospace", fontSize:13, outline:"none" }}
            />
            <button onClick={() => addFunction()} style={{ background:C.blue, border:"none", borderRadius:10, padding:"9px 16px", color:"white", fontWeight:600, fontSize:13, cursor:"pointer", whiteSpace:"nowrap" }}>Plot</button>
          </div>
          {error && <div style={{ fontSize:12, color:C.red, marginTop:5 }}>{error}</div>}
        </div>
        <div>
          <div style={{ fontSize:11, color:C.text3, marginBottom:5, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.8px" }}>X range</div>
          <div style={{ display:"flex", gap:6, alignItems:"center" }}>
            <input value={xMinInput} onChange={e=>setXMinInput(e.target.value)} style={{ width:60, background:C.bg2, border:`1px solid ${C.border2}`, borderRadius:8, padding:"9px 10px", color:C.text, fontFamily:"monospace", fontSize:13, outline:"none", textAlign:"center" }} />
            <span style={{ color:C.text3, fontSize:13 }}>to</span>
            <input value={xMaxInput} onChange={e=>setXMaxInput(e.target.value)} style={{ width:60, background:C.bg2, border:`1px solid ${C.border2}`, borderRadius:8, padding:"9px 10px", color:C.text, fontFamily:"monospace", fontSize:13, outline:"none", textAlign:"center" }} />
            <button onClick={applyRange} style={{ background:C.surf2, border:`1px solid ${C.border2}`, borderRadius:8, padding:"9px 14px", color:C.text2, fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>Apply</button>
          </div>
        </div>
      </div>

      {/* Presets */}
      <div>
        <div style={{ fontSize:11, color:C.text3, marginBottom:7, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.8px" }}>Presets</div>
        <div style={{ display:"flex", flexWrap:"wrap", gap:7 }}>
          {PRESETS.map(p => (
            <button key={p.label} onClick={() => addFunction(p.expr, p.label)}
              style={{ background:C.surf, border:`1px solid ${C.border}`, borderRadius:20, padding:"5px 12px", fontSize:12, fontWeight:500, color:C.text2, cursor:"pointer", fontFamily:"monospace", transition:"all 0.15s" }}
              onMouseEnter={e => Object.assign(e.currentTarget.style,{background:C.surf2,borderColor:C.border2,color:C.text})}
              onMouseLeave={e => Object.assign(e.currentTarget.style,{background:C.surf,borderColor:C.border,color:C.text2})}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Canvas */}
      <div style={{ position:"relative" }}>
        <canvas ref={canvasRef} onMouseMove={handleMouseMove} onMouseLeave={()=>setHoverInfo(null)}
          style={{ width:"100%", height:360, borderRadius:12, display:"block", cursor:"crosshair" }} />

        {/* Hover tooltip */}
        {hoverInfo && hoverInfo.vals.length > 0 && (
          <div style={{ position:"absolute", top:10, right:10, background:C.surf, border:`1px solid ${C.border2}`, borderRadius:10, padding:"10px 13px", fontSize:12, fontFamily:"monospace", pointerEvents:"none" }}>
            <div style={{ color:C.text3, marginBottom:5 }}>x = {hoverInfo.x.toFixed(3)}</div>
            {hoverInfo.vals.map((v,i) => (
              <div key={i} style={{ color:v.color, display:"flex", gap:8, alignItems:"center" }}>
                <span style={{ width:8, height:8, borderRadius:"50%", background:v.color, flexShrink:0, display:"inline-block" }} />
                {v.label} = {v.y.toFixed(4)}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Function list */}
      {functions.length > 0 && (
        <div style={{ background:C.surf, border:`1px solid ${C.border}`, borderRadius:12, padding:"14px 16px" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
            <div style={{ fontSize:11, color:C.text3, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.8px" }}>Active functions</div>
            <button onClick={clearAll} style={{ fontSize:11, color:C.red, background:"transparent", border:"none", cursor:"pointer", fontFamily:"inherit" }}>Clear all</button>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {functions.map((f, i) => (
              <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 12px", background:f.visible?C.bg2:"transparent", border:`1px solid ${f.visible?C.border:"transparent"}`, borderRadius:8, transition:"all 0.15s" }}>
                <div style={{ width:12, height:12, borderRadius:"50%", background:f.visible?f.color:"transparent", border:`2px solid ${f.color}`, flexShrink:0 }} />
                <span style={{ fontFamily:"monospace", fontSize:13, color:f.visible?C.text:C.text3, flex:1 }}>{f.label}</span>
                <button onClick={()=>toggleFn(i)} style={{ fontSize:11, color:f.visible?C.blue:C.text3, background:"transparent", border:`1px solid ${f.visible?C.border2:C.border}`, borderRadius:6, padding:"3px 8px", cursor:"pointer", fontFamily:"inherit" }}>{f.visible?"hide":"show"}</button>
                <button onClick={()=>removeFn(i)} style={{ fontSize:16, color:C.text3, background:"transparent", border:"none", cursor:"pointer", lineHeight:1, padding:"0 2px" }} onMouseEnter={e=>e.currentTarget.style.color=C.red} onMouseLeave={e=>e.currentTarget.style.color=C.text3}>×</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tips */}
      <div style={{ background:"rgba(74,158,255,0.05)", border:`1px solid rgba(74,158,255,0.15)`, borderRadius:10, padding:"12px 16px", fontSize:12.5, color:C.text3, lineHeight:1.65 }}>
        <span style={{ color:C.blue, marginRight:6 }}>◈</span>
        <strong style={{ color:C.text2 }}>Syntax guide: </strong>
        {[["sin(x)","sine"],["cos(x)","cosine"],["x^2","power"],["sqrt(x)","square root"],["abs(x)","absolute value"],["log(x)","natural log"],["exp(x)","eˣ"],["pi","π"]].map(([s,d],i)=>(
          <span key={i}><code style={{ fontFamily:"monospace", background:C.surf2, padding:"1px 5px", borderRadius:4, color:C.cyan }}>{s}</code><span style={{ marginRight:10 }}> {d}</span></span>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   STARTER CONCEPTS
═══════════════════════════════════════════ */
const STARTERS = [
  { icon:"△", name:"Pythagorean Theorem", hint:"Geometry · Proof",      q:"Explain the Pythagorean theorem — prove why it is true." },
  { icon:"∂", name:"Derivatives",         hint:"Calculus · Intuition",  q:"What is a derivative? Give me the intuition before any formula." },
  { icon:"e", name:"Euler's Identity",    hint:"Complex · Beauty",       q:"What makes Euler's identity e^(iπ)+1=0 so beautiful? Explain deeply." },
  { icon:"x²",name:"Quadratic Formula",  hint:"Algebra · Derivation",   q:"Derive the quadratic formula from scratch, every single step." },
  { icon:"∫", name:"Integration",         hint:"Calculus · Area",        q:"What is integration intuitively? Explain with a real example." },
  { icon:"[]",name:"Matrices",            hint:"Linear Algebra",         q:"Explain matrix multiplication — why does the rule work the way it does?" },
];

const DEFAULT_CHIPS = [
  ["Prove √2 irrational",   "Prove that the square root of 2 is irrational"],
  ["Fundamental Theorem",   "Explain the Fundamental Theorem of Calculus"],
  ["Bayes theorem",         "Explain Bayes theorem with a concrete example"],
  ["What is a limit?",      "What is a limit? Give me the intuition first."],
  ["Fourier transform",     "How does the Fourier transform work intuitively?"],
  ["Solve a quadratic",     "Solve step by step: 2x^2 - 5x + 3 = 0"],
  ["Imaginary numbers",     "Why do imaginary numbers exist?"],
  ["Quiz: algebra",         "Give me a quiz on algebra"],
  ["Prime numbers",         "What are prime numbers and why are they important?"],
];

/* ═══════════════════════════════════════════
   TYPING DOT
═══════════════════════════════════════════ */
function TypingDot({ delay }) {
  const [up, setUp] = useState(false);
  useEffect(() => {
    const t0 = setTimeout(() => {
      setUp(true);
      const iv = setInterval(() => setUp(u => !u), 650);
      return () => clearInterval(iv);
    }, delay);
    return () => clearTimeout(t0);
  }, [delay]);
  return <div style={{ width:6, height:6, borderRadius:"50%", background:C.text3, opacity:up?1:0.3, transform:up?"translateY(-4px)":"translateY(0)", transition:"all 0.3s ease" }} />;
}

/* ═══════════════════════════════════════════
   API KEY MODAL
═══════════════════════════════════════════ */
function ApiKeyModal({ onClose }) {
  const [val, setVal] = useState(window._eulerKey || "");
  const [err, setErr] = useState("");
  const submit = () => {
    const k = val.trim();
    if (!k) { setErr("Please enter your API key."); return; }
    if (!k.startsWith("sk-ant-")) { setErr("Key should start with sk-ant-…"); return; }
    window._eulerKey = k;
    onClose();
  };
  return (
    <div style={{ position:"fixed", inset:0, zIndex:999, background:"rgba(7,16,31,0.96)", display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
      <div style={{ background:C.surf, border:`1px solid ${C.border2}`, borderRadius:20, padding:"36px 32px", maxWidth:460, width:"100%", textAlign:"center", boxShadow:"0 4px 28px rgba(7,16,31,0.75)" }}>
        <div style={{ fontFamily:"Georgia,serif", fontStyle:"italic", fontSize:44, color:C.blueL, marginBottom:16 }}>e</div>
        <h2 style={{ fontFamily:"Georgia,serif", fontSize:24, marginBottom:8, color:C.text }}>Welcome to Euler</h2>
        <p style={{ fontSize:14, color:C.text2, lineHeight:1.65, marginBottom:24 }}>
          Your personal AI mathematics tutor.<br />Enter your Anthropic API key to begin. Stored only in this browser session.
        </p>
        <div style={{ display:"flex", gap:8, marginBottom:10 }}>
          <input type="password" value={val} onChange={e=>setVal(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()}
            placeholder="sk-ant-api03-…" autoFocus
            style={{ flex:1, background:C.bg2, border:`1px solid ${C.border2}`, borderRadius:10, padding:"10px 14px", color:C.text, fontFamily:"monospace", fontSize:13, outline:"none" }} />
          <button onClick={submit} style={{ background:C.blue, border:"none", borderRadius:10, padding:"10px 20px", color:"white", fontWeight:600, fontSize:14, cursor:"pointer", whiteSpace:"nowrap" }}>Start →</button>
        </div>
        {err && <div style={{ fontSize:12, color:C.red, marginBottom:8 }}>{err}</div>}
        <p style={{ fontSize:11, color:C.text3, lineHeight:1.55 }}>
          Get a free key at <span style={{ color:C.blue }}>console.anthropic.com</span> → API Keys → Create Key.
        </p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   MAIN APP
═══════════════════════════════════════════ */
export default function App() {
  const [page, setPage] = useState("home"); // "home" | "tutor" | "grapher"
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [chips, setChips] = useState(DEFAULT_CHIPS);
  const [quizState, setQuizState] = useState({});
  const [showKeyModal, setShowKeyModal] = useState(!window._eulerKey);
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior:"smooth" });
  }, [messages, busy]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 140) + "px";
    }
  }, [input]);

  const goHome = useCallback(() => {
    setPage("home");
    setMessages([]);
    setInput("");
    setBusy(false);
    setQuizState({});
    setChips(DEFAULT_CHIPS);
  }, []);

  const updateChips = useCallback((msg) => {
    const lc = msg.toLowerCase();
    if (/deriv|calcul/.test(lc))
      setChips([["Power rule","Derive the power rule from first principles"],["Chain rule","Explain the chain rule with examples"],["Integration by parts","Explain integration by parts"],["Taylor series","What is a Taylor series?"],["Quiz: derivatives","Give me a quiz on derivatives"]]);
    else if (/integr/.test(lc))
      setChips([["Fundamental Theorem","State and prove the Fundamental Theorem of Calculus"],["u-substitution","Explain u-substitution step by step"],["Improper integrals","What are improper integrals?"],["Quiz: integration","Give me a quiz on integration"]]);
    else if (/quadrat|algebra|equat/.test(lc))
      setChips([["Completing the square","Explain completing the square"],["Polynomial roots","How to find roots of a polynomial"],["Systems of equations","Solve a system of linear equations"],["Quiz: algebra","Give me a quiz on algebra"]]);
    else if (/matrix|linear alg|eigen/.test(lc))
      setChips([["Determinants","What is a determinant geometrically?"],["Eigenvalues","Explain eigenvalues and eigenvectors intuitively"],["Gaussian elimination","Walk through Gaussian elimination"],["Quiz: matrices","Give me a quiz on matrices"]]);
    else if (/trig|sin|cos|tan/.test(lc))
      setChips([["Unit circle","Explain the unit circle"],["Trig identities","Derive the key trig identities"],["Inverse trig","Explain arcsin arccos arctan"],["Quiz: trig","Give me a quiz on trigonometry"]]);
    else if (/probab|statist|bayes/.test(lc))
      setChips([["Central Limit Theorem","Explain the Central Limit Theorem"],["Normal distribution","What is the normal distribution?"],["Conditional probability","Explain conditional probability with an example"],["Quiz: probability","Give me a quiz on probability"]]);
    else
      setChips([["Go deeper","Tell me more, go into greater depth"],["Prove it","Can you prove what you just explained?"],["Give an example","Show me a concrete numerical example"],["Quiz me","Give me a practice question on this topic"],["Graph Explorer →","Open the Graph Explorer to plot functions"]]);
  }, []);

  const send = useCallback(async (text) => {
    const t = (text || input).trim();
    if (!t || busy) return;
    if (!window._eulerKey) { setShowKeyModal(true); return; }
    setInput("");
    setPage("tutor");
    setBusy(true);
    updateChips(t);
    const userMsg = { role:"user", content:t };
    setMessages(prev => [...prev, userMsg]);
    const apiHistory = [...messages, userMsg];
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST",
        headers: { "content-type":"application/json", "x-api-key":window._eulerKey, "anthropic-version":"2023-06-01", "anthropic-dangerous-allow-browser":"true" },
        body: JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:1500, system:SYS, messages:apiHistory.map(m=>({role:m.role,content:m.content})) }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      const reply = data.content[0].text;
      setMessages(prev => [...prev, { role:"assistant", content:reply }]);
    } catch (err) {
      setMessages(prev => [...prev, { role:"assistant", content:`[INSIGHT]Error: ${err.message||"Could not connect"}. Click "API Key" in the header to update your key.[/INSIGHT]` }]);
    }
    setBusy(false);
  }, [input, busy, messages, updateChips]);

  const ask = useCallback((q) => send(q), [send]);

  const handleAnswer = useCallback((idx, letter) => {
    setQuizState(s => ({ ...s, [idx]: letter }));
  }, []);

  // nav tab style
  const navTab = (id, label, icon) => {
    const active = page === id;
    return (
      <button onClick={() => setPage(id)}
        style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 14px", borderRadius:8, fontSize:13, fontWeight:500, fontFamily:"inherit", cursor:"pointer", transition:"all 0.15s", background:active?"rgba(74,158,255,0.12)":"transparent", border:active?`1px solid rgba(74,158,255,0.28)`:`1px solid transparent`, color:active?C.blue:C.text3 }}>
        <span style={{ fontSize:14 }}>{icon}</span>{label}
      </button>
    );
  };

  return (
    <div style={{ minHeight:"100vh", background:C.bg, color:C.text, fontFamily:"'Inter',system-ui,sans-serif", position:"relative", overflowX:"hidden" }}>
      {/* Grid bg */}
      <div style={{ position:"fixed", inset:0, zIndex:0, pointerEvents:"none", backgroundImage:"linear-gradient(rgba(74,158,255,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(74,158,255,0.025) 1px,transparent 1px)", backgroundSize:"44px 44px" }} />
      <div style={{ position:"fixed", top:-180, left:"50%", transform:"translateX(-50%)", width:780, height:480, background:"radial-gradient(ellipse,rgba(74,158,255,0.06) 0%,transparent 68%)", pointerEvents:"none", zIndex:0 }} />

      {showKeyModal && <ApiKeyModal onClose={() => setShowKeyModal(false)} />}

      <div style={{ position:"relative", zIndex:1, maxWidth:860, margin:"0 auto", minHeight:"100vh", display:"flex", flexDirection:"column", padding:"0 24px 80px" }}>

        {/* ── HEADER ── */}
        <header style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"22px 0 18px", borderBottom:`1px solid ${C.border}`, marginBottom:32, flexWrap:"wrap", gap:12 }}>
          {/* Logo — always goes home */}
          <button onClick={goHome} style={{ display:"flex", alignItems:"baseline", gap:10, background:"transparent", border:"none", cursor:"pointer", padding:0 }}>
            <span style={{ fontFamily:"Georgia,serif", fontStyle:"italic", fontSize:26, color:C.text, letterSpacing:-0.3 }}>Euler</span>
            <span style={{ fontSize:10, fontWeight:600, letterSpacing:"1.8px", textTransform:"uppercase", color:C.blue, padding:"3px 9px", border:`1px solid rgba(74,158,255,0.28)`, borderRadius:4, background:"rgba(74,158,255,0.06)" }}>AI Tutor</span>
          </button>

          {/* Nav */}
          <nav style={{ display:"flex", alignItems:"center", gap:4 }}>
            {navTab("home",    "Home",     "⌂")}
            {navTab("tutor",   "Tutor",    "◉")}
            {navTab("grapher", "Grapher",  "∿")}
          </nav>

          {/* Right controls */}
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            {page === "tutor" && messages.length > 0 && (
              <button onClick={goHome}
                style={{ fontSize:12, fontWeight:600, background:"rgba(255,107,107,0.08)", border:`1px solid rgba(255,107,107,0.25)`, borderRadius:8, padding:"6px 12px", color:C.red, cursor:"pointer", fontFamily:"inherit" }}>
                ← New conversation
              </button>
            )}
            <div style={{ display:"flex", alignItems:"center", gap:6, fontSize:11, fontWeight:600, letterSpacing:"0.5px", textTransform:"uppercase", color:C.green }}>
              <div style={{ width:7, height:7, borderRadius:"50%", background:C.green }} />Online
            </div>
            <button onClick={() => setShowKeyModal(true)} style={{ fontSize:11, fontWeight:600, background:"transparent", border:`1px solid ${C.border2}`, borderRadius:6, padding:"5px 10px", color:C.text3, cursor:"pointer", fontFamily:"inherit" }}>⚙ API Key</button>
          </div>
        </header>

        {/* ════════════════════════════════════
            PAGE: HOME
        ════════════════════════════════════ */}
        {page === "home" && (
          <div style={{ textAlign:"center", padding:"12px 0 40px" }}>
            <div style={{ fontFamily:"monospace", fontSize:12, color:C.text3, marginBottom:22, letterSpacing:0.4 }}>
              e<sup>iπ</sup> + 1 = 0 &nbsp;·&nbsp; ∫₀^∞ e⁻ˣ² dx = √π/2 &nbsp;·&nbsp; ∑ 1/n² = π²/6
            </div>
            <h1 style={{ fontFamily:"Georgia,serif", fontSize:"clamp(32px,6vw,52px)", lineHeight:1.1, letterSpacing:-1, marginBottom:16 }}>
              Mathematics<br />understood,<br />
              <em style={{ fontStyle:"italic", background:`linear-gradient(130deg,${C.blue},${C.cyan})`, WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", backgroundClip:"text" }}>not memorised.</em>
            </h1>
            <p style={{ fontSize:16, color:C.text2, maxWidth:430, margin:"0 auto 28px", lineHeight:1.65 }}>Ask me anything — I will explain it, prove it, and make sure you truly understand it.</p>

            <div style={{ display:"flex", flexWrap:"wrap", gap:7, justifyContent:"center", marginBottom:30 }}>
              {["Algebra","Calculus","Geometry","Trigonometry","Statistics","Linear Algebra","Number Theory","Diff. Equations","Probability","Complex Analysis"].map(t => (
                <span key={t} style={{ fontSize:11, fontWeight:500, padding:"4px 11px", borderRadius:20, border:`1px solid ${C.border}`, color:C.text3, background:C.surf }}>{t}</span>
              ))}
            </div>

            {/* Starter grid */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, maxWidth:620, margin:"0 auto 32px" }}>
              {STARTERS.map(s => (
                <button key={s.name} onClick={() => ask(s.q)}
                  style={{ background:C.surf, border:`1px solid ${C.border}`, borderRadius:12, padding:14, textAlign:"left", cursor:"pointer", fontFamily:"inherit", color:C.text, transition:"all 0.18s" }}
                  onMouseEnter={e => Object.assign(e.currentTarget.style,{ borderColor:C.border2, background:C.surf2, transform:"translateY(-2px)", boxShadow:`0 0 0 1px rgba(74,158,255,0.2),0 4px 24px rgba(74,158,255,0.1)` })}
                  onMouseLeave={e => Object.assign(e.currentTarget.style,{ borderColor:C.border, background:C.surf, transform:"none", boxShadow:"none" })}>
                  <span style={{ fontSize:17, marginBottom:7, display:"block", color:C.blue, fontFamily:"monospace" }}>{s.icon}</span>
                  <span style={{ fontSize:12.5, fontWeight:600, display:"block", lineHeight:1.3 }}>{s.name}</span>
                  <span style={{ fontSize:10.5, color:C.text3, display:"block", marginTop:2 }}>{s.hint}</span>
                </button>
              ))}
            </div>

            {/* Graph explorer CTA */}
            <button onClick={() => setPage("grapher")}
              style={{ display:"inline-flex", alignItems:"center", gap:10, background:C.surf, border:`1px solid ${C.border2}`, borderRadius:14, padding:"14px 24px", cursor:"pointer", fontFamily:"inherit", color:C.text, transition:"all 0.18s", marginBottom:8 }}
              onMouseEnter={e=>Object.assign(e.currentTarget.style,{background:C.surf2,boxShadow:`0 0 0 1px rgba(74,158,255,0.25),0 4px 24px rgba(74,158,255,0.1)`})}
              onMouseLeave={e=>Object.assign(e.currentTarget.style,{background:C.surf,boxShadow:"none"})}>
              <span style={{ fontSize:22, color:C.blue }}>∿</span>
              <div style={{ textAlign:"left" }}>
                <div style={{ fontWeight:600, fontSize:14 }}>Graph Explorer</div>
                <div style={{ fontSize:12, color:C.text3 }}>Plot any function interactively</div>
              </div>
              <span style={{ marginLeft:4, color:C.text3, fontSize:16 }}>→</span>
            </button>

            {/* Quick-start input */}
            <div style={{ maxWidth:560, margin:"20px auto 0" }}>
              <div style={{ background:C.surf, border:`1px solid ${C.border2}`, borderRadius:22, overflow:"hidden", boxShadow:`0 4px 28px rgba(7,16,31,0.6)` }}>
                <div style={{ display:"flex", alignItems:"flex-end", padding:"12px 12px 10px 20px", gap:10 }}>
                  <textarea value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}}}
                    placeholder="Or ask anything right now…" rows={1}
                    style={{ flex:1, border:"none", background:"transparent", fontFamily:"inherit", fontSize:15, color:C.text, outline:"none", resize:"none", maxHeight:100, minHeight:26, lineHeight:1.55, padding:"3px 0" }} />
                  <button onClick={()=>send()} disabled={busy||!input.trim()} style={{ width:38, height:38, background:C.blue, border:"none", borderRadius:"50%", cursor:busy||!input.trim()?"default":"pointer", color:"white", display:"flex", alignItems:"center", justifyContent:"center", opacity:busy||!input.trim()?0.35:1 }}>
                    <svg viewBox="0 0 16 16" width={15} height={15} fill="currentColor"><path d="M1.5 1.5l13 6.5-13 6.5v-5l9-1.5-9-1.5z"/></svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════
            PAGE: TUTOR
        ════════════════════════════════════ */}
        {page === "tutor" && (
          <>
            {messages.length === 0 && (
              <div style={{ textAlign:"center", padding:"48px 0", color:C.text3 }}>
                <div style={{ fontFamily:"Georgia,serif", fontStyle:"italic", fontSize:36, marginBottom:12, color:C.text2 }}>e</div>
                <p style={{ fontSize:15 }}>Ask me any mathematics question to begin.</p>
              </div>
            )}

            <div style={{ flex:1, display:"flex", flexDirection:"column" }}>
              {messages.map((m, i) => (
                <div key={i} style={m.role==="user" ? { alignSelf:"flex-end", maxWidth:"72%", margin:"12px 0 4px", marginLeft:"auto" } : { alignSelf:"flex-start", width:"100%", margin:"16px 0 6px" }}>
                  {m.role === "user" ? (
                    <div style={{ background:C.blueD, border:`1px solid rgba(74,158,255,0.3)`, color:C.text, borderRadius:"18px 18px 4px 18px", padding:"11px 16px", fontSize:15, lineHeight:1.55 }}>{m.content}</div>
                  ) : (
                    <div style={{ display:"flex", gap:14, alignItems:"flex-start" }}>
                      <div style={{ width:34, height:34, borderRadius:"50%", background:"linear-gradient(135deg,#1a3f6e,#3a2a8a)", border:`1px solid rgba(74,158,255,0.3)`, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"Georgia,serif", fontSize:15, fontStyle:"italic", color:C.blueL, flexShrink:0, marginTop:2 }}>e</div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:10, fontWeight:600, textTransform:"uppercase", letterSpacing:"1.2px", color:C.text3, marginBottom:8 }}>Euler</div>
                        <div style={{ fontSize:15.5, lineHeight:1.78, color:C.text }}>
                          <RenderTokens tokens={tokenise(m.content)} quizState={quizState} onAnswer={handleAnswer} />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {busy && (
                <div style={{ alignSelf:"flex-start", width:"100%", margin:"16px 0 6px" }}>
                  <div style={{ display:"flex", gap:14, alignItems:"center" }}>
                    <div style={{ width:34, height:34, borderRadius:"50%", background:"linear-gradient(135deg,#1a3f6e,#3a2a8a)", border:`1px solid rgba(74,158,255,0.3)`, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"Georgia,serif", fontSize:15, fontStyle:"italic", color:C.blueL, flexShrink:0 }}>e</div>
                    <div style={{ display:"flex", gap:5, alignItems:"center", padding:"6px 0" }}>
                      {[0,150,300].map(d => <TypingDot key={d} delay={d} />)}
                    </div>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div style={{ position:"sticky", bottom:20, zIndex:100, marginTop:16 }}>
              <div style={{ background:C.surf, border:`1px solid ${C.border2}`, borderRadius:22, boxShadow:`0 4px 28px rgba(7,16,31,0.75),0 0 0 1px rgba(74,158,255,0.05)`, overflow:"hidden" }}>
                <div style={{ display:"flex", alignItems:"flex-end", padding:"12px 12px 10px 20px", gap:10 }}>
                  <textarea ref={textareaRef} value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}}}
                    placeholder="Ask any maths question…" rows={1}
                    style={{ flex:1, border:"none", background:"transparent", fontFamily:"inherit", fontSize:15, color:C.text, outline:"none", resize:"none", maxHeight:140, minHeight:26, lineHeight:1.55, padding:"3px 0" }} />
                  <button onClick={()=>send()} disabled={busy||!input.trim()} style={{ width:38, height:38, background:C.blue, border:"none", borderRadius:"50%", cursor:busy||!input.trim()?"default":"pointer", color:"white", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", opacity:busy||!input.trim()?0.35:1 }}>
                    <svg viewBox="0 0 16 16" width={15} height={15} fill="currentColor"><path d="M1.5 1.5l13 6.5-13 6.5v-5l9-1.5-9-1.5z"/></svg>
                  </button>
                </div>
                <div style={{ padding:"4px 14px 12px", display:"flex", gap:7, overflowX:"auto", scrollbarWidth:"none" }}>
                  {chips.map(([label, prompt]) => (
                    <button key={label} onClick={() => ask(prompt)}
                      style={{ whiteSpace:"nowrap", background:C.bg2, border:`1px solid ${C.border}`, borderRadius:20, padding:"5px 12px", fontSize:12, fontWeight:500, color:C.text2, cursor:"pointer", fontFamily:"inherit", flexShrink:0, transition:"all 0.15s" }}
                      onMouseEnter={e=>Object.assign(e.currentTarget.style,{background:C.surf2,borderColor:C.border2,color:C.text})}
                      onMouseLeave={e=>Object.assign(e.currentTarget.style,{background:C.bg2,borderColor:C.border,color:C.text2})}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}

        {/* ════════════════════════════════════
            PAGE: GRAPHER
        ════════════════════════════════════ */}
        {page === "grapher" && (
          <div>
            <div style={{ marginBottom:24 }}>
              <h2 style={{ fontFamily:"Georgia,serif", fontStyle:"italic", fontSize:28, marginBottom:6 }}>Graph Explorer</h2>
              <p style={{ fontSize:14, color:C.text2, lineHeight:1.6 }}>
                Plot any mathematical function interactively. Hover the graph for live values. Add multiple functions to compare them.
              </p>
            </div>
            <GraphExplorer />
            <div style={{ marginTop:28, textAlign:"center" }}>
              <p style={{ fontSize:13, color:C.text3, marginBottom:12 }}>Want to understand a function you've plotted?</p>
              <button onClick={() => { setPage("tutor"); }}
                style={{ background:C.surf, border:`1px solid ${C.border2}`, borderRadius:12, padding:"10px 22px", color:C.blue, fontWeight:600, fontSize:13, cursor:"pointer", fontFamily:"inherit", transition:"all 0.15s" }}
                onMouseEnter={e=>e.currentTarget.style.background=C.surf2}
                onMouseLeave={e=>e.currentTarget.style.background=C.surf}>
                ◉ Ask the AI Tutor →
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
