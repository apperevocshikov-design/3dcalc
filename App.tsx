import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Calculator as IconCalculator,
  Cylinder,
  Printer as IconPrinter,
  Sliders,
  Sparkle,
  Plus,
  Trash2,
  X,
  FileCode,
  UploadCloud,
  FileCheck,
  Check,
  Info,
  HelpCircle,
  Share2,
  DollarSign,
  Download,
  Rotate3d,
  ZoomIn,
  Eye,
  EyeOff,
  Copy,
  Receipt,
  Settings,
  ShieldAlert,
  Zap,
  PiggyBank
} from "lucide-react";

const imgBambu = "/src/assets/images/bambu_x1c_1780342267575.png";
const imgEnder = "/src/assets/images/ender_3_1780342287805.png";
const imgResin = "/src/assets/images/anycubic_resin_1780342305400.png";
const imgGeneric = "/src/assets/images/generic_printer_1780342324722.png";
const imgPrusa = "/src/assets/images/prusa_mk4_photo_1780343012760.png";
const imgVoron = "/src/assets/images/voron_24_photo_1780343032507.png";
const imgDelta = "/src/assets/images/delta_printer_photo_1780343049488.png";

export function getPrinterImage(name: string): string {
  const norm = name.toLowerCase();
  if (norm.includes("bambu") || norm.includes("x1") || norm.includes("p1") || norm.includes("a1 mini")) {
    return imgBambu;
  }
  if (norm.includes("prusa") || norm.includes("пруса")) {
    return imgPrusa;
  }
  if (norm.includes("voron") || norm.includes("ворон")) {
    return imgVoron;
  }
  if (norm.includes("delta") || norm.includes("flsun") || norm.includes("дельта")) {
    return imgDelta;
  }
  if (norm.includes("resin") || norm.includes("photon") || norm.includes("mono") || norm.includes("sla") || norm.includes("anycubic") || norm.includes("saturn") || norm.includes("mars") || norm.includes("смол")) {
    return imgResin;
  }
  if (norm.includes("ender") || norm.includes("creality") || norm.includes("diy") || norm.includes("fdm") || norm.includes("крупно") || norm.includes("neptune") || norm.includes("artillery") || norm.includes("bear") || norm.includes("kingroon")) {
    return imgEnder;
  }
  return imgGeneric;
}

// ==========================================
// 1. TYPE DECLARATIONS (formerly types.ts)
// ==========================================

export interface Material {
  id: string;
  name: string;
  density: number; // in g/cm³
  pricePerKg: number; // in RUB
}

export interface Printer {
  id: string;
  name: string;
  powerRating: number; // in Watts (W)
  hourlyAmortization: number; // cost per hour in RUB
}

export interface CustomSettings {
  electricityTariff: number; // RUB per kWh
  markupPercentage: number; // percentage profit to add (e.g. 100%)
  prepCostFlat: number; // flat fee for slicing / prep (RUB)
  failureRatePercent: number; // buffer for prints safety margin (e.g. 10%)
  postProcessingHours: number; // hours spent painting/sanding
  postProcessingHourlyRate: number; // RUB per hour for manual labor
}

export interface CalculationResult {
  fileName: string;
  volumeMm3: number; // Volume calculated for STL
  weightGrams: number; // Filament weight
  materialCost: number; // Cost of plastic
  printTimeHours: number; // Total print time in decimal hours
  electricityCost: number; // Cost of spent electricity
  printerAmortizationCost: number; // Amortization cost
  postProcessingCost: number; // Manual labor fee
  prepCost: number; // Slicing & prep fee
  failureBufferCost: number; // Raw cost buffer for safety margin
  totalCostPrice: number; // Raw cost price (Себестоимость)
  clientPrice: number; // Price with markup (Для клиента)
}

export interface ModelMetadata {
  name: string;
  vertices?: Float32Array;
  faces?: Uint32Array;
  normals?: Float32Array;
}

// ==========================================
// 2. PARSERS DECLARATIONS
// ==========================================

export interface ParsedSTL {
  volumeMm3: number;
  boundingBox: {
    width: number;
    depth: number;
    height: number;
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;
  };
  renderingData: {
    vertices: Float32Array;
    normals: Float32Array;
  };
}

export function parseSTL(arrayBuffer: ArrayBuffer): ParsedSTL {
  const textDecoder = new TextDecoder("utf-8");
  const headerBytes = new Uint8Array(arrayBuffer, 0, Math.min(arrayBuffer.byteLength, 100));
  const headerString = textDecoder.decode(headerBytes).trim();
  
  if (headerString.startsWith("solid") && !isBinarySTLPreview(arrayBuffer)) {
    return parseAsciiSTL(textDecoder.decode(arrayBuffer));
  } else {
    return parseBinarySTL(arrayBuffer);
  }
}

function isBinarySTLPreview(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 84) return false;
  const view = new DataView(buffer);
  const triCount = view.getUint32(80, true);
  const expectedSize = 80 + 4 + triCount * 50;
  return buffer.byteLength === expectedSize;
}

function parseBinarySTL(buffer: ArrayBuffer): ParsedSTL {
  const view = new DataView(buffer);
  const triCount = view.getUint32(80, true);

  let totalVolume = 0;
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;

  const MAX_RENDER_TRIS = 20000;
  const renderTriCount = Math.min(triCount, MAX_RENDER_TRIS);
  const vertices = new Float32Array(renderTriCount * 3 * 3);
  const normals = new Float32Array(renderTriCount * 3);

  let renderIdx = 0;
  const skipStep = Math.max(1, Math.floor(triCount / MAX_RENDER_TRIS));

  for (let i = 0; i < triCount; i++) {
    const offset = 84 + i * 50;
    if (offset + 50 > buffer.byteLength) break;

    const nx = view.getFloat32(offset, true);
    const ny = view.getFloat32(offset + 4, true);
    const nz = view.getFloat32(offset + 8, true);

    const v1x = view.getFloat32(offset + 12, true);
    const v1y = view.getFloat32(offset + 16, true);
    const v1z = view.getFloat32(offset + 20, true);

    const v2x = view.getFloat32(offset + 24, true);
    const v2y = view.getFloat32(offset + 28, true);
    const v2z = view.getFloat32(offset + 32, true);

    const v3x = view.getFloat32(offset + 36, true);
    const v3y = view.getFloat32(offset + 40, true);
    const v3z = view.getFloat32(offset + 44, true);

    if (v1x < minX) minX = v1x; if (v1x > maxX) maxX = v1x;
    if (v1y < minY) minY = v1y; if (v1y > maxY) maxY = v1y;
    if (v1z < minZ) minZ = v1z; if (v1z > maxZ) maxZ = v1z;

    if (v2x < minX) minX = v2x; if (v2x > maxX) maxX = v2x;
    if (v2y < minY) minY = v2y; if (v2y > maxY) maxY = v2y;
    if (v2z < minZ) minZ = v2z; if (v2z > maxZ) maxZ = v2z;

    if (v3x < minX) minX = v3x; if (v3x > maxX) maxX = v3x;
    if (v3y < minY) minY = v3y; if (v3y > maxY) maxY = v3y;
    if (v3z < minZ) minZ = v3z; if (v3z > maxZ) maxZ = v3z;

    const v321 = v3x * v2y * v1z;
    const v231 = v2x * v3y * v1z;
    const v312 = v3x * v1y * v2z;
    const v132 = v1x * v3y * v2z;
    const v213 = v2x * v1y * v3z;
    const v123 = v1x * v2y * v3z;
    
    const signedVolumeTriangle = (1.0 / 6.0) * (-v321 + v231 + v312 - v132 - v213 + v123);
    totalVolume += signedVolumeTriangle;

    if (i % skipStep === 0 && renderIdx < renderTriCount) {
      const vOffset = renderIdx * 9;
      const nOffset = renderIdx * 3;

      normals[nOffset] = nx;
      normals[nOffset + 1] = ny;
      normals[nOffset + 2] = nz;

      vertices[vOffset] = v1x;
      vertices[vOffset + 1] = v1y;
      vertices[vOffset + 2] = v1z;

      vertices[vOffset + 3] = v2x;
      vertices[vOffset + 4] = v2y;
      vertices[vOffset + 5] = v2z;

      vertices[vOffset + 6] = v3x;
      vertices[vOffset + 7] = v3y;
      vertices[vOffset + 8] = v3z;

      renderIdx++;
    }
  }

  const finalVertices = vertices.slice(0, renderIdx * 9);
  const finalNormals = normals.slice(0, renderIdx * 3);

  return {
    volumeMm3: Math.abs(totalVolume),
    boundingBox: {
      width: isFinite(minX) ? maxX - minX : 0,
      depth: isFinite(minY) ? maxY - minY : 0,
      height: isFinite(minZ) ? maxZ - minZ : 0,
      minX: isFinite(minX) ? minX : 0,
      maxX: isFinite(minX) ? maxX : 0,
      minY: isFinite(minY) ? minY : 0,
      maxY: isFinite(minY) ? maxY : 0,
      minZ: isFinite(minZ) ? minZ : 0,
      maxZ: isFinite(minZ) ? maxZ : 0,
    },
    renderingData: {
      vertices: finalVertices,
      normals: finalNormals,
    },
  };
}

function parseAsciiSTL(text: string): ParsedSTL {
  let totalVolume = 0;
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;

  const lines = text.split(/\r?\n/);
  const tempVertices: number[] = [];
  const tempNormals: number[] = [];

  let currentNormal: [number, number, number] = [0, 0, 0];
  let currentTriangle: [number, number, number][] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim().toLowerCase();
    if (!line) continue;

    if (line.startsWith("facet normal")) {
      const parts = line.split(/\s+/);
      const nx = parseFloat(parts[2]) || 0;
      const ny = parseFloat(parts[3]) || 0;
      const nz = parseFloat(parts[4]) || 0;
      currentNormal = [nx, ny, nz];
    } else if (line.startsWith("vertex")) {
      const parts = line.split(/\s+/);
      const x = parseFloat(parts[1]) || 0;
      const y = parseFloat(parts[2]) || 0;
      const z = parseFloat(parts[3]) || 0;
      currentTriangle.push([x, y, z]);

      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    } else if (line.startsWith("endfacet")) {
      if (currentTriangle.length === 3) {
        const p1 = currentTriangle[0];
        const p2 = currentTriangle[1];
        const p3 = currentTriangle[2];

        const v321 = p3[0] * p2[1] * p1[2];
        const v231 = p2[0] * p3[1] * p1[2];
        const v312 = p3[0] * p1[1] * p2[2];
        const v132 = p1[0] * p3[1] * p2[2];
        const v213 = p2[0] * p1[1] * p3[2];
        const v123 = p1[0] * p2[1] * p3[2];

        const signedVolumeTriangle = (1.0 / 6.0) * (-v321 + v231 + v312 - v132 - v213 + v123);
        totalVolume += signedVolumeTriangle;

        if (tempVertices.length < 180000) {
          tempNormals.push(...currentNormal);
          tempVertices.push(...p1, ...p2, ...p3);
        }
      }
      currentTriangle = [];
    }
  }

  return {
    volumeMm3: Math.abs(totalVolume),
    boundingBox: {
      width: isFinite(minX) ? maxX - minX : 0,
      depth: isFinite(minY) ? maxY - minY : 0,
      height: isFinite(minZ) ? maxZ - minZ : 0,
      minX: isFinite(minX) ? minX : 0,
      maxX: isFinite(minX) ? maxX : 0,
      minY: isFinite(minY) ? minY : 0,
      maxY: isFinite(minY) ? maxY : 0,
      minZ: isFinite(minZ) ? minZ : 0,
      maxZ: isFinite(minZ) ? maxZ : 0,
    },
    renderingData: {
      vertices: new Float32Array(tempVertices),
      normals: new Float32Array(tempNormals),
    },
  };
}

