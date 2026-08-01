import { collection, addDoc, getDocs, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, sanitizeForFirestore } from '../lib/firebase';
import { AuditLog } from '../../types';

const AUDIT_COLLECTION = 'audit_logs';
const LOCAL_AUDIT_KEY = 'ideal_tecidos_audit_logs';

// Helper to get local audit logs
export function getLocalAuditLogs(): AuditLog[] {
  try {
    const data = localStorage.getItem(LOCAL_AUDIT_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

// Helper to save local audit logs
function saveLocalAuditLogs(logs: AuditLog[]) {
  try {
    localStorage.setItem(LOCAL_AUDIT_KEY, JSON.stringify(logs.slice(0, 500)));
  } catch (err) {
    console.error('Failed to save local audit log:', err);
  }
}

// Log action to Firebase and LocalStorage
export async function logAuditAction(
  action: AuditLog['action'],
  module: AuditLog['module'],
  details: string,
  userName = 'Operador',
  userId = 'system',
  metadata?: Record<string, any>
): Promise<void> {
  const logEntry: AuditLog = {
    id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    timestamp: Date.now(),
    userId,
    userName,
    action,
    module,
    details,
    metadata
  };

  // 1. Always append locally first for instant offline audit capability
  const currentLogs = getLocalAuditLogs();
  saveLocalAuditLogs([logEntry, ...currentLogs]);

  // 2. Persist to Firestore asynchronously
  try {
    await addDoc(collection(db, AUDIT_COLLECTION), sanitizeForFirestore(logEntry));
  } catch (err) {
    // Graceful error logging without interrupting main user workflow
    console.warn('Audit log write to cloud pending offline sync:', err);
  }
}

// Subscribe to real-time audit logs from Firestore
export function subscribeAuditLogs(callback: (logs: AuditLog[]) => void) {
  try {
    const q = query(collection(db, AUDIT_COLLECTION), orderBy('timestamp', 'desc'), limit(200));
    return onSnapshot(q, (snapshot) => {
      const logs: AuditLog[] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as AuditLog));
      saveLocalAuditLogs(logs);
      callback(logs);
    }, (err) => {
      console.warn('Fallback to local audit logs on error:', err);
      callback(getLocalAuditLogs());
    });
  } catch (err) {
    callback(getLocalAuditLogs());
    return () => {};
  }
}
