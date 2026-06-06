import { useState, useEffect, useRef } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";
import Papa from "papaparse";

/* ── Tokens ── */
const C = {
  snow: "#F7F8FA", white: "#FFFFFF", snowDeep: "#EEF0F5",
  navy: "#0A1628", navyMid: "#142238", navyLight: "#1E3A5F", navyGhost: "#E8EDF5",
  copper: "#C4773A", copperLight: "#D9955A", copperPale: "#FDF0E6", copperFaint: "#FEFAF6",
  ink: "#0A1628", inkMid: "#2D3E56", inkLight: "#6B7A8F", inkMute: "#A8B4C2",
  line: "#E2E7EF", lineDark: "#C8D0DC",
  shadow: "rgba(10,22,40,0.06)", shadowDeep: "rgba(10,22,40,0.14)",
  safe: "#0F4C35", safePale: "#EBF5F0",
  warn: "#7A4A00", warnPale: "#FDF5E6",
  danger: "#7A1A1A", dangerPale: "#FDF0F0",
  chartNavy: "#0A1628", chartSlate: "#3D5A80",
  chartCopper: "#C4773A", chartTeal: "#1A5F5A", chartRisk: "#8B3A3A",
};
const SERIF = "'Libre Baskerville', Georgia, serif";
const SANS = "'Plus Jakarta Sans', system-ui, sans-serif";
const EASE = "cubic-bezier(0.23, 1, 0.32, 1)";

/* ══════════════════════════════════════
   INDIVIDUAL — score logic
══════════════════════════════════════ */
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

