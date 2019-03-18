const {and, or, root, arg0, setter} = require('carmi');
const todos = root.get('todos');
const pendingTodos = todos.filterBy(val => val.get('done').not());
const blockedBy = todos.mapValues(val => val.get('blockedBy'));
const todosDone = todos.mapValues(val => val.get('done'));
const isNotDone = val =>
  and(
    val,
    todos
      .get(val)
      .get('done')
      .not()
  );
const isNotDone2 = val => and(val, todosDone.get(val).not());
const isNotDone3 = val => pendingTodos.get(val);
const isBlocked = blockedBy.mapValues(isNotDone);
const isBlocked2 = blockedBy.mapValues(isNotDone2);
const isBlocked3 = blockedBy.mapValues(isNotDone3);
const canItemBeWorkedOn = val =>
  and(val.get('done').not(), or(val.get('blockedBy').not(), todosDone.get(val.get('blockedBy'))));
const canBeWorkedOn = todos.mapValues(canItemBeWorkedOn);

const shownTodo = or(and(root.get('showCompleted'), canBeWorkedOn), pendingTodos);

const currentTask = root.get('currentTask');
const currentTaskTodo = todos.get(currentTask);
const statusOfCurrentTask = or(
  and(currentTaskTodo.get('done'), 'done'),
  and(isBlocked.get(currentTask), 'blocked'),
  'not done'
);

const blockedGrouped = pendingTodos.mapValues((val, key) =>
  todos.filterBy((val, key, context) => val.get('blockedBy').eq(context), key) //eslint-disable-line no-shadow
);

module.exports =  {
  todos,
  pendingTodos,
  isBlocked,
  isBlocked2,
  isBlocked3,
  //blockedBy,
  canBeWorkedOn,
  shownTodo,
  pendingTodos,
  blockedGrouped,
  setTodo: setter('todos', arg0),
  setShowCompleted: setter('showCompleted'),
  setCurrentTask: setter('currentTask')
};
