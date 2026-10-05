import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import multer from 'multer';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pdfParseModule = require('pdf-parse');
const pdfParse = typeof pdfParseModule === 'function' ? pdfParseModule : (pdfParseModule.default || pdfParseModule);

const upload = multer({ storage: multer.memoryStorage() });



const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;


// Knowledge Base: SOPs and Incident Logs
const KNOWLEDGE_BASE = [
  {
    id: "SOP-PROP-001",
    manual: "Propulsion SOP Rev-4",
    section: "Section 4.2",
    page: "Page 58",
    title: "Thruster Pressure Anomaly Protocol",
    keywords: ["thruster", "pressure", "drop", "chamber", "propulsion"],
    content: "If Thruster Chamber Pressure drops below nominal threshold (2.0 bar), isolate Branch-A Fuel Line Valve (V-PROP-A1) and engage Secondary Thruster Branch-B. Check oxidizer purge valve status before re-ignition attempt.",
    recommendedAction: "1. Command isolation of Branch-A Valve (V-PROP-A1).\n2. Switch main manifold feed to Secondary Branch-B.\n3. Verify Chamber-2 pressure stabilization > 2.0 bar.",
    expectedOutcome: "Pressure stabilizes to ~2.3 bar within 45s",
    potentialRisk: "Temporary attitude variance (~0.4 deg) and minor impulse decay during switchover."
  },
  {
    id: "SOP-AOCS-012",
    manual: "AOCS Flight Handbook Vol-2",
    section: "Section 8.1.3",
    page: "Page 112",
    title: "Reaction Wheel Thermal Overheat Protocol",
    keywords: ["reaction wheel", "thermal", "overheat", "temperature", "rw-3"],
    content: "When Reaction Wheel temperature exceeds nominal operational ceiling (>65°C), initiate active momentum desaturation via magnetorquers (MTQ-X/Y). Dump 4.2 Nms stored momentum and throttle wheel speed down to < 1200 RPM.",
    recommendedAction: "1. Activate Magnetic Torquer Desaturation Mode (MTQ-DESAT-ENABLE).\n2. Reduce RW-3 target speed by 40%.\n3. Monitor thermistor TH-RW3 for thermal recovery below 60°C.",
    expectedOutcome: "RW-3 temperature drops below 60°C within 15 minutes",
    potentialRisk: "Momentary slew rate reduction during magnetic momentum dump sequence."
  },
  {
    id: "SOP-EPS-005",
    manual: "EPS Emergency Operational Guide",
    section: "Section 3.4.1",
    page: "Page 34",
    title: "Battery Cell Undervoltage Recovery",
    keywords: ["battery", "voltage", "low voltage", "undervoltage", "cell-4", "power"],
    content: "If battery bus voltage drops below critical baseline (28.0V), immediately sheds non-essential payload power loads (Load Bank B - Scientific Imager & Radar Synthesizer). Set solar array orientation to Max-Sun-Tracking-Angle (STA-90).",
    recommendedAction: "1. Execute automated Shed Payload Load Bank B (CMD-EPS-SHED-B).\n2. Re-orient Solar Array Drive Assembly (SADA) to +90° Sun Vector.\n3. Verify bus voltage charge recovery > 28.5V.",
    expectedOutcome: "Bus voltage recovers to > 28.5V within 10 orbital minutes",
    potentialRisk: "Temporary suspension of scientific payload telemetry acquisition."
  }
];

// In-memory state storage
let telemetryState = {
  thrusterPressure: { value: 2.4, status: "NOMINAL", unit: "bar", nominalRange: "> 2.0 bar" },
  rwTemperature: { value: 48.2, status: "NOMINAL", unit: "°C", nominalRange: "< 65.0 °C" },
  batteryVoltage: { value: 31.2, status: "NOMINAL", unit: "V", nominalRange: "> 28.0 V" },
  solarInput: { value: 420.5, status: "NOMINAL", unit: "W", nominalRange: "> 350.0 W" },
  busCurrent: { value: 12.4, status: "NOMINAL", unit: "A", nominalRange: "10-15 A" }
};

let incidentTimeline = [];

// Helper function to calculate SHA-256 hash for audit logs
function generateAuditHash(timestamp, eventDescription, eventData) {
  const payload = `${timestamp}:${eventDescription}:${JSON.stringify(eventData)}`;
  return crypto.createHash('sha256').update(payload).digest('hex');
}

