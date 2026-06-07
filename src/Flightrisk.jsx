import { useState, useEffect, useRef } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";
import Papa from "papaparse";

/* ═══════════════════════════════════════════════════════════
   DESIGN: Warm Amber Mission Control
   — Deep warm brown-black base, electric amber accent
   — Radar sweep animation in header
   — Orbitron display + IBM Plex Sans body
   — Control panel form fields with amber glow
   — CRT monitor warmth, signal red for danger
   ═══════════════════════════════════════════════════════════ */

const C = {
  void:        "#0D0900",
  deep:        "#120C00",
  base:        "#1A1200",
  surface:     "#221800",
  panel:       "#2A1E00",
  glass:       "rgba(255,184,0,0.04)",
  glassMid:    "rgba(255,184,0,0.07)",
  border:      "rgba(255,184,0,0.12)",
  borderMid:   "rgba(255,184,0,0.25)",
  borderHigh:  "rgba(255,184,0,0.50)",
  amber:       "#FFB800",
  amberDim:    "#CC9200",
  amberBright: "#FFD060",
  amberGlow:   "rgba(255,184,0,0.25)",
  amberTrace:  "rgba(255,184,0,0.08)",
  amberFaint:  "rgba(255,184,0,0.04)",
  signal:      "#FF3B30",
  signalDim:   "rgba(255,59,48,0.20)",
  signalTrace: "rgba(255,59,48,0.08)",
  green:       "#32D74B",
  greenDim:    "rgba(50,215,75,0.20)",
  greenTrace:  "rgba(50,215,75,0.08)",
  orange:      "#FF9F0A",
  orangeDim:   "rgba(255,159,10,0.20)",
  ice:         "#FFFFFF",
  iceOff:      "rgba(255,255,255,0.88)",
  iceMid:      "rgba(255,255,255,0.55)",
  iceDim:      "rgba(255,255,255,0.30)",
  iceFaint:    "rgba(255,255,255,0.10)",
  display:     "'Orbitron', monospace",
  body:        "'IBM Plex Sans', system-ui, sans-serif",
  mono:        "'IBM Plex Mono', monospace",
};

const EASE = "cubic-bezier(0.23, 1, 0.32, 1)";

/* ── Score helpers ── */
function getRisk(n) {
  if (n < 30) return { word:"LOW",      label:"LOW RISK",      color:C.green,  glow:C.greenDim,  trace:C.greenTrace  };
  if (n < 60) return { word:"MODERATE", label:"MOD RISK",      color:C.orange, glow:C.orangeDim, trace:C.orangeDim   };
  return              { word:"HIGH",     label:"HIGH RISK",     color:C.signal, glow:C.signalDim, trace:C.signalTrace };
}

/* ── Individual score ── */
const IND_FIELDS = [
  { key:"tenure",            label:"Tenure",               type:"number", min:0,  max:40, unit:"yr", sub:"Years with the organisation" },
  { key:"satisfaction",      label:"Job Satisfaction",     type:"range",  min:1,  max:10,            sub:"Self-reported wellbeing score" },
  { key:"lastPromotion",     label:"Since Last Promotion", type:"number", min:0,  max:15, unit:"yr", sub:"Years since last advancement" },
  { key:"salary",            label:"Salary Positioning",   type:"select", options:["Below market","At market","Above market"], sub:"Relative to benchmarked rate" },
  { key:"managerRating",     label:"Manager Relationship", type:"range",  min:1,  max:10,            sub:"Direct-report relationship quality" },
  { key:"workload",          label:"Workload Pressure",    type:"range",  min:1,  max:10,            sub:"Reported stress and capacity strain" },
  { key:"remoteFlexibility", label:"Work Arrangement",     type:"select", options:["None","Partial","Fully remote"], sub:"Current flexibility policy" },
  { key:"growthOpportunity", label:"Growth Trajectory",    type:"range",  min:1,  max:10,            sub:"Perceived career opportunity" },
];
const IND_DEFAULT = { tenure:2, satisfaction:5, lastPromotion:1, salary:"At market", managerRating:6, workload:5, remoteFlexibility:"Partial", growthOpportunity:5 };

function computeIndScore(f) {
  let s = 0;
  if (f.tenure<=1) s+=25; else if (f.tenure<=3) s+=15; else if (f.tenure>=8) s+=10;
  if (f.satisfaction<=3) s+=25; else if (f.satisfaction<=5) s+=15; else if (f.satisfaction>=8) s-=10;
  if (f.lastPromotion>=3) s+=20; else if (f.lastPromotion>=2) s+=10;
  if (f.salary==="Below market") s+=20; else if (f.salary==="Above market") s-=10;
  if (f.managerRating<=4) s+=15; else if (f.managerRating>=8) s-=5;
  if (f.workload>=8) s+=15; else if (f.workload<=4) s-=5;
  if (f.remoteFlexibility==="None") s+=10; else if (f.remoteFlexibility==="Fully remote") s-=5;
  if (f.growthOpportunity<=3) s+=20; else if (f.growthOpportunity>=8) s-=10;
  return Math.max(0, Math.min(100, s));
}

/* ── Bulk CSV ── */
function pct(n, total) { return total ? ((n / total) * 100).toFixed(1) : 0; }
function avg(arr, key) { return arr.length ? (arr.reduce((s, r) => s + (+r[key] || 0), 0) / arr.length).toFixed(1) : 0; }
function groupBy(arr, key) { return arr.reduce((acc, r) => { const k = r[key] || "Unknown"; acc[k] = acc[k] || []; acc[k].push(r); return acc; }, {}); }

