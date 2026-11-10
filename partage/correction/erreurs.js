// Module partagé entre la 1.0 (correcteur/) et la 2.0 (salle-des-profs/).
// Code déplacé tel quel depuis correcteur/src/worker.js. Toute modification ici touche les deux versions.

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
