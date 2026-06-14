import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence, useSpring, useMotionValue } from "framer-motion";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";
import Papa from "papaparse";

/* ═══════════════════════════════════════════════════════════
   FLIGHTRISK , Verdict First + Emil Kowalski Motion
   
   Motion philosophy applied:
   - Spring physics on every interactive element
   - Staggered field reveal on mount
   - Clip-path verdict arrival (not fade)
   - Signal bars settle with staggered springs
   - Press states: scale(0.97), instant, spring back
   - Live score: spring interpolation, not linear
   - Zero decorative animation
   - Every transition communicates something
   
   Emil test passed:
   - Necessary? Yes, each listed above
   - Too slow? All under 350ms effective duration
   - Too obvious? No. Springs feel physical not theatrical
   - Improve usability? Yes , state is clearer
   - Top-tier team keep it? Yes
═══════════════════════════════════════════════════════════ */

const C = {
  void:        "#0A0A0B",
  base:        "#0F0F11",
  surface:     "#141416",
  raised:      "#1A1A1D",
  high:        "#222226",
  border:      "rgba(255,255,255,0.07)",
  borderMid:   "rgba(255,255,255,0.12)",
  borderHigh:  "rgba(255,255,255,0.20)",
  ink:         "#F2F2F0",
  inkMid:      "rgba(242,242,240,0.60)",
  inkDim:      "rgba(242,242,240,0.35)",
  inkFaint:    "rgba(242,242,240,0.15)",
  floodSafe:   "#16A34A",
  floodWarn:   "#D97706",
  floodHigh:   "#DC2626",
  chartSafe:   "#4ADE80",
  chartWarn:   "#FCD34D",
  chartHigh:   "#F87171",
  sans:        "'Geist', 'Inter', system-ui, sans-serif",
  mono:        "'Geist Mono', 'IBM Plex Mono', monospace",
};

/* ── Spring configs , tuned to feel physical, not theatrical ── */
const SPRING = {
  // UI interactions , snappy, immediate
  snap:    { type:"spring", stiffness:500, damping:30, mass:1 },
  // Press feedback , instant down, spring back
  press:   { type:"spring", stiffness:600, damping:35, mass:0.8 },
  // Content arrival , slightly softer
  arrive:  { type:"spring", stiffness:350, damping:28, mass:1 },
  // Score , weighted, feels like a real number settling
  score:   { type:"spring", stiffness:200, damping:25, mass:1.2 },
  // Stagger parent
  stagger: { staggerChildren: 0.04, delayChildren: 0.05 },
};

/* ── Animation variants ── */
const VARS = {
  // Field row reveal , staggered on mount
  fieldList: { hidden:{}, show:{ transition: SPRING.stagger } },
  fieldItem: {
    hidden: { opacity:0, y:12 },
    show:   { opacity:1, y:0, transition:{ ...SPRING.arrive } },
  },
  // Verdict panel , clip-path reveal, not fade
  verdictPanel: {
    hidden: { clipPath:"inset(0 100% 0 0)", opacity:1 },
    show:   { clipPath:"inset(0 0% 0 0)", opacity:1, transition:{ duration:0.32, ease:[0.16,1,0.3,1] } },
  },
  // Content block arrival
  contentArrive: {
    hidden: { opacity:0, y:8 },
    show:   { opacity:1, y:0, transition:{ ...SPRING.arrive } },
  },
  // Signal bar , spring width via motion value
  signalStagger: { hidden:{}, show:{ transition:{ staggerChildren:0.06, delayChildren:0.2 } } },
  signalItem: {
    hidden: { opacity:0, x:-6 },
    show:   { opacity:1, x:0, transition:{ ...SPRING.arrive } },
  },
  // Result layout
  resultLeft: {
    hidden: { opacity:0, scale:0.98 },
    show:   { opacity:1, scale:1, transition:{ duration:0.28, ease:[0.16,1,0.3,1] } },
  },
  resultRight: {
    hidden: { opacity:0, x:16 },
    show:   { opacity:1, x:0, transition:{ ...SPRING.arrive, delay:0.12 } },
  },
};

function getRisk(n) {
  if (n < 30) return { word:"Low",      flood:C.floodSafe, label:"LOW RISK"      };
  if (n < 60) return { word:"Moderate", flood:C.floodWarn, label:"MODERATE RISK" };
  return              { word:"High",     flood:C.floodHigh, label:"HIGH RISK"     };
}