/* ══════════════════════════════════════
   BULK — CSV parsing
══════════════════════════════════════ */
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
Write 4 paragraphs: (1) overall attrition health vs 15% benchmark, (2) highest-risk employee profile with specifics, (3) top 3 actionable recommendations, (4) one counterintuitive finding. Use specific numbers. No fluff.`;
}

/* ══════════════════════════════════════
   SHARED UI COMPONENTS
══════════════════════════════════════ */
function Card({ children, style={} }) {
  return (
    <div style={{ background:C.white, border:`1px solid ${C.line}`, borderRadius:10, boxShadow:`0 1px 3px ${C.shadow}`, overflow:"hidden", position:"relative", ...style }}>
      <div style={{ position:"absolute", top:0, left:0, right:0, height:2, background:`linear-gradient(90deg, transparent, ${C.copper}80, transparent)` }}/>
      {children}
    </div>
  );
}

function CardHead({ label }) {
  return <div style={{ padding:"13px 22px", borderBottom:`1px solid ${C.line}`, background:C.snow }}><span style={{ fontSize:9, fontWeight:700, letterSpacing:"0.18em", textTransform:"uppercase", color:C.copper }}>{label}</span></div>;
}

function Shimmer({ w="100%", h=14 }) {
  return <div style={{ width:w, height:h, borderRadius:4, background:`linear-gradient(90deg,${C.snowDeep} 25%,${C.line} 50%,${C.snowDeep} 75%)`, backgroundSize:"400% 100%", animation:"shimmer 1.5s ease-in-out infinite" }}/>;
}

const ChartTT = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return <div style={{ background:C.white, border:`1px solid ${C.line}`, borderRadius:6, padding:"10px 14px", fontSize:12, fontFamily:SANS, boxShadow:`0 4px 12px ${C.shadow}` }}><p style={{ margin:"0 0 4px", color:C.inkLight, fontSize:11 }}>{label}</p>{payload.map((p,i)=><p key={i} style={{ margin:0, color:C.copper, fontWeight:700 }}>{p.value}%</p>)}</div>;
};

function ChartCard({ title, children }) {
  return (
    <Card>
      <CardHead label={title}/>
      <div style={{ padding:"20px 22px 16px" }}>{children}</div>
    </Card>
  );
}

/* ══════════════════════════════════════
   WATCH GAUGE
══════════════════════════════════════ */
function WatchGauge({ value, size=260, animate=false }) {
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
  const nDeg=startDeg+sweep*pct2, nTip=pt(R*0.80,nDeg), nL=pt(7,nDeg+90), nR=pt(7,nDeg-90);
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
      {pct2>0 && <path d={arc(R,startDeg,valEnd)} fill="none" stroke={rv.color} strokeWidth={5} strokeLinecap="round" opacity={0.9}/>}
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

/* ══════════════════════════════════════
   INDIVIDUAL FORM FIELDS
══════════════════════════════════════ */
function FieldLabel({ label, sub }) {
  return <div style={{marginBottom:10}}><div style={{fontSize:11,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",color:C.inkLight}}>{label}</div><div style={{fontSize:11,color:C.inkMute,marginTop:3}}>{sub}</div></div>;
}

function RangeInput({ field, value, onChange }) {
  const pct2=((value-field.min)/(field.max-field.min))*100;
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
        <div style={{position:"absolute",left:0,top:0,height:"100%",width:`${pct2}%`,background:C.navy,borderRadius:1,transition:`width 80ms ${EASE}`}}/>
        <div style={{position:"absolute",top:"50%",left:`${pct2}%`,transform:"translate(-50%,-50%)",width:16,height:16,borderRadius:"50%",background:C.white,border:`2px solid ${C.navy}`,boxShadow:`0 2px 8px ${C.shadowDeep}`,pointerEvents:"none"}}/>
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
  const [focused,setFocused]=useState(false);
  return (
    <div>
      <FieldLabel label={field.label} sub={field.sub}/>
      <div style={{display:"flex",alignItems:"center",overflow:"hidden",border:`1.5px solid ${focused?C.navy:C.line}`,borderRadius:8,background:C.white,boxShadow:focused?`0 0 0 3px ${C.navyGhost}`:"none",transition:"all 150ms ease"}}>
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
          return <button key={opt} onClick={()=>onChange(opt)} style={{flex:1,padding:"12px 8px",border:`1.5px solid ${active?C.navy:C.line}`,borderRadius:8,background:active?C.navy:C.white,color:active?C.white:C.inkLight,fontSize:12,fontWeight:600,fontFamily:SANS,cursor:"pointer",outline:"none",transition:"all 150ms ease"}} onMouseDown={e=>{e.currentTarget.style.transform="scale(0.97)"}} onMouseUp={e=>{e.currentTarget.style.transform="scale(1)"}} onMouseLeave={e=>{e.currentTarget.style.transform="scale(1)"}}>{opt}</button>;
        })}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════
   INDIVIDUAL VIEW
══════════════════════════════════════ */
function IndividualView() {
  const [form,setForm]=useState(IND_DEFAULT);
  const [step,setStep]=useState(0);
  const [loading,setLoading]=useState(false);
  const [insight,setInsight]=useState("");
  const [final,setFinal]=useState(null);
  const set=(k,v)=>setForm(p=>({...p,[k]:v}));
  const live=computeIndScore(form), liveR=getRisk(live);

  const analyze = async () => {
    const s=computeIndScore(form), r=getRisk(s);
    setFinal({s,r}); setStep(1); setLoading(true); setInsight("");
    try {
      const res = await fetch("/api/v1/messages", {
        method:"POST",
        headers:{ "Content-Type":"application/json", "x-api-key":process.env.REACT_APP_API_KEY, "anthropic-version":"2023-06-01", "anthropic-dangerous-direct-browser-access":"true" },
        body:JSON.stringify({ model:"claude-sonnet-4-5", max_tokens:1000, messages:[{ role:"user", content:`You are a principal HR strategist. Write exactly 3 sentences in plain prose — no markdown, no bullet points. First: the single dominant attrition driver. Second: one leading indicator to track in 30 days. Third: one high-leverage retention action to deploy this week. Tenure ${form.tenure}y | Satisfaction ${form.satisfaction}/10 | Since promo ${form.lastPromotion}y | Salary: ${form.salary} | Manager ${form.managerRating}/10 | Workload ${form.workload}/10 | Remote: ${form.remoteFlexibility} | Growth ${form.growthOpportunity}/10 | Score: ${s}/100 (${r.word})` }] }),
      });
      const d=await res.json();
      setInsight(d.content?.map(b=>b.text||"").join("")||"Analysis unavailable.");
    } catch { setInsight("Failed to generate insights. Please try again."); }
    setLoading(false);
  };

  const reset=()=>{ setStep(0); setFinal(null); setInsight(""); setForm(IND_DEFAULT); };

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
        <p style={{marginTop:14,fontSize:14,color:C.inkLight,lineHeight:1.75,maxWidth:500}}>Complete the profile below to receive an AI-powered retention analysis with targeted recommendations.</p>
      </div>

      <div style={{display:"flex",flexDirection:"column",gap:4}}>
        {IND_FIELDS.map((field,i)=>(
          <div key={field.key} style={{background:C.white,border:`1px solid ${C.line}`,borderRadius:10,padding:"22px 24px",boxShadow:`0 1px 3px ${C.shadow}`,animation:`fadeUp 500ms ${EASE} ${i*40}ms both`,position:"relative",overflow:"hidden"}}>
            {field.type==="range" && <div style={{position:"absolute",left:0,top:0,bottom:0,width:3,background:C.copper,borderRadius:"10px 0 0 10px"}}/>}
            {field.type==="range"  && <RangeInput  field={field} value={form[field.key]} onChange={v=>set(field.key,v)}/>}
            {field.type==="number" && <NumberInput field={field} value={form[field.key]} onChange={v=>set(field.key,v)}/>}
            {field.type==="select" && <SelectInput field={field} value={form[field.key]} onChange={v=>set(field.key,v)}/>}
          </div>
        ))}
      </div>

      <div style={{marginTop:12,display:"flex",alignItems:"center",gap:14,padding:"14px 20px",background:C.white,border:`1px solid ${C.line}`,borderRadius:8,animation:`fadeUp 500ms ${EASE} 340ms both`}}>
        <span style={{fontSize:11,color:C.inkMute,whiteSpace:"nowrap"}}>Live preview</span>
        <div style={{flex:1,height:3,background:C.snowDeep,borderRadius:2,overflow:"hidden"}}>
          <div style={{height:"100%",width:`${live}%`,background:liveR.color,borderRadius:2,transition:`width 220ms ${EASE},background 220ms ease`}}/>
        </div>
        <span style={{fontSize:12,fontWeight:700,color:liveR.color,minWidth:90,textAlign:"right"}}>{liveR.word} Risk</span>
      </div>

      <button onClick={analyze} style={{marginTop:10,width:"100%",padding:"16px",borderRadius:8,background:C.navy,border:"none",color:C.white,fontSize:12,fontWeight:700,letterSpacing:"0.16em",textTransform:"uppercase",fontFamily:SANS,cursor:"pointer",boxShadow:`0 4px 20px rgba(10,22,40,0.3)`,transition:`all 200ms ${EASE}`,outline:"none",animation:`fadeUp 500ms ${EASE} 380ms both`}}
        onMouseEnter={e=>{e.currentTarget.style.background=C.navyMid;e.currentTarget.style.transform="translateY(-2px)";}}
        onMouseLeave={e=>{e.currentTarget.style.background=C.navy;e.currentTarget.style.transform="translateY(0)";}}
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

      <Card style={{marginBottom:12}}>
        <div style={{padding:"20px 24px",borderBottom:`1px solid ${C.line}`,display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:38,height:38,borderRadius:8,background:C.navy,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
            <span style={{fontSize:13,color:C.copper,fontFamily:SERIF,fontWeight:700}}>AI</span>
          </div>
          <div>
            <div style={{fontSize:13,fontWeight:700,color:C.navy}}>Principal Analysis</div>
            <div style={{fontSize:10,color:C.inkMute,letterSpacing:"0.06em",textTransform:"uppercase",marginTop:2}}>Claude AI · Confidential</div>
          </div>
        </div>
        <div style={{padding:"24px",minHeight:80}}>
          {loading ? <div style={{display:"flex",flexDirection:"column",gap:12}}>{[96,82,90,0,76,88].map((w,i)=>w>0?<Shimmer key={i} w={`${w}%`} h={14}/>:<div key={i} style={{height:6}}/>)}</div>
          : <p style={{margin:0,fontSize:16,lineHeight:1.85,color:C.inkMid,fontFamily:SERIF}}>{insight}</p>}
        </div>
      </Card>

      <Card style={{marginBottom:12}}>
        <CardHead label="Signal Breakdown"/>
        <div style={{padding:"20px 22px",display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
          {[{label:"Satisfaction",val:form.satisfaction,invert:false},{label:"Growth",val:form.growthOpportunity,invert:false},{label:"Manager",val:form.managerRating,invert:false},{label:"Workload",val:form.workload,invert:true}].map(({label,val,invert})=>{
            const isRisk=invert?val>=7:val<=4, col=isRisk?C.danger:C.navyLight;
            return <div key={label}><div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><span style={{fontSize:11,color:C.inkLight}}>{label}</span><span style={{fontSize:14,fontWeight:700,color:col,fontFamily:SERIF}}>{val}<span style={{fontSize:10,color:C.inkMute}}>/10</span></span></div><div style={{height:2,background:C.line,borderRadius:1,overflow:"hidden"}}><div style={{height:"100%",width:`${val*10}%`,background:col,borderRadius:1,transition:`width 1s ${EASE} 400ms`}}/></div></div>;
          })}
        </div>
      </Card>

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

/* ══════════════════════════════════════
   BULK CSV VIEW
══════════════════════════════════════ */
function BulkView() {
  const [stats,setStats]=useState(null);
  const [insight,setInsight]=useState("");
  const [insightLoading,setInsightLoading]=useState(false);
  const [dragging,setDragging]=useState(false);
  const [filename,setFilename]=useState("");

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
      const d=await res.json();
      setInsight(d.content?.map(b=>b.text||"").join("")||"");
    } catch { setInsight("Failed to generate insights. Please try again."); }
    setInsightLoading(false);
  }

  const riskColor=(rate)=>rate>30?C.chartRisk:rate>20?C.warn:C.safe;

  if (!stats) return (
    <div style={{maxWidth:760,margin:"0 auto",padding:"48px 24px 100px"}}>
      <div style={{marginBottom:44,animation:`fadeUp 500ms ${EASE} both`}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16}}>
          <div style={{height:1,width:32,background:C.copper}}/>
          <span style={{fontSize:9,fontWeight:700,letterSpacing:"0.22em",textTransform:"uppercase",color:C.copper}}>Workforce Analytics</span>
        </div>
        <h2 style={{margin:0,fontFamily:SERIF,fontWeight:700,fontSize:38,letterSpacing:"-1.5px",lineHeight:1.05,color:C.navy}}>
          Your next resignation<br/><span style={{fontStyle:"italic",color:C.copper}}>is already in the data.</span>
        </h2>
        <p style={{marginTop:14,fontSize:14,color:C.inkLight,lineHeight:1.75,maxWidth:520}}>Upload your IBM HR Analytics CSV to generate a full attrition dashboard with AI-powered executive insights.</p>
      </div>

      <div onDragOver={e=>{e.preventDefault();setDragging(true);}} onDragLeave={()=>setDragging(false)}
        onDrop={e=>{e.preventDefault();setDragging(false);const f=e.dataTransfer.files[0];if(f)processFile(f);}}
        onClick={()=>document.getElementById("csv-upload").click()}
        style={{border:`2px dashed ${dragging?C.copper:C.lineDark}`,borderRadius:12,padding:"72px 40px",textAlign:"center",cursor:"pointer",background:dragging?C.copperFaint:C.white,transition:"all 200ms ease",animation:`fadeUp 500ms ${EASE} 80ms both`}}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={dragging?C.copper:C.inkMute} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{margin:"0 auto 20px",display:"block"}}>
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
        <div style={{fontSize:16,fontWeight:700,color:dragging?C.copper:C.navy,fontFamily:SERIF,marginBottom:8}}>Drop your CSV here or click to upload</div>
        <div style={{fontSize:13,color:C.inkMute}}>Works with the IBM HR Analytics dataset (1,470 employees)</div>
        <input id="csv-upload" type="file" accept=".csv" style={{display:"none"}} onChange={e=>e.target.files[0]&&processFile(e.target.files[0])}/>
      </div>

      <div style={{marginTop:16,padding:"16px 20px",background:C.copperFaint,border:`1px solid ${C.copper}30`,borderRadius:8,animation:`fadeUp 500ms ${EASE} 160ms both`}}>
        <div style={{fontSize:9,fontWeight:700,letterSpacing:"0.18em",textTransform:"uppercase",color:C.copper,marginBottom:8}}>Expected Columns</div>
        <div style={{fontSize:12,color:C.inkLight,lineHeight:1.7}}>Age · Attrition · Department · MonthlyIncome · JobSatisfaction · OverTime · YearsAtCompany · and 28 more standard IBM HR Analytics columns</div>
      </div>
    </div>
  );

  return (
    <div style={{maxWidth:1100,margin:"0 auto",padding:"48px 32px 100px",animation:`fadeUp 500ms ${EASE} both`}}>
      <div style={{display:"flex",alignItems:"flex-end",justifyContent:"space-between",marginBottom:36,paddingBottom:24,borderBottom:`1px solid ${C.line}`}}>
        <div>
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14}}>
            <div style={{height:1,width:32,background:C.copper}}/>
            <span style={{fontSize:9,fontWeight:700,letterSpacing:"0.22em",textTransform:"uppercase",color:C.copper}}>Workforce Analytics</span>
          </div>
          <h2 style={{margin:0,fontFamily:SERIF,fontWeight:700,fontSize:34,letterSpacing:"-1.5px",color:C.navy}}>
            Attrition <span style={{fontStyle:"italic",color:C.copper}}>Dashboard</span>
          </h2>
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{fontSize:10,color:C.inkMute,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:4}}>Dataset</div>
          <div style={{fontSize:13,fontWeight:700,color:C.navy}}>{filename} · {stats.total} employees</div>
        </div>
      </div>

      {/* KPIs */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:20}}>
        {[
          {label:"Attrition Rate",value:`${stats.rate}%`,sub:`${stats.left} employees left`,hColor:C.chartRisk,highlight:true},
          {label:"Total Employees",value:stats.total,sub:"in dataset"},
          {label:"Avg Monthly Income",value:`$${(+stats.avgSalary).toLocaleString()}`,sub:"across workforce"},
          {label:"Avg Tenure",value:`${stats.avgTenure}y`,sub:"years at company"},
        ].map(({label,value,sub,highlight,hColor})=>(
          <div key={label} style={{background:C.white,border:`1px solid ${highlight?hColor+"40":C.line}`,borderRadius:10,padding:"20px 22px",boxShadow:`0 1px 3px ${C.shadow}`,position:"relative",overflow:"hidden"}}>
            {highlight&&<div style={{position:"absolute",left:0,top:0,bottom:0,width:3,background:hColor,borderRadius:"10px 0 0 10px"}}/>}
            <div style={{fontSize:9,fontWeight:700,letterSpacing:"0.16em",textTransform:"uppercase",color:highlight?hColor:C.inkMute,marginBottom:10}}>{label}</div>
            <div style={{fontSize:36,fontWeight:800,color:highlight?hColor:C.navy,fontFamily:SERIF,letterSpacing:"-2px",lineHeight:1}}>{value}</div>
            <div style={{fontSize:11,color:C.inkLight,marginTop:6}}>{sub}</div>
          </div>
        ))}
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
        <ChartCard title="Attrition Rate by Department">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={stats.deptData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke={C.line}/>
              <XAxis type="number" tick={{fill:C.inkMute,fontSize:11,fontFamily:SANS}} unit="%"/>
              <YAxis type="category" dataKey="dept" tick={{fill:C.inkMid,fontSize:11,fontFamily:SANS}} width={90}/>
              <Tooltip content={<ChartTT/>}/>
              <Bar dataKey="rate" fill={C.chartNavy} radius={[0,4,4,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Attrition Rate by Age Group">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={stats.ageData}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.line}/>
              <XAxis dataKey="age" tick={{fill:C.inkMute,fontSize:11,fontFamily:SANS}}/>
              <YAxis tick={{fill:C.inkMute,fontSize:11,fontFamily:SANS}} unit="%"/>
              <Tooltip content={<ChartTT/>}/>
              <Bar dataKey="rate" fill={C.chartSlate} radius={[4,4,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
        <ChartCard title="Salary Band vs Attrition">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={stats.salaryData}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.line}/>
              <XAxis dataKey="band" tick={{fill:C.inkMute,fontSize:11,fontFamily:SANS}}/>
              <YAxis tick={{fill:C.inkMute,fontSize:11,fontFamily:SANS}} unit="%"/>
              <Tooltip content={<ChartTT/>}/>
              <Bar dataKey="rate" fill={C.chartCopper} radius={[4,4,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Job Satisfaction vs Attrition">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={stats.satisfactionData}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.line}/>
              <XAxis dataKey="score" tick={{fill:C.inkMute,fontSize:11,fontFamily:SANS}}/>
              <YAxis tick={{fill:C.inkMute,fontSize:11,fontFamily:SANS}} unit="%"/>
              <Tooltip content={<ChartTT/>}/>
              <Bar dataKey="rate" fill={C.chartCopper} radius={[4,4,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
        <ChartCard title="Overtime vs Attrition">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={stats.overtimeData}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.line}/>
              <XAxis dataKey="label" tick={{fill:C.inkMute,fontSize:11,fontFamily:SANS}}/>
              <YAxis tick={{fill:C.inkMute,fontSize:11,fontFamily:SANS}} unit="%"/>
              <Tooltip content={<ChartTT/>}/>
              <Bar dataKey="rate" fill={C.chartTeal} radius={[4,4,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Tenure vs Attrition">
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={stats.tenureData}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.line}/>
              <XAxis dataKey="tenure" tick={{fill:C.inkMute,fontSize:11,fontFamily:SANS}}/>
              <YAxis tick={{fill:C.inkMute,fontSize:11,fontFamily:SANS}} unit="%"/>
              <Tooltip content={<ChartTT/>}/>
              <Line type="monotone" dataKey="rate" stroke={C.chartTeal} strokeWidth={2} dot={{fill:C.chartTeal,r:4}}/>
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <Card style={{marginBottom:12}}>
        <CardHead label="Top 5 Attrition Risk Factors"/>
        <div style={{padding:"20px 22px",display:"flex",flexDirection:"column",gap:16}}>
          {stats.riskFactors.map((r,i)=>(
            <div key={i}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                <span style={{fontSize:14,color:C.ink,fontWeight:500}}>{r.factor}</span>
                <span style={{fontSize:14,fontWeight:700,color:riskColor(r.rate),fontFamily:SERIF}}>{r.rate}%</span>
              </div>
              <div style={{background:C.line,borderRadius:4,height:6}}>
                <div style={{width:`${Math.min(r.rate,100)}%`,height:"100%",background:riskColor(r.rate),borderRadius:4,transition:`width 800ms ${EASE} 200ms`}}/>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card style={{marginBottom:16}}>
        <div style={{padding:"20px 24px",borderBottom:`1px solid ${C.line}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div>
            <div style={{fontSize:9,fontWeight:700,letterSpacing:"0.16em",textTransform:"uppercase",color:C.copper,marginBottom:4}}>AI-Generated</div>
            <div style={{fontSize:16,fontWeight:700,color:C.navy,fontFamily:SERIF}}>Executive Insights Summary</div>
          </div>
          <button onClick={generateInsight} disabled={insightLoading} style={{padding:"10px 22px",borderRadius:6,background:insightLoading?C.inkMute:C.navy,border:"none",color:C.white,fontSize:11,fontWeight:700,letterSpacing:"0.12em",textTransform:"uppercase",fontFamily:SANS,cursor:insightLoading?"not-allowed":"pointer",transition:`all 200ms ease`,outline:"none"}}
            onMouseDown={e=>{if(!insightLoading)e.currentTarget.style.transform="scale(0.97)";}}
            onMouseUp={e=>{e.currentTarget.style.transform="scale(1)";}}>
            {insightLoading?"Generating…":insight?"Regenerate":"Generate Insights →"}
          </button>
        </div>
        <div style={{padding:"28px 24px",minHeight:80}}>
          {!insight&&!insightLoading&&<p style={{margin:0,fontSize:13,color:C.inkMute,fontStyle:"italic"}}>Click "Generate Insights" above to receive an AI-powered executive summary.</p>}
          {insightLoading&&<div style={{display:"flex",flexDirection:"column",gap:14}}>{[90,76,84,0,68,80].map((w,i)=>w>0?<Shimmer key={i} w={`${w}%`} h={13}/>:<div key={i} style={{height:8}}/>)}</div>}
          {insight&&!insightLoading&&<div style={{fontSize:15,lineHeight:1.85,color:C.inkMid,fontFamily:SERIF,whiteSpace:"pre-wrap"}}>{insight}</div>}
        </div>
      </Card>

      <button onClick={()=>{setStats(null);setInsight("");setFilename("");}} style={{padding:"12px 24px",borderRadius:6,border:`1.5px solid ${C.line}`,background:C.white,color:C.inkLight,fontSize:11,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",fontFamily:SANS,cursor:"pointer",transition:"all 150ms ease",outline:"none"}}
        onMouseEnter={e=>{e.currentTarget.style.borderColor=C.navy;e.currentTarget.style.color=C.navy;}}
        onMouseLeave={e=>{e.currentTarget.style.borderColor=C.line;e.currentTarget.style.color=C.inkLight;}}>
        ← Upload New File
      </button>
    </div>
  );
}

