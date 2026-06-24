import { promises as fs } from 'fs';
import path from 'path';
import { Firestore } from '@google-cloud/firestore';
import { createBackendCase, isBackendEnabled } from '@/lib/kyc-backend/client';
import { backendCaseToKycCase, toBackendIntake } from '@/lib/kyc-backend/mappers';
import { generateChecklist } from './checklist';
import type { BusinessType, CaseLanguage, Jurisdiction, KYCCase, ReceivedDocument } from './types';

const DATA_FILE = path.join(process.cwd(), 'data', 'cases.json');
const COLLECTION = 'kycCases';
const useFirestore = Boolean(process.env.GOOGLE_CLOUD_PROJECT && process.env.KYC_USE_LOCAL_STORAGE !== 'true');
let firestore: Firestore | undefined;

function db() {
  firestore ||= new Firestore({ projectId: process.env.GOOGLE_CLOUD_PROJECT });
  return firestore;
}

function firestoreData<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => firestoreData(item)) as T;
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entryValue]) => entryValue !== undefined)
      .map(([key, entryValue]) => [key, firestoreData(entryValue)]),
  ) as T;
}

async function ensureDataFile() {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.writeFile(DATA_FILE, JSON.stringify(seedCases(), null, 2));
  }
}

export async function listCases(): Promise<KYCCase[]> {
  if (useFirestore) {
    const snapshot = await db().collection(COLLECTION).orderBy('createdAt', 'desc').get();
    if (snapshot.empty) {
      const batch = db().batch();
      for (const caseData of seedCases()) batch.set(db().collection(COLLECTION).doc(caseData.id), caseData);
      await batch.commit();
      return seedCases();
    }
    return snapshot.docs.map((document) => document.data() as KYCCase);
  }
  await ensureDataFile();
  const raw = await fs.readFile(DATA_FILE, 'utf8');
  return JSON.parse(raw) as KYCCase[];
}

export async function saveCases(cases: KYCCase[]) {
  if (useFirestore) {
    const batch = db().batch();
    for (const caseData of cases) batch.set(db().collection(COLLECTION).doc(caseData.id), firestoreData(caseData));
    await batch.commit();
    return;
  }
  await ensureDataFile();
  await fs.writeFile(DATA_FILE, JSON.stringify(cases, null, 2));
}

export async function getCase(caseId: string): Promise<KYCCase | undefined> {
  if (useFirestore) {
    const snapshot = await db().collection(COLLECTION).doc(caseId).get();
    return snapshot.exists ? snapshot.data() as KYCCase : undefined;
  }
  const cases = await listCases();
  return cases.find((caseData) => caseData.id === caseId);
}

export async function createCase(input: {
  companyName: string;
  contactEmail?: string;
  jurisdiction: Jurisdiction;
  usState?: string;
  businessType: BusinessType;
  sourceOfFunds: string;
  needsNsBusiness?: boolean;
  language?: CaseLanguage;
}): Promise<KYCCase> {
  if (isBackendEnabled()) {
    const backend = await createBackendCase(toBackendIntake(input));
    const mapped = backendCaseToKycCase(backend, input);
    const cases = await listCases();
    cases.unshift(mapped);
    await saveCases(cases);
    return mapped;
  }

  const now = new Date().toISOString();
  const newCase: KYCCase = {
    id: crypto.randomUUID(),
    companyName: input.companyName,
    contactEmail: input.contactEmail,
    jurisdiction: input.jurisdiction,
    usState: input.usState,
    businessType: input.businessType,
    sourceOfFunds: input.sourceOfFunds,
    language: input.language,
    needsNsBusiness: input.needsNsBusiness,
    status: 'created',
    createdAt: now,
    updatedAt: now,
    individuals: [
      { id: 'director-1', name: 'Primary Director', role: 'director' },
      { id: 'ubo-1', name: 'Main UBO', role: 'ubo', ownershipPercentage: 25 },
    ],
    receivedDocuments: [],
  };
  newCase.checklist = generateChecklist(newCase);
  newCase.status = newCase.jurisdiction === 'Mainland China' ? 'prohibited' : 'checklist_generated';

  if (useFirestore) {
    await db().collection(COLLECTION).doc(newCase.id).set(firestoreData(newCase));
    return newCase;
  }
  const cases = await listCases();
  cases.unshift(newCase);
  await saveCases(cases);
  return newCase;
}

export async function updateCase(caseId: string, patch: Partial<KYCCase>): Promise<KYCCase | undefined> {
  if (useFirestore) {
    const reference = db().collection(COLLECTION).doc(caseId);
    const snapshot = await reference.get();
    if (!snapshot.exists) return undefined;
    const updated = { ...(snapshot.data() as KYCCase), ...patch, updatedAt: new Date().toISOString() };
    await reference.set(firestoreData(updated));
    return updated;
  }
  const cases = await listCases();
  const index = cases.findIndex((caseData) => caseData.id === caseId);
  if (index === -1) return undefined;
  cases[index] = { ...cases[index], ...patch, updatedAt: new Date().toISOString() };
  await saveCases(cases);
  return cases[index];
}

export async function upsertReceivedDocument(caseId: string, doc: ReceivedDocument): Promise<KYCCase | undefined> {
  const caseData = await getCase(caseId);
  if (!caseData) return undefined;
  const docs = caseData.receivedDocuments.filter((existing) => existing.requirementId !== doc.requirementId);
  docs.push(doc);
  return updateCase(caseId, { receivedDocuments: docs, status: 'documents_received' });
}

function seedCases(): KYCCase[] {
  const now = new Date().toISOString();
  const seeds: KYCCase[] = [
    {
      id: 'KYC-DEMO-HK',
      companyName: 'Amber Hash Trading Limited',
      contactEmail: 'client@example.com',
      jurisdiction: 'Hong Kong',
      businessType: 'crypto',
      sourceOfFunds: 'Crypto trading income and treasury assets. Wallets may be provided if needed.',
      status: 'checklist_generated',
      createdAt: now,
      updatedAt: now,
      individuals: [
        { id: 'd1', name: 'Jane Director', role: 'director' },
        { id: 'u1', name: 'Alex UBO', role: 'ubo', ownershipPercentage: 25 },
      ],
      receivedDocuments: [
        { id: 'rd1', requirementId: 'certificate_of_incorporation', name: 'COI.pdf', status: 'accepted' },
        { id: 'rd2', requirementId: 'register_of_directors', name: 'Directors.pdf', status: 'accepted' },
        { id: 'rd3', requirementId: 'proof_of_current_residential_address', name: 'AddressProof.pdf', status: 'accepted', issueDate: '2023-01-01' },
      ],
    },
    {
      id: 'KYC-DEMO-BVI',
      companyName: 'North Pool Mining Ltd',
      jurisdiction: 'BVI',
      businessType: 'mining',
      sourceOfFunds: 'BTC mining proceeds from Antpool and other mining pools.',
      status: 'checklist_generated',
      createdAt: now,
      updatedAt: now,
      individuals: [{ id: 'u1', name: 'Mining Owner', role: 'ubo', ownershipPercentage: 80 }],
      receivedDocuments: [
        { id: 'rd1', requirementId: 'certificate_of_incorporation', name: 'COI.pdf', status: 'accepted' },
        { id: 'rd2', requirementId: 'source_of_funds', name: 'SOF.pdf', status: 'accepted' },
      ],
    },
  ];
  return seeds.map((caseData) => ({ ...caseData, checklist: generateChecklist(caseData) }));
}
