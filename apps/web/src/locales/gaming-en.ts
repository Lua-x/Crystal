import type { TranslationOverlay } from '../lib/i18n'

/**
 * English words on gaming instances: lists are games, tasks are goals, and due
 * dates are the day a goal should be finished by. Only differing texts are here.
 */
export const enGaming: TranslationOverlay = {
  errors: {
    list_is_default: '“General” cannot be deleted or shared.',
    already_member: 'This person already has access to the game.',
    owner_cannot_leave: 'As the owner, you cannot leave the game. Delete it instead.',
    not_a_member: 'Only people who can edit the game can be assigned.',
    too_many_attachments: 'This goal already has 20 files.',
  },
  views: {
    count_one: '{{count}} open goal',
    count_other: '{{count}} open goals',
    empty: {
      'my-day': 'What do you want to play today?',
      'my-day-body': 'Pick the goals for today’s session. Suggestions help you choose.',
      'allDone-body': 'Every goal you set for today is done. GG!',
      'important-body': 'Star a goal to find it here.',
      'planned-body': 'Goals with a finish-by date show up here.',
      'overdue-body': 'No goal is past its date.',
      'assigned-body': 'Goals others assign to you in shared games show up here.',
      'all-body': 'Every goal is done – or set a new one.',
      'completed-body': 'Completed goals show up here.',
      list: 'No goals yet',
      'list-body': 'Add the first goal above – an achievement, a boss, a collectible.',
    },
    suggestionReason: {
      today: 'Finish today',
      soon: 'Finish soon',
    },
  },
  lists: {
    myLists: 'My games',
    newList: 'Add game',
    newListTitle: 'Add a game',
    editListTitle: 'Edit game',
    namePlaceholder: 'e.g. Hollow Knight',
    edit: 'Edit game…',
    deleteCompleted: 'Delete completed goals',
    deletedCompleted_one: '{{count}} completed goal deleted.',
    deletedCompleted_other: '{{count}} completed goals deleted.',
    delete: 'Delete game…',
    deleteBody: 'The game and all its goals will be deleted.',
    deleted: 'Game deleted.',
    deleteGroupBody: 'The games in it are kept.',
  },
  tasks: {
    addPlaceholder: 'Add a goal',
    add: 'Add goal',
    showCompleted: 'Show completed goals',
    hideCompleted: 'Hide completed goals',
    menu: {
      dueToday: 'Finish today',
      dueTomorrow: 'Finish tomorrow',
      removeDue: 'Remove finish-by date',
      delete: 'Delete goal',
    },
  },
  detail: {
    label: 'Goal details',
    due: 'Finish by',
    dueDate: 'Finish by',
    noDue: 'No finish-by date',
    removeDue: 'Remove finish-by date',
    list: 'Game',
    delete: 'Delete goal',
    notFound: 'This goal no longer exists.',
  },
  stats: {
    hint: 'Counts the goals you completed yourself, including shared games. A streak is a run of days with at least one completed goal.',
  },
  reminder: {
    onDue: 'On the finish-by date',
  },
  recurrence: {
    fromDue: 'Finish-by date',
    fromHint: 'From completion, the next date depends on when you finish the goal.',
  },
  sharing: {
    roleHint: 'People who can edit add, change and complete goals; viewers only see them.',
    leave: 'Leave game…',
    leaveBody: 'You will no longer see the game or its goals. The owner can add you again.',
    sharedList: 'Shared game',
    viewOnly: 'You can view this game, but not change it.',
  },
  tags: {
    count_one: '{{count}} open goal',
    count_other: '{{count}} open goals',
    empty: 'No open goals with this tag',
    emptyBody: 'Add “#{{tag}}” to a goal to find it here.',
  },
  shortcuts: {
    tasks: 'Goals',
    newTask: 'Add a goal',
    move: 'Move between goals',
  },
  palette: {
    placeholder: 'Type a command, game or goal…',
    lists: 'Games',
    tasks: 'Goals',
    createTask: 'Add goal “{{title}}”',
    createTaskIn: 'Add goal “{{title}}” to {{list}}',
    newList: 'Add game…',
  },
  search: {
    label: 'Search goals',
    emptyBody: 'No goal matches “{{query}}”.',
  },
}
