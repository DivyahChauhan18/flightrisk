"use client";
import { useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";
import Papa from "papaparse";

const C = {
  bg: "#ffffff",
  surface: "#ffffff",
  border: "#e5e7eb",
  accent: "#dc2626",
  accentSoft: "#fef2f2",
  accentBorder: "#fecaca",
  green: "#16a34a",
  orange: "#ea580c",
  text: "#111827",
  textSub: "#374151",
  textMuted: "#9ca3af",
  label: "#6b7280",
  font: "'Plus Jakarta Sans', sans-serif",
};

function pct(n, total) { return total ? ((n / total) * 100).toFixed(1) : 0; }
function avg(arr, key) { return arr.length ? (arr.reduce((s, r) => s + (+r[key] || 0), 0) / arr.length).toFixed(1) : 0; }
function groupBy(arr, key) {
  return arr.reduce((acc, r) => { const k = r[key] || "Unknown"; acc[k] = acc[k] || []; acc[k].push(r); return acc; }, {});
}

function computeStats(rows) {
  const total = rows.length;
  const left = rows.filter(r => r.Attrition === "Yes");
  const rate = pct(left.length, total);

  const byDept = groupBy(rows, "Department");
  const deptData = Object.entries(byDept).map(([dept, emps]) => {
    const gone = emps.filter(e => e.Attrition === "Yes").length;
    return { dept, total: emps.length, left: gone, rate: +pct(gone, emps.length) };
  }).sort((a, b) => b.rate - a.rate);

  const ageBuckets = { "18-25": [], "26-35": [], "36-45": [], "46-55": [], "55+": [] };
  rows.forEach(r => {
    const a = +r.Age;
    const b = a <= 25 ? "18-25" : a <= 35 ? "26-35" : a <= 45 ? "36-45" : a <= 55 ? "46-55" : "55+";
    ageBuckets[b].push(r);
  });
  const ageData = Object.entries(ageBuckets).map(([age, emps]) => {
    const gone = emps.filter(e => e.Attrition === "Yes").length;
    return { age, rate: +pct(gone, emps.length) };
  });

  const salaryBands = { "<3k": [], "3k-5k": [], "5k-8k": [], "8k-12k": [], "12k+": [] };
  rows.forEach(r => {
    const s = +r.MonthlyIncome;
    const b = s < 3000 ? "<3k" : s < 5000 ? "3k-5k" : s < 8000 ? "5k-8k" : s < 12000 ? "8k-12k" : "12k+";
    salaryBands[b].push(r);
  });
  const salaryData = Object.entries(salaryBands).map(([band, emps]) => {
    const gone = emps.filter(e => e.Attrition === "Yes").length;
    return { band, rate: +pct(gone, emps.length) };
  });

  const satisfactionData = [1, 2, 3, 4].map(score => {
    const emps = rows.filter(r => +r.JobSatisfaction === score);
    const gone = emps.filter(e => e.Attrition === "Yes").length;
    return { score: `Score ${score}`, rate: +pct(gone, emps.length) };
  });

  const otYes = rows.filter(r => r.OverTime === "Yes");
  const otNo = rows.filter(r => r.OverTime === "No");
  const overtimeData = [
    { label: "Works OT", rate: +pct(otYes.filter(e => e.Attrition === "Yes").length, otYes.length) },
    { label: "No OT", rate: +pct(otNo.filter(e => e.Attrition === "Yes").length, otNo.length) },
  ];

  const tenureBuckets = { "0-1y": [], "1-3y": [], "3-5y": [], "5-10y": [], "10y+": [] };
  rows.forEach(r => {
    const y = +r.YearsAtCompany;
    const b = y <= 1 ? "0-1y" : y <= 3 ? "1-3y" : y <= 5 ? "3-5y" : y <= 10 ? "5-10y" : "10y+";
    tenureBuckets[b].push(r);
  });
  const tenureData = Object.entries(tenureBuckets).map(([tenure, emps]) => {
    const gone = emps.filter(e => e.Attrition === "Yes").length;
    return { tenure, rate: +pct(gone, emps.length) };
  });

  const riskFactors = [
    { factor: "Overtime Workers", rate: overtimeData[0].rate },
    { factor: "Low Salary (<$3k)", rate: salaryData[0]?.rate || 0 },
    { factor: "Low Job Satisfaction", rate: satisfactionData[0]?.rate || 0 },
    { factor: "Early Tenure (0-1y)", rate: tenureData[0]?.rate || 0 },
    { factor: "Young Employees (18-25)", rate: ageData[0]?.rate || 0 },
  ].sort((a, b) => b.rate - a.rate);

  return {
    total, left: left.length, rate,
    avgSalary: avg(rows, "MonthlyIncome"),
    avgTenure: avg(rows, "YearsAtCompany"),
    deptData, ageData, salaryData, satisfactionData, overtimeData, tenureData, riskFactors,
  };
}

function buildPrompt(s) {
  return `You are a senior HR analytics consultant. Analyze this workforce attrition data and write a sharp, executive-level summary.

Dataset: ${s.total} employees, ${s.left} left (${s.rate}% attrition rate)
Average monthly income: $${s.avgSalary}, Average tenure: ${s.avgTenure} years

Department attrition: ${s.deptData.map(d => `${d.dept}: ${d.rate}%`).join(", ")}
Age group attrition: ${s.ageData.map(d => `${d.age}: ${d.rate}%`).join(", ")}
Salary band attrition: ${s.salaryData.map(d => `${d.band}: ${d.rate}%`).join(", ")}
Overtime attrition: Works OT: ${s.overtimeData[0]?.rate}%, No OT: ${s.overtimeData[1]?.rate}%
Tenure attrition: ${s.tenureData.map(d => `${d.tenure}: ${d.rate}%`).join(", ")}
Job satisfaction attrition: ${s.satisfactionData.map(d => `${d.score}: ${d.rate}%`).join(", ")}

Write a 4-paragraph executive summary:
1. Overall attrition health — is this good, concerning, or critical? Compare to industry benchmark (~15% is typical).
2. The highest-risk employee profile — one specific sentence combining dept + age + salary + overtime + tenure like "Sales employees aged 18-25 earning under $3k working overtime with under 1 year tenure are X times more likely to leave"
3. Top 3 actionable HR recommendations — be specific, not generic
4. One surprising or counterintuitive finding

Use specific numbers. Write like a $500/hour consultant. No fluff.`;
}

const TT = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 6, padding: "10px 14px", fontSize: 12, fontFamily: C.font, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}>
      <p style={{ margin: "0 0 4px", color: C.label, fontSize: 11 }}>{label}</p>
      {payload.map((p, i) => <p key={i} style={{ margin: 0, color: C.accent, fontWeight: 600 }}>{p.value}%</p>)}
    </div>
  );
};

