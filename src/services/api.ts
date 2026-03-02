import { Film, ProductionStatus } from "../types";
import { 
  collection, 
  getDocs, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  onSnapshot, 
  query, 
  orderBy,
  setDoc
} from "firebase/firestore";
import { db } from "../lib/firebase";

const FILMS_COLLECTION = "films";
const SYNC_TIMEOUT = 20000; // Increased to 20 seconds for larger payloads

const mapStatus = (status: any): ProductionStatus => {
  const s = String(status || "").toLowerCase();
  if (s === "released") return ProductionStatus.RELEASED;
  if (s === "closed") return ProductionStatus.CLOSED;
  return ProductionStatus.IN_ANALYSIS;
};

const withTimeout = <T>(
  promise: Promise<T>, 
  operationName: string, 
  timeoutMs: number = SYNC_TIMEOUT
): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => 
      setTimeout(() => {
        const timeoutError = new Error(
          `Database operation '${operationName}' timed out after ${timeoutMs/1000}s. This usually indicates a configuration issue, network problem, or a payload that is too large (Firestore limit is 1MB).`
        );
        console.error("[withTimeout] Operation timed out", {
          operationName,
          timeoutMs,
          message: timeoutError.message,
        });
        reject(timeoutError);
      }, timeoutMs)
    )
  ]);
};

export const api = {
  async getFilms(): Promise<Film[]> {
    try {
      console.log("Fetching films from Firestore...");
      const filmsCol = collection(db, FILMS_COLLECTION);
      const q = query(filmsCol, orderBy("createdAt", "desc"));
      const filmSnapshot = await withTimeout(getDocs(q), "getFilms");
      const films = filmSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          ...data,
          id: doc.id,
          status: mapStatus(data.productionStatus || data.status),
          originalPoster: data.originalPosterUrl || data.originalPoster,
          editedPoster: data.editedPosterUrl || data.editedPoster,
        } as Film;
      });
      console.log(`Successfully fetched ${films.length} films.`);
      return films;
    } catch (error) {
      console.error("Error fetching films from Firestore:", error);
      throw error;
    }
  },

  subscribeToFilms(callback: (films: Film[]) => void, onError?: (error: any) => void) {
    console.log("Setting up real-time subscription to Firestore...");
    const filmsCol = collection(db, FILMS_COLLECTION);
    const q = query(filmsCol, orderBy("createdAt", "desc"));
    
    return onSnapshot(q, (snapshot) => {
      const films = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          ...data,
          id: doc.id,
          status: mapStatus(data.productionStatus || data.status),
          originalPoster: data.originalPosterUrl || data.originalPoster,
          editedPoster: data.editedPosterUrl || data.editedPoster,
        } as Film;
      });
      console.log(`Firestore update: ${films.length} films received.`);
      callback(films);
    }, (error) => {
      console.error("Firestore subscription error:", error);
      if (onError) onError(error);
    });
  },

  async createFilm(film: Partial<Film>): Promise<{ id: string }> {
    try {
      const id = film.id || crypto.randomUUID();
      console.log(`Creating film with ID: ${id}`);
      
      const filmData = {
        originalTitle: film.originalTitle || "",
        translatedTitle: film.translatedTitle || "",
        score: Math.floor(film.score || 1),
        productionStatus: film.status || ProductionStatus.IN_ANALYSIS,
        summary_original: film.summary_original || null,
        summary_vi: film.summary_vi || "",
        originalPosterUrl: film.originalPoster || null,
        editedPosterUrl: film.editedPoster || null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        id,
        // title kept for UI compatibility
        title: film.translatedTitle || film.originalTitle || "Untitled Film"
      };
      
      // Remove any undefined fields to prevent Firestore errors
      Object.keys(filmData).forEach(key => {
        if ((filmData as any)[key] === undefined) {
          delete (filmData as any)[key];
        }
      });

      // Check payload size roughly
      const payloadSize = JSON.stringify(filmData).length;
      console.log(`Payload size: ~${(payloadSize / 1024).toFixed(2)} KB`);
      if (payloadSize > 800000) {
        console.warn("Warning: Payload is approaching Firestore's 1MB limit. Consider using smaller images.");
      }

      console.log("[createFilm] Final payload to Firestore:", {
        id,
        payloadSizeBytes: payloadSize,
        hasOriginalPoster: !!filmData.originalPosterUrl,
        hasEditedPoster: !!filmData.editedPosterUrl,
        productionStatus: filmData.productionStatus,
        createdAt: filmData.createdAt,
      });

      console.log("[createFilm] Calling Firestore setDoc without timeout...");
      await setDoc(doc(db, FILMS_COLLECTION, id), filmData);
      console.log("Film successfully created in Firestore (no timeout wrapper).");
      return { id };
    } catch (error) {
      console.error("Error creating film in Firestore:", {
        error,
        name: (error as any)?.name,
        message: (error as any)?.message,
        code: (error as any)?.code,
        stack: (error as any)?.stack,
      });
      throw error;
    }
  },

  async updateFilm(id: string, film: Partial<Film>): Promise<void> {
    try {
      console.log(`Updating film ${id}...`);
      const filmRef = doc(db, FILMS_COLLECTION, id);
      
      const updateData: any = {
        ...film,
        updatedAt: new Date().toISOString(),
      };

      // Map UI fields to Firestore fields if they differ
      if (film.status) updateData.productionStatus = film.status;
      if (film.originalPoster) updateData.originalPosterUrl = film.originalPoster;
      if (film.editedPoster) updateData.editedPosterUrl = film.editedPoster;
      if (film.score !== undefined) updateData.score = Math.floor(film.score);

      // Remove id from update data to avoid overwriting the document ID field if it's there
      delete updateData.id;
      
      // Remove any undefined fields
      Object.keys(updateData).forEach(key => {
        if (updateData[key] === undefined) {
          delete updateData[key];
        }
      });

      const payloadSize = JSON.stringify(updateData).length;
      console.log(`Update payload size: ~${(payloadSize / 1024).toFixed(2)} KB`);

      console.log("[updateFilm] Final payload to Firestore:", {
        id,
        payloadSizeBytes: payloadSize,
        keys: Object.keys(updateData),
        productionStatus: updateData.productionStatus,
      });

      console.log("[updateFilm] Calling Firestore updateDoc without timeout...");
      await updateDoc(filmRef, updateData);
      console.log("Film successfully updated in Firestore (no timeout wrapper).");
    } catch (error) {
      console.error("Error updating film in Firestore:", {
        error,
        id,
        name: (error as any)?.name,
        message: (error as any)?.message,
        code: (error as any)?.code,
        stack: (error as any)?.stack,
      });
      throw error;
    }
  },

  async deleteFilm(id: string): Promise<void> {
    try {
      console.log(`Deleting film ${id}...`);
      const filmRef = doc(db, FILMS_COLLECTION, id);
      await withTimeout(deleteDoc(filmRef), "deleteFilm");
      console.log("Film successfully deleted from Firestore.");
    } catch (error) {
      console.error("Error deleting film from Firestore:", error);
      throw error;
    }
  },
};
