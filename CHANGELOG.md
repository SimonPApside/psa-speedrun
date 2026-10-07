# Changelog - PSA Speedrun

All notable changes to the PSA Speedrun extension will be documented in this file.
Toutes les modifications notables apportées à l'extension PSA Speedrun seront documentées dans ce fichier.

## [1.3.0] - 2026-10-07

### Added / Ajouts

- add activity badges (#21)

### Fixed / Corrections

- centralize PSA DOM selectors (#20)

## [1.2.3] - 2026-10-07

### Fixed / Corrections

- preserve saved activities after project scrape (#19)
- preserve FAB panel state during navigation (#18)

## [1.2.2] - 2026-10-02

### Fixed / Corrections

- prevent repeated project code scraping (#17)

## [1.2.1] - 2026-10-02

### Fixed / Corrections

- Add new entry for contractualHours

## [1.2.0] - 2026-09-30

### Added / Ajouts

- improve activity planning and profile configuration (#16)

## [1.1.0] - 2026-09-29

### Added / Ajouts

- add compact profile icon selector beside profile name (#15)

### Fixed / Corrections

- improve reminder notification timing (#14)
- Update release name from github action

## [1.0.3] - 2026-09-29

### Fixed / Corrections

- check latest release and don't block popup init (#13)

### Other / Autres

- Create source ZIP for GitHub release action
- Update GitHub action
- Add GitHub Actions workflow to update extension version


## [1.0.2] - 2026-09-28

### Fixed / Corrections
- **Update Banner**: The banner announcing a new version is displayed again in the side panel. The markup had been lost during the side panel migration and the version check was no longer triggered at startup.
  - *Bannière de mise à jour : la bannière annonçant une nouvelle version s'affiche de nouveau dans le side panel. Le HTML avait été perdu lors de la migration vers le side panel et la vérification de version n'était plus déclenchée au démarrage.*
- **Documentation**: Updated README.
  - *Documentation: Mise à jour du README.*

### Changed / Modifications
- **Documentation**: Simplified README with a short description and links to the changelog and releases; changelog now organized by version.
  - *Documentation : README simplifié avec une courte description et des liens vers le changelog et les releases ; changelog désormais organisé par version.*

## [1.0.1] - 2026-09-14

### Fixed / Corrections
- **Project Code Search**: Fixed the search when the table contains multiple rows (#10).
  - *Recherche du code projet : correction de la recherche lorsque le tableau contient plusieurs lignes (#10).*

## [1.0] - Initial version / Version initiale (2026-02-19 → 2026-06-11)

### 2026-04-24 → 2026-06-11

#### Added / Ajouts
- **Side Panel**: The extension opens in the browser side panel instead of a popup, with a floating button (FAB) on the PSA page to open or close it.
  - *Side panel : l'extension s'ouvre dans le panneau latéral du navigateur au lieu d'un popup, avec un bouton flottant (FAB) sur la page PSA pour l'ouvrir ou le fermer.*
- **Grouped Activity Selector**: Project and extra inputs are merged into a single grouped selector.
  - *Sélecteur d'activité groupé : les saisies projet et les saisies annexes sont regroupées dans un seul sélecteur.*
- **Split Shifts**: The location can be set separately for the morning and the afternoon of each day.
  - *Demi-journées séparées : le lieu peut être défini séparément pour le matin et l'après-midi de chaque jour.*
- **Timesheet Reminders**: Browser notifications remind you to fill your timesheet, on the days and at the time of your choice.
  - *Rappels de feuille de temps : des notifications du navigateur vous rappellent de remplir votre feuille de temps, aux jours et à l'heure de votre choix.*
- **Update Detection**: The extension compares its version with the `manifest.json` on the `main` branch of the GitHub repository (checked at most every 6 hours). The banner was not displayed, see 1.0.2.
  - *Détection de mise à jour : l'extension compare sa version avec le `manifest.json` de la branche `main` du dépôt GitHub (vérification au maximum toutes les 6 heures). La bannière ne s'affichait pas, voir 1.0.2.*

#### Changed / Modifications
- **New Logo**: Updated extension icons.
  - *Nouveau logo : mise à jour des icônes de l'extension.*
- **Permissions**: Added `alarms` and `sidePanel` to the manifest permissions.
  - *Permissions : ajout de `alarms` et `sidePanel` aux permissions du manifest.*

#### Fixed / Corrections
- **Public Holidays**: Hotfix on the retrieval of public holidays.
  - *Jours fériés : correctif sur la récupération des jours fériés.*
- **Intercontrat Label**: Fixed the label of the Intercontrat option.
  - *Libellé Intercontrat : correction du libellé de l'option Intercontrat.*

### 2026-04-14

#### Added / Ajouts
- **Project Code Auto-fill**: Automatically discover and suggest available project codes by scraping the PSA search popup.
  - *Auto-remplissage des codes projet : découverte et suggestion automatique des codes projet via le scan de la popup PSA.*
- **Smart Hour Calculation**: The filler now accounts for existing entries (like absences) and only supplements the remaining hours to reach the daily target.
  - *Calcul intelligent des heures : le remplissage prend désormais en compte les saisies existantes (ex: absences) et ne complète que les heures restantes pour atteindre l'objectif journalier.*
- **Manual Bicycle Counter**: Replaced the calendar picker with a direct number input for easier initialization and manual adjustment.
  - *Compteur vélo manuel : remplacement du sélecteur de date par une saisie numérique directe pour simplifier l'initialisation et l'ajustement.*
- **Visual Feedback**: Added tooltips and a discrete refresh icon for project code discovery.
  - *Retours visuels : ajout d'infobulles et d'une icône de rafraîchissement discrète pour la recherche des codes projet.*

#### Fixed / Corrections
- **Bicycle Counter Logic**: Fixed a bug where corrections (changing a green day to non-green) wouldn't decrement the counter.
  - *Logique du compteur vélo : correction d'un bug où le changement d'un jour vert en jour non-vert ne décrémentait pas le compteur.*
- **Dynamic Row Resolution**: Improved robustness by identifying PSA rows via labels rather than hardcoded IDs.
  - *Résolution dynamique des lignes : amélioration de la fiabilité en identifiant les lignes PSA par labels plutôt que par des IDs figés.*
- **Security/Reliability**: Switched to injected scripts for programmatic clicks to bypass PeopleSoft framework restrictions.
  - *Sécurité/Fiabilité : passage à l'injection de scripts pour les clics programmatiques afin de contourner les restrictions du framework PeopleSoft.*

### 2026-04-09

#### Added / Ajouts
- **Public Holiday Support**: Automatic detection of French bank holidays with a prompt to fill them.
  - *Support des jours fériés : détection automatique des jours fériés français avec demande de confirmation pour le remplissage.*
- **Rest & Location Filling**: Automated population of rest time and location codes based on your selected transport.
  - *Remplissage Pause & Lieu : population automatique du temps de pause et des codes de localisation en fonction du transport choisi.*
- **Skip Logic**: Logic to skip rest/location filling for specific absence types (RTT, Maladie, etc.).
  - *Logique d'exclusion : logique pour ignorer le remplissage de la pause/lieu pour certains types d'absences (RTT, Maladie, etc.).*
- **Manual Green Transport Entry**: Initial implementation of the bicycle counter adjustment flow.
  - *Saisie manuelle transport vert : implémentation initiale du flux d'ajustement du compteur vélo.*

#### Changed / Modifications
- **Modularization**: Refactored content scripts into specialized modules (`fill-hours.js`, `fill-rest.js`, `dom-utils.js`) for better maintainability.
  - *Modularisation : refactorisation des scripts de contenu en modules spécialisés pour une meilleure maintenance.*

### 2026-03-02

#### Added / Ajouts
- **Project Hour Filling**: Core logic to find/claim/create project rows and fill hours.
  - *Remplissage des heures projet : logique de base pour trouver, réclamer ou créer des lignes projet et remplir les heures.*
- **Profile Personalization**: Ability to rename profiles and save distinct configurations.
  - *Personnalisation des profils : possibilité de renommer les profils et de sauvegarder des configurations distinctes.*
- **Intercontrat Support**: Explicit support for "Travaux passagers" rows.
  - *Support Intercontrat : support explicite pour les lignes de "Travaux passagers".*

### 2026-02-19

#### Initial Release / Version Initiale
- **PSA a long story**: Core extension features for automated timesheet filling.
  - *PSA a long story : fonctionnalités de base de l'extension pour le remplissage automatisé de la feuille de temps.*
- **Multi-profile support**: Switch between different project configurations easily.
  - *Support multi-profils : basculement facile entre différentes configurations de projet.*

[1.3.0]: https://github.com/SimonPApside/psa-speedrun/compare/v1.2.3...v1.3.0
[1.2.3]: https://github.com/SimonPApside/psa-speedrun/compare/v1.2.2...v1.2.3
[1.2.2]: https://github.com/SimonPApside/psa-speedrun/compare/v1.2.1...v1.2.2
[1.2.1]: https://github.com/SimonPApside/psa-speedrun/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/SimonPApside/psa-speedrun/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/SimonPApside/psa-speedrun/compare/v1.0.3...v1.1.0
[1.0.3]: https://github.com/SimonPApside/psa-speedrun/compare/1.0.2...v1.0.3
[1.0.2]: https://github.com/SimonPApside/psa-speedrun/compare/1.0.1...1.0.2
[1.0.1]: https://github.com/SimonPApside/psa-speedrun/releases/tag/1.0.1