function computeStats(rows) {
  const total = rows.length;
  const left = rows.filter(r => r.Attrition === "Yes");
  const rate = pct(left.length, total);
  const byDept = groupBy(rows, "Department");
  const deptData = Object.entries(byDept).map(([dept, emps]) => {
    const gone = emps.filter(e => e.Attrition === "Yes").length;
    return { dept, rate: +pct(gone, emps.length) };
  }).sort((a, b) => b.rate - a.rate);
  const ageBuckets = { "18-25":[], "26-35":[], "36-45":[], "46-55":[], "55+":[] };
  rows.forEach(r => { const a=+r.Age; const b=a<=25?"18-25":a<=35?"26-35":a<=45?"36-45":a<=55?"46-55":"55+"; ageBuckets[b].push(r); });
  const ageData = Object.entries(ageBuckets).map(([age, emps]) => ({ age, rate: +pct(emps.filter(e=>e.Attrition==="Yes").length, emps.length) }));
  const salaryBands = { "<3k":[], "3k-5k":[], "5k-8k":[], "8k-12k":[], "12k+":[] };
  rows.forEach(r => { const s=+r.MonthlyIncome; const b=s<3000?"<3k":s<5000?"3k-5k":s<8000?"5k-8k":s<12000?"8k-12k":"12k+"; salaryBands[b].push(r); });
  const salaryData = Object.entries(salaryBands).map(([band, emps]) => ({ band, rate: +pct(emps.filter(e=>e.Attrition==="Yes").length, emps.length) }));
  const satisfactionData = [1,2,3,4].map(score => { const emps=rows.filter(r=>+r.JobSatisfaction===score); return { score:`Score ${score}`, rate:+pct(emps.filter(e=>e.Attrition==="Yes").length, emps.length) }; });
  const otYes=rows.filter(r=>r.OverTime==="Yes"), otNo=rows.filter(r=>r.OverTime==="No");
  const overtimeData = [{ label:"Works OT", rate:+pct(otYes.filter(e=>e.Attrition==="Yes").length, otYes.length) }, { label:"No OT", rate:+pct(otNo.filter(e=>e.Attrition==="Yes").length, otNo.length) }];
  const tenureBuckets = { "0-1y":[], "1-3y":[], "3-5y":[], "5-10y":[], "10y+":[] };
  rows.forEach(r => { const y=+r.YearsAtCompany; const b=y<=1?"0-1y":y<=3?"1-3y":y<=5?"3-5y":y<=10?"5-10y":"10y+"; tenureBuckets[b].push(r); });
  const tenureData = Object.entries(tenureBuckets).map(([tenure, emps]) => ({ tenure, rate:+pct(emps.filter(e=>e.Attrition==="Yes").length, emps.length) }));
  const riskFactors = [
    { factor:"Overtime Workers", rate:overtimeData[0].rate },
    { factor:"Low Salary (<$3k)", rate:salaryData[0]?.rate||0 },
    { factor:"Low Job Satisfaction", rate:satisfactionData[0]?.rate||0 },
    { factor:"Early Tenure (0-1y)", rate:tenureData[0]?.rate||0 },
    { factor:"Young Employees (18-25)", rate:ageData[0]?.rate||0 },
  ].sort((a,b)=>b.rate-a.rate);
  return { total, left:left.length, rate, avgSalary:avg(rows,"MonthlyIncome"), avgTenure:avg(rows,"YearsAtCompany"), deptData, ageData, salaryData, satisfactionData, overtimeData, tenureData, riskFactors };
}

function buildPrompt(s) {
  return `You are a senior HR analytics consultant. Analyze this workforce attrition data and write a sharp executive-level summary in plain prose. No markdown, no bullet points, no ## headers, no ** bold. Use plain text only with section titles followed by a colon.
Dataset: ${s.total} employees, ${s.left} left (${s.rate}% attrition rate). Avg income: $${s.avgSalary}. Avg tenure: ${s.avgTenure} years.
Dept attrition: ${s.deptData.map(d=>`${d.dept}: ${d.rate}%`).join(", ")}
Age attrition: ${s.ageData.map(d=>`${d.age}: ${d.rate}%`).join(", ")}
Salary attrition: ${s.salaryData.map(d=>`${d.band}: ${d.rate}%`).join(", ")}
Overtime: Works OT ${s.overtimeData[0]?.rate}% vs No OT ${s.overtimeData[1]?.rate}%
Tenure: ${s.tenureData.map(d=>`${d.tenure}: ${d.rate}%`).join(", ")}
Write 4 paragraphs: (1) overall attrition health vs 15% benchmark, (2) highest-risk employee profile, (3) top 3 actionable recommendations, (4) one counterintuitive finding. Use specific numbers. No fluff.`;
}

