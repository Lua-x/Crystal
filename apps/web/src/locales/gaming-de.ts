import type { TranslationOverlay } from '../lib/i18n'

/**
 * German words on gaming instances: lists are games (“Spiele”), tasks are goals
 * (“Ziele”), and due dates are the day a goal should be finished by.
 */
export const deGaming: TranslationOverlay = {
  errors: {
    list_is_default: '„Allgemein“ kann nicht gelöscht oder geteilt werden.',
    already_member: 'Diese Person hat bereits Zugriff auf das Spiel.',
    owner_cannot_leave: 'Als Besitzer kannst du das Spiel nicht verlassen. Lösche es stattdessen.',
    not_a_member: 'Zuweisen kannst du nur Personen, die das Spiel bearbeiten dürfen.',
    too_many_attachments: 'Dieses Ziel hat schon 20 Dateien.',
  },
  views: {
    count_one: '{{count}} offenes Ziel',
    count_other: '{{count}} offene Ziele',
    empty: {
      'my-day': 'Was spielst du heute?',
      'my-day-body': 'Such dir die Ziele für die heutige Session aus. Vorschläge helfen dabei.',
      'allDone-body': 'Alle Ziele für heute sind geschafft. GG!',
      'important-body': 'Markiere ein Ziel mit dem Stern, um es hier zu finden.',
      'planned-body': 'Ziele mit einem Fertig-bis-Datum erscheinen hier.',
      'overdue-body': 'Kein Ziel hat sein Datum verpasst.',
      'assigned-body': 'Ziele, die dir andere in geteilten Spielen zuweisen, erscheinen hier.',
      'all-body': 'Alles geschafft – oder setz dir ein neues Ziel.',
      'completed-body': 'Erledigte Ziele erscheinen hier.',
      list: 'Noch keine Ziele',
      'list-body':
        'Füge oben das erste Ziel hinzu – ein Achievement, einen Boss, ein Sammelobjekt.',
    },
    suggestionReason: {
      today: 'Heute fertig machen',
      soon: 'Bald fertig machen',
    },
  },
  lists: {
    myLists: 'Meine Spiele',
    newList: 'Spiel hinzufügen',
    newListTitle: 'Spiel hinzufügen',
    editListTitle: 'Spiel bearbeiten',
    namePlaceholder: 'z. B. Hollow Knight',
    edit: 'Spiel bearbeiten …',
    deleteCompleted: 'Erledigte Ziele löschen',
    deletedCompleted_one: '{{count}} erledigtes Ziel gelöscht.',
    deletedCompleted_other: '{{count}} erledigte Ziele gelöscht.',
    delete: 'Spiel löschen …',
    deleteBody: 'Das Spiel und alle seine Ziele werden gelöscht.',
    deleted: 'Spiel gelöscht.',
    deleteGroupBody: 'Die Spiele darin bleiben erhalten.',
  },
  tasks: {
    addPlaceholder: 'Ziel hinzufügen',
    add: 'Ziel hinzufügen',
    showCompleted: 'Erledigte Ziele einblenden',
    hideCompleted: 'Erledigte Ziele ausblenden',
    menu: {
      dueToday: 'Heute fertig machen',
      dueTomorrow: 'Morgen fertig machen',
      removeDue: 'Fertig-bis-Datum entfernen',
      delete: 'Ziel löschen',
    },
  },
  detail: {
    label: 'Details des Ziels',
    due: 'Fertig bis',
    dueDate: 'Fertig bis',
    noDue: 'Kein Fertig-bis-Datum',
    removeDue: 'Fertig-bis-Datum entfernen',
    list: 'Spiel',
    delete: 'Ziel löschen',
    notFound: 'Dieses Ziel gibt es nicht mehr.',
  },
  stats: {
    hint: 'Zählt die Ziele, die du selbst erledigt hast, auch in geteilten Spielen. Eine Serie sind Tage am Stück mit mindestens einem erledigten Ziel.',
  },
  reminder: {
    onDue: 'Am Fertig-bis-Datum',
  },
  recurrence: {
    fromDue: 'Fertig-bis-Datum',
    fromHint: 'Ab Erledigung richtet sich der nächste Termin danach, wann du das Ziel abhakst.',
  },
  sharing: {
    roleHint:
      'Wer bearbeiten darf, kann Ziele hinzufügen, ändern und erledigen; wer ansehen darf, sieht sie nur.',
    leave: 'Spiel verlassen…',
    leaveBody:
      'Du siehst das Spiel und seine Ziele dann nicht mehr. Der Besitzer kann dich wieder hinzufügen.',
    sharedList: 'Geteiltes Spiel',
    viewOnly: 'Du kannst dieses Spiel ansehen, aber nicht ändern.',
  },
  tags: {
    count_one: '{{count}} offenes Ziel',
    count_other: '{{count}} offene Ziele',
    empty: 'Keine offenen Ziele mit diesem Tag',
    emptyBody: 'Schreib „#{{tag}}“ in ein Ziel, um es hier zu finden.',
  },
  shortcuts: {
    tasks: 'Ziele',
    newTask: 'Ziel hinzufügen',
    move: 'Zwischen Zielen wechseln',
  },
  palette: {
    placeholder: 'Befehl, Spiel oder Ziel eingeben…',
    lists: 'Spiele',
    tasks: 'Ziele',
    createTask: 'Ziel „{{title}}“ hinzufügen',
    createTaskIn: 'Ziel „{{title}}“ zu {{list}} hinzufügen',
    newList: 'Spiel hinzufügen…',
  },
  search: {
    label: 'Ziele durchsuchen',
    emptyBody: 'Kein Ziel passt zu „{{query}}“.',
  },
}