/* ══════════════════════════════════════
   ROOT APP
══════════════════════════════════════ */
export default function FlightRisk() {
  const [tab,setTab]=useState("individual");
  return (
    <div style={{minHeight:"100vh",background:C.snow,fontFamily:SANS,color:C.ink}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
        html{-webkit-font-smoothing:antialiased;}
        @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        @keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
        input[type=number]{-moz-appearance:textfield}
        input[type=number]::-webkit-inner-spin-button,input[type=number]::-webkit-outer-spin-button{opacity:.2}
        button:hover{opacity:0.88}
      `}</style>

      {/* Header */}
      <header style={{position:"sticky",top:0,zIndex:200,background:"rgba(247,248,250,0.95)",backdropFilter:"blur(20px)",borderBottom:`1px solid ${C.line}`}}>
        <div style={{padding:"0 40px",height:64,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{display:"flex",alignItems:"center",gap:14}}>
            <div style={{width:36,height:36,borderRadius:8,background:C.navy,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:`0 2px 8px ${C.shadowDeep}`}}>
              <span style={{fontSize:13,fontWeight:700,color:C.copper,fontFamily:SERIF}}>FR</span>
            </div>
            <div>
              <div style={{fontSize:14,fontWeight:700,color:C.navy,letterSpacing:"-0.02em",lineHeight:1}}>FlightRisk</div>
              <div style={{fontSize:9,color:C.inkMute,letterSpacing:"0.16em",textTransform:"uppercase",marginTop:2}}>Retention Intelligence · by Divyah</div>
            </div>
          </div>

          <div style={{display:"flex",alignItems:"center",gap:2,background:C.snowDeep,borderRadius:8,padding:4,border:`1px solid ${C.line}`}}>
            {[["individual","Individual Assessment"],["bulk","Bulk CSV Analysis"]].map(([id,label])=>(
              <button key={id} onClick={()=>setTab(id)} style={{padding:"7px 18px",borderRadius:6,border:"none",background:tab===id?C.white:"transparent",color:tab===id?C.navy:C.inkLight,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:SANS,boxShadow:tab===id?`0 1px 4px ${C.shadow}`:"none",transition:`all 150ms ease`,outline:"none"}}
                onMouseDown={e=>{e.currentTarget.style.transform="scale(0.97)"}}
                onMouseUp={e=>{e.currentTarget.style.transform="scale(1)"}}>
                {label}
              </button>
            ))}
          </div>

          <div style={{width:160}}/>
        </div>
      </header>

      <div style={{position:"relative",zIndex:2}}>
        {tab==="individual" ? <IndividualView/> : <BulkView/>}
      </div>
    </div>
  );
}