function StatCard({ label, value, sub, alert }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderLeft: alert ? `4px solid ${C.accent}` : `1px solid ${C.border}`, borderRadius: 8, padding: "20px 22px" }}>
      <p style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: C.label, margin: "0 0 8px", fontFamily: C.font, fontWeight: 600 }}>{label}</p>
      <p style={{ fontSize: 30, fontWeight: 700, color: alert ? C.accent : C.text, margin: "0 0 4px", fontFamily: C.font, letterSpacing: "-0.02em" }}>{value}</p>
      {sub && <p style={{ fontSize: 12, color: C.textMuted, margin: 0, fontFamily: C.font }}>{sub}</p>}
    </div>
  );
}

function ChartCard({ title, children }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "24px" }}>
      <p style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: C.accent, margin: "0 0 20px", fontFamily: C.font, fontWeight: 700 }}>{title}</p>
      {children}
    </div>
  );
}

export default function FlightRisk() {
  const [stats, setStats] = useState(null);
  const [insight, setInsight] = useState("");
  const [insightLoading, setInsightLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [filename, setFilename] = useState("");

  function processFile(file) {
    setFilename(file.name);
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: (r) => setStats(computeStats(r.data)),
    });
  }

  async function generateInsight() {
    if (!stats) return;
    setInsightLoading(true);
    setInsight("");
    try {
      const res = await fetch("/api/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-5",
          max_tokens: 1000,
          messages: [{ role: "user", content: buildPrompt(stats) }],
        }),
      });
      const d = await res.json();
      setInsight(d.content?.map(b => b.text || "").join("") || "");
    } catch { setInsight("Failed to generate insights. Please try again."); }
    setInsightLoading(false);
  }

  const riskColor = (rate) => rate > 30 ? C.accent : rate > 20 ? C.orange : C.green;

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: C.font, color: C.text }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap'); button:hover{opacity:0.88;}`}</style>

      {/* Topbar */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: "0 40px", height: 60, display: "flex", alignItems: "center", justifyContent: "space-between", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: C.text, margin: 0, letterSpacing: "-0.01em" }}>
          Flight<span style={{ color: C.accent }}>Risk</span>
          <span style={{ fontSize: 11, color: C.textMuted, fontWeight: 400, letterSpacing: "0.12em", textTransform: "uppercase", marginLeft: 14 }}>by Divyah</span>
        </h1>
        {stats && <span style={{ fontSize: 12, color: C.textMuted }}>{filename} · {stats.total.toLocaleString()} employees</span>}
      </div>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 24px 80px" }}>
        {!stats ? (
          <>
            {/* Hero */}
            <div style={{ textAlign: "center", padding: "60px 0 48px" }}>
              <span style={{ fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: C.accent, fontWeight: 700 }}>HR Attrition Analytics</span>
              <h2 style={{ fontSize: 40, fontWeight: 800, margin: "12px 0 14px", letterSpacing: "-0.03em", color: C.text }}>Your next resignation<br />is already in the data.</h2>
              <p style={{ color: C.label, fontSize: 15, margin: 0 }}>Upload your IBM HR Analytics CSV to generate a full attrition dashboard with AI-powered insights.</p>
            </div>

            {/* Drop zone */}
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) processFile(f); }}
              onClick={() => document.getElementById("csv-upload").click()}
              style={{ border: `2px dashed ${dragging ? C.accent : C.border}`, borderRadius: 12, padding: "72px 40px", textAlign: "center", cursor: "pointer", background: dragging ? C.accentSoft : C.surface, transition: "all 0.2s", marginBottom: 24 }}
            >
              <p style={{ fontSize: 36, margin: "0 0 14px" }}>📂</p>
              <p style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: "0 0 6px" }}>Drop your CSV here or click to upload</p>
              <p style={{ fontSize: 13, color: C.textMuted, margin: 0 }}>Works with the IBM HR Analytics dataset from Kaggle (1,470 employees)</p>
              <input id="csv-upload" type="file" accept=".csv" style={{ display: "none" }} onChange={e => e.target.files[0] && processFile(e.target.files[0])} />
            </div>

            <div style={{ background: C.accentSoft, border: `1px solid ${C.accentBorder}`, borderRadius: 8, padding: "16px 22px" }}>
              <p style={{ fontSize: 11, color: C.accent, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 700, margin: "0 0 8px" }}>Expected columns</p>
              <p style={{ fontSize: 13, color: C.textSub, margin: 0, lineHeight: 1.7 }}>Age · Attrition · Department · MonthlyIncome · JobSatisfaction · OverTime · YearsAtCompany · and 28 more standard IBM HR Analytics columns</p>
            </div>
          </>
        ) : (
          <>
            {/* KPIs */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
              <StatCard label="Attrition Rate" value={`${stats.rate}%`} sub={`${stats.left} employees left`} alert />
              <StatCard label="Total Employees" value={stats.total.toLocaleString()} sub="in dataset" />
              <StatCard label="Avg Monthly Income" value={`$${(+stats.avgSalary).toLocaleString()}`} sub="across workforce" />
              <StatCard label="Avg Tenure" value={`${stats.avgTenure}y`} sub="years at company" />
            </div>

            {/* Charts row 1 */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
              <ChartCard title="Attrition Rate by Department">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={stats.deptData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                    <XAxis type="number" tick={{ fill: C.textMuted, fontSize: 11, fontFamily: C.font }} unit="%" />
                    <YAxis type="category" dataKey="dept" tick={{ fill: C.textSub, fontSize: 11, fontFamily: C.font }} width={80} />
                    <Tooltip content={<TT />} />
                    <Bar dataKey="rate" fill={C.accent} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Attrition Rate by Age Group">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={stats.ageData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                    <XAxis dataKey="age" tick={{ fill: C.textMuted, fontSize: 11, fontFamily: C.font }} />
                    <YAxis tick={{ fill: C.textMuted, fontSize: 11, fontFamily: C.font }} unit="%" />
                    <Tooltip content={<TT />} />
                    <Bar dataKey="rate" fill="#f87171" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>

            {/* Charts row 2 */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
              <ChartCard title="Salary Band vs Attrition">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={stats.salaryData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                    <XAxis dataKey="band" tick={{ fill: C.textMuted, fontSize: 11, fontFamily: C.font }} />
                    <YAxis tick={{ fill: C.textMuted, fontSize: 11, fontFamily: C.font }} unit="%" />
                    <Tooltip content={<TT />} />
                    <Bar dataKey="rate" fill={C.accent} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Job Satisfaction vs Attrition">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={stats.satisfactionData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                    <XAxis dataKey="score" tick={{ fill: C.textMuted, fontSize: 11, fontFamily: C.font }} />
                    <YAxis tick={{ fill: C.textMuted, fontSize: 11, fontFamily: C.font }} unit="%" />
                    <Tooltip content={<TT />} />
                    <Bar dataKey="rate" fill="#fca5a5" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>

            {/* Charts row 3 */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
              <ChartCard title="Overtime vs Attrition">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={stats.overtimeData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                    <XAxis dataKey="label" tick={{ fill: C.textMuted, fontSize: 11, fontFamily: C.font }} />
                    <YAxis tick={{ fill: C.textMuted, fontSize: 11, fontFamily: C.font }} unit="%" />
                    <Tooltip content={<TT />} />
                    <Bar dataKey="rate" fill={C.accent} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Tenure vs Attrition">
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={stats.tenureData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                    <XAxis dataKey="tenure" tick={{ fill: C.textMuted, fontSize: 11, fontFamily: C.font }} />
                    <YAxis tick={{ fill: C.textMuted, fontSize: 11, fontFamily: C.font }} unit="%" />
                    <Tooltip content={<TT />} />
                    <Line type="monotone" dataKey="rate" stroke={C.accent} strokeWidth={2} dot={{ fill: C.accent, r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>

            {/* Risk factors */}
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "28px 32px", marginBottom: 16 }}>
              <p style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: C.accent, margin: "0 0 24px", fontWeight: 700 }}>Top 5 Attrition Risk Factors</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {stats.riskFactors.map((r, i) => (
                  <div key={i}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                      <span style={{ fontSize: 14, color: C.text, fontWeight: 500 }}>{r.factor}</span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: riskColor(r.rate), fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{r.rate}%</span>
                    </div>
                    <div style={{ background: C.border, borderRadius: 4, height: 8 }}>
                      <div style={{ width: `${Math.min(r.rate, 100)}%`, height: "100%", background: riskColor(r.rate), borderRadius: 4, transition: "width 0.5s" }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* AI Insight */}
            <div style={{ background: C.accentSoft, border: `1px solid ${C.accentBorder}`, borderRadius: 8, padding: "28px 32px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                <div>
                  <p style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: C.accent, margin: "0 0 6px", fontWeight: 700 }}>AI-Generated</p>
                  <h3 style={{ fontSize: 18, margin: 0, fontWeight: 700, color: C.text }}>Executive Insights Summary</h3>
                </div>
                <button
                  onClick={generateInsight}
                  disabled={insightLoading}
                  style={{ background: C.accent, color: "#fff", border: "none", borderRadius: 6, padding: "12px 24px", fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: C.font, cursor: "pointer", fontWeight: 700, boxShadow: "0 2px 8px rgba(220,38,38,0.25)" }}
                >
                  {insightLoading ? "Analyzing..." : insight ? "Regenerate" : "Generate Insights →"}
                </button>
              </div>
              {insightLoading && <p style={{ color: C.label, fontSize: 13, fontStyle: "italic" }}>Analyzing your attrition data...</p>}
              {insight && !insightLoading && (
                <p style={{ fontSize: 13, lineHeight: 1.85, color: C.textSub, margin: 0, whiteSpace: "pre-wrap" }}>{insight}</p>
              )}
            </div>

            <div style={{ marginTop: 20 }}>
              <button onClick={() => { setStats(null); setInsight(""); setFilename(""); }} style={{ background: "transparent", color: C.accent, border: `1px solid ${C.accentBorder}`, borderRadius: 6, padding: "10px 20px", fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: C.font, cursor: "pointer" }}>
                ← Upload New File
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}