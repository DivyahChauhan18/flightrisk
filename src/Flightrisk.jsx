import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence, useSpring, useMotionValue } from "framer-motion";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";
import Papa from "papaparse";

/* ═══════════════════════════════════════════════════════════
   FLIGHTRISK — Warm Amber Mission Control
   
   Design tokens:
   - #0D0900  scorched void (not blue-black, not pure black — burnt)
   - #FFB800  electric amber — used with restraint, one accent
   - #1A1200  surface above void
   - #2A1E00  raised card
   - Space Grotesk — body/UI, geometric warmth
   - Orbitron — score numbers only, terminal authority
   - JetBrains Mono — data labels, codes
   
   Signature elements:
   - Rotating radar sweep canvas (live form panel) — ambient scanning
   - Spring needle arc gauge (result verdict) — physical settlement
   - Both earned by the subject matter: attrition = surveillance + verdict
   
   Motion philosophy (Emil Kowalski):
   - Springs everywhere, never linear
   - Press states: scale(0.97) instant, spring back
   - Every transition communicates state change
   - Radar sweep: ambient, not decorative — it IS the live score viz
   - Needle: physics overshoot on arrival, then settle
═══════════════════════════════════════════════════════════ */

const C = {
  void:        "#0D0900",
  base:        "#110B00",
  surface:     "#1A1200",
  raised:      "#221800",
  high:        "#2A1E00",
  amberCore:   "#FFB800",
  amberMid:    "rgba(255,184,0,0.50)",
  amberDim:    "rgba(255,184,0,0.25)",
  amberFaint:  "rgba(255,184,0,0.08)",
  amberGlow:   "rgba(255,184,0,0.15)",
  border:      "rgba(255,184,0,0.10)",
  borderMid:   "rgba(255,184,0,0.20)",
  borderHigh:  "rgba(255,184,0,0.40)",
  ink:         "#F5EDD4",
  inkMid:      "rgba(245,237,212,0.60)",
  inkDim:      "rgba(245,237,212,0.35)",
  inkFaint:    "rgba(245,237,212,0.15)",
  floodSafe:   "#22C55E",
  floodWarn:   "#FFB800",
  floodHigh:   "#EF4444",
  display:     "'Orbitron', monospace",
  body:        "'Space Grotesk', system-ui, sans-serif",
  mono:        "'JetBrains Mono', 'IBM Plex Mono', monospace",
};

const SPRING = {
  snap:    { type:"spring", stiffness:500, damping:30, mass:1 },
  press:   { type:"spring", stiffness:600, damping:35, mass:0.8 },
  arrive:  { type:"spring", stiffness:350, damping:28, mass:1 },
  score:   { type:"spring", stiffness:200, damping:25, mass:1.2 },
  needle:  { type:"spring", stiffness:120, damping:18, mass:1.5 },
  stagger: { staggerChildren: 0.045, delayChildren: 0.06 },
};

const VARS = {
  fieldList: { hidden:{}, show:{ transition: SPRING.stagger } },
  fieldItem: {
    hidden: { opacity:0, y:14 },
    show:   { opacity:1, y:0, transition:{ ...SPRING.arrive } },
  },
  contentArrive: {
    hidden: { opacity:0, y:8 },
    show:   { opacity:1, y:0, transition:{ ...SPRING.arrive } },
  },
  resultLeft: {
    hidden: { opacity:0, scale:0.98 },
    show:   { opacity:1, scale:1, transition:{ duration:0.30, ease:[0.16,1,0.3,1] } },
  },
  resultRight: {
    hidden: { opacity:0, x:20 },
    show:   { opacity:1, x:0, transition:{ ...SPRING.arrive, delay:0.14 } },
  },
  signalStagger: { hidden:{}, show:{ transition:{ staggerChildren:0.07, delayChildren:0.25 } } },
  signalItem: {
    hidden: { opacity:0, x:-8 },
    show:   { opacity:1, x:0, transition:{ ...SPRING.arrive } },
  },
};

function getRisk(n) {
  if (n < 30) return { word:"Low",      flood:C.floodSafe, label:"LOW RISK",      hex:"#22C55E" };
  if (n < 60) return { word:"Moderate", flood:C.floodWarn, label:"MODERATE RISK", hex:"#FFB800" };
  return              { word:"High",     flood:C.floodHigh, label:"HIGH RISK",     hex:"#EF4444" };
}

const FIELDS = [
  { key:"tenure",            label:"Tenure",               hint:"Years at organisation",        type:"number", min:0,  max:40, unit:"yr" },
  { key:"satisfaction",      label:"Job satisfaction",     hint:"Self-reported · 1 low 10 high", type:"range",  min:1,  max:10           },
  { key:"lastPromotion",     label:"Since last promotion", hint:"Years since last advancement",  type:"number", min:0,  max:15, unit:"yr" },
  { key:"salary",            label:"Salary positioning",   hint:"Relative to market rate",      type:"select", options:["Below market","At market","Above market"] },
  { key:"managerRating",     label:"Manager relationship", hint:"Quality of direct report",     type:"range",  min:1,  max:10           },
  { key:"workload",          label:"Workload pressure",    hint:"Stress and capacity strain",   type:"range",  min:1,  max:10           },
  { key:"remoteFlexibility", label:"Work arrangement",     hint:"Current flexibility policy",   type:"select", options:["None","Partial","Fully remote"] },
  { key:"growthOpportunity", label:"Growth trajectory",    hint:"Perceived career ceiling",     type:"range",  min:1,  max:10           },
];
const DEFAULTS = { tenure:2, satisfaction:5, lastPromotion:1, salary:"At market", managerRating:6, workload:5, remoteFlexibility:"Partial", growthOpportunity:5 };

function scoreForm(f) {
  let s=0;
  if(f.tenure<=1)s+=25;else if(f.tenure<=3)s+=15;else if(f.tenure>=8)s+=10;
  if(f.satisfaction<=3)s+=25;else if(f.satisfaction<=5)s+=15;else if(f.satisfaction>=8)s-=10;
  if(f.lastPromotion>=3)s+=20;else if(f.lastPromotion>=2)s+=10;
  if(f.salary==="Below market")s+=20;else if(f.salary==="Above market")s-=10;
  if(f.managerRating<=4)s+=15;else if(f.managerRating>=8)s-=5;
  if(f.workload>=8)s+=15;else if(f.workload<=4)s-=5;
  if(f.remoteFlexibility==="None")s+=10;else if(f.remoteFlexibility==="Fully remote")s-=5;
  if(f.growthOpportunity<=3)s+=20;else if(f.growthOpportunity>=8)s-=10;
  return Math.max(0,Math.min(100,s));
}