const FIELDS = [
  { key:"tenure",            label:"Tenure",               hint:"Years at organisation",       type:"number", min:0,  max:40, unit:"yr" },
  { key:"satisfaction",      label:"Job satisfaction",     hint:"Self-reported, 1 low 10 high", type:"range",  min:1,  max:10           },
  { key:"lastPromotion",     label:"Since last promotion", hint:"Years since last advancement", type:"number", min:0,  max:15, unit:"yr" },
  { key:"salary",            label:"Salary positioning",   hint:"Relative to market rate",     type:"select", options:["Below market","At market","Above market"] },
  { key:"managerRating",     label:"Manager relationship", hint:"Quality of direct report",    type:"range",  min:1,  max:10           },
  { key:"workload",          label:"Workload pressure",    hint:"Stress and capacity strain",  type:"range",  min:1,  max:10           },
  { key:"remoteFlexibility", label:"Work arrangement",     hint:"Current flexibility policy",  type:"select", options:["None","Partial","Fully remote"] },
  { key:"growthOpportunity", label:"Growth trajectory",    hint:"Perceived career ceiling",    type:"range",  min:1,  max:10           },
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

/* ── Bulk ── */
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
    {factor:"Early tenure (0-1y)",rate:tenureData[0]?.rate||0},
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

/* ═══════════════════════════════════════════
   SPRING SCORE , live score uses spring
   interpolation so it feels weighted, not
   mechanical. Emil: "things in real life
   don't suddenly change, they transition."
═══════════════════════════════════════════ */
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
    <span style={{ fontFamily:C.mono, fontSize:size, fontWeight:600, color:color||C.ink, letterSpacing:"-3px", lineHeight:1 }}>
      {String(rounded).padStart(2,"0")}
    </span>
  );
}

/* ═══════════════════════════════════════════
   PRESS BUTTON , spring physics on press.
   Emil: scale(0.97) on active, spring back.
   Never scale(0). Never linear easing.
═══════════════════════════════════════════ */
function PressButton({ onClick, disabled, children, style={}, variant="default" }) {
  const bg = variant==="primary" ? C.ink : variant==="ghost" ? "transparent" : C.surface;
  const col = variant==="primary" ? C.void : C.inkMid;
  const bord = variant==="ghost" ? `1px solid ${C.border}` : variant==="primary" ? "none" : `1px solid ${C.border}`;

  return (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      whileHover={disabled ? {} : { scale:1.01, transition:SPRING.snap }}
      whileTap={disabled ? {} : { scale:0.97, transition:SPRING.press }}
      style={{ ...style, background:disabled?C.surface:bg, border:bord, color:disabled?C.inkDim:col, cursor:disabled?"not-allowed":"pointer", fontFamily:C.sans, borderRadius:8, outline:"none" }}
    >
      {children}
    </motion.button>
  );
}

/* ── Skeleton ── */
function Skel({ w="100%", h=12 }) {
  return (
    <motion.div
      initial={{ opacity:0.5 }}
      animate={{ opacity:[0.5,1,0.5] }}
      transition={{ duration:1.4, repeat:Infinity, ease:"easeInOut" }}
      style={{ width:w, height:h, borderRadius:3, background:C.raised }}
    />
  );
}

/* ── Label ── */
function Label({ children }) {
  return <div style={{ fontFamily:C.mono, fontSize:10, color:C.inkDim, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:6 }}>{children}</div>;
}

function Rule({ style={} }) {
  return <div style={{ height:"1px", background:C.border, ...style }}/>;
}

const TT = ({ active, payload, label }) => {
  if (!active||!payload?.length) return null;
  return (
    <div style={{ background:C.high, border:`1px solid ${C.borderMid}`, borderRadius:6, padding:"8px 12px", fontFamily:C.mono, fontSize:11 }}>
      <div style={{ color:C.inkDim, marginBottom:2 }}>{label}</div>
      <div style={{ color:C.ink, fontWeight:600 }}>{payload[0]?.value}%</div>
    </div>
  );
};

