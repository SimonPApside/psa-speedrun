# Changelog - PSA Speedrun

All notable changes to the PSA Speedrun extension will be documented in this file.
Toutes les modifications notables apportées à l'extension PSA Speedrun seront documentées dans ce fichier.

## 2026-04-14

### Added / Ajouts
- **Project Code Auto-fill**: Automatically discover and suggest available project codes by scraping the PSA search popup.
  - *Auto-remplissage des codes projet : découverte et suggestion automatique des codes projet via le scan de la popup PSA.*
- **Smart Hour Calculation**: The filler now accounts for existing entries (like absences) and only supplements the remaining hours to reach the daily target.
  - *Calcul intelligent des heures : le remplissage prend désormais en compte les saisies existantes (ex: absences) et ne complète que les heures restantes pour atteindre l'objectif journalier.*
- **Manual Bicycle Counter**: Replaced the calendar picker with a direct number input for easier initialization and manual adjustment.
  - *Compteur vélo manuel : remplacement du sélecteur de date par une saisie numérique directe pour simplifier l'initialisation et l'ajustement.*
- **Visual Feedback**: Added tooltips and a discrete refresh icon for project code discovery.
  - *Retours visuels : ajout d'infobulles et d'une icône de rafraîchissement discrète pour la recherche des codes projet.*

### Fixed / Corrections
- **Bicycle Counter Logic**: Fixed a bug where corrections (changing a green day to non-green) wouldn't decrement the counter.
  - *Logique du compteur vélo : correction d'un bug où le changement d'un jour vert en jour non-vert ne décrémentait pas le compteur.*
- **Dynamic Row Resolution**: Improved robustness by identifying PSA rows via labels rather than hardcoded IDs.
  - *Résolution dynamique des lignes : amélioration de la fiabilité en identifiant les lignes PSA par labels plutôt que par des IDs figés.*
- **Security/Reliability**: Switched to injected scripts for programmatic clicks to bypass PeopleSoft framework restrictions.
  - *Sécurité/Fiabilité : passage à l'injection de scripts pour les clics programmatiques afin de contourner les restrictions du framework PeopleSoft.*

## 2026-04-09

### Added / Ajouts
- **Public Holiday Support**: Automatic detection of French bank holidays with a prompt to fill them.
  - *Support des jours fériés : détection automatique des jours fériés français avec demande de confirmation pour le remplissage.*
- **Rest & Location Filling**: Automated population of rest time and location codes based on your selected transport.
  - *Remplissage Pause & Lieu : population automatique du temps de pause et des codes de localisation en fonction du transport choisi.*
- **Skip Logic**: Logic to skip rest/location filling for specific absence types (RTT, Maladie, etc.).
  - *Logique d'exclusion : logique pour ignorer le remplissage de la pause/lieu pour certains types d'absences (RTT, Maladie, etc.).*
- **Manual Green Transport Entry**: Initial implementation of the bicycle counter adjustment flow.
  - *Saisie manuelle transport vert : implémentation initiale du flux d'ajustement du compteur vélo.*

### Changed / Modifications
- **Modularization**: Refactored content scripts into specialized modules (`fill-hours.js`, `fill-rest.js`, `dom-utils.js`) for better maintainability.
  - *Modularisation : refactorisation des scripts de contenu en modules spécialisés pour une meilleure maintenance.*

## 2026-03-02

### Added / Ajouts
- **Project Hour Filling**: Core logic to find/claim/create project rows and fill hours.
  - *Remplissage des heures projet : logique de base pour trouver, réclamer ou créer des lignes projet et remplir les heures.*
- **Profile Personalization**: Ability to rename profiles and save distinct configurations.
  - *Personnalisation des profils : possibilité de renommer les profils et de sauvegarder des configurations distinctes.*
- **Intercontrat Support**: Explicit support for "Travaux passagers" rows.
  - *Support Intercontrat : support explicite pour les lignes de "Travaux passagers".*

## 2026-02-19

### Initial Release / Version Initiale
- **PSA a long story**: Core extension features for automated timesheet filling.
  - *PSA a long story : fonctionnalités de base de l'extension pour le remplissage automatisé de la feuille de temps.*
- **Multi-profile support**: Switch between different project configurations easily.
  - *Support multi-profils : basculement facile entre différentes configurations de projet.*