/* ══════════════════════════════════════════════════════
   RADAR CANVAS — the signature ambient element
   
   A polar grid with rotating amber sweep line.
   Signal blips appear at fixed angles, their radius
   distance = signal intensity. The sweep passes over
   them, triggering a brief amber flash — like sonar.
   
   This is not decorative. It IS the live score viz:
   blips further from center = higher individual risk.
   The sweep speed is constant (not tied to score) —
   mission control doesn't panic, it observes.
══════════════════════════════════════════════════════ */
function RadarCanvas({ signals, size = 220 }) {
  const canvasRef = useRef(null);
  const angleRef = useRef(0);
  const frameRef = useRef(null);
  const flashRef = useRef({}); // angle -> flash intensity

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const cx = size / 2, cy = size / 2, r = size / 2 - 8;
    const SWEEP_SPEED = 0.012; // radians per frame

    // Signal blips: each at a fixed angle, radius = value/10 * r
    const blips = signals.map((sig, i) => ({
      angle: (i / signals.length) * Math.PI * 2 - Math.PI / 2,
      radius: (sig.v / 10) * r * 0.85,
      atRisk: sig.atRisk,
      label: sig.label,
    }));

    const draw = () => {
      ctx.clearRect(0, 0, size, size);

      // Background rings
      for (let ri = 1; ri <= 4; ri++) {
        ctx.beginPath();
        ctx.arc(cx, cy, (r * ri) / 4, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(255,184,0,0.07)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Cross lines
      ctx.strokeStyle = "rgba(255,184,0,0.06)";
      ctx.lineWidth = 1;
      [0, Math.PI / 2, Math.PI, (Math.PI * 3) / 2].forEach(a => {
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        ctx.stroke();
      });

      // Sweep cone (trailing gradient)
      const sweepAngle = angleRef.current;
      // Draw sweep trail as multiple arcs with decreasing opacity
      for (let t = 0; t < 40; t++) {
        const ta = sweepAngle - (t / 40) * (Math.PI * 0.6);
        const opacity = (1 - t / 40) * 0.18;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, r, ta - 0.025, ta);
        ctx.closePath();
        ctx.fillStyle = `rgba(255,184,0,${opacity})`;
        ctx.fill();
      }

      // Sweep line
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(sweepAngle) * r, cy + Math.sin(sweepAngle) * r);
      ctx.strokeStyle = `rgba(255,184,0,0.85)`;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Sweep tip glow
      ctx.beginPath();
      ctx.arc(cx + Math.cos(sweepAngle) * r, cy + Math.sin(sweepAngle) * r, 3, 0, Math.PI * 2);
      ctx.fillStyle = C.amberCore;
      ctx.fill();

      // Update flash intensities — when sweep passes over a blip
      blips.forEach(blip => {
        let angleDiff = ((sweepAngle - blip.angle) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
        if (angleDiff < 0.15) {
          flashRef.current[blip.label] = 1.0;
        } else {
          if (flashRef.current[blip.label] > 0) {
            flashRef.current[blip.label] = Math.max(0, flashRef.current[blip.label] - 0.035);
          }
        }
      });

      // Blips
      blips.forEach(blip => {
        const bx = cx + Math.cos(blip.angle) * blip.radius;
        const by = cy + Math.sin(blip.angle) * blip.radius;
        const flash = flashRef.current[blip.label] || 0;
        const baseColor = blip.atRisk ? "#EF4444" : "#FFB800";
        const glowG = blip.atRisk ? 68 : 184;
        const glowB = blip.atRisk ? 68 : 0;

        // Glow halo on flash
        if (flash > 0) {
          const grd = ctx.createRadialGradient(bx, by, 0, bx, by, 14 + flash * 8);
          grd.addColorStop(0, `rgba(${glowR},${glowG},${glowB},${0.5 * flash})`);
          grd.addColorStop(1, `rgba(${glowR},${glowG},${glowB},0)`);
          ctx.beginPath();
          ctx.arc(bx, by, 14 + flash * 8, 0, Math.PI * 2);
          ctx.fillStyle = grd;
          ctx.fill();
        }

        // Blip dot
        ctx.beginPath();
        ctx.arc(bx, by, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = flash > 0
          ? `rgba(${glowR},${glowG},${glowB},${0.6 + flash * 0.4})`
          : `rgba(${glowR},${glowG},${glowB},0.5)`;
        ctx.fill();

        // Label (only near-static ones)
        ctx.font = `500 9px 'JetBrains Mono', monospace`;
        ctx.fillStyle = `rgba(245,237,212,${0.3 + flash * 0.4})`;
        ctx.textAlign = "center";
        const lx = cx + Math.cos(blip.angle) * (blip.radius + 18);
        const ly = cy + Math.sin(blip.angle) * (blip.radius + 18);
        ctx.fillText(blip.label.substring(0, 3).toUpperCase(), lx, ly + 3);
      });

      // Center dot
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.fillStyle = C.amberCore;
      ctx.fill();

      angleRef.current = (angleRef.current + SWEEP_SPEED) % (Math.PI * 2);
      frameRef.current = requestAnimationFrame(draw);
    };

    frameRef.current = requestAnimationFrame(draw);
    return () => { if (frameRef.current) cancelAnimationFrame(frameRef.current); };
  }, [signals, size]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      style={{ display:"block", margin:"0 auto" }}
    />
  );
}

