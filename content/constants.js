'use strict';

/** Construit des descripteurs DOM et les convertit en sélecteurs CSS. */
const DOMElementSelectorUtil = Object.freeze({
  id: value => ({ attribute: 'id', value, match: 'exact' }),
  idPrefix: value => ({ attribute: 'id', value, match: 'prefix' }),
  name: value => ({ attribute: 'name', value, match: 'exact' }),
  namePrefix: value => ({ attribute: 'name', value, match: 'prefix' }),
  toSelector: ({ attribute, value, match = 'exact' }) => {
    if (!['id', 'name'].includes(attribute)) {
      throw new TypeError(`Attribut DOM non pris en charge : ${attribute}`);
    }
    const operator = match === 'prefix' ? '^=' : '=';
    const escapedValue = String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `[${attribute}${operator}"${escapedValue}"]`;
  }
});

/** Descripteurs des éléments PSA utilisés par les scripts de contenu. */
const PSA_DOM_ELEMENTS = Object.freeze({
  /** Tableau principal de saisie des heures, dans l’iframe PSA. */
  timesheetTableId: DOMElementSelectorUtil.id('EX_TIME_DTL$scrolli$0'),

  /** Tableau des résultats de recherche des codes projet. */
  searchResultsTableId: DOMElementSelectorUtil.id('PTSRCHRESULTS'),

  /** Nombre d'heure d'un la période de saisie */
  scheduledHoursTimesheetId: DOMElementSelectorUtil.id('UC_EX_TIME_HDR_UC_SCHEDULED_HRS'),

  /** Date de fin de période de la saisie */
  periodDateTimesheetId : DOMElementSelectorUtil.id('EX_TIME_HDR_PERIOD_END_DT'),

  /** Lignes contenant les champs de saisie des codes projets */
  projectCodeRowsId: DOMElementSelectorUtil.idPrefix('trEX_TIME_DTL'),

  /** Lignes contenant les champs de saisie des autres activités */
  activityCodeRowsId: DOMElementSelectorUtil.idPrefix('trEX_TRC_MAP_VW'),

  /** Boutton d'ajout de ligne projet */
  newProjectRowAnchorName: DOMElementSelectorUtil.namePrefix('EX_TIME_DTL$new'),

  /** Champs de saisie du code projet */
  projectCodeInputName: DOMElementSelectorUtil.namePrefix('PROJECT_CODE'),

  /** Champs de saisie du code activité */
  activityCodeInputName: DOMElementSelectorUtil.namePrefix('ACTIVITY_CODE'),

  /** Champs de repos quotidiens, marqueurs de l’iframe du panneau. */
  dailyRestInputsName: DOMElementSelectorUtil.namePrefix('UC_DAILYREST'),

  /** Champs de durée des repos quotidiens. */
  dailyRestDurationInputsName: DOMElementSelectorUtil.namePrefix('UC_TIME_LIN_WRK_UC_DAILYREST'),

  /** Champs de localisation AM et PM. */
  locationInputsName: DOMElementSelectorUtil.namePrefix('UC_LOCATION_A'),

  /** Bouton d’ouverture de la recherche des codes projet. */
  projectCodePromptId: DOMElementSelectorUtil.id('PROJECT_CODE$prompt$0'),

  /** Formulaire PSA des informations additionnelles (repos et localisation). */
  restsheetFormId: DOMElementSelectorUtil.id('PT_AGSTARTPAGE_NUI'),

  /** Sélecteur CSS du bouton de fermeture de la fenêtre de recherche. */
  projectCodeModalClose: '.ps_modal_close .ps-button',

  /** Champs activité correspondant au jour (lundi = 2, vendredi = 6). */
  activityInputIdForDay: dayIndex => DOMElementSelectorUtil.namePrefix(`POL_TIME${dayIndex + 2}$`),

  /** Champs projet correspondant au jour (lundi = 2, vendredi = 6). */
  projectInputIdForDay: dayIndex => DOMElementSelectorUtil.namePrefix(`TIME${dayIndex + 2}$`)
});

/**
 * Valeurs de secours de currentConfig si la configuration n’existe pas encore
 * dans chrome.storage.sync. Ce sont les champs consommés par les scripts de
 * remplissage ; la configuration complète par défaut reste dans
 * resources/default_profile.json.
 */
const DEFAULT_CURRENT_CONFIG = Object.freeze({
  workHours: 8,
  restTime: 1,
  mondayAM: 'NA', mondayPM: 'NA', mondayActivities: [],
  tuesdayAM: 'NA', tuesdayPM: 'NA', tuesdayActivities: [],
  wednesdayAM: 'NA', wednesdayPM: 'NA', wednesdayActivities: [],
  thursdayAM: 'NA', thursdayPM: 'NA', thursdayActivities: [],
  fridayAM: 'NA', fridayPM: 'NA', fridayActivities: []
});

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];

// The default activity code applied when claiming an empty/new project row
const DEFAULT_ACTIVITY = 'PROJET';