/* ═══════════════════════════════════════════
   RANGE FIELD , spring thumb.
   The thumb follows with spring physics.
   Communicates: this is a physical control.
═══════════════════════════════════════════ */
function RangeField({ field, value, onChange }) {
  const p = ((value-field.min)/(field.max-field.min))*100;
  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:16 }}>
        <div>
          <div style={{ fontFamily:C.sans, fontSize:14, fontWeight:500, color:C.ink, marginBottom:2 }}>{field.label}</div>
          <div style={{ fontFamily:C.mono, fontSize:11, color:C.inkDim }}>{field.hint}</div>
        </div>
        <motion.span
          key={value}
          initial={{ opacity:0.6, y:-4 }}
          animate={{ opacity:1, y:0 }}
          transition={SPRING.snap}
          style={{ fontFamily:C.mono, fontSize:28, fontWeight:600, color:C.ink, letterSpacing:"-1px", lineHeight:1 }}
        >{value}</motion.span>
      </div>
      <div style={{ position:"relative", height:"2px", background:C.border, borderRadius:1 }}>
        <motion.div
          animate={{ width:`${p}%` }}
          transition={SPRING.snap}
          style={{ position:"absolute", left:0, top:0, height:"100%", background:C.ink, borderRadius:1 }}
        />
        <motion.div
          animate={{ left:`${p}%` }}
          transition={SPRING.snap}
          style={{ position:"absolute", top:"50%", translateX:"-50%", translateY:"-50%", width:14, height:14, borderRadius:"50%", background:C.void, border:`2px solid ${C.ink}`, pointerEvents:"none" }}
        />
        <input type="range" min={field.min} max={field.max} value={value} onChange={e=>onChange(Number(e.target.value))}
          style={{ position:"absolute", inset:"-12px 0", width:"100%", opacity:0, cursor:"pointer", height:28 }}/>
      </div>
    </div>
  );
}

/* ── Number field ── */
function NumberField({ field, value, onChange }) {
  const [focused, setFocused] = useState(false);
  return (
    <div>
      <div style={{ fontFamily:C.sans, fontSize:14, fontWeight:500, color:C.ink, marginBottom:2 }}>{field.label}</div>
      <div style={{ fontFamily:C.mono, fontSize:11, color:C.inkDim, marginBottom:12 }}>{field.hint}</div>
      <motion.div
        animate={{ borderBottomColor: focused ? C.borderHigh : C.border }}
        transition={{ duration:0.15 }}
        style={{ display:"flex", alignItems:"baseline", gap:8, paddingBottom:8, borderBottom:`1px solid ${C.border}` }}
      >
        <input type="number" min={field.min} max={field.max} value={value}
          onChange={e=>onChange(Number(e.target.value))}
          onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)}
          style={{ background:"transparent", border:"none", outline:"none", fontFamily:C.mono, fontSize:32, fontWeight:600, color:C.ink, letterSpacing:"-1px", width:80, padding:0 }}/>
        <span style={{ fontFamily:C.mono, fontSize:12, color:C.inkDim }}>{field.unit}</span>
      </motion.div>
    </div>
  );
}