/* ══════════════════════════════════════════════════════
   NEEDLE GAUGE — verdict screen signature
   
   An SVG arc (180°). Needle spring-animates to score,
   overshoots slightly (mass:1.5), settles physically.
   Three zones: safe / moderate / high.
   The number reads in Orbitron beneath the arc.
══════════════════════════════════════════════════════ */
function NeedleGauge({ score, color }) {
  const mv = useMotionValue(0);
  const needleAngle = useSpring(mv, { stiffness:80, damping:14, mass:1.8 });
  const [displayAngle, setDisplayAngle] = useState(0);
  const [displayScore, setDisplayScore] = useState(0);
  const scoreMv = useMotionValue(0);
  const springScore = useSpring(scoreMv, { stiffness:120, damping:20, mass:1.2 });

  useEffect(() => {
    // Map score 0-100 to angle -90deg to +90deg
    const angle = (score / 100) * 180 - 90;
    mv.set(angle);
    scoreMv.set(score);
  }, [score, mv, scoreMv]);

  useEffect(() => {
    const unsub = needleAngle.on("change", v => setDisplayAngle(v));
    return unsub;
  }, [needleAngle]);

  useEffect(() => {
    const unsub = springScore.on("change", v => setDisplayScore(Math.round(v)));
    return unsub;
  }, [springScore]);

  const W = 260, H = 150, cx = W/2, cy = H - 20, R = 100, RInner = 62;

  // Arc path helper
  const arcPath = (startDeg, endDeg, r, ri) => {
    const s = (startDeg - 90) * Math.PI / 180;
    const e = (endDeg - 90) * Math.PI / 180;
    const x1 = cx + r * Math.cos(s), y1 = cy + r * Math.sin(s);
    const x2 = cx + r * Math.cos(e), y2 = cy + r * Math.sin(e);
    const xi1 = cx + ri * Math.cos(s), yi1 = cy + ri * Math.sin(s);
    const xi2 = cx + ri * Math.cos(e), yi2 = cy + ri * Math.sin(e);
    const large = (endDeg - startDeg) > 180 ? 1 : 0;
    return `M${x1},${y1} A${r},${r},0,${large},1,${x2},${y2} L${xi2},${yi2} A${ri},${ri},0,${large},0,${xi1},${yi1} Z`;
  };

  // Needle tip position
  const needleRad = (displayAngle) * Math.PI / 180;
  const nx = cx + (R - 8) * Math.sin(needleRad);
  const ny = cy - (R - 8) * Math.cos(needleRad);

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display:"block", margin:"0 auto", overflow:"visible" }}>
      <defs>
        <filter id="glow">
          <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
          <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>

      {/* Zone arcs: safe 0-30%, moderate 30-60%, high 60-100% */}
      {/* Map score zones to arc degrees: 0 deg = left, 180 deg = right */}
      <path d={arcPath(0, 54, R, RInner)}   fill="rgba(34,197,94,0.15)"  />
      <path d={arcPath(54, 108, R, RInner)} fill="rgba(255,184,0,0.15)"  />
      <path d={arcPath(108, 180, R, RInner)}fill="rgba(239,68,68,0.15)"  />

      {/* Zone arc borders */}
      <path d={arcPath(0, 54, R, RInner)}   fill="none" stroke="rgba(34,197,94,0.30)"  strokeWidth="1" />
      <path d={arcPath(54, 108, R, RInner)} fill="none" stroke="rgba(255,184,0,0.30)"  strokeWidth="1" />
      <path d={arcPath(108, 180, R, RInner)}fill="none" stroke="rgba(239,68,68,0.30)"  strokeWidth="1" />

      {/* Tick marks */}
      {[0,25,50,75,100].map(t => {
        const deg = (t / 100) * 180;
        const rad = (deg - 90) * Math.PI / 180;
        const x1 = cx + (R + 4) * Math.cos(rad), y1 = cy + (R + 4) * Math.sin(rad);
        const x2 = cx + (R + 10) * Math.cos(rad), y2 = cy + (R + 10) * Math.sin(rad);
        return <line key={t} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(255,184,0,0.25)" strokeWidth="1"/>;
      })}

      {/* Tick labels */}
      {[{v:0,label:"0"},{v:50,label:"50"},{v:100,label:"100"}].map(({v,label}) => {
        const deg = (v / 100) * 180;
        const rad = (deg - 90) * Math.PI / 180;
        const lx = cx + (R + 20) * Math.cos(rad), ly = cy + (R + 20) * Math.sin(rad);
        return (
          <text key={v} x={lx} y={ly} textAnchor="middle" dominantBaseline="middle"
            style={{ fontFamily:C.mono, fontSize:8, fill:"rgba(245,237,212,0.25)" }}>{label}</text>
        );
      })}

      {/* Needle shadow */}
      <line x1={cx} y1={cy} x2={nx} y2={ny}
        stroke="rgba(0,0,0,0.4)" strokeWidth="5" strokeLinecap="round"/>

      {/* Needle */}
      <line x1={cx} y1={cy} x2={nx} y2={ny}
        stroke={color} strokeWidth="2.5" strokeLinecap="round"
        filter="url(#glow)"/>

      {/* Needle base */}
      <circle cx={cx} cy={cy} r={7} fill={C.surface} stroke={color} strokeWidth="2"/>
      <circle cx={cx} cy={cy} r={3} fill={color}/>

      {/* Score readout */}
      <text x={cx} y={cy - 32} textAnchor="middle"
        style={{ fontFamily:C.display, fontSize:36, fontWeight:700, fill:color, letterSpacing:"-1px" }}>
        {String(displayScore).padStart(2,"0")}
      </text>
      <text x={cx} y={cy - 14} textAnchor="middle"
        style={{ fontFamily:C.mono, fontSize:9, fill:"rgba(245,237,212,0.35)", letterSpacing:"0.1em" }}>
        /100
      </text>
    </svg>
  );
}

/* ── Spring Score (live) ── */
function SpringScore({ value, size=64, color }) {
  const mv = useMotionValue(value);
  const display = useSpring(mv, { stiffness:200, damping:25, mass:1.2 });
  const [rounded, setRounded] = useState(value);
  useEffect(() => { mv.set(value); }, [value, mv]);
  useEffect(() => {
    const unsub = display.on("change", v => setRounded(Math.round(v)));
    return unsub;
  }, [display]);
  return (
    <span style={{ fontFamily:C.display, fontSize:size, fontWeight:700, color:color||C.ink, letterSpacing:"-2px", lineHeight:1 }}>
      {String(rounded).padStart(2,"0")}
    </span>
  );
}

/* ── Press Button ── */
function PressButton({ onClick, disabled, children, style={}, variant="default" }) {
  const bg = variant==="primary" ? C.amberCore : variant==="ghost" ? "transparent" : C.surface;
  const col = variant==="primary" ? C.void : variant==="ghost" ? C.inkDim : C.inkMid;
  const bord = variant==="ghost" ? `1px solid ${C.border}` : variant==="primary" ? "none" : `1px solid ${C.border}`;
  return (
    <motion.button onClick={onClick} disabled={disabled}
      whileHover={disabled ? {} : { scale:1.01, transition:SPRING.snap }}
      whileTap={disabled ? {} : { scale:0.97, transition:SPRING.press }}
      style={{ ...style, background:disabled?C.surface:bg, border:bord, color:disabled?C.inkDim:col,
        cursor:disabled?"not-allowed":"pointer", fontFamily:C.body, borderRadius:6, outline:"none" }}>
      {children}
    </motion.button>
  );
}

/* ── Skeleton ── */
function Skel({ w="100%", h=12 }) {
  return (
    <motion.div initial={{ opacity:0.4 }} animate={{ opacity:[0.4,0.8,0.4] }}
      transition={{ duration:1.6, repeat:Infinity, ease:"easeInOut" }}
      style={{ width:w, height:h, borderRadius:3, background:C.raised }}/>
  );
}

function Label({ children, style={} }) {
  return <div style={{ fontFamily:C.mono, fontSize:10, color:C.amberMid, letterSpacing:"0.12em", textTransform:"uppercase", marginBottom:6, ...style }}>{children}</div>;
}

function Rule({ style={} }) {
  return <div style={{ height:"1px", background:C.border, ...style }}/>;
}

const TT = ({ active, payload, label }) => {
  if (!active||!payload?.length) return null;
  return (
    <div style={{ background:C.raised, border:`1px solid ${C.borderMid}`, borderRadius:6, padding:"8px 12px", fontFamily:C.mono, fontSize:11 }}>
      <div style={{ color:C.inkDim, marginBottom:2 }}>{label}</div>
      <div style={{ color:C.amberCore, fontWeight:600 }}>{payload[0]?.value}%</div>
    </div>
  );
};

/* ── Range Field ── */
function RangeField({ field, value, onChange }) {
  const p = ((value-field.min)/(field.max-field.min))*100;
  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:18 }}>
        <div>
          <div style={{ fontFamily:C.body, fontSize:14, fontWeight:500, color:C.ink, marginBottom:3 }}>{field.label}</div>
          <div style={{ fontFamily:C.mono, fontSize:11, color:C.inkDim }}>{field.hint}</div>
        </div>
        <motion.span key={value} initial={{ opacity:0.5, y:-4 }} animate={{ opacity:1, y:0 }} transition={SPRING.snap}
          style={{ fontFamily:C.display, fontSize:28, fontWeight:700, color:C.amberCore, letterSpacing:"-1px", lineHeight:1 }}>
          {value}
        </motion.span>
      </div>
      <div style={{ position:"relative", height:"2px", background:C.border, borderRadius:1 }}>
        <motion.div animate={{ width:`${p}%` }} transition={SPRING.snap}
          style={{ position:"absolute", left:0, top:0, height:"100%", background:C.amberCore, borderRadius:1,
            boxShadow:`0 0 8px ${C.amberGlow}` }}/>
        <motion.div animate={{ left:`${p}%` }} transition={SPRING.snap}
          style={{ position:"absolute", top:"50%", translateX:"-50%", translateY:"-50%",
            width:14, height:14, borderRadius:"50%", background:C.void, border:`2px solid ${C.amberCore}`, pointerEvents:"none",
            boxShadow:`0 0 10px ${C.amberGlow}` }}/>
        <input type="range" min={field.min} max={field.max} value={value} onChange={e=>onChange(Number(e.target.value))}
          style={{ position:"absolute", inset:"-12px 0", width:"100%", opacity:0, cursor:"pointer", height:28 }}/>
      </div>
    </div>
  );
}