/* ── Radar sweep component ── */
function RadarSweep({ size = 120 }) {
  return (
    <div style={{ width:size, height:size, position:"relative", flexShrink:0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ position:"absolute", inset:0 }}>
        <defs>
          <radialGradient id="radarBg" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={C.amber} stopOpacity="0.06"/>
            <stop offset="100%" stopColor={C.amber} stopOpacity="0"/>
          </radialGradient>
        </defs>
        <circle cx={size/2} cy={size/2} r={size/2-1} fill="url(#radarBg)" stroke={C.borderMid} strokeWidth={1}/>
        <circle cx={size/2} cy={size/2} r={size/3} fill="none" stroke={C.border} strokeWidth={0.5}/>
        <circle cx={size/2} cy={size/2} r={size/6} fill="none" stroke={C.border} strokeWidth={0.5}/>
        <line x1={size/2} y1={1} x2={size/2} y2={size-1} stroke={C.border} strokeWidth={0.5}/>
        <line x1={1} y1={size/2} x2={size-1} y2={size/2} stroke={C.border} strokeWidth={0.5}/>
        <circle cx={size/2} cy={size/2} r={3} fill={C.amber} style={{ filter:`drop-shadow(0 0 4px ${C.amber})` }}/>
      </svg>
      {/* Rotating sweep line */}
      <div style={{ position:"absolute", inset:0, animation:"radarSweep 3s linear infinite" }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <defs>
            <linearGradient id="sweepGrad" x1="0.5" y1="0.5" x2="1" y2="0.5">
              <stop offset="0%" stopColor={C.amber} stopOpacity="0.9"/>
              <stop offset="100%" stopColor={C.amber} stopOpacity="0"/>
            </linearGradient>
          </defs>
          <line x1={size/2} y1={size/2} x2={size-2} y2={size/2} stroke="url(#sweepGrad)" strokeWidth={1.5}/>
          <path d={`M ${size/2} ${size/2} L ${size-2} ${size/2} A ${size/2-2} ${size/2-2} 0 0 0 ${size/2} ${2}`} fill={C.amber} fillOpacity="0.06"/>
        </svg>
      </div>
    </div>
  );
}

/* ── Watch gauge (updated for amber theme) ── */
function WatchGauge({ value, size=240, animate=false }) {
  const [display, setDisplay] = useState(animate ? 0 : value);
  const raf = useRef(null);
  useEffect(() => {
    if (!animate) { setDisplay(value); return; }
    let start = null;
    const tick = ts => { if (!start) start=ts; const p=Math.min((ts-start)/1600,1); setDisplay(Math.round(value*(1-Math.pow(1-p,4)))); if(p<1) raf.current=requestAnimationFrame(tick); };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [value, animate]);

  const rv=getRisk(display), cx=size/2, cy=size/2, R=size*0.38, sweep=260, startDeg=140;
  const toRad=d=>d*Math.PI/180;
  const pt=(r,deg)=>({ x:cx+r*Math.cos(toRad(deg-90)), y:cy+r*Math.sin(toRad(deg-90)) });
  const arc=(r,from,to)=>{ const s=pt(r,from),e=pt(r,to); return `M${s.x},${s.y} A${r},${r} 0 ${to-from>180?1:0} 1 ${e.x},${e.y}`; };
  const pct2=display/100, valEnd=startDeg+sweep*pct2;
  const nDeg=startDeg+sweep*pct2, nTip=pt(R*0.80,nDeg), nL=pt(6,nDeg+90), nR=pt(6,nDeg-90);
  const ticks=Array.from({length:26},(_,i)=>{ const deg=startDeg+(sweep/25)*i; const major=i%5===0; return { outer:pt(R*0.97,deg), inner:pt(R*(major?0.84:0.91),deg), lp:pt(R*0.72,deg), major, val:i*4 }; });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ overflow:"visible" }}>
      <defs>
        <radialGradient id="gaugeInner" cx="50%" cy="40%" r="60%"><stop offset="0%" stopColor="#1A1200"/><stop offset="100%" stopColor="#0D0900"/></radialGradient>
        <radialGradient id="gaugeOuter" cx="50%" cy="30%" r="70%"><stop offset="0%" stopColor="#2A1E00"/><stop offset="100%" stopColor="#1A1200"/></radialGradient>
        <filter id="gaugeGlow"><feDropShadow dx="0" dy="8" stdDeviation="16" floodColor={C.amber} floodOpacity="0.3"/></filter>
        <filter id="needleGlow"><feDropShadow dx="0" dy="2" stdDeviation="4" floodColor={C.amber} floodOpacity="0.5"/></filter>
      </defs>
      <circle cx={cx} cy={cy} r={size*0.49} fill="url(#gaugeOuter)" filter="url(#gaugeGlow)"/>
      <circle cx={cx} cy={cy} r={size*0.46} fill="none" stroke={C.borderMid} strokeWidth={1}/>
      <circle cx={cx} cy={cy} r={size*0.445} fill="url(#gaugeInner)"/>
      {/* Radar grid inside gauge */}
      <circle cx={cx} cy={cy} r={R*0.6} fill="none" stroke={C.border} strokeWidth={0.5} opacity={0.5}/>
      <circle cx={cx} cy={cy} r={R*0.3} fill="none" stroke={C.border} strokeWidth={0.5} opacity={0.5}/>
      {[0,45,90,135].map(deg => {
        const toR = d => d * Math.PI / 180;
        return <line key={deg} x1={cx+R*0.3*Math.cos(toR(deg))} y1={cy+R*0.3*Math.sin(toR(deg))} x2={cx+R*0.9*Math.cos(toR(deg))} y2={cy+R*0.9*Math.sin(toR(deg))} stroke={C.border} strokeWidth={0.5} opacity={0.4}/>;
      })}
      <path d={arc(R,startDeg,startDeg+sweep)} fill="none" stroke={C.panel} strokeWidth={5} strokeLinecap="round"/>
      {pct2>0 && <path d={arc(R,startDeg,valEnd)} fill="none" stroke={rv.color} strokeWidth={5} strokeLinecap="round" opacity={0.9} style={{ filter:`drop-shadow(0 0 6px ${rv.color})` }}/>}
      {ticks.map(({outer,inner,lp,major,val},i)=>(
        <g key={i}>
          <line x1={outer.x} y1={outer.y} x2={inner.x} y2={inner.y} stroke={major?C.amber:C.borderMid} strokeWidth={major?1.5:0.75} opacity={major?0.7:0.4}/>
          {major&&[0,50,100].includes(val)&&<text x={lp.x} y={lp.y} textAnchor="middle" dominantBaseline="middle" fill={C.amberDim} style={{fontSize:size*0.046,fontFamily:C.display,fontWeight:600}}>{val}</text>}
        </g>
      ))}
      <text x={cx} y={cy-size*0.07} textAnchor="middle" fill={rv.color} style={{fontSize:size*0.25,fontWeight:700,fontFamily:C.display,letterSpacing:"-2px",filter:`drop-shadow(0 0 8px ${rv.color})`}}>{display}</text>
      <text x={cx} y={cy+size*0.1} textAnchor="middle" fill={C.amberDim} style={{fontSize:size*0.046,fontFamily:C.display,fontWeight:600,letterSpacing:"0.14em"}}>/ 100</text>
      <polygon points={`${nTip.x},${nTip.y} ${nL.x},${nL.y} ${nR.x},${nR.y}`} fill={C.amber} filter="url(#needleGlow)"/>
      <circle cx={cx} cy={cy} r={size*0.05} fill={C.base} stroke={C.amber} strokeWidth={1.5}/>
      <circle cx={cx} cy={cy} r={size*0.02} fill={C.amber}/>
    </svg>
  );
}

/* ── Control panel field label ── */
function FieldLabel({ label, sub }) {
  return (
    <div style={{ marginBottom:10 }}>
      <div style={{ fontSize:9, fontWeight:700, letterSpacing:"0.2em", textTransform:"uppercase", color:C.amber, fontFamily:C.display }}>{label}</div>
      <div style={{ fontSize:10, color:C.iceDim, marginTop:3, fontFamily:C.mono }}>{sub}</div>
    </div>
  );
}

/* ── Range input with amber glow ── */
function RangeInput({ field, value, onChange }) {
  const pct2=((value-field.min)/(field.max-field.min))*100;
  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
        <FieldLabel label={field.label} sub={field.sub}/>
        <div style={{ textAlign:"right", flexShrink:0, marginLeft:16 }}>
          <span style={{ fontSize:32, fontWeight:700, color:C.amber, fontFamily:C.display, letterSpacing:"-2px", lineHeight:1, textShadow:`0 0 16px ${C.amber}` }}>{value}</span>
          <span style={{ fontSize:10, color:C.iceDim, marginLeft:2, fontFamily:C.mono }}>/10</span>
        </div>
      </div>
      <div style={{ position:"relative", height:2, background:C.panel, borderRadius:1, marginTop:12 }}>
        <div style={{ position:"absolute", left:0, top:0, height:"100%", width:`${pct2}%`, background:C.amber, borderRadius:1, boxShadow:`0 0 8px ${C.amberGlow}`, transition:`width 80ms ${EASE}` }}/>
        <div style={{ position:"absolute", top:"50%", left:`${pct2}%`, transform:"translate(-50%,-50%)", width:16, height:16, borderRadius:"50%", background:C.base, border:`2px solid ${C.amber}`, boxShadow:`0 0 12px ${C.amberGlow}`, pointerEvents:"none" }}/>
        <input type="range" min={field.min} max={field.max} value={value} onChange={e=>onChange(Number(e.target.value))} style={{ position:"absolute", inset:"-12px 0", width:"100%", opacity:0, cursor:"pointer", height:26 }}/>
      </div>
      <div style={{ display:"flex", justifyContent:"space-between", marginTop:7 }}>
        <span style={{ fontSize:9, color:C.iceDim, fontFamily:C.mono }}>{field.min}</span>
        <span style={{ fontSize:9, color:C.iceDim, fontFamily:C.mono }}>{field.max}</span>
      </div>
    </div>
  );
}