export interface ParsedGcode {
  weightGrams: number;
  printTimeHours: number;
  slicerFound: string;
}

export function parseGcode(arrayBuffer: ArrayBuffer): ParsedGcode {
  const byteLength = arrayBuffer.byteLength;
  const decoder = new TextDecoder("utf-8");

  const headerSize = Math.min(byteLength, 20480);
  const headerBytes = new Uint8Array(arrayBuffer, 0, headerSize);
  const headerText = decoder.decode(headerBytes);

  const footerSize = Math.min(byteLength, 61440);
  const footerBytes = new Uint8Array(arrayBuffer, byteLength - footerSize, footerSize);
  const footerText = decoder.decode(footerBytes);

  const combinedText = headerText + "\n---SPLIT---\n" + footerText;
  const lines = combinedText.split(/\r?\n/);

  let weightGrams = 0;
  let printTimeSeconds = 0;
  let slicerFound = "Generic Gcode Classifier";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (line.includes("generated by PrusaSlicer")) {
      slicerFound = "PrusaSlicer";
    } else if (line.includes("generated by Cura")) {
      slicerFound = "UltiMaker Cura";
    } else if (line.includes("generated by Bambu Studio")) {
      slicerFound = "Bambu Studio";
    } else if (line.includes("generated by OrcaSlicer")) {
      slicerFound = "OrcaSlicer";
    } else if (line.includes("generated by Simplify3D")) {
      slicerFound = "Simplify3D";
    }

    if (line.match(/;\s*filament used\s*\[g\]\s*=\s*([\d.]+)/i)) {
      const match = line.match(/;\s*filament used\s*\[g\]\s*=\s*([\d.]+)/i);
      if (match) weightGrams = parseFloat(match[1]);
    } else if (line.match(/;\s*total filament used\s*\[g\]\s*=\s*([\d.]+)/i)) {
      const match = line.match(/;\s*total filament used\s*\[g\]\s*=\s*([\d.]+)/i);
      if (match) weightGrams = parseFloat(match[1]);
    } else if (line.match(/;\s*filament used\s*\[cm3\]\s*=\s*([\d.]+)/i)) {
      const match = line.match(/;\s*filament used\s*\[cm3\]\s*=\s*([\d.]+)/i);
      if (match) {
        weightGrams = parseFloat(match[1]) * 1.24;
      }
    } else if (line.match(/;\s*filament used\s*:\s*([\d.]+)\s*g/i)) {
      const match = line.match(/;\s*filament used\s*:\s*([\d.]+)\s*g/i);
      if (match) weightGrams = parseFloat(match[1]);
    } else if (line.match(/;\s*filament used\s*:\s*([\d.]+)\s*m/i)) {
      const match = line.match(/;\s*filament used\s*:\s*([\d.]+)\s*m/i);
      if (match) {
        const meters = parseFloat(match[1]);
        weightGrams = meters * 2.98;
      }
    } else if (line.match(/;\s*filament weight\s*:\s*([\d.]+)\s*g/i)) {
      const match = line.match(/;\s*filament weight\s*:\s*([\d.]+)\s*g/i);
      if (match) weightGrams = parseFloat(match[1]);
    }

    if (line.match(/;\s*estimated printing time\s*\(normal mode\)\s*=\s*(.+)/i)) {
      const match = line.match(/;\s*estimated printing time\s*\(normal mode\)\s*=\s*(.+)/i);
      if (match) printTimeSeconds = parseDurationToSeconds(match[1]);
    } else if (line.match(/;\s*estimated printing time\s*=\s*(.+)/i)) {
      const match = line.match(/;\s*estimated printing time\s*=\s*(.+)/i);
      if (match) printTimeSeconds = parseDurationToSeconds(match[1]);
    } else if (line.match(/;\s*estimated_time_s\s*=\s*([\d.]+)/i)) {
      const match = line.match(/;\s*estimated_time_s\s*=\s*([\d.]+)/i);
      if (match) printTimeSeconds = parseFloat(match[1]);
    } else if (line.startsWith(";TIME:")) {
      const seconds = parseFloat(line.substring(6));
      if (!isNaN(seconds) && seconds > 0) {
        printTimeSeconds = seconds;
      }
    } else if (line.match(/;\s*build time\s*:\s*(.+)/i)) {
      const match = line.match(/;\s*build time\s*:\s*(.+)/i);
      if (match) printTimeSeconds = parseDurationToSeconds(match[1]);
    }
  }

  return {
    weightGrams: Math.round(weightGrams * 10) / 10,
    printTimeHours: printTimeSeconds > 0 ? printTimeSeconds / 3600 : 0,
    slicerFound,
  };
}

function parseDurationToSeconds(durationStr: string): number {
  let seconds = 0;
  
  const hMatch = durationStr.match(/(\d+)\s*(h|hour|hours)/i);
  if (hMatch) {
    seconds += parseInt(hMatch[1], 10) * 3600;
  }
  
  const mMatch = durationStr.match(/(\d+)\s*(m|min|minute|minutes)/i);
  if (mMatch) {
    seconds += parseInt(mMatch[1], 10) * 60;
  }

  const sMatch = durationStr.match(/(\d+)\s*(s|sec|second|seconds)/i);
  if (sMatch) {
    seconds += parseInt(sMatch[1], 10);
  }

  if (seconds === 0 && durationStr.includes(":")) {
    const parts = durationStr.split(":");
    if (parts.length === 3) {
      seconds += parseInt(parts[0], 10) * 3600;
      seconds += parseInt(parts[1], 10) * 60;
      seconds += parseInt(parts[2], 10);
    } else if (parts.length === 2) {
      seconds += parseInt(parts[0], 10) * 60;
      seconds += parseInt(parts[1], 10);
    }
  }

  return seconds;
}


// ==========================================
// 3. COMPONENTS DECLARATIONS
// ==========================================

// --- ThreeDCanvas.tsx ---
interface ThreeDCanvasProps {
  vertices: Float32Array;
  normals: Float32Array;
  boundingBox: {
    width: number;
    depth: number;
    height: number;
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;
  };
}

