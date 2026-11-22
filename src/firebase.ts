import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export function isUgrEmail(email?: string | null): boolean {
  if (!email) return false;
  return /^[^@\s]+@(go\.|correo\.)?ugr\.es$/i.test(email.trim());
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

const FRIENDLY_MESSAGES: Record<OperationType, string> = {
  [OperationType.CREATE]: 'No se pudo crear el registro.',
  [OperationType.UPDATE]: 'No se pudieron guardar los cambios.',
  [OperationType.DELETE]: 'No se pudo eliminar.',
  [OperationType.LIST]: 'No se pudieron cargar los datos.',
  [OperationType.GET]: 'No se pudieron cargar los datos.',
  [OperationType.WRITE]: 'No se pudieron guardar los cambios.',
};

function friendlyReason(code: string | undefined): string {
  switch (code) {
    case 'permission-denied':
      return 'No tienes permiso para esta acción. Comprueba que has iniciado sesión con tu cuenta de la UGR.';
    case 'unauthenticated':
      return 'Tu sesión ha caducado. Vuelve a iniciar sesión.';
    case 'unavailable':
    case 'deadline-exceeded':
      return 'No hay conexión con el servidor. Inténtalo de nuevo en unos segundos.';
    case 'not-found':
      return 'La reunión ya no existe.';
    case 'resource-exhausted':
      return 'Se ha superado el límite de uso. Inténtalo más tarde.';
    default:
      return 'Inténtalo de nuevo y, si el problema continúa, recarga la página.';
  }
}

/**
 * Registra el detalle técnico en consola (sin datos personales) y lanza un
 * error con un mensaje en castellano apto para mostrarlo en la interfaz.
 */
export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String((error as { code: unknown }).code)
      : undefined;
  console.error('Firestore error', {
    operationType,
    path,
    code,
    message: error instanceof Error ? error.message : String(error),
  });
  throw new Error(`${FRIENDLY_MESSAGES[operationType]} ${friendlyReason(code)}`);
}