/* ── Number Field ── */
function NumberField({ field, value, onChange }) {
  const [focused, setFocused] = useState(false);
  return (
    <div>
      <div style={{ fontFamily:C.body, fontSize:14, fontWeight:500, color:C.ink, marginBottom:3 }}>{field.label}</div>
      <div style={{ fontFamily:C.mono, fontSize:11, color:C.inkDim, marginBottom:14 }}>{field.hint}</div>
      <motion.div animate={{ borderBottomColor: focused ? C.amberCore : C.border }}
        transition={{ duration:0.15 }}
        style={{ display:"flex", alignItems:"baseline", gap:8, paddingBottom:10, borderBottom:`1px solid ${C.border}` }}>
        <input type="number" min={field.min} max={field.max} value={value}
          onChange={e=>onChange(Number(e.target.value))}
          onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)}
          style={{ background:"transparent", border:"none", outline:"none", fontFamily:C.display, fontSize:32, fontWeight:700,
            color:C.amberCore, letterSpacing:"-1px", width:80, padding:0 }}/>
        <span style={{ fontFamily:C.mono, fontSize:12, color:C.inkDim }}>{field.unit}</span>
      </motion.div>
    </div>
  );
}

/* ── Select Field ── */
function SelectField({ field, value, onChange }) {
  return (
    <div>
      <div style={{ fontFamily:C.body, fontSize:14, fontWeight:500, color:C.ink, marginBottom:3 }}>{field.label}</div>
      <div style={{ fontFamily:C.mono, fontSize:11, color:C.inkDim, marginBottom:14 }}>{field.hint}</div>
      <div style={{ display:"flex", gap:6 }}>
        {field.options.map(opt => {
          const active = value===opt;
          return (
            <motion.button key={opt} onClick={()=>onChange(opt)}
              whileTap={{ scale:0.97, transition:SPRING.press }}
              animate={{
                background: active ? C.amberFaint : "transparent",
                borderColor: active ? C.amberCore : C.border,
                color: active ? C.amberCore : C.inkDim,
                boxShadow: active ? `0 0 12px ${C.amberGlow}` : "none",
              }}
              transition={{ duration:0.15 }}
              style={{ flex:1, padding:"10px 12px", borderRadius:6, border:`1px solid ${C.border}`,
                fontFamily:C.body, fontSize:12, fontWeight:active?500:400, cursor:"pointer", outline:"none" }}>
              {opt}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════
   BULK HELPERS
══════════════════════════════════════ */
function pct(n,t){return t?((n/t)*100).toFixed(1):0;}
function avg(arr,k){return arr.length?(arr.reduce((s,r)=>s+(+r[k]||0),0)/arr.length).toFixed(1):0;}
function groupBy(arr,k){return arr.reduce((a,r)=>{const v=r[k]||"Unknown";a[v]=a[v]||[];a[v].push(r);return a;},{});}

function computeStats(rows) {
  const total=rows.length,left=rows.filter(r=>r.Attrition==="Yes"),rate=pct(left.length,total);
  const deptData=Object.entries(groupBy(rows,"Department")).map(([dept,e])=>({dept,rate:+pct(e.filter(x=>x.Attrition==="Yes").length,e.length)})).sort((a,b)=>b.rate-a.rate);
  const ageBuckets={"18-25":[],"26-35":[],"36-45":[],"46-55":[],"55+":[]};
  rows.forEach(r=>{const a=+r.Age,b=a<=25?"18-25":a<=35?"26-35":a<=45?"36-45":a<=55?"46-55":"55+";ageBuckets[b].push(r);});
  const ageData=Object.entries(ageBuckets).map(([age,e])=>({age,rate:+pct(e.filter(x=>x.Attrition==="Yes").length,e.length)}));
  const salBands={"<3k":[],"3-5k":[],"5-8k":[],"8-12k":[],"12k+":[]};
  rows.forEach(r=>{const s=+r.MonthlyIncome,b=s<3000?"<3k":s<5000?"3-5k":s<8000?"5-8k":s<12000?"8-12k":"12k+";salBands[b].push(r);});
  const salaryData=Object.entries(salBands).map(([band,e])=>({band,rate:+pct(e.filter(x=>x.Attrition==="Yes").length,e.length)}));
  const satData=[1,2,3,4].map(sc=>{const e=rows.filter(r=>+r.JobSatisfaction===sc);return{score:`${sc}`,rate:+pct(e.filter(x=>x.Attrition==="Yes").length,e.length)};});
  const otY=rows.filter(r=>r.OverTime==="Yes"),otN=rows.filter(r=>r.OverTime==="No");
  const otData=[{label:"Overtime",rate:+pct(otY.filter(x=>x.Attrition==="Yes").length,otY.length)},{label:"No overtime",rate:+pct(otN.filter(x=>x.Attrition==="Yes").length,otN.length)}];
  const tenBuckets={"0-1y":[],"1-3y":[],"3-5y":[],"5-10y":[],"10y+":[]};
  rows.forEach(r=>{const y=+r.YearsAtCompany,b=y<=1?"0-1y":y<=3?"1-3y":y<=5?"3-5y":y<=10?"5-10y":"10y+";tenBuckets[b].push(r);});
  const tenureData=Object.entries(tenBuckets).map(([t,e])=>({tenure:t,rate:+pct(e.filter(x=>x.Attrition==="Yes").length,e.length)}));
  const riskFactors=[
    {factor:"Overtime workers",rate:otData[0].rate},
    {factor:"Low salary band",rate:salaryData[0]?.rate||0},
    {factor:"Low job satisfaction",rate:satData[0]?.rate||0},
    {factor:"Early tenure (0–1y)",rate:tenureData[0]?.rate||0},
    {factor:"Youngest cohort",rate:ageData[0]?.rate||0},
  ].sort((a,b)=>b.rate-a.rate);
  return{total,left:left.length,rate,avgSalary:avg(rows,"MonthlyIncome"),avgTenure:avg(rows,"YearsAtCompany"),deptData,ageData,salaryData,satData,otData,tenureData,riskFactors};
}

function buildPrompt(s){
  return`Senior HR analytics consultant. Four tight paragraphs, plain prose, no markdown, no bullet points.
(1) Overall attrition health vs 15% benchmark. (2) Highest-risk employee profile with specifics. (3) Top 3 retention actions ranked by impact. (4) One counterintuitive finding.
Data: ${s.total} employees, ${s.rate}% attrition, avg income $${s.avgSalary}, avg tenure ${s.avgTenure}yr.
Dept: ${s.deptData.map(d=>`${d.dept} ${d.rate}%`).join(", ")}. Age: ${s.ageData.map(d=>`${d.age} ${d.rate}%`).join(", ")}.
Salary: ${s.salaryData.map(d=>`${d.band} ${d.rate}%`).join(", ")}. OT: ${s.otData[0].rate}% vs no-OT ${s.otData[1].rate}%.
Tenure: ${s.tenureData.map(d=>`${d.tenure} ${d.rate}%`).join(", ")}.`;
}

/* ══════════════════════════════════════
   INDIVIDUAL VIEW
══════════════════════════════════════ */
function IndividualView() {
  const [form, setForm] = useState(DEFAULTS);
  const [step, setStep] = useState("form");
  const [loading, setLoading] = useState(false);
  const [insight, setInsight] = useState("");
  const [result, setResult] = useState(null);
  const set = useCallback((k,v) => setForm(p=>({...p,[k]:v})), []);
  const live = scoreForm(form);
  const liveRisk = getRisk(live);

  const radarSignals = [
    { label:"Satisfaction",  v:form.satisfaction,      atRisk: form.satisfaction <= 4 },
    { label:"Growth",        v:form.growthOpportunity, atRisk: form.growthOpportunity <= 4 },
    { label:"Manager",       v:form.managerRating,     atRisk: form.managerRating <= 4 },
    { label:"Workload",      v:form.workload,           atRisk: form.workload >= 7 },
  ];

  const analyze = async () => {
    const s=scoreForm(form), rv=getRisk(s);
    setResult({s,rv}); setStep("result");
    setLoading(true); setInsight("");
    try {
      const res = await fetch("/api/v1/messages",{
        method:"POST",
        headers:{"Content-Type":"application/json","x-api-key":process.env.REACT_APP_API_KEY,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},
        body:JSON.stringify({model:"claude-sonnet-4-5",max_tokens:800,messages:[{role:"user",content:`Principal HR strategist. Three sentences only, plain prose, no markdown. First: dominant attrition driver. Second: one metric to watch in 30 days. Third: one retention action for this week. Tenure ${form.tenure}yr, satisfaction ${form.satisfaction}/10, since promo ${form.lastPromotion}yr, salary ${form.salary}, manager ${form.managerRating}/10, workload ${form.workload}/10, remote ${form.remoteFlexibility}, growth ${form.growthOpportunity}/10, score ${s}/100.`}]}),
      });
      const d=await res.json();
      setInsight(d.content?.map(b=>b.text||"").join("")||"");
    } catch { setInsight("Failed to generate. Please try again."); }
    setLoading(false);
  };

  const reset = () => { setStep("form"); setResult(null); setInsight(""); setForm(DEFAULTS); };

  if (step==="form") return (
    <div style={{ display:"grid", gridTemplateColumns:"3fr 2fr", minHeight:"calc(100vh - 57px)" }}>

      {/* LEFT — fields */}
      <div style={{ borderRight:`1px solid ${C.border}`, overflowY:"auto", padding:"52px 56px 120px" }}>
        <motion.div initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.24, ease:[0.16,1,0.3,1] }} style={{ marginBottom:52 }}>
          <Label style={{ marginBottom:12 }}>Individual assessment</Label>
          <h1 style={{ fontFamily:C.body, fontSize:36, fontWeight:700, color:C.ink, letterSpacing:"-1px", lineHeight:1.15, margin:"0 0 14px" }}>
            Your next resignation<br/>
            <span style={{ color:C.amberCore }}>is already visible.</span>
          </h1>
          <p style={{ fontFamily:C.body, fontSize:14, color:C.inkMid, lineHeight:1.75, maxWidth:420, margin:0 }}>
            The letter hasn't been written yet. Eight signals say whether it will be. Complete the profile — get the verdict in seconds.
          </p>
        </motion.div>

        <motion.div variants={VARS.fieldList} initial="hidden" animate="show" style={{ display:"flex", flexDirection:"column" }}>
          {FIELDS.map((field, i) => (
            <motion.div key={field.key} variants={VARS.fieldItem}>
              <div style={{ paddingTop:32, paddingBottom:32 }}>
                {field.type==="range"  && <RangeField  field={field} value={form[field.key]} onChange={v=>set(field.key,v)}/>}
                {field.type==="number" && <NumberField field={field} value={form[field.key]} onChange={v=>set(field.key,v)}/>}
                {field.type==="select" && <SelectField field={field} value={form[field.key]} onChange={v=>set(field.key,v)}/>}
              </div>
              {i < FIELDS.length-1 && <Rule/>}
            </motion.div>
          ))}
        </motion.div>

        <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:0.45, duration:0.2 }}>
          <PressButton onClick={analyze} variant="primary"
            style={{ marginTop:52, height:50, paddingLeft:36, paddingRight:36, fontSize:14, fontWeight:600, letterSpacing:"-0.2px",
              boxShadow:`0 0 24px rgba(255,184,0,0.30)` }}>
            Run assessment →
          </PressButton>
        </motion.div>
      </div>

      {/* RIGHT — radar live panel */}
      <div style={{ position:"sticky", top:57, height:"calc(100vh - 57px)", display:"flex", flexDirection:"column", padding:"44px 36px 44px" }}>
        
        {/* Radar */}
        <div style={{ marginBottom:28 }}>
          <Label style={{ textAlign:"center", marginBottom:16 }}>Signal scan · live</Label>
          <RadarCanvas signals={radarSignals} size={210}/>
        </div>

        <Rule style={{ marginBottom:24 }}/>

        {/* Live score beneath radar */}
        <div style={{ display:"flex", alignItems:"baseline", gap:10, marginBottom:8 }}>
          <SpringScore value={live} size={56} color={liveRisk.flood}/>
          <span style={{ fontFamily:C.mono, fontSize:13, color:C.inkDim }}>/100</span>
        </div>

        <motion.div animate={{ color:liveRisk.flood }} transition={{ duration:0.3 }}
          style={{ display:"inline-flex", alignItems:"center", gap:8, marginBottom:20 }}>
          <motion.div animate={{ background:liveRisk.flood, scale:[1,1.2,1] }} transition={{ duration:0.3 }}
            style={{ width:6, height:6, borderRadius:"50%", boxShadow:`0 0 8px currentColor` }}/>
          <span style={{ fontFamily:C.mono, fontSize:10, letterSpacing:"0.12em" }}>{liveRisk.label}</span>
        </motion.div>

        {/* Score bar */}
        <div style={{ height:"2px", background:C.border, borderRadius:1, marginBottom:28, overflow:"hidden" }}>
          <motion.div animate={{ width:`${live}%`, background:liveRisk.flood }}
            transition={SPRING.score}
            style={{ height:"100%", borderRadius:1, boxShadow:`0 0 8px ${liveRisk.flood}` }}/>
        </div>

        <Rule style={{ marginBottom:20 }}/>
        <Label>Individual signals</Label>

        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          {radarSignals.map(({label,v,atRisk}) => (
            <div key={label} style={{ display:"flex", alignItems:"center", gap:12 }}>
              <div style={{ fontFamily:C.mono, fontSize:10, color:C.inkDim, width:80, flexShrink:0 }}>{label}</div>
              <div style={{ flex:1, height:"1px", background:C.border, overflow:"hidden" }}>
                <motion.div animate={{ width:`${v*10}%`, background:atRisk?C.floodHigh:C.borderMid }}
                  transition={SPRING.score} style={{ height:"100%" }}/>
              </div>
              <motion.div animate={{ color:atRisk?C.floodHigh:C.inkMid }} transition={{ duration:0.2 }}
                style={{ fontFamily:C.display, fontSize:12, fontWeight:700, width:20, textAlign:"right" }}>
                {v}
              </motion.div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  /* RESULT */
  const { s: finalScore, rv } = result;
  return (
    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", minHeight:"calc(100vh - 57px)" }}>

      {/* LEFT — verdict */}
      <motion.div variants={VARS.resultLeft} initial="hidden" animate="show"
        style={{ background:`linear-gradient(160deg, ${C.surface} 0%, ${C.void} 100%)`,
          borderRight:`1px solid ${C.border}`, padding:"52px 48px",
          display:"flex", flexDirection:"column", justifyContent:"space-between" }}>
        <div>
          <motion.div initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.1, ...SPRING.arrive }}>
            <Label style={{ marginBottom:24 }}>Risk verdict</Label>
          </motion.div>

          {/* Needle gauge — the signature moment */}
          <motion.div initial={{ opacity:0, scale:0.94 }} animate={{ opacity:1, scale:1 }}
            transition={{ delay:0.15, ...SPRING.arrive }} style={{ marginBottom:32 }}>
            <NeedleGauge score={finalScore} color={rv.flood}/>
          </motion.div>

          <motion.div initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.3, ...SPRING.arrive }}>
            <div style={{ fontFamily:C.mono, fontSize:13, color:rv.flood, letterSpacing:"0.14em", textTransform:"uppercase", marginBottom:6,
              textShadow:`0 0 20px ${rv.flood}` }}>
              {rv.label}
            </div>
            <div style={{ fontFamily:C.body, fontSize:14, color:C.inkDim, lineHeight:1.6, maxWidth:320 }}>
              {finalScore < 30 
                ? "Retention signals are healthy. Monitor the growth trajectory and keep the promotion cadence consistent."
                : finalScore < 60
                ? "Moderate flight risk detected. One or two triggers are active — address within the next 30 days."
                : "High flight risk. Multiple compounding signals present. Immediate manager conversation recommended."}
            </div>
          </motion.div>
        </div>

        <div>
          <Rule style={{ marginBottom:24 }}/>
          <Label style={{ marginBottom:16 }}>Signal breakdown</Label>
          <motion.div variants={VARS.signalStagger} initial="hidden" animate="show"
            style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
            {radarSignals.map(({label,v,atRisk}) => (
              <motion.div key={label} variants={VARS.signalItem}>
                <div style={{ fontFamily:C.mono, fontSize:10, color:C.inkDim, letterSpacing:"0.1em", marginBottom:4 }}>{label}</div>
                <div style={{ fontFamily:C.display, fontSize:26, fontWeight:700, color:atRisk?rv.flood:C.inkMid, letterSpacing:"-1px", lineHeight:1 }}>
                  {v}<span style={{ fontSize:10, color:C.inkFaint }}>/10</span>
                </div>
              </motion.div>
            ))}
          </motion.div>
          <PressButton onClick={reset}
            style={{ marginTop:28, padding:"9px 20px", fontSize:11, letterSpacing:"0.06em", fontFamily:C.mono,
              color:C.amberMid, background:"transparent", border:`1px solid ${C.borderMid}` }}>
            ← New assessment
          </PressButton>
        </div>
      </motion.div>

      {/* RIGHT — strategic brief */}
      <motion.div variants={VARS.resultRight} initial="hidden" animate="show"
        style={{ padding:"52px 48px", display:"flex", flexDirection:"column" }}>
        <motion.div initial={{ opacity:0, y:6 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.18, ...SPRING.arrive }}
          style={{ marginBottom:28 }}>
          <Label>Strategic brief</Label>
          <h2 style={{ fontFamily:C.body, fontSize:22, fontWeight:700, color:C.ink, letterSpacing:"-0.5px", lineHeight:1.3, margin:0 }}>
            Principal analysis
          </h2>
        </motion.div>
        <Rule style={{ marginBottom:28 }}/>
        <div style={{ flex:1 }}>
          <AnimatePresence mode="wait">
            {loading ? (
              <motion.div key="loading" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
                style={{ display:"flex", flexDirection:"column", gap:10 }}>
                {[92,76,84,70,82,0,74].map((w,i)=>w?<Skel key={i} w={`${w}%`}/>:<div key={i} style={{height:8}}/>)}
              </motion.div>
            ) : insight ? (
              <motion.p key="content" initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={SPRING.arrive}
                style={{ fontFamily:C.body, fontSize:15, lineHeight:1.85, color:C.inkMid, margin:0 }}>
                {insight}
              </motion.p>
            ) : null}
          </AnimatePresence>
        </div>
        <Rule style={{ marginTop:28, marginBottom:20 }}/>
        <div style={{ fontFamily:C.mono, fontSize:10, color:C.amberFaint, letterSpacing:"0.1em" }}>FLIGHTRISK · INTELLIGENCE LAYER</div>
      </motion.div>
    </div>
  );
}

/* ══════════════════════════════════════
   BULK VIEW
══════════════════════════════════════ */
function BulkView() {
  const [stats, setStats] = useState(null);
  const [insight, setInsight] = useState("");
  const [insightLoading, setInsightLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [filename, setFilename] = useState("");

  const processFile = (file) => {
    setFilename(file.name);
    Papa.parse(file,{header:true,skipEmptyLines:true,complete:(r)=>setStats(computeStats(r.data))});
  };

  const generate = async () => {
    setInsightLoading(true); setInsight("");
    try {
      const res = await fetch("/api/v1/messages",{
        method:"POST",
        headers:{"Content-Type":"application/json","x-api-key":process.env.REACT_APP_API_KEY,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},
        body:JSON.stringify({model:"claude-sonnet-4-5",max_tokens:900,messages:[{role:"user",content:buildPrompt(stats)}]}),
      });
      const d=await res.json();
      setInsight(d.content?.map(b=>b.text||"").join("")||"");
    } catch { setInsight("Failed to generate."); }
    setInsightLoading(false);
  };

  const rC = r => r>30?C.floodHigh:r>20?C.floodWarn:C.amberCore;

  if (!stats) return (
    <motion.div initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.24, ease:[0.16,1,0.3,1] }}
      style={{ maxWidth:560, margin:"0 auto", padding:"100px 24px" }}>
      <Label style={{ marginBottom:12 }}>Workforce analytics</Label>
      <h1 style={{ fontFamily:C.body, fontSize:40, fontWeight:700, color:C.ink, letterSpacing:"-1.5px", lineHeight:1.1, margin:"0 0 16px" }}>
        Every resignation<br/>
        <span style={{ color:C.amberCore }}>was predictable.</span>
      </h1>
      <p style={{ fontFamily:C.body, fontSize:14, color:C.inkMid, lineHeight:1.75, marginBottom:48 }}>
        The pattern was there before they handed in their notice. Upload an IBM HR Analytics CSV — find out who's next.
      </p>

      <motion.div
        animate={{ borderColor:dragging?C.amberCore:C.border, background:dragging?C.amberFaint:C.surface,
          boxShadow:dragging?`0 0 30px ${C.amberGlow}`:"none" }}
        transition={{ duration:0.15 }}
        onDragOver={e=>{e.preventDefault();setDragging(true);}}
        onDragLeave={()=>setDragging(false)}
        onDrop={e=>{e.preventDefault();setDragging(false);const f=e.dataTransfer.files[0];if(f)processFile(f);}}
        onClick={()=>document.getElementById("bulk-up").click()}
        style={{ border:`1px solid ${C.border}`, borderRadius:10, padding:"60px 40px", textAlign:"center", cursor:"pointer" }}>
        <motion.svg width="32" height="32" viewBox="0 0 24 24" fill="none"
          animate={{ stroke:dragging?C.amberCore:C.inkDim }}
          transition={{ duration:0.15 }}
          strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
          style={{ margin:"0 auto 18px", display:"block" }}>
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
        </motion.svg>
        <div style={{ fontFamily:C.body, fontSize:15, fontWeight:500, color:dragging?C.amberCore:C.inkMid, marginBottom:6 }}>Drop CSV file</div>
        <div style={{ fontFamily:C.mono, fontSize:11, color:C.inkDim }}>or click to browse</div>
        <input id="bulk-up" type="file" accept=".csv" style={{ display:"none" }} onChange={e=>e.target.files[0]&&processFile(e.target.files[0])}/>
      </motion.div>
    </motion.div>
  );

  return (
    <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ duration:0.2 }}>
      {/* KPI strip */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", borderBottom:`1px solid ${C.border}` }}>
        {[
          {label:"Attrition rate",    value:`${stats.rate}%`,                          color:stats.rate>15?C.floodHigh:C.amberCore},
          {label:"Total employees",   value:stats.total,                               color:C.ink},
          {label:"Avg monthly income",value:`$${(+stats.avgSalary).toLocaleString()}`, color:C.ink},
          {label:"Avg tenure",        value:`${stats.avgTenure}yr`,                   color:C.ink},
        ].map(({label,value,color},i)=>(
          <motion.div key={label} initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ delay:i*0.05, ...SPRING.arrive }}
            style={{ padding:"24px 28px", borderRight:i<3?`1px solid ${C.border}`:"none" }}>
            <Label>{label}</Label>
            <div style={{ fontFamily:C.display, fontSize:28, fontWeight:700, color, letterSpacing:"-1px", lineHeight:1 }}>{value}</div>
          </motion.div>
        ))}
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"3fr 2fr", minHeight:"calc(100vh - 57px - 88px)" }}>
        {/* LEFT — charts */}
        <div style={{ borderRight:`1px solid ${C.border}`, padding:"40px 48px 80px" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", marginBottom:36 }}>
            <div>
              <Label>Dashboard</Label>
              <h2 style={{ fontFamily:C.body, fontSize:24, fontWeight:700, color:C.ink, letterSpacing:"-0.5px", margin:0 }}>Attrition overview</h2>
            </div>
            <div style={{ fontFamily:C.mono, fontSize:11, color:C.inkDim }}>{filename}</div>
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:40, marginBottom:40 }}>
            {[
              { label:"By department",    data:stats.deptData,   key:"dept",  layout:"v" },
              { label:"By age group",     data:stats.ageData,    key:"age",   layout:"h" },
              { label:"By salary band",   data:stats.salaryData, key:"band",  layout:"h" },
              { label:"Job satisfaction", data:stats.satData,    key:"score", layout:"h" },
            ].map(({label,data,key,layout})=>(
              <motion.div key={label} initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={SPRING.arrive}>
                <Label>{label}</Label>
                <ResponsiveContainer width="100%" height={160}>
                  {layout==="v" ? (
                    <BarChart data={data} layout="vertical">
                      <CartesianGrid strokeDasharray="2 4" stroke={C.border} horizontal={false}/>
                      <XAxis type="number" tick={{fill:C.inkDim,fontSize:9,fontFamily:C.mono}} unit="%" axisLine={false} tickLine={false}/>
                      <YAxis type="category" dataKey={key} tick={{fill:C.inkMid,fontSize:9,fontFamily:C.mono}} width={72} axisLine={false} tickLine={false}/>
                      <Tooltip content={<TT/>}/>
                      <Bar dataKey="rate" fill={C.amberDim} radius={[0,3,3,0]}/>
                    </BarChart>
                  ) : (
                    <BarChart data={data}>
                      <CartesianGrid strokeDasharray="2 4" stroke={C.border} vertical={false}/>
                      <XAxis dataKey={key} tick={{fill:C.inkDim,fontSize:9,fontFamily:C.mono}} axisLine={false} tickLine={false}/>
                      <YAxis tick={{fill:C.inkDim,fontSize:9,fontFamily:C.mono}} unit="%" axisLine={false} tickLine={false}/>
                      <Tooltip content={<TT/>}/>
                      <Bar dataKey="rate" fill={C.amberDim} radius={[3,3,0,0]}/>
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </motion.div>
            ))}
          </div>

          <Rule style={{ marginBottom:40 }}/>

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:40 }}>
            <motion.div initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.2, ...SPRING.arrive }}>
              <Label>Overtime vs attrition</Label>
              <ResponsiveContainer width="100%" height={140}>
                <BarChart data={stats.otData}>
                  <CartesianGrid strokeDasharray="2 4" stroke={C.border} vertical={false}/>
                  <XAxis dataKey="label" tick={{fill:C.inkDim,fontSize:9,fontFamily:C.mono}} axisLine={false} tickLine={false}/>
                  <YAxis tick={{fill:C.inkDim,fontSize:9,fontFamily:C.mono}} unit="%" axisLine={false} tickLine={false}/>
                  <Tooltip content={<TT/>}/>
                  <Bar dataKey="rate" fill={C.floodHigh} radius={[3,3,0,0]}/>
                </BarChart>
              </ResponsiveContainer>
            </motion.div>
            <motion.div initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.25, ...SPRING.arrive }}>
              <Label>Tenure vs attrition</Label>
              <ResponsiveContainer width="100%" height={140}>
                <LineChart data={stats.tenureData}>
                  <CartesianGrid strokeDasharray="2 4" stroke={C.border} vertical={false}/>
                  <XAxis dataKey="tenure" tick={{fill:C.inkDim,fontSize:9,fontFamily:C.mono}} axisLine={false} tickLine={false}/>
                  <YAxis tick={{fill:C.inkDim,fontSize:9,fontFamily:C.mono}} unit="%" axisLine={false} tickLine={false}/>
                  <Tooltip content={<TT/>}/>
                  <Line type="monotone" dataKey="rate" stroke={C.amberMid} strokeWidth={1.5} dot={{fill:C.amberCore,r:3}}/>
                </LineChart>
              </ResponsiveContainer>
            </motion.div>
          </div>
        </div>

        {/* RIGHT — risk + AI */}
        <div style={{ padding:"40px 36px 80px", display:"flex", flexDirection:"column", gap:36 }}>
          <div>
            <Label>Top risk factors</Label>
            <Rule style={{ marginBottom:0 }}/>
            {stats.riskFactors.map((r,i)=>(
              <motion.div key={i}
                initial={{ opacity:0, x:-8 }} animate={{ opacity:1, x:0 }} transition={{ delay:i*0.06, ...SPRING.arrive }}
                style={{ padding:"14px 0", borderBottom:`1px solid ${C.border}`, display:"flex", alignItems:"center", gap:12 }}>
                <span style={{ fontFamily:C.mono, fontSize:10, color:C.amberDim, width:18, flexShrink:0 }}>{i+1}</span>
                <div style={{ flex:1 }}>
                  <div style={{ fontFamily:C.body, fontSize:12, color:C.inkMid, marginBottom:8 }}>{r.factor}</div>
                  <div style={{ height:"1px", background:C.border }}>
                    <motion.div initial={{ width:0 }} animate={{ width:`${Math.min(r.rate,100)}%` }}
                      transition={{ delay:i*0.06+0.3, type:"spring", stiffness:120, damping:20 }}
                      style={{ height:"100%", background:rC(r.rate), boxShadow:`0 0 6px ${rC(r.rate)}` }}/>
                  </div>
                </div>
                <span style={{ fontFamily:C.display, fontSize:14, fontWeight:700, color:rC(r.rate), minWidth:44, textAlign:"right" }}>{r.rate}%</span>
              </motion.div>
            ))}
          </div>

          <div style={{ flex:1, display:"flex", flexDirection:"column" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", marginBottom:16 }}>
              <div>
                <Label>AI generated</Label>
                <div style={{ fontFamily:C.body, fontSize:16, fontWeight:700, color:C.ink, letterSpacing:"-0.3px" }}>Executive brief</div>
              </div>
              <PressButton onClick={generate} disabled={insightLoading} variant="primary"
                style={{ height:34, paddingLeft:16, paddingRight:16, fontSize:12, fontWeight:600,
                  boxShadow:insightLoading?"none":`0 0 16px rgba(255,184,0,0.25)` }}>
                {insightLoading?"Scanning…":insight?"Regenerate":"Generate"}
              </PressButton>
            </div>
            <Rule style={{ marginBottom:20 }}/>
            <div style={{ flex:1 }}>
              <AnimatePresence mode="wait">
                {insightLoading ? (
                  <motion.div key="skel" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
                    style={{ display:"flex", flexDirection:"column", gap:10 }}>
                    {[90,74,82,0,66,78].map((w,i)=>w?<Skel key={i} w={`${w}%`}/>:<div key={i} style={{height:8}}/>)}
                  </motion.div>
                ) : insight ? (
                  <motion.p key="insight" initial={{ opacity:0, y:6 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}
                    transition={SPRING.arrive}
                    style={{ fontFamily:C.body, fontSize:13, lineHeight:1.85, color:C.inkMid, margin:0, whiteSpace:"pre-wrap" }}>
                    {insight}
                  </motion.p>
                ) : (
                  <motion.p key="empty" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
                    style={{ fontFamily:C.mono, fontSize:11, color:C.inkFaint, lineHeight:1.7, margin:0 }}>
                    Generate to produce an executive summary.
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
          </div>

          <PressButton onClick={()=>{setStats(null);setInsight("");setFilename("");}} variant="ghost"
            style={{ padding:"9px 18px", fontSize:11, letterSpacing:"0.06em", fontFamily:C.mono, alignSelf:"flex-start", color:C.amberDim }}>
            ← Upload new file
          </PressButton>
        </div>
      </div>
    </motion.div>
  );
}

/* ══════════════════════════════════════
   ROOT
══════════════════════════════════════ */
export default function FlightRisk() {
  const [tab, setTab] = useState("individual");

  return (
    <div style={{ minHeight:"100vh", background:C.void, fontFamily:C.body, color:C.ink }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@700&family=Space+Grotesk:wght@400;500;700&family=JetBrains+Mono:wght@400;500;600&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
        html{-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;}
        body{background:#0D0900;}
        ::selection{background:rgba(255,184,0,0.20);color:#F5EDD4;}
        ::-webkit-scrollbar{width:3px;}
        ::-webkit-scrollbar-thumb{background:rgba(255,184,0,0.15);border-radius:2px;}
        input[type=number]{-moz-appearance:textfield;}
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button{opacity:.2;}
        @media(prefers-reduced-motion:reduce){*{animation-duration:0.01ms!important;transition-duration:0.01ms!important;
          canvas{display:none;}}}
      `}</style>

      {/* HEADER */}
      <header style={{ position:"sticky", top:0, zIndex:200, height:57,
        background:`rgba(13,9,0,0.92)`, backdropFilter:"blur(20px)",
        borderBottom:`1px solid ${C.border}`,
        display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 32px" }}>

        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          {/* Crosshair — amber on dark */}
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <circle cx="10" cy="10" r="8.5" stroke="rgba(255,184,0,0.35)" strokeWidth="1"/>
            <circle cx="10" cy="10" r="3.5" stroke={C.amberCore} strokeWidth="1.5"/>
            <circle cx="10" cy="10" r="1.5" fill={C.amberCore}/>
            <line x1="10" y1="1" x2="10" y2="5.5" stroke="rgba(255,184,0,0.50)" strokeWidth="1"/>
            <line x1="10" y1="14.5" x2="10" y2="19" stroke="rgba(255,184,0,0.50)" strokeWidth="1"/>
            <line x1="1" y1="10" x2="5.5" y2="10" stroke="rgba(255,184,0,0.50)" strokeWidth="1"/>
            <line x1="14.5" y1="10" x2="19" y2="10" stroke="rgba(255,184,0,0.50)" strokeWidth="1"/>
          </svg>
          <span style={{ fontFamily:C.display, fontSize:13, fontWeight:700, color:C.amberCore, letterSpacing:"0.08em" }}>FLIGHTRISK</span>
          <span style={{ fontFamily:C.mono, fontSize:10, color:C.amberDim, letterSpacing:"0.06em" }}>by Divyah</span>
        </div>

        <div style={{ display:"flex", alignItems:"center", background:C.surface,
          border:`1px solid ${C.border}`, borderRadius:8, padding:3, gap:2 }}>
          {[["individual","Individual"],["bulk","Bulk CSV"]].map(([id,label])=>(
            <motion.button key={id} onClick={()=>setTab(id)}
              whileTap={{ scale:0.97, transition:SPRING.press }}
              animate={{
                background:tab===id?C.raised:"transparent",
                color:tab===id?C.amberCore:C.inkDim,
                boxShadow:tab===id?`0 0 12px ${C.amberGlow}`:"none",
              }}
              transition={{ duration:0.15 }}
              style={{ padding:"5px 16px", borderRadius:6, border:"none", fontFamily:C.body,
                fontSize:12, fontWeight:tab===id?600:400, cursor:"pointer", outline:"none", letterSpacing:"-0.1px" }}>
              {label}
            </motion.button>
          ))}
        </div>

        <div style={{ width:140, display:"flex", justifyContent:"flex-end" }}>
          <div style={{ fontFamily:C.mono, fontSize:9, color:C.amberDim, letterSpacing:"0.1em", textAlign:"right", lineHeight:1.6 }}>
            ATTRITION<br/>INTELLIGENCE
          </div>
        </div>
      </header>

      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity:0, y:6 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-4 }}
          transition={{ duration:0.18, ease:[0.16,1,0.3,1] }}>
          {tab==="individual" ? <IndividualView/> : <BulkView/>}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}