// Initial system startup log
const initTimestamp = new Date().toISOString();
incidentTimeline.push({
  id: "EVT-INIT-001",
  timestamp: initTimestamp,
  type: "SYSTEM_BOOT",
  description: "Antriksh AI Mission Operations Engine Initialized. Knowledge Base Loaded (3 SOPs).",
  hash: generateAuditHash(initTimestamp, "SYSTEM_BOOT", { status: "OK" }),
  operatorAction: "AUTO_SYSTEM"
});

// API Routes
app.get('/api/health', (req, res) => {
  res.json({ status: "ONLINE", copilot: "Antriksh AI v1.0", systemTime: new Date().toISOString() });
});

app.get('/api/telemetry', (req, res) => {
  res.json(telemetryState);
});

app.get('/api/knowledge-base', (req, res) => {
  res.json(KNOWLEDGE_BASE);
});

let uploadedPdfs = [];

app.get('/api/uploaded-pdfs', (req, res) => {
  res.json(uploadedPdfs);
});

app.get('/api/pdf-content/:id', (req, res) => {
  const pdfItem = uploadedPdfs.find(p => p.id === req.params.id);
  if (!pdfItem) {
    return res.status(404).json({ error: "PDF not found" });
  }
  res.json(pdfItem);
});

// PDF Manual Upload & Ingestion Endpoint
app.post('/api/upload-pdf', upload.single('pdfFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No PDF file uploaded" });
    }

    const dataBuffer = req.file.buffer;
    let pdfData;
    try {
      pdfData = await pdfParse(dataBuffer);
    } catch (parseErr) {
      // Fallback text extraction if complex PDF binary formatting
      pdfData = {
        numpages: 1,
        text: req.file.buffer.toString('utf8', 0, 4000) || "Ingested Flight Operation Document PDF"
      };
    }

    const filename = req.file.originalname;
    const totalPages = pdfData.numpages || 1;
    const fullText = pdfData.text || "";

    const pdfId = `PDF-${Date.now()}`;
    const base64Data = dataBuffer.toString('base64');

    // Split PDF into pseudo-pages / paragraphs to extract exact pages & procedures
    const paragraphs = fullText.split(/\n\s*\n/).filter(p => p.trim().length > 20);
    const validParagraphs = paragraphs.length > 0 ? paragraphs : [fullText || "Uploaded SOP Manual"];

    let addedSOPs = [];
    validParagraphs.forEach((para, idx) => {
      const estimatedPage = Math.min(totalPages, Math.floor((idx / validParagraphs.length) * totalPages) + 1);
      const lines = para.trim().split('\n').map(l => l.trim());
      const title = lines[0]?.substring(0, 60) || `Procedure ${idx + 1}`;

      const keywords = para.toLowerCase().match(/\b[a-z]{3,}\b/g) || [];

      const newSOP = {
        id: `SOP-PDF-${pdfId}-${idx}`,
        pdfId,
        manual: filename.replace(/\.pdf$/i, ''),
        section: `Section ${idx + 1}`,
        page: `Page ${estimatedPage}`,
        title: title || `Flight Procedure ${idx + 1}`,
        keywords: Array.from(new Set(keywords)).slice(0, 20),
        content: para.substring(0, 500),
        recommendedAction: `1. Follow procedures in ${filename} (Page ${estimatedPage}).\n2. Execute verified directive: ${title}\n3. Verify subsystem nominal telemetry.`,
        expectedOutcome: `Subsystem stabilization as specified in ${filename} Page ${estimatedPage}`,
        potentialRisk: `Refer to safety guidelines in ${filename}.`
      };

      KNOWLEDGE_BASE.unshift(newSOP);
      addedSOPs.push(newSOP);
    });

    const newPdfRecord = {
      id: pdfId,
      filename,
      totalPages,
      uploadTime: new Date().toISOString(),
      proceduresCount: addedSOPs.length,
      fullText: fullText.substring(0, 10000),
      base64Data: `data:application/pdf;base64,${base64Data}`
    };

    uploadedPdfs.unshift(newPdfRecord);

    const timestamp = new Date().toISOString();
    const auditDesc = `PDF UPLOAD: Indexed "${filename}" (${totalPages} Pages, ${addedSOPs.length} SOP Procedures Ingested)`;
    incidentTimeline.unshift({
      id: `EVT-${Date.now()}`,
      timestamp,
      type: "PDF_INGESTION",
      description: auditDesc,
      hash: generateAuditHash(timestamp, auditDesc, { filename, totalPages, sopCount: addedSOPs.length })
    });

    res.json({
      message: `Successfully ingested PDF: ${filename}`,
      pdfId,
      totalPages,
      proceduresIndexed: addedSOPs.length,
      sampleSOP: addedSOPs[0]
    });
  } catch (err) {
    console.error("PDF upload error:", err);
    res.status(500).json({ error: "Failed to parse PDF document", details: err.message });
  }
});



