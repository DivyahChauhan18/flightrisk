import { useState, useEffect, useRef, useCallback } from "react";

/* ═══════════════════════════════════════════════
   DESIGN TOKENS — navy + copper luxury palette
   ═══════════════════════════════════════════════ */
const C = {
  white:       "#FFFFFF",
  snow:        "#F7F8FA",
  snowDeep:    "#EEF0F5",
  navy:        "#0A1628",
  navyMid:     "#142238",
  navyLight:   "#1E3A5F",
  navyGhost:   "#E8EDF5",
  copper:      "#C4773A",
  copperLight: "#D9955A",
  copperPale:  "#FDF0E6",
  copperFaint: "#FEFAF6",
  ink:         "#0A1628",
  inkMid:      "#2D3E56",
  inkLight:    "#6B7A8F",
  inkMute:     "#A8B4C2",
  line:        "#E2E7EF",
  lineDark:    "#C8D0DC",
  shadow:      "rgba(10,22,40,0.06)",
  shadowDeep:  "rgba(10,22,40,0.14)",
  safe:        "#0F4C35", safePale: "#EBF5F0",
  warn:        "#7A4A00", warnPale: "#FDF5E6",
  danger:      "#7A1A1A", dangerPale: "#FDF0F0",
  // Chart palette — rich and distinct, never generic red
  chartNavy:   "#0A1628",
  chartCopper: "#C4773A",
  chartTeal:   "#1A5F5A",
  chartSlate:  "#3D5A80",
  chartRisk:   "#8B3A3A",  // muted burgundy for risk factors only
};

const SERIF = "'Libre Baskerville', Georgia, serif";
const SANS  = "'Plus Jakarta Sans', system-ui, sans-serif";
const EASE  = "cubic-bezier(0.23, 1, 0.32, 1)";

/* ═══════════════════════════════════════════════
   INDIVIDUAL ASSESSMENT — score logic
   ═══════════════════════════════════════════════ */
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

function getRisk(n) {
  if (n < 30) return { word:"Low",      label:"LOW RISK",      color:C.safe,   pale:C.safePale   };
  if (n < 60) return { word:"Moderate", label:"MODERATE RISK", color:C.warn,   pale:C.warnPale   };
  return              { word:"High",     label:"HIGH RISK",     color:C.danger, pale:C.dangerPale };
}

/* ═══════════════════════════════════════════════
   CSV ANALYTICS — parsing + chart computation
   ═══════════════════════════════════════════════ */