/* ── Number input ── */
function NumberInput({ field, value, onChange }) {
  const [focused, setFocused] = useState(false);
  return (
    <div>
      <FieldLabel label={field.label} sub={field.sub}/>
      <div style={{ display:"flex", alignItems:"center", border:`1px solid ${focused?C.amber:C.border}`, borderRadius:6, background:C.panel, boxShadow:focused?`0 0 0 3px ${C.amberTrace}, 0 0 16px ${C.amberTrace}`:"none", transition:`all 150ms ease` }}>
        <input type="number" min={field.min} max={field.max} value={value} onChange={e=>onChange(Number(e.target.value))} onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)} style={{ flex:1, border:"none", background:"transparent", padding:"13px 16px", fontSize:22, fontWeight:700, color:C.amber, fontFamily:C.display, outline:"none", letterSpacing:"-0.5px" }}/>
        <span style={{ paddingRight:14, fontSize:11, color:C.iceDim, fontFamily:C.mono }}>{field.unit}</span>
      </div>
    </div>
  );
}

/* ── Select input ── */
function SelectInput({ field, value, onChange }) {
  return (
    <div>
      <FieldLabel label={field.label} sub={field.sub}/>
      <div style={{ display:"flex", gap:6 }}>
        {field.options.map(opt => {
          const active = value === opt;
          return (
            <button key={opt} onClick={()=>onChange(opt)} style={{ flex:1, padding:"11px 6px", border:`1px solid ${active?C.amber:C.border}`, borderRadius:6, background:active?C.amberTrace:C.panel, color:active?C.amber:C.iceDim, fontSize:11, fontWeight:active?700:400, fontFamily:C.mono, cursor:"pointer", outline:"none", transition:`all 150ms ease`, boxShadow:active?`0 0 12px ${C.amberTrace}`:"none" }}
              onMouseDown={e=>{e.currentTarget.style.transform="scale(0.97)"}}
              onMouseUp={e=>{e.currentTarget.style.transform="scale(1)"}}
              onMouseLeave={e=>{e.currentTarget.style.transform="scale(1)"}}
            >{opt}</button>
          );
        })}
      </div>
    </div>
  );
}

/* ── Chart tooltip ── */
const ChartTT = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:C.surface, border:`1px solid ${C.borderMid}`, borderRadius:6, padding:"10px 14px", fontFamily:C.mono, boxShadow:`0 4px 20px rgba(0,0,0,0.5)` }}>
      <p style={{ margin:"0 0 4px", color:C.amber, fontSize:10, letterSpacing:"0.1em" }}>{label}</p>
      {payload.map((p,i)=><p key={i} style={{ margin:0, color:C.iceOff, fontWeight:700 }}>{p.value}%</p>)}
    </div>
  );
};

/* ── Chart card ── */
function MissionCard({ title, children }) {
  return (
    <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:10, overflow:"hidden", position:"relative" }}>
      <div style={{ position:"absolute", top:0, left:0, right:0, height:1, background:`linear-gradient(90deg, ${C.amber}80, transparent)` }}/>
      <div style={{ padding:"12px 18px", borderBottom:`1px solid ${C.border}` }}>
        <span style={{ fontSize:8, fontWeight:700, letterSpacing:"0.22em", textTransform:"uppercase", color:C.amber, fontFamily:C.display }}>{title}</span>
      </div>
      <div style={{ padding:"16px 18px 14px" }}>{children}</div>
    </div>
  );
}

/* ── Shimmer ── */
function Shimmer({ w="100%", h=14 }) {
  return <div style={{ width:w, height:h, borderRadius:3, background:`linear-gradient(90deg,${C.panel} 25%,${C.surface} 50%,${C.panel} 75%)`, backgroundSize:"400% 100%", animation:"shimmer 1.5s ease-in-out infinite" }}/>;
}