function ThreeDCanvas({ vertices, normals, boundingBox }: ThreeDCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [pitch, setPitch] = useState<number>(-0.6);
  const [yaw, setYaw] = useState<number>(0.7);
  const [zoom, setZoom] = useState<number>(1.0);
  const [renderMode, setRenderMode] = useState<"solid" | "wireframe">("solid");

  const isDraggingRef = useRef<boolean>(false);
  const lastMousePosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const centerX = (boundingBox.minX + boundingBox.maxX) / 2;
  const centerY = (boundingBox.minY + boundingBox.maxY) / 2;
  const centerZ = (boundingBox.minZ + boundingBox.maxZ) / 2;

  const maxDim = Math.max(boundingBox.width, boundingBox.depth, boundingBox.height) || 10;

  const cosP = Math.cos(pitch);
  const sinP = Math.sin(pitch);
  const cosY = Math.cos(yaw);
  const sinY = Math.sin(yaw);

  const handleStart = (clientX: number, clientY: number) => {
    isDraggingRef.current = true;
    lastMousePosRef.current = { x: clientX, y: clientY };
  };

  const handleMove = (clientX: number, clientY: number) => {
    if (!isDraggingRef.current) return;
    const dx = clientX - lastMousePosRef.current.x;
    const dy = clientY - lastMousePosRef.current.y;

    setYaw((prev) => prev + dx * 0.012);
    setPitch((prev) => Math.max(-Math.PI / 2, Math.min(Math.PI / 2, prev + dy * 0.012)));

    lastMousePosRef.current = { x: clientX, y: clientY };
  };

  const handleEnd = () => {
    isDraggingRef.current = false;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = containerRef.current?.getBoundingClientRect().width || 380;
    const height = 280;
    canvas.width = width * window.devicePixelRatio;
    canvas.height = height * window.devicePixelRatio;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    const midX = width / 2;
    const midY = height / 2;

    const fitFactor = Math.min(width, height) * 0.45;
    const currentScale = (fitFactor / maxDim) * zoom;

    const triCount = vertices.length / 9;

    const lightDirX = 0.3;
    const lightDirY = 0.5;
    const lightDirZ = -0.8;
    const lightLen = Math.sqrt(lightDirX * lightDirX + lightDirY * lightDirY + lightDirZ * lightDirZ);
    const lx = lightDirX / lightLen;
    const ly = lightDirY / lightLen;
    const lz = lightDirZ / lightLen;

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      ctx.strokeStyle = "#e2e8f0";
      ctx.lineWidth = 0.5;
      for (let g = -4; g <= 4; g++) {
        const grX = midX + g * 25 * zoom;
        ctx.beginPath();
        ctx.moveTo(grX, midY - 100);
        ctx.lineTo(grX, midY + 100);
        ctx.stroke();

        const grY = midY + g * 25 * zoom;
        ctx.beginPath();
        ctx.moveTo(midX - 100, grY);
        ctx.lineTo(midX + 100, grY);
        ctx.stroke();
      }

      if (triCount === 0) {
        ctx.font = "14px Inter, sans-serif";
        ctx.fillStyle = "#64748b";
        ctx.textAlign = "center";
        ctx.fillText("Нет данных для 3D", midX, midY);
        return;
      }

      interface ProjectedTriangle {
        v1x: number; v1y: number;
        v2x: number; v2y: number;
        v3x: number; v3y: number;
        zDepth: number;
        shade: number;
      }

      const triangles: ProjectedTriangle[] = [];

      for (let i = 0; i < triCount; i++) {
        const vIdx = i * 9;
        const nIdx = i * 3;

        const x1 = vertices[vIdx] - centerX;
        const y1 = vertices[vIdx + 1] - centerY;
        const z1 = vertices[vIdx + 2] - centerZ;

        const x2 = vertices[vIdx + 3] - centerX;
        const y2 = vertices[vIdx + 4] - centerY;
        const z2 = vertices[vIdx + 5] - centerZ;

        const x3 = vertices[vIdx + 6] - centerX;
        const y3 = vertices[vIdx + 7] - centerY;
        const z3 = vertices[vIdx + 8] - centerZ;

        const r1x = x1 * cosY - z1 * sinY;
        const r1z = x1 * sinY + z1 * cosY;
        const r2x = x2 * cosY - z2 * sinY;
        const r2z = x2 * sinY + z2 * cosY;
        const r3x = x3 * cosY - z3 * sinY;
        const r3z = x3 * sinY + z3 * cosY;

        const r1y = y1 * cosP - r1z * sinP;
        const r1zFinal = y1 * sinP + r1z * cosP;
        const r2y = y2 * cosP - r2z * sinP;
        const r2zFinal = y2 * sinP + r2z * cosP;
        const r3y = y3 * cosP - r3z * sinP;
        const r3zFinal = y3 * sinP + r3z * cosP;

        const s1x = midX + r1x * currentScale;
        const s1y = midY - r1y * currentScale;

        const s2x = midX + r2x * currentScale;
        const s2y = midY - r2y * currentScale;

        const s3x = midX + r3x * currentScale;
        const s3y = midY - r3y * currentScale;

        const avgZ = r1zFinal + r2zFinal + r3zFinal;

        const nx = normals[nIdx];
        const ny = normals[nIdx + 1];
        const nz = normals[nIdx + 2];

        const rnx = nx * cosY - nz * sinY;
        const rnz = nx * sinY + nz * cosY;
        const rny = ny * cosP - rnz * sinP;
        const rnzFinal = ny * sinP + rnz * cosP;

        const dot = rnx * lx + rny * ly + rnzFinal * lz;
        const shade = Math.max(0, Math.min(1, 0.25 + 0.75 * Math.abs(dot)));

        triangles.push({
          v1x: s1x, v1y: s1y,
          v2x: s2x, v2y: s2y,
          v3x: s3x, v3y: s3y,
          zDepth: avgZ,
          shade
        });
      }

      triangles.sort((a, b) => b.zDepth - a.zDepth);

      if (renderMode === "solid") {
        for (let t = 0; t < triangles.length; t++) {
          const tri = triangles[t];
          const baseR = 37; 
          const baseG = 99; 
          const baseB = 235; // Bright Royal Blue
          ctx.fillStyle = `rgb(${Math.round(baseR * tri.shade)}, ${Math.round(baseG * tri.shade)}, ${Math.round(baseB * tri.shade)})`;

          ctx.beginPath();
          ctx.moveTo(tri.v1x, tri.v1y);
          ctx.lineTo(tri.v2x, tri.v2y);
          ctx.lineTo(tri.v3x, tri.v3y);
          ctx.closePath();
          ctx.fill();

          ctx.strokeStyle = `rgba(255, 255, 255, 0.08)`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      } else {
        ctx.strokeStyle = "#3b82f6";
        ctx.lineWidth = 0.5;
        for (let t = 0; t < triangles.length; t++) {
          const tri = triangles[t];
          ctx.beginPath();
          ctx.moveTo(tri.v1x, tri.v1y);
          ctx.lineTo(tri.v2x, tri.v2y);
          ctx.lineTo(tri.v3x, tri.v3y);
          ctx.closePath();
          ctx.stroke();
        }
      }

      ctx.fillStyle = "#1e293b";
      ctx.font = "bold 11px Inter, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(
        `X: ${boundingBox.width.toFixed(1)} мм | Y: ${boundingBox.depth.toFixed(1)} мм | Z: ${boundingBox.height.toFixed(1)} мм`,
        12,
        height - 12
      );

      ctx.fillStyle = "#64748b";
      ctx.font = "500 10px monospace";
      ctx.textAlign = "right";
      ctx.fillText(`Сетка: ${(vertices.length / 9).toLocaleString()} полигонов`, width - 12, height - 12);
    };

    render();
  }, [pitch, yaw, zoom, renderMode, vertices, normals, centerX, centerY, centerZ, cosP, sinP, cosY, sinY, maxDim, boundingBox]);

  const resetCamera = (direction: "front" | "top" | "iso") => {
    if (direction === "front") {
      setPitch(0);
      setYaw(0);
    } else if (direction === "top") {
      setPitch(-Math.PI / 2);
      setYaw(0);
    } else if (direction === "iso") {
      setPitch(-0.6);
      setYaw(0.7);
    }
    setZoom(1.0);
  };

  return (
    <div ref={containerRef} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 relative select-none shadow-sm">
      <div 
        className="w-full h-[280px] cursor-grab active:cursor-grabbing overflow-hidden rounded-lg relative touch-none bg-white"
        onMouseDown={(e) => handleStart(e.clientX, e.clientY)}
        onMouseMove={(e) => handleMove(e.clientX, e.clientY)}
        onMouseUp={handleEnd}
        onMouseLeave={handleEnd}
        onTouchStart={(e) => {
          if (e.touches[0]) handleStart(e.touches[0].clientX, e.touches[0].clientY);
        }}
        onTouchMove={(e) => {
          if (e.touches[0]) handleMove(e.touches[0].clientX, e.touches[0].clientY);
        }}
        onTouchEnd={handleEnd}
      >
        <canvas ref={canvasRef} className="block mx-auto" />

        <div className="absolute top-2 right-2 flex flex-col gap-1.5 z-10">
          <button 
            type="button"
            onClick={() => setRenderMode((m) => (m === "solid" ? "wireframe" : "solid"))}
            className="w-8 h-8 rounded bg-white border border-slate-200 shadow-sm flex items-center justify-center hover:bg-slate-50 transition-colors cursor-pointer"
            title="Заливка / Сетка"
          >
            <Eye className="w-4 h-4 text-slate-600" />
          </button>
          
          <button 
            type="button"
            onClick={() => setZoom((z) => Math.min(3.0, z + 0.15))}
            className="w-8 h-8 rounded bg-white border border-slate-200 shadow-sm flex items-center justify-center hover:bg-slate-50 transition-colors cursor-pointer"
            title="Приблизить"
          >
            <ZoomIn className="w-4 h-4 text-slate-700" />
          </button>
          
          <button 
            type="button"
            onClick={() => setZoom((z) => Math.max(0.3, z - 0.15))}
            className="w-8 h-8 rounded bg-white border border-slate-200 shadow-sm flex items-center justify-center hover:bg-slate-50 transition-colors cursor-pointer"
            title="Отдалить"
          >
            <span className="font-bold text-sm text-slate-700 select-none">-</span>
          </button>
        </div>

        <div className="absolute top-2 left-2 flex gap-1 z-10">
          <button 
            type="button"
            onClick={() => resetCamera("iso")}
            className="px-2 py-1 text-[10px] font-semibold rounded bg-white border border-slate-200 shadow-sm hover:bg-slate-50 transition-colors text-slate-700 cursor-pointer"
          >
            3D (Изо)
          </button>
          <button 
            type="button"
            onClick={() => resetCamera("front")}
            className="px-2 py-1 text-[10px] font-semibold rounded bg-white border border-slate-200 shadow-sm hover:bg-slate-50 transition-colors text-slate-700 cursor-pointer"
          >
            Спереди
          </button>
          <button 
            type="button"
            onClick={() => resetCamera("top")}
            className="px-2 py-1 text-[10px] font-semibold rounded bg-white border border-slate-200 shadow-sm hover:bg-slate-50 transition-colors text-slate-700 cursor-pointer"
          >
            Сверху
          </button>
        </div>

        <div className="absolute bottom-2 right-2 flex items-center gap-1 text-[10px] text-slate-400 pointer-events-none select-none bg-white/80 px-1.5 py-0.5 rounded">
          <Rotate3d className="w-3 h-3 animate-pulse" />
          <span>Зажмите для вращения</span>
        </div>
      </div>
    </div>
  );
}

// --- MaterialManager.tsx ---
interface MaterialManagerProps {
  materials: Material[];
  selectedMaterialId: string;
  onSelectMaterial: (id: string) => void;
  onAddMaterial: (material: Omit<Material, "id">) => void;
  onDeleteMaterial: (id: string) => void;
  onUpdateMaterial: (material: Material) => void;
}