app.get('/api/timeline', (req, res) => {
  res.json(incidentTimeline);
});

// Anomaly trigger preset route
app.post('/api/trigger-preset', (req, res) => {
  const { scenarioId } = req.body;
  const timestamp = new Date().toISOString();
  let anomalyEvent = null;

  if (scenarioId === 'thruster') {
    telemetryState.thrusterPressure.value = 1.8;
    telemetryState.thrusterPressure.status = "CRITICAL";
    anomalyEvent = {
      subsystem: "Propulsion",
      metric: "Thruster-2 Chamber Pressure",
      value: "1.8 bar",
      nominal: "> 2.0 bar",
      queryText: "Thruster-2 Chamber Pressure Drop to 1.8 bar"
    };
  } else if (scenarioId === 'reaction_wheel') {
    telemetryState.rwTemperature.value = 88.0;
    telemetryState.rwTemperature.status = "CRITICAL";
    anomalyEvent = {
      subsystem: "AOCS",
      metric: "Reaction Wheel-3 Temperature",
      value: "88.0 °C",
      nominal: "< 65.0 °C",
      queryText: "Reaction Wheel-3 Thermal Overheat to 88°C"
    };
  } else if (scenarioId === 'battery') {
    telemetryState.batteryVoltage.value = 24.1;
    telemetryState.batteryVoltage.status = "CRITICAL";
    anomalyEvent = {
      subsystem: "EPS Power",
      metric: "Battery Cell-4 Voltage",
      value: "24.1 V",
      nominal: "> 28.0 V",
      queryText: "Battery Cell-4 Low Voltage at 24.1V"
    };
  } else if (scenarioId === 'reset') {
    telemetryState = {
      thrusterPressure: { value: 2.4, status: "NOMINAL", unit: "bar", nominalRange: "> 2.0 bar" },
      rwTemperature: { value: 48.2, status: "NOMINAL", unit: "°C", nominalRange: "< 65.0 °C" },
      batteryVoltage: { value: 31.2, status: "NOMINAL", unit: "V", nominalRange: "> 28.0 V" },
      solarInput: { value: 420.5, status: "NOMINAL", unit: "W", nominalRange: "> 350.0 W" },
      busCurrent: { value: 12.4, status: "NOMINAL", unit: "A", nominalRange: "10-15 A" }
    };
    
    const resetEntry = {
      id: `EVT-${Date.now()}`,
      timestamp,
      type: "SYSTEM_RESET",
      description: "Telemetry nominal state manually restored by operator.",
      hash: generateAuditHash(timestamp, "SYSTEM_RESET", telemetryState),
      operatorAction: "MANUAL_RESET"
    };
    incidentTimeline.unshift(resetEntry);
    return res.json({ message: "Telemetry reset to nominal", telemetry: telemetryState });
  }

  if (anomalyEvent) {
    const desc = `ANOMALY DETECTED: [${anomalyEvent.subsystem}] ${anomalyEvent.metric} = ${anomalyEvent.value} (Nominal: ${anomalyEvent.nominal})`;
    const auditEntry = {
      id: `EVT-${Date.now()}`,
      timestamp,
      type: "ANOMALY_TRIGGERED",
      description: desc,
      hash: generateAuditHash(timestamp, desc, anomalyEvent),
      data: anomalyEvent
    };
    incidentTimeline.unshift(auditEntry);
    res.json({ message: "Preset anomaly triggered", anomaly: anomalyEvent, telemetry: telemetryState });
  } else {
    res.status(400).json({ error: "Invalid scenarioId" });
  }
});

