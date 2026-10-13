// Fabrique apps-script/Index.html : index.html avec moteur.js intégré,
// car Google Apps Script sert une seule page HTML sans fichiers à côté.
//   node nuit-st-ex/construire-apps-script.js
"use strict";
const fs = require("fs");
const path = require("path");

function construire() {
  const ici = __dirname;
  const page = fs.readFileSync(path.join(ici, "index.html"), "utf8");
  const moteur = fs.readFileSync(path.join(ici, "moteur.js"), "utf8");
  const balise = '<script src="moteur.js"></script>';
  if (!page.includes(balise)) throw new Error("balise du moteur introuvable dans index.html");
  return page.replace(balise, () => "<script>\n" + moteur + "</script>");
}

module.exports = { construire };

if (require.main === module) {
  const sortie = path.join(__dirname, "apps-script", "Index.html");
  fs.writeFileSync(sortie, construire());
  console.log("Écrit : " + path.relative(process.cwd(), sortie));
}
