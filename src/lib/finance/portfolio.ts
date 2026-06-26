/**
 * Deterministic financial-analytics dataset powering the Financial dashboard.
 *
 * Generated once at build time with a fixed-seed PRNG so server prerender and
 * client hydration see identical values (no Math.random at render). The headline
 * org totals and the facility scorecard mirror the American Medical
 * Administrators "Financial (37.08)" view; provider/CPT scatter points and the
 * monthly series are synthesized to scale.
 */

export interface Facility {
  name: string;
  group: string;
  billed: number;
  paid: number;
  collPct: number;
  arDelta: number;
  grPerClaim: number;
  claims: number;
}

export interface ScatterPoint {
  x: number;
  y: number;
  size: number;
  colorKey: string;
  label: string;
}

export interface MonthPoint {
  month: string;
  collected: number;
  charges: number;
  arDelta: number;
}

export interface OrgTotals {
  billed: number;
  paid: number;
  expectedReimb: number;
  collectibleAR: number;
  collectionPct: number;
  contractualBurnPct: number;
  arChange: number;
  grossRevPerClaim: number;
  patientYield: number;
  claims: number;
  patients: number;
  providersInScope: number;
  facilitiesCount: number;
  payersCount: number;
  contractual: number;
  writeoff: number;
  writeoffPct: number;
  paidPct: number;
  contractualPct: number;
  arDeltaPct: number;
  collectedAccrual: number;
  realizationPct: number;
  clinicsCount: number;
  providersTotal: number;
}

export interface ProviderGroup {
  key: string;
  label: string;
  color: string;
}

