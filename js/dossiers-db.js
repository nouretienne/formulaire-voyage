const DB_NAME = "voyageDossiers";
const DB_VERSION = 1;
const STORE = "dossiers";

let dbPromise = null;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: "id" });
          store.createIndex("updatedAt", "updatedAt", { unique: false });
          store.createIndex("complete", "complete", { unique: false });
        }
      };
    });
  }
  return dbPromise;
}

export function buildLabel(formData = {}) {
  if (formData.prenom && formData.nom) return `${formData.prenom} ${formData.nom}`;
  if (formData.prenom) return formData.prenom;
  if (formData.nom) return formData.nom;
  return `Dossier du ${new Date().toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

function countFilledFields(formData = {}) {
  const fields = ["nom", "prenom", "dateNaissance", "dateDepart", "dateRetour"];
  return fields.filter((key) => Boolean(formData[key])).length;
}

export async function createDossier(initial = {}) {
  const now = Date.now();
  const dossier = {
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    label: initial.label || buildLabel(initial.formData),
    transcript: initial.transcript || "",
    formData: initial.formData || {},
    audioBlob: initial.audioBlob || null,
    engine: initial.engine || "",
    complete: Boolean(initial.complete),
    filledCount: countFilledFields(initial.formData),
  };

  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(STORE).add(dossier);
  });

  return dossier.id;
}

export async function updateDossier(id, patch = {}) {
  const existing = await getDossier(id);
  if (!existing) throw new Error("Dossier introuvable");

  const formData = patch.formData !== undefined ? patch.formData : existing.formData;
  const updated = {
    ...existing,
    ...patch,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: Date.now(),
    formData,
    label: patch.label || buildLabel(formData),
    filledCount: countFilledFields(formData),
    complete: patch.complete !== undefined
      ? patch.complete
      : ["nom", "prenom", "dateNaissance", "dateDepart", "dateRetour"]
        .every((key) => Boolean(formData[key])),
  };

  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(STORE).put(updated);
  });

  return updated;
}

export async function getDossier(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

export async function listDossiers() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).getAll();
    request.onsuccess = () => {
      const rows = request.result || [];
      rows.sort((a, b) => b.updatedAt - a.updatedAt);
      resolve(rows);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function deleteDossier(id) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(STORE).delete(id);
  });
}

export async function countDossiers() {
  const rows = await listDossiers();
  return rows.length;
}