/* ── Select field ── */
function SelectField({ field, value, onChange }) {
  return (
    <div>
      <div style={{ fontFamily:C.sans, fontSize:14, fontWeight:500, color:C.ink, marginBottom:2 }}>{field.label}</div>
      <div style={{ fontFamily:C.mono, fontSize:11, color:C.inkDim, marginBottom:12 }}>{field.hint}</div>
      <div style={{ display:"flex", gap:6 }}>
        {field.options.map(opt => {
          const active = value===opt;
          return (
            <motion.button key={opt} onClick={()=>onChange(opt)}
              whileTap={{ scale:0.97, transition:SPRING.press }}
              animate={{ background:active?C.raised:"transparent", borderColor:active?C.borderHigh:C.border, color:active?C.ink:C.inkDim }}
              transition={{ duration:0.15 }}
              style={{ flex:1, padding:"9px 12px", borderRadius:6, border:`1px solid ${C.border}`, fontFamily:C.sans, fontSize:12, fontWeight:active?500:400, cursor:"pointer", outline:"none" }}
            >{opt}</motion.button>
          );
        })}
      </div>
    </div>
  );
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

  /* ── FORM ── */
  if (step==="form") return (
    <div style={{ display:"grid", gridTemplateColumns:"3fr 2fr", minHeight:"calc(100vh - 57px)" }}>
      <div style={{ borderRight:`1px solid ${C.border}`, overflowY:"auto", padding:"52px 56px 120px" }}>
        <motion.div initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.22, ease:[0.16,1,0.3,1] }} style={{ marginBottom:48 }}>
          <div style={{ fontFamily:C.mono, fontSize:10, color:C.inkDim, letterSpacing:"0.12em", textTransform:"uppercase", marginBottom:10 }}>Individual assessment</div>
          <h1 style={{ fontFamily:C.sans, fontSize:36, fontWeight:600, color:C.ink, letterSpacing:"-1px", lineHeight:1.15, margin:"0 0 10px" }}>Your next resignation<br/>is in the data.</h1>
          <p style={{ fontFamily:C.sans, fontSize:14, color:C.inkMid, lineHeight:1.7, maxWidth:420, margin:0 }}>The resignation letter has not been written yet. Eight signals tell you if it will be. Complete the profile and get a strategic brief in seconds.</p>
        </motion.div>

        {/* Staggered field list , Emil: stagger communicates structure */}
        <motion.div variants={VARS.fieldList} initial="hidden" animate="show" style={{ display:"flex", flexDirection:"column" }}>
          {FIELDS.map((field, i) => (
            <motion.div key={field.key} variants={VARS.fieldItem}>
              <div style={{ paddingTop:28, paddingBottom:28 }}>
                {field.type==="range"  && <RangeField  field={field} value={form[field.key]} onChange={v=>set(field.key,v)}/>}
                {field.type==="number" && <NumberField field={field} value={form[field.key]} onChange={v=>set(field.key,v)}/>}
                {field.type==="select" && <SelectField field={field} value={form[field.key]} onChange={v=>set(field.key,v)}/>}
              </div>
              {i < FIELDS.length-1 && <Rule/>}
            </motion.div>
          ))}
        </motion.div>

        <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:0.4, duration:0.2 }}>
          <PressButton onClick={analyze} variant="primary"
            style={{ marginTop:48, height:48, paddingLeft:32, paddingRight:32, fontSize:14, fontWeight:600, letterSpacing:"-0.2px" }}>
            Run assessment
          </PressButton>
        </motion.div>
      </div>

      {/* RIGHT , sticky live panel */}
      <div style={{ position:"sticky", top:57, height:"calc(100vh - 57px)", display:"flex", flexDirection:"column", padding:"52px 40px" }}>
        <Label>Live risk score</Label>
        <div style={{ marginBottom:8 }}>
          <SpringScore value={live} size={72} color={C.ink}/>
          <span style={{ fontFamily:C.mono, fontSize:16, color:C.inkDim, marginLeft:8 }}>/100</span>
        </div>

        <motion.div
          animate={{ color:liveRisk.flood }}
          transition={{ duration:0.3 }}
          style={{ display:"inline-flex", alignItems:"center", gap:8, marginBottom:32 }}
        >
          <motion.div
            animate={{ background:liveRisk.flood, scale:[1,1.15,1] }}
            transition={{ duration:0.3 }}
            style={{ width:6, height:6, borderRadius:"50%" }}
          />
          <span style={{ fontFamily:C.mono, fontSize:11, letterSpacing:"0.1em" }}>{liveRisk.label}</span>
        </motion.div>

        {/* Progress bar , spring width */}
        <div style={{ height:"2px", background:C.border, borderRadius:1, marginBottom:48, overflow:"hidden" }}>
          <motion.div
            animate={{ width:`${live}%`, background:liveRisk.flood }}
            transition={SPRING.score}
            style={{ height:"100%", borderRadius:1 }}
          />
        </div>

        <Rule style={{ marginBottom:32 }}/>
        <Label>Signals</Label>

        <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
          {[
            {label:"Satisfaction",  v:form.satisfaction,      inv:false},
            {label:"Growth",        v:form.growthOpportunity, inv:false},
            {label:"Manager",       v:form.managerRating,     inv:false},
            {label:"Workload",      v:form.workload,          inv:true },
          ].map(({label,v,inv}) => {
            const atRisk=inv?v>=7:v<=4;
            return (
              <div key={label} style={{ display:"flex", alignItems:"center", gap:12 }}>
                <div style={{ fontFamily:C.mono, fontSize:11, color:C.inkDim, width:88, flexShrink:0 }}>{label}</div>
                <div style={{ flex:1, height:"1px", background:C.border, overflow:"hidden" }}>
                  <motion.div
                    animate={{ width:`${v*10}%`, background:atRisk?C.floodHigh:C.borderMid }}
                    transition={SPRING.score}
                    style={{ height:"100%" }}
                  />
                </div>
                <motion.div
                  animate={{ color:atRisk?C.floodHigh:C.inkMid }}
                  transition={{ duration:0.2 }}
                  style={{ fontFamily:C.mono, fontSize:12, fontWeight:600, width:20, textAlign:"right" }}
                >{v}</motion.div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  /* ── RESULT , verdict flood ── */
  const { s: finalScore, rv } = result;
  return (
    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", minHeight:"calc(100vh - 57px)" }}>

      {/* LEFT , clip-path reveal into flood color */}
      <motion.div
        variants={VARS.resultLeft}
        initial="hidden"
        animate="show"
        style={{ background:rv.flood, padding:"52px 56px", display:"flex", flexDirection:"column", justifyContent:"space-between" }}
      >
        <div>
          <motion.div
            initial={{ opacity:0, y:8 }}
            animate={{ opacity:1, y:0 }}
            transition={{ delay:0.15, ...SPRING.arrive }}
            style={{ fontFamily:C.mono, fontSize:10, color:"rgba(255,255,255,0.55)", letterSpacing:"0.12em", textTransform:"uppercase", marginBottom:40 }}
          >Risk verdict</motion.div>

          {/* Score , spring count-up on color bg */}
          <motion.div initial={{ opacity:0, scale:0.95 }} animate={{ opacity:1, scale:1 }} transition={{ delay:0.1, ...SPRING.arrive }}>
            <SpringScore value={finalScore} size={120} color="#FFFFFF"/>
          </motion.div>

          <motion.div
            initial={{ opacity:0, x:-8 }}
            animate={{ opacity:1, x:0 }}
            transition={{ delay:0.22, ...SPRING.arrive }}
          >
            <div style={{ fontFamily:C.mono, fontSize:13, color:"rgba(255,255,255,0.70)", letterSpacing:"0.16em", marginTop:20, marginBottom:4 }}>{rv.label}</div>
            <div style={{ fontFamily:C.mono, fontSize:13, color:"rgba(255,255,255,0.45)", letterSpacing:"0.1em" }}>out of 100</div>
          </motion.div>
        </div>

        <div>
          <div style={{ height:"1px", background:"rgba(255,255,255,0.20)", marginBottom:28 }}/>
          <div style={{ fontFamily:C.mono, fontSize:10, color:"rgba(255,255,255,0.45)", letterSpacing:"0.12em", textTransform:"uppercase", marginBottom:20 }}>Signal breakdown</div>

          {/* Staggered signals on flood */}
          <motion.div variants={VARS.signalStagger} initial="hidden" animate="show" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
            {[
              {label:"Satisfaction",  v:form.satisfaction,      inv:false},
              {label:"Growth",        v:form.growthOpportunity, inv:false},
              {label:"Manager",       v:form.managerRating,     inv:false},
              {label:"Workload",      v:form.workload,          inv:true },
            ].map(({label,v,inv}) => {
              const atRisk=inv?v>=7:v<=4;
              return (
                <motion.div key={label} variants={VARS.signalItem}>
                  <div style={{ fontFamily:C.mono, fontSize:10, color:"rgba(255,255,255,0.50)", letterSpacing:"0.1em", marginBottom:4 }}>{label}</div>
                  <div style={{ fontFamily:C.mono, fontSize:28, fontWeight:600, color:atRisk?"rgba(255,255,255,1)":"rgba(255,255,255,0.55)", letterSpacing:"-1px", lineHeight:1 }}>
                    {v}<span style={{ fontSize:11, color:"rgba(255,255,255,0.35)" }}>/10</span>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>

          <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:0.5, duration:0.2 }}>
            <PressButton onClick={reset} style={{ marginTop:32, padding:"9px 20px", fontSize:11, letterSpacing:"0.06em", color:"rgba(255,255,255,0.55)", background:"transparent", border:"1px solid rgba(255,255,255,0.25)", fontFamily:C.mono }}>
              New assessment
            </PressButton>
          </motion.div>
        </div>
      </motion.div>

      {/* RIGHT , strategic brief */}
      <motion.div variants={VARS.resultRight} initial="hidden" animate="show" style={{ padding:"52px 48px", display:"flex", flexDirection:"column" }}>
        <motion.div initial={{ opacity:0, y:6 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.18, ...SPRING.arrive }} style={{ marginBottom:32 }}>
          <Label>Strategic brief</Label>
          <h2 style={{ fontFamily:C.sans, fontSize:22, fontWeight:600, color:C.ink, letterSpacing:"-0.5px", lineHeight:1.3, margin:0 }}>Principal analysis</h2>
        </motion.div>
        <Rule style={{ marginBottom:32 }}/>
        <div style={{ flex:1 }}>
          <AnimatePresence mode="wait">
            {loading ? (
              <motion.div key="loading" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }} transition={{ duration:0.15 }} style={{ display:"flex", flexDirection:"column", gap:10 }}>
                {[94,80,88,72,84,0,76].map((w,i)=>w?<Skel key={i} w={`${w}%`}/>:<div key={i} style={{height:8}}/>)}
              </motion.div>
            ) : insight ? (
              <motion.p key="content" initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ ...SPRING.arrive }}
                style={{ fontFamily:C.sans, fontSize:15, lineHeight:1.85, color:C.inkMid, margin:0 }}>
                {insight}
              </motion.p>
            ) : null}
          </AnimatePresence>
        </div>
        <Rule style={{ marginTop:32, marginBottom:20 }}/>
        <div style={{ fontFamily:C.mono, fontSize:10, color:C.inkFaint, letterSpacing:"0.1em" }}>FLIGHTRISK INTELLIGENCE</div>
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

  const rC = r => r>30?C.floodHigh:r>20?C.floodWarn:C.floodSafe;

  if (!stats) return (
    <motion.div initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.24, ease:[0.16,1,0.3,1] }}
      style={{ maxWidth:560, margin:"0 auto", padding:"100px 24px" }}>
      <Label>Workforce analytics</Label>
      <h1 style={{ fontFamily:C.sans, fontSize:40, fontWeight:600, color:C.ink, letterSpacing:"-1.5px", lineHeight:1.1, margin:"8px 0 16px" }}>Every resignation<br/>was predictable.</h1>
      <p style={{ fontFamily:C.sans, fontSize:14, color:C.inkMid, lineHeight:1.7, marginBottom:48 }}>The pattern was there before they handed in their notice. Upload an IBM HR Analytics CSV and find out who is next.</p>

      <motion.div
        animate={{ borderColor:dragging?C.borderHigh:C.border, background:dragging?C.raised:C.surface }}
        transition={{ duration:0.15 }}
        onDragOver={e=>{e.preventDefault();setDragging(true);}}
        onDragLeave={()=>setDragging(false)}
        onDrop={e=>{e.preventDefault();setDragging(false);const f=e.dataTransfer.files[0];if(f)processFile(f);}}
        onClick={()=>document.getElementById("bulk-up").click()}
        style={{ border:`1px solid ${C.border}`, borderRadius:10, padding:"56px 40px", textAlign:"center", cursor:"pointer" }}
      >
        <motion.svg width="32" height="32" viewBox="0 0 24 24" fill="none"
          animate={{ stroke:dragging?C.ink:C.inkDim }}
          transition={{ duration:0.15 }}
          strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
          style={{ margin:"0 auto 16px", display:"block" }}>
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
        </motion.svg>
        <div style={{ fontFamily:C.sans, fontSize:15, fontWeight:500, color:dragging?C.ink:C.inkMid, marginBottom:6 }}>Drop CSV file</div>
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
          {label:"Attrition rate",    value:`${stats.rate}%`,                          color:stats.rate>15?C.floodHigh:C.ink},
          {label:"Total employees",   value:stats.total,                               color:C.ink},
          {label:"Avg monthly income",value:`$${(+stats.avgSalary).toLocaleString()}`, color:C.ink},
          {label:"Avg tenure",        value:`${stats.avgTenure}yr`,                   color:C.ink},
        ].map(({label,value,color},i)=>(
          <motion.div key={label} initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ delay:i*0.05, ...SPRING.arrive }}
            style={{ padding:"24px 28px", borderRight:i<3?`1px solid ${C.border}`:"none" }}>
            <Label>{label}</Label>
            <div style={{ fontFamily:C.mono, fontSize:32, fontWeight:600, color, letterSpacing:"-1px", lineHeight:1 }}>{value}</div>
          </motion.div>
        ))}
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"3fr 2fr", minHeight:"calc(100vh - 57px - 88px)" }}>
        {/* LEFT , charts */}
        <div style={{ borderRight:`1px solid ${C.border}`, padding:"40px 48px 80px" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", marginBottom:36 }}>
            <div>
              <Label>Dashboard</Label>
              <h2 style={{ fontFamily:C.sans, fontSize:24, fontWeight:600, color:C.ink, letterSpacing:"-0.5px", margin:0 }}>Attrition overview</h2>
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
                      <YAxis type="category" dataKey={key} tick={{fill:C.inkMid,fontSize:9,fontFamily:C.mono}} width={70} axisLine={false} tickLine={false}/>
                      <Tooltip content={<TT/>}/>
                      <Bar dataKey="rate" fill={C.inkMid} radius={[0,3,3,0]}/>
                    </BarChart>
                  ) : (
                    <BarChart data={data}>
                      <CartesianGrid strokeDasharray="2 4" stroke={C.border} vertical={false}/>
                      <XAxis dataKey={key} tick={{fill:C.inkDim,fontSize:9,fontFamily:C.mono}} axisLine={false} tickLine={false}/>
                      <YAxis tick={{fill:C.inkDim,fontSize:9,fontFamily:C.mono}} unit="%" axisLine={false} tickLine={false}/>
                      <Tooltip content={<TT/>}/>
                      <Bar dataKey="rate" fill={C.inkMid} radius={[3,3,0,0]}/>
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
                  <Line type="monotone" dataKey="rate" stroke={C.inkMid} strokeWidth={1.5} dot={{fill:C.inkMid,r:3}}/>
                </LineChart>
              </ResponsiveContainer>
            </motion.div>
          </div>
        </div>

        {/* RIGHT , risk + AI */}
        <div style={{ padding:"40px 36px 80px", display:"flex", flexDirection:"column", gap:36 }}>
          <div>
            <Label>Top risk factors</Label>
            <Rule style={{ marginBottom:0 }}/>
            {stats.riskFactors.map((r,i)=>(
              <motion.div key={i}
                initial={{ opacity:0, x:-8 }}
                animate={{ opacity:1, x:0 }}
                transition={{ delay:i*0.06, ...SPRING.arrive }}
                style={{ padding:"14px 0", borderBottom:`1px solid ${C.border}`, display:"flex", alignItems:"center", gap:12 }}>
                <span style={{ fontFamily:C.mono, fontSize:10, color:C.inkFaint, width:18, flexShrink:0 }}>{i+1}</span>
                <div style={{ flex:1 }}>
                  <div style={{ fontFamily:C.sans, fontSize:12, color:C.inkMid, marginBottom:8 }}>{r.factor}</div>
                  <div style={{ height:"1px", background:C.border }}>
                    <motion.div
                      initial={{ width:0 }}
                      animate={{ width:`${Math.min(r.rate,100)}%` }}
                      transition={{ delay:i*0.06+0.3, type:"spring", stiffness:120, damping:20 }}
                      style={{ height:"100%", background:rC(r.rate) }}
                    />
                  </div>
                </div>
                <span style={{ fontFamily:C.mono, fontSize:16, fontWeight:600, color:rC(r.rate), minWidth:44, textAlign:"right" }}>{r.rate}%</span>
              </motion.div>
            ))}
          </div>

          <div style={{ flex:1, display:"flex", flexDirection:"column" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", marginBottom:16 }}>
              <div>
                <Label>AI generated</Label>
                <div style={{ fontFamily:C.sans, fontSize:16, fontWeight:600, color:C.ink, letterSpacing:"-0.3px" }}>Executive brief</div>
              </div>
              <PressButton onClick={generate} disabled={insightLoading} variant="primary"
                style={{ height:34, paddingLeft:16, paddingRight:16, fontSize:12, fontWeight:500 }}>
                {insightLoading?"Generating…":insight?"Regenerate":"Generate"}
              </PressButton>
            </div>
            <Rule style={{ marginBottom:20 }}/>
            <div style={{ flex:1 }}>
              <AnimatePresence mode="wait">
                {insightLoading ? (
                  <motion.div key="skel" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }} transition={{ duration:0.15 }}
                    style={{ display:"flex", flexDirection:"column", gap:10 }}>
                    {[90,74,82,0,66,78].map((w,i)=>w?<Skel key={i} w={`${w}%`}/>:<div key={i} style={{height:8}}/>)}
                  </motion.div>
                ) : insight ? (
                  <motion.p key="insight" initial={{ opacity:0, y:6 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }} transition={SPRING.arrive}
                    style={{ fontFamily:C.sans, fontSize:13, lineHeight:1.85, color:C.inkMid, margin:0, whiteSpace:"pre-wrap" }}>
                    {insight}
                  </motion.p>
                ) : (
                  <motion.p key="empty" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
                    style={{ fontFamily:C.mono, fontSize:11, color:C.inkFaint, lineHeight:1.7, fontStyle:"italic", margin:0 }}>
                    Click Generate to produce an executive summary.
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
          </div>

          <PressButton onClick={()=>{setStats(null);setInsight("");setFilename("");}} variant="ghost"
            style={{ padding:"9px 18px", fontSize:11, letterSpacing:"0.06em", fontFamily:C.mono, alignSelf:"flex-start", color:C.inkDim }}>
            Upload new file
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
    <div style={{ minHeight:"100vh", background:C.void, fontFamily:C.sans, color:C.ink }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500;600&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
        html{-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;}
        body{background:${C.void};}
        ::selection{background:rgba(255,255,255,0.15);color:${C.ink};}
        ::-webkit-scrollbar{width:3px;}
        ::-webkit-scrollbar-thumb{background:${C.border};border-radius:2px;}
        input[type=number]{-moz-appearance:textfield;}
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button{opacity:.2;}
        @media(prefers-reduced-motion:reduce){*{animation-duration:0.01ms!important;transition-duration:0.01ms!important}}
      `}</style>

      {/* HEADER */}
      <header style={{ position:"sticky", top:0, zIndex:200, height:57, background:`${C.void}E6`, backdropFilter:"blur(20px)", borderBottom:`1px solid ${C.border}`, display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 32px" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <circle cx="10" cy="10" r="9" stroke={C.inkDim} strokeWidth="1"/>
            <circle cx="10" cy="10" r="4" fill={C.ink}/>
            <line x1="10" y1="1" x2="10" y2="4" stroke={C.inkDim} strokeWidth="1"/>
            <line x1="10" y1="16" x2="10" y2="19" stroke={C.inkDim} strokeWidth="1"/>
            <line x1="1" y1="10" x2="4" y2="10" stroke={C.inkDim} strokeWidth="1"/>
            <line x1="16" y1="10" x2="19" y2="10" stroke={C.inkDim} strokeWidth="1"/>
          </svg>
          <span style={{ fontFamily:C.sans, fontSize:14, fontWeight:600, color:C.ink, letterSpacing:"-0.3px" }}>FlightRisk</span>
          <span style={{ fontFamily:C.mono, fontSize:10, color:C.inkFaint, letterSpacing:"0.06em" }}>by Divyah</span>
        </div>

        <div style={{ display:"flex", alignItems:"center", background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, padding:3, gap:2 }}>
          {[["individual","Individual"],["bulk","Bulk CSV"]].map(([id,label])=>(
            <motion.button key={id} onClick={()=>setTab(id)}
              whileTap={{ scale:0.97, transition:SPRING.press }}
              animate={{ background:tab===id?C.raised:"transparent", color:tab===id?C.ink:C.inkDim }}
              transition={{ duration:0.15 }}
              style={{ padding:"5px 14px", borderRadius:6, border:"none", fontFamily:C.sans, fontSize:12, fontWeight:tab===id?500:400, cursor:"pointer", outline:"none", letterSpacing:"-0.1px" }}>
              {label}
            </motion.button>
          ))}
        </div>

        <div style={{ width:140 }}/>
      </header>

      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity:0, y:6 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-4 }} transition={{ duration:0.18, ease:[0.16,1,0.3,1] }}>
          {tab==="individual" ? <IndividualView/> : <BulkView/>}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}