// Grounded RAG Query Engine Endpoint
app.post('/api/copilot/query', (req, res) => {
  const { queryText, metricContext } = req.body;
  const timestamp = new Date().toISOString();

  // Smart Search knowledge base for exact matched SOP or uploaded PDF procedures
  const searchLower = (queryText || "").toLowerCase();
  const searchWords = searchLower.split(/\s+/).filter(w => w.length > 2);

  // Score each SOP by matching query words in keywords, title, or content
  let bestMatch = null;
  let highestScore = 0;

  KNOWLEDGE_BASE.forEach(sop => {
    let score = 0;
    const fullSearchableText = `${sop.manual} ${sop.section} ${sop.title} ${sop.content} ${sop.keywords ? sop.keywords.join(' ') : ''}`.toLowerCase();
    
    searchWords.forEach(word => {
      if (fullSearchableText.includes(word)) {
        score += 10;
      }
    });

    if (sop.keywords) {
      sop.keywords.forEach(kw => {
        if (searchLower.includes(kw.toLowerCase())) {
          score += 20;
        }
      });
    }

    if (score > highestScore) {
      highestScore = score;
      bestMatch = sop;
    }
  });

  const matchedSOP = highestScore >= 10 ? bestMatch : null;

  let copilotResponse;

  if (matchedSOP) {
    // Grounded match found
    const verifiedCitation = `${matchedSOP.manual}.pdf, ${matchedSOP.section}, ${matchedSOP.page}: ${matchedSOP.title}`;
    copilotResponse = {
      grounded: true,
      confidenceScore: Math.min(98, 85 + highestScore),
      observedFacts: {
        rawMetrics: metricContext ? `${metricContext.subsystem} ${metricContext.metric} = ${metricContext.value}` : `Query: "${queryText}"`,
        thresholdBreach: metricContext ? `Current value (${metricContext.value}) violated rule condition (${metricContext.nominal})` : `Ingested Symptom matching Flight SOP Index [${matchedSOP.manual}]`,
        timestamp
      },
      verifiedEvidence: {
        citation: verifiedCitation,
        sopId: matchedSOP.id,
        excerpt: matchedSOP.content,
        sourceVerified: true
      },
      recommendedAction: {
        sopId: matchedSOP.id,
        checklistText: matchedSOP.recommendedAction,
        steps: matchedSOP.recommendedAction.split('\n').filter(s => s.trim().length > 0)
      },
      whatIfPreview: {
        expectedOutcome: matchedSOP.expectedOutcome,
        potentialRisk: matchedSOP.potentialRisk
      }
    };
  } else {

    // Low confidence / No verified source available
    copilotResponse = {
      grounded: false,
      confidenceScore: 42,
      observedFacts: {
        rawMetrics: queryText || "Unknown telemetry anomaly",
        thresholdBreach: "No direct SOP rule mapping matched in standard Flight Manual Index",
        timestamp
      },
      verifiedEvidence: {
        citation: "UNVERIFIED: No Flight SOP match found",
        sopId: "N/A",
        excerpt: "No ground-verified documentation matches the provided symptom.",
        sourceVerified: false
      },
      recommendedAction: {
        sopId: "N/A",
        checklistText: "HUMAN REVIEW REQUIRED: Requesting Flight Director & Subsystem Specialist Manual Intervention.",
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

  // Log Copilot Query in Audit Timeline
  const logDesc = `COPILOT QUERY: "${queryText}" -> Grounded: ${copilotResponse.grounded} (Score: ${copilotResponse.confidenceScore}%)`;
  const auditEntry = {
    id: `EVT-${Date.now()}`,
    timestamp,
    type: "COPILOT_EVALUATION",
    description: logDesc,
    hash: generateAuditHash(timestamp, logDesc, copilotResponse),
    data: copilotResponse
  };
  incidentTimeline.unshift(auditEntry);

  res.json(copilotResponse);
});

// Operator Action (Approve / Reject) Endpoint
app.post('/api/copilot/action', (req, res) => {
  const { sopId, actionType, operatorNotes } = req.body; // actionType: 'APPROVED' | 'REJECTED'
  const timestamp = new Date().toISOString();

  const actionDesc = `HUMAN-IN-THE-LOOP: Operator ${actionType} procedure [${sopId}]. Notes: ${operatorNotes || 'None'}`;
  
  const auditEntry = {
    id: `EVT-${Date.now()}`,
    timestamp,
    type: `OPERATOR_${actionType}`,
    description: actionDesc,
    hash: generateAuditHash(timestamp, actionDesc, { sopId, actionType, operatorNotes }),
    data: { sopId, actionType, operatorNotes }
  };

  incidentTimeline.unshift(auditEntry);

  res.json({ message: `Action ${actionType} recorded in timeline`, auditEntry });
});

app.listen(PORT, () => {
  console.log(`[ANTRIKSH AI] Backend Server running on port ${PORT}`);
});
