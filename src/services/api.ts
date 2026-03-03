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

const withTimeout = <T>(promise: Promise<T>, operationName: string, timeoutMs: number = SYNC_TIMEOUT): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => 
      setTimeout(() => reject(new Error(`Database operation '${operationName}' timed out after ${timeoutMs/1000}s. This usually indicates a configuration issue, network problem, or a payload that is too large (Firestore limit is 1MB).`)), timeoutMs)
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
        collections: film.collections || [],
        youtubeDescription: film.youtubeDescription || "",
        youtubeTags: film.youtubeTags || "",
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

      await withTimeout(setDoc(doc(db, FILMS_COLLECTION, id), filmData), "createFilm");
      console.log("Film successfully created in Firestore.");
      return { id };
    } catch (error) {
      console.error("Error creating film in Firestore:", error);
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

      await withTimeout(updateDoc(filmRef, updateData), "updateFilm");
      console.log("Film successfully updated in Firestore.");
    } catch (error) {
      console.error("Error updating film in Firestore:", error);
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