/* ══════════════════════════════════════
   INDIVIDUAL VIEW
══════════════════════════════════════ */
function IndividualView() {
  const [form, setForm] = useState(IND_DEFAULT);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [insight, setInsight] = useState("");
  const [final, setFinal] = useState(null);
  const set = (k,v) => setForm(p => ({...p,[k]:v}));
  const live = computeIndScore(form), liveR = getRisk(live);

  const analyze = async () => {
    const s = computeIndScore(form), r = getRisk(s);
    setFinal({s,r}); setStep(1); setLoading(true); setInsight("");
    try {
      const res = await fetch("/api/v1/messages", {
        method:"POST",
        headers:{ "Content-Type":"application/json", "x-api-key":process.env.REACT_APP_API_KEY, "anthropic-version":"2023-06-01", "anthropic-dangerous-direct-browser-access":"true" },
        body:JSON.stringify({ model:"claude-sonnet-4-5", max_tokens:1000, messages:[{ role:"user", content:`You are a principal HR strategist. Write exactly 3 sentences in plain prose — no markdown, no bullet points. First: the single dominant attrition driver. Second: one leading indicator to track in 30 days. Third: one high-leverage retention action to deploy this week. Tenure ${form.tenure}y | Satisfaction ${form.satisfaction}/10 | Since promo ${form.lastPromotion}y | Salary: ${form.salary} | Manager ${form.managerRating}/10 | Workload ${form.workload}/10 | Remote: ${form.remoteFlexibility} | Growth ${form.growthOpportunity}/10 | Score: ${s}/100 (${r.word})` }] }),
      });
      const d = await res.json();
      setInsight(d.content?.map(b=>b.text||"").join("")||"Analysis unavailable.");
    } catch { setInsight("Failed to generate insights. Please try again."); }
    setLoading(false);
  };

  const reset = () => { setStep(0); setFinal(null); setInsight(""); setForm(IND_DEFAULT); };

  if (step === 0) return (
    <div style={{ maxWidth:680, margin:"0 auto", padding:"48px 24px 100px" }}>
      <div style={{ marginBottom:40, animation:`fadeUp 500ms ${EASE} both` }}>
        <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:16 }}>
          <div style={{ height:1, width:32, background:C.amber, boxShadow:`0 0 8px ${C.amber}` }}/>
          <span style={{ fontSize:8, fontWeight:700, letterSpacing:"0.26em", textTransform:"uppercase", color:C.amber, fontFamily:C.display }}>Employee Assessment</span>
        </div>
        <h2 style={{ margin:0, fontFamily:C.display, fontWeight:700, fontSize:32, letterSpacing:"-1px", lineHeight:1.1, color:C.ice }}>
          ATTRITION RISK<br/><span style={{ color:C.amber, textShadow:`0 0 20px ${C.amber}` }}>ASSESSMENT</span>
        </h2>
        <p style={{ marginTop:14, fontSize:13, color:C.iceDim, lineHeight:1.75, maxWidth:500, fontFamily:C.body }}>Complete the profile below to receive an AI-powered retention analysis with targeted recommendations.</p>
      </div>

      <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
        {IND_FIELDS.map((field,i) => (
          <div key={field.key} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:10, padding:"22px 24px", animation:`fadeUp 500ms ${EASE} ${i*40}ms both`, position:"relative", overflow:"hidden" }}>
            <div style={{ position:"absolute", top:0, left:0, right:0, height:1, background:`linear-gradient(90deg, ${C.amber}60, transparent)` }}/>
            {field.type==="range"  && <RangeInput  field={field} value={form[field.key]} onChange={v=>set(field.key,v)}/>}
            {field.type==="number" && <NumberInput field={field} value={form[field.key]} onChange={v=>set(field.key,v)}/>}
            {field.type==="select" && <SelectInput field={field} value={form[field.key]} onChange={v=>set(field.key,v)}/>}
          </div>
        ))}
      </div>

      {/* Live preview bar */}
      <div style={{ marginTop:12, display:"flex", alignItems:"center", gap:14, padding:"14px 20px", background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, animation:`fadeUp 500ms ${EASE} 340ms both` }}>
        <span style={{ fontSize:9, color:C.iceDim, whiteSpace:"nowrap", fontFamily:C.display, letterSpacing:"0.1em" }}>LIVE</span>
        <div style={{ flex:1, height:4, background:C.panel, borderRadius:2, overflow:"hidden" }}>
          <div style={{ height:"100%", width:`${live}%`, background:liveR.color, borderRadius:2, boxShadow:`0 0 8px ${liveR.color}`, transition:`width 220ms ${EASE}, background 220ms ease` }}/>
        </div>
        <span style={{ fontSize:11, fontWeight:700, color:liveR.color, minWidth:80, textAlign:"right", fontFamily:C.display, textShadow:`0 0 8px ${liveR.color}` }}>{liveR.word}</span>
      </div>

      <button onClick={analyze} style={{ marginTop:10, width:"100%", padding:"16px", borderRadius:8, background:`linear-gradient(135deg,${C.amber},${C.amberDim})`, border:"none", color:C.base, fontSize:11, fontWeight:700, letterSpacing:"0.22em", textTransform:"uppercase", fontFamily:C.display, cursor:"pointer", boxShadow:`0 0 32px ${C.amberGlow}`, transition:`all 200ms ${EASE}`, outline:"none", animation:`fadeUp 500ms ${EASE} 380ms both` }}
        onMouseEnter={e=>{e.currentTarget.style.boxShadow=`0 0 48px ${C.amberGlow}`;e.currentTarget.style.transform="translateY(-2px)";}}
        onMouseLeave={e=>{e.currentTarget.style.boxShadow=`0 0 32px ${C.amberGlow}`;e.currentTarget.style.transform="translateY(0)";}}
        onMouseDown={e=>{e.currentTarget.style.transform="scale(0.98)";}}
        onMouseUp={e=>{e.currentTarget.style.transform="translateY(-2px)";}}>
        INITIATE ANALYSIS
      </button>
    </div>
  );

  const rv = final.r;
  return (
    <div style={{ maxWidth:680, margin:"0 auto", padding:"48px 24px 100px", animation:`fadeUp 500ms ${EASE} both` }}>
      <div style={{ marginBottom:32 }}>
        <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:14 }}>
          <div style={{ height:1, width:32, background:C.amber, boxShadow:`0 0 8px ${C.amber}` }}/>
          <span style={{ fontSize:8, fontWeight:700, letterSpacing:"0.26em", textTransform:"uppercase", color:C.amber, fontFamily:C.display }}>Assessment Complete</span>
        </div>
        <h2 style={{ margin:0, fontFamily:C.display, fontWeight:700, fontSize:28, letterSpacing:"-0.5px", lineHeight:1.1, color:C.ice }}>
          RETENTION <span style={{ color:rv.color, textShadow:`0 0 16px ${rv.color}` }}>REPORT</span>
        </h2>
      </div>

      {/* Gauge card */}
      <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, marginBottom:12, padding:"36px 32px 28px", display:"flex", flexDirection:"column", alignItems:"center", position:"relative", overflow:"hidden" }}>
        <div style={{ position:"absolute", top:0, left:0, right:0, height:1, background:`linear-gradient(90deg, transparent, ${C.amber}, transparent)`, boxShadow:`0 0 12px ${C.amber}` }}/>
        <WatchGauge value={final.s} size={220} animate={true}/>
        <div style={{ marginTop:20, display:"inline-flex", alignItems:"center", gap:8, padding:"7px 20px", border:`1px solid ${rv.color}40`, background:`${rv.color}10`, borderRadius:4 }}>
          <div style={{ width:6, height:6, borderRadius:"50%", background:rv.color, boxShadow:`0 0 8px ${rv.color}`, animation:"pulse 2s ease-in-out infinite" }}/>
          <span style={{ fontSize:9, fontWeight:700, color:rv.color, letterSpacing:"0.2em", textTransform:"uppercase", fontFamily:C.display }}>{rv.label}</span>
        </div>
        <div style={{ width:"100%", marginTop:20 }}>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
            <span style={{ fontSize:9, color:C.iceDim, fontFamily:C.mono }}>0</span>
            <span style={{ fontSize:11, fontWeight:700, color:rv.color, fontFamily:C.display }}>{final.s} / 100</span>
            <span style={{ fontSize:9, color:C.iceDim, fontFamily:C.mono }}>100</span>
          </div>
          <div style={{ height:3, background:C.panel, borderRadius:2, overflow:"hidden" }}>
            <div style={{ height:"100%", width:`${final.s}%`, background:rv.color, boxShadow:`0 0 8px ${rv.color}`, borderRadius:2, transition:`width 1.4s ${EASE}` }}/>
          </div>
        </div>
      </div>

      {/* AI Analysis */}
      <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, marginBottom:12, overflow:"hidden", position:"relative" }}>
        <div style={{ position:"absolute", top:0, left:0, right:0, height:1, background:`linear-gradient(90deg, ${C.amber}60, transparent)` }}/>
        <div style={{ padding:"18px 22px", borderBottom:`1px solid ${C.border}`, display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ width:36, height:36, borderRadius:8, background:C.amberTrace, border:`1px solid ${C.borderMid}`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
            <span style={{ fontSize:12, color:C.amber, fontFamily:C.display, fontWeight:700 }}>AI</span>
          </div>
          <div>
            <div style={{ fontSize:12, fontWeight:700, color:C.amber, fontFamily:C.display, letterSpacing:"0.04em" }}>Principal Analysis</div>
            <div style={{ fontSize:9, color:C.iceDim, letterSpacing:"0.1em", textTransform:"uppercase", fontFamily:C.mono, marginTop:2 }}>Mission Control · Confidential</div>
          </div>
        </div>
        <div style={{ padding:"22px", minHeight:80 }}>
          {loading ? <div style={{ display:"flex", flexDirection:"column", gap:12 }}>{[96,82,90,0,76,88].map((w,i)=>w>0?<Shimmer key={i} w={`${w}%`} h={14}/>:<div key={i} style={{height:6}}/>)}</div>
          : <p style={{ margin:0, fontSize:15, lineHeight:1.85, color:C.iceOff, fontFamily:C.body }}>{insight}</p>}
        </div>
      </div>

      {/* Signal breakdown */}
      <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, marginBottom:12, overflow:"hidden" }}>
        <div style={{ padding:"12px 22px", borderBottom:`1px solid ${C.border}` }}>
          <span style={{ fontSize:8, fontWeight:700, letterSpacing:"0.22em", textTransform:"uppercase", color:C.amber, fontFamily:C.display }}>Signal Breakdown</span>
        </div>
        <div style={{ padding:"18px 22px", display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
          {[{label:"Satisfaction",val:form.satisfaction,invert:false},{label:"Growth",val:form.growthOpportunity,invert:false},{label:"Manager",val:form.managerRating,invert:false},{label:"Workload",val:form.workload,invert:true}].map(({label,val,invert})=>{
            const isRisk=invert?val>=7:val<=4, col=isRisk?C.signal:C.green;
            return (
              <div key={label}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                  <span style={{ fontSize:9, color:C.iceDim, fontFamily:C.display, letterSpacing:"0.1em" }}>{label.toUpperCase()}</span>
                  <span style={{ fontSize:13, fontWeight:700, color:col, fontFamily:C.display, textShadow:`0 0 8px ${col}` }}>{val}<span style={{ fontSize:9, color:C.iceDim }}>/10</span></span>
                </div>
                <div style={{ height:2, background:C.panel, borderRadius:1, overflow:"hidden" }}>
                  <div style={{ height:"100%", width:`${val*10}%`, background:col, boxShadow:`0 0 6px ${col}`, borderRadius:1, transition:`width 1s ${EASE} 400ms` }}/>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <button onClick={reset} style={{ width:"100%", padding:"13px", background:"transparent", border:`1px solid ${C.border}`, borderRadius:8, color:C.iceDim, fontSize:9, fontWeight:700, letterSpacing:"0.22em", textTransform:"uppercase", fontFamily:C.display, cursor:"pointer", transition:"all 150ms ease", outline:"none" }}
        onMouseEnter={e=>{e.currentTarget.style.borderColor=C.amber;e.currentTarget.style.color=C.amber;}}
        onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.color=C.iceDim;}}
        onMouseDown={e=>{e.currentTarget.style.transform="scale(0.98)";}}
        onMouseUp={e=>{e.currentTarget.style.transform="scale(1)";}}>
        ← New Assessment
      </button>
    </div>
  );
}

/* ══════════════════════════════════════
   BULK CSV VIEW
══════════════════════════════════════ */
function BulkView() {
  const [stats, setStats] = useState(null);
  const [insight, setInsight] = useState("");
  const [insightLoading, setInsightLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [filename, setFilename] = useState("");

  function processFile(file) {
    setFilename(file.name);
    Papa.parse(file, { header:true, skipEmptyLines:true, complete:(r)=>setStats(computeStats(r.data)) });
  }

  async function generateInsight() {
    if (!stats) return;
    setInsightLoading(true); setInsight("");
    try {
      const res = await fetch("/api/v1/messages", {
        method:"POST",
        headers:{ "Content-Type":"application/json", "x-api-key":process.env.REACT_APP_API_KEY, "anthropic-version":"2023-06-01", "anthropic-dangerous-direct-browser-access":"true" },
        body:JSON.stringify({ model:"claude-sonnet-4-5", max_tokens:1000, messages:[{ role:"user", content:buildPrompt(stats) }] }),
      });
      const d = await res.json();
      setInsight(d.content?.map(b=>b.text||"").join("")||"");
    } catch { setInsight("Failed to generate insights."); }
    setInsightLoading(false);
  }

  const riskColor = rate => rate > 30 ? C.signal : rate > 20 ? C.orange : C.green;

  if (!stats) return (
    <div style={{ maxWidth:760, margin:"0 auto", padding:"48px 24px 100px" }}>
      <div style={{ marginBottom:44, animation:`fadeUp 500ms ${EASE} both` }}>
        <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:16 }}>
          <div style={{ height:1, width:32, background:C.amber, boxShadow:`0 0 8px ${C.amber}` }}/>
          <span style={{ fontSize:8, fontWeight:700, letterSpacing:"0.26em", textTransform:"uppercase", color:C.amber, fontFamily:C.display }}>Workforce Analytics</span>
        </div>
        <h2 style={{ margin:0, fontFamily:C.display, fontWeight:700, fontSize:32, letterSpacing:"-1px", lineHeight:1.1, color:C.ice }}>
          YOUR NEXT RESIGNATION<br/><span style={{ color:C.amber, textShadow:`0 0 20px ${C.amber}` }}>IS IN THE DATA.</span>
        </h2>
        <p style={{ marginTop:14, fontSize:13, color:C.iceDim, lineHeight:1.75, maxWidth:520, fontFamily:C.body }}>Upload your IBM HR Analytics CSV to generate a full attrition dashboard with AI-powered insights.</p>
      </div>

      <div onDragOver={e=>{e.preventDefault();setDragging(true);}} onDragLeave={()=>setDragging(false)}
        onDrop={e=>{e.preventDefault();setDragging(false);const f=e.dataTransfer.files[0];if(f)processFile(f);}}
        onClick={()=>document.getElementById("csv-upload").click()}
        style={{ border:`1px solid ${dragging?C.amber:C.border}`, borderRadius:12, padding:"64px 40px", textAlign:"center", cursor:"pointer", background:dragging?C.amberFaint:C.surface, boxShadow:dragging?`0 0 40px ${C.amberGlow}`:"none", transition:`all 200ms ease`, animation:`fadeUp 500ms ${EASE} 80ms both`, position:"relative", overflow:"hidden" }}>
        <div style={{ position:"absolute", top:0, left:0, right:0, height:1, background:`linear-gradient(90deg, transparent, ${C.amber}60, transparent)` }}/>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={dragging?C.amber:C.borderMid} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin:"0 auto 20px", display:"block", filter:dragging?`drop-shadow(0 0 8px ${C.amber})`:"none" }}>
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
        <div style={{ fontSize:16, fontWeight:700, color:dragging?C.amber:C.iceOff, fontFamily:C.display, marginBottom:8, letterSpacing:"0.04em", textShadow:dragging?`0 0 16px ${C.amber}`:"none" }}>DROP CSV FILE</div>
        <div style={{ fontSize:12, color:C.iceDim, fontFamily:C.mono }}>IBM HR Analytics dataset · 1,470 employees</div>
        <input id="csv-upload" type="file" accept=".csv" style={{ display:"none" }} onChange={e=>e.target.files[0]&&processFile(e.target.files[0])}/>
      </div>
    </div>
  );

  return (
    <div style={{ maxWidth:1100, margin:"0 auto", padding:"48px 32px 100px", animation:`fadeUp 500ms ${EASE} both` }}>
      <div style={{ display:"flex", alignItems:"flex-end", justifyContent:"space-between", marginBottom:32, paddingBottom:24, borderBottom:`1px solid ${C.border}` }}>
        <div>
          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:12 }}>
            <div style={{ height:1, width:32, background:C.amber, boxShadow:`0 0 8px ${C.amber}` }}/>
            <span style={{ fontSize:8, fontWeight:700, letterSpacing:"0.26em", textTransform:"uppercase", color:C.amber, fontFamily:C.display }}>Mission Dashboard</span>
          </div>
          <h2 style={{ margin:0, fontFamily:C.display, fontWeight:700, fontSize:28, letterSpacing:"-0.5px", color:C.ice }}>
            ATTRITION <span style={{ color:C.amber, textShadow:`0 0 16px ${C.amber}` }}>OVERVIEW</span>
          </h2>
        </div>
        <div style={{ textAlign:"right" }}>
          <div style={{ fontSize:8, color:C.iceDim, letterSpacing:"0.14em", textTransform:"uppercase", fontFamily:C.display, marginBottom:4 }}>Dataset</div>
          <div style={{ fontSize:12, fontWeight:700, color:C.iceOff, fontFamily:C.mono }}>{filename} · {stats.total} employees</div>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:20 }}>
        {[
          {label:"Attrition Rate", value:`${stats.rate}%`, sub:`${stats.left} employees left`, col:C.signal, hi:true},
          {label:"Total Employees", value:stats.total, sub:"in dataset", col:C.amber},
          {label:"Avg Monthly Income", value:`$${(+stats.avgSalary).toLocaleString()}`, sub:"across workforce", col:C.amber},
          {label:"Avg Tenure", value:`${stats.avgTenure}y`, sub:"years at company", col:C.amber},
        ].map(({label,value,sub,col,hi})=>(
          <div key={label} style={{ background:C.surface, border:`1px solid ${hi?col+"40":C.border}`, borderRadius:10, padding:"18px 20px", position:"relative", overflow:"hidden" }}>
            <div style={{ position:"absolute", top:0, left:0, right:0, height:1, background:`linear-gradient(90deg, ${col}80, transparent)` }}/>
            <div style={{ fontSize:8, fontWeight:700, letterSpacing:"0.2em", textTransform:"uppercase", color:col, marginBottom:10, fontFamily:C.display }}>{label}</div>
            <div style={{ fontSize:34, fontWeight:700, color:hi?col:C.iceOff, fontFamily:C.display, letterSpacing:"-1px", lineHeight:1, textShadow:hi?`0 0 16px ${col}`:"none" }}>{value}</div>
            <div style={{ fontSize:10, color:C.iceDim, marginTop:6, fontFamily:C.mono }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
        <MissionCard title="Attrition by Department">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={stats.deptData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke={C.border}/>
              <XAxis type="number" tick={{fill:C.iceDim,fontSize:10,fontFamily:C.mono}} unit="%"/>
              <YAxis type="category" dataKey="dept" tick={{fill:C.iceMid,fontSize:10,fontFamily:C.mono}} width={90}/>
              <Tooltip content={<ChartTT/>}/>
              <Bar dataKey="rate" fill={C.amber} radius={[0,4,4,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </MissionCard>
        <MissionCard title="Attrition by Age Group">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={stats.ageData}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border}/>
              <XAxis dataKey="age" tick={{fill:C.iceDim,fontSize:10,fontFamily:C.mono}}/>
              <YAxis tick={{fill:C.iceDim,fontSize:10,fontFamily:C.mono}} unit="%"/>
              <Tooltip content={<ChartTT/>}/>
              <Bar dataKey="rate" fill={C.amberDim} radius={[4,4,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </MissionCard>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
        <MissionCard title="Salary Band vs Attrition">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={stats.salaryData}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border}/>
              <XAxis dataKey="band" tick={{fill:C.iceDim,fontSize:10,fontFamily:C.mono}}/>
              <YAxis tick={{fill:C.iceDim,fontSize:10,fontFamily:C.mono}} unit="%"/>
              <Tooltip content={<ChartTT/>}/>
              <Bar dataKey="rate" fill={C.signal} radius={[4,4,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </MissionCard>
        <MissionCard title="Job Satisfaction vs Attrition">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={stats.satisfactionData}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border}/>
              <XAxis dataKey="score" tick={{fill:C.iceDim,fontSize:10,fontFamily:C.mono}}/>
              <YAxis tick={{fill:C.iceDim,fontSize:10,fontFamily:C.mono}} unit="%"/>
              <Tooltip content={<ChartTT/>}/>
              <Bar dataKey="rate" fill={C.orange} radius={[4,4,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </MissionCard>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
        <MissionCard title="Overtime vs Attrition">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={stats.overtimeData}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border}/>
              <XAxis dataKey="label" tick={{fill:C.iceDim,fontSize:10,fontFamily:C.mono}}/>
              <YAxis tick={{fill:C.iceDim,fontSize:10,fontFamily:C.mono}} unit="%"/>
              <Tooltip content={<ChartTT/>}/>
              <Bar dataKey="rate" fill={C.signal} radius={[4,4,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </MissionCard>
        <MissionCard title="Tenure vs Attrition">
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={stats.tenureData}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border}/>
              <XAxis dataKey="tenure" tick={{fill:C.iceDim,fontSize:10,fontFamily:C.mono}}/>
              <YAxis tick={{fill:C.iceDim,fontSize:10,fontFamily:C.mono}} unit="%"/>
              <Tooltip content={<ChartTT/>}/>
              <Line type="monotone" dataKey="rate" stroke={C.amber} strokeWidth={2} dot={{fill:C.amber,r:4}} style={{ filter:`drop-shadow(0 0 6px ${C.amber})` }}/>
            </LineChart>
          </ResponsiveContainer>
        </MissionCard>
      </div>

      {/* Risk factors */}
      <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:10, marginBottom:12, overflow:"hidden", position:"relative" }}>
        <div style={{ position:"absolute", top:0, left:0, right:0, height:1, background:`linear-gradient(90deg, ${C.signal}80, transparent)` }}/>
        <div style={{ padding:"12px 18px", borderBottom:`1px solid ${C.border}` }}>
          <span style={{ fontSize:8, fontWeight:700, letterSpacing:"0.22em", textTransform:"uppercase", color:C.signal, fontFamily:C.display }}>Top 5 Risk Factors</span>
        </div>
        <div style={{ padding:"18px", display:"flex", flexDirection:"column", gap:16 }}>
          {stats.riskFactors.map((r,i)=>(
            <div key={i}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
                <span style={{ fontSize:12, color:C.iceOff, fontFamily:C.mono }}>{r.factor}</span>
                <span style={{ fontSize:13, fontWeight:700, color:riskColor(r.rate), fontFamily:C.display, textShadow:`0 0 8px ${riskColor(r.rate)}` }}>{r.rate}%</span>
              </div>
              <div style={{ background:C.panel, borderRadius:3, height:4 }}>
                <div style={{ width:`${Math.min(r.rate,100)}%`, height:"100%", background:riskColor(r.rate), boxShadow:`0 0 8px ${riskColor(r.rate)}`, borderRadius:3, transition:`width 800ms ${EASE} 200ms` }}/>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* AI insights */}
      <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:10, marginBottom:16, overflow:"hidden", position:"relative" }}>
        <div style={{ position:"absolute", top:0, left:0, right:0, height:1, background:`linear-gradient(90deg, ${C.amber}60, transparent)` }}/>
        <div style={{ padding:"18px 22px", borderBottom:`1px solid ${C.border}`, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div>
            <div style={{ fontSize:8, fontWeight:700, letterSpacing:"0.2em", textTransform:"uppercase", color:C.amber, fontFamily:C.display, marginBottom:4 }}>AI-Generated</div>
            <div style={{ fontSize:15, fontWeight:700, color:C.iceOff, fontFamily:C.display }}>Executive Insights</div>
          </div>
          <button onClick={generateInsight} disabled={insightLoading}
            style={{ padding:"10px 24px", borderRadius:6, background:insightLoading?C.panel:`linear-gradient(135deg,${C.amber},${C.amberDim})`, border:`1px solid ${insightLoading?C.border:C.amber}`, color:insightLoading?C.iceDim:C.base, fontSize:9, fontWeight:700, letterSpacing:"0.18em", textTransform:"uppercase", fontFamily:C.display, cursor:insightLoading?"not-allowed":"pointer", boxShadow:insightLoading?"none":`0 0 20px ${C.amberGlow}`, transition:`all 200ms ease` }}
            onMouseDown={e=>{if(!insightLoading)e.currentTarget.style.transform="scale(0.97)";}}
            onMouseUp={e=>{e.currentTarget.style.transform="scale(1)";}}>
            {insightLoading?"Generating…":insight?"Regenerate":"Generate →"}
          </button>
        </div>
        <div style={{ padding:"24px 22px", minHeight:80 }}>
          {!insight&&!insightLoading&&<p style={{ margin:0, fontSize:12, color:C.iceDim, fontFamily:C.mono, fontStyle:"italic" }}>Click "Generate →" to receive an AI-powered executive summary.</p>}
          {insightLoading&&<div style={{ display:"flex", flexDirection:"column", gap:14 }}>{[90,76,84,0,68,80].map((w,i)=>w>0?<Shimmer key={i} w={`${w}%`} h={12}/>:<div key={i} style={{height:8}}/>)}</div>}
          {insight&&!insightLoading&&<p style={{ margin:0, fontSize:14, lineHeight:1.85, color:C.iceOff, fontFamily:C.body, whiteSpace:"pre-wrap" }}>{insight}</p>}
        </div>
      </div>

      <button onClick={()=>{setStats(null);setInsight("");setFilename("");}} style={{ padding:"12px 24px", borderRadius:6, border:`1px solid ${C.border}`, background:"transparent", color:C.iceDim, fontSize:9, fontWeight:700, letterSpacing:"0.18em", textTransform:"uppercase", fontFamily:C.display, cursor:"pointer", transition:"all 150ms ease", outline:"none" }}
        onMouseEnter={e=>{e.currentTarget.style.borderColor=C.amber;e.currentTarget.style.color=C.amber;}}
        onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.color=C.iceDim;}}>
        ← Upload New File
      </button>
    </div>
  );
}

/* ══════════════════════════════════════
   ROOT
══════════════════════════════════════ */
export default function FlightRisk() {
  const [tab, setTab] = useState("individual");

  return (
    <div style={{ minHeight:"100vh", background:C.void, fontFamily:C.body, color:C.iceOff }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600;700;800&family=IBM+Plex+Sans:wght@300;400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');
        *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
        html { -webkit-font-smoothing:antialiased; }
        body { background:${C.void}; }
        ::selection { background:${C.amberTrace}; color:${C.amber}; }
        ::-webkit-scrollbar { width:2px; }
        ::-webkit-scrollbar-thumb { background:${C.border}; }

        @keyframes fadeUp    { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:none} }
        @keyframes shimmer   { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        @keyframes radarSweep{ from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes pulse     { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes amberBlink{ 0%,100%{opacity:1} 92%{opacity:1} 93%{opacity:0.4} 95%{opacity:1} }

        input[type=number]{-moz-appearance:textfield}
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button{opacity:.2}
        button { transition:all 160ms ease; cursor:pointer; }
        button:hover { opacity:0.88; }
      `}</style>

      {/* ══ HEADER ══ */}
      <header style={{ position:"sticky", top:0, zIndex:200, background:"rgba(13,9,0,0.92)", backdropFilter:"blur(24px)", borderBottom:`1px solid ${C.border}` }}>
        <div style={{ padding:"0 48px", height:70, display:"flex", alignItems:"center", justifyContent:"space-between" }}>

          {/* Logo with live radar */}
          <div style={{ display:"flex", alignItems:"center", gap:16 }}>
            <RadarSweep size={44}/>
            <div>
              <div style={{ fontSize:16, fontWeight:700, color:C.amber, fontFamily:C.display, letterSpacing:"0.04em", lineHeight:1, textShadow:`0 0 16px ${C.amber}`, animation:"amberBlink 8s ease-in-out infinite" }}>FLIGHTRISK</div>
              <div style={{ fontSize:8, color:C.iceDim, letterSpacing:"0.2em", textTransform:"uppercase", fontFamily:C.mono, marginTop:2 }}>Retention Intelligence · by Divyah</div>
            </div>
          </div>

          {/* Mode selector — control panel buttons */}
          <div style={{ display:"flex", gap:2, background:C.deep, border:`1px solid ${C.border}`, borderRadius:6, padding:3 }}>
            {[["individual","◉ Individual"],["bulk","▦ Bulk CSV"]].map(([id,label]) => (
              <button key={id} onClick={()=>setTab(id)} style={{
                padding:"8px 20px", borderRadius:4, border:"none",
                background: tab===id ? C.amberTrace : "transparent",
                color: tab===id ? C.amber : C.iceDim,
                fontSize:10, fontWeight:700, fontFamily:C.display,
                letterSpacing:"0.1em", textTransform:"uppercase",
                boxShadow: tab===id ? `0 0 12px ${C.amberTrace}, inset 0 1px 0 ${C.border}` : "none",
                borderLeft: tab===id ? `1px solid ${C.borderMid}` : "none",
                borderRight: tab===id ? `1px solid ${C.borderMid}` : "none",
                textShadow: tab===id ? `0 0 8px ${C.amber}` : "none",
              }}
                onMouseDown={e=>{e.currentTarget.style.transform="scale(0.97)"}}
                onMouseUp={e=>{e.currentTarget.style.transform="scale(1)"}}
              >{label}</button>
            ))}
          </div>

          <div style={{ width:160 }}/>
        </div>
      </header>

      {/* Amber glow line under header */}
      <div style={{ height:1, background:`linear-gradient(90deg, transparent, ${C.amber}60, transparent)`, boxShadow:`0 0 12px ${C.amberGlow}` }}/>

      <div style={{ position:"relative", zIndex:1 }}>
        {tab==="individual" ? <IndividualView/> : <BulkView/>}
      </div>
    </div>
  );
}