function MaterialManager({
  materials,
  selectedMaterialId,
  onSelectMaterial,
  onAddMaterial,
  onDeleteMaterial,
  onUpdateMaterial,
}: MaterialManagerProps) {
  const [name, setName] = useState("");
  const [density, setDensity] = useState<number>(1.24);
  const [price, setPrice] = useState<number>(1500);
  const [isAdding, setIsAdding] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onAddMaterial({
      name: name.trim(),
      density: density || 1.24,
      pricePerKg: price || 1500,
    });
    setName("");
    setDensity(1.24);
    setPrice(1500);
    setIsAdding(false);
  };

  const presets = [
    { name: "PLA", density: 1.24, price: 1500 },
    { name: "PETG", density: 1.27, price: 1600 },
    { name: "ABS", density: 1.05, price: 1400 },
    { name: "TPU", density: 1.21, price: 2200 },
    { name: "NYLON", density: 1.14, price: 3500 },
    { name: "SLA Resin", density: 1.15, price: 2900 },
  ];

  const applyPreset = (p: typeof presets[0]) => {
    setName(p.name);
    setDensity(p.density);
    setPrice(p.price);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
      <div className="flex items-center justify-between mb-5 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <Cylinder className="w-5 h-5 text-blue-600" />
          <h2 className="text-sm font-black text-slate-800 uppercase tracking-wide">Материалы и Пластик</h2>
        </div>
        <button
          id="btn_toggle_add_material"
          type="button"
          onClick={() => setIsAdding(!isAdding)}
          className={`flex items-center gap-1.5 px-3 py-1.5 font-bold text-xs rounded-lg transition-all cursor-pointer leading-none ${
            isAdding
              ? "bg-slate-100 hover:bg-slate-200 text-slate-700"
              : "bg-blue-600 text-white hover:bg-blue-700 shadow-sm shadow-blue-500/10"
          }`}
        >
          <Plus className="w-4 h-4" />
          {isAdding ? "Отмена" : "Добавить пластик"}
        </button>
      </div>

      {isAdding && (
        <form onSubmit={handleSubmit} className="mb-5 bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4 shadow-3xs">
          <h3 className="font-bold text-xs text-slate-800">Новый профиль катушки</h3>
          
          {/* Presets row */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Быстрый шаблон:</span>
            <div className="flex flex-wrap gap-1.5">
              {presets.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => applyPreset(p)}
                  className="px-2.5 py-1 text-[11px] font-semibold rounded bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 transition-colors shadow-2xs cursor-pointer"
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Название катушки</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Например, FDPlast PLA синий"
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-blue-100 focus:border-blue-500 hover:border-slate-300 outline-none transition-all font-semibold"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Плотность (г/см³)</label>
              <input
                type="number"
                step="0.01"
                min="0.1"
                max="5.0"
                value={density}
                onChange={(e) => setDensity(parseFloat(e.target.value) || 0)}
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-blue-100 focus:border-blue-500 hover:border-slate-300 outline-none transition-all font-mono font-semibold"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Цена катушки (₽ за кг)</label>
              <input
                type="number"
                min="100"
                max="50000"
                value={price}
                onChange={(e) => setPrice(parseInt(e.target.value, 10) || 0)}
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-blue-100 focus:border-blue-500 hover:border-slate-300 outline-none transition-all font-mono font-semibold"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-xs transition-all shadow-sm shadow-blue-500/10 cursor-pointer"
          >
            Сохранить пластик
          </button>
        </form>
      )}

      {/* Materials Table list */}
      <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
        {materials.map((m) => {
          const isSelected = m.id === selectedMaterialId;
          return (
            <div
              key={m.id}
              onClick={() => onSelectMaterial(m.id)}
              className={`flex items-center justify-between p-3.5 rounded-xl border transition-all cursor-pointer ${
                isSelected
                  ? "bg-blue-50/40 border-blue-500 ring-2 ring-blue-100 shadow-3xs"
                  : "bg-white border-slate-200 hover:border-slate-300"
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                    isSelected ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-400"
                  }`}
                >
                  {isSelected ? <Check className="w-4 h-4" /> : <Cylinder className="w-4 h-4" />}
                </div>
                <div>
                  <h4 className="font-bold text-xs text-slate-800">{m.name}</h4>
                  <p className="text-[10px] text-slate-400 font-bold mt-0.5 font-mono">
                    Плотность: {m.density.toFixed(2)} г/см³ • {m.pricePerKg.toLocaleString()} ₽/кг
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2.5 onClick-prevent" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Цена:</span>
                  <input
                    type="number"
                    min="10"
                    value={m.pricePerKg}
                    onChange={(e) => {
                      const newPrice = parseInt(e.target.value, 10) || 0;
                      onUpdateMaterial({ ...m, pricePerKg: newPrice });
                    }}
                    className="w-16 bg-white border border-slate-200 rounded px-1.5 py-0.5 text-center font-mono text-[11px] focus:ring-2 focus:ring-blue-100 focus:border-blue-500 hover:border-slate-300 outline-none h-6.5 font-bold text-slate-700"
                  />
                  <span className="text-[10px] font-bold text-slate-500">₽</span>
                </div>

                {materials.length > 1 && (
                  <button
                    type="button"
                    onClick={() => onDeleteMaterial(m.id)}
                    className="p-1.5 text-slate-400 hover:text-red-650 hover:bg-neutral-100 rounded-lg transition-colors cursor-pointer"
                    title="Удалить пластик"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 bg-slate-50 p-3.5 rounded-xl border border-slate-200/60 flex gap-2.5 items-start text-[11px] text-slate-600 leading-relaxed font-semibold">
        <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
        <p>
          Плотность влияет на расчет массы модели по объему STL. Например, у стандартного PLA плотность ~1.24 г/см³, в то время как у ABS она ниже (~1.05 г/см³), поэтому детали из ABS легче у одинаковых 3D-моделей.
        </p>
      </div>
    </div>
  );
}

// --- PrinterManager.tsx ---
interface PrinterManagerProps {
  printers: Printer[];
  selectedPrinterId: string;
  onSelectPrinter: (id: string) => void;
  onAddPrinter: (printer: Omit<Printer, "id">) => void;
  onDeletePrinter: (id: string) => void;
  onUpdatePrinter: (printer: Printer) => void;
}

function PrinterManager({
  printers,
  selectedPrinterId,
  onSelectPrinter,
  onAddPrinter,
  onDeletePrinter,
  onUpdatePrinter,
}: PrinterManagerProps) {
  const [name, setName] = useState("");
  const [power, setPower] = useState<number>(200);
  const [amortization, setAmortization] = useState<number>(30);
  const [isAdding, setIsAdding] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onAddPrinter({
      name: name.trim(),
      powerRating: power || 200,
      hourlyAmortization: amortization || 0,
    });
    setName("");
    setPower(200);
    setAmortization(30);
    setIsAdding(false);
  };

  const printerPresets = [
    { name: "Bambu Lab X1C / P1S", power: 220, amortization: 60 },
    { name: "Bambu Lab A1 / Mini", power: 150, amortization: 40 },
    { name: "Ender 3 / V3", power: 270, amortization: 20 },
    { name: "Prusa i3 MK3S / MK4", power: 200, amortization: 50 },
    { name: "Anycubic Mono X (SLA)", power: 120, amortization: 35 },
    { name: "Elegoo Saturn 4 SLA", power: 120, amortization: 45 },
    { name: "Flying Bear Ghost 6", power: 180, amortization: 15 },
    { name: "Voron 2.4 Custom FDM", power: 350, amortization: 80 },
    { name: "Крупноформатный FDM", power: 350, amortization: 80 },
  ];

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
      <div className="flex items-center justify-between mb-5 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <IconPrinter className="w-5 h-5 text-blue-600" />
          <h2 className="text-sm font-black text-slate-800 uppercase tracking-wide">3D-Принтеры и Амортизация</h2>
        </div>
        <button
          type="button"
          onClick={() => setIsAdding(!isAdding)}
          className={`flex items-center gap-1.5 px-3 py-1.5 font-bold text-xs rounded-lg transition-all cursor-pointer leading-none ${
            isAdding
              ? "bg-slate-100 hover:bg-slate-200 text-slate-700"
              : "bg-blue-600 text-white hover:bg-blue-700 shadow-sm shadow-blue-500/10"
          }`}
        >
          <Plus className="w-4 h-4" />
          {isAdding ? "Отмена" : "Добавить принтер"}
        </button>
      </div>

      {isAdding && (
        <form onSubmit={handleSubmit} className="mb-5 bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4 shadow-3xs">
          <h3 className="font-bold text-xs text-slate-800">Новый профиль 3D-Принтера</h3>

          <div className="space-y-1.5">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Быстрый шаблон принтера:</span>
            <div className="flex flex-wrap gap-1.5">
              {printerPresets.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => {
                    setName(p.name);
                    setPower(p.power);
                    setAmortization(p.amortization);
                  }}
                  className="px-2.5 py-1 text-[11px] font-semibold rounded bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 transition-colors shadow-2xs cursor-pointer"
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Модель / Название</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Например, Bambu Lab P1P"
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-blue-100 focus:border-blue-500 hover:border-slate-300 outline-none transition-all font-semibold"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Потребление (Вт)</label>
              <input
                type="number"
                min="10"
                max="5000"
                value={power}
                onChange={(e) => setPower(parseInt(e.target.value, 10) || 0)}
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-blue-100 focus:border-blue-500 hover:border-slate-300 outline-none transition-all font-mono font-semibold"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Износ (₽/час печати)</label>
              <input
                type="number"
                min="0"
                max="10000"
                value={amortization}
                onChange={(e) => setAmortization(parseInt(e.target.value, 10) || 0)}
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-blue-100 focus:border-blue-500 hover:border-slate-300 outline-none transition-all font-mono font-semibold"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-xs transition-all shadow-sm shadow-blue-500/10 cursor-pointer"
          >
            Сохранить 3D-принтер
          </button>
        </form>
      )}

      <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
        {printers.map((p) => {
          const isSelected = p.id === selectedPrinterId;
          return (
            <div
              key={p.id}
              onClick={() => onSelectPrinter(p.id)}
              className={`flex items-center justify-between p-3.5 rounded-xl border transition-all cursor-pointer ${
                isSelected
                  ? "bg-blue-50/40 border-blue-500 shadow-3xs ring-2 ring-blue-100"
                  : "bg-white border-slate-200 hover:border-slate-300"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="relative w-16 h-12 rounded-lg border border-slate-100 overflow-hidden shrink-0 shadow-3xs bg-slate-50 flex items-center justify-center">
                  <img
                    src={getPrinterImage(p.name)}
                    alt={p.name}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                  {isSelected && (
                    <div className="absolute inset-0 bg-blue-600/15 flex items-center justify-center">
                      <div className="bg-blue-600 text-white rounded-full p-0.5 shadow-sm scale-90">
                        <Check className="w-3.5 h-3.5" />
                      </div>
                    </div>
                  )}
                </div>
                <div>
                  <h4 className="font-bold text-xs text-slate-800">{p.name}</h4>
                  <p className="text-[10px] text-slate-400 font-bold mt-0.5 font-mono">
                    Мощность: {p.powerRating} Вт • Амортизация: {p.hourlyAmortization} ₽/час
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2.5 onClick-prevent" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Вт:</span>
                  <input
                    type="number"
                    min="1"
                    value={p.powerRating}
                    onChange={(e) => {
                      const newPower = parseInt(e.target.value, 10) || 0;
                      onUpdatePrinter({ ...p, powerRating: newPower });
                    }}
                    className="w-14 bg-white border border-slate-200 rounded px-1.5 py-0.5 text-center font-mono text-[11px] focus:ring-2 focus:ring-blue-100 focus:border-blue-500 hover:border-slate-300 outline-none h-6.5 font-bold text-slate-700"
                  />
                </div>

                <div className="flex items-center gap-1.5 font-semibold">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">₽/ч:</span>
                  <input
                    type="number"
                    min="0"
                    value={p.hourlyAmortization}
                    onChange={(e) => {
                      const newAmort = parseInt(e.target.value, 10) || 0;
                      onUpdatePrinter({ ...p, hourlyAmortization: newAmort });
                    }}
                    className="w-12 bg-white border border-slate-200 rounded px-1.5 py-0.5 text-center font-mono text-[11px] focus:ring-2 focus:ring-blue-100 focus:border-blue-500 hover:border-slate-300 outline-none h-6.5 font-bold text-slate-700"
                  />
                </div>

                {printers.length > 1 && (
                  <button
                    type="button"
                    onClick={() => onDeletePrinter(p.id)}
                    className="p-1.5 text-slate-400 hover:text-red-650 hover:bg-neutral-100 rounded-lg transition-colors cursor-pointer"
                    title="Удалить принтер"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 bg-slate-50 p-3.5 rounded-xl border border-slate-200/60 flex gap-2.5 items-start text-[11px] text-slate-600 leading-relaxed font-semibold">
        <Settings className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
        <p>
          <strong>Амортизация принтера:</strong> Сумма, закладываемая на износ деталей, сопел, ремней и замену расходников за каждый час непрерывной работы принтера.
        </p>
      </div>
    </div>
  );
}

// --- ReceiptView.tsx ---
interface ReceiptViewProps {
  result: CalculationResult;
  selectedMaterial: Material;
  selectedPrinter: Printer;
  settings: CustomSettings;
  isCustomerMode: boolean;
  onToggleCustomerMode: () => void;
}

function ReceiptView({
  result,
  selectedMaterial,
  selectedPrinter,
  settings,
  isCustomerMode,
  onToggleCustomerMode,
}: ReceiptViewProps) {
  const [copied, setCopied] = useState(false);

  const hours = Math.floor(result.printTimeHours);
  const minutes = Math.round((result.printTimeHours - hours) * 60);

  const formatRub = (val: number) => {
    return new Intl.NumberFormat("ru-RU", {
      style: "currency",
      currency: "RUB",
      maximumFractionDigits: 1,
    }).format(val);
  };

  const generatePlainTextReceipt = () => {
    const timeStr = `${hours}ч ${minutes}мин`;
    const priceStr = formatRub(result.clientPrice);

    if (isCustomerMode) {
      return `🧾 ЧЕК НА 3D-ПЕЧАТЬ
---------------------------------------
📦 Заказ: ${result.fileName}
🌀 Материал: ${selectedMaterial.name}
⚖️ Вес детали: ${result.weightGrams.toFixed(1)} г
⏳ Время печати: ${timeStr}

🛠️ Стоимость услуг:
  • Подготовка и нарезка: ${formatRub(result.prepCost)}
  • Пост-обработка изделия: ${formatRub(result.postProcessingCost)}
  • Изготовление (3D-печать): ${formatRub(result.clientPrice - result.prepCost - result.postProcessingCost)}
---------------------------------------
💰 ИТОГО К ОПЛАТЕ: ${priceStr}

Спасибо за заказ!
Сгенерировано в 3D Print Calc`;
    } else {
      return `🧾 ДЕТАЛИЗАЦИЯ СЕБЕСТОИМОСТИ (Мастер)
---------------------------------------
📦 Деталь: ${result.fileName}
🌀 Материал: ${selectedMaterial.name} (${selectedMaterial.density} г/см³)
⚖️ Расход пластика: ${result.weightGrams.toFixed(1)} г
⏳ Время выполнения: ${timeStr}
🖨️ Оборудование: ${selectedPrinter.name} (${selectedPrinter.powerRating} Вт)

⚙️ Расчет себестоимости:
  • Пластик катушки: ${formatRub(result.materialCost)}
  • Энергия (${(selectedPrinter.powerRating * result.printTimeHours / 1000).toFixed(2)} кВт·ч): ${formatRub(result.electricityCost)}
  • Амортизация принтера: ${formatRub(result.printerAmortizationCost)}
  • Нарезка 3D-модели: ${formatRub(result.prepCost)}
  • Пост-обработка: ${formatRub(result.postProcessingCost)}
  • Брак и риски (${settings.failureRatePercent}%): ${formatRub(result.failureBufferCost)}
  
  📉 Итого Себестоимость: ${formatRub(result.totalCostPrice)}
  📈 Торговая наценка (${settings.markupPercentage}%): ${formatRub(result.clientPrice - result.totalCostPrice)}
---------------------------------------
💰 ЦЕНА ДЛЯ КЛИЕНТА: ${priceStr}

Сгенерировано в 3D Print Calc`;
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generatePlainTextReceipt());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrint = () => {
    window.print();
  };

  const totalKwh = (selectedPrinter.powerRating * result.printTimeHours) / 1000;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between bg-blue-50/30 border border-blue-100/60 rounded-xl p-3.5 shadow-xs">
        <div className="flex items-center gap-2.5">
          {isCustomerMode ? (
            <EyeOff className="w-5 h-5 text-blue-600 shrink-0" />
          ) : (
            <Eye className="w-5 h-5 text-blue-600 shrink-0" />
          )}
          <div>
            <h3 className="font-bold text-xs text-slate-800">
              {isCustomerMode ? "Режим Клиента включен" : "Режим Мастера включен"}
            </h3>
            <p className="text-[11px] text-slate-500 font-medium">
              {isCustomerMode ? "Скрыта себестоимость, брак и маржа" : "Показаны все внутренние затраты и прибыль"}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onToggleCustomerMode}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer shadow-sm ${
            isCustomerMode
              ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
              : "bg-blue-600 text-white hover:bg-blue-700"
          }`}
        >
          {isCustomerMode ? "Показать Себестоимость" : "Переключить на Клиента"}
        </button>
      </div>

      <div id="printable-receipt-card" className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-md relative">
        <div className="bg-slate-50 border-b border-dashed border-slate-200 p-5 text-center relative">
          <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-2 text-blue-600">
            <Receipt className="w-6 h-6" />
          </div>
          <h3 className="font-bold text-base text-slate-800">
            {isCustomerMode ? "Чек на 3D-печать" : "Калькуляция Себестоимости"}
          </h3>
          <p className="text-[9px] uppercase font-bold tracking-wider text-slate-400 mt-1">
            {isCustomerMode ? "Расчет стоимости услуг" : "Техническая детализация"}
          </p>
        </div>

        <div className="p-5 space-y-4 text-xs text-slate-700 leading-relaxed font-medium">
          <div className="grid grid-cols-2 gap-y-2.5 border-b border-slate-100 pb-3">
            <span className="text-slate-400">Файл проекта:</span>
            <span className="text-right font-bold text-slate-800 break-words">{result.fileName}</span>

            <span className="text-slate-400">Пластик:</span>
            <span className="text-right font-bold text-slate-800">{selectedMaterial.name}</span>

            <span className="text-slate-400">Вес:</span>
            <span className="text-right font-semibold text-slate-900 font-mono">{result.weightGrams.toFixed(1)} г</span>

            <span className="text-slate-400">Время работы:</span>
            <span className="text-right font-semibold text-slate-900 font-mono">
              {hours > 0 ? `${hours}ч ` : ""}
              {minutes}м
            </span>

            {!isCustomerMode && (
              <>
                <span className="text-slate-400">3D-Принтер:</span>
                <span className="text-right font-bold text-slate-800">{selectedPrinter.name}</span>
              </>
            )}
          </div>

          <div className="space-y-2 pb-3 border-b border-slate-100">
            {isCustomerMode ? (
              <>
                <div className="flex justify-between">
                  <span className="text-slate-500">Подготовка и нарезка:</span>
                  <span className="font-mono text-slate-800 font-bold">{formatRub(result.prepCost)}</span>
                </div>
                {result.postProcessingCost > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Пост-обработка:</span>
                    <span className="font-mono text-slate-800 font-bold">{formatRub(result.postProcessingCost)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-500">Изготовление на принтере:</span>
                  <span className="font-mono text-slate-800 font-bold">
                    {formatRub(result.clientPrice - result.prepCost - result.postProcessingCost)}
                  </span>
                </div>
              </>
            ) : (
              <>
                <div className="flex justify-between">
                  <span className="text-slate-500">Пластик ({result.weightGrams.toFixed(1)} г):</span>
                  <span className="font-mono text-slate-800">{formatRub(result.materialCost)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Свет ({totalKwh.toFixed(2)} кВт·ч):</span>
                  <span className="font-mono text-slate-800">{formatRub(result.electricityCost)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Амортизация принтера:</span>
                  <span className="font-mono text-slate-800">{formatRub(result.printerAmortizationCost)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Слайсинг / Подготовка:</span>
                  <span className="font-mono text-slate-800">{formatRub(result.prepCost)}</span>
                </div>
                {result.postProcessingCost > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Зачистка поддержки ({settings.postProcessingHours} ч):</span>
                    <span className="font-mono text-slate-800">{formatRub(result.postProcessingCost)}</span>
                  </div>
                )}
                <div className="flex justify-between text-red-600">
                  <span>Брак и риски ({settings.failureRatePercent}%):</span>
                  <span className="font-mono">+{formatRub(result.failureBufferCost)}</span>
                </div>
                <div className="flex justify-between border-t border-slate-100 pt-1.5 font-bold text-slate-800">
                  <span>Себестоимость:</span>
                  <span className="font-mono">{formatRub(result.totalCostPrice)}</span>
                </div>
                <div className="flex justify-between text-blue-600 font-bold">
                  <span>Прибыль ({settings.markupPercentage}%):</span>
                  <span className="font-mono">+{formatRub(result.clientPrice - result.totalCostPrice)}</span>
                </div>
              </>
            )}
          </div>

          <div className="flex items-center justify-between bg-blue-50 border border-blue-100 p-4 rounded-xl">
            <span className="font-bold text-blue-900 uppercase tracking-wide text-[11px]">Итоговая стоимость</span>
            <span className="text-xl font-extrabold text-blue-700">
              {formatRub(result.clientPrice)}
            </span>
          </div>
        </div>

        <div className="h-2.5 flex w-full pointer-events-none select-none bg-white relative">
          {Array.from({ length: 24 }).map((_, inx) => (
            <div
              key={inx}
              className="flex-1 h-2.5 bg-slate-50 border-t border-r border-slate-200 rotate-45 transform origin-top-left -mt-1 shadow-inner"
            />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pb-3">
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center justify-center gap-2 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-colors font-bold text-xs cursor-pointer select-none shadow-sm"
        >
          {copied ? (
            <>
              <Check className="w-4 h-4 text-emerald-600" />
              <span className="text-emerald-600">Скопировано!</span>
            </>
          ) : (
            <>
              <Copy className="w-4 h-4 text-blue-600" />
              <span>Скопировать чек</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            const textToShare = encodeURIComponent(generatePlainTextReceipt());
            window.open(`https://t.me/share/url?url=${textToShare}`, "_blank");
          }}
          className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#24A1DE] text-white hover:bg-[#24A1DE]/95 transition-colors font-bold text-xs cursor-pointer select-none shadow-sm"
        >
          <Share2 className="w-4 h-4" />
          <span>Поделиться в TG</span>
        </button>

        <button
          type="button"
          onClick={handlePrint}
          className="flex items-center justify-center gap-2 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-colors font-bold text-xs cursor-pointer select-none shadow-sm"
        >
          <IconPrinter className="w-4 h-4 text-slate-500" />
          <span>Распечатать / PDF</span>
        </button>
      </div>
    </div>
  );
}

// --- SettingsManager.tsx ---
interface SettingsManagerProps {
  settings: CustomSettings;
  onChangeSettings: (settings: CustomSettings) => void;
}

function SettingsManager({ settings, onChangeSettings }: SettingsManagerProps) {
  const handleUpdate = <K extends keyof CustomSettings>(key: K, value: number) => {
    onChangeSettings({
      ...settings,
      [key]: value,
    });
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-6">
      <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
        <Sliders className="w-5 h-5 text-blue-600" />
        <h2 className="text-base font-bold text-slate-800">Настройки расчетов и наценка</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <h3 className="font-bold text-xs text-blue-700 uppercase tracking-wider flex items-center gap-1.5">
            <Zap className="w-4 h-4 text-yellow-500" />
            <span>Коммунальные тарифы</span>
          </h3>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 block uppercase">Тариф электроэнергии (₽ за кВт·ч)</label>
            <input
              type="number"
              step="0.1"
              min="0"
              value={settings.electricityTariff}
              onChange={(e) => handleUpdate("electricityTariff", parseFloat(e.target.value) || 0)}
              className="w-full bg-white border border-slate-200 rounded px-3 py-2 text-xs text-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
            />
            <p className="text-[10px] text-slate-400 font-medium">Используется для перевода мощности принтера в рубли.</p>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 block uppercase">Базовая нарезка и подготовка модели (₽)</label>
            <input
              type="number"
              min="0"
              value={settings.prepCostFlat}
              onChange={(e) => handleUpdate("prepCostFlat", parseInt(e.target.value, 10) || 0)}
              className="w-full bg-white border border-slate-200 rounded px-3 py-2 text-xs text-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
            />
            <p className="text-[10px] text-slate-400 font-medium">Фиксированная плата за работу со слайсером, чистку стола и включение.</p>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="font-bold text-xs text-blue-700 uppercase tracking-wider flex items-center gap-1.5">
            <ShieldAlert className="w-4 h-4 text-red-500" />
            <span>Риски и Пост-обработка</span>
          </h3>

          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <label className="text-[10px] font-bold text-slate-500 uppercase">Запас на процент брака (%)</label>
              <span className="text-[10px] font-bold text-red-700 bg-red-100 px-1.5 py-0.5 rounded-md">
                +{settings.failureRatePercent}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="50"
              step="1"
              value={settings.failureRatePercent}
              onChange={(e) => handleUpdate("failureRatePercent", parseInt(e.target.value, 10))}
              className="w-full accent-blue-600 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer mt-1"
            />
            <p className="text-[10px] text-slate-400 font-medium">Добавочный коэффициент на случай неудачной печати или отрыва детали.</p>
          </div>

          <div className="grid grid-cols-2 gap-2 mt-2">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 block uppercase">Ручной труд (ч)</label>
              <input
                type="number"
                step="0.5"
                min="0"
                value={settings.postProcessingHours}
                onChange={(e) => handleUpdate("postProcessingHours", parseFloat(e.target.value) || 0)}
                className="w-full bg-white border border-slate-200 rounded px-2.5 py-1.5 text-xs text-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 block uppercase">Ставка (₽ / час)</label>
              <input
                type="number"
                min="0"
                value={settings.postProcessingHourlyRate}
                onChange={(e) => handleUpdate("postProcessingHourlyRate", parseInt(e.target.value, 10) || 0)}
                className="w-full bg-white border border-slate-200 rounded px-2.5 py-1.5 text-xs text-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>
          <p className="text-[10px] text-slate-400 font-medium -mt-1">Покраска, снятие поддержек, шлифовка, склеивание модели.</p>
        </div>
      </div>

      <div className="border-t border-slate-100 pt-5">
        <h3 className="font-bold text-xs text-blue-700 uppercase tracking-wider flex items-center gap-1.5 mb-3">
          <PiggyBank className="w-4 h-4 text-emerald-500" />
          <span>Торговая прибыль и Наценка</span>
        </h3>

        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="font-bold text-xs text-slate-800 block">Размер прибыли (наценки):</span>
              <span className="text-[10px] text-slate-400 font-medium">
                Себестоимость будет увеличена на этот процент для расчета цены клиенту.
              </span>
            </div>
            <span className="text-xl font-extrabold text-blue-600">
              +{settings.markupPercentage}%
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-[11px] text-slate-400 font-bold">0% (Себестоимость)</span>
            <input
              type="range"
              min="0"
              max="500"
              step="5"
              value={settings.markupPercentage}
              onChange={(e) => handleUpdate("markupPercentage", parseInt(e.target.value, 10))}
              className="flex-1 accent-blue-600 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
            />
            <span className="text-[11px] text-blue-600 font-bold">500% (Макс)</span>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <span className="text-[10px] text-slate-400 font-bold uppercase self-center mr-1">Режимы:</span>
            {[
              { label: "Без наценки", val: 0 },
              { label: "Минимум (+30%)", val: 30 },
              { label: "Оптимально (+100%)", val: 100 },
              { label: "Коммерческий (+200%)", val: 200 },
              { label: "Премиум (+300%)", val: 300 },
            ].map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => handleUpdate("markupPercentage", p.val)}
                className={`px-2.5 py-1 text-[10px] font-bold rounded-lg border transition-all cursor-pointer ${
                  settings.markupPercentage === p.val
                    ? "bg-blue-600 border-blue-600 text-white shadow-sm"
                    : "bg-white border-slate-200 text-slate-600 hover:bg-slate-100"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}


// ==========================================
// 4. MAIN TELEGRAM APP WINDOW (App.tsx)
// ==========================================

const DEFAULT_MATERIALS: Material[] = [
  { id: "mat-1", name: "PLA (Standard)", density: 1.24, pricePerKg: 1500 },
  { id: "mat-2", name: "PETG (Durable)", density: 1.27, pricePerKg: 1600 },
  { id: "mat-3", name: "ABS (Rigid)", density: 1.05, pricePerKg: 1400 },
  { id: "mat-4", name: "TPU (Flexible)", density: 1.21, pricePerKg: 2400 },
];

const DEFAULT_PRINTERS: Printer[] = [
  { id: "prn-1", name: "Bambu Lab X1-Carbon", powerRating: 220, hourlyAmortization: 60 },
  { id: "prn-2", name: "Bambu Lab A1 Mini", powerRating: 120, hourlyAmortization: 35 },
  { id: "prn-3", name: "Creality Ender 3 V3", powerRating: 250, hourlyAmortization: 20 },
  { id: "prn-4", name: "Prusa i3 MK4", powerRating: 180, hourlyAmortization: 50 },
  { id: "prn-5", name: "Voron 2.4 Custom CoreXY", powerRating: 350, hourlyAmortization: 80 },
  { id: "prn-6", name: "Flsun V400 Delta", powerRating: 220, hourlyAmortization: 65 },
  { id: "prn-7", name: "Anycubic Photon Mono M5s (SLA)", powerRating: 90, hourlyAmortization: 40 },
  { id: "prn-8", name: "Elegoo Saturn 4 Ultra", powerRating: 110, hourlyAmortization: 45 },
  { id: "prn-9", name: "Elegoo Neptune 4 Pro", powerRating: 180, hourlyAmortization: 22 },
  { id: "prn-10", name: "Artillery Sidewinder X4", powerRating: 240, hourlyAmortization: 30 },
  { id: "prn-11", name: "Picaso 3D Designer X", powerRating: 320, hourlyAmortization: 110 },
  { id: "prn-12", name: "Flying Bear Ghost 6", powerRating: 180, hourlyAmortization: 25 },
];

const DEFAULT_SETTINGS: CustomSettings = {
  electricityTariff: 5.5,
  markupPercentage: 100,
  prepCostFlat: 150,
  failureRatePercent: 10,
  postProcessingHours: 0,
  postProcessingHourlyRate: 400,
};

interface ProjectPart {
  id: string;
  name: string;
  materialId: string;
  customPricePerKg: number;
  weightGrams: number;
  printTimeHours: number;
  printTimeMinutes: number;
  printerId: string;
  customPowerRating: number;
  parsedFileName: string;
  parsedSTLResult: ParsedSTL | null;
  parsedSlicerDetail: string;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<"calc" | "materials" | "printers" | "settings" >("calc");
  const [isCustomerMode, setIsCustomerMode] = useState<boolean>(false);
  const [showInfoBanner, setShowInfoBanner] = useState<boolean>(true);
  const [showInstructions, setShowInstructions] = useState<boolean>(false);

  const [materials, setMaterials] = useState<Material[]>(() => {
    const saved = localStorage.getItem("3d_calc_materials");
    return saved ? JSON.parse(saved) : DEFAULT_MATERIALS;
  });

  const [printers, setPrinters] = useState<Printer[]>(() => {
    const saved = localStorage.getItem("3d_calc_printers");
    return saved ? JSON.parse(saved) : DEFAULT_PRINTERS;
  });

  const [settings, setSettings] = useState<CustomSettings>(() => {
    const saved = localStorage.getItem("3d_calc_settings");
    return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
  });

  const [selectedMaterialId, setSelectedMaterialId] = useState<string>(materials[0]?.id || "mat-1");
  const [selectedPrinterId, setSelectedPrinterId] = useState<string>(printers[0]?.id || "prn-1");

  const [isSyncing, setIsSyncing] = useState<boolean>(true);
  const [syncStatus, setSyncStatus] = useState<"syncing" | "online" | "offline">("syncing");

  // Load from backend on mount
  useEffect(() => {
    async function fetchBackendDb() {
      // If we are on GitHub Pages or general static hosting, run instantly in offline mode
      const isStaticHost =
        window.location.hostname.endsWith(".github.io") ||
        window.location.protocol === "file:" ||
        window.location.hostname === "github.io" ||
        window.location.pathname.includes("3dprintcalculator");

      if (isStaticHost) {
        setSyncStatus("offline");
        setIsSyncing(false);
        return;
      }

      try {
        const res = await fetch("/api/database");
        if (res.ok) {
          const db = await res.json();
          if (db.materials && db.materials.length > 0) {
            setMaterials(db.materials);
          }
          if (db.printers && db.printers.length > 0) {
            setPrinters(db.printers);
          }
          if (db.settings) {
            setSettings(db.settings);
          }
          setSyncStatus("online");
        } else {
          setSyncStatus("offline");
        }
      } catch (err) {
        console.warn("Express backend database not found or offline. Using local storage mode.", err);
        setSyncStatus("offline");
      } finally {
        setIsSyncing(false);
      }
    }
    fetchBackendDb();
  }, []);

  // Update backend when states change
  useEffect(() => {
    localStorage.setItem("3d_calc_materials", JSON.stringify(materials));
    if (isSyncing || syncStatus !== "online") return;
    fetch("/api/materials", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ materials }),
    }).catch(err => console.warn("Could not save materials to server:", err));
  }, [materials, isSyncing, syncStatus]);

  useEffect(() => {
    localStorage.setItem("3d_calc_printers", JSON.stringify(printers));
    if (isSyncing || syncStatus !== "online") return;
    fetch("/api/printers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ printers }),
    }).catch(err => console.warn("Could not save printers to server:", err));
  }, [printers, isSyncing, syncStatus]);

  useEffect(() => {
    localStorage.setItem("3d_calc_settings", JSON.stringify(settings));
    if (isSyncing || syncStatus !== "online") return;
    fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings }),
    }).catch(err => console.warn("Could not save settings to server:", err));
  }, [settings, isSyncing, syncStatus]);

  const [parts, setParts] = useState<ProjectPart[]>([
    {
      id: "part-init",
      name: "Деталь 1",
      materialId: materials[0]?.id || "mat-1",
      customPricePerKg: materials[0]?.pricePerKg || 1500,
      weightGrams: 0,
      printTimeHours: 0,
      printTimeMinutes: 0,
      printerId: printers[0]?.id || "prn-1",
      customPowerRating: printers[0]?.powerRating || 150,
      parsedFileName: "",
      parsedSTLResult: null,
      parsedSlicerDetail: "",
    }
  ]);

  const handleSelectDefaultMaterial = (id: string) => {
    setSelectedMaterialId(id);
    const targetMat = materials.find(m => m.id === id);
    if (targetMat) {
      setParts(prev => prev.map((part, idx) => {
        if (idx === 0 || part.weightGrams === 0) {
          return {
            ...part,
            materialId: id,
            customPricePerKg: targetMat.pricePerKg
          };
        }
        return part;
      }));
    }
  };

  const handleSelectDefaultPrinter = (id: string) => {
    setSelectedPrinterId(id);
    const targetPrn = printers.find(p => p.id === id);
    if (targetPrn) {
      setParts(prev => prev.map((part, idx) => {
        if (idx === 0 || part.printTimeHours === 0) {
          return {
            ...part,
            printerId: id,
            customPowerRating: targetPrn.powerRating
          };
        }
        return part;
      }));
    }
  };

  const handleAddPart = () => {
    const activeMat = materials.find(m => m.id === selectedMaterialId) || materials[0];
    const activePrn = printers.find(p => p.id === selectedPrinterId) || printers[0];
    
    const newPart: ProjectPart = {
      id: `part-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name: `Деталь ${parts.length + 1}`,
      materialId: activeMat?.id || "mat-1",
      customPricePerKg: activeMat?.pricePerKg || 1500,
      weightGrams: 0,
      printTimeHours: 0,
      printTimeMinutes: 0,
      printerId: activePrn?.id || "prn-1",
      customPowerRating: activePrn?.powerRating || 150,
      parsedFileName: "",
      parsedSTLResult: null,
      parsedSlicerDetail: "",
    };
    
    setParts([...parts, newPart]);
  };

  const handleDeletePart = (id: string) => {
    if (parts.length <= 1) return;
    setParts(parts.filter(p => p.id !== id));
  };

  const handleUpdatePart = <K extends keyof ProjectPart>(partId: string, key: K, value: ProjectPart[K]) => {
    setParts(prev => prev.map(p => {
      if (p.id !== partId) return p;
      const updated = { ...p, [key]: value };

      if (key === "materialId") {
        const mat = materials.find(m => m.id === value);
        if (mat) {
          updated.customPricePerKg = mat.pricePerKg;
          if (updated.parsedSTLResult) {
            const volCm3 = updated.parsedSTLResult.volumeMm3 / 1000;
            updated.weightGrams = Math.round(volCm3 * mat.density * 10) / 10;
          }
        }
      }

      if (key === "printerId") {
        const prn = printers.find(pr => pr.id === value);
        if (prn) {
          updated.customPowerRating = prn.powerRating;
        }
      }

      return updated;
    }));
  };

  const volumeToGrams = (volMm3: number, density: number) => {
    const cm3 = volMm3 / 1000;
    return Math.round(cm3 * density * 10) / 10;
  };

  const handleFileUpload = async (partId: string, file: File) => {
    const filename = file.name;
    const extension = filename.split(".").pop()?.toLowerCase();

    try {
      const reader = new FileReader();

      if (extension === "stl") {
        reader.onload = (e) => {
          if (!e.target?.result) return;
          const buffer = e.target.result as ArrayBuffer;
          const parsed = parseSTL(buffer);

          const part = parts.find(p => p.id === partId);
          const mat = materials.find(m => m.id === (part?.materialId || selectedMaterialId)) || materials[0];
          const computedWeight = volumeToGrams(parsed.volumeMm3, mat.density);

          setParts(prev => prev.map(p => {
            if (p.id !== partId) return p;
            return {
              ...p,
              name: filename.replace(".stl", ""),
              weightGrams: computedWeight,
              parsedFileName: filename,
              parsedSTLResult: parsed,
              parsedSlicerDetail: "",
            };
          }));
        };
        reader.readAsArrayBuffer(file);
      } else if (extension === "gcode") {
        reader.onload = (e) => {
          if (!e.target?.result) return;
          const buffer = e.target.result as ArrayBuffer;
          const parsed = parseGcode(buffer);

          const fullHours = Math.floor(parsed.printTimeHours);
          const remMin = Math.round((parsed.printTimeHours - fullHours) * 60);

          setParts(prev => prev.map(p => {
            if (p.id !== partId) return p;
            return {
              ...p,
              name: filename.replace(".gcode", ""),
              weightGrams: parsed.weightGrams || p.weightGrams,
              printTimeHours: fullHours,
              printTimeMinutes: remMin,
              parsedFileName: filename,
              parsedSTLResult: null,
              parsedSlicerDetail: parsed.slicerFound,
            };
          }));
        };
        reader.readAsArrayBuffer(file);
      }
    } catch (err) {
      console.error("Error reading 3D print file: ", err);
    }
  };

  const aggregatedResults = useMemo(() => {
    let combinedWeight = 0;
    let combinedVolume = 0;
    let combinedHours = 0;
    let materialCostTotal = 0;
    let electricityCostTotal = 0;
    let printerAmortizationTotal = 0;
    let failureBufferTotal = 0;

    parts.forEach((part) => {
      combinedWeight += part.weightGrams;
      if (part.parsedSTLResult) {
        combinedVolume += part.parsedSTLResult.volumeMm3;
      }
      
      const totalHoursDecimal = part.printTimeHours + (part.printTimeMinutes / 60);
      combinedHours += totalHoursDecimal;

      const matCost = part.weightGrams * (part.customPricePerKg / 1000);
      materialCostTotal += matCost;

      const kwhUsed = (part.customPowerRating * totalHoursDecimal) / 1000;
      const elecCost = kwhUsed * settings.electricityTariff;
      electricityCostTotal += elecCost;

      const prn = printers.find(p => p.id === part.printerId) || printers[0];
      const amortCost = totalHoursDecimal * (prn?.hourlyAmortization || 0);
      printerAmortizationTotal += amortCost;

      const rawSub = matCost + elecCost + amortCost;
      const scrapCost = rawSub * (settings.failureRatePercent / 100);
      failureBufferTotal += scrapCost;
    });

    const totalPrepCost = settings.prepCostFlat;
    const totalPostCost = settings.postProcessingHours * settings.postProcessingHourlyRate;

    const aggregateCostPrice =
      materialCostTotal +
      electricityCostTotal +
      printerAmortizationTotal +
      failureBufferTotal +
      totalPrepCost +
      totalPostCost;

    const aggregateClientPrice = aggregateCostPrice * (1 + settings.markupPercentage / 100);

    const firstPart = parts[0] || {};
    const mockFileTitle = parts.length > 1 ? `Проект в сборке (${parts.length} дет.)` : firstPart.name;

    const result: CalculationResult = {
      fileName: mockFileTitle,
      volumeMm3: combinedVolume,
      weightGrams: combinedWeight,
      materialCost: materialCostTotal,
      printTimeHours: combinedHours,
      electricityCost: electricityCostTotal,
      printerAmortizationCost: printerAmortizationTotal,
      postProcessingCost: totalPostCost,
      prepCost: totalPrepCost,
      failureBufferCost: failureBufferTotal,
      totalCostPrice: Math.round(aggregateCostPrice * 10) / 10,
      clientPrice: Math.round(aggregateClientPrice),
    };

    return result;
  }, [parts, settings, printers]);

  const handleClientQuickShare = () => {
    setIsCustomerMode(true);
    alert(
      "Для вашего удобства включен «Режим Клиента»! Себестоимость скрыта. Скопируйте текст чека или сделайте скриншот страницы и отправьте его заказчику."
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-tr from-slate-50 via-blue-50/20 to-slate-50 text-slate-800 pb-24 md:pb-8 font-sans transition-colors antialiased">
      {/* Dynamic Master Header fitting corporate sleek theme */}
      <header className="sticky top-0 left-0 w-full bg-white/90 backdrop-blur-md border-b border-slate-200 h-16 z-40 flex items-center justify-between px-4 sm:px-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-500/25">
            <span className="font-bold text-lg leading-none tracking-tight">3D</span>
          </div>
          <div>
            <h1 className="text-sm sm:text-base font-extrabold text-slate-900 tracking-tight">3D Print Calc</h1>
            <p className="text-[10px] text-blue-600 font-extrabold tracking-widest uppercase">Мини-Приложение</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Backend database sync pill */}
          <div className={`hidden xs:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-extrabold border shrink-0 transition-all select-none ${
            syncStatus === "online" 
              ? "bg-green-50 border-green-150 text-green-700" 
              : syncStatus === "syncing" 
              ? "bg-amber-50 border-amber-150 text-amber-700" 
              : "bg-red-50 border-red-150 text-red-700"
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${syncStatus === "online" ? "bg-green-500 animate-ping" : syncStatus === "syncing" ? "bg-amber-500 animate-pulse" : "bg-red-500"}`} />
            <span>
              {syncStatus === "online" ? "БЭКЕНД" : syncStatus === "syncing" ? "СИНХРОНИЗАЦИЯ..." : "ОФФЛАЙН"}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setShowInstructions(!showInstructions)}
            className="w-9 h-9 rounded-xl hover:bg-slate-100 flex items-center justify-center text-slate-500 transition-colors cursor-pointer text-slate-500"
            title="Инструкция"
          >
            <HelpCircle className="w-5 h-5 text-slate-500" />
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        
        {/* Help Panel dropdown instructions */}
        <AnimatePresence>
          {showInstructions && (
            <motion.div
              initial={{ opacity: 0, height: 0, scale: 0.95 }}
              animate={{ opacity: 1, height: "auto", scale: 1 }}
              exit={{ opacity: 0, height: 0, scale: 0.95 }}
              className="bg-white border border-slate-200 rounded-xl p-5 text-xs text-slate-600 leading-relaxed space-y-3 shadow-sm overflow-hidden"
            >
              <div className="flex justify-between items-center border-b border-slate-100 pb-2 mb-1">
                <span className="font-bold text-blue-600 text-sm flex items-center gap-1.5 font-sans">
                  <Sparkle className="w-4 h-4 text-amber-500 fill-amber-300" />
                  Инструкция Калькулятора
                </span>
                <button 
                  type="button"
                  onClick={() => setShowInstructions(false)} 
                  className="text-slate-400 hover:text-slate-600 cursor-pointer p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p>Добро пожаловать в профессиональный калькулятор 3D-печати!</p>
              <ul className="list-disc pl-4 space-y-1.5 font-medium">
                <li><strong>Загрузка файлов:</strong> Перетащите <strong>.stl</strong> или <strong>.gcode</strong>. Мы автоматически рассчитаем объем модели и вес пластика с высокой точностью.</li>
                <li><strong>Управление материалами и принтерами:</strong> Переключайтесь на нижние вкладки, чтобы заносить новые катушки и принтеры с вашими параметрами.</li>
                <li><strong>Режим «Для заказчика»:</strong> Скрывает себестоимость, брак и маржу по одному нажатию, оставляя красивый чистый чек.</li>
              </ul>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Dynamic Alert Info Banner */}
        {showInfoBanner && (
          <div className="bg-blue-50/70 border border-blue-100 rounded-xl p-4 flex items-start gap-3 relative pr-10 shadow-sm">
            <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            <div className="text-xs leading-relaxed text-slate-600 font-medium">
              <span className="font-extrabold text-blue-900 text-xs block mb-0.5">Печатаете на заказ?</span>
              Переключайте режим Мастер / Клиент для мгновенной генерации чеков на отправку клиентам. Мы скрываем себестоимость одной удобной кнопкой.
            </div>
            <button
              type="button"
              onClick={() => setShowInfoBanner(false)}
              className="absolute top-3 right-3 p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100/50 rounded-lg transition-all cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Tabs switcher on Desktop/Tablet */}
        <div className="hidden sm:flex border border-slate-200 rounded-xl p-1 bg-white gap-1 shadow-sm">
          {[
            { id: "calc", label: "Калькулятор", icon: IconCalculator },
            { id: "materials", label: "Пластик / катушки", icon: Cylinder },
            { id: "printers", label: "3D-Принтеры", icon: IconPrinter },
            { id: "settings", label: "Наценки / Цены", icon: Sliders },
          ].map((tab) => {
            const Icon = tab.icon;
            const isSel = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                  isSel 
                    ? "bg-blue-600 text-white shadow-sm" 
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab content block */}
        <div>
          <AnimatePresence mode="wait">
            {activeTab === "calc" && (
              <motion.div
                key="calc-tab"
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={{ duration: 0.15 }}
                className="space-y-4"
              >
                {parts.map((p, inx) => {
                  const partPrn = printers.find(pr => pr.id === p.printerId) || printers[0];

                  return (
                    <div
                      key={p.id}
                      className="bg-white border border-slate-200 rounded-xl p-5 relative space-y-4 shadow-sm"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3 mb-1">
                        <div className="flex items-center gap-2 flex-1">
                          <span className="font-mono text-slate-300 text-xs font-black">#{inx + 1}</span>
                          <input
                            type="text"
                            value={p.name}
                            onChange={(e) => handleUpdatePart(p.id, "name", e.target.value)}
                            className="bg-transparent border-b border-dashed border-slate-200 hover:border-blue-500 focus:border-blue-500 py-0.5 outline-none font-bold text-sm max-w-[200px] text-slate-800"
                            placeholder="Имя детали"
                          />
                        </div>

                        <div className="flex items-center gap-2">
                          {p.parsedFileName && (
                            <span className="text-[10px] px-2.5 py-1 rounded-md bg-blue-50 text-blue-600 font-semibold font-mono flex items-center gap-1">
                              <FileCheck className="w-3.5 h-3.5" />
                              {p.parsedFileName.endsWith(".stl") ? "STL Снят" : "GCODE"}
                            </span>
                          )}

                          {parts.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleDeletePart(p.id)}
                              className="text-red-500 hover:bg-red-50 p-1.5 rounded-lg transition-all cursor-pointer"
                              title="Удалить деталь"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                        <div className="md:col-span-2 space-y-4">
                          <div
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => {
                              e.preventDefault();
                              if (e.dataTransfer.files?.[0]) {
                                handleFileUpload(p.id, e.dataTransfer.files[0]);
                              }
                            }}
                            className="border-2 border-dashed border-slate-200 rounded-xl p-6 flex flex-col items-center justify-center text-center bg-slate-50/50 hover:bg-slate-50 transition-colors cursor-pointer select-none group relative"
                          >
                            <input
                              type="file"
                              accept=".stl,.gcode"
                              onChange={(e) => {
                                if (e.target.files?.[0]) {
                                  handleFileUpload(p.id, e.target.files[0]);
                                }
                              }}
                              className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                            />
                            <UploadCloud className="w-8 h-8 text-blue-500 group-hover:scale-110 transition-transform mb-2" />
                            <p className="font-bold text-xs text-slate-700">Перетащите 3D-модель сюда (.stl или .gcode)</p>
                            <p className="text-[10px] text-slate-400 font-bold mt-1">или нажмите на окно для выбора файла</p>
                          </div>

                          <div className="grid grid-cols-2 gap-3.5">
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-500 uppercase block">Материал</label>
                              <select
                                value={p.materialId}
                                onChange={(e) => handleUpdatePart(p.id, "materialId", e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 text-xs font-semibold focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none text-slate-700 h-9"
                              >
                                {materials.map((m) => (
                                  <option key={m.id} value={m.id}>
                                    {m.name} ({m.density} г/см³)
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-500 uppercase block">Цена катушки (₽/кг)</label>
                              <input
                                type="number"
                                min="100"
                                value={p.customPricePerKg}
                                onChange={(e) => handleUpdatePart(p.id, "customPricePerKg", parseInt(e.target.value, 10) || 0)}
                                className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-2 text-xs font-semibold focus:border-blue-500 outline-none text-slate-700 h-9"
                              />
                            </div>

                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-500 uppercase block">Вес детали (Граммы)</label>
                              <input
                                type="number"
                                min="0"
                                step="0.1"
                                value={p.weightGrams || ""}
                                onChange={(e) => handleUpdatePart(p.id, "weightGrams", parseFloat(e.target.value) || 0)}
                                placeholder="0.0 г"
                                className="w-full bg-white border border-slate-200 font-mono font-bold rounded-lg px-2.5 py-2 text-xs focus:border-blue-500 outline-none text-slate-800 h-9"
                              />
                            </div>

                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-500 uppercase block">Время печати</label>
                              <div className="flex gap-1.5">
                                <input
                                  type="number"
                                  min="0"
                                  placeholder="Ч"
                                  value={p.printTimeHours || ""}
                                  onChange={(e) => handleUpdatePart(p.id, "printTimeHours", parseInt(e.target.value, 10) || 0)}
                                  className="w-1/2 bg-white border border-slate-200 rounded-lg px-1 py-1.5 font-bold text-center text-xs focus:border-blue-500 outline-none text-slate-800 h-9"
                                />
                                <input
                                  type="number"
                                  min="0"
                                  max="59"
                                  placeholder="Мин"
                                  value={p.printTimeMinutes || ""}
                                  onChange={(e) => handleUpdatePart(p.id, "printTimeMinutes", parseInt(e.target.value, 10) || 0)}
                                  className="w-1/2 bg-white border border-slate-200 rounded-lg px-1 py-1.5 font-bold text-center text-xs focus:border-blue-500 outline-none text-slate-800 h-9"
                                />
                              </div>
                            </div>

                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-500 uppercase block">Принтер</label>
                              <div className="flex gap-2 items-center">
                                <div className="w-10 h-9 rounded-lg border border-slate-200 overflow-hidden shrink-0 bg-slate-50 flex items-center justify-center">
                                  <img
                                    src={getPrinterImage(printers.find(pr => pr.id === p.printerId)?.name || "")}
                                    alt="Printer mini logo"
                                    className="w-full h-full object-cover"
                                    referrerPolicy="no-referrer"
                                  />
                                </div>
                                <select
                                  value={p.printerId}
                                  onChange={(e) => handleUpdatePart(p.id, "printerId", e.target.value)}
                                  className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 text-xs font-semibold focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none text-slate-700 h-9"
                                >
                                  {printers.map((pr) => (
                                    <option key={pr.id} value={pr.id}>
                                      {pr.name} ({pr.powerRating} Вт)
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>

                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-500 uppercase block">Мощность (Вт)</label>
                              <input
                                type="number"
                                min="10"
                                value={p.customPowerRating}
                                onChange={(e) => handleUpdatePart(p.id, "customPowerRating", parseInt(e.target.value, 10) || 100)}
                                className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-2 text-xs font-semibold focus:border-blue-500 outline-none text-slate-700 h-9"
                              />
                            </div>
                          </div>
                        </div>

                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">3D-Просмотр детали</label>
                          {p.parsedSTLResult ? (
                            <ThreeDCanvas
                              vertices={p.parsedSTLResult.renderingData.vertices}
                              normals={p.parsedSTLResult.renderingData.normals}
                              boundingBox={p.parsedSTLResult.boundingBox}
                            />
                          ) : (
                            <div className="w-full h-[280px] bg-slate-50 border border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center text-center p-4 shadow-inner">
                              <span className="material-symbols-outlined text-4xl text-slate-300 mb-2">3d_rotation</span>
                              <p className="text-xs font-bold text-slate-600">Визуализатор</p>
                              <p className="text-[10px] text-slate-400 font-bold max-w-[150px] leading-relaxed mt-1">
                                Загрузите .STL деталь для полной 3D-оценки размеров
                              </p>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="pt-3.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-500 font-medium">
                        <div className="flex gap-4">
                          <span>Пластик: <strong className="font-mono text-slate-700 font-bold">{(p.weightGrams * (p.customPricePerKg / 1000)).toFixed(1)} ₽</strong></span>
                          <span>Электричество: <strong className="font-mono text-slate-700 font-bold">{((p.customPowerRating * (p.printTimeHours + p.printTimeMinutes / 60)) / 1000 * settings.electricityTariff).toFixed(1)} ₽</strong></span>
                          <span>Амортизация: <strong className="font-mono text-slate-700 font-bold">{((p.printTimeHours + p.printTimeMinutes / 60) * (partPrn?.hourlyAmortization || 0)).toFixed(1)} ₽</strong></span>
                        </div>
                      </div>
                    </div>
                  );
                })}

                <button
                  type="button"
                  onClick={handleAddPart}
                  className="w-full py-3.5 border-2 border-dashed border-slate-200 hover:border-blue-500 hover:bg-blue-50/50 rounded-xl text-blue-600 font-bold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer uppercase tracking-wider shadow-sm bg-white"
                >
                  <Plus className="w-4 h-4 animate-pulse" />
                  <span>+ Добавить деталь в сборку</span>
                </button>

                <div id="tp_invoice_breakdowns" className="space-y-4">
                  <ReceiptView
                    result={aggregatedResults}
                    selectedMaterial={materials.find((m) => m.id === selectedMaterialId) || materials[0]}
                    selectedPrinter={printers.find((p) => p.id === selectedPrinterId) || printers[0]}
                    settings={settings}
                    isCustomerMode={isCustomerMode}
                    onToggleCustomerMode={() => setIsCustomerMode(!isCustomerMode)}
                  />
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-wrap gap-4 items-center justify-between shadow-sm">
                  <div>
                    <h4 className="font-bold text-xs text-slate-700 uppercase tracking-wide">Быстрый итог проекта</h4>
                    <p className="text-[11px] text-slate-400 font-bold mt-0.5">
                      На базе {parts.length} дет. • Себестоимость: {aggregatedResults.totalCostPrice.toFixed(0)} ₽
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleClientQuickShare}
                      className="px-4 py-2 rounded-lg text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-sm cursor-pointer"
                    >
                      Для заказчика
                    </button>
                    <button
                      type="button"
                      onClick={() => window.print()}
                      className="px-4 py-2 rounded-lg text-xs font-bold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors shadow-sm cursor-pointer flex items-center gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5 text-blue-600" />
                      Печать
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === "materials" && (
              <motion.div
                key="materials-tab"
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={{ duration: 0.15 }}
                className="space-y-4"
              >
                <MaterialManager
                  materials={materials}
                  selectedMaterialId={selectedMaterialId}
                  onSelectMaterial={handleSelectDefaultMaterial}
                  onAddMaterial={(newMat) => {
                    const material: Material = {
                      ...newMat,
                      id: `mat-${Date.now()}`,
                    };
                    setMaterials([...materials, material]);
                  }}
                  onDeleteMaterial={(id) => {
                    setMaterials(materials.filter((m) => m.id !== id));
                    if (selectedMaterialId === id && materials.length > 1) {
                      setSelectedMaterialId(materials.filter((m) => m.id !== id)[0].id);
                    }
                  }}
                  onUpdateMaterial={(updated) => {
                    setMaterials(materials.map((m) => (m.id === updated.id ? updated : m)));
                  }}
                />
              </motion.div>
            )}

            {activeTab === "printers" && (
              <motion.div
                key="printers-tab"
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={{ duration: 0.15 }}
                className="space-y-4"
              >
                <PrinterManager
                  printers={printers}
                  selectedPrinterId={selectedPrinterId}
                  onSelectPrinter={handleSelectDefaultPrinter}
                  onAddPrinter={(newPrn) => {
                    const printer: Printer = {
                      ...newPrn,
                      id: `prn-${Date.now()}`,
                    };
                    setPrinters([...printers, printer]);
                  }}
                  onDeletePrinter={(id) => {
                    setPrinters(printers.filter((p) => p.id !== id));
                    if (selectedPrinterId === id && printers.length > 1) {
                      setSelectedPrinterId(printers.filter((p) => p.id !== id)[0].id);
                    }
                  }}
                  onUpdatePrinter={(updated) => {
                    setPrinters(printers.map((p) => (p.id === updated.id ? updated : p)));
                  }}
                />
              </motion.div>
            )}

            {activeTab === "settings" && (
              <motion.div
                key="settings-tab"
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={{ duration: 0.15 }}
                className="space-y-4"
              >
                <SettingsManager settings={settings} onChangeSettings={setSettings} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Corporate Sleek design bottom navigation specifically tuned of TG mobile view environment */}
      <nav className="fixed bottom-0 left-0 w-full bg-white/95 backdrop-blur-md border-t border-slate-200 px-2 py-1.5 z-40 sm:hidden shadow-lg">
        <div className="flex justify-around items-center h-14">
          {[
            { id: "calc", label: "Расчет", icon: IconCalculator },
            { id: "materials", label: "Пластик", icon: Cylinder },
            { id: "printers", label: "Принтеры", icon: IconPrinter },
            { id: "settings", label: "Настройки", icon: Sliders },
          ].map((tab) => {
            const Icon = tab.icon;
            const isSel = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex flex-col items-center justify-center p-1.5 cursor-pointer transition-all ${
                  isSel ? "text-blue-600 font-extrabold scale-105" : "text-slate-400 hover:text-slate-600"
                }`}
                style={{ width: "22%" }}
              >
                <Icon className={`w-5 h-5 ${isSel ? "text-blue-600" : "text-slate-400"}`} />
                <span className="text-[10px] sm:text-[11px] mt-1 tracking-tight truncate w-full text-center font-bold">
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