function parseCSV(text) {
  const lines = text.trim().split("\n");
  const headers = lines[0].split(",").map(h => h.trim().replace(/"/g,""));
  return lines.slice(1).map(line => {
    const vals = line.split(",").map(v => v.trim().replace(/"/g,""));
    const row = {};
    headers.forEach((h, i) => { row[h] = vals[i]; });
    return row;
  }).filter(r => r.Age);
}

function computeBulkStats(rows) {
  const total = rows.length;
  const left  = rows.filter(r => r.Attrition === "Yes").length;
  const rate  = total > 0 ? (left / total * 100) : 0;
  const avgIncome = rows.reduce((a,r) => a + (parseFloat(r.MonthlyIncome)||0), 0) / total;
  const avgTenure = rows.reduce((a,r) => a + (parseFloat(r.YearsAtCompany)||0), 0) / total;

  // By department
  const depts = {};
  rows.forEach(r => {
    const d = r.Department || "Unknown";
    if (!depts[d]) depts[d] = { total:0, left:0 };
    depts[d].total++;
    if (r.Attrition === "Yes") depts[d].left++;
  });
  const byDept = Object.entries(depts).map(([dept, v]) => ({
    label: dept, rate: v.total > 0 ? v.left/v.total*100 : 0, total:v.total, left:v.left
  })).sort((a,b) => b.rate - a.rate);

  // By age group
  const ageBuckets = [["18–25",18,25],["26–35",26,35],["36–45",36,45],["46–55",46,55],["55+",56,99]];
  const byAge = ageBuckets.map(([label,lo,hi]) => {
    const sub = rows.filter(r => { const a=parseInt(r.Age); return a>=lo&&a<=hi; });
    const leftSub = sub.filter(r => r.Attrition==="Yes").length;
    return { label, rate: sub.length>0 ? leftSub/sub.length*100 : 0, total:sub.length, left:leftSub };
  });

  // By salary band
  const salBuckets = [["<$3k",0,2999],["$3k–5k",3000,4999],["$5k–8k",5000,7999],["$8k–12k",8000,11999],["$12k+",12000,99999]];
  const bySalary = salBuckets.map(([label,lo,hi]) => {
    const sub = rows.filter(r => { const m=parseFloat(r.MonthlyIncome)||0; return m>=lo&&m<=hi; });
    const leftSub = sub.filter(r => r.Attrition==="Yes").length;
    return { label, rate: sub.length>0 ? leftSub/sub.length*100 : 0, total:sub.length };
  });

  // By job satisfaction
  const satBuckets = [["Score 1",1],["Score 2",2],["Score 3",3],["Score 4",4]];
  const bySat = satBuckets.map(([label,score]) => {
    const sub = rows.filter(r => parseInt(r.JobSatisfaction)===score);
    const leftSub = sub.filter(r => r.Attrition==="Yes").length;
    return { label, rate: sub.length>0 ? leftSub/sub.length*100 : 0, total:sub.length };
  });

  // Overtime
  const otYes = rows.filter(r => r.OverTime==="Yes");
  const otNo  = rows.filter(r => r.OverTime==="No");
  const byOT = [
    { label:"Works OT", rate: otYes.length>0 ? otYes.filter(r=>r.Attrition==="Yes").length/otYes.length*100:0, n:otYes.length },
    { label:"No OT",    rate: otNo.length>0  ? otNo.filter(r=>r.Attrition==="Yes").length/otNo.length*100:0,   n:otNo.length  },
  ];

  // Tenure buckets
  const tenBuckets = [["0–1y",0,1],["1–3y",1,3],["3–5y",3,5],["5–10y",5,10],["10y+",10,99]];
  const byTenure = tenBuckets.map(([label,lo,hi]) => {
    const sub = rows.filter(r => { const y=parseFloat(r.YearsAtCompany)||0; return y>=lo&&y<hi; });
    const leftSub = sub.filter(r => r.Attrition==="Yes").length;
    return { label, rate: sub.length>0 ? leftSub/sub.length*100 : 0, total:sub.length };
  });

  // Top risk factors
  const factors = [
    { label:"Overtime Workers",       rate: otYes.length>0 ? otYes.filter(r=>r.Attrition==="Yes").length/otYes.length*100 : 0 },
    { label:"Young Employees (18–25)",rate: byAge[0].rate },
    { label:"Low Job Satisfaction",   rate: bySat[0].rate },
    { label:"Early Tenure (0–1y)",    rate: byTenure[0].rate },
    { label:"Low Salary (<$3k)",      rate: bySalary[0].rate },
  ].sort((a,b) => b.rate - a.rate).slice(0,5);

  return { total, left, rate, avgIncome, avgTenure, byDept, byAge, bySalary, bySat, byOT, byTenure, factors };
}

/* ═══════════════════════════════════════════════
   SHARED COMPONENTS
   ═══════════════════════════════════════════════ */
function Card({ children, style = {} }) {
  return (
    <div style={{
      background: "white", border: `1px solid ${C.line}`,
      borderRadius: 10,
      boxShadow: `0 1px 3px ${C.shadow}`,
      overflow: "hidden",
      position: "relative",
      ...style,
    }}>
      <div style={{ position:"absolute", top:0, left:0, right:0, height:2, background:`linear-gradient(90deg, transparent, ${C.copper}80, transparent)` }}/>
      {children}
    </div>
  );
}

function CardHead({ label }) {
  return (
    <div style={{ padding:"14px 22px", borderBottom:`1px solid ${C.line}`, background:C.snow }}>
      <span style={{ fontSize:9, fontWeight:700, letterSpacing:"0.18em", textTransform:"uppercase", color:C.copper }}>{label}</span>
    </div>
  );
}

function Shimmer({ w="100%", h=14 }) {
  return <div style={{ width:w, height:h, borderRadius:4, background:`linear-gradient(90deg,${C.snowDeep} 25%,${C.line} 50%,${C.snowDeep} 75%)`, backgroundSize:"400% 100%", animation:"shimmer 1.5s ease-in-out infinite" }}/>;
}

/* ── Bar chart (horizontal) ── */
function HBar({ data, color = C.navy, maxVal }) {
  const max = maxVal || Math.max(...data.map(d => d.rate), 1);
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:10, padding:"20px 22px" }}>
      {data.map(({ label, rate }) => (
        <div key={label}>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
            <span style={{ fontSize:11, color:C.inkLight, maxWidth:"60%" }}>{label}</span>
            <span style={{ fontSize:12, fontWeight:700, color, fontFamily:SERIF }}>{rate.toFixed(1)}%</span>
          </div>
          <div style={{ height:6, background:C.snowDeep, borderRadius:3, overflow:"hidden" }}>
            <div style={{ height:"100%", width:`${(rate/max)*100}%`, background:color, borderRadius:3, transition:`width 900ms ${EASE} 200ms` }}/>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Bar chart (vertical) ── */
function VBar({ data, color = C.navy }) {
  const max = Math.max(...data.map(d => d.rate), 1);
  return (
    <div style={{ padding:"20px 22px 16px" }}>
      <div style={{ display:"flex", alignItems:"flex-end", gap:8, height:120 }}>
        {data.map(({ label, rate }) => (
          <div key={label} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:5, height:"100%" }}>
            <span style={{ fontSize:10, fontWeight:700, color, alignSelf:"flex-end", marginBottom:"auto" }}>{rate>0?`${rate.toFixed(0)}%`:""}</span>
            <div style={{ width:"100%", background:C.snowDeep, borderRadius:"3px 3px 0 0", height:"100%", display:"flex", alignItems:"flex-end" }}>
              <div style={{ width:"100%", background:color, borderRadius:"3px 3px 0 0", height:`${(rate/max)*100}%`, transition:`height 900ms ${EASE} 200ms`, opacity:0.85 }}/>
            </div>
          </div>
        ))}
      </div>
      <div style={{ display:"flex", gap:8, marginTop:8 }}>
        {data.map(({ label }) => (
          <div key={label} style={{ flex:1, textAlign:"center" }}>
            <span style={{ fontSize:9, color:C.inkMute, lineHeight:1.3, display:"block" }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Line chart (tenure) ── */
function LineChart({ data }) {
  const max = Math.max(...data.map(d => d.rate), 1);
  const W = 300, H = 100, PAD = 16;
  const pts = data.map((d, i) => ({
    x: PAD + (i / (data.length - 1)) * (W - PAD * 2),
    y: H - PAD - (d.rate / max) * (H - PAD * 2),
    rate: d.rate, label: d.label,
  }));
  const pathD = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  return (
    <div style={{ padding:"20px 22px 16px" }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width:"100%", height:110, overflow:"visible" }}>
        <path d={pathD} fill="none" stroke={C.chartTeal} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/>
        {pts.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={4} fill="white" stroke={C.chartTeal} strokeWidth={2}/>
            {p.rate > 0 && <text x={p.x} y={p.y - 10} textAnchor="middle" fill={C.chartTeal} style={{ fontSize:9, fontFamily:SANS, fontWeight:700 }}>{p.rate.toFixed(0)}%</text>}
          </g>
        ))}
      </svg>
      <div style={{ display:"flex", justifyContent:"space-between", marginTop:4 }}>
        {data.map(d => <span key={d.label} style={{ fontSize:9, color:C.inkMute }}>{d.label}</span>)}
      </div>
    </div>
  );
}

/* ── Gauge for individual ── */
function WatchGauge({ value, size=260, animate=false }) {
  const [display, setDisplay] = useState(animate ? 0 : value);
  const raf = useRef(null);
  useEffect(() => {
    if (!animate) { setDisplay(value); return; }
    let start = null;
    const dur = 1600;
    const tick = ts => {
      if (!start) start = ts;
      const p = Math.min((ts-start)/dur, 1);
      setDisplay(Math.round(value*(1-Math.pow(1-p,4))));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [value, animate]);

  const rv=getRisk(display), cx=size/2, cy=size/2, R=size*0.38, sweep=260, startDeg=140;
  const toRad=d=>d*Math.PI/180;
  const pt=(r,deg)=>({ x:cx+r*Math.cos(toRad(deg-90)), y:cy+r*Math.sin(toRad(deg-90)) });
  const arc=(r,from,to)=>{ const s=pt(r,from),e=pt(r,to); return `M${s.x},${s.y} A${r},${r} 0 ${to-from>180?1:0} 1 ${e.x},${e.y}`; };
  const pct=display/100, valEnd=startDeg+sweep*pct;
  const nTip=pt(R*0.80,startDeg+sweep*pct), nL=pt(7,(startDeg+sweep*pct)+90), nR=pt(7,(startDeg+sweep*pct)-90);
  const ticks=Array.from({length:26},(_,i)=>{ const deg=startDeg+(sweep/25)*i; const major=i%5===0; return { outer:pt(R*0.97,deg), inner:pt(R*(major?0.84:0.91),deg), lp:pt(R*0.72,deg), major, val:i*4 }; });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ overflow:"visible" }}>
      <defs>
        <radialGradient id="gf" cx="50%" cy="40%" r="60%"><stop offset="0%" stopColor="#fff"/><stop offset="100%" stopColor={C.snowDeep}/></radialGradient>
        <radialGradient id="gb" cx="50%" cy="30%" r="70%"><stop offset="0%" stopColor={C.navyLight}/><stop offset="100%" stopColor={C.navy}/></radialGradient>
        <linearGradient id="gc" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor={C.copper}/><stop offset="100%" stopColor={C.copperLight}/></linearGradient>
        <filter id="gs"><feDropShadow dx="0" dy="8" stdDeviation="20" floodColor={C.navy} floodOpacity="0.2"/></filter>
        <filter id="gn"><feDropShadow dx="0" dy="2" stdDeviation="4" floodColor={C.navy} floodOpacity="0.28"/></filter>
      </defs>
      <circle cx={cx} cy={cy} r={size*0.49} fill="url(#gb)" filter="url(#gs)"/>
      <circle cx={cx} cy={cy} r={size*0.46} fill="none" stroke="url(#gc)" strokeWidth={1.5} opacity={0.65}/>
      <circle cx={cx} cy={cy} r={size*0.445} fill="url(#gf)"/>
      <circle cx={cx} cy={cy} r={size*0.445} fill="none" stroke={C.line} strokeWidth={0.5}/>
      <path d={arc(R,startDeg,startDeg+sweep)} fill="none" stroke={C.snowDeep} strokeWidth={5} strokeLinecap="round"/>
      {pct>0 && <path d={arc(R,startDeg,valEnd)} fill="none" stroke={rv.color} strokeWidth={5} strokeLinecap="round" opacity={0.9}/>}
      {ticks.map(({outer,inner,lp,major,val},i)=>(
        <g key={i}>
          <line x1={outer.x} y1={outer.y} x2={inner.x} y2={inner.y} stroke={major?C.inkLight:C.lineDark} strokeWidth={major?1.5:0.75}/>
          {major&&[0,50,100].includes(val)&&<text x={lp.x} y={lp.y} textAnchor="middle" dominantBaseline="middle" fill={C.inkMute} style={{fontSize:size*0.046,fontFamily:SANS,fontWeight:600}}>{val}</text>}
        </g>
      ))}
      <text x={cx} y={cy-size*0.07} textAnchor="middle" fill={rv.color} style={{fontSize:size*0.25,fontWeight:700,fontFamily:SERIF,letterSpacing:"-3px"}}>{display}</text>
      <text x={cx} y={cy+size*0.1} textAnchor="middle" fill={C.inkMute} style={{fontSize:size*0.05,fontFamily:SANS,fontWeight:600,letterSpacing:"0.14em",textTransform:"uppercase"}}>out of 100</text>
      <polygon points={`${nTip.x},${nTip.y} ${nL.x},${nL.y} ${nR.x},${nR.y}`} fill={C.navy} opacity={0.9} filter="url(#gn)"/>
      <circle cx={cx} cy={cy} r={size*0.054} fill={C.navy}/>
      <circle cx={cx} cy={cy} r={size*0.027} fill={C.copper}/>
      <circle cx={cx} cy={cy} r={size*0.009} fill={C.navy}/>
    </svg>
  );
}

/* ═══════════════════════════════════════════════
   INDIVIDUAL ASSESSMENT VIEW
   ═══════════════════════════════════════════════ */
function FieldLabel({ label, sub }) {
  return (
    <div style={{marginBottom:10}}>
      <div style={{fontSize:11,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",color:C.inkLight}}>{label}</div>
      <div style={{fontSize:11,color:C.inkMute,marginTop:3}}>{sub}</div>
    </div>
  );
}

function RangeInput({ field, value, onChange }) {
  const pct = ((value-field.min)/(field.max-field.min))*100;
  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
        <FieldLabel label={field.label} sub={field.sub}/>
        <div style={{textAlign:"right",flexShrink:0,marginLeft:16}}>
          <span style={{fontSize:34,fontWeight:700,color:C.navy,fontFamily:SERIF,letterSpacing:"-2px",lineHeight:1}}>{value}</span>
          <span style={{fontSize:11,color:C.inkMute,marginLeft:2}}>/10</span>
        </div>
      </div>
      <div style={{position:"relative",height:2,background:C.line,borderRadius:1,marginTop:12}}>
        <div style={{position:"absolute",left:0,top:0,height:"100%",width:`${pct}%`,background:C.navy,borderRadius:1,transition:`width 80ms ${EASE}`}}/>
        <div style={{position:"absolute",top:"50%",left:`${pct}%`,transform:"translate(-50%,-50%)",width:16,height:16,borderRadius:"50%",background:"white",border:`2px solid ${C.navy}`,boxShadow:`0 2px 8px ${C.shadowDeep}`,transition:`left 80ms ${EASE}`,pointerEvents:"none"}}/>
        <input type="range" min={field.min} max={field.max} value={value} onChange={e=>onChange(Number(e.target.value))} style={{position:"absolute",inset:"-12px 0",width:"100%",opacity:0,cursor:"pointer",height:26}}/>
      </div>
      <div style={{display:"flex",justifyContent:"space-between",marginTop:7}}>
        <span style={{fontSize:10,color:C.inkMute}}>{field.min}</span>
        <span style={{fontSize:10,color:C.inkMute}}>{field.max}</span>
      </div>
    </div>
  );
}

function NumberInput({ field, value, onChange }) {
  const [focused, setFocused] = useState(false);
  return (
    <div>
      <FieldLabel label={field.label} sub={field.sub}/>
      <div style={{display:"flex",alignItems:"center",overflow:"hidden",border:`1.5px solid ${focused?C.navy:C.line}`,borderRadius:8,background:"white",boxShadow:focused?`0 0 0 3px ${C.navyGhost}`:"none",transition:"all 150ms ease"}}>
        <input type="number" min={field.min} max={field.max} value={value} onChange={e=>onChange(Number(e.target.value))} onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)} style={{flex:1,border:"none",background:"transparent",padding:"13px 16px",fontSize:22,fontWeight:700,color:C.ink,fontFamily:SERIF,outline:"none",letterSpacing:"-0.5px"}}/>
        <span style={{paddingRight:14,fontSize:12,color:C.inkMute,fontWeight:600}}>{field.unit}</span>
      </div>
    </div>
  );
}

function SelectInput({ field, value, onChange }) {
  return (
    <div>
      <FieldLabel label={field.label} sub={field.sub}/>
      <div style={{display:"flex",gap:8}}>
        {field.options.map(opt=>{
          const active=value===opt;
          return <button key={opt} onClick={()=>onChange(opt)} style={{flex:1,padding:"12px 8px",border:`1.5px solid ${active?C.navy:C.line}`,borderRadius:8,background:active?C.navy:"white",color:active?"white":C.inkLight,fontSize:12,fontWeight:600,fontFamily:SANS,letterSpacing:"0.02em",cursor:"pointer",outline:"none",transition:"all 150ms ease"}} onMouseDown={e=>{e.currentTarget.style.transform="scale(0.97)"}} onMouseUp={e=>{e.currentTarget.style.transform="scale(1)"}} onMouseLeave={e=>{e.currentTarget.style.transform="scale(1)"}}>{opt}</button>;
        })}
      </div>
    </div>
  );
}

function IndividualView() {
  const [form, setForm]       = useState(IND_DEFAULT);
  const [step, setStep]       = useState(0);
  const [loading, setLoading] = useState(false);
  const [insight, setInsight] = useState("");
  const [final, setFinal]     = useState(null);
  const set = (k,v) => setForm(p=>({...p,[k]:v}));
  const live = computeIndScore(form);
  const liveR = getRisk(live);

  const analyze = async () => {
    const s=computeIndScore(form), r=getRisk(s);
    setFinal({s,r}); setStep(1); setLoading(true); setInsight("");
    console.log("API key present:", !!process.env.REACT_APP_API_KEY, "starts with:", process.env.REACT_APP_API_KEY?.slice(0,10));
    try {
      const res = await fetch("/api/claude",{
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          model:"claude-sonnet-4-20250514", max_tokens:1000,
          system:"You are a principal HR strategist advising a CHRO. Write exactly 3 sentences. First: name the single dominant attrition driver. Second: one specific leading indicator to track over the next 30 days. Third: one high-leverage retention intervention to deploy this week. Be precise, direct, senior in tone. No hedging, no lists.",
          messages:[{role:"user",content:`Tenure ${form.tenure}y | Satisfaction ${form.satisfaction}/10 | Since promo ${form.lastPromotion}y | Salary: ${form.salary} | Manager ${form.managerRating}/10 | Workload ${form.workload}/10 | Remote: ${form.remoteFlexibility} | Growth ${form.growthOpportunity}/10 | Score: ${s}/100 (${r.word})`}],
        }),
      });
      const d=await res.json();
      setInsight(d.content?.map(b=>b.text||"").join("")||"Analysis unavailable.");
    } catch { setInsight("Connection failed. Verify your API configuration."); }
    setLoading(false);
  };

  const reset = () => { setStep(0); setFinal(null); setInsight(""); setForm(IND_DEFAULT); };

  if (step===0) return (
    <div style={{maxWidth:680,margin:"0 auto",padding:"48px 24px 100px"}}>
      <div style={{marginBottom:44,animation:`fadeUp 500ms ${EASE} both`}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16}}>
          <div style={{height:1,width:32,background:C.copper}}/>
          <span style={{fontSize:9,fontWeight:700,letterSpacing:"0.22em",textTransform:"uppercase",color:C.copper}}>Employee Profile</span>
        </div>
        <h2 style={{margin:0,fontFamily:SERIF,fontWeight:700,fontSize:38,letterSpacing:"-1.5px",lineHeight:1.05,color:C.navy}}>
          Attrition Risk<br/><span style={{fontStyle:"italic",color:C.copper}}>Assessment</span>
        </h2>
        <p style={{marginTop:14,fontSize:14,color:C.inkLight,lineHeight:1.75,maxWidth:500}}>
          Complete the profile below to receive an AI-powered retention analysis with targeted recommendations.
        </p>
      </div>

      <div style={{display:"flex",flexDirection:"column",gap:4}}>
        {IND_FIELDS.map((field,i)=>(
          <div key={field.key} style={{background:"white",border:`1px solid ${C.line}`,borderRadius:10,padding:"22px 24px",boxShadow:`0 1px 3px ${C.shadow}`,animation:`fadeUp 500ms ${EASE} ${i*40}ms both`,position:"relative",overflow:"hidden"}}>
            {field.type==="range" && <div style={{position:"absolute",left:0,top:0,bottom:0,width:3,background:C.copper,borderRadius:"10px 0 0 10px"}}/>}
            {field.type==="range"  && <RangeInput  field={field} value={form[field.key]} onChange={v=>set(field.key,v)}/>}
            {field.type==="number" && <NumberInput field={field} value={form[field.key]} onChange={v=>set(field.key,v)}/>}
            {field.type==="select" && <SelectInput field={field} value={form[field.key]} onChange={v=>set(field.key,v)}/>}
          </div>
        ))}
      </div>

      {/* Live bar */}
      <div style={{marginTop:12,display:"flex",alignItems:"center",gap:14,padding:"14px 20px",background:"white",border:`1px solid ${C.line}`,borderRadius:8,animation:`fadeUp 500ms ${EASE} 340ms both`}}>
        <span style={{fontSize:11,color:C.inkMute,whiteSpace:"nowrap"}}>Live preview</span>
        <div style={{flex:1,height:3,background:C.snowDeep,borderRadius:2,overflow:"hidden"}}>
          <div style={{height:"100%",width:`${live}%`,background:liveR.color,borderRadius:2,transition:`width 220ms ${EASE},background 220ms ease`}}/>
        </div>
        <span style={{fontSize:12,fontWeight:700,color:liveR.color,minWidth:90,textAlign:"right"}}>{liveR.word} Risk</span>
      </div>

      <button onClick={analyze} style={{marginTop:10,width:"100%",padding:"16px",borderRadius:8,background:C.navy,border:"none",color:"white",fontSize:12,fontWeight:700,letterSpacing:"0.16em",textTransform:"uppercase",fontFamily:SANS,cursor:"pointer",boxShadow:`0 4px 20px rgba(10,22,40,0.3)`,transition:`all 200ms ${EASE}`,outline:"none",animation:`fadeUp 500ms ${EASE} 380ms both`}}
        onMouseEnter={e=>{e.currentTarget.style.background=C.navyMid;e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow=`0 8px 28px rgba(10,22,40,0.4)`;}}
        onMouseLeave={e=>{e.currentTarget.style.background=C.navy;e.currentTarget.style.transform="translateY(0)";e.currentTarget.style.boxShadow=`0 4px 20px rgba(10,22,40,0.3)`;}}
        onMouseDown={e=>{e.currentTarget.style.transform="scale(0.98)";}}
        onMouseUp={e=>{e.currentTarget.style.transform="translateY(-2px)";}}>
        Generate Analysis
      </button>
      <p style={{marginTop:10,fontSize:10,color:C.inkMute,textAlign:"center",letterSpacing:"0.04em"}}>Powered by Claude AI · Advisory use only</p>
    </div>
  );

  const rv=final.r;
  return (
    <div style={{maxWidth:680,margin:"0 auto",padding:"48px 24px 100px",animation:`fadeUp 500ms ${EASE} both`}}>
      <div style={{marginBottom:36}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14}}>
          <div style={{height:1,width:32,background:C.copper}}/>
          <span style={{fontSize:9,fontWeight:700,letterSpacing:"0.22em",textTransform:"uppercase",color:C.copper}}>Assessment Complete</span>
        </div>
        <h2 style={{margin:0,fontFamily:SERIF,fontWeight:700,fontSize:36,letterSpacing:"-1.5px",lineHeight:1.05,color:C.navy}}>
          Retention<br/><span style={{fontStyle:"italic",color:C.copper}}>Report</span>
        </h2>
      </div>

      {/* Score */}
      <Card style={{marginBottom:12}}>
        <div style={{padding:"36px 32px 28px",display:"flex",flexDirection:"column",alignItems:"center"}}>
          <WatchGauge value={final.s} size={240} animate={true}/>
          <div style={{marginTop:20,display:"inline-flex",alignItems:"center",gap:8,padding:"7px 18px",borderRadius:4,border:`1px solid ${rv.color}25`,background:rv.pale}}>
            <div style={{width:7,height:7,borderRadius:"50%",background:rv.color}}/>
            <span style={{fontSize:10,fontWeight:800,color:rv.color,letterSpacing:"0.14em",textTransform:"uppercase"}}>{rv.label}</span>
          </div>
          <div style={{width:"100%",marginTop:20}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
              <span style={{fontSize:10,color:C.inkMute}}>0</span>
              <span style={{fontSize:12,fontWeight:700,color:rv.color}}>{final.s} / 100</span>
              <span style={{fontSize:10,color:C.inkMute}}>100</span>
            </div>
            <div style={{height:3,background:C.snowDeep,borderRadius:2,overflow:"hidden"}}>
              <div style={{height:"100%",width:`${final.s}%`,background:rv.color,borderRadius:2,transition:`width 1.4s ${EASE}`}}/>
            </div>
          </div>
        </div>
      </Card>

      {/* AI Insight */}
      <Card style={{marginBottom:12}}>
        <div style={{padding:"20px 24px",borderBottom:`1px solid ${C.line}`,display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:38,height:38,borderRadius:8,background:C.navy,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
            <span style={{fontSize:13,color:C.copper,fontFamily:SERIF,fontWeight:700}}>AI</span>
          </div>
          <div>
            <div style={{fontSize:13,fontWeight:700,color:C.navy}}>Principal Analysis</div>
            <div style={{fontSize:10,color:C.inkMute,letterSpacing:"0.06em",textTransform:"uppercase",marginTop:2}}>Claude Sonnet · Confidential</div>
          </div>
        </div>
        <div style={{padding:"24px",minHeight:80}}>
          {loading ? <div style={{display:"flex",flexDirection:"column",gap:12}}>{[96,82,90,0,76,88].map((w,i)=>w>0?<Shimmer key={i} w={`${w}%`} h={14}/>:<div key={i} style={{height:6}}/>)}</div>
          : <p style={{margin:0,fontSize:16,lineHeight:1.85,color:C.inkMid,fontFamily:SERIF,letterSpacing:"0.01em"}}>{insight}</p>}
        </div>
      </Card>

      {/* Signal breakdown */}
      <Card style={{marginBottom:12}}>
        <CardHead label="Signal Breakdown"/>
        <div style={{padding:"20px 22px",display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
          {[{label:"Satisfaction",val:form.satisfaction,invert:false},{label:"Growth",val:form.growthOpportunity,invert:false},{label:"Manager",val:form.managerRating,invert:false},{label:"Workload",val:form.workload,invert:true}].map(({label,val,invert})=>{
            const isRisk=invert?val>=7:val<=4, col=isRisk?C.danger:C.navyLight;
            return <div key={label}><div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><span style={{fontSize:11,color:C.inkLight}}>{label}</span><span style={{fontSize:14,fontWeight:700,color:col,fontFamily:SERIF}}>{val}<span style={{fontSize:10,color:C.inkMute}}>/10</span></span></div><div style={{height:2,background:C.line,borderRadius:1,overflow:"hidden"}}><div style={{height:"100%",width:`${val*10}%`,background:col,borderRadius:1,transition:`width 1s ${EASE} 400ms`}}/></div></div>;
          })}
        </div>
      </Card>

      {/* Profile */}
      <Card style={{marginBottom:12}}>
        <CardHead label="Input Profile"/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr"}}>
          {[["Tenure",`${form.tenure} yr`],["Satisfaction",`${form.satisfaction}/10`],["Since Promo",`${form.lastPromotion} yr`],["Salary",form.salary],["Manager",`${form.managerRating}/10`],["Workload",`${form.workload}/10`],["Remote",form.remoteFlexibility],["Growth",`${form.growthOpportunity}/10`]].map(([k,v],i)=>(
            <div key={k} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 20px",borderBottom:i<6?`1px solid ${C.line}`:"none",borderRight:i%2===0?`1px solid ${C.line}`:"none"}}>
              <span style={{fontSize:11,color:C.inkLight}}>{k}</span>
              <span style={{fontSize:14,fontWeight:700,color:C.navy,fontFamily:SERIF}}>{v}</span>
            </div>
          ))}
        </div>
      </Card>

      <button onClick={reset} style={{width:"100%",padding:"13px",background:"transparent",border:`1.5px solid ${C.line}`,borderRadius:8,color:C.inkLight,fontSize:11,fontWeight:700,letterSpacing:"0.12em",textTransform:"uppercase",fontFamily:SANS,cursor:"pointer",transition:"all 150ms ease",outline:"none"}}
        onMouseEnter={e=>{e.currentTarget.style.borderColor=C.navy;e.currentTarget.style.color=C.navy;}}
        onMouseLeave={e=>{e.currentTarget.style.borderColor=C.line;e.currentTarget.style.color=C.inkLight;}}
        onMouseDown={e=>{e.currentTarget.style.transform="scale(0.98)";}}
        onMouseUp={e=>{e.currentTarget.style.transform="scale(1)";}}>
        ← Analyse Another Employee
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   BULK CSV VIEW
   ═══════════════════════════════════════════════ */
function BulkView() {
  const [stage, setStage]     = useState("upload"); // upload | dashboard
  const [stats, setStats]     = useState(null);
  const [fileName, setFileName] = useState("");
  const [dragging, setDragging] = useState(false);
  const [aiSummary, setAiSummary] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiDone, setAiDone]   = useState(false);
  const fileRef = useRef(null);

  const processFile = (file) => {
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const rows = parseCSV(e.target.result);
      const s = computeBulkStats(rows);
      setStats(s);
      setStage("dashboard");
    };
    reader.readAsText(file);
  };

  const onDrop = useCallback((e) => {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith(".csv")) processFile(file);
  }, []);

  const generateAI = async () => {
    if (!stats) return;
    setAiLoading(true); setAiDone(false); setAiSummary("");
    try {
      const res = await fetch("/api/claude",{
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          model:"claude-sonnet-4-20250514", max_tokens:1500,
          system:"You are a principal HR consultant preparing an executive briefing for a CHRO. Write a structured, decisive analysis in plain prose. Use NO markdown — no ##, no **, no *, no $, no bullet dashes. Use plain text section titles followed by a colon and a line break. Include: (1) Attrition Health Assessment with a severity rating, (2) Highest-Risk Profile description, (3) Three Immediate Interventions Required as numbered action items with rationale. Be authoritative, specific, and data-driven.",
          messages:[{role:"user",content:`HR Analytics Summary:
- Total employees: ${stats.total}
- Attrition rate: ${stats.rate.toFixed(1)}% (${stats.left} left)
- Avg monthly income: $${stats.avgIncome.toFixed(0)}
- Avg tenure: ${stats.avgTenure.toFixed(1)} years
- Attrition by dept: ${stats.byDept.map(d=>`${d.label} ${d.rate.toFixed(0)}%`).join(", ")}
- Attrition by age: ${stats.byAge.map(d=>`${d.label} ${d.rate.toFixed(0)}%`).join(", ")}
- Overtime attrition: ${stats.byOT[0].rate.toFixed(0)}% vs ${stats.byOT[1].rate.toFixed(0)}% (no OT)
- Early tenure (0-1y) attrition: ${stats.byTenure[0].rate.toFixed(0)}%
- Low salary (<$3k) attrition: ${stats.bySalary[0].rate.toFixed(0)}%
- Top risk factors: ${stats.factors.map(f=>`${f.label} ${f.rate.toFixed(0)}%`).join(", ")}`}],
        }),
      });
      const d=await res.json();
      const raw = d.content?.map(b=>b.text||"").join("")||"";
      // Strip any markdown that slips through — ##, **, *, $signs used as bullets
      const clean = raw
        .replace(/#{1,6}\s*/g, "")          // ## headers
        .replace(/\*\*([^*]+)\*\*/g, "$1")  // **bold**
        .replace(/\*([^*]+)\*/g, "$1")      // *italic*
        .replace(/^\s*[-–]\s/gm, "")        // - bullet dashes
        .replace(/\$(\d)/g, "$1")           // $1. $2. numbered items used as bullets
        .trim();
      setAiSummary(clean);
    } catch { setAiSummary("Connection failed. Verify your API configuration."); }
    setAiLoading(false); setAiDone(true);
  };

  /* Upload screen */
  if (stage==="upload") return (
    <div style={{maxWidth:760,margin:"0 auto",padding:"48px 24px 100px"}}>
      <div style={{marginBottom:44,animation:`fadeUp 500ms ${EASE} both`}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16}}>
          <div style={{height:1,width:32,background:C.copper}}/>
          <span style={{fontSize:9,fontWeight:700,letterSpacing:"0.22em",textTransform:"uppercase",color:C.copper}}>Workforce Analytics</span>
        </div>
        <h2 style={{margin:0,fontFamily:SERIF,fontWeight:700,fontSize:38,letterSpacing:"-1.5px",lineHeight:1.05,color:C.navy}}>
          Your next resignation<br/><span style={{fontStyle:"italic",color:C.copper}}>is already in the data.</span>
        </h2>
        <p style={{marginTop:14,fontSize:14,color:C.inkLight,lineHeight:1.75,maxWidth:520}}>
          Upload your IBM HR Analytics CSV to generate a full attrition dashboard with AI-powered executive insights.
        </p>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={e=>{e.preventDefault();setDragging(true);}}
        onDragLeave={()=>setDragging(false)}
        onDrop={onDrop}
        onClick={()=>fileRef.current?.click()}
        style={{
          border:`2px dashed ${dragging?C.copper:C.lineDark}`,
          borderRadius:12,
          padding:"72px 40px",
          textAlign:"center",
          cursor:"pointer",
          background:dragging?C.copperFaint:"white",
          transition:`all 200ms ease`,
          animation:`fadeUp 500ms ${EASE} 80ms both`,
        }}
      >
        <input ref={fileRef} type="file" accept=".csv" style={{display:"none"}} onChange={e=>processFile(e.target.files[0])}/>
        {/* Upload icon */}
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={dragging?C.copper:C.inkMute} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{margin:"0 auto 20px"}}>
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
          <polyline points="17 8 12 3 7 8"/>
          <line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
        <div style={{fontSize:16,fontWeight:700,color:dragging?C.copper:C.navy,fontFamily:SERIF,marginBottom:8}}>
          Drop your CSV here or click to upload
        </div>
        <div style={{fontSize:13,color:C.inkMute}}>Works with the IBM HR Analytics dataset (1,470 employees)</div>
      </div>

      {/* Expected columns */}
      <div style={{marginTop:16,padding:"16px 20px",background:C.copperFaint,border:`1px solid ${C.copper}30`,borderRadius:8,animation:`fadeUp 500ms ${EASE} 160ms both`}}>
        <div style={{fontSize:9,fontWeight:700,letterSpacing:"0.18em",textTransform:"uppercase",color:C.copper,marginBottom:8}}>Expected Columns</div>
        <div style={{fontSize:12,color:C.inkLight,lineHeight:1.7}}>
          Age · Attrition · Department · MonthlyIncome · JobSatisfaction · OverTime · YearsAtCompany · and 28 more standard IBM HR Analytics columns
        </div>
      </div>
    </div>
  );

  /* Dashboard */
  return (
    <div style={{maxWidth:1100,margin:"0 auto",padding:"48px 32px 100px",animation:`fadeUp 500ms ${EASE} both`}}>

      {/* Dashboard header */}
      <div style={{display:"flex",alignItems:"flex-end",justifyContent:"space-between",marginBottom:36,paddingBottom:24,borderBottom:`1px solid ${C.line}`}}>
        <div>
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14}}>
            <div style={{height:1,width:32,background:C.copper}}/>
            <span style={{fontSize:9,fontWeight:700,letterSpacing:"0.22em",textTransform:"uppercase",color:C.copper}}>Workforce Analytics</span>
          </div>
          <h2 style={{margin:0,fontFamily:SERIF,fontWeight:700,fontSize:34,letterSpacing:"-1.5px",lineHeight:1.05,color:C.navy}}>
            Attrition<br/><span style={{fontStyle:"italic",color:C.copper}}>Dashboard</span>
          </h2>
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{fontSize:10,color:C.inkMute,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:4}}>Dataset</div>
          <div style={{fontSize:13,fontWeight:700,color:C.navy}}>{fileName} · {stats.total} employees</div>
        </div>
      </div>

      {/* KPI cards */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:20}}>
        {[
          { label:"Attrition Rate", value:`${stats.rate.toFixed(1)}%`, sub:`${stats.left} employees left`, highlight:true, hColor:C.chartRisk },
          { label:"Total Employees", value:stats.total, sub:"in dataset" },
          { label:"Avg Monthly Income", value:`$${stats.avgIncome.toLocaleString("en",{maximumFractionDigits:0})}`, sub:"across workforce" },
          { label:"Avg Tenure", value:`${stats.avgTenure.toFixed(1)}y`, sub:"years at company" },
        ].map(({label,value,sub,highlight,hColor})=>(
          <div key={label} style={{background:"white",border:`1px solid ${highlight?hColor+"40":C.line}`,borderRadius:10,padding:"20px 22px",boxShadow:`0 1px 3px ${C.shadow}`,position:"relative",overflow:"hidden"}}>
            {highlight && <div style={{position:"absolute",left:0,top:0,bottom:0,width:3,background:hColor,borderRadius:"10px 0 0 10px"}}/>}
            <div style={{fontSize:9,fontWeight:700,letterSpacing:"0.16em",textTransform:"uppercase",color:highlight?hColor:C.inkMute,marginBottom:10}}>{label}</div>
            <div style={{fontSize:36,fontWeight:800,color:highlight?hColor:C.navy,fontFamily:SERIF,letterSpacing:"-2px",lineHeight:1}}>{value}</div>
            <div style={{fontSize:11,color:C.inkLight,marginTop:6}}>{sub}</div>
          </div>
        ))}
      </div>

      {/* Charts row 1 */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
        <Card>
          <CardHead label="Attrition Rate by Department"/>
          <HBar data={stats.byDept} color={C.chartNavy}/>
        </Card>
        <Card>
          <CardHead label="Attrition Rate by Age Group"/>
          <VBar data={stats.byAge} color={C.chartSlate}/>
        </Card>
      </div>

      {/* Charts row 2 */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
        <Card>
          <CardHead label="Salary Band vs Attrition"/>
          <VBar data={stats.bySalary} color={C.chartCopper}/>
        </Card>
        <Card>
          <CardHead label="Job Satisfaction vs Attrition"/>
          <VBar data={stats.bySat} color={C.chartCopper}/>
        </Card>
      </div>

      {/* Charts row 3 */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
        <Card>
          <CardHead label="Overtime vs Attrition"/>
          <HBar data={stats.byOT} color={C.chartTeal} maxVal={100}/>
        </Card>
        <Card>
          <CardHead label="Tenure vs Attrition"/>
          <LineChart data={stats.byTenure}/>
        </Card>
      </div>

      {/* Top risk factors */}
      <Card style={{marginBottom:12}}>
        <CardHead label="Top 5 Attrition Risk Factors"/>
        <div style={{padding:"20px 22px",display:"flex",flexDirection:"column",gap:14}}>
          {stats.factors.map(({label,rate})=>(
            <div key={label}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                <span style={{fontSize:13,fontWeight:600,color:C.ink}}>{label}</span>
                <span style={{fontSize:13,fontWeight:800,color:C.chartRisk}}>{rate.toFixed(1)}%</span>
              </div>
              <div style={{height:6,background:C.snowDeep,borderRadius:3,overflow:"hidden"}}>
                <div style={{height:"100%",width:`${rate}%`,background:C.chartRisk,borderRadius:3,transition:`width 900ms ${EASE} 300ms`}}/>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* AI Executive Summary */}
      <Card style={{marginBottom:20}}>
        <div style={{padding:"20px 24px",borderBottom:`1px solid ${C.line}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div>
            <div style={{fontSize:9,fontWeight:700,letterSpacing:"0.16em",textTransform:"uppercase",color:C.copper,marginBottom:4}}>AI-Generated</div>
            <div style={{fontSize:14,fontWeight:700,color:C.navy,fontFamily:SERIF}}>Executive Insights Summary</div>
          </div>
          {!aiDone && (
            <button onClick={generateAI} disabled={aiLoading} style={{padding:"10px 22px",borderRadius:6,background:aiLoading?C.inkMute:C.navy,border:"none",color:"white",fontSize:11,fontWeight:700,letterSpacing:"0.12em",textTransform:"uppercase",fontFamily:SANS,cursor:aiLoading?"not-allowed":"pointer",transition:`all 200ms ease`,outline:"none"}}
              onMouseDown={e=>{if(!aiLoading)e.currentTarget.style.transform="scale(0.97)";}}
              onMouseUp={e=>{e.currentTarget.style.transform="scale(1)";}}>
              {aiLoading?"Generating…":"Generate Insights →"}
            </button>
          )}
        </div>
        <div style={{padding:"28px 24px",minHeight:80}}>
          {!aiSummary && !aiLoading && (
            <p style={{margin:0,fontSize:13,color:C.inkMute,fontStyle:"italic"}}>Click "Generate Insights" above to receive an AI-powered executive summary of this workforce data.</p>
          )}
          {aiLoading && (
            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              {[90,76,84,0,68,80,0,72,60].map((w,i)=>w>0?<Shimmer key={i} w={`${w}%`} h={13}/>:<div key={i} style={{height:8}}/>)}
            </div>
          )}
          {aiSummary && (
            <div style={{fontSize:14,lineHeight:1.85,color:C.inkMid,fontFamily:SERIF,whiteSpace:"pre-wrap"}}>{aiSummary}</div>
          )}
        </div>
      </Card>

      <button onClick={()=>{setStage("upload");setStats(null);setAiSummary("");setAiDone(false);}} style={{padding:"12px 24px",borderRadius:6,border:`1.5px solid ${C.line}`,background:"white",color:C.inkLight,fontSize:11,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",fontFamily:SANS,cursor:"pointer",transition:"all 150ms ease",outline:"none"}}
        onMouseEnter={e=>{e.currentTarget.style.borderColor=C.navy;e.currentTarget.style.color=C.navy;}}
        onMouseLeave={e=>{e.currentTarget.style.borderColor=C.line;e.currentTarget.style.color=C.inkLight;}}
        onMouseDown={e=>{e.currentTarget.style.transform="scale(0.97)";}}
        onMouseUp={e=>{e.currentTarget.style.transform="scale(1)";}}>
        ← Upload New File
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   ROOT APP — tabs
   ═══════════════════════════════════════════════ */
export default function App() {
  const [tab, setTab] = useState("individual"); // individual | bulk

  const noise = (
    <div style={{position:"fixed",inset:0,zIndex:1,pointerEvents:"none",backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23n)' opacity='0.025'/%3E%3C/svg%3E")`,opacity:0.35}}/>
  );

  return (
    <div style={{minHeight:"100vh",background:C.snow,fontFamily:SANS,color:C.ink}}>
      {noise}

      {/* Header */}
      <header style={{position:"sticky",top:0,zIndex:200,background:"rgba(247,248,250,0.95)",backdropFilter:"blur(20px)",borderBottom:`1px solid ${C.line}`}}>
        <div style={{padding:"0 40px",height:64,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          {/* Logo */}
          <div style={{display:"flex",alignItems:"center",gap:14}}>
            <div style={{width:36,height:36,borderRadius:8,background:C.navy,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:`0 2px 8px ${C.shadowDeep}`}}>
              <span style={{fontSize:13,fontWeight:700,color:C.copper,fontFamily:SERIF}}>FR</span>
            </div>
            <div>
              <div style={{fontSize:14,fontWeight:700,color:C.navy,letterSpacing:"-0.02em",lineHeight:1}}>FlightRisk</div>
              <div style={{fontSize:9,color:C.inkMute,letterSpacing:"0.16em",textTransform:"uppercase",marginTop:2}}>Retention Intelligence</div>
            </div>
          </div>

          {/* Tabs */}
          <div style={{display:"flex",alignItems:"center",gap:2,background:C.snowDeep,borderRadius:8,padding:4,border:`1px solid ${C.line}`}}>
            {[["individual","Individual Assessment"],["bulk","Bulk CSV Analysis"]].map(([id,label])=>(
              <button key={id} onClick={()=>setTab(id)} style={{padding:"7px 18px",borderRadius:6,border:"none",background:tab===id?"white":"transparent",color:tab===id?C.navy:C.inkLight,fontSize:12,fontWeight:700,letterSpacing:"-0.01em",cursor:"pointer",fontFamily:SANS,boxShadow:tab===id?`0 1px 4px ${C.shadow}`:"none",transition:"all 150ms ease",outline:"none"}}>
                {label}
              </button>
            ))}
          </div>

          <div style={{width:160}}/>
        </div>
      </header>

      {/* Content */}
      <div style={{position:"relative",zIndex:2}}>
        {tab==="individual" ? <IndividualView/> : <BulkView/>}
      </div>

      <GlobalStyles/>
    </div>
  );
}

function GlobalStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
      *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
      html { -webkit-font-smoothing:antialiased; }
      ::selection { background:${C.navyGhost}; }
      @keyframes fadeUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
      @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
      input[type=number]{-moz-appearance:textfield}
      input[type=number]::-webkit-inner-spin-button,
      input[type=number]::-webkit-outer-spin-button{opacity:.2}
      @media(max-width:768px){
        header div[style*="gap:2px"]{display:none}
        main,div[style*="maxWidth:1100"]{padding:20px 16px 80px!important}
        div[style*="gridTemplateColumns:repeat(4"]{grid-template-columns:1fr 1fr!important}
        div[style*="gridTemplateColumns:1fr 1fr"]{grid-template-columns:1fr!important}
        h2{font-size:28px!important}
      }
    `}</style>
  );
}