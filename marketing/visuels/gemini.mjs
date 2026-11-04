// Facultatif : génère une image d'ambiance avec l'API Gemini.
// Il faut une clé d'API Google AI Studio dans GEMINI_API_KEY : l'abonnement Gemini Advanced ne donne pas accès à l'API.
// Usage : GEMINI_API_KEY=... node marketing/visuels/gemini.mjs "<description>" <sortie.png>
// Règles : jamais d'élève, de vraie copie ni de nom lisible. L'image doit être déclarée « générée par IA » (isAiGenerated).
import { writeFileSync } from "node:fs";

const [description, sortie] = process.argv.slice(2);
const cle = process.env.GEMINI_API_KEY;
const modele = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";
if (!cle || !description || !sortie) {
  console.error("Usage : GEMINI_API_KEY=... node gemini.mjs \"<description>\" <sortie.png>");
  process.exit(1);
}

const consigne = `${description}. Photo réaliste, format carré, lumière chaude. Aucune personne mineure, aucun texte lisible, aucun nom, aucune marque.`;
const rep = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/${modele}:generateContent`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": cle },
    body: JSON.stringify({
      contents: [{ parts: [{ text: consigne }] }],
      generationConfig: { responseModalities: ["IMAGE"] },
    }),
  },
);
if (!rep.ok) {
  console.error(`Erreur Gemini ${rep.status} : ${await rep.text()}`);
  process.exit(1);
}
const donnees = await rep.json();
const image = donnees.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData;
if (!image) {
  console.error("Aucune image dans la réponse :", JSON.stringify(donnees).slice(0, 500));
  process.exit(1);
}
writeFileSync(sortie, Buffer.from(image.data, "base64"));
console.log("✓", sortie);
