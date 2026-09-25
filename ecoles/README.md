# Prédicteur de fermeture des écoles

Application web autonome (un seul fichier, `index.html`, sans installation) qui estime
la probabilité (%) que les écoles ferment un jour donné à cause de la météo.

## Fonctionnement

1. **Modèles météo** : les prévisions horaires de 4 modèles sont téléchargées depuis
   [Open-Meteo](https://open-meteo.com/) (gratuit, sans clé) : GEM (Environnement Canada),
   ECMWF, ICON et GFS.
2. **Variables extraites** pour chaque modèle, sur la fenêtre de 18 h la veille à 15 h le jour J :
   neige de la nuit, neige de jour, intensité maximale pendant l'heure de pointe des autobus,
   pluie verglaçante (codes météo 56/57/66/67 ou pluie sous 0 °C), refroidissement éolien,
   rafales, neige de la veille, et un réglage urbain/rural.
3. **IA** : une régression logistique calcule une probabilité par modèle météo, puis un
   ensemble pondéré (GEM 35 %, ECMWF 30 %, ICON 20 %, GFS 15 %) les combine.
   L'écart entre les modèles donne l'intervalle et le niveau de confiance.
4. **Apprentissage** : les poids de départ viennent de règles d'expert (≈15 cm la nuit ≈ 65 %,
   ≈10 mm de verglas ≈ 85 %). Quand vous indiquez si les écoles ont réellement fermé,
   le modèle est réentraîné (descente de gradient régularisée vers les poids de départ).
   L'exactitude et le score de Brier sont affichés. Les données restent dans le navigateur
   et peuvent être exportées ou importées en JSON.

## Régions et carte

- Choisissez l'une des **17 régions administratives du Québec**, puis une ville de la région
  (ou « Autre lieu » pour chercher n'importe quelle ville).
- La **carte** (Leaflet + OpenStreetMap) montre la probabilité de fermeture pour le jour choisi :
  ~45 villes sont calculées en une seule requête, puis un dégradé de couleur (jaune pâle → rouge
  foncé) est interpolé entre elles. Les zones sans risque restent transparentes.
- Cliquer sur une ville de la carte ou sur une ligne du tableau par région affiche le détail.
- Chaque région a un réglage urbain/rural par défaut (ex. Montréal urbain, Gaspésie très rural),
  modifiable avec le curseur et mémorisé par région.

## Précision

Sans historique local, les pourcentages sont des estimations raisonnables, pas des
certitudes. La précision augmente avec le nombre de journées enregistrées (idéalement
une ou deux saisons d'hiver pour votre centre de services scolaire).

## Utilisation

Ouvrir `ecoles/index.html` dans un navigateur (ou via GitHub Pages).