export interface PortfolioData {
  org: OrgTotals;
  facilities: Facility[];
  topByBilled: Facility[];
  providerGroups: ProviderGroup[];
  providerPoints: ScatterPoint[];
  cptPoints: ScatterPoint[];
  monthly: MonthPoint[];
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rnd = mulberry32(370837);
const between = (lo: number, hi: number) => lo + rnd() * (hi - lo);
const logBetween = (lo: number, hi: number) => Math.exp(between(Math.log(lo), Math.log(hi)));
const pick = <T,>(arr: T[]) => arr[Math.floor(rnd() * arr.length)];

const ORG: OrgTotals = {
  billed: 79_460_000,
  paid: 23_210_000,
  expectedReimb: 26_490_000,
  collectibleAR: 3_280_000,
  collectionPct: 29,
  contractualBurnPct: 53,
  arChange: 10_170_000,
  grossRevPerClaim: 47,
  patientYield: 6,
  claims: 490_204,
  patients: 363_993,
  providersInScope: 127,
  facilitiesCount: 243,
  payersCount: 0,
  contractual: 42_180_000,
  writeoff: 3_900_000,
  writeoffPct: 5,
  paidPct: 26,
  contractualPct: 53,
  arDeltaPct: 13,
  collectedAccrual: 20_890_000,
  realizationPct: 26,
  clinicsCount: 177,
  providersTotal: 114,
};

// Facility scorecard — mirrors the reference view.
const FACILITIES: Facility[] = [
  { name: "AMMO HC Lab Carthage", group: "AMMO HC/MC Labs", billed: 6_810_000, paid: 1_460_000, collPct: 21, arDelta: 93_700, grPerClaim: 72, claims: 20_412 },
  { name: "SPC Macon", group: "AMGA SPC - Macon", billed: 4_930_000, paid: 1_640_000, collPct: 33, arDelta: 258_500, grPerClaim: 32, claims: 51_483 },
  { name: "AMMO HC Lab Texas", group: "AMMO HC/MC Labs", billed: 4_930_000, paid: 675_700, collPct: 14, arDelta: 1_570_000, grPerClaim: 31, claims: 21_784 },
  { name: "SPC Warner Robins", group: "AMGA SPC - Warner Robins", billed: 4_220_000, paid: 1_320_000, collPct: 31, arDelta: 155_300, grPerClaim: 23, claims: 56_533 },
  { name: "MFM Carthage", group: "AMMO Manzer Family Medicine - Carthage", billed: 4_220_000, paid: 1_820_000, collPct: 24, arDelta: 485_200, grPerClaim: 40, claims: 25_830 },
  { name: "901 Mcpherson Medical And Diagnostic", group: "AMMO McPherson Medical And Diagnostic", billed: 2_750_000, paid: 639_200, collPct: 23, arDelta: 241_800, grPerClaim: 44, claims: 14_683 },
  { name: "A And M Medical And Diagnostic-Non RHC", group: "AMMO A And M Medical And Diagnostic", billed: 2_710_000, paid: 721_700, collPct: 27, arDelta: 55_600, grPerClaim: 52, claims: 13_983 },
  { name: "AMMO MC Lab Carthage", group: "AMMO Manzer Family Medicine - Carthage", billed: 2_700_000, paid: 370_300, collPct: 14, arDelta: 398_400, grPerClaim: 8, claims: 45_678 },
  { name: "Hayti Medical And Diagnostic", group: "AMMO Hayti Medical Clinic", billed: 2_490_000, paid: 970_900, collPct: 39, arDelta: 107_900, grPerClaim: 46, claims: 21_084 },
  { name: "A and M Pain Clinic", group: "AMMO A And M Medical And Diagnostic", billed: 2_460_000, paid: 1_850_000, collPct: 43, arDelta: 171_400, grPerClaim: 115, claims: 9_167 },
  { name: "AMMO Probst Wellness Center", group: "AMMO Probst Wellness Center", billed: 2_840_000, paid: 668_700, collPct: 33, arDelta: 381_800, grPerClaim: 79, claims: 8_487 },
  { name: "AMMO Behavioural Health", group: "AMMO Behavioural Health", billed: 2_250_000, paid: 165_300, collPct: 7, arDelta: 2_000_000, grPerClaim: 16, claims: 10_131 },
];

const PROVIDER_GROUPS: ProviderGroup[] = [
  { key: "aam", label: "AMMO A And M Medical And Diagnostic", color: "#3c3a36" },
  { key: "allergy", label: "AMGA Allergy", color: "#c98a72" },
  { key: "ankle", label: "AMMO Ankle & Foot Institute", color: "#9c5238" },
  { key: "labs", label: "AMMO HC/MC Labs", color: "#7c7160" },
  { key: "diag", label: "AMGA Diagnostics", color: "#b9a98c" },
  { key: "fmg", label: "AMMO Family Medical Group", color: "#647a4c" },
  { key: "ropheka", label: "AMGA Atlanta Ropheka Medical Center", color: "#a1b48b" },
  { key: "hazan", label: "AMMO Dr Hazan", color: "#c25a3a" },
  { key: "wood", label: "AMMO Dr Wood", color: "#4d6139" },
  { key: "bevier", label: "AMMO Bevier Medical Clinic", color: "#8a7b5e" },
  { key: "behav", label: "AMMO Behavioural Health", color: "#d39a86" },
  { key: "manzer", label: "AMMO Manzer Family Medicine - Carthage", color: "#5b5347" },
  { key: "hclabs", label: "AMGA HC Labs", color: "#caa46f" },
  { key: "unassigned", label: "(unassigned)", color: "#bdb39c" },
  { key: "nursing", label: "AMMO Nursing Homes", color: "#46603f" },
];

function genProviderPoints(): ScatterPoint[] {
  const pts: ScatterPoint[] = [];
  for (let i = 0; i < 64; i++) {
    const g = pick(PROVIDER_GROUPS);
    pts.push({
      x: logBetween(80_000, 4_200_000),
      y: between(10, 230),
      size: Math.round(logBetween(400, 60_000)),
      colorKey: g.key,
      label: g.label,
    });
  }
  return pts;
}

function bandColor(collPct: number): string {
  if (collPct >= 30) return "green";
  if (collPct >= 15) return "tan";
  return "rust";
}

function genCptPoints(): ScatterPoint[] {
  const pts: ScatterPoint[] = [];
  for (let i = 0; i < 52; i++) {
    const coll = between(5, 92);
    pts.push({
      x: logBetween(100_000, 15_000_000),
      y: coll,
      size: Math.round(logBetween(300, 80_000)),
      colorKey: bandColor(coll),
      label: `CPT ${99000 + Math.floor(rnd() * 900)}`,
    });
  }
  return pts;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];
function genMonthly(): MonthPoint[] {
  return MONTHS.map((m, i) => {
    const charges = 11_800_000 + i * 350_000 + between(-600_000, 600_000);
    const collected = 3_200_000 + i * 180_000 + between(-300_000, 300_000);
    const arDelta = 1_200_000 + between(-700_000, 1_400_000);
    return { month: m, collected: Math.round(collected), charges: Math.round(charges), arDelta: Math.round(arDelta) };
  });
}

export const PORTFOLIO: PortfolioData = {
  org: ORG,
  facilities: FACILITIES,
  topByBilled: [...FACILITIES].sort((a, b) => b.billed - a.billed).slice(0, 10),
  providerGroups: PROVIDER_GROUPS,
  providerPoints: genProviderPoints(),
  cptPoints: genCptPoints(),
  monthly: genMonthly(),
};
