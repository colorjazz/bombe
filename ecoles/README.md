# SOS Congé

Prédiction par IA de la fermeture des écoles.

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
4. **Poids du modèle** : fixés à partir de règles d'expert (≈15 cm la nuit ≈ 65 %,
   ≈10 mm de verglas ≈ 85 %).

## Avertissements d'Environnement Canada

Sous le pourcentage, l'application affiche les avertissements officiels en vigueur pour la ville
choisie (pluie verglaçante, neige, etc.), lus sur le service ouvert MSC GeoMet
(`api.weather.gc.ca`, collection `weather-alerts`). S'ils ne peuvent pas être chargés, un lien
mène à la page d'Environnement Canada de la ville.

## Régions et carte

- Choisissez l'une des **17 régions administratives du Québec**, puis une ville de la région
  (ou « Autre lieu » pour chercher n'importe quelle ville).
- La **carte** (Leaflet + OpenStreetMap) montre la probabilité de fermeture pour le jour choisi :
  60 villes sont calculées (en 4 requêtes, gardées en mémoire 1 h), puis un dégradé de couleur (jaune pâle → rouge
  foncé) est interpolé entre elles. Les zones sans risque restent transparentes.
- Cliquer sur une ville de la carte ou sur une ligne du tableau par région affiche le détail.
- Chaque région a un réglage urbain/rural par défaut (ex. Montréal urbain, Gaspésie très rural),
  modifiable avec le curseur et mémorisé par région.

## « Et sinon, quelles sont les chances ? »

Une colonne sur le côté compare la probabilité de congé à celle d'événements rares, d'ici
demain : pandémie mondiale, troisième guerre mondiale, gros lot du Lotto Max, foudre, impact
d'astéroïde, bouilloire électrique. Ce sont des ordres de grandeur (statistiques publiques et
estimations d'experts), affichés sur une échelle logarithmique, pour le plaisir.

## Calibration et journées de référence

- **Verglas réel plutôt que pluie totale** : seule une partie de la pluie verglaçante reste en glace
  (≈ 60 % sous −3 °C, 40 % à 0 °C, 20 % à +0,5 °C, 0 % à +1 °C). Seule la glace tombée
  entre 18 h et 8 h compte : après, les autobus sont déjà partis.
- **Avertissement d'Environnement Canada en priorité** : quand un avertissement de pluie
  verglaçante donne une quantité (« 2 à 10 mm »), c'est elle qui est utilisée à la place des
  modèles bruts.
- **Pas de fausse certitude** : la probabilité est ramenée dans l'intervalle 2 à 90 % et la
  fourchette affichée inclut une marge pour l'incertitude de la formule elle-même.

| Date | Lieu | Prévision officielle | Résultat réel | SOS Congé |
|---|---|---|---|---|
| 11 mars 2026 | Montréal | EC : 20 à 30 mm de pluie verglaçante | Écoles **fermées** | ≈ 81 % |
| 27 nov. 2026 | Montréal | EC : 2 à 10 mm de pluie verglaçante | Écoles **ouvertes** | ≈ 24 % (97 % avant la recalibration) |

Chaque nouvelle tempête dont on connaît le résultat doit être ajoutée à ce tableau (et en commentaire
dans `index.html`) pour vérifier que les poids la reproduisent.

## Précision

Les pourcentages sont des estimations raisonnables, pas des certitudes : les poids n'ont
pas encore été calibrés sur des fermetures réelles.

## Utilisation

Ouvrir `ecoles/index.html` dans un navigateur (ou via GitHub Pages).
