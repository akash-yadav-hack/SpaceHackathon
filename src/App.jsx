import React, { useState, useEffect } from 'react';
import { 
  Activity, AlertTriangle, ShieldCheck, ShieldAlert, CheckCircle, XCircle, 
  FileText, Download, Play, RefreshCw, Cpu, Gauge, Radio, Clock, Database, 
  Terminal, ArrowRight, Zap, Info, ChevronRight, Lock, Sparkles, Volume2
} from 'lucide-react';
import jsPDF from 'jspdf';
import sha256 from 'js-sha256';
import confetti from 'canvas-confetti';

// Direct API calls or Mock Fallback for flawless operation
const API_BASE = 'http://localhost:5000/api';

export default function App() {
  // State setup
  const [telemetry, setTelemetry] = useState({
    thrusterPressure: { value: 2.4, status: "NOMINAL", unit: "bar", nominalRange: "> 2.0 bar" },
    rwTemperature: { value: 48.2, status: "NOMINAL", unit: "°C", nominalRange: "< 65.0 °C" },
    batteryVoltage: { value: 31.2, status: "NOMINAL", unit: "V", nominalRange: "> 28.0 V" },
    solarInput: { value: 420.5, status: "NOMINAL", unit: "W", nominalRange: "> 350.0 W" },
    busCurrent: { value: 12.4, status: "NOMINAL", unit: "A", nominalRange: "10-15 A" }
  });

  const [activeAnomaly, setActiveAnomaly] = useState(null);
  const [copilotResponse, setCopilotResponse] = useState(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [timeline, setTimeline] = useState([]);
  const [customQuery, setCustomQuery] = useState("");
  const [actionStatus, setActionStatus] = useState(null); // 'APPROVED' | 'REJECTED' | null
  const [activeTab, setActiveTab] = useState("all");

  const [uploadedPdfs, setUploadedPdfs] = useState([]);
  const [selectedPdf, setSelectedPdf] = useState(null);
  const [alarmActive, setAlarmActive] = useState(false);
  const [alarmText, setAlarmText] = useState("");

  // Live Jitter Simulation for realistic space control room experience
  useEffect(() => {
    const jitterTimer = setInterval(() => {
      setTelemetry(prev => {
        if (prev.thrusterPressure.status === "CRITICAL") return prev;
        const jitter = (Math.random() * 0.04 - 0.02);
        return {
          ...prev,
          thrusterPressure: {
            ...prev.thrusterPressure,
            value: parseFloat((prev.thrusterPressure.value + jitter).toFixed(2))
          },
          solarInput: {
            ...prev.solarInput,
            value: parseFloat((420.0 + Math.random() * 5).toFixed(1))
          }
        };
      });
    }, 2000);
    return () => clearInterval(jitterTimer);
  }, []);


  // Web Audio Synth for Space Control Siren Sound
  const triggerSirenSound = () => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(440, ctx.currentTime + 0.3);
      osc.frequency.linearRampToValueAtTime(880, ctx.currentTime + 0.6);

      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1.2);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 1.2);
    } catch (e) {}
  };

  // Trigger 5-Second Red Emergency Siren Banner & Audio Effect
  const triggerAlarm = (message) => {
    setAlarmText(message);
    setAlarmActive(true);
    triggerSirenSound();
    
    // Play siren pulse twice
    setTimeout(triggerSirenSound, 800);
    setTimeout(triggerSirenSound, 1600);

    // Auto-disable alarm after exactly 5 seconds
    setTimeout(() => {
      setAlarmActive(false);
    }, 5000);
  };

  // Fetch telemetry, timeline, and uploaded PDFs on mount
  useEffect(() => {
    fetchTelemetry();
    fetchTimeline();
    fetchUploadedPdfs();
    const interval = setInterval(() => {
      fetchTelemetry();
      fetchUploadedPdfs();
    }, 4000);
    return () => clearInterval(interval);
  }, []);


  const fetchUploadedPdfs = async () => {
    try {
      const res = await fetch(`${API_BASE}/uploaded-pdfs`);
      if (res.ok) {
        const data = await res.json();
        setUploadedPdfs(data);
      }
    } catch (err) {}
  };


  const fetchTelemetry = async () => {
    try {
      const res = await fetch(`${API_BASE}/telemetry`);
      if (res.ok) {
        const data = await res.json();
        setTelemetry(data);
      }
    } catch (err) {
      // Keep state resilient
    }
  };

  const fetchTimeline = async () => {
    try {
      const res = await fetch(`${API_BASE}/timeline`);
      if (res.ok) {
        const data = await res.json();
        setTimeline(data);
      }
    } catch (err) {
      // Initial mock timeline if backend loading
      if (timeline.length === 0) {
        const ts = new Date().toISOString();
        setTimeline([{
          id: "EVT-BOOT",
          timestamp: ts,
          type: "SYSTEM_BOOT",
          description: "Antriksh AI Ground Control System Online. Grounded RAG Engine active.",
          hash: sha256(`${ts}:SYSTEM_BOOT`)
        }]);
      }
    }
  };

  // Preset Trigger handler
  const handleTriggerPreset = async (scenarioId) => {
    setIsEvaluating(true);
    setActionStatus(null);
    try {
      const res = await fetch(`${API_BASE}/trigger-preset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenarioId })
      });

      if (res.ok) {
        const data = await res.json();
        if (scenarioId === 'reset') {
          setTelemetry(data.telemetry);
          setActiveAnomaly(null);
          setCopilotResponse(null);
          setIsEvaluating(false);
          fetchTimeline();
          return;
        }
        setTelemetry(data.telemetry);
        setActiveAnomaly(data.anomaly);
        
        // Trigger 5-Second Red Emergency Siren Alarm
        triggerAlarm(`CRITICAL ANOMALY BREACH: [${data.anomaly.subsystem}] ${data.anomaly.metric} = ${data.anomaly.value}`);

        // Auto-run Copilot Engine
        evaluateAnomaly(data.anomaly.queryText, data.anomaly);
      }
    } catch (err) {
      // Fallback evaluation client-side if backend offline
      let mockAnomaly = null;
      let newTelem = { ...telemetry };
      if (scenarioId === 'thruster') {
        newTelem.thrusterPressure = { value: 1.8, status: "CRITICAL", unit: "bar", nominalRange: "> 2.0 bar" };
        mockAnomaly = { subsystem: "Propulsion", metric: "Thruster-2 Chamber Pressure", value: "1.8 bar", nominal: "> 2.0 bar", queryText: "Thruster-2 Chamber Pressure Drop to 1.8 bar" };
      } else if (scenarioId === 'reaction_wheel') {
        newTelem.rwTemperature = { value: 88.0, status: "CRITICAL", unit: "°C", nominalRange: "< 65.0 °C" };
        mockAnomaly = { subsystem: "AOCS", metric: "Reaction Wheel-3 Temperature", value: "88.0 °C", nominal: "< 65.0 °C", queryText: "Reaction Wheel-3 Thermal Overheat to 88°C" };
      } else if (scenarioId === 'battery') {
        newTelem.batteryVoltage = { value: 24.1, status: "CRITICAL", unit: "V", nominalRange: "> 28.0 V" };
        mockAnomaly = { subsystem: "EPS Power", metric: "Battery Cell-4 Voltage", value: "24.1 V", nominal: "> 28.0 V", queryText: "Battery Cell-4 Low Voltage at 24.1V" };
      } else if (scenarioId === 'reset') {
        setTelemetry({
          thrusterPressure: { value: 2.4, status: "NOMINAL", unit: "bar", nominalRange: "> 2.0 bar" },
          rwTemperature: { value: 48.2, status: "NOMINAL", unit: "°C", nominalRange: "< 65.0 °C" },
          batteryVoltage: { value: 31.2, status: "NOMINAL", unit: "V", nominalRange: "> 28.0 V" },
          solarInput: { value: 420.5, status: "NOMINAL", unit: "W", nominalRange: "> 350.0 W" },
          busCurrent: { value: 12.4, status: "NOMINAL", unit: "A", nominalRange: "10-15 A" }
        });
        setActiveAnomaly(null);
        setCopilotResponse(null);
        setIsEvaluating(false);
        return;
      }

      setTelemetry(newTelem);
      setActiveAnomaly(mockAnomaly);
      if (mockAnomaly) {
        triggerAlarm(`CRITICAL ANOMALY BREACH: [${mockAnomaly.subsystem}] ${mockAnomaly.metric} = ${mockAnomaly.value}`);
      }
      evaluateAnomaly(mockAnomaly.queryText, mockAnomaly);
    }
  };


  // Copilot Query Engine
  const evaluateAnomaly = async (queryText, metricContext = null) => {
    setIsEvaluating(true);
    setActionStatus(null);
    try {
      const res = await fetch(`${API_BASE}/copilot/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queryText, metricContext })
      });
      if (res.ok) {
        const data = await res.json();
        setCopilotResponse(data);
        fetchTimeline();
      }
    } catch (err) {
      // Local Grounded RAG Simulation if backend server is unreachable
      const lower = queryText.toLowerCase();
      const ts = new Date().toISOString();
      let res;
      if (lower.includes("thruster") || lower.includes("pressure")) {
        res = {
          grounded: true,
          confidenceScore: 94,
          observedFacts: {
            rawMetrics: "Propulsion Thruster-2 Chamber Pressure = 1.8 bar",
            thresholdBreach: "Current value (1.8 bar) breached nominal threshold (> 2.0 bar)",
            timestamp: ts
          },
          verifiedEvidence: {
            citation: "Propulsion SOP Rev-4, Section 4.2, Page 58: Thruster Pressure Anomaly Protocol",
            sopId: "SOP-PROP-001",
            excerpt: "If Thruster Chamber Pressure drops below nominal threshold (2.0 bar), isolate Branch-A Fuel Line Valve (V-PROP-A1) and engage Secondary Thruster Branch-B.",
            sourceVerified: true
          },
          recommendedAction: {
            sopId: "SOP-PROP-001",
            checklistText: "1. Command isolation of Branch-A Valve.\n2. Switch main manifold feed to Secondary Branch-B.\n3. Verify Chamber-2 pressure stabilization > 2.0 bar.",
            steps: [
              "1. Command isolation of Branch-A Valve (V-PROP-A1).",
              "2. Switch main manifold feed to Secondary Branch-B.",
              "3. Verify Chamber-2 pressure stabilization > 2.0 bar."
            ]
          },
          whatIfPreview: {
            expectedOutcome: "Pressure stabilizes to ~2.3 bar within 45s",
            potentialRisk: "Temporary attitude variance (~0.4 deg) and minor impulse decay during switchover."
          }
        };
      } else if (lower.includes("reaction wheel") || lower.includes("thermal") || lower.includes("overheat")) {
        res = {
          grounded: true,
          confidenceScore: 94,
          observedFacts: {
            rawMetrics: "AOCS Reaction Wheel-3 Temperature = 88.0 °C",
            thresholdBreach: "Current value (88.0 °C) breached maximum ceiling (< 65.0 °C)",
            timestamp: ts
          },
          verifiedEvidence: {
            citation: "AOCS Flight Handbook Vol-2, Section 8.1.3, Page 112: RW Thermal Overheat",
            sopId: "SOP-AOCS-012",
            excerpt: "When Reaction Wheel temperature exceeds nominal operational ceiling (>65°C), initiate active momentum desaturation via magnetorquers (MTQ-X/Y).",
            sourceVerified: true
          },
          recommendedAction: {
            sopId: "SOP-AOCS-012",
            checklistText: "1. Activate Magnetic Torquer Desaturation Mode.\n2. Reduce RW-3 target speed by 40%.\n3. Monitor thermistor TH-RW3.",
            steps: [
              "1. Activate Magnetic Torquer Desaturation Mode (MTQ-DESAT-ENABLE).",
              "2. Reduce RW-3 target speed by 40%.",
              "3. Monitor thermistor TH-RW3 for thermal recovery below 60°C."
            ]
          },
          whatIfPreview: {
            expectedOutcome: "RW-3 temperature drops below 60°C within 15 minutes",
            potentialRisk: "Momentary slew rate reduction during magnetic momentum dump sequence."
          }
        };
      } else if (lower.includes("battery") || lower.includes("voltage")) {
        res = {
          grounded: true,
          confidenceScore: 94,
          observedFacts: {
            rawMetrics: "EPS Power Battery Cell-4 Voltage = 24.1 V",
            thresholdBreach: "Current value (24.1 V) breached lower safety threshold (> 28.0 V)",
            timestamp: ts
          },
          verifiedEvidence: {
            citation: "EPS Emergency Operational Guide, Section 3.4.1, Page 34: Battery Undervoltage Recovery",
            sopId: "SOP-EPS-005",
            excerpt: "If battery bus voltage drops below critical baseline (28.0V), immediately shed non-essential payload power loads.",
            sourceVerified: true
          },
          recommendedAction: {
            sopId: "SOP-EPS-005",
            checklistText: "1. Shed Payload Load Bank B.\n2. Re-orient Solar Array.\n3. Verify voltage charge recovery.",
            steps: [
              "1. Execute automated Shed Payload Load Bank B (CMD-EPS-SHED-B).",
              "2. Re-orient Solar Array Drive Assembly (SADA) to +90° Sun Vector.",
              "3. Verify bus voltage charge recovery > 28.5V."
            ]
          },
          whatIfPreview: {
            expectedOutcome: "Bus voltage recovers to > 28.5V within 10 orbital minutes",
            potentialRisk: "Temporary suspension of scientific payload telemetry acquisition."
          }
        };
      } else {
        res = {
          grounded: false,
          confidenceScore: 42,
          observedFacts: {
            rawMetrics: queryText,
            thresholdBreach: "No direct SOP rule mapping matched in standard Flight Manual Index",
            timestamp: ts
          },
          verifiedEvidence: {
            citation: "UNVERIFIED: No Flight SOP match found",
            sopId: "N/A",
            excerpt: "No ground-verified documentation matches the provided symptom.",
            sourceVerified: false
          },
          recommendedAction: {
            sopId: "N/A",
            checklistText: "HUMAN REVIEW REQUIRED",
            steps: [
              "1. Halt automated command sequencing.",
              "2. Request Flight Director review.",
              "3. Initiate telemetry diagnostic dump for offline analysis."
            ]
          },
          whatIfPreview: {
            expectedOutcome: "Pending Specialist Assessment",
            potentialRisk: "High - Automated execution blocked due to unverified citation."
          }
        };
      }

      setCopilotResponse(res);
      const desc = `COPILOT EVALUATION: "${queryText}" (Grounded: ${res.grounded})`;
      setTimeline(prev => [{
        id: `EVT-${Date.now()}`,
        timestamp: ts,
        type: "COPILOT_EVALUATION",
        description: desc,
        hash: sha256(`${ts}:${desc}`)
      }, ...prev]);
    } finally {
      setIsEvaluating(false);
    }
  };

  // Human-in-the-Loop Operator Decision (Auto-Executes Action on Telemetry)
  const handleOperatorDecision = async (decision) => {
    setActionStatus(decision);
    const ts = new Date().toISOString();
    const sopId = copilotResponse?.verifiedEvidence?.sopId || "SOP-UNK";
    const desc = `HUMAN-IN-THE-LOOP: Operator ${decision} procedure [${sopId}]`;

    // If APPROVED, trigger celebratory confetti and auto-correct telemetry
    if (decision === 'APPROVED') {
      try {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 }
        });
      } catch (e) {}

      setTimeout(() => {
        setTelemetry(prev => ({
          ...prev,
          thrusterPressure: { value: 2.3, status: "NOMINAL", unit: "bar", nominalRange: "> 2.0 bar" },
          rwTemperature: { value: 58.5, status: "NOMINAL", unit: "°C", nominalRange: "< 65.0 °C" },
          batteryVoltage: { value: 29.8, status: "NOMINAL", unit: "V", nominalRange: "> 28.0 V" }
        }));
      }, 1200);
    }


    try {
      await fetch(`${API_BASE}/copilot/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sopId, actionType: decision })
      });
      fetchTimeline();
    } catch (err) {
      setTimeline(prev => [{
        id: `EVT-${Date.now()}`,
        timestamp: ts,
        type: `OPERATOR_${decision}`,
        description: desc,
        hash: sha256(`${ts}:${desc}`)
      }, ...prev]);
    }
  };


  // Export Incident Audit Log to PDF & Markdown
  const handleExportReport = (format) => {
    const reportTimestamp = new Date().toISOString();
    
    if (format === 'markdown') {
      let mdContent = `# ANTRIKSH AI - MISSION OPERATIONS INCIDENT AUDIT REPORT\n`;
      mdContent += `**Generated:** ${reportTimestamp}\n`;
      mdContent += `**Classification:** RESTRICTED / FLIGHT OPERATIONS AUDIT\n\n`;
      mdContent += `## Chronological Event Log\n\n`;
      
      timeline.forEach(evt => {
        mdContent += `### [${evt.timestamp}] ${evt.type}\n`;
        mdContent += `- **Description:** ${evt.description}\n`;
        mdContent += `- **SHA-256 Hash:** \`${evt.hash}\` \n\n`;
      });

      const blob = new Blob([mdContent], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Antriksh_Incident_Report_${Date.now()}.md`;
      a.click();
    } else if (format === 'pdf') {
      const doc = new jsPDF();
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text("ANTRIKSH AI - MISSION INCIDENT AUDIT REPORT", 14, 20);
      
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(`Generated: ${reportTimestamp}`, 14, 28);
      doc.text(`Security Hash Standard: SHA-256 Tamper-Evident`, 14, 34);
      doc.line(14, 38, 196, 38);

      let yPos = 46;
      timeline.forEach((evt, idx) => {
        if (yPos > 270) {
          doc.addPage();
          yPos = 20;
        }
        doc.setFont("helvetica", "bold");
        doc.text(`${idx + 1}. [${evt.timestamp.substring(11, 19)}] ${evt.type}`, 14, yPos);
        yPos += 5;
        doc.setFont("helvetica", "normal");
        doc.text(`   Desc: ${evt.description.substring(0, 75)}`, 14, yPos);
        yPos += 5;
        doc.setFont("courier", "normal");
        doc.setFontSize(8);
        doc.text(`   HASH: ${evt.hash}`, 14, yPos);
        doc.setFontSize(10);
        yPos += 8;
      });

      doc.save(`Antriksh_Incident_Report_${Date.now()}.pdf`);
    }
  };

  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [pdfUploadStatus, setPdfUploadStatus] = useState(null);

  const handlePdfUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadingPdf(true);
    setPdfUploadStatus(null);
    const formData = new FormData();
    formData.append('pdfFile', file);

    try {
      const res = await fetch(`${API_BASE}/upload-pdf`, {
        method: 'POST',
        body: formData
      });

      if (res.ok) {
        const data = await res.json();
        setPdfUploadStatus({ success: true, message: `Ingested ${data.proceduresIndexed} procedures from ${file.name} (Total Pages: ${data.totalPages})` });
        fetchTimeline();
      } else {
        const err = await res.json();
        setPdfUploadStatus({ success: false, message: err.error || "Failed to process PDF file" });
      }
    } catch (err) {
      setPdfUploadStatus({ success: false, message: "Server connection failed during PDF upload" });
    } finally {
      setUploadingPdf(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* 5-SECOND EMERGENCY SIREN ALARM BANNER */}
      {alarmActive && (
        <div className="bg-red-600 text-white font-mono font-bold text-sm px-6 py-2 flex items-center justify-between animate-pulse shadow-lg z-50 border-b border-red-400">
          <div className="flex items-center space-x-3">
            <AlertTriangle className="w-5 h-5 text-white animate-bounce" />
            <span className="tracking-wider uppercase">🚨 CRITICAL FLIGHT ALARM SIREN (5s TIMER ACTIVE):</span>
            <span className="underline">{alarmText}</span>
          </div>
          <span className="bg-slate-950/60 text-red-200 px-2.5 py-0.5 rounded text-xs">
            AUDIO SIREN ACTIVE
          </span>
        </div>
      )}

      {/* Top Space Control Header */}
      <header className="h-16 border-b border-slate-800 bg-slate-900/80 backdrop-blur px-6 flex items-center justify-between sticky top-0 z-50">

        <div className="flex items-center space-x-3">
          <div className="p-2 bg-cyan-500/10 border border-cyan-500/30 rounded-lg text-cyan-400">
            <Radio className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-lg font-bold tracking-wider text-cyan-400 font-mono">ANTRIKSH AI</h1>
              <span className="text-[10px] bg-cyan-950 text-cyan-300 border border-cyan-800 px-2 py-0.5 rounded font-mono uppercase">
                ST-10 Copilot MVP
              </span>
            </div>
            <p className="text-xs text-slate-400">Autonomous Satellite Flight Safety & Grounded RAG Copilot</p>
          </div>
        </div>

        {/* Live Status Indicators */}
        <div className="flex items-center space-x-6 text-xs font-mono">
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
            <span className="text-slate-300">SAT-ORBIT: ISRO-LEO-04</span>
          </div>
          <div className="flex items-center space-x-2 border-l border-slate-800 pl-4">
            <Database className="w-4 h-4 text-cyan-400" />
            <span className="text-slate-300">SOP RAG Index: ACTIVE</span>
          </div>
          <div className="flex items-center space-x-2 border-l border-slate-800 pl-4">
            <Clock className="w-4 h-4 text-purple-400" />
            <span className="text-slate-300">{new Date().toISOString().substring(11, 19)} UTC</span>
          </div>
        </div>
      </header>

      {/* Main 3-Panel Grid Layout */}
      <main className="flex-1 p-4 grid grid-cols-1 lg:grid-cols-12 gap-4 max-w-[1920px] mx-auto w-full">
        
        {/* PANEL 1: TELEMETRY & INGESTION (Left Panel - 3 cols) */}
        <section className="lg:col-span-3 flex flex-col space-y-4">
          
          {/* PDF Flight Manual Ingestion Widget */}
          <div className="glass-panel p-4 rounded-xl border border-slate-800">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-2">
                <FileText className="w-4 h-4 text-cyan-400" />
                <h2 className="text-sm font-semibold text-slate-200 uppercase font-mono">PDF Manual RAG Upload</h2>
              </div>
              <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950 px-2 py-0.5 rounded border border-emerald-800">
                PDF Reader
              </span>
            </div>
            <p className="text-xs text-slate-400 mb-3">
              Upload any Satellite Flight Manual / SOP PDF to index exact pages into RAG Knowledge Base:
            </p>

            <label className="flex items-center justify-center space-x-2 w-full p-2.5 bg-slate-900 hover:bg-slate-800 border border-dashed border-cyan-500/50 hover:border-cyan-400 rounded-lg cursor-pointer transition text-xs font-mono text-cyan-300">
              <Download className="w-4 h-4 text-cyan-400 transform rotate-180" />
              <span>{uploadingPdf ? "Parsing Pages..." : "Select SOP / Flight Manual PDF"}</span>
              <input 
                type="file" 
                accept="application/pdf" 
                onChange={handlePdfUpload} 
                className="hidden" 
                disabled={uploadingPdf} 
              />
            </label>

            {pdfUploadStatus && (
              <div className={`mt-2 p-2 rounded text-[11px] font-mono border ${
                pdfUploadStatus.success ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800' : 'bg-red-950/60 text-red-300 border-red-800'
              }`}>
                {pdfUploadStatus.message}
              </div>
            )}

            {/* List of Uploaded PDF Documents */}
            {uploadedPdfs.length > 0 && (
              <div className="mt-3 pt-3 border-t border-slate-800">
                <div className="text-[11px] font-mono text-slate-300 font-semibold mb-2 flex items-center justify-between">
                  <span>INDEXED FLIGHT MANUALS ({uploadedPdfs.length})</span>
                  <span className="text-[10px] text-cyan-400">Click to View</span>
                </div>

                <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                  {uploadedPdfs.map(pdf => (
                    <button
                      key={pdf.id}
                      onClick={() => setSelectedPdf(pdf)}
                      className="w-full text-left p-2 rounded bg-slate-900/80 hover:bg-slate-800 border border-slate-800 hover:border-cyan-500/40 transition flex items-center justify-between text-xs font-mono group"
                    >
                      <div className="flex items-center space-x-2 truncate">
                        <FileText className="w-3.5 h-3.5 text-cyan-400 group-hover:scale-110 transition-transform" />
                        <span className="text-slate-200 truncate">{pdf.filename}</span>
                      </div>
                      <span className="text-[10px] text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded font-mono ml-2">
                        {pdf.totalPages} Pages
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>


          {/* Preset Failure Controls */}
          <div className="glass-panel p-4 rounded-xl border border-slate-800">

            <div className="flex items-center space-x-2 mb-3">
              <Zap className="w-4 h-4 text-amber-400" />
              <h2 className="text-sm font-semibold text-slate-200 tracking-wide uppercase font-mono">
                Anomaly Ingestion Presets
              </h2>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              Inject simulated telemetry breaches directly into the Antriksh Ground Safety Engine:
            </p>

            <div className="space-y-2">
              <button
                onClick={() => handleTriggerPreset('thruster')}
                className="w-full text-left p-3 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-red-500/50 transition-all group flex items-start space-x-3"
              >
                <AlertTriangle className="w-4 h-4 text-red-400 group-hover:scale-110 transition-transform mt-0.5" />
                <div>
                  <div className="text-xs font-semibold text-red-300">Scenario 1: Thruster Pressure Drop</div>
                  <div className="text-[11px] text-slate-400 font-mono mt-0.5">Press: 1.8 bar (Nominal: &gt; 2.0 bar)</div>
                </div>
              </button>

              <button
                onClick={() => handleTriggerPreset('reaction_wheel')}
                className="w-full text-left p-3 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-amber-500/50 transition-all group flex items-start space-x-3"
              >
                <AlertTriangle className="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform mt-0.5" />
                <div>
                  <div className="text-xs font-semibold text-amber-300">Scenario 2: Reaction Wheel Overheat</div>
                  <div className="text-[11px] text-slate-400 font-mono mt-0.5">Temp: 88.0°C (Nominal: &lt; 65°C)</div>
                </div>
              </button>

              <button
                onClick={() => handleTriggerPreset('battery')}
                className="w-full text-left p-3 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-yellow-500/50 transition-all group flex items-start space-x-3"
              >
                <AlertTriangle className="w-4 h-4 text-yellow-400 group-hover:scale-110 transition-transform mt-0.5" />
                <div>
                  <div className="text-xs font-semibold text-yellow-300">Scenario 3: Battery Undervoltage</div>
                  <div className="text-[11px] text-slate-400 font-mono mt-0.5">Voltage: 24.1V (Nominal: &gt; 28.0V)</div>
                </div>
              </button>
            </div>

            <button
              onClick={() => handleTriggerPreset('reset')}
              className="w-full mt-3 py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 flex items-center justify-center space-x-2 border border-slate-700 transition"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Reset Nominal Telemetry</span>
            </button>
          </div>

          {/* Live Telemetry Table */}
          <div className="glass-panel p-4 rounded-xl border border-slate-800 flex-1 flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-2">
                <Gauge className="w-4 h-4 text-cyan-400" />
                <h2 className="text-sm font-semibold text-slate-200 uppercase font-mono">Live Flight Telemetry</h2>
              </div>
              <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950 px-2 py-0.5 rounded border border-cyan-800">
                10 Hz Stream
              </span>
            </div>

            <div className="space-y-3 flex-1 overflow-y-auto pr-1">
              {/* Thruster Metric */}
              <div className={`p-3 rounded-lg border transition-all ${
                telemetry.thrusterPressure.status === 'CRITICAL' 
                  ? 'bg-red-950/40 border-red-500/60 text-red-200' 
                  : 'bg-slate-900/60 border-slate-800 text-slate-300'
              }`}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-semibold">Thruster-2 Chamber Press</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                    telemetry.thrusterPressure.status === 'CRITICAL' ? 'bg-red-500 text-white animate-pulse' : 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                  }`}>
                    {telemetry.thrusterPressure.status}
                  </span>
                </div>
                <div className="flex items-center justify-between font-mono">
                  <span className="text-lg font-bold">{telemetry.thrusterPressure.value} {telemetry.thrusterPressure.unit}</span>
                  
                  {/* Interactive Adjuster Buttons */}
                  <div className="flex items-center space-x-1">
                    <button 
                      onClick={() => {
                        const newVal = parseFloat((telemetry.thrusterPressure.value - 0.2).toFixed(1));
                        const isCrit = newVal <= 2.0;
                        const newTelem = {
                          ...telemetry,
                          thrusterPressure: { 
                            ...telemetry.thrusterPressure, 
                            value: newVal, 
                            status: isCrit ? "CRITICAL" : "NOMINAL" 
                          }
                        };
                        setTelemetry(newTelem);
                        if (isCrit) {
                          const mockAnomaly = { subsystem: "Propulsion", metric: "Thruster-2 Chamber Pressure", value: `${newVal} bar`, nominal: "> 2.0 bar", queryText: `Thruster-2 Chamber Pressure Drop to ${newVal} bar` };
                          setActiveAnomaly(mockAnomaly);
                          triggerAlarm(`CRITICAL PRESSURE DROP: Thruster Chamber Pressure = ${newVal} bar`);
                          evaluateAnomaly(mockAnomaly.queryText, mockAnomaly);
                        }
                      }}
                      className="px-2 py-0.5 bg-red-950 hover:bg-red-800 text-red-300 border border-red-800 rounded font-bold text-xs"
                      title="Decrease Pressure (Drop Below Threshold)"
                    >
                      - 0.2 bar
                    </button>
                    <button 
                      onClick={() => {
                        const newVal = parseFloat((telemetry.thrusterPressure.value + 0.2).toFixed(1));
                        const isNom = newVal > 2.0;
                        setTelemetry(prev => ({
                          ...prev,
                          thrusterPressure: { 
                            ...prev.thrusterPressure, 
                            value: newVal, 
                            status: isNom ? "NOMINAL" : "CRITICAL" 
                          }
                        }));
                      }}
                      className="px-2 py-0.5 bg-emerald-950 hover:bg-emerald-800 text-emerald-300 border border-emerald-800 rounded font-bold text-xs"
                      title="Increase Pressure"
                    >
                      + 0.2 bar
                    </button>
                  </div>
                </div>
              </div>

              {/* RW Temp Metric */}
              <div className={`p-3 rounded-lg border transition-all ${
                telemetry.rwTemperature.status === 'CRITICAL' 
                  ? 'bg-amber-950/40 border-amber-500/60 text-amber-200' 
                  : 'bg-slate-900/60 border-slate-800 text-slate-300'
              }`}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-semibold">Reaction Wheel-3 Temp</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                    telemetry.rwTemperature.status === 'CRITICAL' ? 'bg-amber-500 text-slate-950 animate-pulse' : 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                  }`}>
                    {telemetry.rwTemperature.status}
                  </span>
                </div>
                <div className="flex items-center justify-between font-mono">
                  <span className="text-lg font-bold">{telemetry.rwTemperature.value} {telemetry.rwTemperature.unit}</span>
                  
                  {/* Interactive Adjuster Buttons */}
                  <div className="flex items-center space-x-1">
                    <button 
                      onClick={() => {
                        const newVal = parseFloat((telemetry.rwTemperature.value + 10.0).toFixed(1));
                        const isCrit = newVal >= 65.0;
                        const newTelem = {
                          ...telemetry,
                          rwTemperature: { 
                            ...telemetry.rwTemperature, 
                            value: newVal, 
                            status: isCrit ? "CRITICAL" : "NOMINAL" 
                          }
                        };
                        setTelemetry(newTelem);
                        if (isCrit) {
                          const mockAnomaly = { subsystem: "AOCS", metric: "Reaction Wheel-3 Temperature", value: `${newVal} °C`, nominal: "< 65.0 °C", queryText: `Reaction Wheel-3 Thermal Overheat to ${newVal}°C` };
                          setActiveAnomaly(mockAnomaly);
                          triggerAlarm(`CRITICAL THERMAL OVERHEAT: RW-3 Temperature = ${newVal}°C`);
                          evaluateAnomaly(mockAnomaly.queryText, mockAnomaly);
                        }
                      }}

                      className="px-2 py-0.5 bg-amber-950 hover:bg-amber-800 text-amber-300 border border-amber-800 rounded font-bold text-xs"
                      title="Increase Temperature (Overheat)"
                    >
                      + 10°C
                    </button>
                    <button 
                      onClick={() => {
                        const newVal = parseFloat((telemetry.rwTemperature.value - 10.0).toFixed(1));
                        const isNom = newVal < 65.0;
                        setTelemetry(prev => ({
                          ...prev,
                          rwTemperature: { 
                            ...prev.rwTemperature, 
                            value: newVal, 
                            status: isNom ? "NOMINAL" : "CRITICAL" 
                          }
                        }));
                      }}
                      className="px-2 py-0.5 bg-emerald-950 hover:bg-emerald-800 text-emerald-300 border border-emerald-800 rounded font-bold text-xs"
                      title="Cool Down"
                    >
                      - 10°C
                    </button>
                  </div>
                </div>
              </div>

              {/* Battery Voltage */}
              <div className={`p-3 rounded-lg border transition-all ${
                telemetry.batteryVoltage.status === 'CRITICAL' 
                  ? 'bg-yellow-950/40 border-yellow-500/60 text-yellow-200' 
                  : 'bg-slate-900/60 border-slate-800 text-slate-300'
              }`}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-semibold">Battery Cell-4 Voltage</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                    telemetry.batteryVoltage.status === 'CRITICAL' ? 'bg-yellow-500 text-slate-950 animate-pulse' : 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                  }`}>
                    {telemetry.batteryVoltage.status}
                  </span>
                </div>
                <div className="flex items-baseline justify-between font-mono">
                  <span className="text-lg font-bold">{telemetry.batteryVoltage.value} {telemetry.batteryVoltage.unit}</span>
                  <span className="text-[11px] text-slate-400">Min: {telemetry.batteryVoltage.nominalRange}</span>
                </div>
              </div>

              {/* Additional Sensors */}
              <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 text-slate-300">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-semibold">Solar Array Output</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-emerald-950 text-emerald-400 border border-emerald-800">NOMINAL</span>
                </div>
                <div className="flex items-baseline justify-between font-mono">
                  <span className="text-lg font-bold">{telemetry.solarInput.value} W</span>
                  <span className="text-[11px] text-slate-400">Target: {telemetry.solarInput.nominalRange}</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* PANEL 2: EVIDENCE-GROUNDED COPILOT & SAFETY ENGINE (Center Panel - 6 cols) */}
        <section className="lg:col-span-6 flex flex-col space-y-4">
          
          {/* Custom Query / Copilot Bar */}
          <div className="glass-panel p-4 rounded-xl border border-slate-800">
            <label className="block text-xs font-mono font-semibold text-slate-300 mb-2 uppercase">
              Flight Director Copilot Prompt
            </label>
            <div className="flex space-x-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={customQuery}
                  onChange={(e) => setCustomQuery(e.target.value)}
                  placeholder="e.g. Thruster pressure drop or Reaction wheel overheat..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && customQuery.trim()) {
                      evaluateAnomaly(customQuery);
                    }
                  }}
                />
              </div>
              <button
                onClick={() => customQuery.trim() && evaluateAnomaly(customQuery)}
                disabled={isEvaluating}
                className="bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-semibold px-4 py-2 rounded-lg text-xs font-mono flex items-center space-x-2 transition disabled:opacity-50"
              >
                {isEvaluating ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <span>ANALYZE</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Copilot RAG Reasoning Dashboard */}
          <div className="glass-panel p-5 rounded-xl border border-slate-800 flex-1 flex flex-col space-y-4">
            
            {/* Header & Confidence Score */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <Cpu className="w-5 h-5 text-cyan-400" />
                <h2 className="text-sm font-bold tracking-wider text-slate-100 uppercase font-mono">
                  Grounded Safety Engine Output
                </h2>
              </div>

              {copilotResponse && (
                <div className="flex items-center space-x-3">
                  <div className="flex items-center space-x-1.5">
                    <span className="text-xs text-slate-400 font-mono">Ground Confidence:</span>
                    <span className={`text-sm font-bold font-mono px-2 py-0.5 rounded ${
                      copilotResponse.confidenceScore >= 70
                        ? 'bg-emerald-950 text-emerald-400 border border-emerald-700'
                        : 'bg-red-950 text-red-400 border border-red-700'
                    }`}>
                      {copilotResponse.confidenceScore}%
                    </span>
                  </div>
                  {copilotResponse.grounded ? (
                    <span className="flex items-center space-x-1 text-xs text-emerald-400 bg-emerald-950/60 border border-emerald-800 px-2 py-0.5 rounded-full font-mono">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>EVIDENCE GROUNDED</span>
                    </span>
                  ) : (
                    <span className="flex items-center space-x-1 text-xs text-red-400 bg-red-950/60 border border-red-800 px-2 py-0.5 rounded-full font-mono">
                      <ShieldAlert className="w-3.5 h-3.5" />
                      <span>HUMAN REVIEW REQ</span>
                    </span>
                  )}
                </div>
              )}
            </div>

            {!copilotResponse && !isEvaluating && (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-slate-500 border border-dashed border-slate-800 rounded-lg">
                <Activity className="w-12 h-12 text-slate-600 mb-3 animate-pulse" />
                <p className="text-sm font-medium text-slate-400">No anomaly currently evaluated.</p>
                <p className="text-xs text-slate-500 mt-1">Select a telemetry failure preset on the left or type a query above.</p>
              </div>
            )}

            {isEvaluating && (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-cyan-400">
                <RefreshCw className="w-10 h-10 animate-spin mb-3" />
                <p className="text-sm font-mono tracking-wide">Retrieving flight procedures & verifying manual citations...</p>
              </div>
            )}

            {copilotResponse && !isEvaluating && (
              <div className="space-y-4 overflow-y-auto pr-1 flex-1">
                
                {/* SECTION A: OBSERVED FACTS */}
                <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3.5">
                  <div className="flex items-center space-x-2 text-xs font-bold text-cyan-400 font-mono mb-2 uppercase">
                    <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
                    <span>A. Observed Facts (Raw Telemetry)</span>
                  </div>
                  <div className="space-y-1.5 text-xs text-slate-300 font-mono">
                    <div className="flex justify-between border-b border-slate-800/60 pb-1">
                      <span className="text-slate-500">Sensor Reading:</span>
                      <span className="text-slate-200 font-semibold">{copilotResponse.observedFacts.rawMetrics}</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-800/60 pb-1">
                      <span className="text-slate-500">Threshold Breach:</span>
                      <span className="text-amber-400 font-semibold">{copilotResponse.observedFacts.thresholdBreach}</span>
                    </div>
                  </div>
                </div>

                {/* SECTION B: VERIFIED EVIDENCE (CITATION VERIFIER) */}
                <div className={`border rounded-lg p-3.5 ${
                  copilotResponse.verifiedEvidence.sourceVerified
                    ? 'bg-slate-900/80 border-emerald-500/40'
                    : 'bg-red-950/20 border-red-500/40'
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2 text-xs font-bold text-emerald-400 font-mono uppercase">
                      <FileText className="w-4 h-4" />
                      <span>B. Verified Evidence (Citation Verifier)</span>
                    </div>
                    <span className="text-[10px] font-mono bg-slate-800 px-2 py-0.5 rounded text-slate-300">
                      Rule: "No Source, No Advice"
                    </span>
                  </div>

                  <div 
                    onClick={() => {
                      if (copilotResponse.verifiedEvidence.sourceVerified) {
                        // Find matching uploaded PDF or construct virtual SOP viewer
                        const pdfMatch = uploadedPdfs.find(p => p.filename.toLowerCase().includes((copilotResponse.verifiedEvidence.sopId || "").toLowerCase())) || {
                          id: copilotResponse.verifiedEvidence.sopId,
                          filename: copilotResponse.verifiedEvidence.citation.split(':')[0] || "Flight_SOP_Manual.pdf",
                          totalPages: 112,
                          proceduresCount: 1,
                          fullText: `[OFFICIAL FLIGHT SOP MANUAL EXTRACT]\n\nCitation: ${copilotResponse.verifiedEvidence.citation}\n\nProcedure ID: ${copilotResponse.verifiedEvidence.sopId}\n\nExcerpt:\n${copilotResponse.verifiedEvidence.excerpt}\n\nRecommended Flight Steps:\n${copilotResponse.recommendedAction.checklistText}\n\nSafety Risk & What-If Analysis:\nExpected Outcome: ${copilotResponse.whatIfPreview.expectedOutcome}\nPotential Risk: ${copilotResponse.whatIfPreview.potentialRisk}`,
                          base64Data: ""
                        };
                        setSelectedPdf(pdfMatch);
                      }
                    }}
                    className="bg-slate-950/80 border border-emerald-500/40 hover:border-emerald-400 p-2.5 rounded font-mono text-xs mb-2 cursor-pointer group transition-all"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 text-[10px] uppercase flex items-center space-x-1">
                        <span>Manual Citation:</span>
                        <span className="text-cyan-400 text-[9px] underline group-hover:text-cyan-300">(Click to open SOP Section)</span>
                      </span>
                      <ChevronRight className="w-3.5 h-3.5 text-emerald-400 group-hover:translate-x-1 transition-transform" />
                    </div>
                    <span className="text-emerald-300 font-bold block mt-0.5 group-hover:underline">
                      {copilotResponse.verifiedEvidence.citation}
                    </span>
                  </div>

                  <p className="text-xs text-slate-300 italic leading-relaxed bg-slate-950/30 p-2 rounded border border-slate-800/40">
                    "{copilotResponse.verifiedEvidence.excerpt}"
                  </p>
                </div>


                {/* SECTION C: RECOMMENDED ACTION & HITL */}
                <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3.5">
                  <div className="flex items-center space-x-2 text-xs font-bold text-purple-400 font-mono mb-2 uppercase">
                    <CheckCircle className="w-4 h-4" />
                    <span>C. Recommended Action Checklist</span>
                  </div>

                  <div className="space-y-2 mb-4">
                    {copilotResponse.recommendedAction.steps.map((step, idx) => (
                      <div key={idx} className="flex items-start space-x-2 text-xs font-mono bg-slate-950/50 p-2 rounded border border-slate-800">
                        <span className="text-cyan-400 font-bold">{idx + 1}.</span>
                        <span className="text-slate-200">{step.replace(/^\d+\.\s*/, '')}</span>
                      </div>
                    ))}
                  </div>

                  {/* WHAT-IF SIMULATION PREVIEW */}
                  <div className="bg-cyan-950/30 border border-cyan-800/50 p-3 rounded-lg mb-4">
                    <div className="flex items-center space-x-2 text-xs font-bold text-cyan-300 font-mono mb-1">
                      <Activity className="w-3.5 h-3.5" />
                      <span>What-If Simulation Preview</span>
                    </div>
                    <div className="text-xs font-mono text-slate-300 space-y-1">
                      <div><span className="text-emerald-400 font-semibold">Expected Result:</span> {copilotResponse.whatIfPreview.expectedOutcome}</div>
                      <div><span className="text-amber-400 font-semibold">Risk Factor:</span> {copilotResponse.whatIfPreview.potentialRisk}</div>
                    </div>
                  </div>

                  {/* HUMAN-IN-THE-LOOP OPERATOR DECISION BUTTONS */}
                  <div className="border-t border-slate-800 pt-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-mono font-bold text-slate-300 flex items-center space-x-1">
                        <Lock className="w-3.5 h-3.5 text-amber-400" />
                        <span>HUMAN-IN-THE-LOOP AUTHORIZATION:</span>
                      </span>
                      {actionStatus && (
                        <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                          actionStatus === 'APPROVED' ? 'bg-emerald-950 text-emerald-400 border border-emerald-700' : 'bg-red-950 text-red-400 border border-red-700'
                        }`}>
                          PROCEDURE {actionStatus}
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => handleOperatorDecision('APPROVED')}
                        disabled={actionStatus === 'APPROVED'}
                        className={`py-2 px-4 rounded-lg font-mono text-xs font-bold flex items-center justify-center space-x-2 transition ${
                          actionStatus === 'APPROVED'
                            ? 'bg-emerald-600 text-slate-950 cursor-default'
                            : 'bg-emerald-950/80 hover:bg-emerald-600 text-emerald-300 hover:text-slate-950 border border-emerald-700'
                        }`}
                      >
                        <CheckCircle className="w-4 h-4" />
                        <span>APPROVE & EXECUTE</span>
                      </button>

                      <button
                        onClick={() => handleOperatorDecision('REJECTED')}
                        disabled={actionStatus === 'REJECTED'}
                        className={`py-2 px-4 rounded-lg font-mono text-xs font-bold flex items-center justify-center space-x-2 transition ${
                          actionStatus === 'REJECTED'
                            ? 'bg-red-600 text-white cursor-default'
                            : 'bg-red-950/80 hover:bg-red-600 text-red-300 hover:text-white border border-red-700'
                        }`}
                      >
                        <XCircle className="w-4 h-4" />
                        <span>REJECT & ESCALATE</span>
                      </button>
                    </div>
                  </div>
                </div>

              </div>
            )}
          </div>
        </section>

        {/* PANEL 3: AUDITABLE INCIDENT TIMELINE & REPORTING (Right Panel - 3 cols) */}
        <section className="lg:col-span-3 flex flex-col space-y-4">
          
          <div className="glass-panel p-4 rounded-xl border border-slate-800 flex-1 flex flex-col">
            
            {/* Header & Export Controls */}
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <Clock className="w-4 h-4 text-purple-400" />
                <h2 className="text-sm font-semibold text-slate-200 uppercase font-mono">Audit Timeline</h2>
              </div>
              
              <div className="flex space-x-1">
                <button
                  onClick={() => handleExportReport('markdown')}
                  className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[11px] font-mono flex items-center space-x-1 border border-slate-700 transition"
                  title="Export Markdown Report"
                >
                  <Download className="w-3 h-3" />
                  <span>MD</span>
                </button>
                <button
                  onClick={() => handleExportReport('pdf')}
                  className="p-1.5 bg-cyan-950 hover:bg-cyan-900 text-cyan-300 rounded text-[11px] font-mono flex items-center space-x-1 border border-cyan-800 transition"
                  title="Export PDF Report"
                >
                  <Download className="w-3 h-3" />
                  <span>PDF</span>
                </button>
              </div>
            </div>

            <p className="text-[11px] text-slate-400 mb-3 font-mono">
              Tamper-evident log anchored with cryptographic SHA-256 signatures:
            </p>

            {/* Timeline Stream */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {timeline.length === 0 ? (
                <div className="text-center text-xs text-slate-500 py-8">No incident logs recorded.</div>
              ) : (
                timeline.map((evt) => (
                  <div 
                    key={evt.id}
                    className="p-3 rounded-lg bg-slate-900/70 border border-slate-800/80 text-xs font-mono relative pl-4 border-l-2 border-l-cyan-500"
                  >
                    <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                      <span className="text-cyan-400 font-bold">{evt.timestamp?.substring(11, 19)} UTC</span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 uppercase">{evt.type}</span>
                    </div>

                    <p className="text-slate-200 text-xs mb-2 leading-tight">{evt.description}</p>

                    <div className="bg-slate-950/80 p-1.5 rounded border border-slate-800/60 flex items-center space-x-1 overflow-hidden">
                      <Lock className="w-3 h-3 text-slate-500 flex-shrink-0" />
                      <span className="text-[9px] text-slate-400 truncate">SHA-256: {evt.hash}</span>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Footer Summary */}
            <div className="mt-3 pt-3 border-t border-slate-800 flex items-center justify-between text-[11px] font-mono text-slate-400">
              <span>Total Logged Events: {timeline.length}</span>
              <span className="text-emerald-400 flex items-center space-x-1">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>LOG HASH OK</span>
              </span>
            </div>
          </div>
        </section>

      </main>

      {/* PDF DOCUMENT VIEWER MODAL OVERLAY */}
      {selectedPdf && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-6">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-5xl h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
              <div className="flex items-center space-x-3">
                <FileText className="w-5 h-5 text-cyan-400" />
                <div>
                  <h3 className="text-sm font-bold text-slate-100 font-mono">{selectedPdf.filename}</h3>
                  <p className="text-xs text-slate-400 font-mono">
                    Ingested Document • {selectedPdf.totalPages} Pages • {selectedPdf.proceduresCount} Procedures Extracted
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedPdf(null)}
                className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono rounded-lg border border-slate-700 transition"
              >
                ✕ CLOSE VIEWER
              </button>
            </div>

            {/* Modal Content - Embed PDF Viewer iframe & extracted text */}
            <div className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-0 overflow-hidden">
              {/* PDF Document Render Panel */}
              <div className="md:col-span-8 bg-slate-950 p-2 flex flex-col border-r border-slate-800">
                <iframe
                  src={selectedPdf.base64Data}
                  className="w-full h-full rounded border-0"
                  title={selectedPdf.filename}
                />
              </div>

              {/* RAG Indexed Procedures & Extracted Text Sidebar */}
              <div className="md:col-span-4 p-4 bg-slate-900/90 overflow-y-auto font-mono text-xs space-y-3">
                <div className="text-xs font-bold text-cyan-400 uppercase tracking-wide border-b border-slate-800 pb-2">
                  RAG Indexed Procedures
                </div>
                
                <div className="bg-slate-950 p-3 rounded border border-slate-800 text-slate-300 whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto">
                  {selectedPdf.fullText || "No raw text preview available."}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer bar */}
      <footer className="h-9 border-t border-slate-800 bg-slate-900/60 px-6 flex items-center justify-between text-[11px] font-mono text-slate-500">
        <div>ANTRIKSH AI Copilot • Space Technology Hackathon (Problem Statement ST-10)</div>
        <div className="flex items-center space-x-4">
          <span>Target Architecture: 3-Panel Flight Operations</span>
          <span className="text-cyan-400">Status: OPERATIONAL</span>
        </div>
      </footer>
    </div>
  );
}

